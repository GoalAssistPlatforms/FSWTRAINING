
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
        server: {
            proxy: {
                '/api/gamma-assets': {
                    target: 'https://assets.api.gamma.app',
                    changeOrigin: true,
                    secure: false,
                    rewrite: (path) => path.replace(/^\/api\/gamma-assets/, '')
                },
                '/api/gamma': {
                    target: 'https://public-api.gamma.app/v1.0',
                    changeOrigin: true,
                    secure: false,
                    rewrite: (path) => path.replace(/^\/api\/gamma/, ''),
                    configure: (proxy, options) => {
                        proxy.on('proxyReq', (proxyReq, req, res) => {
                            if (env.GAMMA_API_KEY) {
                                proxyReq.setHeader('X-API-KEY', env.GAMMA_API_KEY);
                            }
                        });
                        proxy.on('error', (err, req, res) => {
                            console.error('Gamma Proxy Error:', err);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Proxy error', details: err.message }));
                        });
                    }
                }
            }
        }
    };
});
