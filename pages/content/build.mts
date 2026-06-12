import { resolve } from 'node:path';
import { build } from 'vite';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

await build(
  withPageConfig({
    resolve: {
      alias: {
        '@src': srcDir,
      },
    },
    build: {
      lib: {
        name: 'MondayBoardAssistantContent',
        formats: ['iife'],
        entry: resolve(srcDir, 'index.ts'),
        fileName: () => 'index.iife.js',
      },
      outDir: resolve(rootDir, '..', '..', 'dist', 'content'),
      emptyOutDir: true,
    },
  }),
);
