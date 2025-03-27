import { deleteR2Folder } from '@/lib/cloudflareR2Client'

await deleteR2Folder('quiz')
  .then(() => {
    console.log('Quiz cache deleted successfully.')
  })
  .catch((error) => {
    console.error('Error deleting quiz cache:', error)
  })
