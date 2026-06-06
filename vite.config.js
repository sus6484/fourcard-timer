import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = 'fourcard-timer'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ghpages' ? `/${repoName}/` : '/',
}))
