import { defineConfig } from 'vite';

// For LIFF, you'll typically expose the dev server via an HTTPS tunnel (ngrok/cloudflared).
// To avoid mixed-content issues, keep API calls same-origin and proxy /liff/* to a backend.
const proxyTarget = process.env.LIFF_PROXY_TARGET || 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,

    // When accessing Vite via a reverse proxy domain (e.g. nginx), Vite may block unknown hosts.
    // Add your proxy domain(s) here.
    allowedHosts: ['honeypie.zgovend.com'],

    proxy: {
      '/liff': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
