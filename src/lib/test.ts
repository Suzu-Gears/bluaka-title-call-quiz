import { uploadFolderToR2 } from './cloudflareR2Client'

const localFolderPath = 'public/rand10'
const bucketFolder = 'quiz'

try {
  await uploadFolderToR2(localFolderPath, bucketFolder)
  console.log('Folder uploaded successfully.')
} catch (error) {
  console.error('Error uploading folder:', error)
}
