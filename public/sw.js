/**
 * PWA(ホーム画面起動)専用の Service Worker。
 * main.ts が PWA モードかつ本番ビルドのときだけ登録する。
 *
 * 戦略:
 * - 音声・画像(audio/ image/): キャッシュ優先。ファイル名に世代番号が入っており
 *   同一 URL の中身は変わらないため、一度取れば再取得しない。
 * - それ以外(index.html, JS, CSS, data/ など): ネットワーク優先。オンライン時の
 *   鮮度を SW 導入前と変えないため。成功レスポンスはキャッシュへ控え、
 *   オフライン時はそこから返す。
 * - version.json / cache-manifest.json: 常に素通し(更新判定に使うため)。
 *
 * キャッシュ名は設定画面の「すべてダウンロード」(assetCache.ts)と共有する。
 * アップデート適用時は appUpdate.ts が SW 解除+キャッシュ全削除で仕切り直す。
 */

const CACHE_NAME = 'bluaka-title-call-quiz-assets-v1'

/** キャッシュに触らず常にネットワークへ流すパス(末尾一致)。 */
const PASSTHROUGH_SUFFIXES = ['/version.json', '/cache-manifest.json', '/sw.js']

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const isCacheFirstPath = (pathname) =>
  pathname.includes('/audio/') || pathname.includes('/image/')

/**
 * リダイレクトを経由したレスポンスはナビゲーションへそのまま返せない
 * (iOS Safari は "Response served by service worker has redirections" で
 * 起動を拒否する)。ボディを包み直してリダイレクト情報を落とす。
 */
const stripRedirect = async (response) => {
  if (!response.redirected) {
    return response
  }
  const body = await response.blob()
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

const putInCache = async (cache, request, response) => {
  try {
    await cache.put(request, await stripRedirect(response))
  } catch {
    // 保存に失敗しても配信は続ける
  }
}

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    void putInCache(cache, request, response.clone())
  }
  return response
}

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      void putInCache(cache, request, response.clone())
    }
    return response
  } catch (error) {
    // 過去に保存したリダイレクト済みレスポンスにも備え、配信時にも包み直す
    const cached = await cache.match(request)
    if (cached) {
      return stripRedirect(cached)
    }
    // オフラインでの画面遷移(リロード)はトップページのキャッシュで受ける
    if (request.mode === 'navigate') {
      const fallback = await cache.match(
        new URL('index.html', self.registration.scope).toString(),
      )
      if (fallback) {
        return stripRedirect(fallback)
      }
    }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }
  if (PASSTHROUGH_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix))) {
    return
  }
  event.respondWith(
    isCacheFirstPath(url.pathname) ? cacheFirst(request) : networkFirst(request),
  )
})
