import webmanifest from 'astro-webmanifest';
import { defineConfig } from 'astro/config';
import serviceWorker from 'astrojs-service-worker';

import PublicQuizCopier from './src/integrations/publicQuizCopier.ts';
import { BASE_PATH, CUSTOM_DOMAIN } from './src/server-constants';

const getSite = function () {
  if (CUSTOM_DOMAIN) {
    return new URL(BASE_PATH, `https://${CUSTOM_DOMAIN}`).toString();
  }

  if (process.env.CF_PAGES) {
    if (process.env.CF_PAGES_BRANCH !== 'production') {
      return new URL(BASE_PATH, process.env.CF_PAGES_URL).toString();
    }

    return new URL(
      BASE_PATH,
      `https://${process.env.CF_PAGES_URL ? new URL(process.env.CF_PAGES_URL).host.split('.').slice(1).join('.') : ''}`,
    ).toString();
  }

  return new URL(BASE_PATH, 'http://localhost:4321').toString();
};

export default defineConfig({
  site: getSite(),
  base: BASE_PATH,
  devToolbar: {
    enabled: false,
  },
  integrations: [
    PublicQuizCopier(),
    serviceWorker(),
    webmanifest({
      name: 'ブルーアーカイブ タイトルコールクイズ',
      short_name: 'タイトルコール',
      description: 'ブルーアーカイブのタイトルコールクイズ',
      display: 'standalone',
      icons: [
        {
          src: '/icon-192.png',
          type: 'image/png',
          sizes: '192x192',
        },
        {
          src: '/icon-mask.png',
          type: 'image/png',
          sizes: '512x512',
          purpose: 'maskable',
        },
        {
          src: '/icon-512.png',
          type: 'image/png',
          sizes: '512x512',
        },
      ],
    }),
  ],
});
