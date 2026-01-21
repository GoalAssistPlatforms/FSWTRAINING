
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/api/gamma': {
                target: 'https://public-api.gamma.app/v1.0',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/gamma/, ''),
                secure: false
            }
        }
    }
});
