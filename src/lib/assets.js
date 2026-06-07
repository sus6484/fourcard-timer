export function assetPath(relativePath) {
  const path = relativePath.replace(/^\//, '')
  return `${import.meta.env.BASE_URL}${path}`
}
