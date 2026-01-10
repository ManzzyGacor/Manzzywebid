// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public', // Sumber file ada di folder public
  build: {
    outDir: '../dist', // Hasil build simpan di folder dist (di luar public)
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Daftarkan semua file HTML kamu di sini
        main: resolve(__dirname, 'public/index.html'),
        admin: resolve(__dirname, 'public/admin.html'),
        login: resolve(__dirname, 'public/login.html'),
        login_user: resolve(__dirname, 'public/login_user.html'),
        manzzyid: resolve(__dirname, 'public/manzzyid.html'),
      },
    },
  },
});
