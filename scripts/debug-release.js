import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const html = fs.readFileSync('release/index.html', 'utf8')
const scriptStart = html.search(/<script(?: type="module")?(?: crossorigin)?>/)
const createRootIdx = html.indexOf('createRoot', scriptStart)
const scriptEnd = html.indexOf('</script>', createRootIdx) + 9
const code = html.slice(scriptStart, scriptEnd).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')

try {
  const acorn = require('acorn')
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' })
  console.log('syntax: OK', code.length)
} catch (error) {
  console.log('syntax error:', error.message)
  const line = Number(error.message.match(/line (\d+)/)?.[1] || 0)
  if (line) {
    const lines = code.split('\n')
    console.log('snippet:', lines[line - 1]?.slice(2640, 2700))
  }
}
