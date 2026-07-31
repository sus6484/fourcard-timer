/**
 * Smart TV / 브라우저 강력 캐시를 뚫고 문서를 다시 받는다.
 * GitHub Pages CDN은 ?query를 무시할 수 있지만, TV 디스크 캐시는 전체 URL을 키로 쓰는 경우가 많다.
 */
export async function clearAppCaches() {
  if (typeof window === 'undefined' || !window.caches?.keys) return
  try {
    const keys = await window.caches.keys()
    await Promise.all(keys.map((name) => window.caches.delete(name)))
  } catch {
    // ignore
  }
}

export async function hardReloadToLatest({ reason = 'manual' } = {}) {
  await clearAppCaches()

  try {
    const url = new URL(window.location.href)
    url.searchParams.set('_', String(Date.now()))
    url.searchParams.set(
      'b',
      String(window.__FOURCARD_BUILD__ || import.meta.env.VITE_APP_BUILD_ID || Date.now()),
    )
    url.searchParams.set('r', String(reason))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
