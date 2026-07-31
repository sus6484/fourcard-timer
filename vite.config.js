import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const repoName = 'fourcard-timer'

/**
 * 빌드 시각 스탬프.
 * content hash가 같아도(변경 없는 chunk) 파일명이 빌드마다 바뀌어
 * Smart TV / CDN 강력 캐시가 옛 JS를 붙잡지 못하게 한다.
 */
const BUILD_ID = `${Date.now().toString(36)}`

function htmlCacheBustPlugin(buildId) {
  return {
    name: 'fourcard-html-cache-bust',
    transformIndexHtml(html) {
      const metas = `
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="fourcard-build" content="${buildId}" />`

      let next = html.replace(/<head>/i, `<head>${metas}`)

      // module/script·css URL에 빌드 쿼리를 붙여 브라우저 캐시 키를 분리
      next = next.replace(
        /(<(?:script|link)\b[^>]*\b(?:src|href)=")([^"]+)(")/gi,
        (match, pre, url, post) => {
          if (/^(https?:|data:|\/\/)/i.test(url)) return match
          if (/fonts\.googleapis|fonts\.gstatic/i.test(url)) return match
          const sep = url.includes('?') ? '&' : '?'
          return `${pre}${url}${sep}v=${buildId}${post}`
        },
      )

      const boot = `<script>
(function () {
  var id = ${JSON.stringify(buildId)};
  window.__FOURCARD_BUILD__ = id;
  try {
    var key = 'fourcard-build-id';
    var prev = localStorage.getItem(key);
    if (prev && prev !== id && window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (name) { caches.delete(name); });
      }).catch(function () {});
    }
    localStorage.setItem(key, id);
  } catch (e) {}
})();
</script>`

      next = next.replace(/<\/head>/i, `${boot}</head>`)
      return next
    },
  }
}

export default defineConfig(({ mode }) => {
  const isFile = mode === 'file'

  return {
    plugins: [
      react(),
      htmlCacheBustPlugin(BUILD_ID),
      ...(isFile ? [viteSingleFile()] : []),
    ],
    define: {
      'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(BUILD_ID),
    },
    base: isFile ? './' : '/',
    preview: {
      host: '127.0.0.1',
      port: 4173,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    },
    build: {
      ...(isFile
        ? {
            outDir: 'release',
            emptyOutDir: true,
            assetsInlineLimit: 100000000,
          }
        : {
            // GitHub Pages / Smart TV: 해시 + 빌드 스탬프로 파일명 강제 변경
            rollupOptions: {
              output: {
                entryFileNames: `assets/[name]-[hash]-${BUILD_ID}.js`,
                chunkFileNames: `assets/[name]-[hash]-${BUILD_ID}.js`,
                assetFileNames: `assets/[name]-[hash]-${BUILD_ID}[extname]`,
              },
            },
          }),
    },
  }
})
