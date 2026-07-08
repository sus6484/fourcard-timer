import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const repoName = 'fourcard-timer'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'file' ? [viteSingleFile()] : [])],
  base: mode === 'file' ? './' : '/',
  preview: {
    host: '127.0.0.1',
    port: 4173,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  },
  build:
    mode === 'file'
      ? {
          outDir: 'release',
          emptyOutDir: true,
          assetsInlineLimit: 100000000,
        }
      : undefined,
}))
