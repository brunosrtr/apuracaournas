import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORTA_API = Number(process.env.PORTA ?? 8787);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  // a Vercel define VERCEL=1 no build: só lá existe o script de analytics (/_vercel/insights)
  define: { __NA_VERCEL__: JSON.stringify(process.env.VERCEL === '1') },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api/': { target: `http://localhost:${PORTA_API}`, changeOrigin: true } },
  },
});
