import type { AstroIntegration } from 'astro'
import fs from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'

const copyFiles = (src: string, dest: string) => {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyFiles(srcPath, destPath)
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
        console.log(`Copied ${srcPath} to ${destPath}`)
      }
    }
  }
}

export default (): AstroIntegration => ({
  name: 'publicQuizCopier',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const dirPath = fileURLToPath(dir)
      copyFiles('tmp', dirPath)
      console.log('Finished copying tmp files to build output directory!')
    },
  },
})
