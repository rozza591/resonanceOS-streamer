// --- 1. Imports (CommonJS) ---
require('dotenv').config();
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
const sqlite3 = require('sqlite3').verbose();
const util = require('util');
const crypto = require('crypto');
const execAsync = util.promisify(exec);

// --- 2. Configuration ---
const CONFIG = {
    PORT: process.env.PORT || 3000,
    MPD_HOST: process.env.MPD_HOST || 'localhost',
    MPD_PORT: process.env.MPD_PORT || 6600,
    MUSIC_DIR: process.env.MUSIC_DIR || '/var/lib/mpd/music',
    DB_PATH: process.env.DB_PATH || path.join(__dirname, 'audiophile.db'),
    MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
    MAX_FILES: 50,
    RECONNECT_DELAY: 5000,
    COMMAND_TIMEOUT: 10000,
    // Legacy Android Token (Supports User/Pass Login)
    TIDAL_TOKEN: 'CzET4vdadNUFQ5HV'
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
            imgSrc: ["'self'", "data:", "blob:", "https://www.theaudiodb.com", "https://resources.tidal.com"],
            mediaSrc: ["'self'"],
            connectSrc: ["'self'", "ws:", "wss:", "https://www.theaudiodb.com", "https://api.tidal.com", "*"],
            'upgrade-insecure-requests': null
        }
    }
}));

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many uploads.' });

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/music', express.static(CONFIG.MUSIC_DIR));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/health', (req, res) => { res.json({ status: clientReady ? 'healthy' : 'degraded', mpdConnected: clientReady, uptime: process.uptime() }); });

// --- 7. HTTP Route for File Uploads ---
app.post('/upload', uploadLimiter, upload.array('musicFiles'), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });
    const results = { success: 0, failed: 0, errors: [] };
    try {
        for (const file of req.files) {
            try {
                const metadata = await musicMetadata.parseFile(file.path);
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    const albumDir = path.dirname(file.path);
                    const coverPath = path.join(albumDir, 'cover.jpg');
                    try { await fs.access(coverPath); }
                    catch { await fs.writeFile(coverPath, picture.data); }
                }
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({ file: file.originalname, error: error.message });
            }
        }
        if (clientReady) await sendMpdCommand('update');
        res.status(200).json({ message: 'Upload complete', results });
    } catch (error) {
        res.status(500).json({ error: 'Upload processing failed', details: error.message });
    }
});

// --- 8. AUTH ROUTES ---

// A. Direct Login (User/Pass)
app.post('/auth/tidal/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    console.log(`[Auth] Attempting Tidal login for: ${username}`);

    try {
        const clientUniqueKey = crypto.randomBytes(16).toString('hex');
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        params.append('token', CONFIG.TIDAL_TOKEN);
        params.append('clientUniqueKey', clientUniqueKey);
        params.append('version', '2.26.0');

        const response = await axios.post('https://api.tidal.com/v1/login/username', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { sessionId, userId, countryCode } = response.data;
        if (!sessionId) throw new Error('Login succeeded but no Session ID returned.');

        await saveSessionToDB(sessionId, countryCode, userId, CONFIG.TIDAL_TOKEN, username, null);

        console.log(`[Auth] Tidal login successful. User: ${userId}, Country: ${countryCode}`);
        res.json({ success: true, message: 'Connected to Tidal' });

    } catch (error) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        const userMsg = errorData?.userMessage || error.message;
        const subStatus = errorData?.subStatus;

        console.error(`[Auth] Tidal Login Failed (${status}): ${userMsg} (SubStatus: ${subStatus})`);

        if (subStatus === 1002 || status === 403) {
            res.status(403).json({ error: `Login Restricted. Tidal requires CAPTCHA. Please use Manual Session Entry.` });
        } else if (status === 401) {
            res.status(401).json({ error: 'Invalid username or password.' });
        } else {
            res.status(500).json({ error: `Login failed: ${userMsg}` });
        }
    }
});

// B. Manual Session Entry
app.post('/auth/tidal/session', async (req, res) => {
    const { sessionId, countryCode: inputCountryCode, userId, clientToken, accessToken } = req.body;
    const tokenToUse = clientToken || CONFIG.TIDAL_TOKEN;

    if (!accessToken && (!sessionId || !userId)) {
        return res.status(400).json({ error: 'Either (Session ID & User ID) OR Access Token is required.' });
    }

    try {
        console.log(`[Auth] Verifying manual session...`);

        const headers = accessToken
            ? { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            : { 'X-Tidal-SessionId': sessionId, 'X-Tidal-Token': tokenToUse };

        let finalUserId = userId;
        // >>> START OF EDIT: Auto-detect Country Code
        let finalCountryCode = inputCountryCode || 'US';

        if (accessToken) {
            const sessionRes = await axios.get(`https://api.tidal.com/v1/sessions`, { headers });
            finalUserId = sessionRes.data.userId;
            if (sessionRes.data.countryCode) {
                finalCountryCode = sessionRes.data.countryCode;
                console.log(`[Auth] Auto-detected Country Code: ${finalCountryCode}`);
            }
            if (!finalUserId) throw new Error('Could not retrieve User ID from Access Token');
        } else {
            await axios.get(`https://api.tidal.com/v1/users/${userId}`, {
                headers: headers,
                params: { countryCode: finalCountryCode }
            });
        }

        await saveSessionToDB(
            sessionId || 'bearer',
            finalCountryCode, // Use the detected or verified country code
            finalUserId,
            tokenToUse,
            'ManualUser',
            accessToken
        );
        // <<< END OF EDIT

        console.log(`[Auth] Manual session saved for User: ${finalUserId}, Country: ${finalCountryCode}`);
        res.json({ success: true, message: 'Manual session saved' });
    } catch (err) {
        console.error(`[Auth] Invalid session provided: ${err.message}`);
        res.status(401).json({ error: 'The provided session/token is invalid or expired.' });
    }
});

// DB Helper
async function saveSessionToDB(sid, cc, uid, token, user, accessToken) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO services (service, session_id, country_code, user_id, client_token, username, token) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['tidal', sid, cc, uid, token, user, accessToken],
            (err) => err ? reject(err) : resolve()
        );
    });
}

// --- 9. TIDAL API HELPERS ---

async function getTidalCredentials() {
    return new Promise((resolve, reject) => {
        db.get("SELECT session_id, country_code, user_id, client_token, token FROM services WHERE service = 'tidal'", (err, row) => {
            if (err) return reject(err);
            if (!row || (!row.session_id && !row.token)) {
                return reject(new Error('Tidal not connected. Please log in via Settings.'));
            }
            resolve({
                sessionId: row.session_id,
                countryCode: row.country_code || 'US',
                userId: row.user_id,
                clientToken: row.client_token || CONFIG.TIDAL_TOKEN,
                accessToken: row.token
            });
        });
    });
}

function getWebHeaders(creds) {
    if (creds.accessToken) {
        return {
            'Authorization': `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json'
        };
    }
    return {
        'X-Tidal-SessionId': creds.sessionId,
        'X-Tidal-Token': creds.clientToken,
    };
}

// --- 10. TIDAL ROUTES ---

app.get('/api/tidal/search', async (req, res) => {
    const { query, type, limit } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });

    try {
        const creds = await getTidalCredentials();
        const searchTypes = type || 'ARTISTS,ALBUMS,TRACKS,PLAYLISTS';

        console.log(`[Tidal] Searching: "${query}" (${searchTypes})`);

        const response = await axios.get('https://api.tidal.com/v1/search', {
            params: {
                query,
                types: searchTypes,
                limit: limit || 30,
                countryCode: creds.countryCode
            },
            headers: getWebHeaders(creds)
        });

        res.json(response.data);
    } catch (error) {
        console.error('[Tidal] Search failed:', error.message);
        res.status(500).json({ error: 'Tidal search failed' });
    }
});

app.get('/api/tidal/artists/:id/albums', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Artist ID required' });

    try {
        const creds = await getTidalCredentials();
        console.log(`[Tidal] Fetching albums for artist: ${id}`);

        const response = await axios.get(`https://api.tidal.com/v1/artists/${id}/albums`, {
            params: {
                limit: 50,
                countryCode: creds.countryCode
            },
            headers: getWebHeaders(creds)
        });

        res.json(response.data);
    } catch (error) {
        console.error('[Tidal] Artist albums failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

app.get('/api/tidal/albums/:id/tracks', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Album ID required' });

    try {
        const creds = await getTidalCredentials();
        console.log(`[Tidal] Fetching tracks for album: ${id}`);

        const response = await axios.get(`https://api.tidal.com/v1/albums/${id}/tracks`, {
            params: {
                limit: 50,
                countryCode: creds.countryCode
            },
            headers: getWebHeaders(creds)
        });

        res.json(response.data);
    } catch (error) {
        console.error('[Tidal] Album tracks failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// --- 11. MPD Connection ---
async function connectMPD() {
    try {
        console.log(`[MPD] Connecting to ${CONFIG.MPD_HOST}:${CONFIG.MPD_PORT}...`);
        mpdClient = await mpd.connect({ host: CONFIG.MPD_HOST, port: CONFIG.MPD_PORT });
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
    setTimeout(() => { connectMPD().catch(err => { }); }, CONFIG.RECONNECT_DELAY);
}
function handleMPDEvent(name) {
    if (name === 'player') { sendStatus(); sendQueue(); }
    else if (name === 'output') sendOutputs();
    else if (name === 'playlist') sendQueue();
    else if (name === 'stored_playlist') sendPlaylists();
    else if (name === 'database') io.emit('libraryUpdated');
}

// --- 12. Safe MPD Command ---
async function sendMpdCommand(command, args = []) {
    if (!clientReady || !mpdClient) throw new Error('MPD not connected');
    try {
        const cmdToSend = args.length > 0 ? cmd(command, args) : command;
        return await Promise.race([
            mpdClient.sendCommand(cmdToSend),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${command}`)), CONFIG.COMMAND_TIMEOUT))
        ]);
    } catch (err) {
        console.error(`[MPD] Command error (${command}): ${err.message}`);
        throw err;
    }
}

// --- 13. Helper Functions ---
const sendStatus = async () => {
    try {
        const statusStr = await sendMpdCommand('status');
        const status = mpd.parseObject(statusStr);
        let currentSong = null;
        try {
            const songStr = await sendMpdCommand('currentsong');
            currentSong = mpd.parseObject(songStr);
        } catch (e) { }
        io.emit('statusUpdate', { status, currentSong });
    } catch (err) { console.error(`[MPD] Status error: ${err.message}`); }
};

const sendOutputs = async () => {
    try {
        const { stdout } = await execAsync('aplay -l');
        const outputsStr = await sendMpdCommand('outputs');
        const mpdOutputs = mpd.parseList(outputsStr);
        io.emit('outputsList', mpdOutputs);
    } catch (err) { console.error(`[MPD] Outputs error: ${err.message}`); }
};

const sendQueue = async () => { try { const s = await sendMpdCommand('playlistinfo'); io.emit('queueList', mpd.parseList(s)); } catch (e) { } };
const sendPlaylists = async () => { try { const s = await sendMpdCommand('listplaylists'); io.emit('playlistsList', mpd.parseList(s)); } catch (e) { } };
function validateMusicPath(rel) {
    const full = path.resolve(CONFIG.MUSIC_DIR, rel);
    if (!full.startsWith(path.resolve(CONFIG.MUSIC_DIR))) throw new Error('Invalid path');
    return full;
}

// --- 14. WebSocket ---
io.on('connection', (socket) => {
    console.log(`[Socket] ${socket.id} connected`);
    socket.emit('connectionStatus', { connected: clientReady });
    if (clientReady) { sendStatus(); sendOutputs(); sendQueue(); sendPlaylists(); }

    const safe = async (fn, name) => {
        try {
            await fn();
        } catch (e) {
            console.error(`[Error] ${name}:`, e.message);
            if (e.response) {
                console.error(`[Error] API Status:`, e.response.status);
                console.error(`[Error] API Data:`, JSON.stringify(e.response.data));
            }
            socket.emit('error', { message: e.message });
        }
    };

    socket.on('play', () => safe(() => sendMpdCommand('play'), 'play'));
    socket.on('pause', () => safe(() => sendMpdCommand('pause', [1]), 'pause'));
    socket.on('stop', () => safe(() => sendMpdCommand('stop'), 'stop'));
    socket.on('next', () => safe(() => sendMpdCommand('next'), 'next'));
    socket.on('previous', () => safe(() => sendMpdCommand('previous'), 'previous'));
    socket.on('seek', (t) => safe(async () => { const s = mpd.parseObject(await sendMpdCommand('status')); if (s.songid) await sendMpdCommand('seekid', [s.songid, Math.floor(t)]); sendStatus(); }, 'seek'));
    socket.on('setVolume', (v) => safe(() => sendMpdCommand('setvol', [v]), 'vol'));

    socket.on('getArtists', () => safe(async () => {
        const list = mpd.parseList(await sendMpdCommand('list', ['albumartist']));
        socket.emit('artistList', list.map(i => i.albumartist).filter(Boolean).sort());
    }, 'artists'));

    socket.on('getAlbums', (art) => safe(async () => {
        const list = mpd.parseList(await sendMpdCommand('list', ['album', 'albumartist', art]));
        socket.emit('albumList', { artist: art, albums: list.map(i => i.album).filter(Boolean).sort() });
    }, 'albums'));

    socket.on('getSongs', ({ artist, album }) => safe(async () => {
        const songs = mpd.parseList(await sendMpdCommand('find', ['albumartist', artist, 'album', album]));
        let meta = null;
        try { meta = await new Promise((res, rej) => db.get("SELECT * FROM albums WHERE artist=? AND album=?", [artist, album], (e, r) => e ? rej(e) : res(r))); } catch (e) { }
        socket.emit('songList', { album: album, songs: songs, metadata: meta });
    }, 'songs'));


    socket.on('playTrack', (data) => safe(async () => {
        console.log(`[Player] playTrack: ${data.uri} (clear: ${data.clear})`);

        if (data.clear) await sendMpdCommand('clear');

        let resolvedUrl = null;

        if (data.service === 'tidal') {
            const id = data.uri.split('/').pop();
            console.log(`[Player] Resolving Tidal ID: ${id}`);
            const creds = await getTidalCredentials();

            // >>> START OF EDIT: Debug log country code
            console.log(`[Player] Using Country Code: ${creds.countryCode}`);

            const playbackParams = {
                playbackmode: 'STREAM',
                assetpresentation: 'FULL',
                countryCode: creds.countryCode
            };

            try {
                // 1. Try HI_RES
                const res = await axios.get(`https://api.tidal.com/v1/tracks/${id}/url`, {
                    params: { ...playbackParams, audioquality: 'HI_RES' },
                    headers: getWebHeaders(creds)
                });
                resolvedUrl = res.data.url;
            } catch (e1) {
                try {
                    console.log('[Tidal] HI_RES failed, trying LOSSLESS...');
                    // 2. Try LOSSLESS
                    const res = await axios.get(`https://api.tidal.com/v1/tracks/${id}/url`, {
                        params: { ...playbackParams, audioquality: 'LOSSLESS' },
                        headers: getWebHeaders(creds)
                    });
                    resolvedUrl = res.data.url;
                } catch (e2) {
                    try {
                        console.log('[Tidal] LOSSLESS failed, trying HIGH...');
                        // 3. Try HIGH
                        const res = await axios.get(`https://api.tidal.com/v1/tracks/${id}/url`, {
                            params: { ...playbackParams, audioquality: 'HIGH' },
                            headers: getWebHeaders(creds)
                        });
                        resolvedUrl = res.data.url;
                    } catch (e3) {
                        console.log('[Tidal] HIGH failed, trying LOW...');
                        // 4. Try LOW
                        const res = await axios.get(`https://api.tidal.com/v1/tracks/${id}/url`, {
                            params: { ...playbackParams, audioquality: 'LOW' },
                            headers: getWebHeaders(creds)
                        });
                        resolvedUrl = res.data.url;
                    }
                }
            }
        } else {
            resolvedUrl = data.uri;
        }

        // >>> START OF EDIT: Explicit check before adding
        if (!resolvedUrl) throw new Error('Failed to resolve URL for playback.');

        await sendMpdCommand('add', [resolvedUrl]);
        await sendMpdCommand('play');
        // <<< END OF EDIT

    }, 'playTrack'));

    socket.on('addToQueue', (uri) => safe(async () => {
        if (uri.includes('tidal') || /^\d+$/.test(uri)) {
            const id = uri.split('/').pop();
            const creds = await getTidalCredentials();
            const res = await axios.get(`https://api.tidal.com/v1/tracks/${id}/url`, {
                params: { audioquality: 'HI_RES', playbackmode: 'STREAM', assetpresentation: 'FULL' },
                headers: getWebHeaders(creds)
            });
            if (res.data.url) await sendMpdCommand('add', [res.data.url]);
        } else {
            await sendMpdCommand('add', [uri]);
        }
    }, 'add'));

    socket.on('removeFromQueue', (id) => safe(() => sendMpdCommand('deleteid', [id]), 'del'));
    socket.on('clearQueue', () => safe(() => sendMpdCommand('clear'), 'clear'));

    // Services
    socket.on('getServices', () => safe(() => {
        db.all("SELECT * FROM services", [], (err, rows) => {
            const s = {};
            rows.forEach(r => {
                s[r.service] = { connected: r.service === 'tidal' ? !!(r.session_id || r.token) : !!r.token };
            });
            socket.emit('servicesList', s);
        });
    }, 'services'));

    socket.on('logoutService', (svc) => safe(() => {
        db.run("DELETE FROM services WHERE service=?", [svc]);
        socket.emit('message', { text: `Logged out of ${svc}` });
        socket.emit('getServices');
    }, 'logout'));

    socket.on('getSystemInfo', () => safe(() => socket.emit('systemInfo', {
        osVersion: 'ResonanceOS 1.0', kernel: os.release(), audioServer: 'Pipewire', cpuLoad: os.loadavg()[0].toFixed(1)
    }), 'sys'));
    socket.on('rebootPi', () => exec('sudo reboot'));
    socket.on('rescanLibrary', () => sendMpdCommand('update'));
    socket.on('switchOutput', ({ outputId, enabled }) => safe(async () => { await sendMpdCommand(enabled ? 'enableoutput' : 'disableoutput', [outputId]); sendOutputs(); }));

    // Metadata Fetch
    socket.on('fetchMetadata', ({ artist, album }) => safe(async () => {
        const cleanAlbum = album.replace(/ \(.*\)| \[.*\]/g, '').trim();
        const url = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(artist)}&a=${encodeURIComponent(cleanAlbum)}`;
        const response = await axios.get(url, { timeout: 8000 });
        const data = response.data.album ? response.data.album[0] : null;
        if (!data) throw new Error('No online metadata');

        const meta = { artist, album, year: data.intYearReleased, description: data.strDescriptionEN };
        await new Promise((res, rej) => db.run(`INSERT OR REPLACE INTO albums (artist, album, year, description) VALUES (?, ?, ?, ?)`, [meta.artist, meta.album, meta.year, meta.description], (e) => e ? rej(e) : res()));
        socket.emit('metadataFetched');
    }, 'meta'));
});

// --- 15. Init ---
const init = async () => {
    try {
        db = new sqlite3.Database(CONFIG.DB_PATH);
        await new Promise(r => db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS albums (artist TEXT, album TEXT, year INT, description TEXT, PRIMARY KEY(artist, album))`);
            db.run(`CREATE TABLE IF NOT EXISTS services (service TEXT PRIMARY KEY, session_id TEXT, country_code TEXT, user_id TEXT, client_token TEXT, username TEXT, token TEXT, password TEXT, appid TEXT)`,
                (err) => {
                    if (!err) {
                        ['session_id', 'country_code', 'user_id', 'client_token', 'username', 'token'].forEach(c => db.run(`ALTER TABLE services ADD COLUMN ${c} TEXT`, () => { }));
                    }
                    r();
                });
        }));
        await connectMPD();
        server.listen(CONFIG.PORT, '0.0.0.0', () => console.log(`Listening on ${CONFIG.PORT}`));
    } catch (e) { console.error(e); process.exit(1); }
};
init();