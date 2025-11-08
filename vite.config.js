import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

// Get git commit hash
let version = 'unknown';
try {
  version = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (err) {
  console.warn('Could not get git commit hash, using "unknown"');
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    'import.meta.env.VITE_VERSION': JSON.stringify(version)
  }
});
