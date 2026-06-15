import { resolve } from 'node:path';
import { build } from 'vite';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');
const outDir = resolve(rootDir, '..', '..', 'dist', 'content');

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
      outDir,
      emptyOutDir: true,
    },
  }),
);

await build(
  withPageConfig({
    resolve: {
      alias: {
        '@src': srcDir,
      },
    },
    build: {
      lib: {
        name: 'MondayBoardAssistantMainWorldInterceptor',
        formats: ['iife'],
        entry: resolve(srcDir, 'mainWorldInterceptor.ts'),
        fileName: () => 'main-world.iife.js',
      },
      outDir,
      emptyOutDir: false,
    },
  }),
);
