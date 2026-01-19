#!/usr/bin/env ts-node

// Load environment variables from .env file if it exists
import * as dotenv from 'dotenv'
import * as path from 'path'

// Try to load .env file from backend directory
const envPath = path.join(process.cwd(), '.env')
dotenv.config({ path: envPath })

// Set default environment variables if not configured
process.env.BUCKET_PROVIDER = process.env.BUCKET_PROVIDER || 'aws-s3'
process.env.BUCKET_NAME = process.env.BUCKET_NAME || 'exozen-prod-app-bucket-ap-south-1'
process.env.BUCKET_PUBLIC_READ = process.env.BUCKET_PUBLIC_READ || 'false'
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-south-1'

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { BucketService } from '../src/bucket/bucket.service'
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const bucketService = app.get(BucketService)
  const configService = app.get(ConfigService)

  const command = process.argv[2]

  switch (command) {
    case 'upload':
      await handleUpload(bucketService)
      break
    case 'download':
      await handleDownload(bucketService)
      break
    case 'delete':
      await handleDelete(bucketService)
      break
    case 'list':
      await handleList(bucketService)
      break
    case 'migrate':
      await handleMigrate(bucketService, configService)
      break
    case 'config':
      await handleConfig(bucketService)
      break
    default:
      console.log('Usage: bucket-utils.ts <command>')
      console.log('Commands:')
      console.log('  upload <local-file> [folder]    - Upload a file to bucket')
      console.log('  download <key> [local-path]    - Download a file from bucket')
      console.log('  delete <key>                   - Delete a file from bucket')
      console.log('  list [prefix]                  - List files in bucket')
      console.log('  migrate                        - Migrate local uploads to bucket')
      console.log('  config                         - Show bucket configuration')
      process.exit(1)
  }

  await app.close()
}

async function handleUpload(bucketService: BucketService) {
  const filePath = process.argv[3]
  const folder = process.argv[4] || ''

  if (!filePath) {
    console.error('Please provide a file path')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)
  const mimeType = getMimeType(fileName)

  const mockFile = {
    buffer: fileBuffer,
    originalname: fileName,
    mimetype: mimeType,
    size: fileBuffer.length,
  } as Express.Multer.File

  try {
    const result = await bucketService.uploadFile(mockFile, folder)
    console.log('Upload successful:')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Upload failed:', error.message)
    process.exit(1)
  }
}

async function handleDownload(bucketService: BucketService) {
  const key = process.argv[3]
  const localPath = process.argv[4] || key

  if (!key) {
    console.error('Please provide a key')
    process.exit(1)
  }

  try {
    // For download, we'd need to implement a download method in BucketService
    console.log(`Download functionality not yet implemented. Key: ${key}, Local path: ${localPath}`)
  } catch (error) {
    console.error('Download failed:', error.message)
    process.exit(1)
  }
}

async function handleDelete(bucketService: BucketService) {
  const key = process.argv[3]

  if (!key) {
    console.error('Please provide a key')
    process.exit(1)
  }

  try {
    await bucketService.deleteFile(key)
    console.log(`File deleted: ${key}`)
  } catch (error) {
    console.error('Delete failed:', error.message)
    process.exit(1)
  }
}

async function handleList(bucketService: BucketService) {
  const prefix = process.argv[3]

  try {
    const files = await bucketService.listFiles(prefix)
    console.log(`Files in bucket${prefix ? ` with prefix "${prefix}"` : ''}:`)
    files.forEach(file => {
      console.log(`- ${file.key} (${file.size || 'unknown'} bytes)`)
    })
  } catch (error) {
    console.error('List failed:', error.message)
    process.exit(1)
  }
}

async function handleMigrate(bucketService: BucketService, configService: ConfigService) {
  const uploadsDir = path.join(process.cwd(), 'uploads')

  if (!fs.existsSync(uploadsDir)) {
    console.error('Uploads directory not found')
    process.exit(1)
  }

  console.log('Starting migration of local files to bucket...')

  const migrateDirectory = async (dirPath: string, folder: string = '') => {
    const items = fs.readdirSync(dirPath)

    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        await migrateDirectory(itemPath, folder ? `${folder}/${item}` : item)
      } else if (stat.isFile()) {
        const fileBuffer = fs.readFileSync(itemPath)
        const mimeType = getMimeType(item)
        const relativePath = path.relative(uploadsDir, itemPath)

        const mockFile = {
          buffer: fileBuffer,
          originalname: item,
          mimetype: mimeType,
          size: fileBuffer.length,
        } as Express.Multer.File

        try {
          const result = await bucketService.uploadFile(mockFile, folder)
          console.log(`✓ Migrated: ${relativePath} -> ${result.key}`)
        } catch (error) {
          console.error(`✗ Failed to migrate: ${relativePath} - ${error.message}`)
        }
      }
    }
  }

  try {
    await migrateDirectory(uploadsDir)
    console.log('Migration completed!')
  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exit(1)
  }
}

async function handleConfig(bucketService: BucketService) {
  const config = bucketService.getConfig()
  console.log('Bucket Configuration:')
  console.log(JSON.stringify(config, null, 2))
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.xml': 'application/xml',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

bootstrap().catch(console.error)