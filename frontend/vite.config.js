const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@chakra-ui/react'],
  },
  server: {
    host: 'repairhero.localhost',
    port: 5173,
    // Proxy API + media to Django so dev is single-origin like production
    // (nginx). This lets <img> tags load authenticated photos with the session
    // cookie (cross-origin <img> requests drop it), and makes relative API
    // paths work. Set VITE_API_BASE empty in .env.local to route through here.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
});
