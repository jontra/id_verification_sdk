import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run demo` runs from the project root, so the demo dir is relative to cwd.
export default defineConfig({
  root: 'demo',
  plugins: [react()],
  server: { open: true },
});
