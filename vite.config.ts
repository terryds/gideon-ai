import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'client'),
    base: env.VITE_BASE_PATH || '/',
    build: {
      outDir: path.resolve(__dirname, 'dist/client'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});
