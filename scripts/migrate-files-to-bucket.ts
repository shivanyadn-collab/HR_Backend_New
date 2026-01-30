#!/usr/bin/env ts-node

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
import { PrismaService } from '../src/prisma/prisma.service'
import * as fs from 'fs'
import { extname } from 'path'

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const bucketService = app.get(BucketService)
  const prismaService = app.get(PrismaService)

  console.log('Starting migration of existing files to bucket storage...')

  try {
    // Migrate project documents
    await migrateProjectDocuments(bucketService, prismaService)

    // Migrate face images
    await migrateFaceImages(bucketService, prismaService)

    // Migrate tax documents
    await migrateTaxDocuments(bucketService, prismaService)

    // Migrate employee documents
    await migrateEmployeeDocuments(bucketService, prismaService)

    // Migrate profile photos
    await migrateProfilePhotos(bucketService, prismaService)

    // Migrate company logos
    await migrateCompanyLogos(bucketService, prismaService)

    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exit(1)
  }

  await app.close()
}

async function migrateProjectDocuments(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating project documents...')

  const documents = await prismaService.projectDocument.findMany({
    where: {
      fileUrl: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${documents.length} project documents to migrate`)

  for (const doc of documents) {
    try {
      const localPath = path.join(process.cwd(), doc.fileUrl)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      const uploadResult = await bucketService.uploadFile(mockFile, 'project-documents')

      // Update database with new URL and key
      await prismaService.projectDocument.update({
        where: { id: doc.id },
        data: {
          fileUrl: uploadResult.url,
          fileKey: uploadResult.key,
        } as any,
      })

      console.log(`✓ Migrated project document: ${doc.fileName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate project document ${doc.fileName}:`, error.message)
    }
  }
}

async function migrateFaceImages(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating face images...')

  const images = await prismaService.faceImage.findMany({
    where: {
      imageUrl: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${images.length} face images to migrate`)

  for (const image of images) {
    try {
      const localPath = path.join(process.cwd(), image.imageUrl)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      const uploadResult = await bucketService.uploadFile(mockFile, 'face-images')

      // Update database with new URL and key
      await prismaService.faceImage.update({
        where: { id: image.id },
        data: {
          imageUrl: uploadResult.url,
          imageKey: uploadResult.key,
        } as any,
      })

      console.log(`✓ Migrated face image: ${image.imageName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate face image ${image.imageName}:`, error.message)
    }
  }
}

async function migrateTaxDocuments(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating tax documents...')

  const taxDocuments = await prismaService.taxDocument.findMany({
    where: {
      fileUrl: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${taxDocuments.length} tax documents to migrate`)

  for (const doc of taxDocuments) {
    try {
      const localPath = path.join(process.cwd(), doc.fileUrl)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      const uploadResult = await bucketService.uploadFile(mockFile, 'tax-documents')

      // Update database with new URL and key
      await prismaService.taxDocument.update({
        where: { id: doc.id },
        data: {
          fileUrl: uploadResult.url,
          fileKey: uploadResult.key,
        } as any,
      })

      console.log(`✓ Migrated tax document: ${doc.documentName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate tax document ${doc.documentName}:`, error.message)
    }
  }
}

async function migrateEmployeeDocuments(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating employee documents...')

  const employeeDocuments = await prismaService.employeeDocument.findMany({
    where: {
      fileUrl: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${employeeDocuments.length} employee documents to migrate`)

  for (const doc of employeeDocuments) {
    try {
      const localPath = path.join(process.cwd(), doc.fileUrl)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      const uploadResult = await bucketService.uploadFile(mockFile, 'employee-documents')

      // Update database with new URL and key
      await prismaService.employeeDocument.update({
        where: { id: doc.id },
        data: {
          fileUrl: uploadResult.url,
          fileKey: uploadResult.key,
        } as any,
      })

      console.log(`✓ Migrated employee document: ${doc.documentName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate employee document ${doc.documentName}:`, error.message)
    }
  }
}

async function migrateProfilePhotos(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating employee profile photos...')

  const employees = await prismaService.employeeMaster.findMany({
    where: {
      profilePhoto: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${employees.length} profile photos to migrate`)

  for (const employee of employees) {
    try {
      const localPath = path.join(process.cwd(), employee.profilePhoto!)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      // Generate unique filename for profile photos
      const customFileName = `profile-${employee.id}-${Date.now()}.jpg`

      const uploadResult = await bucketService.uploadFile(mockFile, 'profile-photos', customFileName)

      // Update database with new profile photo URL
      await prismaService.employeeMaster.update({
        where: { id: employee.id },
        data: {
          profilePhoto: uploadResult.url,
        },
      })

      console.log(`✓ Migrated profile photo for employee: ${employee.firstName} ${employee.lastName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate profile photo for ${employee.firstName} ${employee.lastName}:`, error.message)
    }
  }
}

async function migrateCompanyLogos(bucketService: BucketService, prismaService: PrismaService) {
  console.log('Migrating company logos...')

  const companies = await prismaService.company.findMany({
    where: {
      logoUrl: {
        startsWith: '/uploads/',
      },
    },
  })

  console.log(`Found ${companies.length} company logos to migrate`)

  for (const company of companies) {
    try {
      const localPath = path.join(process.cwd(), company.logoUrl!)

      if (!fs.existsSync(localPath)) {
        console.warn(`File not found locally: ${localPath}`)
        continue
      }

      const fileBuffer = fs.readFileSync(localPath)
      const fileName = path.basename(localPath)
      const mimeType = getMimeType(fileName)

      const mockFile = {
        buffer: fileBuffer,
        originalname: fileName,
        mimetype: mimeType,
        size: fileBuffer.length,
      } as Express.Multer.File

      // Generate unique filename for company logos
      const customFileName = `company-logo-${company.id}-${Date.now()}.jpg`

      const uploadResult = await bucketService.uploadFile(mockFile, 'company-logos', customFileName)

      // Update database with new logo URL
      await prismaService.company.update({
        where: { id: company.id },
        data: {
          logoUrl: uploadResult.url,
        },
      })

      console.log(`✓ Migrated company logo for: ${company.companyName}`)
    } catch (error) {
      console.error(`✗ Failed to migrate company logo for ${company.companyName}:`, error.message)
    }
  }
}

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase()
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