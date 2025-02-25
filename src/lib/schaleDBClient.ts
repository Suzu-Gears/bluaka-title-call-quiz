import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFileToR2 } from '@/lib/cloudflareR2Client'
import { doesFileExist, readLocalJSON, saveJSON } from '@/lib/fileOperations'
import type { Student, Students } from '@/lib/interfaces'
import { makeStudentsJson } from '@/lib/jsonUtils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const schaledbURL = 'https://schaledb.com/data/jp/students.json'
const schaledbFilePath = path.join(__dirname, '../../public/data/schaledb.json')
const audioFolderPath = path.join(__dirname, '../../public/audio')
const imageFolderPath = path.join(__dirname, '../../public/image')

let studentsDataCache: Students | null = null

export async function getStudentsData(): Promise<Students> {
  if (studentsDataCache !== null) {
    return Promise.resolve(studentsDataCache)
  }
  const data = await getSchaleDB()
  studentsDataCache = await makeStudentsJson(data)
  saveJSON(
    path.join(__dirname, '../../public/data/final.json'),
    studentsDataCache,
  )
  return studentsDataCache
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

export async function getMissingAudioBySchaledb(): Promise<void> {
  const data = await getStudentsData()
  let failedDownloads: string[] = []
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student: Student = data[key]
      const { Name: name, DevName: devname, PathName: pathname } = student
      const audioFileName = `${name}.mp3`
      const audioFilePath = path.join(audioFolderPath, audioFileName)

      if (!fs.existsSync(audioFilePath)) {
        const formattedDevName = devname.toLowerCase()
        let audioUrl = `https://r2.schaledb.com/voice/jp_${formattedDevName}/${formattedDevName}_title.mp3`
        try {
          await downloadFile(audioUrl, audioFilePath)
          console.log(
            `Downloaded ${formattedDevName}_title.mp3 as ${audioFileName}`,
          )
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await uploadFileToR2(audioFilePath, 'audio')
        } catch (err) {
          const error = err as Error
          console.error(`Failed to download ${audioUrl}: ${error.message}`)
          const formattedPathName = pathname.replace(/_/g, '').toLowerCase()
          audioUrl = `https://r2.schaledb.com/voice/jp_${formattedPathName}/${formattedPathName}_title.mp3`
          try {
            await downloadFile(audioUrl, audioFilePath)
            console.log(
              `Downloaded ${formattedPathName}_title.mp3 as ${audioFileName}`,
            )
            await new Promise((resolve) => setTimeout(resolve, 1000))
            await uploadFileToR2(audioFilePath, 'audio')
          } catch (err) {
            const error = err as Error
            console.error(`Failed to download ${audioUrl}: ${error.message}`)
            failedDownloads.push(audioFileName)
          }
        }
      } else {
        console.log(`File already exists, skipping: ${audioFileName}`)
      }
    }
  }
  if (failedDownloads.length > 0) {
    console.log('Failed to download audio files for the following students:')
    failedDownloads.forEach((audioFileName) => console.log(audioFileName))
  } else {
    console.log('All audio files downloaded successfully.')
  }
}

export async function getMissingImageBySchaledb(): Promise<void> {
  const data = await getStudentsData()
  let failedDownloads: string[] = []
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student: Student = data[key]
      const { Id: id, Name: name } = student
      const imageFileName = `${name}.webp`
      const imageFilePath = path.join(imageFolderPath, imageFileName)
      if (!fs.existsSync(imageFilePath)) {
        const imageUrl = `https://schaledb.com/images/student/collection/${id}.webp`
        try {
          await downloadFile(imageUrl, imageFilePath)
          console.log(`Downloaded ${id}.webp as ${imageFileName}`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await uploadFileToR2(imageFilePath, 'image')
        } catch (err) {
          const error = err as Error
          console.error(`Failed to download ${imageUrl}: ${error.message}`)
          failedDownloads.push(imageFileName)
        }
      } else {
        console.log(`File already exists, skipping: ${imageFileName}`)
      }
    }
  }
  if (failedDownloads.length > 0) {
    console.log('Failed to download image files for the following students:')
    failedDownloads.forEach((imageFileName) => console.log(imageFileName))
  } else {
    console.log('All image files downloaded successfully.')
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
