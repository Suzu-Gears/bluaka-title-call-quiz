import appRoot from 'app-root-path'
import fs from 'node:fs'
import path from 'node:path'

import type { Students } from '@/lib/interfaces'

const projectRoot = appRoot.path
const dataFolderPath = path.join(projectRoot, 'public/data')

export async function makeStudentsJson(
  data: Record<string, any>,
): Promise<Students> {
  let processingData = convertToArray(data)
  processingData = extractProperties(processingData)
  processingData = removeDuplicates(processingData)
  processingData = addCostumeProperty(processingData)
  processingData = addNameSortOrder(processingData)
  processingData = addCollaborationProperty(processingData)

  const result = processingData
  const sortCsvFilePath = path.join(dataFolderPath, 'final.csv')
  await jsonToCsv(result, sortCsvFilePath)

  return result
}

function convertToArray(data: Record<string, any>): Students {
  const dataArray = Array.isArray(data) ? data : Object.values(data)
  return dataArray as Students
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

function addNameSortOrder(students: Students): Students {
  // 名前から全角括弧とその中身を除去する関数
  const extractName = (name: string): string => {
    return name.replace(/（[^）]+）/g, '').trim()
  }

  // extractNameを使って並び替え
  const sortedStudents = students.sort((a, b) => {
    const nameA = extractName(a.Name)
    const nameB = extractName(b.Name)
    if (nameA === nameB) {
      return a.DefaultOrder - b.DefaultOrder
    }
    return nameA.localeCompare(nameB, 'ja')
  })

  // NameSortOrderを追加
  sortedStudents.forEach((student, index) => {
    student.NameSortOrder = index + 1
  })

  return sortedStudents
}

function addCostumeProperty(students: Students): Students {
  return students.map((student) => {
    const costumeMatch = student.Name.match(/（[^）]+）/)
    const costume = costumeMatch ? costumeMatch[0].slice(1, -1) : ''
    return {
      ...student,
      Costume: costume,
    }
  })
}

function addCollaborationProperty(students: Students): Students {
  return students.map((student) => ({
    ...student,
    IsCollaboration: /^CH9\d{3}/.test(student.DevName),
  }))
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
  const bom = '\uFEFF'
  fs.writeFileSync(filePath, bom + csvContent)
  console.log(`Extracted and saved ${filePath}`)
}
