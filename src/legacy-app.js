import { socket } from './socket.js';

const initApp = () => {
    console.log('[Legacy App] Initializing...');

    // --- 1. Connect to Socket.io ---
    // Socket is imported from module

    // --- 2. Select DOM Elements ---

    // Header
    const deviceName = document.getElementById('header-device-name');

    // Main Player
    const albumArt = document.getElementById('album-art');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const playerAlbum = document.getElementById('player-album');
    const techFormat = document.getElementById('tech-format');
    const techSamplerate = document.getElementById('tech-samplerate');
    const techBitdepth = document.getElementById('tech-bitdepth');
    const seekSlider = document.getElementById('seek-slider');
    const timeCurrent = document.getElementById('time-current');
    const timeDuration = document.getElementById('time-duration');
    const btnPrev = document.getElementById('btn-prev');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnNext = document.getElementById('btn-next');
    const visualizerCanvas = document.getElementById('visualizer-canvas');
    const ctx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;

    // Footer
    const statusLight = document.getElementById('status-light');
    const statusText = document.getElementById('status-text');
    const statusTooltip = document.getElementById('status-tooltip');
    const statCpu = document.getElementById('stat-cpu');
    const statBuffer = document.getElementById('stat-buffer');
    const statLatency = document.getElementById('stat-latency');

    // Modals
    const libraryModal = document.getElementById('library-modal');
    const settingsModal = document.getElementById('settings-modal');
    const queueModal = document.getElementById('queue-modal');
    const uploadModal = document.getElementById('upload-modal');
    const rebootConfirmModal = document.getElementById('reboot-confirm-modal');

    // Library Modal Selectors
    const btnOpenLibrary = document.getElementById('btn-open-library');
    const btnCloseLibrary = document.getElementById('btn-close-library');
    const librarySpinner = document.getElementById('library-spinner');
    const libraryBackBtn = document.getElementById('library-back-btn');
    const libraryTitle = document.getElementById('library-title');
    const librarySearch = document.getElementById('library-search');

    // Library Views
    const libraryViewArtists = document.getElementById('library-view-artists');
    const libraryViewAlbums = document.getElementById('library-view-albums');
    const libraryViewTracks = document.getElementById('library-view-tracks');
    const libraryViewPlaylists = document.getElementById('library-view-playlists');
    const libraryViewRadio = document.getElementById('library-view-radio');
    const localTabs = document.getElementById('local-tabs');
    const tidalTabs = document.getElementById('tidal-tabs');
    const tidalViewSearch = document.getElementById('tidal-view-search');

    // Queue Modal Selectors
    const btnOpenQueue = document.getElementById('btn-open-queue');
    const btnCloseQueue = document.getElementById('btn-close-queue');
    const btnClearQueue = document.getElementById('btn-clear-queue');
    const btnSavePlaylist = document.getElementById('btn-save-playlist');
    const queueList = document.getElementById('queue-list');

    // Settings Modal Selectors
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const outputsList = document.getElementById('outputs-list');
    const sysOs = document.getElementById('sys-os');
    const sysKernel = document.getElementById('sys-kernel');
    const sysAudio = document.getElementById('sys-audio');
    const sysCpu = document.getElementById('sys-cpu');
    const btnRescan = document.getElementById('btn-rescan');
    const btnReboot = document.getElementById('btn-reboot');
    const settingsSpinner = document.getElementById('settings-spinner');
    const themeSelect = document.getElementById('theme-select');

    // Tidal OAuth Button
    const btnTidalOAuth = document.getElementById('btn-tidal-oauth');

    // Manual Auth Elements
    const tidalLoginContainer = document.getElementById('tidal-login-container');
    const tidalConnectedInfo = document.getElementById('tidal-connected-info');

    const btnTidalManual = document.getElementById('btn-tidal-manual');
    const tidalSessionIdInput = document.getElementById('tidal-session-id');
    const tidalUserIdInput = document.getElementById('tidal-user-id');
    const tidalCountryCodeInput = document.getElementById('tidal-country-code');
    const tidalAccessTokenInput = document.getElementById('tidal-access-token');

    const authTabs = document.querySelectorAll('.auth-tab');
    const authAutoForm = document.getElementById('auth-auto');
    const authManualForm = document.getElementById('auth-manual');

    // Reboot Confirm
    const btnCloseRebootConfirm = document.getElementById('btn-close-reboot-confirm');
    const btnCancelReboot = document.getElementById('btn-cancel-reboot');
    const btnConfirmReboot = document.getElementById('btn-confirm-reboot');

    // Upload Modal
    const btnOpenUpload = document.getElementById('btn-open-upload');
    const btnCloseUpload = document.getElementById('btn-close-upload');
    const uploadForm = document.getElementById('upload-form');
    const uploadDropZone = document.querySelector('.upload-drop-zone');
    const musicFilesInput = document.getElementById('music-files-input');
    const fileListItems = document.getElementById('file-list-items');
    const btnClearFiles = document.getElementById('btn-clear-files');
    const btnSubmitUpload = document.getElementById('btn-submit-upload');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBarInner = document.querySelector('.progress-bar-inner');
    const progressBarText = document.querySelector('.progress-bar-text');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // --- 3. Client-Side State ---

    let isSeeking = false;
    let playerTimer = null;
    let lastStatusTime = 0;
    let lastStatusElapsed = 0;
    let lastStatusDuration = 0;
    let filesToUpload = [];
    let currentLibraryView = 'artists';
    let currentArtist = null;
    let currentAlbum = null;
    let currentSource = 'local';
    let searchTimeout;

    let tidalHistory = [];

    // Path utility function
    const path = {
        basename: (filePath) => {
            if (!filePath) return '';
            return filePath.split('/').pop().split('.').slice(0, -1).join('.');
        }
    };

    // --- 4. Helper Functions ---

    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const getTidalImage = (uuid, size = 320) => {
        if (!uuid) return '';
        const path = uuid.replace(/-/g, '/');
        return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
    };

    const openModal = (modal) => {
        if (!modal) return;
        modal.classList.remove('hidden');
        if (modal === libraryModal) {
            if (librarySpinner) librarySpinner.classList.remove('hidden');
            showLibraryView('artists');
            if (librarySearch) librarySearch.value = '';
            tidalHistory = []; // Reset history on open
        }
        if (modal === settingsModal) {
            if (settingsSpinner) settingsSpinner.classList.remove('hidden');
        }
    };

    const closeModal = (modal) => {
        if (!modal) return;
        modal.classList.add('hidden');
        if (modal === uploadModal) {
            resetUploadForm();
        }
    };

    const showToast = (message, type = 'info') => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    };

    const stopPlayerTimer = () => {
        if (playerTimer) {
            clearInterval(playerTimer);
            playerTimer = null;
        }
    };

    const startPlayerTimer = () => {
        stopPlayerTimer();
        playerTimer = setInterval(() => {
            if (isSeeking) return;
            const timeDiff = (Date.now() - lastStatusTime) / 1000;
            let localElapsed = lastStatusElapsed + timeDiff;
            if (localElapsed > lastStatusDuration) {
                localElapsed = lastStatusDuration;
                stopPlayerTimer();
            }
            if (seekSlider) seekSlider.value = localElapsed;
            if (timeCurrent) timeCurrent.textContent = formatTime(localElapsed);
        }, 500);
    };

    // --- 5. Event Listeners ---

    if (authTabs) {
        authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                authTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                if (tab.dataset.target === 'auto') {
                    authAutoForm.classList.remove('hidden');
                    authManualForm.classList.add('hidden');
                } else {
                    authAutoForm.classList.add('hidden');
                    authManualForm.classList.remove('hidden');
                }
            });
        });
    }

    // OAuth Login Handler
    if (btnTidalOAuth) {
        btnTidalOAuth.addEventListener('click', () => {
            // Redirect to OAuth endpoint
            window.location.href = '/auth/tidal';
        });
    }

    if (btnTidalManual) {
        btnTidalManual.addEventListener('click', async () => {
            const accessToken = tidalAccessTokenInput ? tidalAccessTokenInput.value.trim() : '';
            const sessionId = tidalSessionIdInput.value.trim();
            const userId = tidalUserIdInput.value.trim();
            const countryCode = tidalCountryCodeInput.value.trim();
            if (!accessToken && (!sessionId || !userId)) {
                alert('Please provide either a Bearer Token OR (Session ID + User ID).');
                return;
            }
            btnTidalManual.disabled = true;
            btnTidalManual.textContent = 'Saving...';
            try {
                const res = await fetch('/auth/tidal/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, userId, countryCode, accessToken })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('Manual Session Saved!', 'success');
                    if (tidalAccessTokenInput) tidalAccessTokenInput.value = '';
                    tidalSessionIdInput.value = '';
                    tidalUserIdInput.value = '';
                    socket.emit('getServices');
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch (err) {
                alert('Network error during session save.');
            } finally {
                btnTidalManual.disabled = false;
                btnTidalManual.textContent = 'Save Session';
            }
        });
    }

    if (btnTidalLogout) {
        btnTidalLogout.addEventListener('click', () => {
            if (confirm('Log out of Tidal?')) {
                socket.emit('logoutService', 'tidal');
            }
        });
    }

    if (btnOpenLibrary) btnOpenLibrary.addEventListener('click', () => {
        openModal(libraryModal);
        socket.emit('getArtists');
    });
    if (btnCloseLibrary) btnCloseLibrary.addEventListener('click', () => closeModal(libraryModal));

    if (btnOpenSettings) btnOpenSettings.addEventListener('click', () => {
        openModal(settingsModal);
        socket.emit('getSystemInfo');
        socket.emit('getOutputs');
        socket.emit('getServices');
    });
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => closeModal(settingsModal));

    if (btnOpenQueue) btnOpenQueue.addEventListener('click', () => {
        openModal(queueModal);
        socket.emit('getStatus');
    });
    if (btnCloseQueue) btnCloseQueue.addEventListener('click', () => closeModal(queueModal));

    if (btnClearQueue) btnClearQueue.addEventListener('click', () => {
        if (confirm('Clear the entire queue?')) socket.emit('clearQueue');
    });

    if (btnSavePlaylist) btnSavePlaylist.addEventListener('click', () => {
        const name = prompt('Enter playlist name:');
        if (name) {
            socket.emit('saveQueue', name);
            showToast('Playlist saved!', 'success');
        }
    });

    if (btnOpenUpload) btnOpenUpload.addEventListener('click', () => openModal(uploadModal));
    if (btnCloseUpload) btnCloseUpload.addEventListener('click', () => closeModal(uploadModal));

    [libraryModal, settingsModal, rebootConfirmModal, uploadModal, queueModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    if (libraryBackBtn) {
        libraryBackBtn.addEventListener('click', () => {
            if (currentSource === 'tidal' && tidalHistory.length > 0) {
                tidalHistory.pop();
                const previousView = tidalHistory[tidalHistory.length - 1];
                if (previousView) {
                    renderTidalResults(previousView.data);
                    if (librarySearch) librarySearch.value = previousView.query || '';
                } else {
                    if (tidalViewSearch) tidalViewSearch.innerHTML = '';
                    tidalHistory = [];
                    if (libraryBackBtn) libraryBackBtn.classList.add('hidden');
                    if (librarySearch) librarySearch.value = '';
                    if (librarySearch) librarySearch.focus();
                }
                return;
            }
            if (librarySearch) librarySearch.value = '';
            if (currentLibraryView === 'tracks') {
                showLibraryView('albums', currentArtist);
                socket.emit('getAlbums', currentArtist);
            } else if (currentLibraryView === 'albums') {
                showLibraryView('artists');
                socket.emit('getArtists');
            }
        });
    }

    const sourceBtns = document.querySelectorAll('.source-btn');
    sourceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentSource = btn.dataset.source;
            sourceBtns.forEach(b => b.classList.toggle('active', b.dataset.source === currentSource));

            if (currentSource === 'local') {
                if (localTabs) localTabs.classList.remove('hidden');
                if (tidalTabs) tidalTabs.classList.add('hidden');
                showLibraryView('artists');
            } else {
                if (localTabs) localTabs.classList.add('hidden');
                if (tidalTabs) tidalTabs.classList.remove('hidden');
                [libraryViewArtists, libraryViewAlbums, libraryViewTracks, libraryViewPlaylists].forEach(el => el && el.classList.add('hidden'));
                if (tidalViewSearch) tidalViewSearch.classList.remove('hidden');
                if (libraryBackBtn) libraryBackBtn.classList.add('hidden');
            }
        });
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (currentSource === 'tidal') return;
            document.querySelectorAll('#local-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            const viewName = e.target.dataset.tab;
            showLibraryView(viewName);
            if (viewName === 'artists') socket.emit('getArtists');
            if (viewName === 'playlists') socket.emit('getPlaylists');
        });
    });

    if (librarySearch) {
        librarySearch.addEventListener('input', () => {
            const query = librarySearch.value.trim();

            if (currentSource === 'tidal') {
                clearTimeout(searchTimeout);
                if (query.length > 2) {
                    searchTimeout = setTimeout(() => {
                        fetchTidalSearch(query);
                    }, 500);
                }
            } else {
                const filterText = query.toLowerCase();
                let items;
                if (currentLibraryView === 'artists' && libraryViewArtists) items = libraryViewArtists.querySelectorAll('.artist-item');
                else if (currentLibraryView === 'albums' && libraryViewAlbums) items = libraryViewAlbums.querySelectorAll('.album-item');
                else if (currentLibraryView === 'tracks' && libraryViewTracks) items = libraryViewTracks.querySelectorAll('.library-track');

                if (items) {
                    items.forEach(item => {
                        item.style.display = item.textContent.toLowerCase().includes(filterText) ? '' : 'none';
                    });
                }
            }
        });

        librarySearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = librarySearch.value.trim();
                if (currentSource === 'tidal' && query.length > 0) {
                    clearTimeout(searchTimeout);
                    fetchTidalSearch(query);
                }
            }
        });
    }

    if (btnPlayPause) btnPlayPause.addEventListener('click', () => {
        const isPlaying = btnPlayPause.classList.contains('playing');
        socket.emit(isPlaying ? 'pause' : 'play');
    });
    if (btnNext) btnNext.addEventListener('click', () => socket.emit('next'));
    if (btnPrev) btnPrev.addEventListener('click', () => socket.emit('previous'));
    if (seekSlider) {
        seekSlider.addEventListener('input', () => {
            isSeeking = true;
            if (timeCurrent) timeCurrent.textContent = formatTime(seekSlider.value);
        });
        seekSlider.addEventListener('change', () => {
            socket.emit('seek', parseFloat(seekSlider.value));
            isSeeking = false;
            stopPlayerTimer();
        });
    }

    if (btnRescan) btnRescan.addEventListener('click', () => {
        socket.emit('rescanLibrary');
        showToast('Library rescan started.', 'info');
    });
    if (btnReboot) btnReboot.addEventListener('click', () => {
        if (rebootConfirmModal) openModal(rebootConfirmModal);
    });
    if (btnConfirmReboot) btnConfirmReboot.addEventListener('click', () => {
        socket.emit('rebootPi');
        closeModal(rebootConfirmModal);
        closeModal(settingsModal);
        showToast('Reboot command sent.', 'info');
    });
    if (btnCloseRebootConfirm) btnCloseRebootConfirm.addEventListener('click', () => closeModal(rebootConfirmModal));

    const applyTheme = (theme) => {
        if (theme === 'default') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
        if (themeSelect) themeSelect.value = theme;
    };
    const savedTheme = localStorage.getItem('resonance_theme') || 'default';
    applyTheme(savedTheme);
    if (themeSelect) themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
        localStorage.setItem('resonance_theme', e.target.value);
    });

    const handleFiles = (files) => {
        if (!files) return;
        for (const file of files) {
            filesToUpload.push({ fileObject: file });
        }
        updateFileListUI();
    };
    const updateFileListUI = () => {
        if (!fileListItems) return;
        fileListItems.innerHTML = '';
        filesToUpload.forEach(f => {
            const div = document.createElement('div');
            div.className = 'upload-file-item';
            div.textContent = f.fileObject.name;
            fileListItems.appendChild(div);
        });
        if (btnSubmitUpload) btnSubmitUpload.disabled = filesToUpload.length === 0;
    };
    if (uploadDropZone) {
        uploadDropZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadDropZone.classList.add('dragover'); });
        uploadDropZone.addEventListener('dragleave', () => uploadDropZone.classList.remove('dragover'));
        uploadDropZone.addEventListener('drop', (e) => { e.preventDefault(); uploadDropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    }
    if (musicFilesInput) musicFilesInput.addEventListener('change', (e) => handleFiles(e.target.files));
    if (btnClearFiles) btnClearFiles.addEventListener('click', resetUploadForm);
    if (uploadForm) uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        uploadFiles();
    });

    function resetUploadForm() {
        filesToUpload = [];
        if (uploadForm) uploadForm.reset();
        if (fileListItems) fileListItems.innerHTML = '';
        if (progressBarContainer) progressBarContainer.classList.add('hidden');
        if (btnSubmitUpload) btnSubmitUpload.disabled = true;
    }

    function uploadFiles() {
        if (filesToUpload.length === 0) return;
        const formData = new FormData();
        filesToUpload.forEach(f => formData.append('musicFiles', f.fileObject));

        if (progressBarContainer) progressBarContainer.classList.remove('hidden');
        if (btnSubmitUpload) { btnSubmitUpload.disabled = true; btnSubmitUpload.textContent = 'Uploading...'; }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && progressBarInner && progressBarText) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressBarInner.style.width = `${pct}%`;
                progressBarText.textContent = `Uploading... ${pct}%`;
            }
        };
        xhr.onload = () => {
            if (xhr.status === 200) {
                showToast('Upload complete', 'success');
                socket.emit('rescanLibrary');
                closeModal(uploadModal);
            } else {
                showToast('Upload failed', 'error');
            }
            resetUploadForm();
            if (btnSubmitUpload) { btnSubmitUpload.disabled = false; btnSubmitUpload.textContent = 'Upload'; }
        };
        xhr.send(formData);
    }

    const showLibraryView = (view, filter = null) => {
        currentLibraryView = view;
        [libraryViewArtists, libraryViewAlbums, libraryViewTracks, libraryViewPlaylists, libraryViewRadio, tidalViewSearch].forEach(el => {
            if (el) el.classList.add('hidden');
        });
        if (libraryBackBtn) libraryBackBtn.classList.add('hidden');

        if (view === 'artists' && libraryViewArtists) libraryViewArtists.classList.remove('hidden');
        else if (view === 'albums' && libraryViewAlbums) {
            libraryViewAlbums.classList.remove('hidden');
            if (libraryBackBtn) libraryBackBtn.classList.remove('hidden');
        }
        else if (view === 'tracks' && libraryViewTracks) {
            libraryViewTracks.classList.remove('hidden');
            if (libraryBackBtn) libraryBackBtn.classList.remove('hidden');
        }
        else if (view === 'playlists' && libraryViewPlaylists) libraryViewPlaylists.classList.remove('hidden');
    };

    // Fetch Albums for a Tidal Artist
    const fetchTidalArtistAlbums = async (artistId, artistName) => {
        if (!tidalViewSearch || !librarySpinner) return;

        librarySpinner.classList.remove('hidden');
        tidalViewSearch.innerHTML = '';

        try {
            const res = await fetch(`/api/tidal/artists/${artistId}/albums`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();

            const result = {
                albums: { items: data.items || [] }
            };

            tidalHistory.push({ type: 'artist_albums', artistId, data: result });

            if (librarySearch) librarySearch.value = `Albums by ${artistName}`;
            if (libraryBackBtn) libraryBackBtn.classList.remove('hidden');

            renderTidalResults(result);

        } catch (e) {
            console.error('Tidal Albums Error:', e);
            showToast('Failed to load albums', 'error');
        } finally {
            librarySpinner.classList.add('hidden');
        }
    };

    // Fetch Tracks for a Tidal Album
    const fetchTidalAlbumTracks = async (albumId, albumTitle, albumCover) => {
        if (!tidalViewSearch || !librarySpinner) return;

        librarySpinner.classList.remove('hidden');
        tidalViewSearch.innerHTML = '';

        try {
            const res = await fetch(`/api/tidal/albums/${albumId}/tracks`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();

            const tracks = data.items.map(track => {
                const patched = { ...track };
                if (!patched.album) patched.album = {};
                if (!patched.album.cover && albumCover) patched.album.cover = albumCover;
                if (!patched.album.title && albumTitle) patched.album.title = albumTitle;
                return patched;
            });

            const result = {
                tracks: { items: tracks }
            };

            tidalHistory.push({ type: 'album_tracks', albumId, data: result });

            if (librarySearch) librarySearch.value = `${albumTitle}`;
            if (libraryBackBtn) libraryBackBtn.classList.remove('hidden');

            renderTidalResults(result);

        } catch (e) {
            console.error('Tidal Album Tracks Error:', e);
            showToast('Failed to load tracks', 'error');
        } finally {
            librarySpinner.classList.add('hidden');
        }
    };

    const fetchTidalSearch = async (query) => {
        if (!tidalViewSearch) return;

        if (librarySpinner) librarySpinner.classList.remove('hidden');
        tidalViewSearch.innerHTML = '';

        try {
            const res = await fetch(`/api/tidal/search?query=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();

            tidalHistory.push({ type: 'search', query, data });

            renderTidalResults(data);
        } catch (e) {
            console.error('Tidal Search Error:', e);
            showToast('Tidal search failed', 'error');
        } finally {
            if (librarySpinner) librarySpinner.classList.add('hidden');
        }
    };

    const renderTidalResults = (data) => {
        if (!tidalViewSearch) return;
        tidalViewSearch.classList.remove('hidden');
        tidalViewSearch.innerHTML = '';

        if (data?.artists?.items) {
            data.artists.items.forEach(artist => {
                const div = document.createElement('div');
                div.className = 'artist-item';
                const img = getTidalImage(artist?.picture);
                div.innerHTML = `
                    <img src="${img}" onerror="this.style.display='none';this.parentElement.style.backgroundColor='#333'">
                    <span>${artist?.name || 'Unknown'}</span>
                `;
                div.addEventListener('click', () => {
                    fetchTidalArtistAlbums(artist.id, artist.name);
                });
                tidalViewSearch.appendChild(div);
            });
        }

        if (data?.albums?.items) {
            data.albums.items.forEach(album => {
                const div = document.createElement('div');
                div.className = 'album-item';
                const img = getTidalImage(album?.cover);
                div.innerHTML = `
                    <img src="${img}" onerror="this.style.display='none';this.parentElement.style.backgroundColor='#333'">
                    <span>${album?.title || 'Unknown'}</span>
                `;
                div.addEventListener('click', () => {
                    fetchTidalAlbumTracks(album.id, album.title, album.cover);
                });
                tidalViewSearch.appendChild(div);
            });
        }

        if (data?.tracks?.items) {
            const ul = document.createElement('ul');
            ul.className = 'library-track-list';
            ul.style.gridColumn = '1 / -1';

            data.tracks.items.forEach(track => {
                const li = document.createElement('li');
                li.className = 'library-track';
                const img = getTidalImage(track?.album?.cover, 80);
                li.innerHTML = `
                    <img src="${img}" class="track-art" onerror="this.style.display='none'">
                    <div class="track-info">
                        <div class="track-title">${track?.title || 'Unknown Title'}</div>
                        <div class="track-artist">${track?.artist?.name || 'Unknown Artist'}</div>
                    </div>
                    <span class="track-duration">${formatTime(track?.duration || 0)}</span>
                `;
                li.addEventListener('click', async () => {
                    if (window.tidalPlayer) {
                        try {
                            await window.tidalPlayer.play(track.id);
                            showToast(`Playing ${track.title} on Tidal...`, 'info');
                        } catch (err) {
                            console.error('Tidal playback error:', err);
                            showToast('Failed to play on Tidal', 'error');
                        }
                    } else {
                        // Fallback or error if SDK not loaded
                        showToast('Tidal Player not initialized', 'error');
                    }
                    closeModal(libraryModal);
                });
                ul.appendChild(li);
            });
            tidalViewSearch.appendChild(ul);
        }
    };


    // --- 6b. Dual Player Logic ---
    // currentSource is already declared above

    window.addEventListener('tidal:state', (e) => {
        const { state, data } = e.detail;
        console.log('[App] Tidal State:', state, data);

        if (state === 'play' || state === 'playing') {
            currentSource = 'tidal';
            updatePlayPauseIcon(true);
            // Pause MPD if it's playing (handled in tidal-player.js too, but good to be safe)
            socket.emit('pause');
        } else if (state === 'pause') {
            updatePlayPauseIcon(false);
        } else if (state === 'ended') {
            updatePlayPauseIcon(false);
        }
    });

    window.addEventListener('tidal:time', (e) => {
        if (currentSource !== 'tidal') return;
        const { current, duration } = e.detail;

        if (seekSlider) {
            seekSlider.max = duration;
            seekSlider.value = current;
        }
        if (timeCurrent) timeCurrent.textContent = formatTime(current);
        if (timeDuration) timeDuration.textContent = formatTime(duration);
    });

    function updatePlayPauseIcon(isPlaying) {
        if (!btnPlayPause) return;
        if (isPlaying) {
            btnPlayPause.classList.add('playing');
            btnPlayPause.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>`;
        } else {
            btnPlayPause.classList.remove('playing');
            btnPlayPause.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 3l14 9-14 9V3z" />
                </svg>`;
        }
    }

    // --- 7. Socket Handlers ---

    socket.on('connect', () => {
        if (statusLight) statusLight.classList.add('connected');
        if (statusText) statusText.textContent = 'Ready';
        socket.emit('getStatus');
        socket.emit('getOutputs');
        socket.emit('getSystemInfo');
        socket.emit('getServices');
    });

    socket.on('disconnect', () => {
        if (statusLight) statusLight.classList.remove('connected');
        if (statusText) statusText.textContent = 'Disconnected';
        stopPlayerTimer();
    });

    socket.on('statusUpdate', ({ status, currentSong }) => {
        lastStatusTime = Date.now();
        lastStatusElapsed = parseFloat(status.elapsed || 0);
        lastStatusDuration = parseFloat(status.duration || 0);

        if (status.state === 'play') {
            btnPlayPause.classList.add('playing');
            startPlayerTimer();
            startVisualizer();

            if (techFormat) techFormat.textContent = currentSong && currentSong.file ? currentSong.file.split('.').pop().toUpperCase() : '--';
            if (status.audio && typeof status.audio === 'string') {
                const [rate, depth] = status.audio.split(':');
                if (techSamplerate) techSamplerate.textContent = `${(parseInt(rate) / 1000).toFixed(1)}kHz`;
                if (techBitdepth) techBitdepth.textContent = `${depth}-bit`;
            }
        } else {
            btnPlayPause.classList.remove('playing');
            stopPlayerTimer();
            stopVisualizer();
        }

        if (!isSeeking) {
            if (seekSlider) {
                seekSlider.value = lastStatusElapsed;
                seekSlider.max = lastStatusDuration || 100;
            }
            if (timeCurrent) timeCurrent.textContent = formatTime(lastStatusElapsed);
            if (timeDuration) timeDuration.textContent = formatTime(lastStatusDuration);
        }

        if (currentSong) {
            if (playerTitle) playerTitle.textContent = currentSong.title || path.basename(currentSong.file);
            if (playerArtist) playerArtist.textContent = currentSong.artist || 'Unknown Artist';
            if (playerAlbum) playerAlbum.textContent = currentSong.album || 'Unknown Album';
        }
    });

    socket.on('artistList', (artists) => {
        if (!libraryViewArtists) return;
        libraryViewArtists.innerHTML = '';
        if (librarySpinner) librarySpinner.classList.add('hidden');

        artists.forEach(artist => {
            const div = document.createElement('div');
            div.className = 'artist-item';
            div.innerHTML = `
                <div style="width:100%; aspect-ratio:1/1; background:#333; border-radius:50%;"></div>
                <span>${artist}</span>
            `;
            div.addEventListener('click', () => {
                currentArtist = artist;
                showLibraryView('albums');
                if (librarySpinner) librarySpinner.classList.remove('hidden');
                socket.emit('getAlbums', artist);
            });
            libraryViewArtists.appendChild(div);
        });
    });

    socket.on('albumList', ({ artist, albums }) => {
        if (!libraryViewAlbums) return;
        libraryViewAlbums.innerHTML = '';
        if (librarySpinner) librarySpinner.classList.add('hidden');

        albums.forEach(album => {
            const div = document.createElement('div');
            div.className = 'album-item';
            div.innerHTML = `
                <div style="width:100%; aspect-ratio:1/1; background:#333; border-radius:8px;"></div>
                <span>${album}</span>
            `;
            div.addEventListener('click', () => {
                currentAlbum = album;
                showLibraryView('tracks');
                if (librarySpinner) librarySpinner.classList.remove('hidden');
                socket.emit('getSongs', { artist, album });
            });
            libraryViewAlbums.appendChild(div);
        });
    });

    socket.on('songList', ({ album, songs }) => {
        if (!libraryViewTracks) return;
        libraryViewTracks.innerHTML = '';
        if (librarySpinner) librarySpinner.classList.add('hidden');

        songs.forEach(track => {
            const li = document.createElement('li');
            li.className = 'library-track';
            li.innerHTML = `
                <div class="track-info">
                    <div class="track-title">${track.title || path.basename(track.file)}</div>
                    <div class="track-artist">${track.artist || 'Unknown'}</div>
                </div>
                <span class="track-duration">${formatTime(track.time)}</span>
            `;
            li.addEventListener('click', () => {
                socket.emit('clearQueue');
                socket.emit('addToQueue', track.file);
                socket.emit('play');
                closeModal(libraryModal);
            });
            libraryViewTracks.appendChild(li);
        });
    });

    socket.on('queueList', (queue) => {
        if (!queueList) return;
        queueList.innerHTML = '';
        queue.forEach(item => {
            const li = document.createElement('li');
            li.className = 'library-track';
            li.innerHTML = `
                <div class="track-info">
                    <div class="track-title">${item.Title || path.basename(item.file)}</div>
                </div>
                <button class="icon-btn remove-track">&times;</button>
            `;
            li.querySelector('.remove-track').addEventListener('click', (e) => {
                e.stopPropagation();
                socket.emit('removeFromQueue', item.Id);
            });
            queueList.appendChild(li);
        });
    });

    socket.on('servicesList', (services) => {
        if (services.tidal && services.tidal.connected) {
            if (tidalLoginContainer) tidalLoginContainer.classList.add('hidden');
            if (tidalConnectedInfo) tidalConnectedInfo.classList.remove('hidden');
        } else {
            if (tidalLoginContainer) tidalLoginContainer.classList.remove('hidden');
            if (tidalConnectedInfo) tidalConnectedInfo.classList.add('hidden');
        }
    });

    socket.on('outputsList', (outputs) => {
        if (!outputsList) return;
        outputsList.innerHTML = '';
        outputs.forEach(output => {
            const div = document.createElement('div');
            const isEnabled = output.outputenabled === '1';
            div.className = `device-item ${isEnabled ? 'connected' : ''}`;
            div.innerHTML = `
                <div class="device-info">
                    <span class="device-name">${output.outputname}</span>
                </div>
                <span class="device-status ${isEnabled ? 'connected' : 'available'}">
                    ${isEnabled ? 'Active' : 'Available'}
                </span>
            `;
            div.addEventListener('click', () => {
                socket.emit('switchOutput', { outputId: output.outputid, enabled: !isEnabled });
            });
            outputsList.appendChild(div);
        });
        if (settingsSpinner) settingsSpinner.classList.add('hidden');
    });

    socket.on('systemInfo', (info) => {
        if (sysOs) sysOs.textContent = info.osVersion;
        if (sysCpu) sysCpu.textContent = `${info.cpuLoad}%`;
        if (settingsSpinner) settingsSpinner.classList.add('hidden');
    });

    // >>> START OF EDIT: Added socket error listener
    socket.on('error', (data) => {
        console.error('Socket Error:', data);
        showToast(data.message || 'Unknown error occurred', 'error');
    });
    // <<< END OF EDIT

    let visualizerRunning = false;
    let animFrame;

    const startVisualizer = () => {
        if (visualizerRunning || !ctx) return;
        visualizerRunning = true;
        drawVisualizer();
    };

    const stopVisualizer = () => {
        visualizerRunning = false;
        cancelAnimationFrame(animFrame);
        if (ctx) ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    };

    const drawVisualizer = () => {
        if (!visualizerRunning) return;
        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;
        ctx.clearRect(0, 0, width, height);
        const bars = 30;
        const barWidth = width / bars;
        ctx.fillStyle = '#e0b050';
        for (let i = 0; i < bars; i++) {
            const h = Math.random() * height * 0.8;
            ctx.fillRect(i * barWidth, height - h, barWidth - 2, h);
        }
        animFrame = requestAnimationFrame(drawVisualizer);
    };

    if (visualizerCanvas) {
        visualizerCanvas.width = visualizerCanvas.offsetWidth;
        visualizerCanvas.height = visualizerCanvas.offsetHeight;
    }
};

// Handle DOMContentLoaded race condition for ES modules
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}