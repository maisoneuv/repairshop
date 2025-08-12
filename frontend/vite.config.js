const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@chakra-ui/react'],
  },
  server: {
    host: 'repairhero.localhost',
    port: 5173
  }
});
