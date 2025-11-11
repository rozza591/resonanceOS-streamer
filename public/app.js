document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Connect to Socket.io ---
    const socket = io();

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
    const visualizer = document.querySelector('.visualizer');
    
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
    
    // Library Modal Selectors
    const btnOpenLibrary = document.getElementById('btn-open-library');
    const btnCloseLibrary = document.getElementById('btn-close-library');
    const librarySpinner = document.getElementById('library-spinner');
    const libraryBackBtn = document.getElementById('library-back-btn');
    const libraryTitle = document.getElementById('library-title');
    const librarySearch = document.getElementById('library-search');
    const libraryViewArtists = document.getElementById('library-view-artists');
    const libraryViewAlbums = document.getElementById('library-view-albums');
    const libraryViewTracks = document.getElementById('library-view-tracks');

    // Library Album Info Selectors
    const libraryAlbumInfo = document.getElementById('library-album-info');
    const libraryAlbumArt = document.getElementById('library-album-art');
    const libraryAlbumTitle = document.getElementById('library-album-title');
    const libraryAlbumArtist = document.getElementById('library-album-artist');
    const libraryAlbumYear = document.getElementById('library-album-year');
    const libraryAlbumDescription = document.getElementById('library-album-description');
    const btnFetchMetadata = document.getElementById('btn-fetch-metadata');
    
    // Settings Modal
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

    // Reboot Modal
    const rebootConfirmModal = document.getElementById('reboot-confirm-modal');
    const btnCloseRebootConfirm = document.getElementById('btn-close-reboot-confirm');
    const btnCancelReboot = document.getElementById('btn-cancel-reboot');
    const btnConfirmReboot = document.getElementById('btn-confirm-reboot');

    // Upload Modal
    const uploadModal = document.getElementById('upload-modal');
    const btnOpenUpload = document.getElementById('btn-open-upload');
    const btnCloseUpload = document.getElementById('btn-close-upload');
    const uploadForm = document.getElementById('upload-form');
    const uploadDropZone = document.querySelector('.upload-drop-zone');
    const musicFilesInput = document.getElementById('music-files-input');
    const fileListItems = document.getElementById('file-list-items');
    const fileListSpinner = document.getElementById('file-list-spinner');
    const defaultArtistInput = document.getElementById('default-artist');
    const defaultAlbumInput = document.getElementById('default-album');
    const btnClearFiles = document.getElementById('btn-clear-files');
    const btnSubmitUpload = document.getElementById('btn-submit-upload');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBarInner = document.querySelector('.progress-bar-inner');
    const progressBarText = document.querySelector('.progress-bar-text');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');
    
    // --- 3. Client-Side State ---
    
    let isSeeking = false; 

    let modalLoadState = {
        systemInfo: false,
        outputs: false
    };
    
    let playerTimer = null;     
    let lastStatusTime = 0;     
    let lastStatusElapsed = 0;  
    let lastStatusDuration = 0;
    let lastKnownSong = null;
    let isSwitchingOutput = false;
    
    let filesToUpload = [];

    // Library navigation state
    let currentLibraryView = 'artists';
    let currentArtist = null;
    let currentAlbum = null;

    // Path utility function
    const path = {
        basename: (filePath) => {
            if (!filePath) return '';
            return filePath.split('/').pop().split('.').slice(0, -1).join('.');
        }
    };

    const checkSettingsSpinner = () => {
        if (modalLoadState.systemInfo && modalLoadState.outputs) {
            settingsSpinner.classList.add('hidden');
        }
    };
    
    // --- 4. Helper Functions ---
    
    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    const openModal = (modal) => {
        modal.classList.remove('hidden');
        if (modal === libraryModal) {
            librarySpinner.classList.remove('hidden');
            showLibraryView('artists'); 
            librarySearch.value = ''; 
        }
        if (modal === settingsModal) {
            settingsSpinner.classList.remove('hidden');
            modalLoadState.systemInfo = false;
            modalLoadState.outputs = false;
        }
    }
    const closeModal = (modal) => {
        modal.classList.add('hidden');
        if (modal === uploadModal) {
            resetUploadForm();
        }
    }
    
    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 3500);
    };
    
    const stopPlayerTimer = () => {
        if (playerTimer) {
            clearInterval(playerTimer);
            playerTimer = null;
        }
    };

    const startPlayerTimer = () => {
        stopPlayerTimer(); // Clear any existing timer

        playerTimer = setInterval(() => {
            if (isSeeking) return; // Don't update if user is dragging

            // Calculate new elapsed time based on time passed since last sync
            const timeDiff = (Date.now() - lastStatusTime) / 1000;
            let localElapsed = lastStatusElapsed + timeDiff;

            if (localElapsed > lastStatusDuration) {
                localElapsed = lastStatusDuration;
                stopPlayerTimer(); // Stop timer when song ends
            }
            
            // Update the UI
            seekSlider.value = localElapsed;
            timeCurrent.textContent = formatTime(localElapsed);
        }, 500); // Update twice a second
    };

    // --- 5. Modal Event Listeners ---
    
    // Library Modal Listeners
    btnOpenLibrary.addEventListener('click', () => {
        openModal(libraryModal);
        socket.emit('getArtists'); 
    });
    btnCloseLibrary.addEventListener('click', () => closeModal(libraryModal));

    libraryBackBtn.addEventListener('click', () => {
        librarySearch.value = ''; 
        if (currentLibraryView === 'tracks') {
            showLibraryView('albums', currentArtist);
            socket.emit('getAlbums', currentArtist); 
        } else if (currentLibraryView === 'albums') {
            showLibraryView('artists');
            socket.emit('getArtists'); 
        }
    });
    
    // Settings Modal Listeners
    btnOpenSettings.addEventListener('click', () => {
        openModal(settingsModal);
        socket.emit('getSystemInfo'); 
        socket.emit('getOutputs'); 
    });
    btnCloseSettings.addEventListener('click', () => closeModal(settingsModal));

    // Upload Modal Listeners
    btnOpenUpload.addEventListener('click', () => openModal(uploadModal));
    btnCloseUpload.addEventListener('click', () => closeModal(uploadModal));

    // Reboot Modal Listeners
    btnCloseRebootConfirm.addEventListener('click', () => closeModal(rebootConfirmModal));
    btnCancelReboot.addEventListener('click', () => closeModal(rebootConfirmModal));

    // Global Modal Close Listener
    [libraryModal, settingsModal, rebootConfirmModal, uploadModal].forEach(modal => { 
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // --- 6. Player Event Listeners ---
    
    btnPlayPause.addEventListener('click', () => {
        const isPlaying = btnPlayPause.classList.contains('playing');
        socket.emit(isPlaying ? 'pause' : 'play');
    });
    
    btnNext.addEventListener('click', () => socket.emit('next'));
    btnPrev.addEventListener('click', () => socket.emit('previous'));
        
    seekSlider.addEventListener('input', () => { 
        isSeeking = true; 
        timeCurrent.textContent = formatTime(seekSlider.value); 
    });
    seekSlider.addEventListener('change', () => {
        socket.emit('seek', parseFloat(seekSlider.value));
        isSeeking = false;
        stopPlayerTimer(); // Stop timer, server will send a fresh status
    });

    // --- 7. Settings Event Listeners ---

    btnRescan.addEventListener('click', () => {
        socket.emit('rescanLibrary');
        btnRescan.disabled = true;
        btnRescan.textContent = 'Scanning...';
        showToast('Library rescan started.', 'info');
    });
    btnReboot.addEventListener('click', () => {
        openModal(rebootConfirmModal);
    });
    btnConfirmReboot.addEventListener('click', () => {
        socket.emit('rebootPi');
        btnConfirmReboot.disabled = true;
        btnConfirmReboot.textContent = 'Rebooting...';
        closeModal(rebootConfirmModal);
        closeModal(settingsModal);
        showToast('Reboot command sent.', 'info');
        setTimeout(() => {
            btnConfirmReboot.disabled = false;
            btnConfirmReboot.textContent = 'Confirm Reboot';
        }, 10000); 
    });

    // --- 8. File & Upload Logic ---
    
    const allowedExtensions = ['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.opus'];

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadDropZone.addEventListener(eventName, () => {
            uploadDropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadDropZone.addEventListener(eventName, () => {
            uploadDropZone.classList.remove('dragover');
        }, false);
    });

    uploadDropZone.addEventListener('drop', (e) => {
        handleFiles(e.dataTransfer.files);
    });

    musicFilesInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    const handleFiles = async (files) => {
        fileListSpinner.classList.remove('hidden');
        let validFiles = [];
        
        for (const file of files) {
            const dotIndex = file.name.lastIndexOf('.');
            const ext = (dotIndex > -1) ? file.name.substring(dotIndex).toLowerCase() : '';

            if (!allowedExtensions.includes(ext)) {
                showToast(`File type not allowed: ${file.name}`, 'error');
                continue; 
            }

            let artist = '';
            let album = '';
            
            try {
                const metadata = await window.musicMetadata.parseBlob(file);
                artist = metadata.common.albumartist || metadata.common.artist || '';
                album = metadata.common.album || '';
            } catch (error) {
                console.warn(`Could not read metadata for ${file.name}: ${error.message}`);
            }
            
            validFiles.push({
                fileObject: file,
                artist: artist,
                album: album
            });
        }
        
        filesToUpload = [...filesToUpload, ...validFiles];
        fileListSpinner.classList.add('hidden');
        updateFileListUI();
    };

    const updateFileListUI = () => {
        fileListItems.innerHTML = '';
        if (filesToUpload.length === 0) {
            btnSubmitUpload.disabled = true;
            return;
        }

        const defaultArtist = defaultArtistInput.value;
        const defaultAlbum = defaultAlbumInput.value;

        filesToUpload.forEach((fileData, index) => {
            const li = document.createElement('div');
            li.className = 'upload-file-item';
            
            const artist = fileData.artist || defaultArtist;
            const album = fileData.album || defaultAlbum;
            
            fileData.artist = artist;
            fileData.album = album;

            li.innerHTML = `
                <span class="file-name">${fileData.fileObject.name}</span>
                <div class="file-meta-input-group">
                    <div class="file-meta-input">
                        <label for="artist-${index}">Artist</label>
                        <input type="text" id="artist-${index}" data-index="${index}" data-field="artist" value="${artist}">
                    </div>
                    <div class="file-meta-input">
                        <label for="album-${index}">Album</label>
                        <input type="text" id="album-${index}" data-index="${index}" data-field="album" value="${album}">
                    </div>
                </div>
            `;
            fileListItems.appendChild(li);
        });
        
        btnSubmitUpload.disabled = false;
    };

    fileListItems.addEventListener('input', (e) => {
        if (e.target.dataset.index) {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            filesToUpload[index][field] = e.target.value;
        }
    });

    defaultArtistInput.addEventListener('change', updateFileListUI);
    defaultAlbumInput.addEventListener('change', updateFileListUI);

    const resetUploadForm = () => {
        filesToUpload = [];
        uploadForm.reset();
        fileListItems.innerHTML = '';
        progressBarContainer.classList.add('hidden');
        progressBarInner.style.width = '0%';
        progressBarText.textContent = 'Uploading... 0%';
        btnSubmitUpload.disabled = true;
    };

    btnClearFiles.addEventListener('click', resetUploadForm);

    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        uploadFiles();
    });

    const uploadFiles = () => {
        if (filesToUpload.length === 0) {
            showToast('Please select files to upload.', 'error');
            return;
        }

        const formData = new FormData();
        filesToUpload.forEach(fileData => {
            const artist = fileData.artist || 'Unknown Artist';
            const album = fileData.album || 'Unknown Album';
            const file = fileData.fileObject;
            
            const serverRule = /[^a-zA-Z0-9._-]/g;
            const safeArtist = artist.replace(serverRule, '_').trim() || "Unknown_Artist";
            const safeAlbum = album.replace(serverRule, '_').trim() || "Unknown_Album";
            
            const path = `${safeArtist}/${safeAlbum}/${file.name}`;
            
            formData.append('musicFiles', file, path);
        });

        progressBarContainer.classList.remove('hidden');
        btnSubmitUpload.disabled = true;
        btnSubmitUpload.textContent = 'Uploading...';
        btnClearFiles.disabled = true;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBarInner.style.width = `${percent}%`;
                progressBarText.textContent = `Uploading... ${percent}%`;
            }
        };

        xhr.onerror = () => {
            showToast('Upload failed. Network error.', 'error');
            resetUploadForm();
            btnClearFiles.disabled = false;
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showToast(`Upload complete (${response.results.success} files).`, 'success');
                socket.emit('rescanLibrary');
                showToast('Library rescan started.', 'info');
                closeModal(uploadModal);
            } else {
                try {
                    const response = JSON.parse(xhr.responseText);
                    showToast(`Upload error: ${response.error || 'Server error.'}`, 'error');
                } catch {
                    showToast(`Upload failed. Server error (Status ${xhr.status}).`, 'error');
                }
            }
            resetUploadForm();
            btnClearFiles.disabled = false;
        };

        xhr.send(formData);
    };

    btnSubmitUpload.disabled = true;
    
    // --- 9. Socket.io Event Handlers ---
    
    socket.on('connect', () => {
        statusLight.classList.add('connected');
        statusText.textContent = 'System Ready';
        statusTooltip.textContent = 'Connected to Server via WebSocket';
        socket.emit('getStatus');
        socket.emit('getOutputs');
        
        socket.emit('getSystemInfo');
        setInterval(() => {
            socket.emit('getSystemInfo');
        }, 5000); 
    });
    
    socket.on('disconnect', () => {
        statusLight.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        statusTooltip.textContent = 'Lost connection to Server/MPD';
        stopPlayerTimer(); 
    });

    socket.on('error', (error) => {
        statusText.textContent = `Error: ${error.message}`;
        statusTooltip.textContent = `Error: ${error.message}`;
        console.error('Server Error:', error.message);
        showToast(error.message, 'error');
    });

    // --- THIS IS THE FIXED FUNCTION ---
    socket.on('statusUpdate', ({ status, currentSong }) => {
        if (!status) return;

        // Store status for timer
        lastStatusTime = Date.now();
        lastStatusElapsed = parseFloat(status.elapsed || 0);
        lastStatusDuration = parseFloat(status.duration || 0);
        lastKnownSong = currentSong; // Store for latency calculation
        
        if (status.state === 'play') {
            btnPlayPause.classList.add('playing');
            visualizer.classList.add('playing');
            startPlayerTimer(); // <-- FIX: This starts the progress bar

            // Set format from currentSong
            if (currentSong && currentSong.file) {
                techFormat.textContent = currentSong.file.split('.').pop().toUpperCase();
            } else {
                techFormat.textContent = '--';
            }

            // Read from status.audio (the reliable source)
            if (status.audio) {
                const [sampleRate, bitDepth, channels] = status.audio.split(':');
                techSamplerate.textContent = `${(parseInt(sampleRate) / 1000).toFixed(0)}kHz`;
                techBitdepth.textContent = `${bitDepth}-bit`;
            } else {
                // Fallback if status.audio is missing
                techSamplerate.textContent = '-- kHz';
                techBitdepth.textContent = '-- bit';
            }
            
            // Update buffer and latency stats
            const bufferSize = status.buffer ? status.buffer.split(':')[0] : '...'; // Get buffer from status
            statBuffer.textContent = `Buffer: ${bufferSize}`;
            
            let latencyMs = '--';
            if (status.audio) {
                const sampleRate = parseInt(status.audio.split(':')[0]);
                if (!isNaN(sampleRate) && sampleRate > 0) {
                    latencyMs = ((parseInt(bufferSize) / sampleRate) * 1000).toFixed(1);
                }
            }
            statLatency.textContent = `Latency: ${latencyMs}ms`;

        } else {
            // Player is paused or stopped
            btnPlayPause.classList.remove('playing');
            visualizer.classList.remove('playing');
            stopPlayerTimer(); // <-- FIX: This stops the progress bar
            
            // Clear all tech info
            techFormat.textContent = '--';
            techSamplerate.textContent = '-- kHz';
            techBitdepth.textContent = '-- bit';

            // Clear stats when stopped
            statBuffer.textContent = `Buffer: --`;
            statLatency.textContent = `Latency: --ms`;
        }
        
        if (!isSeeking) {
            seekSlider.value = lastStatusElapsed;
            seekSlider.max = lastStatusDuration;
            timeCurrent.textContent = formatTime(lastStatusElapsed);
            timeDuration.textContent = formatTime(lastStatusDuration);
        }
        
        let playerState = 'Idle';
        if (status.state === 'play') {
            playerState = `Playing @ ${status.bitrate || '--'} kbps`;
        } else if (status.state === 'pause') {
            playerState = 'Paused';
        }
        const currentDevice = deviceName.textContent;
        statusTooltip.textContent = `Output: ${currentDevice} | Player: ${playerState}`;

        // Update song info
        if (currentSong && currentSong.file) {
            playerTitle.textContent = currentSong.title || path.basename(currentSong.file);
            playerArtist.textContent = currentSong.artist || 'Unknown Artist';
            playerAlbum.textContent = currentSong.album || 'Unknown Album';
            
            const artPath = `/music/${currentSong.file.substring(0, currentSong.file.lastIndexOf('/'))}/cover.jpg`;
            if (albumArt.src.endsWith(artPath) === false) {
                albumArt.src = artPath;
            }
        } else {
            // No song loaded
            playerTitle.textContent = 'No Track Playing';
            playerArtist.textContent = 'Unknown Artist';
            playerAlbum.textContent = 'Unknown Album';
            albumArt.src = ''; 
        }
    });
    // --- END OF FIXED FUNCTION ---


    socket.on('libraryUpdated', () => {
        showToast('Library scan complete.', 'success');
        btnRescan.disabled = false;
        btnRescan.textContent = 'Rescan Library';
        if (!libraryModal.classList.contains('hidden')) {
            if (currentLibraryView === 'artists') {
                socket.emit('getArtists');
            } else if (currentLibraryView === 'albums') {
                socket.emit('getAlbums', currentArtist);
            } else if (currentLibraryView === 'tracks') {
                socket.emit('getSongs', { artist: currentArtist, album: currentAlbum });
            }
        }
    });

    // --- Library Handlers ---

    const showLibraryView = (view, title = 'Library') => {
        currentLibraryView = view;
        libraryTitle.textContent = title;
        librarySearch.value = '';
        
        libraryViewArtists.classList.add('hidden');
        libraryViewAlbums.classList.add('hidden');
        libraryViewTracks.classList.add('hidden');
        libraryAlbumInfo.classList.add('hidden');
        
        if (view === 'artists') {
            libraryViewArtists.classList.remove('hidden');
            libraryBackBtn.classList.add('hidden');
        } else if (view === 'albums') {
            libraryViewAlbums.classList.remove('hidden');
            libraryBackBtn.classList.remove('hidden');
        } else if (view === 'tracks') {
            libraryViewTracks.classList.remove('hidden');
            libraryBackBtn.classList.remove('hidden');
        }
    };

    librarySearch.addEventListener('input', () => {
        const filterText = librarySearch.value.toLowerCase();
        let itemsToFilter;
        
        if (currentLibraryView === 'artists') {
            itemsToFilter = libraryViewArtists.querySelectorAll('.artist-item');
        } else if (currentLibraryView === 'albums') {
            itemsToFilter = libraryViewAlbums.querySelectorAll('.album-item');
        } else if (currentLibraryView === 'tracks') {
            itemsToFilter = libraryViewTracks.querySelectorAll('.library-track');
        }
        
        if (itemsToFilter) {
            itemsToFilter.forEach(item => {
                const itemText = item.textContent.toLowerCase();
                item.style.display = itemText.includes(filterText) ? '' : 'none';
            });
        }
    });

    socket.on('artistList', (artists) => {
        libraryViewArtists.innerHTML = '';
        if (!artists || artists.length === 0) {
            libraryViewArtists.innerHTML = '<span>No artists found.</span>';
        } else {
            artists.forEach(artistName => {
                const item = document.createElement('div');
                item.className = 'artist-item';
                item.innerHTML = `
                    <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234a4a4a'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>" alt="Artist">
                    <span>${artistName}</span>
                `;
                item.addEventListener('click', () => {
                    currentArtist = artistName;
                    showLibraryView('albums', artistName);
                    librarySpinner.classList.remove('hidden');
                    socket.emit('getAlbums', artistName);
                });
                libraryViewArtists.appendChild(item);
            });
        }
        librarySpinner.classList.add('hidden');
    });

    socket.on('albumList', ({ artist, albums }) => {
        libraryViewAlbums.innerHTML = '';
        if (!albums || albums.length === 0) {
            libraryViewAlbums.innerHTML = `<span>No albums found for ${artist}.</span>`;
        } else {
            albums.forEach(albumName => {
                const item = document.createElement('div');
                item.className = 'album-item';
                item.innerHTML = `
                    <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234a4a4a'><path d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/></svg>" alt="Album">
                    <span>${albumName}</span>
                `;
                item.addEventListener('click', () => {
                    currentAlbum = albumName;
                    showLibraryView('tracks', albumName);
                    librarySpinner.classList.remove('hidden');
                    socket.emit('getSongs', { artist: currentArtist, album: currentAlbum });
                });
                libraryViewAlbums.appendChild(item);
            });
        }
        librarySpinner.classList.add('hidden');
    });

    socket.on('songList', ({ album, songs, metadata }) => {
        libraryViewTracks.innerHTML = '';

        // 1. Populate Album Info Box
        libraryAlbumTitle.textContent = album;
        libraryAlbumArtist.textContent = currentArtist; 
        
        if (metadata) {
            libraryAlbumYear.textContent = metadata.year || '';
            libraryAlbumDescription.textContent = metadata.description || 'No description available.';
            libraryAlbumYear.classList.toggle('hidden', !metadata.year);
            libraryAlbumDescription.classList.toggle('hidden', !metadata.description);
        } else {
            libraryAlbumYear.classList.add('hidden');
            libraryAlbumDescription.textContent = 'No online metadata found. Click "Get Online Info" to search.';
        }
        
        // 2. Populate track list
        if (!songs || songs.length === 0) {
            libraryViewTracks.innerHTML = `<li class="library-track" style="cursor: default;">No songs found for ${album}.</li>`;
        } else {
            const artPath = `/music/${songs[0].file.substring(0, songs[0].file.lastIndexOf('/'))}/cover.jpg`;
            libraryAlbumArt.src = artPath;
            
            songs.forEach(track => {
                const li = document.createElement('li');
                li.className = 'library-track';
                li.innerHTML = `
                    <img src="${artPath}" alt="Art" class="track-art" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24' fill=\'%234a4a4a\'><path d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/></svg>'">
                    <div class="track-info">
                        <div class="track-title">${track.title || path.basename(track.file)}</div>
                        <div class="track-artist">${track.artist || 'Unknown Artist'}</div>
                    </div>
                    <span class="track-format">${track.file.split('.').pop().toUpperCase()}</span>
                    <span class="track-samplerate">${track.audio ? (parseInt(track.audio.split(':')[0]) / 1000).toFixed(0) : '--'}kHz</span>
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
        }
        
        libraryAlbumInfo.classList.remove('hidden');
        librarySpinner.classList.add('hidden');
    });

    btnFetchMetadata.addEventListener('click', () => {
        showToast('Fetching online metadata...', 'info');
        btnFetchMetadata.disabled = true;
        btnFetchMetadata.textContent = 'Fetching...';
        socket.emit('fetchMetadata', { artist: currentArtist, album: currentAlbum });
    });

    socket.on('metadataFetched', () => {
        showToast('Metadata updated!', 'success');
        btnFetchMetadata.disabled = false;
        btnFetchMetadata.textContent = 'Get Online Info';
        socket.emit('getSongs', { artist: currentArtist, album: currentAlbum });
    });


    // --- Other Socket Handlers ---
    
    socket.on('outputsList', (outputs) => {
        outputsList.innerHTML = '';
        if (!outputs || outputs.length === 0) {
            outputsList.innerHTML = '<span>No audio outputs found.</span>';
        } else {
            outputs.forEach(output => {
                const isConnected = output.outputenabled === '1';
                const item = document.createElement('div');
                item.className = `device-item ${isConnected ? 'connected' : ''}`;
                item.dataset.outputId = output.outputid;
                item.innerHTML = `
                    <div class="device-info">
                        <span class="device-name">${output.outputname}</span>
                        <span class="device-type">DAC</span>
                    </div>
                    <span class="device-status ${isConnected ? 'connected' : 'available'}">
                        ${isConnected ? 'Connected' : 'Available'}
                    </span>
                `;
                
                item.addEventListener('click', () => {
                    showToast(`Switching to ${output.outputname}...`, 'info');
                    deviceName.textContent = output.outputname;
                    isSwitchingOutput = true; 
                    
                    socket.emit('switchOutput', {
                        outputId: output.outputid,
                        enabled: !isConnected
                    });
                });

                outputsList.appendChild(item);

                if (isConnected) {
                    deviceName.textContent = output.outputname;
                }
            });
        }
        modalLoadState.outputs = true; 
        checkSettingsSpinner();

        if (isSwitchingOutput) {
            showToast('Audio output switched.', 'success');
            isSwitchingOutput = false;
        }
    });

    socket.on('systemInfo', (info) => {
        sysOs.textContent = info.osVersion || '--';
        sysKernel.textContent = info.kernel || '--';
        sysAudio.textContent = info.audioServer || '--';
        sysCpu.textContent = info.cpuLoad || '--';
        
        // Add the '%' sign here, where it belongs.
        statCpu.textContent = `CPU: ${info.cpuLoad || '--'}%`;
        
        modalLoadState.systemInfo = true; 
        checkSettingsSpinner(); 
    });
});
