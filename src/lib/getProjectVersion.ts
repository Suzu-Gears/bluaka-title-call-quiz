import appRoot from 'app-root-path'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = appRoot.path

let versionCache: string | null = null

export async function getProjectVersion(): Promise<string> {
  if (versionCache !== null) {
    return Promise.resolve(versionCache)
  }

  const packageJsonPath = path.resolve(projectRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  versionCache = packageJson.version

  return versionCache || 'Version not found'
}
