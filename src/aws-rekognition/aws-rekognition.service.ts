import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  ListFacesCommand,
  DetectFacesCommand,
} from '@aws-sdk/client-rekognition'

@Injectable()
export class AwsRekognitionService {
  private readonly logger = new Logger(AwsRekognitionService.name)
  private client: RekognitionClient | null = null
  private collectionId: string = 'hr-employee-faces'
  private isConfigured = false

  constructor(private readonly configService: ConfigService) {
    this.initializeClient()
  }

  private initializeClient() {
    // Prefer Rekognition-specific keys when set; otherwise fall back to shared AWS_* keys
    const accessKeyId =
      this.configService.get<string>('AWS_REKOGNITION_ACCESS_KEY_ID') ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID')
    const secretAccessKey =
      this.configService.get<string>('AWS_REKOGNITION_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY')
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1'
    const collectionId = this.configService.get<string>('AWS_REKOGNITION_COLLECTION_ID') || 'hr-employee-faces'

    this.collectionId = collectionId

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'AWS Rekognition credentials not configured. Set AWS_REKOGNITION_ACCESS_KEY_ID and AWS_REKOGNITION_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) in .env',
      )
      this.isConfigured = false
      return
    }

    this.client = new RekognitionClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
    this.isConfigured = true
    this.logger.log('AWS Rekognition client initialized')
  }

  isEnabled(): boolean {
    return this.isConfigured && this.client !== null
  }

  private ensureClient() {
    if (!this.client || !this.isConfigured) {
      throw new BadRequestException(
        'AWS Rekognition is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in backend .env',
      )
    }
  }

  private bufferToUint8Array(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer)
  }

  async ensureCollection(): Promise<void> {
    this.ensureClient()
    try {
      await this.client!.send(
        new CreateCollectionCommand({ CollectionId: this.collectionId }),
      )
      this.logger.debug(`Collection ${this.collectionId} ensured`)
    } catch (err: any) {
      if (err.name !== 'ResourceAlreadyExistsException') {
        this.logger.error('Failed to create Rekognition collection', err)
        throw err
      }
    }
  }

  async indexFace(
    imageBytes: Uint8Array,
    employeeId: string,
    employeeCode: string,
  ): Promise<{ success: boolean; faceId?: string; error?: string }> {
    this.ensureClient()
    await this.ensureCollection()

    try {
      const command = new IndexFacesCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: imageBytes },
        ExternalImageId: `${employeeId}_${employeeCode}`,
        MaxFaces: 1,
        QualityFilter: 'AUTO',
        DetectionAttributes: ['ALL'],
      })

      const response = await this.client!.send(command)

      if (response.FaceRecords && response.FaceRecords.length > 0) {
        const faceId = response.FaceRecords[0].Face?.FaceId
        return { success: true, faceId }
      }

      return { success: false, error: 'No face detected in the image' }
    } catch (err: any) {
      this.logger.error('Index face failed', err)
      return {
        success: false,
        error: err.message || 'Failed to index face',
      }
    }
  }

  async searchFaceByImage(
    imageBytes: Uint8Array,
    faceMatchThreshold: number = 80,
  ): Promise<{
    success: boolean
    matches?: Array<{ faceId: string; employeeId: string; employeeCode: string; similarity: number }>
    error?: string
  }> {
    this.ensureClient()
    await this.ensureCollection()

    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: imageBytes },
        MaxFaces: 10,
        FaceMatchThreshold: faceMatchThreshold,
        QualityFilter: 'AUTO',
      })

      const response = await this.client!.send(command)

      if (response.FaceMatches && response.FaceMatches.length > 0) {
        const matches = response.FaceMatches.map((match) => {
          const externalId = match.Face?.ExternalImageId || ''
          const [employeeId, employeeCode] = externalId.split('_')
          return {
            faceId: match.Face?.FaceId || '',
            employeeId: employeeId || '',
            employeeCode: employeeCode || '',
            similarity: match.Similarity || 0,
          }
        })
        return { success: true, matches }
      }

      return { success: true, matches: [] }
    } catch (err: any) {
      this.logger.error('Search face failed', err)
      return {
        success: false,
        error: err.message || 'Failed to search face',
      }
    }
  }

  async detectFaces(
    imageBytes: Uint8Array,
  ): Promise<{
    success: boolean
    faceCount?: number
    faces?: Array<{ confidence: number; brightness?: number; sharpness?: number }>
    error?: string
  }> {
    this.ensureClient()

    try {
      const command = new DetectFacesCommand({
        Image: { Bytes: imageBytes },
        Attributes: ['ALL'],
      })

      const response = await this.client!.send(command)

      if (response.FaceDetails && response.FaceDetails.length > 0) {
        const faces = response.FaceDetails.map((face) => ({
          confidence: face.Confidence || 0,
          brightness: face.Quality?.Brightness,
          sharpness: face.Quality?.Sharpness,
        }))
        return {
          success: true,
          faceCount: response.FaceDetails.length,
          faces,
        }
      }

      return { success: true, faceCount: 0, faces: [] }
    } catch (err: any) {
      this.logger.error('Detect faces failed', err)
      return {
        success: false,
        error: err.message || 'Failed to detect faces',
      }
    }
  }

  async deleteFace(faceId: string): Promise<{ success: boolean; error?: string }> {
    this.ensureClient()

    try {
      await this.client!.send(
        new DeleteFacesCommand({
          CollectionId: this.collectionId,
          FaceIds: [faceId],
        }),
      )
      return { success: true }
    } catch (err: any) {
      this.logger.error('Delete face failed', err)
      return {
        success: false,
        error: err.message || 'Failed to delete face',
      }
    }
  }

  async listFaces(maxResults: number = 100): Promise<{
    success: boolean
    faces?: Array<{ faceId: string; employeeId: string; employeeCode: string }>
    error?: string
  }> {
    this.ensureClient()

    try {
      const command = new ListFacesCommand({
        CollectionId: this.collectionId,
        MaxResults: maxResults,
      })

      const response = await this.client!.send(command)

      if (response.Faces && response.Faces.length > 0) {
        const faces = response.Faces.map((face) => {
          const externalId = face.ExternalImageId || ''
          const [employeeId, employeeCode] = externalId.split('_')
          return {
            faceId: face.FaceId || '',
            employeeId: employeeId || '',
            employeeCode: employeeCode || '',
          }
        })
        return { success: true, faces }
      }

      return { success: true, faces: [] }
    } catch (err: any) {
      this.logger.error('List faces failed', err)
      return {
        success: false,
        error: err.message || 'Failed to list faces',
      }
    }
  }

  /**
   * Enroll a face from uploaded file buffer (Multer)
   */
  async enrollFromBuffer(
    buffer: Buffer,
    employeeId: string,
    employeeCode: string,
  ): Promise<{ success: boolean; faceId?: string; error?: string }> {
    const bytes = this.bufferToUint8Array(buffer)
    return this.indexFace(bytes, employeeId, employeeCode)
  }

  /**
   * Recognize face from uploaded file buffer (Multer)
   */
  async recognizeFromBuffer(
    buffer: Buffer,
    faceMatchThreshold: number = 80,
  ): Promise<{
    success: boolean
    matches?: Array<{ faceId: string; employeeId: string; employeeCode: string; similarity: number }>
    error?: string
  }> {
    const bytes = this.bufferToUint8Array(buffer)
    return this.searchFaceByImage(bytes, faceMatchThreshold)
  }
}
