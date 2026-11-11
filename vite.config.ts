import { defineConfig } from 'vite';

// base './' so the built game also loads from disk inside Electron (file://).
export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true },
});
