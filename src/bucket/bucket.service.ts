import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, ObjectCannedACL } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'
import { extname, join, dirname } from 'path'
import { writeFile, mkdir } from 'fs/promises'

export enum BucketProvider {
  AWS_S3 = 'aws-s3',
  LOCAL = 'local', // fallback for development
}

export interface BucketConfig {
  provider: BucketProvider
  bucketName: string
  region?: string // AWS
  accessKeyId?: string // AWS
  secretAccessKey?: string // AWS
  endpoint?: string // Custom endpoint
  publicRead?: boolean // Make uploaded files publicly readable
}

export interface UploadResult {
  url: string
  key: string
  bucket: string
  provider: BucketProvider
  size: number
  mimeType: string
}

export interface FileInfo {
  key: string
  url: string
  size?: number
  lastModified?: Date
  mimeType?: string
}

@Injectable()
export class BucketService {
  private readonly logger = new Logger(BucketService.name)
  private s3Client: S3Client
  private config: BucketConfig

  constructor(private configService?: ConfigService) {
    this.initializeClients()
  }

  private initializeClients() {
    // Load configuration from environment variables
    // Try ConfigService first, fall back to process.env for scripts
    const getEnv = (key: string, defaultValue?: string): string | undefined => {
      if (this.configService) {
        return this.configService.get<string>(key) || defaultValue
      }
      return process.env[key] || defaultValue
    }

    this.config = {
      provider: (getEnv('BUCKET_PROVIDER') as BucketProvider) || BucketProvider.AWS_S3,
      bucketName: getEnv('BUCKET_NAME'),
      region: getEnv('AWS_REGION'),
      accessKeyId: getEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY'),
      endpoint: getEnv('BUCKET_ENDPOINT'),
      publicRead: getEnv('BUCKET_PUBLIC_READ') === 'true',
    }

    // Validate configuration based on provider
    this.validateConfiguration()

    // Initialize clients based on provider
    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        try {
          this.initializeS3Client()
        } catch (error) {
          this.logger.warn(`Failed to initialize AWS S3 client: ${error.message}`)
          this.config.provider = BucketProvider.LOCAL
        }
        break
      case BucketProvider.LOCAL:
        // No client needed for local storage
        break
    }

    this.logger.log(`Bucket service initialized with provider: ${this.config.provider}`)
  }

  private validateConfiguration() {
    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        if (!this.config.accessKeyId || !this.config.secretAccessKey) {
          this.logger.warn('AWS S3 credentials not found, falling back to local storage')
          this.config.provider = BucketProvider.LOCAL
        }
        break
      case BucketProvider.LOCAL:
        // No validation needed for local storage
        break
    }
  }

  private initializeS3Client() {
    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new Error('AWS credentials not provided')
    }

    this.s3Client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      endpoint: this.config.endpoint,
      forcePathStyle: !!this.config.endpoint, // Use path style for custom endpoints
    })
  }



  async uploadFile(
    file: Express.Multer.File,
    folder: string = '',
    customFileName?: string,
  ): Promise<UploadResult> {
    const fileName =
      customFileName ||
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`
    const key = folder ? `${folder}/${fileName}` : fileName

    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        return this.uploadToS3(file, key)
      case BucketProvider.LOCAL:
        return this.uploadToLocal(file, key)
      default:
        throw new Error(`Unsupported bucket provider: ${this.config.provider}`)
    }
  }

  private async uploadToS3(file: Express.Multer.File, key: string): Promise<UploadResult> {
    const uploadParams = {
      Bucket: this.config.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: this.config.publicRead ? ObjectCannedACL.public_read : undefined,
    }

    // Use Upload class for better multipart upload handling
    const upload = new Upload({
      client: this.s3Client,
      params: uploadParams,
    })

    const result = await upload.done()

    return {
      url: `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`,
      key: key,
      bucket: this.config.bucketName,
      provider: BucketProvider.AWS_S3,
      size: file.size,
      mimeType: file.mimetype,
    }
  }



  private async uploadToLocal(file: Express.Multer.File, key: string): Promise<UploadResult> {
    // Write file to disk so GET /uploads/... can serve it via static assets
    const uploadsDir = join(process.cwd(), 'uploads')
    const filePath = join(uploadsDir, key)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, file.buffer)

    const url = `/uploads/${key}`
    return {
      url,
      key,
      bucket: 'local',
      provider: BucketProvider.LOCAL,
      size: file.size,
      mimeType: file.mimetype,
    }
  }

  async deleteFile(key: string): Promise<void> {
    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        await this.deleteFromS3(key)
        break
      case BucketProvider.LOCAL:
        // For local, we don't actually delete files in this implementation
        this.logger.warn(`Local file deletion not implemented for key: ${key}`)
        break
      default:
        throw new Error(`Unsupported bucket provider: ${this.config.provider}`)
    }
  }

  private async deleteFromS3(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    })
    await this.s3Client.send(command)
  }


  async getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        return this.getS3SignedUrl(key, expiresIn)
      case BucketProvider.LOCAL:
        return `/uploads/${key}`
      default:
        throw new Error(`Unsupported bucket provider: ${this.config.provider}`)
    }
  }

  private async getS3SignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    })

    return await getSignedUrl(this.s3Client, command, { expiresIn })
  }

  /**
   * Get a signed URL for accessing a file in the bucket
   * @param key The bucket key (path) of the file
   * @param expiresIn Expiration time in seconds (default: 3600 = 1 hour)
   * @returns Signed URL that can be used to access the file
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Use the existing getFileUrl method which handles both S3 and local storage
    return this.getFileUrl(key, expiresIn)
  }



  async listFiles(prefix?: string): Promise<FileInfo[]> {
    switch (this.config.provider) {
      case BucketProvider.AWS_S3:
        return this.listS3Files(prefix)
      case BucketProvider.LOCAL:
        return [] // Not implemented for local
      default:
        throw new Error(`Unsupported bucket provider: ${this.config.provider}`)
    }
  }

  private async listS3Files(prefix?: string): Promise<FileInfo[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.config.bucketName,
      Prefix: prefix,
    })

    const result = await this.s3Client.send(command)
    return (result.Contents || []).map((obj) => ({
      key: obj.Key!,
      url: `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${obj.Key}`,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }))
  }



  getConfig(): BucketConfig {
    return { ...this.config }
  }
}
