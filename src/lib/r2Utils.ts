import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  createReadStream,
  createWriteStream,
  ensureDir,
  readdir,
  stat,
  unlink,
} from 'fs-extra'
import { join } from 'node:path'

// Initialize S3 client
const s3 = new S3Client({
  region: '<YOUR_REGION>',
  credentials: {
    accessKeyId: '<YOUR_ACCESS_KEY_ID>',
    secretAccessKey: '<YOUR_SECRET_ACCESS_KEY>',
  },
})

// Function to get the current timestamp
function getCurrentTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:\-T]/g, '')
    .split('.')[0]
}

// Function to upload a single file with timestamp
async function uploadFile(
  bucketName: string,
  filePath: string,
  destinationFileName: string,
) {
  const timestamp = getCurrentTimestamp()
  const destinationFileNameWithTimestamp = `${timestamp}_${destinationFileName}`
  const fileStream = createReadStream(filePath)

  const uploadParams = {
    Bucket: bucketName,
    Key: destinationFileNameWithTimestamp,
    Body: fileStream,
  }

  const uploadResult = await s3.send(new PutObjectCommand(uploadParams))
  console.log(`Uploaded ${filePath} as ${destinationFileNameWithTimestamp}`)
  return uploadResult
}

// Function to download a single file
async function downloadFile(
  bucketName: string,
  objectKey: string,
  destinationPath: string,
) {
  const downloadParams = {
    Bucket: bucketName,
    Key: objectKey,
  }

  const { Body } = await s3.send(new GetObjectCommand(downloadParams))
  const fileStream = createWriteStream(destinationPath)
  Body.pipe(fileStream)
  console.log(`Downloaded ${objectKey} to ${destinationPath}`)
}

// Function to delete a single file
async function deleteFile(bucketName: string, objectKey: string) {
  const deleteParams = {
    Bucket: bucketName,
    Key: objectKey,
  }

  await s3.send(new DeleteObjectCommand(deleteParams))
  console.log(`Deleted ${objectKey}`)
}

// Function to upload a directory recursively
async function uploadDirectory(
  bucketName: string,
  directoryPath: string,
  destinationPath: string,
) {
  const files = await readdir(directoryPath)
  for (const file of files) {
    const fullPath = join(directoryPath, file)
    const fileStat = await stat(fullPath)
    if (fileStat.isDirectory()) {
      await uploadDirectory(bucketName, fullPath, join(destinationPath, file))
    } else {
      await uploadFile(bucketName, fullPath, join(destinationPath, file))
    }
  }
}

// Function to download a directory recursively
async function downloadDirectory(
  bucketName: string,
  bucketPath: string,
  localPath: string,
) {
  const listParams = {
    Bucket: bucketName,
    Prefix: bucketPath,
  }

  const { Contents } = await s3.send(new ListObjectsV2Command(listParams))
  for (const object of Contents) {
    const relativePath = object.Key.replace(bucketPath, '')
    const destinationPath = join(localPath, relativePath)
    await ensureDir(join(destinationPath, '..'))
    await downloadFile(bucketName, object.Key, destinationPath)
  }
}

// Function to delete a directory recursively
async function deleteDirectory(bucketName: string, bucketPath: string) {
  const listParams = {
    Bucket: bucketName,
    Prefix: bucketPath,
  }

  const { Contents } = await s3.send(new ListObjectsV2Command(listParams))
  for (const object of Contents) {
    await deleteFile(bucketName, object.Key)
  }
}

// Example usage
;(async () => {
  const bucketName = '<YOUR_BUCKET_NAME>'

  // Upload a single file
  await uploadFile(bucketName, '/path/to/file', 'destination_file_name.ext')

  // Download a single file
  await downloadFile(
    bucketName,
    'destination_file_name.ext',
    '/path/to/downloaded_file',
  )

  // Upload a directory
  await uploadDirectory(bucketName, '/path/to/images', 'images')
  await uploadDirectory(bucketName, '/path/to/audio', 'audio')

  // Download a directory
  await downloadDirectory(bucketName, 'images', '/path/to/downloaded_images')
  await downloadDirectory(bucketName, 'audio', '/path/to/downloaded_audio')

  // Delete a single file
  await deleteFile(bucketName, 'destination_file_name.ext')

  // Delete a directory
  await deleteDirectory(bucketName, 'images')
  await deleteDirectory(bucketName, 'audio')
})()
