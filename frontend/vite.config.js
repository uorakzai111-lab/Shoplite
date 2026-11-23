import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only used by `npm run dev` (running without Docker).
// It mimics what nginx does in the container: strip the /api/<service> prefix
// and forward to the backend. In Docker, nginx does this job instead.
const backend = (target, prefix) => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
});

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/catalog': backend('http://localhost:3000', '/api/catalog'),
      '/api/inventory': backend('http://localhost:8081', '/api/inventory'),
      '/api/orders': backend('http://localhost:8082', '/api/orders'),
    },
  },
});
