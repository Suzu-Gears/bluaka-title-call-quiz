import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'

const schaledbURL = 'https://schaledb.com/data/jp/students.json'
const schaledbFilePath = path.join(__dirname, '../../public/data/schaledb.json')

let schaledbCache: Record<string, any> | null = null

export async function getSchaleDB(): Promise<Record<string, any>> {
  if (schaledbCache !== null) {
    return Promise.resolve(schaledbCache)
  }
  return fetchSchaleDB()
}

async function fetchSchaleDB(): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    https
      .get(schaledbURL, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data)
            schaledbCache = jsonData
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

async function updateSchaleDB(): Promise<void> {
  const newSchaleDB = await fetchSchaleDB()
  let existingSchaleDB: Record<string, any> | null = null

  if (fs.existsSync(schaledbFilePath)) {
    const fileData = fs.readFileSync(schaledbFilePath, 'utf-8')
    existingSchaleDB = JSON.parse(fileData)
  }

  if (
    !existingSchaleDB ||
    JSON.stringify(existingSchaleDB) !== JSON.stringify(newSchaleDB)
  ) {
    fs.writeFileSync(
      schaledbFilePath,
      JSON.stringify(newSchaleDB, null, 2),
      'utf-8',
    )
  }
}
