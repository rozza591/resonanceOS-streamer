// Tidal SDK Player Integration
import * as auth from '@tidal-music/auth';
import { setCredentialsProvider } from '@tidal-music/player-web-components';

class TidalPlayer {
    constructor() {
        this.authModule = null;
        this.isInitialized = false;
        this.isAuthenticated = false;
        this.playerElement = null;
    }

    async initialize(config) {
        try {
            console.log('[Tidal Player] Initializing with client ID:', config.clientId);

            // Initialize auth module
            this.authModule = await auth.init({
                clientId: config.clientId,
                clientUniqueKey: 'resonance-streamer',
                credentialsStorageKey: 'tidal-credentials',
                scopes: ['playback'],
            });

            // Try to get token from backend
            try {
                const res = await fetch('/api/auth/token');
                if (res.ok) {
                    const data = await res.json();
                    if (data.token) {
                        console.log('[Tidal Player] Received token from backend');
                        await setCredentialsProvider(async () => ({
                            token: data.token,
                            clientSecret: '',
                        }));
                        this.isAuthenticated = true;
                        return true;
                    }
                }
            } catch (e) {
                console.warn('[Tidal Player] Could not fetch backend token:', e);
            }

            // Fallback: Check if already authenticated via client-side storage
            const credentials = await this.authModule.getCredentials();
            if (credentials && credentials.token) {
                this.isAuthenticated = true;
                console.log('[Tidal Player] Authenticated via client storage');
                await setCredentialsProvider(async () => ({
                    token: credentials.token,
                    clientSecret: '',
                }));
            }

            this.isInitialized = true;
            return this.isAuthenticated;
        } catch (error) {
            console.error('[Tidal Player] Initialization failed:', error);
            return false;
        }
    }

    async play(trackId) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated with Tidal');
        }

        try {
            console.log('[Tidal Player] Playing track:', trackId);

            // Stop MPD if playing
            if (window.mpdPlayer) {
                window.mpdPlayer.pause();
            }

            // Get or create the player element
            this.ensurePlayerElement();

            // Load and play the track
            this.playerElement.productId = trackId;
            await this.playerElement.play();

            // Dispatch metadata event (simulated for now, ideally get from SDK/API)
            // In a real app, we'd fetch track info here to populate the UI immediately
            this.dispatchState('play', trackId);

            return true;
        } catch (error) {
            console.error('[Tidal Player] Playback failed:', error);
            throw error;
        }
    }

    ensurePlayerElement() {
        if (!this.playerElement) {
            this.playerElement = document.querySelector('tidal-player');
            if (!this.playerElement) {
                this.playerElement = document.createElement('tidal-player');
                this.playerElement.id = 'tidal-player-component';
                const container = document.getElementById('tidal-player-container') || document.body;
                container.appendChild(this.playerElement);

                // Add event listeners to the component
                this.playerElement.addEventListener('timeupdate', (e) => {
                    this.dispatchTimeUpdate(e.detail.currentTime, e.detail.duration);
                });
                this.playerElement.addEventListener('ended', () => {
                    this.dispatchState('ended');
                });
                this.playerElement.addEventListener('pause', () => {
                    this.dispatchState('pause');
                });
                this.playerElement.addEventListener('playing', () => {
                    this.dispatchState('playing');
                });
            }
        }
        return this.playerElement;
    }

    async pause() {
        if (this.playerElement) {
            await this.playerElement.pause();
            this.dispatchState('pause');
        }
    }

    async resume() {
        if (this.playerElement) {
            await this.playerElement.play();
            this.dispatchState('playing');
        }
    }

    dispatchState(state, data = null) {
        const event = new CustomEvent('tidal:state', {
            detail: { state, data }
        });
        window.dispatchEvent(event);
    }

    dispatchTimeUpdate(current, duration) {
        const event = new CustomEvent('tidal:time', {
            detail: { current, duration }
        });
        window.dispatchEvent(event);
    }

    getAuthUrl(redirectUri) {
        if (!this.authModule) {
            throw new Error('Auth module not initialized');
        }

        // Generate OAuth URL for user login
        return this.authModule.getLoginUrl({ redirectUri });
    }
}

const tidalPlayer = new TidalPlayer();
export default tidalPlayer;
