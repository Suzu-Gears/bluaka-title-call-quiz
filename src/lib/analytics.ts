/**
 * Google アナリティクス (gtag)。ビルド時の VITE_GA_TRACKING_ID が
 * 設定されているときだけ読み込む。未設定ならなにもしない。
 */
export function setupAnalytics(): void {
  const trackingId = import.meta.env?.VITE_GA_TRACKING_ID?.trim()
  if (!trackingId) {
    return
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(trackingId)}`
  document.head.appendChild(script)

  const w = window as unknown as {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer = w.dataLayer ?? []
  w.gtag = function gtag() {
    // gtag.js は配列ではなく arguments オブジェクトそのものを期待する。
    w.dataLayer?.push(arguments)
  }
  w.gtag('js', new Date())
  w.gtag('config', trackingId)
}
