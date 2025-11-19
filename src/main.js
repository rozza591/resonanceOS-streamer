// Main entry point for Vite bundler
import './style.css';
import { socket } from './socket.js';
import tidalPlayer from './tidal-player.js';
import mpdPlayer from './mpd-player.js';

// Import the original app.js logic (will be refactored incrementally)
// For now, we'll keep most logic inline and gradually modularize

console.log('[Main] Initializing ResonanceOS Streamer...');

// Fetch config from server
async function initializeApp() {
    try {
        // Get Tidal client ID from server
        const configRes = await fetch('/api/config');
        const config = await configRes.json();

        // Initialize Tidal SDK
        if (config.tidalClientId) {
            await tidalPlayer.initialize({ clientId: config.tidalClientId });
            console.log('[Main] Tidal SDK initialized');
        }

        // Make players globally available for now (will refactor later)
        window.tidalPlayer = tidalPlayer;
        window.mpdPlayer = mpdPlayer;
        window.socket = socket;

        console.log('[Main] App initialized successfully');
    } catch (error) {
        console.error('[Main] Initialization failed:', error);
    }
}

// Start initialization
initializeApp();

// NOTE: The full app.js logic needs to be imported here
// For now, we'll keep the existing app.js and load it separately
// This allows us to get Vite working while incrementally refactoring
