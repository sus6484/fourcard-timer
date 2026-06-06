import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://<user>.github.io/fourcard-timer/
// Repo name이 다르면 아래 base 경로를 맞춰 주세요.
const repoName = 'fourcard-timer'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'ghpages' ? `/${repoName}/` : '/',
}))
