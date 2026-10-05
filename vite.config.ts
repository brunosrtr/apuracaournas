import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORTA_API = Number(process.env.PORTA ?? 8787);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api/': { target: `http://localhost:${PORTA_API}`, changeOrigin: true } },
  },
});
