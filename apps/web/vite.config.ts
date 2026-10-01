import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const here = path.dirname(fileURLToPath(import.meta.url));
// Output of `pnpm compile` (compact compile) in the contract package.
const managed = path.resolve(here, '..', '..', 'packages', 'contract', 'src', 'managed', 'cft');

export default defineConfig({
  // Set VITE_BASE=/<repo>/ when hosting under a sub-path (GitHub project pages).
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // The Midnight ledger ships as an ES-module WASM import.
    wasm(),
    // Prover / verifier keys and ZKIR are served at /contract/cft/{keys,zkir}
    // so FetchZkConfigProvider (and the wallet's prover) can fetch them.
    viteStaticCopy({
      targets: [
        { src: path.join(managed, 'keys'), dest: 'contract/cft' },
        { src: path.join(managed, 'zkir'), dest: 'contract/cft' },
      ],
    }),
  ],
  define: { global: 'globalThis' },
  resolve: {
    // Node builtins a few transitive Midnight.js dependencies still import.
    alias: { buffer: 'buffer', events: 'events', assert: 'assert' },
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: {
    fs: { allow: [path.resolve(here, '..', '..')] },
  },
});
