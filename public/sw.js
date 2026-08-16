/**
 * PWA(ホーム画面起動)専用の Service Worker。
 * main.ts が PWA モードかつ本番ビルドのときだけ登録する。
 *
 * 戦略はキャッシュ優先で統一する。オンラインで起動しても手元のバージョンの
 * まま動き、更新は設定画面のバッジ→「更新を適用」(SW解除+キャッシュ全削除)
 * でだけ反映される。version.json / cache-manifest.json は更新判定に使うため
 * 常に素通しする。
 *
 * インストール時にはアプリの起動に必要な最小セット(index.html・JS/CSS・
 * final.json)を先行キャッシュし、音声・画像は「すべてダウンロード」または
 * 再生時のランタイムキャッシュに任せる。
 * キャッシュ名は設定画面の「すべてダウンロード」(assetCache.ts)と共有する。
 */

const CACHE_NAME = 'bluaka-title-call-quiz-assets-v1'

/** キャッシュに触らず常にネットワークへ流すパス(末尾一致)。 */
const PASSTHROUGH_SUFFIXES = ['/version.json', '/cache-manifest.json', '/sw.js']

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

const scopeUrl = (path) => new URL(path, self.registration.scope).toString()

/** アプリの起動に必要な最小セットを先行キャッシュする。 */
const precacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(scopeUrl('index.html'), { cache: 'no-store' })
    if (response.ok) {
      await cache.put(scopeUrl('index.html'), await stripRedirect(response))
    }
  } catch {
    // 取れなくても登録自体は続ける(ランタイムキャッシュで補う)
  }
  try {
    const manifestResponse = await fetch(
      scopeUrl(`cache-manifest.json?t=${Date.now()}`),
      { cache: 'no-store' },
    )
    if (!manifestResponse.ok) {
      return
    }
    const manifest = await manifestResponse.json()
    const files = Array.isArray(manifest?.files) ? manifest.files : []
    const shellPaths = files
      .map((file) => file?.path)
      .filter(
        (path) =>
          typeof path === 'string' &&
          (path.startsWith('assets/') || path === 'data/final.json'),
      )
    await Promise.all(
      shellPaths.map(async (path) => {
        const url = scopeUrl(path)
        if (await cache.match(url)) {
          return
        }
        try {
          const response = await fetch(url)
          if (response.ok) {
            await cache.put(url, await stripRedirect(response))
          }
        } catch {
          // 個別の失敗は無視する
        }
      }),
    )
  } catch {
    // マニフェストが無い環境でも登録自体は続ける
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precacheAppShell()
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) {
    // 過去に保存したリダイレクト済みレスポンスにも備え、配信時にも包み直す
    return request.mode === 'navigate' ? stripRedirect(cached) : cached
  }
  try {
    const response = await fetch(request)
    if (response.ok) {
      void putInCache(cache, request, response.clone())
    }
    return response
  } catch (error) {
    // オフラインでの画面遷移(起動・リロード)はトップページのキャッシュで受ける
    if (request.mode === 'navigate') {
      const fallback = await cache.match(scopeUrl('index.html'))
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
  event.respondWith(cacheFirst(request))
})
