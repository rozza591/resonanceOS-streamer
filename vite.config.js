import { defineConfig } from 'vite';

export default defineConfig({
    root: 'public',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
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
        }
    }
});
