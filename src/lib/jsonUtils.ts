import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getSchaleDB } from '@/lib/schaleDBClient'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataFolderPath = path.join(__dirname, '../../public/data')

type Students = Student[]

interface Student {
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
  Costume?: string
  NameSortOrder?: number
}

function removeDuplicates(students: Students): Students {
  const uniqueStudentsJsonFilePath = path.join(
    dataFolderPath,
    'uniqueStudents.json',
  )
  const sortedStudents = students.sort(
    (a, b) => a.DefaultOrder - b.DefaultOrder,
  )
  const uniqueStudents: Students = []
  const seenNames = new Set<string>()

  for (const student of sortedStudents) {
    if (!seenNames.has(student.Name)) {
      uniqueStudents.push(student)
      seenNames.add(student.Name)
    }
  }
  fs.writeFileSync(
    uniqueStudentsJsonFilePath,
    JSON.stringify(uniqueStudents, null, 2),
  )
  return uniqueStudents
}

function extractProperties(data: any): Students {
  const extractJsonFilePath = path.join(dataFolderPath, 'extract.json')
  const result: Students = []
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student = data[key]
      const {
        DefaultOrder,
        Id,
        Name,
        PathName,
        DevName,
        StarGrade,
        FamilyName,
        FamilyNameRuby,
        PersonalName,
        PersonalNameRuby,
        CharacterVoice,
        School,
        SchoolYear,
        CharacterAge,
        Birthday,
        BirthDay,
        CharHeightMetric,
      } = student
      const costumeMatch = Name.match(/（[^）]+）/)
      const Costume = costumeMatch ? costumeMatch[0].slice(1, -1) : ''
      result.push({
        DefaultOrder,
        Id,
        Name,
        PathName,
        DevName,
        StarGrade,
        FamilyName,
        FamilyNameRuby,
        PersonalName,
        PersonalNameRuby,
        CharacterVoice,
        School,
        SchoolYear,
        CharacterAge,
        Birthday,
        BirthDay,
        CharHeightMetric,
        Costume,
      })
    }
  }
  fs.writeFileSync(extractJsonFilePath, JSON.stringify(result, null, 2))
  return result
}

function jsonToCsv(data: Students, filePath: string): void {
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map((student) => Object.values(student).join(','))
  const csvContent = [headers, ...rows].join('\n')
  fs.writeFileSync(filePath, csvContent)
  console.log(`Extracted and saved ${filePath}`)
}

export async function main() {
  const data = await getSchaleDB()
  const sortedData = extractProperties(data)
  const removeDuplicateData = removeDuplicates(sortedData)

  console.log(removeDuplicateData)

  // CostumeをDefaultOrder昇順で並び替えてコンソールに表示
  const sortedByDefaultOrder = sortedData.sort(
    (a, b) => a.DefaultOrder - b.DefaultOrder,
  )

  const seenCostumes = new Set<string>()
  sortedByDefaultOrder.forEach((item) => {
    if (item.Costume && !seenCostumes.has(item.Costume)) {
      console.log(
        `DefaultOrder: ${item.DefaultOrder}, Costume: ${item.Costume}`,
      )
      seenCostumes.add(item.Costume)
    }
  })

  const sortCsvFilePath = path.join(dataFolderPath, 'sort.csv')
  jsonToCsv(sortedByDefaultOrder, sortCsvFilePath)
}
