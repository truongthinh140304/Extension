import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import manifest from './manifest';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');
const outDir = resolve(rootDir, '..', 'dist');

const makeManifestPlugin = (): PluginOption => ({
  name: 'make-manifest',
  closeBundle() {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  },
});

export default defineConfig({
  publicDir: resolve(rootDir, 'public'),
  plugins: [makeManifestPlugin()],
  build: {
    lib: {
      name: 'BackgroundScript',
      fileName: () => 'background.js',
      formats: ['es'],
      entry: resolve(srcDir, 'background', 'index.ts'),
    },
    outDir,
    emptyOutDir: false,
    sourcemap: Boolean(process.env.CEB_DEV),
    minify: !process.env.CEB_DEV,
    rollupOptions: {
      external: ['chrome'],
    },
  },
});
