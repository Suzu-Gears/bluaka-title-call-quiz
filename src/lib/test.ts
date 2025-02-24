import {
  convertToArray,
  getFilteredSchaleDB,
  getSchaleDB,
  type Student,
  type Students,
} from '@/lib/schaleDBClient'

async function loadAndExtractStudents() {
  const students_row: Students = await getFilteredSchaleDB()
  const students: Students = students_row as Students
  // studentsのkeyofを表示
  if (students.length > 0) {
    const studentKeys = Object.keys(students[0]) as (keyof Student)[]
    console.log('keyof students:', studentKeys)
  } else {
    console.log('students array is empty')
  }
}

loadAndExtractStudents()
