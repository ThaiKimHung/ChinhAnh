import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Set BASE_PATH (e.g. "/ChinhAnh/") when the app is served from a sub-path such as GitHub Pages.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
});
