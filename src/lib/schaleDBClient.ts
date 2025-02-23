import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { doesFileExist, readLocalJSON, saveJSON } from '@/lib/fileOperations'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const schaledbURL = 'https://schaledb.com/data/jp/students.json'
const schaledbFilePath = path.join(__dirname, '../../public/data/schaledb.json')

export async function convertToArray(
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return Object.values(data)
}

export async function getSchaleDB(): Promise<Record<string, any>> {
  if (
    !doesFileExist(
      path.dirname(schaledbFilePath),
      path.basename(schaledbFilePath),
    )
  ) {
    const data = await fetchSchaleDB()
    saveJSON(schaledbFilePath, data)
  }
  return readLocalJSON(schaledbFilePath)
}

async function fetchSchaleDB(): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    https
      .get(schaledbURL, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', async () => {
          try {
            const jsonData = JSON.parse(data)
            resolve(jsonData)
          } catch (err) {
            reject(err)
          }
        })
      })
      .on('error', (err) => {
        reject(err)
      })
  })
}
