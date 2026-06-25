import fs from 'fs'
import path from 'path'

const file = path.resolve('release/index.html')
let html = fs.readFileSync(file, 'utf8')

// release 빌드에는 루트 index.html의 file:// 리다이렉트가 필요 없음
html = html.replace(/\s*<script>\s*if \(location\.protocol === 'file:'[\s\S]*?<\/script>/g, '')

const scriptStart = html.search(/<script(?: type="module")?(?: crossorigin)?>/)
const createRootIdx = html.indexOf('createRoot', scriptStart)
const scriptEnd = html.indexOf('</script>', createRootIdx) + '</script>'.length

if (scriptStart === -1 || createRootIdx === -1 || scriptEnd <= scriptStart) {
  console.error('patch-file-build: app script not found')
  process.exit(1)
}

let appScript = html.slice(scriptStart, scriptEnd)
  .replace(/<script type="module"( crossorigin)?>/, '<script>')
  .replace(/<script crossorigin>/, '<script>')

html = html.slice(0, scriptStart) + html.slice(scriptEnd)

const rootMarker = '<div id="root"></div>'
if (!html.includes(rootMarker)) {
  console.error('patch-file-build: #root not found')
  process.exit(1)
}

const buildStamp = new Date().toISOString()
const fileRedirectScript = `<script>
(function () {
  if (location.protocol !== 'file:') return
  var server = 'http://127.0.0.1:4173/'
  fetch(server, { method: 'HEAD', mode: 'no-cors' })
    .then(function () { location.replace(server + '?t=' + Date.now()) })
    .catch(function () {})
})()
</script>`

const rootIdx = html.indexOf(rootMarker)
html = `${html.slice(0, rootIdx + rootMarker.length)}
  <meta name="fourcard-build" content="${buildStamp}" />
  ${fileRedirectScript}
  ${appScript}${html.slice(rootIdx + rootMarker.length)}`

fs.writeFileSync(file, html)
console.log(`Patched release/index.html (${buildStamp})`)
