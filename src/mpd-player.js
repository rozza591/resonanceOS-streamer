// MPD Player Module
import { socket } from './socket.js';

class MPDPlayer {
    constructor() {
        this.currentSong = null;
        this.isPlaying = false;
    }

    play(uri, clear = false) {
        console.log('[MPD Player] Playing:', uri);

        // Pause Tidal if playing
        if (window.tidalPlayer) {
            window.tidalPlayer.pause();
        }

        socket.emit('playTrack', { uri, clear, service: 'local' });
    }

    pause() {
        socket.emit('pause');
    }

    resume() {
        socket.emit('resume');
    }

    next() {
        socket.emit('next');
    }

    previous() {
        socket.emit('previous');
    }

    seek(position) {
        socket.emit('seek', position);
    }

    setVolume(volume) {
        socket.emit('setVolume', volume);
    }
}

const mpdPlayer = new MPDPlayer();
export default mpdPlayer;
