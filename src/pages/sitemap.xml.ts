import { getStaticPaths } from '@/pages/[slug].astro'
import type { APIRoute } from 'astro'

const staticPaths = await getStaticPaths()

type SitemapItem = {
  loc: string
  lastmod: Date
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function generateSitemap(items: SitemapItem[]) {
  const itemsStr = items
    .map(
      ({ loc, lastmod }) =>
        `<url><loc>${loc}</loc><lastmod>${formatDate(lastmod)}</lastmod></url>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${itemsStr}
  </urlset>
`
}

export const GET: APIRoute = async ({ site }) => {
  const items: SitemapItem[] = staticPaths.map(({ params }) => ({
    loc: new URL(params.slug, site).href,
    lastmod: new Date(
      new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
    ),
  }))

  const sitemap = generateSitemap(items)

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'text/xml',
    },
  })
}
