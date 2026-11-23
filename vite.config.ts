import { defineConfig } from 'vitest/config';

const here = (f: string) => decodeURIComponent(new URL(f, import.meta.url).pathname);

export default defineConfig({
  base: '/ground-truth/',
  server: { port: 8800, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: here('./index.html'),
        teacher: here('./teacher.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
