import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFileToR2 } from '@/lib/cloudflareR2Client'
import { doesFileExist, readLocalJSON, saveJSON } from '@/lib/fileOperations'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const schaledbURL = 'https://schaledb.com/data/jp/students.json'
const schaledbFilePath = path.join(__dirname, '../../public/data/schaledb.json')
const audioFolderPath = path.join(__dirname, '../../public/audio')
const imageFolderPath = path.join(__dirname, '../../public/image')

export type Students = Student[]

export interface Student {
  DefaultOrder: number
  Id: number
  Name: string
  PathName: string
  DevName: string
  StarGrade: number
  FamilyName: string
  FamilyNameRuby: string
  PersonalName: string
  PersonalNameRuby: string
  CharacterVoice: string
  School: string
  SchoolYear: string
  CharacterAge: string
  Birthday: string
  BirthDay: string
  CharHeightMetric: string
}

function filterStudentData(data: Record<string, any>): Students {
  // dataが配列でない場合、配列に変換
  const dataArray = Array.isArray(data) ? data : Object.values(data)

  return dataArray as Students
}

export async function getFilteredSchaleDB(): Promise<Students> {
  const data = await getSchaleDB()
  const filteredData = filterStudentData(data)
  return filteredData
}

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

export async function getMissingImageBySchaledb() {
  const data = await getSchaleDB()
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student: Student = data[key]
      const { Id: id, Name: name } = student
      const imageFileName = `${name}.webp`
      const imageFilePath = path.join(imageFolderPath, imageFileName)

      if (!fs.existsSync(imageFilePath)) {
        const imageUrl = `https://schaledb.com/images/student/collection/${id}.webp`
        await downloadFile(imageUrl, imageFilePath)
        console.log(`Downloaded ${id}.webp as ${imageFileName}`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await uploadFileToR2(imageFilePath, 'image')
      } else {
        console.log(`File already exists, skipping: ${imageFileName}`)
      }
    }
  }
}

async function downloadFile(url: string, localPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const file = fs.createWriteStream(localPath)
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close()
          fs.unlink(localPath, () =>
            reject(
              new Error(`Failed to get '${url}' (${response.statusCode})`),
            ),
          )
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close((err) => {
            if (err) {
              reject(err)
              return
            }
            resolve()
          })
        })
      })
      .on('error', (err) => {
        fs.unlink(localPath, () => reject(err))
      })
  })
}
