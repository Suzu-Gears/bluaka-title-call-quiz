import type { AstroIntegration } from 'astro'

import { downloadR2Folder } from '../lib/downloadR2Folder'

export default (): AstroIntegration => ({
  name: 'r2-downloader',
  hooks: {
    'astro:build:start': async () => {
      console.log('Downloading R2 folders...')

      await Promise.all([
        downloadR2Folder('audio', 'public/audio'),
        downloadR2Folder('image', 'public/image'),
        downloadR2Folder('quiz', 'public'),
      ])

      console.log('Download completed for R2 folders')
    },
  },
})
