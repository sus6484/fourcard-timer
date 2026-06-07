import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const repoName = 'fourcard-timer'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'file' ? [viteSingleFile()] : [])],
  base: mode === 'ghpages' ? `/${repoName}/` : mode === 'file' ? './' : '/',
  build:
    mode === 'file'
      ? {
          outDir: 'release',
          emptyOutDir: true,
          assetsInlineLimit: 100000000,
        }
      : undefined,
}))
