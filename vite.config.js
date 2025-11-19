import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'esnext',
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
            },
            '/api': 'http://localhost:3000',
            '/auth': 'http://localhost:3000',
            '/upload': 'http://localhost:3000',
            '/covers': 'http://localhost:3000',
            '/music': 'http://localhost:3000',
        }
    }
});
