import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

export const watchOption = process.env.CEB_DEV
  ? {
      chokidar: {
        awaitWriteFinish: true,
      },
    }
  : undefined;

export const withPageConfig = (config: UserConfig) =>
  defineConfig({
    base: '',
    plugins: [react(), ...(config.plugins ?? [])],
    ...config,
    build: {
      sourcemap: Boolean(process.env.CEB_DEV),
      minify: !process.env.CEB_DEV,
      emptyOutDir: true,
      watch: watchOption,
      ...(config.build ?? {}),
      rollupOptions: {
        external: ['chrome'],
        ...(config.build?.rollupOptions ?? {}),
      },
    },
  });
