import type { APIRoute } from 'astro'

const getRobotsTxt = () => `User-agent: *
Allow: /
Disallow: /image/
Disallow: /audio/
`

export const GET: APIRoute = () => {
  return new Response(getRobotsTxt())
}
