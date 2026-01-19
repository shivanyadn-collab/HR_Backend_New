import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateFaceRecognitionLogDto } from './dto/create-face-recognition-log.dto'
import { UpdateFaceRecognitionLogDto } from './dto/update-face-recognition-log.dto'
import { VerifyFaceDto } from './dto/verify-face.dto'

@Injectable()
export class FaceRecognitionLogsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateFaceRecognitionLogDto) {
    // Verify camera device exists
    const cameraDevice = await this.prisma.cameraDevice.findUnique({
      where: { id: createDto.cameraDeviceId },
    })

    if (!cameraDevice) {
      throw new NotFoundException('Camera device not found')
    }

    // If employeeMasterId is provided, verify it exists
    if (createDto.employeeMasterId) {
      const employee = await this.prisma.employeeMaster.findUnique({
        where: { id: createDto.employeeMasterId },
      })
      if (!employee) {
        throw new NotFoundException('Employee not found')
      }
    }

    const log = await this.prisma.faceRecognitionLog.create({
      data: {
        employeeMasterId: createDto.employeeMasterId,
        cameraDeviceId: createDto.cameraDeviceId,
        recognitionTime: createDto.recognitionTime
          ? new Date(createDto.recognitionTime)
          : new Date(),
        status: (createDto.status as any) || 'UNKNOWN',
        confidence: createDto.confidence,
        imageUrl: createDto.imageUrl,
        location: createDto.location || cameraDevice.location,
        remarks: createDto.remarks,
      },
      include: {
        employeeMaster: true,
        cameraDevice: true,
      },
    })

    return this.formatResponse(log)
  }

  async findAll(
    cameraDeviceId?: string,
    employeeMasterId?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
  ) {
    const where: any = {}

    if (cameraDeviceId) where.cameraDeviceId = cameraDeviceId
    if (employeeMasterId) where.employeeMasterId = employeeMasterId
    if (status) {
      const statusMap: Record<string, string> = {
        Recognized: 'RECOGNIZED',
        Failed: 'FAILED',
        Unknown: 'UNKNOWN',
      }
      where.status = statusMap[status] || status
    }

    if (startDate || endDate) {
      where.recognitionTime = {}
      if (startDate) where.recognitionTime.gte = new Date(startDate)
      if (endDate) where.recognitionTime.lte = new Date(endDate)
    }

    const logs = await this.prisma.faceRecognitionLog.findMany({
      where,
      include: {
        employeeMaster: true,
        cameraDevice: true,
      },
      orderBy: { recognitionTime: 'desc' },
      take: limit || 100,
    })

    return Promise.all(logs.map((log) => this.formatResponse(log)))
  }

  async findRecent(limit: number = 50) {
    const logs = await this.prisma.faceRecognitionLog.findMany({
      include: {
        employeeMaster: true,
        cameraDevice: true,
      },
      orderBy: { recognitionTime: 'desc' },
      take: limit,
    })

    return Promise.all(logs.map((log) => this.formatResponse(log)))
  }

  async findOne(id: string) {
    const log = await this.prisma.faceRecognitionLog.findUnique({
      where: { id },
      include: {
        employeeMaster: true,
        cameraDevice: true,
      },
    })

    if (!log) {
      throw new NotFoundException('Face recognition log not found')
    }

    return this.formatResponse(log)
  }

  async update(id: string, updateDto: UpdateFaceRecognitionLogDto) {
    const log = await this.prisma.faceRecognitionLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Face recognition log not found')
    }

    const updateData: any = {}
    if (updateDto.employeeMasterId !== undefined)
      updateData.employeeMasterId = updateDto.employeeMasterId
    if (updateDto.cameraDeviceId !== undefined) updateData.cameraDeviceId = updateDto.cameraDeviceId
    if (updateDto.recognitionTime !== undefined)
      updateData.recognitionTime = new Date(updateDto.recognitionTime)
    if (updateDto.status !== undefined) updateData.status = updateDto.status
    if (updateDto.confidence !== undefined) updateData.confidence = updateDto.confidence
    if (updateDto.imageUrl !== undefined) updateData.imageUrl = updateDto.imageUrl
    if (updateDto.location !== undefined) updateData.location = updateDto.location
    if (updateDto.remarks !== undefined) updateData.remarks = updateDto.remarks

    const updated = await this.prisma.faceRecognitionLog.update({
      where: { id },
      data: updateData,
      include: {
        employeeMaster: true,
        cameraDevice: true,
      },
    })

    return this.formatResponse(updated)
  }

  async remove(id: string) {
    const log = await this.prisma.faceRecognitionLog.findUnique({
      where: { id },
    })

    if (!log) {
      throw new NotFoundException('Face recognition log not found')
    }

    await this.prisma.faceRecognitionLog.delete({
      where: { id },
    })

    return { message: 'Face recognition log deleted successfully' }
  }

  async getStatistics(startDate?: string, endDate?: string) {
    const where: any = {}
    if (startDate || endDate) {
      where.recognitionTime = {}
      if (startDate) where.recognitionTime.gte = new Date(startDate)
      if (endDate) where.recognitionTime.lte = new Date(endDate)
    }

    const [total, recognized, failed, unknown] = await Promise.all([
      this.prisma.faceRecognitionLog.count({ where }),
      this.prisma.faceRecognitionLog.count({ where: { ...where, status: 'RECOGNIZED' } }),
      this.prisma.faceRecognitionLog.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.faceRecognitionLog.count({ where: { ...where, status: 'UNKNOWN' } }),
    ])

    return { total, recognized, failed, unknown }
  }

  async verifyFace(verifyDto: VerifyFaceDto) {
    // Verify employee exists
    const employee = await this.prisma.employeeMaster.findUnique({
      where: { id: verifyDto.employeeMasterId },
      select: { id: true, profilePhoto: true, firstName: true, lastName: true },
    })

    if (!employee) {
      throw new NotFoundException('Employee not found')
    }

    // Check if employee has face enrollment
    const faceEnrollment = await this.prisma.faceEnrollment.findFirst({
      where: { employeeMasterId: verifyDto.employeeMasterId },
      include: { faceImagesData: true },
    })

    // Require face enrollment for attendance
    if (!faceEnrollment || faceEnrollment.status !== 'COMPLETED' || faceEnrollment.faceImages < 1) {
      throw new BadRequestException(
        'Face not enrolled. Please complete face enrollment before punching attendance.',
      )
    }

    // Get enrolled face images from database if not provided
    const enrolledImages =
      verifyDto.enrolledFaceImages && verifyDto.enrolledFaceImages.length > 0
        ? verifyDto.enrolledFaceImages
        : faceEnrollment.faceImagesData.map((img) => img.imageUrl)

    if (enrolledImages.length === 0 && !employee.profilePhoto) {
      throw new BadRequestException('No reference face image found for verification')
    }

    // TODO: Integrate with actual face recognition API (AWS Rekognition, Azure Face API, etc.)
    // For now, this is a placeholder implementation
    // In production, you would:
    // 1. Download selfie image and enrolled face images
    // 2. Send them to a face recognition service
    // 3. Compare selfie against ALL enrolled images
    // 4. Return the best match score and liveness detection results

    // Simulate face recognition API call
    const minConfidence = verifyDto.minConfidence || 0.7
    const checkAntiSpoofing = verifyDto.checkAntiSpoofing !== false
    const requireLiveness = verifyDto.requireLiveness !== false

    // Simulated confidence score (in production, get from actual API)
    // Higher confidence when more enrolled images are available
    const baseConfidence = 0.6
    const enrollmentBonus = Math.min(enrolledImages.length * 0.05, 0.2) // Up to 20% bonus for more images
    const confidence = Math.min(baseConfidence + enrollmentBonus + Math.random() * 0.25, 0.98)

    // Simulated liveness score (in production, get from actual API)
    const livenessScore = checkAntiSpoofing ? Math.random() * 0.25 + 0.7 : 1.0

    // Simulated anti-spoofing check (less likely to fail with proper implementation)
    const antiSpoofingPassed =
      !checkAntiSpoofing || (livenessScore > 0.5 && !(Math.random() < 0.05))

    // Determine if faces match
    const isMatch = confidence >= minConfidence && antiSpoofingPassed

    // Determine reason for failure if applicable
    let reason: string | undefined
    if (!isMatch) {
      if (confidence < minConfidence) {
        reason = `Confidence too low: ${(confidence * 100).toFixed(1)}% (minimum ${(minConfidence * 100).toFixed(0)}% required)`
      } else if (!antiSpoofingPassed) {
        reason = 'Anti-spoofing check failed. Please ensure you are using a live camera feed.'
      }
    }

    // Log the verification attempt
    console.log(`Face verification for employee ${employee.firstName} ${employee.lastName}:`, {
      enrolledImagesCount: enrolledImages.length,
      confidence: (confidence * 100).toFixed(1) + '%',
      livenessScore: (livenessScore * 100).toFixed(1) + '%',
      antiSpoofingPassed,
      isMatch,
    })

    return {
      success: isMatch,
      isMatch,
      confidence,
      antiSpoofingPassed,
      livenessScore,
      spoofingDetected: checkAntiSpoofing && !antiSpoofingPassed,
      reason,
      antiSpoofingReason: !antiSpoofingPassed
        ? 'Liveness detection failed or spoofing detected'
        : undefined,
      enrolledImagesUsed: enrolledImages.length,
    }
  }

  private async formatResponse(log: any) {
    const statusMap: Record<string, string> = {
      RECOGNIZED: 'Recognized',
      FAILED: 'Failed',
      UNKNOWN: 'Unknown',
    }

    let departmentName = 'Not assigned'
    let designationName = 'Not assigned'

    if (log.employeeMaster) {
      if (log.employeeMaster.departmentId) {
        const department = await this.prisma.department.findUnique({
          where: { id: log.employeeMaster.departmentId },
        })
        departmentName = department?.departmentName || 'Not assigned'
      }

      if (log.employeeMaster.designationId) {
        const designation = await this.prisma.designation.findUnique({
          where: { id: log.employeeMaster.designationId },
        })
        designationName = designation?.designationName || 'Not assigned'
      }
    }

    return {
      id: log.id,
      employeeId: log.employeeMasterId || '',
      employeeCode: log.employeeMaster?.employeeCode || '',
      employeeName: log.employeeMaster
        ? `${log.employeeMaster.firstName} ${log.employeeMaster.lastName}`
        : 'Unknown',
      department: departmentName,
      designation: designationName,
      cameraLocation: log.location || log.cameraDevice?.location || 'Unknown',
      recognitionTime: log.recognitionTime.toISOString(),
      status: statusMap[log.status] || log.status,
      confidence: log.confidence,
      imageUrl: log.imageUrl,
      cameraDeviceId: log.cameraDeviceId,
      createdAt: log.createdAt.toISOString(),
    }
  }
}
