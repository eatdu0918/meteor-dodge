import { defineConfig } from 'vite';

/** 인방모 프론트 public/game-embeds/meteor-dodge/ 에 배포 */
export default defineConfig({
  base: '/game-embeds/meteor-dodge/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
