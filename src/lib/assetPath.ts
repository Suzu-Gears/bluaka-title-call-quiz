const normalizeBasePath = (basePath: string): string => {
  if (!basePath) {
    return '/'
  }
  return basePath.endsWith('/') ? basePath : `${basePath}/`
}

export const resolveAssetUrl = (assetPath: string): string => {
  const basePath = normalizeBasePath(import.meta.env.BASE_URL ?? '/')
  const normalizedPath = assetPath.replace(/^\/+/, '')
  return `${basePath}${normalizedPath}`
}
