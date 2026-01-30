import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { LoginLogsService } from '../login-logs/login-logs.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { AuthResponseDto, UserResponseDto, ProjectDto } from './dto/auth-response.dto'
import { LoginLogStatus } from '../login-logs/dto/create-login-log.dto'
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private loginLogsService: LoginLogsService,
  ) {}

  private getClientInfo(req: any) {
    // Get IP address
    const ipAddress = 
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      'Unknown'

    // Get User-Agent for device and browser detection
    const userAgent = req.headers['user-agent'] || 'Unknown'
    
    // Parse device and browser from User-Agent
    let device = 'Unknown'
    let browser = 'Unknown'
    
    if (userAgent.includes('Windows')) {
      device = 'Windows'
    } else if (userAgent.includes('Mac')) {
      device = 'macOS'
    } else if (userAgent.includes('Linux')) {
      device = 'Linux'
    } else if (userAgent.includes('Android')) {
      device = 'Android'
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      device = 'iOS'
    }
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browser = 'Chrome'
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox'
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'Safari'
    } else if (userAgent.includes('Edg')) {
      browser = 'Edge'
    } else if (userAgent.includes('Opera')) {
      browser = 'Opera'
    }

    // Get location (could be enhanced with IP geolocation service)
    const location = req.headers['x-location'] || 'Unknown'

    return { ipAddress, device, browser, location }
  }

  async register(registerDto: RegisterDto, req?: any): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    })

    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    // Check employeeId uniqueness if provided
    if (registerDto.employeeId) {
      const existingEmployeeId = await this.prisma.user.findUnique({
        where: { employeeId: registerDto.employeeId },
      })

      if (existingEmployeeId) {
        throw new ConflictException('User with this employee ID already exists')
      }
    }

    // Validate role exists in Role table and get the roleCode
    let userRole: string = registerDto.role.toUpperCase()

    // Try to find the role in the Role table
    const role = await this.prisma.role.findFirst({
      where: {
        OR: [
          { roleCode: registerDto.role },
          { roleCode: registerDto.role.toUpperCase() },
          { roleCode: { equals: registerDto.role, mode: 'insensitive' } },
        ],
        isActive: true,
      },
    })

    if (role) {
      // Use the roleCode from the Role table (should match UserRole enum)
      userRole = role.roleCode.toUpperCase()
    } else {
      // If role not found in Role table, validate it's a valid UserRole enum value
      const validRoles = ['ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_HR', 'PROJECT_MANAGER', 'EMPLOYEE']
      if (!validRoles.includes(userRole)) {
        throw new ConflictException(
          `Invalid role: ${registerDto.role}. Role must exist in the Role table or be one of: ${validRoles.join(', ')}`,
        )
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10)

    // Get projects if projectIds provided
    let projects: ProjectDto[] = []
    if (registerDto.projectIds && registerDto.projectIds.length > 0) {
      const projectRecords = await this.prisma.project.findMany({
        where: {
          id: { in: registerDto.projectIds },
        },
      })
      projects = projectRecords.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
      }))
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        role: userRole as any, // Cast to UserRole enum
        employeeId: registerDto.employeeId,
        department: registerDto.department,
        designation: registerDto.designation,
        company:
          registerDto.company || this.configService.get<string>('DEFAULT_COMPANY') || 'Exozen',
        projects: {
          create:
            registerDto.projectIds?.map((projectId) => ({
              projectId,
            })) || [],
        },
      },
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
    })

    // Auto-link with EmployeeMaster if exists with same email
    await this.linkUserToEmployee(user.id, user.email)

    // Generate tokens
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const accessToken = this.jwtService.sign(payload)

    // Format user response
    const userResponse: UserResponseDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId || undefined,
      department: user.department || undefined,
      designation: user.designation || undefined,
      company: user.company || undefined,
      isActive: user.isActive !== undefined ? user.isActive : true,
      projects: user.projects.map((up) => ({
        id: up.project.id,
        name: up.project.name,
        code: up.project.code,
      })),
    }

    return {
      user: userResponse,
      accessToken,
    }
  }

  async login(loginDto: LoginDto, req?: any): Promise<AuthResponseDto> {
    const clientInfo = req ? this.getClientInfo(req) : { ipAddress: 'Unknown', device: 'Unknown', browser: 'Unknown', location: 'Unknown' }
    
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
    })

    // Log failed login attempt if user not found
    if (!user) {
      try {
        await this.loginLogsService.create({
          userName: loginDto.email,
          userCode: undefined,
          email: loginDto.email,
          ipAddress: clientInfo.ipAddress,
          device: clientInfo.device,
          browser: clientInfo.browser,
          location: clientInfo.location,
          status: LoginLogStatus.Failed,
          failureReason: 'User not found',
        })
      } catch (error) {
        // Silently fail logging - don't break login flow
        console.error('Failed to log login attempt:', error)
      }
      throw new UnauthorizedException('Invalid credentials')
    }

    // Check if user is active
    if (!user.isActive) {
      try {
        await this.loginLogsService.create({
          userId: user.id,
          userName: user.name,
          userCode: user.employeeId || undefined,
          email: user.email,
          ipAddress: clientInfo.ipAddress,
          device: clientInfo.device,
          browser: clientInfo.browser,
          location: clientInfo.location,
          status: LoginLogStatus.Failed,
          failureReason: 'Account is deactivated',
        })
      } catch (error) {
        console.error('Failed to log login attempt:', error)
      }
      throw new UnauthorizedException('Account is deactivated')
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password)

    // Log failed login attempt if password invalid
    if (!isPasswordValid) {
      try {
        await this.loginLogsService.create({
          userId: user.id,
          userName: user.name,
          userCode: user.employeeId || undefined,
          email: user.email,
          ipAddress: clientInfo.ipAddress,
          device: clientInfo.device,
          browser: clientInfo.browser,
          location: clientInfo.location,
          status: LoginLogStatus.Failed,
          failureReason: 'Invalid password',
        })
      } catch (error) {
        console.error('Failed to log login attempt:', error)
      }
      throw new UnauthorizedException('Invalid credentials')
    }

    // Log successful login
    try {
      await this.loginLogsService.create({
        userId: user.id,
        userName: user.name,
        userCode: user.employeeId || undefined,
        email: user.email,
        ipAddress: clientInfo.ipAddress,
        device: clientInfo.device,
        browser: clientInfo.browser,
        location: clientInfo.location,
        status: LoginLogStatus.Success,
      })
    } catch (error) {
      console.error('Failed to log login attempt:', error)
    }

    // Generate tokens
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const accessToken = this.jwtService.sign(payload)

    // Format user response
    const userResponse: UserResponseDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId || undefined,
      department: user.department || undefined,
      designation: user.designation || undefined,
      company: user.company || undefined,
      isActive: user.isActive !== undefined ? user.isActive : true,
      projects: user.projects.map((up) => ({
        id: up.project.id,
        name: up.project.name,
        code: up.project.code,
      })),
    }

    return {
      user: userResponse,
      accessToken,
    }
  }

  async logout(userId: string, req?: any): Promise<{ message: string }> {
    try {
      await this.loginLogsService.updateLogoutTime(userId, new Date())
    } catch (error) {
      console.error('Failed to log logout:', error)
    }
    return { message: 'Logged out successfully' }
  }

  async validateUser(userId: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
    })

    if (!user || !user.isActive) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employeeId || undefined,
      department: user.department || undefined,
      designation: user.designation || undefined,
      company: user.company || undefined,
      projects: user.projects.map((up) => ({
        id: up.project.id,
        name: up.project.name,
        code: up.project.code,
      })),
    }
  }

  /**
   * Automatically link a user to an employee master record by matching email
   */
  private async linkUserToEmployee(userId: string, email: string): Promise<void> {
    try {
      // Find employee master with matching email that doesn't have a userId
      const employee = await this.prisma.employeeMaster.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          userId: null,
        },
      })

      if (employee) {
        // Link the employee to the user
        await this.prisma.employeeMaster.update({
          where: { id: employee.id },
          data: { userId: userId },
        })

        // Also update user's employeeId if not already set
        await this.prisma.user.update({
          where: { id: userId },
          data: { employeeId: employee.id },
        })

        console.log(`Auto-linked user ${email} to employee ${employee.employeeCode}`)
      }
    } catch (error) {
      console.error(`Failed to auto-link user ${email} to employee:`, error)
      // Don't throw - this is a non-critical operation
    }
  }
}
