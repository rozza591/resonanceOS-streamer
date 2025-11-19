// --- 1. Imports (CommonJS) ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mpd = require('mpd2');
const { cmd } = mpd;
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const musicMetadata = require('music-metadata');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const os = require('os');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const util = require('util');
const execAsync = util.promisify(exec);

// --- 2. Configuration ---
const CONFIG = {
    PORT: process.env.PORT || 3000,
    MPD_HOST: process.env.MPD_HOST || 'localhost',
    MPD_PORT: process.env.MPD_PORT || 6600,
    MUSIC_DIR: process.env.MUSIC_DIR || '/var/lib/mpd/music',
    DB_PATH: process.env.DB_PATH || path.join(__dirname, 'audiophile.db'),
    // USES .env VALUE FIRST, FALLS BACK TO LOCALHOST
    REDIRECT_URI: process.env.REDIRECT_URI || 'http://localhost:3000/auth/tidal/callback',
    MAX_FILE_SIZE: 500 * 1024 * 1024,
    MAX_FILES: 50,
    RECONNECT_DELAY: 5000,
    COMMAND_TIMEOUT: 10000
};

// --- 3. Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

let mpdClient;
let isReconnecting = false;
let clientReady = false;
let db;

// --- 4. Security Middleware ---
app.use(helmet({
    hsts: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://www.theaudiodb.com"],
            mediaSrc: ["'self'"],
            connectSrc: ["'self'", "ws:", "wss:", "https://www.theaudiodb.com", "*"],
            'upgrade-insecure-requests': null
        }
    }
}));

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many uploads, please try again later.' });

// --- 5. Configure File Uploads (Multer) ---
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const relativePath = file.originalname.substring(0, file.originalname.lastIndexOf('/'));
            const fullPath = path.join(CONFIG.MUSIC_DIR, relativePath);
            if (!fullPath.startsWith(path.resolve(CONFIG.MUSIC_DIR))) {
                return cb(new Error('Invalid upload path'));
            }
            if (relativePath) {
                await fs.mkdir(fullPath, { recursive: true });
                cb(null, fullPath);
            } else {
                cb(null, CONFIG.MUSIC_DIR);
            }
        } catch (err) {
            console.error(`[Upload] Mkdir error: ${err.message}`);
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, sanitized);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: CONFIG.MAX_FILE_SIZE, files: CONFIG.MAX_FILES },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.opus'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${ext}`));
        }
    }
});

// --- 6. Serve Front-End & Music Library ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/music', express.static(CONFIG.MUSIC_DIR));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: clientReady ? 'healthy' : 'degraded', mpdConnected: clientReady, uptime: process.uptime() }); });

// --- 7. HTTP Route for File Uploads ---
app.post('/upload', uploadLimiter, upload.array('musicFiles'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
    }
    console.log(`[Upload] Processing ${req.files.length} uploaded files...`);
    const results = { success: 0, failed: 0, errors: [] };
    try {
        for (const file of req.files) {
            try {
                const metadata = await musicMetadata.parseFile(file.path);
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    const albumDir = path.dirname(file.path);
                    const coverPath = path.join(albumDir, 'cover.jpg');
                    try {
                        await fs.access(coverPath);
                    } catch {
                        await fs.writeFile(coverPath, picture.data);
                        console.log(`[Upload] Created cover.jpg for ${metadata.common.album}`);
                    }
                }
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ file: file.originalname, error: error.message });
                console.error(`[Upload] Error processing ${file.originalname}:`, error.message);
            }
        }
        if (clientReady) {
            await sendMpdCommand('update');
            console.log('[MPD] Database update started.');
        }
        res.status(200).json({
            message: 'Upload complete',
            results
        });
    } catch (error) {
        console.error('[Upload] Fatal upload error:', error);
        res.status(500).json({ error: 'Upload processing failed', details: error.message });
    }
});

// --- 8. MPD Connection Management ---
async function connectMPD() {
    try {
        console.log(`[MPD] Connecting to ${CONFIG.MPD_HOST}:${CONFIG.MPD_PORT}...`);
        mpdClient = await mpd.connect({
            host: CONFIG.MPD_HOST,
            port: CONFIG.MPD_PORT
        });
        clientReady = true;
        isReconnecting = false;
        console.log('[MPD] Connected.');
        mpdClient.on('system', handleMPDEvent);
        mpdClient.on('close', handleMPDClose);
        mpdClient.on('error', handleMPDError);
        sendStatus();
        sendOutputs();
        sendQueue();
        sendPlaylists();
        return mpdClient;
    } catch (err) {
        console.error(`[MPD] Connection failed: ${err.message}`);
        clientReady = false;
        scheduleReconnect();
        throw err;
    }
}
function handleMPDClose() {
    console.log('[MPD] Connection closed.');
    clientReady = false;
    io.emit('mpdDisconnected');
    scheduleReconnect();
}
function handleMPDError(err) { console.error(`[MPD] Error: ${err.message}`); clientReady = false; }
function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log(`[MPD] Reconnecting in ${CONFIG.RECONNECT_DELAY / 1000}s...`);
    setTimeout(() => {
        connectMPD().catch(err => {
            console.error(`[MPD] Reconnection failed: ${err.message}`);
        });
    }, CONFIG.RECONNECT_DELAY);
}
function handleMPDEvent(name) {
    console.log(`[MPD] Event: ${name}`);
    switch (name) {
        case 'player': sendStatus(); sendQueue(); break;
        case 'output': sendOutputs(); break;
        case 'playlist': sendQueue(); break;
        case 'stored_playlist': sendPlaylists(); break;
        case 'database': io.emit('libraryUpdated'); break;
    }
}

// --- 9. Safe MPD Command Wrapper ---
async function sendMpdCommand(command, args = []) {
    if (!clientReady || !mpdClient) {
        throw new Error('MPD not connected');
    }
    try {
        const cmdToSend = args.length > 0 ? cmd(command, args) : command;
        const result = await Promise.race([
            mpdClient.sendCommand(cmdToSend),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Command timeout: ${command}`)), CONFIG.COMMAND_TIMEOUT)
            )
        ]);
        return result;
    } catch (err) {
        console.error(`[MPD] Command failed (${command}): ${err.message}`);
        throw err;
    }
}

// --- 10. Helper Functions ---
const sendStatus = async () => {
    try {
        const statusStr = await sendMpdCommand('status');
        const status = mpd.parseObject(statusStr);
        let currentSong = null;
        try {
            const songStr = await sendMpdCommand('currentsong');
            currentSong = mpd.parseObject(songStr);
        } catch (songError) {
            console.log('[MPD] No current song playing.');
        }
        io.emit('statusUpdate', { status, currentSong });
    } catch (err) {
        console.error(`[MPD] Error getting status: ${err.message}`);
        io.emit('error', { message: 'Failed to get player status' });
    }
};

const sendOutputs = async () => {
    try {
        const { stdout } = await execAsync('aplay -l');
        const internalDeviceNames = ['bcm2835_headphon', 'vc4-hdmi', 'bcm2835_hdmi', 'HDA Intel HDMI'];
        const internalCardNumbers = new Set();
        const externalDeviceMap = {};

        for (const line of stdout.split('\n')) {
            const cardMatch = line.match(/^card (\d+): ([\w-]+) \[([^\]]+)\].*/);
            if (cardMatch) {
                const cardNum = cardMatch[1];
                const driverName = cardMatch[2];
                const friendlyName = cardMatch[3];
                if (internalDeviceNames.some(internalName => driverName.startsWith(internalName))) {
                    internalCardNumbers.add(cardNum);
                } else {
                    externalDeviceMap[cardNum] = friendlyName;
                }
            }
        }

        const outputsStr = await sendMpdCommand('outputs');
        const mpdOutputs = mpd.parseList(outputsStr);
        const outputsToSend = [];

        for (const output of mpdOutputs) {
            let isInternal = false;
            if (output.attribute && output.attribute.startsWith('device "hw:')) {
                const hwMatch = output.attribute.match(/hw:(\d+),/);
                if (hwMatch) {
                    const cardNum = hwMatch[1];
                    if (internalCardNumbers.has(cardNum)) {
                        isInternal = true;
                    } else if (externalDeviceMap[cardNum]) {
                        output.outputname = externalDeviceMap[cardNum];
                    }
                }
            }
            if (!isInternal) outputsToSend.push(output);
        }
        io.emit('outputsList', outputsToSend);
    } catch (err) {
        console.error(`[MPD] Error getting outputs: ${err.message}`);
        try {
            const outputsStr = await sendMpdCommand('outputs');
            io.emit('outputsList', mpd.parseList(outputsStr));
        } catch (fallbackErr) {
            io.emit('outputsList', []);
        }
    }
};

const sendQueue = async () => { try { const queueStr = await sendMpdCommand('playlistinfo'); io.emit('queueList', mpd.parseList(queueStr)); } catch (err) { console.error(`[MPD] Error getting queue: ${err.message}`); } };
const sendPlaylists = async () => { try { const playlistsStr = await sendMpdCommand('listplaylists'); io.emit('playlistsList', mpd.parseList(playlistsStr)); } catch (err) { console.error(`[MPD] Error getting playlists: ${err.message}`); } };

// --- 11. Path Validation Helper ---
const MUSIC_DIR_RESOLVED = path.resolve(CONFIG.MUSIC_DIR);
function validateMusicPath(relativePath) {
    const fullPath = path.resolve(CONFIG.MUSIC_DIR, relativePath);
    if (!fullPath.startsWith(MUSIC_DIR_RESOLVED)) {
        throw new Error(`Invalid path: ${relativePath}`);
    }
    return fullPath;
}

// --- 11b. OAuth Routes for Tidal & Qobuz ---

// 1. TIDAL Auth Routes
app.get('/auth/tidal', (req, res) => {
    const clientId = process.env.TIDAL_CLIENT_ID;
    // HERE IS THE FIX: Using the configured URI from .env
    const redirectUri = CONFIG.REDIRECT_URI;

    if (!clientId) {
        console.error('[Auth] Missing TIDAL_CLIENT_ID in .env');
        return res.redirect('/?error=config_error');
    }

    // Valid Scopes
    const scope = encodeURIComponent('playback user.read collection.read playlists.read search.read');

    console.log(`[Auth] Initiating Tidal Login. Redirecting to: ${redirectUri}`);

    const authUrl = `https://login.tidal.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    res.redirect(authUrl);
});

app.get('/auth/tidal/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=auth_failed');

    console.log(`[Auth] Received Tidal Callback code. Exchanging for token...`);

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', process.env.TIDAL_CLIENT_ID);
        params.append('client_secret', process.env.TIDAL_CLIENT_SECRET);
        // MUST MATCH EXACTLY the URI sent in the first step
        params.append('redirect_uri', CONFIG.REDIRECT_URI);

        const tokenResponse = await axios.post('https://auth.tidal.com/v1/oauth2/token', params);
        const { access_token, refresh_token } = tokenResponse.data;

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO services (service, token, password) VALUES (?, ?, ?)`,
                ['tidal', access_token, refresh_token],
                (err) => (err ? reject(err) : resolve())
            );
        });

        console.log('[Auth] Tidal login successful');
        res.redirect('/?status=tidal_connected');
    } catch (error) {
        console.error('[Auth] Tidal token exchange failed:', error.response?.data || error.message);
        res.redirect('/?error=tidal_failed');
    }
});

// 2. QOBUZ Auth Routes
app.get('/auth/qobuz', (req, res) => {
    const appId = process.env.QOBUZ_APP_ID;
    // Assuming same pattern for Qobuz - you should add QOBUZ_REDIRECT_URI to .env if needed
    // For now, building it dynamically or using a separate env var if you wish.
    // We'll stick to the dynamic base or a fixed one if you add it.
    // Let's use the same host as TIDAL for consistency:
    const host = new URL(CONFIG.REDIRECT_URI).origin;
    const redirectUri = `${host}/auth/qobuz/callback`;

    const authUrl = `https://www.qobuz.com/oauth/authorize?response_type=code&app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(authUrl);
});

app.get('/auth/qobuz/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=auth_failed');

    try {
        const tokenResponse = await axios.post('https://www.qobuz.com/api.json/0.2/user/login', {
            app_id: process.env.QOBUZ_APP_ID,
            app_secret: process.env.QOBUZ_APP_SECRET,
            code: code
        });

        const token = tokenResponse.data.user_auth_token;

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO services (service, token) VALUES (?, ?)`,
                ['qobuz', token],
                (err) => (err ? reject(err) : resolve())
            );
        });

        console.log('[Auth] Qobuz login successful');
        res.redirect('/?status=qobuz_connected');
    } catch (error) {
        console.error('[Auth] Qobuz login failed:', error.message);
        res.redirect('/?error=qobuz_failed');
    }
});

// --- 12. WebSocket Logic ---
io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);
    socket.emit('connectionStatus', { connected: clientReady });
    if (clientReady) {
        sendStatus();
        sendOutputs();
        sendQueue();
        sendPlaylists();
    }

    const safeExecute = async (fn, eventName = 'unknown') => {
        try {
            await fn();
        } catch (err) {
            console.error(`[Socket] Error on event '${eventName}' from ${socket.id}: ${err.message}`);
            socket.emit('error', { message: err.message });
        }
    };

    // --- Player Controls ---
    socket.on('play', () => safeExecute(async () => { await sendMpdCommand('play'); }, 'play'));
    socket.on('pause', () => safeExecute(async () => { await sendMpdCommand('pause', [1]); }, 'pause'));
    socket.on('stop', () => safeExecute(async () => { await sendMpdCommand('stop'); }, 'stop'));
    socket.on('next', () => safeExecute(async () => { await sendMpdCommand('next'); }, 'next'));
    socket.on('previous', () => safeExecute(async () => { await sendMpdCommand('previous'); }, 'previous'));
    socket.on('seek', (seconds) => safeExecute(async () => { if (typeof seconds !== 'number' || seconds < 0) { throw new Error('Invalid seek position'); } const statusStr = await sendMpdCommand('status'); const status = mpd.parseObject(statusStr); const currentPos = status.songid; if (!currentPos) { throw new Error('No song playing to seek'); } await sendMpdCommand('seekid', [currentPos, Math.floor(seconds)]); sendStatus(); }, 'seek'));
    socket.on('setVolume', (volume) => safeExecute(async () => { const vol = Math.max(0, Math.min(100, parseInt(volume))); await sendMpdCommand('setvol', [vol]); }, 'setVolume'));
    socket.on('getStatus', () => safeExecute(sendStatus, 'getStatus'));
    socket.on('getOutputs', () => safeExecute(sendOutputs, 'getOutputs'));

    // --- Library Browsing ---
    socket.on('getArtists', () => safeExecute(async () => {
        const artistsStr = await sendMpdCommand('list', ['albumartist']);
        const artists = mpd.parseList(artistsStr).map(item => item.albumartist).filter(Boolean).sort();
        socket.emit('artistList', artists);
    }, 'getArtists'));

    socket.on('getAlbums', (artistName) => safeExecute(async () => {
        if (!artistName) { throw new Error('Artist name required'); }
        const albumsStr = await sendMpdCommand('list', ['album', 'albumartist', artistName]);
        const albums = mpd.parseList(albumsStr).map(item => item.album).filter(Boolean).sort();
        socket.emit('albumList', { artist: artistName, albums });
    }, 'getAlbums'));

    socket.on('getPlaylists', () => safeExecute(sendPlaylists, 'getPlaylists'));

    socket.on('getSongs', ({ artist, album }) => safeExecute(async () => {
        if (!artist || !album) { throw new Error('Artist and album required'); }
        const songsStr = await sendMpdCommand('find', ['albumartist', artist, 'album', album]);
        const songs = mpd.parseList(songsStr);

        let metadata = null;
        try {
            metadata = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM albums WHERE artist = ? AND album = ?", [artist, album], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
        } catch (dbErr) {
            console.error(`[DB] Error querying metadata: ${dbErr.message}`);
        }
        socket.emit('songList', { album, songs, metadata });
    }, 'getSongs'));

    // --- Queue & Playlist Controls ---
    socket.on('addToQueue', (songFile) => safeExecute(async () => { if (!songFile) throw new Error('Song file required'); await sendMpdCommand('add', [songFile]); }, 'addToQueue'));
    socket.on('removeFromQueue', (songId) => safeExecute(async () => { if (!songId) throw new Error('Song ID required'); await sendMpdCommand('deleteid', [songId]); }, 'removeFromQueue'));
    socket.on('clearQueue', () => safeExecute(async () => { await sendMpdCommand('clear'); }, 'clearQueue'));
    socket.on('loadPlaylist', (name) => safeExecute(async () => { if (!name) throw new Error('Playlist name required'); await sendMpdCommand('clear'); await sendMpdCommand('load', [name]); await sendMpdCommand('play'); }, 'loadPlaylist'));
    socket.on('saveQueue', (name) => safeExecute(async () => { if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) { throw new Error('Invalid playlist name'); } await sendMpdCommand('save', [name]); await sendPlaylists(); }, 'saveQueue'));
    socket.on('deletePlaylist', (name) => safeExecute(async () => { if (!name) throw new Error('Playlist name required'); await sendMpdCommand('rm', [name]); await sendPlaylists(); }, 'deletePlaylist'));

    // --- Settings Controls ---
    socket.on('rescanLibrary', () => safeExecute(async () => { await sendMpdCommand('update'); socket.emit('message', { text: 'Library rescan started' }); }, 'rescanLibrary'));
    socket.on('rebootPi', () => {
        console.log(`[System] Reboot requested by ${socket.id}`);
        exec('sudo /sbin/reboot', (err, stdout, stderr) => {
            if (err) {
                console.error(`[System] Reboot failed: ${stderr}`);
                socket.emit('error', { message: 'Reboot failed' });
            }
        });
    });

    socket.on('switchOutput', ({ outputId, enabled }) => safeExecute(async () => {
        if (typeof outputId === 'undefined') { throw new Error('Output ID required'); }
        const command = enabled ? 'enableoutput' : 'disableoutput';
        await sendMpdCommand(command, [outputId]);
        await sendOutputs();
    }, 'switchOutput'));

    // --- Delete Operations ---
    socket.on('deleteSong', (songFile) => safeExecute(async () => { if (!songFile) throw new Error('Song file required'); const fullPath = validateMusicPath(songFile); console.log(`[FS] Deleting file: ${fullPath}`); await fs.unlink(fullPath); await sendMpdCommand('update'); socket.emit('message', { text: 'Song deleted successfully' }); }, 'deleteSong'));
    socket.on('deleteAlbum', ({ artist, album }) => safeExecute(async () => { if (!artist || !album) { throw new Error('Artist and album required'); } const songsStr = await sendMpdCommand('find', ['albumartist', artist, 'album', album]); const songs = mpd.parseList(songsStr); if (songs.length === 0) { throw new Error('Album not found'); } const albumRelPath = path.dirname(songs[0].file); const fullPath = validateMusicPath(albumRelPath); console.log(`[FS] Deleting directory: ${fullPath}`); await fs.rm(fullPath, { recursive: true, force: true }); await sendMpdCommand('update'); socket.emit('message', { text: 'Album deleted successfully' }); }, 'deleteAlbum'));
    socket.on('deleteArtist', (artist) => safeExecute(async () => { if (!artist) throw new Error('Artist name required'); const songsStr = await sendMpdCommand('find', ['albumartist', artist]); const songs = mpd.parseList(songsStr); if (songs.length === 0) { throw new Error('Artist not found'); } const artistRelPath = path.dirname(path.dirname(songs[0].file)); const fullPath = validateMusicPath(artistRelPath); console.log(`[FS] Deleting directory: ${fullPath}`); await fs.rm(fullPath, { recursive: true, force: true }); await sendMpdCommand('update'); socket.emit('message', { text: 'Artist deleted successfully' }); }, 'deleteArtist'));

    // --- System Info ---
    socket.on('getSystemInfo', () => safeExecute(async () => {
        const osVersion = `ResonanceOS 1.0`;
        const kernel = os.release();
        const cpuLoad = (os.loadavg()[0] * 100 / os.cpus().length).toFixed(0);
        const audioServer = 'Pipewire 1.0.3';
        socket.emit('systemInfo', { osVersion, kernel, audioServer, cpuLoad });
    }, 'getSystemInfo'));

    // --- Services Handlers ---
    socket.on('getServices', () => safeExecute(async () => {
        db.all("SELECT * FROM services", [], (err, rows) => {
            if (err) throw err;
            const services = {};
            rows.forEach(row => { services[row.service] = row; });
            socket.emit('servicesList', services);
        });
    }, 'getServices'));

    // --- Metadata Fetch Handler ---
    socket.on('fetchMetadata', ({ artist, album }) => safeExecute(async () => {
        if (!artist || !album) throw new Error('Artist and Album required to fetch metadata');
        const cleanAlbum = album.replace(/ \(.*\)| \[.*\]/g, '').trim();
        console.log(`[Metadata] Fetching for ${artist} - ${album} (Searching as: ${cleanAlbum})`);

        const songsStr = await sendMpdCommand('find', ['albumartist', artist, 'album', album]);
        const songs = mpd.parseList(songsStr);
        if (songs.length === 0) { throw new Error('Album not found in MPD'); }

        const albumRelPath = path.dirname(songs[0].file);
        const albumFullPath = validateMusicPath(albumRelPath);
        const url = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(artist)}&a=${encodeURIComponent(cleanAlbum)}`;

        const response = await axios.get(url, { timeout: 8000 });
        const data = response.data.album ? response.data.album[0] : null;

        if (!data) {
            console.warn(`[Metadata] No results from AudioDB for ${artist} - ${cleanAlbum}`);
            throw new Error('No metadata found online for this album');
        }

        const metadata = {
            artist: artist,
            album: album,
            year: data.intYearReleased || null,
            description: data.strDescriptionEN || null,
            art_url: data.strAlbumThumb || null
        };

        if (metadata.art_url) {
            try {
                const artResponse = await axios.get(metadata.art_url, { responseType: 'stream' });
                const coverPath = path.join(albumFullPath, 'cover.jpg');
                const writer = fsSync.createWriteStream(coverPath);
                artResponse.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                console.log(`[Metadata] Downloaded new cover art for ${album}`);
            } catch (artErr) {
                console.error(`[Metadata] Failed to download art: ${artErr.message}`);
            }
        }

        await new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO albums (artist, album, year, description) VALUES (?, ?, ?, ?)`,
                [metadata.artist, metadata.album, metadata.year, metadata.description],
                function (err) {
                    if (err) { console.error(`[DB] Error saving metadata: ${err.message}`); return reject(err); }
                    console.log(`[DB] Saved metadata for ${artist} - ${album}. Rows: ${this.changes}`);
                    resolve();
                }
            );
        });
        socket.emit('metadataFetched');
    }, 'fetchMetadata'));

    socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
    });
});

// --- 13. Graceful Shutdown ---
const shutdown = async (signal) => {
    console.log(`\n[System] ${signal} received, shutting down gracefully...`);
    try {
        if (mpdClient) { await mpdClient.disconnect(); }
        await new Promise((resolve, reject) => db.close(err => { if (err) { console.error(`[DB] Error closing database: ${err.message}`); return reject(err); } console.log('[DB] Database connection closed.'); resolve(); }));
        server.close(() => { console.log('[Server] Server closed'); process.exit(0); });
        setTimeout(() => { console.error('[System] Forced shutdown after timeout'); process.exit(1); }, 10000);
    } catch (err) {
        console.error('[System] Error during shutdown:', err);
        process.exit(1);
    }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- 14. Main Server Startup ---
const init = async () => {
    try {
        db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
            if (err) { console.error(`[DB] Error opening database: ${err.message}`); process.exit(1); }
            console.log(`[DB] Connected to SQLite database at ${CONFIG.DB_PATH}`);
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS albums (artist TEXT NOT NULL, album TEXT NOT NULL, year INTEGER, description TEXT, PRIMARY KEY (artist, album))`, (err) => {
                if (err) return reject(err);
                db.run(`CREATE TABLE IF NOT EXISTS services (service TEXT PRIMARY KEY, username TEXT, password TEXT, token TEXT, appid TEXT)`, (err) => {
                    if (err) { console.error(`[DB] Error creating services table: ${err.message}`); return reject(err); }
                    console.log('[DB] Tables ready.');
                    resolve();
                });
            });
        });

        await connectMPD();

        server.listen(CONFIG.PORT, '0.0.0.0', () => {
            console.log(`[Server] Listening on port ${CONFIG.PORT}`);
            console.log(`[Server] Music directory: ${CONFIG.MUSIC_DIR}`);
            console.log(`[Server] Redirect URI: ${CONFIG.REDIRECT_URI}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n❌ Port ${CONFIG.PORT} is already in use!`);
                process.exit(1);
            } else {
                console.error('[Server] Error:', err);
                process.exit(1);
            }
        });
    } catch (err) {
        console.error('[Server] Failed to initialize:', err);
        process.exit(1);
    }
};

init();