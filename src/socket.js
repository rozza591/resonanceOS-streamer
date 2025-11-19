// Socket.io connection module
import { io } from 'socket.io-client';

export const socket = io({
    path: '/socket.io/',
    transports: ['websocket', 'polling']
});

// Export socket events for use in other modules
export function onConnect(callback) {
    socket.on('connect', callback);
}

export function onDisconnect(callback) {
    socket.on('disconnect', callback);
}

export function emit(event, data) {
    socket.emit(event, data);
}

export function on(event, callback) {
    socket.on(event, callback);
}
