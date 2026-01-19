import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateEmployeeAssignmentDto } from './dto/create-employee-assignment.dto'
import { UpdateEmployeeAssignmentDto } from './dto/update-employee-assignment.dto'
import { EmployeeAssignmentStatus } from '@prisma/client'

@Injectable()
export class EmployeeAssignmentsService {
  constructor(private prisma: PrismaService) {}

  async create(createEmployeeAssignmentDto: CreateEmployeeAssignmentDto) {
    console.log('=== START: Creating Employee Assignment ===')
    console.log('Request data:', JSON.stringify(createEmployeeAssignmentDto, null, 2))

    try {
      // Check if employee exists (could be Employee or EmployeeMaster ID)
      console.log('Step 1: Looking up employee by ID:', createEmployeeAssignmentDto.employeeId)
      let employee = await this.prisma.employee.findUnique({
        where: { id: createEmployeeAssignmentDto.employeeId },
      })

      if (employee) {
        console.log('Step 1: Employee found directly:', employee.id)
      } else {
        console.log('Step 1: Employee not found by ID, will check EmployeeMaster')
      }

      // If not found, try to find/create from EmployeeMaster
      if (!employee) {
        console.log(
          'Step 2: Looking up EmployeeMaster by ID:',
          createEmployeeAssignmentDto.employeeId,
        )
        const employeeMaster = await this.prisma.employeeMaster.findUnique({
          where: { id: createEmployeeAssignmentDto.employeeId },
        })

        if (!employeeMaster) {
          console.error('Step 2: EmployeeMaster not found')
          throw new NotFoundException('Employee not found')
        }

        console.log('Step 2: EmployeeMaster found:', {
          id: employeeMaster.id,
          employeeCode: employeeMaster.employeeCode,
          email: employeeMaster.email,
          name: `${employeeMaster.firstName} ${employeeMaster.lastName}`,
        })

        // Normalize email for consistent lookup
        const normalizedEmail = employeeMaster.email
          ? employeeMaster.email.trim().toLowerCase()
          : null
        const originalEmail = employeeMaster.email ? employeeMaster.email.trim() : null

        // Check if Employee record exists with this employeeCode
        employee = await this.prisma.employee.findUnique({
          where: { employeeId: employeeMaster.employeeCode },
        })

        // If not found by employeeCode, check by email (in case email exists but employeeCode is different)
        // Use comprehensive search to handle case variations and whitespace
        if (!employee && originalEmail) {
          // Strategy 1: Try exact match first (fastest)
          employee = await this.prisma.employee.findUnique({
            where: { email: originalEmail },
          })

          // Strategy 2: If not found, try case-insensitive search (for PostgreSQL)
          if (!employee && normalizedEmail) {
            try {
              const employees = await this.prisma.employee.findMany({
                where: {
                  email: {
                    equals: originalEmail,
                    mode: 'insensitive',
                  },
                },
                take: 1,
              })
              if (employees.length > 0) {
                employee = employees[0]
                console.log('Found employee by email (case-insensitive):', employee.id)
              }
            } catch (insensitiveError: any) {
              console.warn('Case-insensitive search not supported, trying alternative methods')
            }
          }

          // Strategy 3: If still not found, try using raw query with LOWER() for case-insensitive match
          if (!employee && normalizedEmail && originalEmail) {
            try {
              // Use Prisma's raw query for case-insensitive email search
              const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM employees 
                WHERE email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(${originalEmail}))
                LIMIT 1
              `
              if (result && result.length > 0) {
                employee = await this.prisma.employee.findUnique({
                  where: { id: result[0].id },
                })
                if (employee) {
                  console.log('Found employee by email (raw query case-insensitive):', employee.id)
                }
              }
            } catch (rawError: any) {
              console.warn('Raw query search failed:', rawError.message)
              // Don't throw, just continue
            }
          }
        }

        // Create Employee record if it doesn't exist
        // Do a final comprehensive check before creating to avoid unique constraint violations
        if (!employee) {
          // Final check by email - try all methods again
          if (originalEmail) {
            // Try exact match
            const exactMatch = await this.prisma.employee.findUnique({
              where: { email: originalEmail },
            })
            if (exactMatch) {
              employee = exactMatch
              console.log(
                'Found existing Employee record by email (exact match - final check):',
                employee.id,
              )
            }

            // Try case-insensitive if still not found
            if (!employee && normalizedEmail) {
              try {
                const existingByEmail = await this.prisma.employee.findFirst({
                  where: {
                    email: {
                      equals: originalEmail,
                      mode: 'insensitive',
                    },
                  },
                })
                if (existingByEmail) {
                  employee = existingByEmail
                  console.log(
                    'Found existing Employee record by email (case-insensitive - final check):',
                    employee.id,
                  )
                }
              } catch (checkError: any) {
                // If case-insensitive mode fails, try raw query
                try {
                  const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
                    SELECT id FROM employees 
                    WHERE LOWER(email) = LOWER(${originalEmail})
                    LIMIT 1
                  `
                  if (result && result.length > 0) {
                    employee = await this.prisma.employee.findUnique({
                      where: { id: result[0].id },
                    })
                    if (employee) {
                      console.log(
                        'Found existing Employee record by email (raw query - final check):',
                        employee.id,
                      )
                    }
                  }
                } catch (rawError: any) {
                  console.warn('Final raw query check failed:', rawError.message)
                }
              }
            }
          }

          // Final check by employeeId
          if (!employee && employeeMaster.employeeCode) {
            const existingById = await this.prisma.employee.findUnique({
              where: { employeeId: employeeMaster.employeeCode },
            })
            if (existingById) {
              employee = existingById
              console.log(
                'Found existing Employee record by employeeId (final check):',
                employee.id,
              )
            }
          }

          // Only create if still not found after ALL checks
          if (!employee) {
            // One more safety check: verify email doesn't exist using raw query
            if (originalEmail && normalizedEmail) {
              try {
                const safetyCheck = await this.prisma.$queryRaw<
                  Array<{ id: string; email: string }>
                >`
                  SELECT id, email FROM employees 
                  WHERE email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(${originalEmail}))
                  LIMIT 1
                `
                if (safetyCheck && safetyCheck.length > 0) {
                  employee = await this.prisma.employee.findUnique({
                    where: { id: safetyCheck[0].id },
                  })
                  if (employee) {
                    console.log(
                      'Found existing Employee record by email (safety check before create):',
                      employee.id,
                    )
                  }
                }
              } catch (safetyError: any) {
                console.warn('Safety check failed, proceeding with create:', safetyError.message)
                // Don't throw, continue with creation attempt
              }
            }
          }

          // Only create if STILL not found after all checks
          if (!employee) {
            try {
              console.log('Creating new Employee record for:', {
                employeeCode: employeeMaster.employeeCode,
                email: employeeMaster.email,
                name: `${employeeMaster.firstName} ${employeeMaster.lastName}`,
              })
              employee = await this.prisma.employee.create({
                data: {
                  employeeId: employeeMaster.employeeCode,
                  name: `${employeeMaster.firstName} ${employeeMaster.lastName}`,
                  email: originalEmail || employeeMaster.email?.trim() || null, // Use normalized email
                  phone: employeeMaster.phone,
                  department: employeeMaster.departmentId || null,
                  designation: employeeMaster.designationId || null,
                  status: employeeMaster.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
                },
              })
              console.log('Employee record created successfully:', employee.id)
            } catch (error: any) {
              console.error('Error creating Employee record:', error)
              console.error('Error name:', error.name)
              console.error('Error code:', error.code)
              console.error('Error meta:', JSON.stringify(error.meta, null, 2))

              // Handle Prisma unique constraint errors
              if (error.code === 'P2002') {
                console.log(
                  'Unique constraint violation detected, attempting to find existing employee...',
                )
                console.log('Error meta.target:', error.meta?.target)
                console.log('Email being searched:', originalEmail)

                // Always try to find by email first (most common unique constraint)
                // Use multiple strategies to ensure we find it
                if (originalEmail) {
                  // Strategy 1: Exact match
                  try {
                    const exactMatch = await this.prisma.employee.findUnique({
                      where: { email: originalEmail },
                    })
                    if (exactMatch) {
                      employee = exactMatch
                      console.log(
                        'Found employee by email (exact match in error handler):',
                        employee.id,
                      )
                    }
                  } catch (exactError: any) {
                    console.warn('Exact match lookup failed:', exactError.message)
                  }

                  // Strategy 2: Case-insensitive search
                  if (!employee) {
                    try {
                      const employees = await this.prisma.employee.findMany({
                        where: {
                          email: {
                            equals: originalEmail,
                            mode: 'insensitive',
                          },
                        },
                        take: 1,
                      })
                      if (employees.length > 0) {
                        employee = employees[0]
                        console.log(
                          'Found employee by email (case-insensitive in error handler):',
                          employee.id,
                        )
                      }
                    } catch (insensitiveError: any) {
                      console.warn('Case-insensitive lookup failed:', insensitiveError.message)
                    }
                  }

                  // Strategy 3: Raw query with LOWER() for guaranteed case-insensitive match
                  if (!employee && normalizedEmail && originalEmail) {
                    try {
                      const result = await this.prisma.$queryRaw<
                        Array<{ id: string; email: string }>
                      >`
                      SELECT id, email FROM employees 
                      WHERE email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(${originalEmail}))
                      LIMIT 1
                    `
                      if (result && result.length > 0) {
                        employee = await this.prisma.employee.findUnique({
                          where: { id: result[0].id },
                        })
                        if (employee) {
                          console.log(
                            'Found employee by email (raw query in error handler):',
                            employee.id,
                            'Email in DB:',
                            result[0].email,
                          )
                        }
                      }
                    } catch (rawError: any) {
                      console.error('Raw query lookup failed in error handler:', rawError.message)
                      // Don't throw, continue to next strategy
                    }
                  }
                }

                // If not found by email, try by employeeId
                if (!employee && employeeMaster.employeeCode) {
                  console.log('Looking up employee by employeeId:', employeeMaster.employeeCode)
                  try {
                    employee = await this.prisma.employee.findUnique({
                      where: { employeeId: employeeMaster.employeeCode },
                    })
                    if (employee) {
                      console.log('Found employee by employeeId (in error handler):', employee.id)
                    }
                  } catch (lookupError: any) {
                    console.error('Error looking up by employeeId:', lookupError)
                  }
                }

                // If still not found, check what the constraint violation was about
                if (!employee) {
                  const target = error.meta?.target
                  console.error(
                    'Could not find employee after constraint violation. Target fields:',
                    target,
                  )
                  console.error('Searched email:', originalEmail)
                  console.error('Normalized email:', normalizedEmail)
                  if (target && Array.isArray(target)) {
                    console.error('Constraint was on fields:', target.join(', '))
                  }

                  // Last resort: try to find ANY employee with similar email
                  if (originalEmail && originalEmail.includes('@')) {
                    try {
                      const emailParts = originalEmail.split('@')
                      if (emailParts.length === 2) {
                        const domain = emailParts[1]
                        const domainPattern = `%${domain}`
                        const similarEmails = await this.prisma.$queryRaw<
                          Array<{ id: string; email: string }>
                        >`
                          SELECT id, email FROM employees 
                          WHERE email IS NOT NULL AND email LIKE ${domainPattern}
                          LIMIT 5
                        `
                        console.error('Similar emails found:', similarEmails)
                      }
                    } catch (similarError: any) {
                      console.error('Error searching for similar emails:', similarError.message)
                      // Don't throw, this is just for debugging
                    }
                  }
                }
              }

              if (!employee) {
                console.error('Failed to create or find Employee record after error handling')
                console.error('Attempting one final comprehensive search...')

                // Final attempt: Try to find employee using all possible methods
                if (originalEmail) {
                  // Try exact match one more time
                  try {
                    employee = await this.prisma.employee.findUnique({
                      where: { email: originalEmail },
                    })
                    if (employee) {
                      console.log('Found employee in final search (exact match):', employee.id)
                    }
                  } catch (e) {}

                  // Try raw SQL query as absolute last resort
                  if (!employee && originalEmail && normalizedEmail) {
                    try {
                      const finalResult = await this.prisma.$queryRaw<
                        Array<{ id: string; email: string }>
                      >`
                        SELECT id, email FROM employees 
                        WHERE email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(${originalEmail}))
                        LIMIT 1
                      `
                      if (finalResult && finalResult.length > 0) {
                        employee = await this.prisma.employee.findUnique({
                          where: { id: finalResult[0].id },
                        })
                        if (employee) {
                          console.log('Found employee in final search (raw SQL):', employee.id)
                        }
                      }
                    } catch (finalError: any) {
                      console.error('Final search also failed:', finalError.message)
                      // Don't throw, continue to error handling
                    }
                  }
                }

                // If still not found, throw error but provide helpful message
                if (!employee) {
                  throw new InternalServerErrorException(
                    `Failed to create or find Employee record. ` +
                      `A record with email "${originalEmail}" may already exist but could not be located. ` +
                      `Error: ${error.message || 'Unknown error'}. ` +
                      `Error code: ${error.code || 'N/A'}, Target: ${JSON.stringify(error.meta?.target || 'N/A')}. ` +
                      `Please check the database manually or try with a different email.`,
                  )
                } else {
                  console.log('Found existing Employee record in final search:', employee.id)
                }
              } else {
                console.log('Found existing Employee record after error:', employee.id)
              }
            }
          } else {
            console.log('Found existing Employee record before creation attempt:', employee.id)
          }
        } else {
          console.log('Using existing Employee record:', employee.id)
        }
      }

      // Validate employee.id exists
      if (!employee || !employee.id) {
        console.error('Employee validation failed:', {
          employee: employee ? 'exists but no id' : 'null/undefined',
          employeeId: createEmployeeAssignmentDto.employeeId,
        })
        throw new InternalServerErrorException('Employee record is invalid or missing ID')
      }

      console.log('Employee validated successfully:', {
        employeeId: employee.id,
        employeeCode: employee.employeeId,
        email: employee.email,
      })

      // Check if project exists
      console.log('Checking if project exists:', createEmployeeAssignmentDto.projectId)
      const project = await this.prisma.project.findUnique({
        where: { id: createEmployeeAssignmentDto.projectId },
      })

      if (!project) {
        console.error('Project not found:', createEmployeeAssignmentDto.projectId)
        throw new NotFoundException(
          `Project not found with ID: ${createEmployeeAssignmentDto.projectId}`,
        )
      }

      console.log('Project validated successfully:', {
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
      })

      // Check for existing active assignment (use the Employee.id, not EmployeeMaster.id)
      const existingAssignment = await this.prisma.employeeAssignment.findFirst({
        where: {
          employeeId: employee.id, // Use the Employee.id, not the EmployeeMaster.id
          projectId: createEmployeeAssignmentDto.projectId,
          status: EmployeeAssignmentStatus.ACTIVE,
        },
      })

      if (existingAssignment) {
        throw new ConflictException('Employee already has an active assignment to this project')
      }

      // Validate required fields before creating assignment
      if (!createEmployeeAssignmentDto.role) {
        throw new BadRequestException('Role is required')
      }
      if (
        createEmployeeAssignmentDto.allocationPercentage === undefined ||
        createEmployeeAssignmentDto.allocationPercentage === null
      ) {
        throw new BadRequestException('Allocation percentage is required')
      }
      if (!createEmployeeAssignmentDto.startDate) {
        throw new BadRequestException('Start date is required')
      }

      // Log assignment data before creation
      console.log('Step 4: Preparing to create employee assignment')
      console.log('Assignment data:', {
        employeeId: employee.id,
        employeeCode: employee.employeeId,
        projectId: createEmployeeAssignmentDto.projectId,
        role: createEmployeeAssignmentDto.role,
        allocationPercentage: createEmployeeAssignmentDto.allocationPercentage,
        startDate: createEmployeeAssignmentDto.startDate,
        status: createEmployeeAssignmentDto.status || EmployeeAssignmentStatus.ACTIVE,
      })

      // Prepare assignment data (outside try block so it's accessible in catch)
      console.log('Step 5: Creating employee assignment in database...')
      const assignmentData: any = {
        employeeId: employee.id, // Use the Employee.id, not the EmployeeMaster.id
        projectId: createEmployeeAssignmentDto.projectId,
        role: createEmployeeAssignmentDto.role,
        allocationPercentage: Math.round(Number(createEmployeeAssignmentDto.allocationPercentage)), // Must be Int per schema
        startDate: new Date(createEmployeeAssignmentDto.startDate),
        status: createEmployeeAssignmentDto.status || EmployeeAssignmentStatus.ACTIVE,
      }

      // Add optional fields only if they are provided
      if (createEmployeeAssignmentDto.endDate) {
        assignmentData.endDate = new Date(createEmployeeAssignmentDto.endDate)
      }
      if (
        createEmployeeAssignmentDto.hourlyRate !== undefined &&
        createEmployeeAssignmentDto.hourlyRate !== null
      ) {
        assignmentData.hourlyRate = Number(createEmployeeAssignmentDto.hourlyRate)
      }
      if (createEmployeeAssignmentDto.assignedBy) {
        assignmentData.assignedBy = createEmployeeAssignmentDto.assignedBy
      }

      console.log('Assignment data to be created:', JSON.stringify(assignmentData, null, 2))

      let assignment
      try {
        assignment = await this.prisma.employeeAssignment.create({
          data: assignmentData,
          include: {
            employee: true,
            project: true,
          },
        })

        console.log('Employee assignment created successfully in database:', {
          id: assignment.id,
          employeeId: assignment.employeeId,
          projectId: assignment.projectId,
          projectName: assignment.project?.name || 'NOT INCLUDED',
          projectCode: assignment.project?.code || 'NOT INCLUDED',
          hasProjectRelation: !!assignment.project,
          hasEmployeeRelation: !!assignment.employee,
          status: assignment.status,
        })

        // Always fetch the assignment with all relations to ensure we have complete data
        const verifyAssignment = await this.prisma.employeeAssignment.findUnique({
          where: { id: assignment.id },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            employee: {
              select: {
                id: true,
                employeeId: true,
                name: true,
                email: true,
                department: true,
                designation: true,
              },
            },
          },
        })

        if (!verifyAssignment) {
          throw new InternalServerErrorException(
            'Assignment was created but could not be verified in database',
          )
        }

        console.log('Assignment verified in database with relations:', {
          id: verifyAssignment.id,
          projectId: verifyAssignment.projectId,
          projectName: verifyAssignment.project?.name || 'NOT FOUND',
          projectCode: verifyAssignment.project?.code || 'NOT FOUND',
          hasProject: !!verifyAssignment.project,
          employeeId: verifyAssignment.employeeId,
          employeeCode: verifyAssignment.employee?.employeeId || 'NOT FOUND',
          employeeEmail: verifyAssignment.employee?.email || 'NOT FOUND',
          employeeName: verifyAssignment.employee?.name || 'NOT FOUND',
          hasEmployee: !!verifyAssignment.employee,
        })
        console.log('SUCCESS: Employee assignment has been saved to the database')

        // Use the verified assignment with all relations included
        assignment = verifyAssignment
      } catch (createError: any) {
        console.error('ERROR: Failed to create employee assignment in Prisma')
        console.error('Error details:', {
          code: createError.code,
          message: createError.message,
          meta: JSON.stringify(createError.meta, null, 2),
          stack: createError.stack,
        })
        console.error('Assignment data that failed:', JSON.stringify(assignmentData, null, 2))

        // Provide more specific error messages
        if (createError.code === 'P2002') {
          const target = createError.meta?.target
          const errorMessage =
            `Unique constraint violation on field(s): ${Array.isArray(target) ? target.join(', ') : target || 'unknown'}. ` +
            `An assignment with these values already exists.`
          console.error('Unique constraint error:', errorMessage)
          throw new ConflictException(errorMessage)
        }
        if (createError.code === 'P2003') {
          const field = createError.meta?.field_name
          const errorMessage =
            `Foreign key constraint violation on field: ${field || 'unknown'}. ` +
            `The referenced record (employee or project) does not exist. ` +
            `Employee ID: ${assignmentData.employeeId}, Project ID: ${assignmentData.projectId}`
          console.error('Foreign key constraint error:', errorMessage)
          throw new BadRequestException(errorMessage)
        }

        // Log the full error before re-throwing
        console.error('Unhandled Prisma error, re-throwing:', createError)
        throw createError // Re-throw to be handled by outer catch
      }

      // Format and return the response
      try {
        console.log('Step 6: Formatting assignment response')
        const formattedResponse = await this.formatAssignmentResponse(assignment)
        console.log('=== SUCCESS: Employee Assignment Created ===')
        console.log('Assignment ID:', assignment.id)
        console.log('Employee ID:', assignment.employeeId)
        console.log('Project ID:', assignment.projectId)
        console.log('Status:', assignment.status)
        console.log('=== END: Returning response to client ===')
        return formattedResponse
      } catch (formatError: any) {
        // Even if formatting fails, the assignment is already saved
        console.error('Error formatting assignment response, but assignment is saved:', formatError)

        // Try to get project name for fallback response
        let projectName = ''
        let projectCode = ''
        if (assignment.project) {
          projectName = assignment.project.name || ''
          projectCode = assignment.project.code || ''
        } else if (assignment.projectId) {
          try {
            const project = await this.prisma.project.findUnique({
              where: { id: assignment.projectId },
              select: { name: true, code: true },
            })
            if (project) {
              projectName = project.name || ''
              projectCode = project.code || ''
            }
          } catch (projectError: any) {
            console.error('Error fetching project for fallback response:', projectError.message)
          }
        }

        // Try to get employee photo and full employee code for fallback response
        let employeePhoto: string | null = null
        let fullEmployeeCode: string = assignment.employee?.employeeId || ''
        if (assignment.employee) {
          try {
            // First try to find by employeeCode
            let employeeMaster = await this.prisma.employeeMaster.findUnique({
              where: { employeeCode: assignment.employee.employeeId },
              select: { profilePhoto: true, employeeCode: true },
            })

            // If not found by employeeCode, try to find by email as fallback
            if (!employeeMaster && assignment.employee.email) {
              employeeMaster = await this.prisma.employeeMaster.findFirst({
                where: { email: assignment.employee.email },
                select: { profilePhoto: true, employeeCode: true },
              })
            }

            if (employeeMaster) {
              fullEmployeeCode = employeeMaster.employeeCode || assignment.employee.employeeId
              employeePhoto = employeeMaster.profilePhoto || null
            }
          } catch (photoError: any) {
            console.error('Error fetching employee data for fallback response:', photoError.message)
          }
        }

        // Return a basic response instead of failing
        return {
          id: assignment.id,
          employeeId: assignment.employeeId,
          employeeCode: fullEmployeeCode, // Use full employee code from EmployeeMaster
          employeePhoto: employeePhoto,
          projectId: assignment.projectId,
          projectName: projectName,
          projectCode: projectCode,
          role: assignment.role,
          allocationPercentage: assignment.allocationPercentage,
          startDate: assignment.startDate?.toISOString().split('T')[0] || '',
          endDate: assignment.endDate ? assignment.endDate.toISOString().split('T')[0] : null,
          status: assignment.status,
          message:
            'Assignment created successfully (some details may be missing due to formatting error)',
        }
      }
    } catch (error: any) {
      // Log the error for debugging
      console.error('Error creating employee assignment:', error)
      console.error('Error stack:', error.stack)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        meta: error.meta,
        name: error.name,
      })

      // Re-throw known HTTP exceptions
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error
      }

      // Handle Prisma errors
      if (error.code) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Unique constraint violation: ${error.meta?.target || 'unknown field'}`,
          )
        }
        if (error.code === 'P2003') {
          throw new BadRequestException(
            `Foreign key constraint violation: ${error.meta?.field_name || 'unknown field'}`,
          )
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(`Record not found: ${error.meta?.cause || 'Unknown'}`)
        }
      }

      // Wrap unknown errors as InternalServerErrorException
      throw new InternalServerErrorException(
        `Failed to create employee assignment: ${error.message || 'Unknown error'}`,
      )
    }
  }

  async findAll(employeeId?: string, projectId?: string, status?: string) {
    const where: any = {}

    // If employeeId is provided, try to find assignments by:
    // 1. Direct Employee.id match
    // 2. Employee.employeeId match (if employeeId is an employeeCode)
    // 3. EmployeeMaster relationship (if employeeId is EmployeeMaster.id)
    if (employeeId) {
      // First, try to find if this is an EmployeeMaster ID
      const employeeMaster = await this.prisma.employeeMaster.findUnique({
        where: { id: employeeId },
        select: { employeeCode: true, email: true },
      })

      if (employeeMaster) {
        // This is an EmployeeMaster ID, find Employee by employeeCode or email
        console.log('EmployeeMaster found, searching for Employee record:', {
          employeeCode: employeeMaster.employeeCode,
          email: employeeMaster.email,
        })

        const employee = await this.prisma.employee.findFirst({
          where: {
            OR: [{ employeeId: employeeMaster.employeeCode }, { email: employeeMaster.email }],
          },
          select: { id: true, employeeId: true, email: true },
        })

        console.log('Employee record found:', employee)

        if (employee) {
          where.employeeId = employee.id
        } else {
          // No Employee record found, but try to find assignments by searching all and matching
          // This handles cases where Employee might not exist but assignments do
          console.log('No Employee record found, trying alternative lookup...')
          // We'll search all assignments and filter by project/employee relationship
          // For now, return empty array - Employee record is required for assignments
          return []
        }
      } else {
        // Try as Employee.id directly
        const employee = await this.prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true },
        })

        if (employee) {
          where.employeeId = employee.id
        } else {
          // Try as Employee.employeeId (employeeCode)
          const employeeByCode = await this.prisma.employee.findFirst({
            where: { employeeId: employeeId },
            select: { id: true },
          })

          if (employeeByCode) {
            where.employeeId = employeeByCode.id
          } else {
            // No match found, return empty array
            return []
          }
        }
      }
    }

    if (projectId) where.projectId = projectId
    if (status) where.status = status

    console.log('Finding assignments with where clause:', JSON.stringify(where, null, 2))

    const assignments = await this.prisma.employeeAssignment.findMany({
      where,
      include: {
        employee: true,
        project: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log(`Found ${assignments.length} assignments`)

    const formattedAssignments = await Promise.all(
      assignments.map((assignment) => this.formatAssignmentResponse(assignment)),
    )
    console.log(`Formatted ${formattedAssignments.length} assignments`)

    return formattedAssignments
  }

  async findOne(id: string) {
    const assignment = await this.prisma.employeeAssignment.findUnique({
      where: { id },
      include: {
        employee: true,
        project: true,
      },
    })

    if (!assignment) {
      throw new NotFoundException('Employee assignment not found')
    }

    return await this.formatAssignmentResponse(assignment)
  }

  async update(id: string, updateEmployeeAssignmentDto: UpdateEmployeeAssignmentDto) {
    const assignment = await this.prisma.employeeAssignment.findUnique({
      where: { id },
    })

    if (!assignment) {
      throw new NotFoundException('Employee assignment not found')
    }

    const updated = await this.prisma.employeeAssignment.update({
      where: { id },
      data: {
        ...updateEmployeeAssignmentDto,
        startDate: updateEmployeeAssignmentDto.startDate
          ? new Date(updateEmployeeAssignmentDto.startDate)
          : undefined,
        endDate: updateEmployeeAssignmentDto.endDate
          ? new Date(updateEmployeeAssignmentDto.endDate)
          : undefined,
      },
      include: {
        employee: true,
        project: true,
      },
    })

    return await this.formatAssignmentResponse(updated)
  }

  async remove(id: string) {
    const assignment = await this.prisma.employeeAssignment.findUnique({
      where: { id },
    })

    if (!assignment) {
      throw new NotFoundException('Employee assignment not found')
    }

    await this.prisma.employeeAssignment.delete({
      where: { id },
    })
  }

  private async formatAssignmentResponse(assignment: any) {
    try {
      // Fetch department name if department ID exists
      let departmentName: string = ''
      if (assignment.employee?.department) {
        try {
          const department = await this.prisma.department.findUnique({
            where: { id: assignment.employee.department },
            select: { departmentName: true },
          })
          if (department?.departmentName) {
            departmentName = department.departmentName
            console.log('Department name fetched:', departmentName)
          } else {
            console.warn('Department not found with ID:', assignment.employee.department)
          }
        } catch (error: any) {
          console.error('Error fetching department:', error.message)
          // Don't use ID as fallback - leave it empty if lookup fails
          departmentName = ''
        }
      }

      // Fetch designation name if designation ID exists
      let designationName: string = ''
      if (assignment.employee?.designation) {
        try {
          const designation = await this.prisma.designation.findUnique({
            where: { id: assignment.employee.designation },
            select: { designationName: true },
          })
          if (designation?.designationName) {
            designationName = designation.designationName
            console.log('Designation name fetched:', designationName)
          } else {
            console.warn('Designation not found with ID:', assignment.employee.designation)
          }
        } catch (error: any) {
          console.error('Error fetching designation:', error.message)
          // Don't use ID as fallback - leave it empty if lookup fails
          designationName = ''
        }
      }

      // Fetch employee photo and full employee code from EmployeeMaster
      let employeePhoto: string | null = null
      let fullEmployeeCode: string = assignment.employee?.employeeId || ''

      console.log('Fetching EmployeeMaster data:', {
        employeeId: assignment.employee?.employeeId,
        email: assignment.employee?.email,
        name: assignment.employee?.name,
      })

      if (assignment.employee) {
        try {
          // Strategy 1: Try to find by employeeCode (Employee.employeeId should match EmployeeMaster.employeeCode)
          let employeeMaster = await this.prisma.employeeMaster.findUnique({
            where: { employeeCode: assignment.employee.employeeId },
            select: { profilePhoto: true, employeeCode: true },
          })

          // Strategy 2: If not found by employeeCode, try to find by email (more reliable)
          if (!employeeMaster && assignment.employee.email) {
            console.log(
              'EmployeeMaster not found by employeeCode, trying email lookup:',
              assignment.employee.email,
            )
            employeeMaster = await this.prisma.employeeMaster.findFirst({
              where: { email: assignment.employee.email },
              select: { profilePhoto: true, employeeCode: true },
            })
          }

          // Strategy 3: Try case-insensitive email search if still not found
          if (!employeeMaster && assignment.employee.email) {
            console.log('Trying case-insensitive email search')
            const employees = await this.prisma.employeeMaster.findMany({
              where: {
                email: {
                  equals: assignment.employee.email,
                  mode: 'insensitive',
                },
              },
              select: { profilePhoto: true, employeeCode: true },
              take: 1,
            })
            if (employees.length > 0) {
              employeeMaster = employees[0]
            }
          }

          if (employeeMaster) {
            // Use the full employee code from EmployeeMaster
            fullEmployeeCode = employeeMaster.employeeCode || assignment.employee.employeeId
            employeePhoto = employeeMaster.profilePhoto || null
            console.log('✅ Employee data fetched from EmployeeMaster:', {
              employeeCode: fullEmployeeCode,
              hasPhoto: !!employeePhoto,
              photoValue: employeePhoto ? 'Photo URL present' : 'No photo',
            })
          } else {
            console.warn('❌ EmployeeMaster not found for employee:', {
              employeeId: assignment.employee.employeeId,
              email: assignment.employee.email,
              name: assignment.employee.name,
            })
          }
        } catch (photoError: any) {
          console.error('❌ Error fetching employee data from EmployeeMaster:', photoError.message)
          console.error('Error stack:', photoError.stack)
          // Don't fail if lookup fails, use the employeeId as fallback
        }
      }

      // Fetch project name if project is not included or project name is missing
      let projectName: string = ''
      let projectCode: string = ''

      console.log('Fetching project data:', {
        hasProject: !!assignment.project,
        projectId: assignment.projectId,
        projectName: assignment.project?.name || 'NOT INCLUDED',
      })

      if (assignment.project) {
        // Project is already included
        projectName = assignment.project.name || ''
        projectCode = assignment.project.code || ''
        console.log('✅ Project data from included relation:', {
          name: projectName,
          code: projectCode,
        })
      } else if (assignment.projectId) {
        // Project is not included, fetch it
        try {
          console.log(
            '⚠️ Project not included in assignment, fetching project:',
            assignment.projectId,
          )
          const project = await this.prisma.project.findUnique({
            where: { id: assignment.projectId },
            select: { name: true, code: true },
          })
          if (project) {
            projectName = project.name || ''
            projectCode = project.code || ''
            console.log('✅ Project fetched successfully:', {
              name: projectName,
              code: projectCode,
            })
          } else {
            console.warn('❌ Project not found with ID:', assignment.projectId)
          }
        } catch (projectError: any) {
          console.error('❌ Error fetching project:', projectError.message)
          console.error('Error stack:', projectError.stack)
          // Use projectId as fallback
          projectName = assignment.projectId
        }
      } else {
        console.warn('⚠️ No projectId in assignment')
      }

      const response = {
        id: assignment.id,
        employeeId: assignment.employeeId,
        employeeName: assignment.employee?.name || '',
        employeeCode: fullEmployeeCode, // Use full employee code from EmployeeMaster
        employeePhoto: employeePhoto,
        designation: designationName || '', // Only use designation name, not ID
        department: departmentName || '', // Only use department name, not ID
        projectId: assignment.projectId,
        projectName: projectName,
        projectCode: projectCode,
        role: assignment.role,
        allocationPercentage: assignment.allocationPercentage,
        startDate: assignment.startDate?.toISOString().split('T')[0] || '',
        endDate: assignment.endDate ? assignment.endDate.toISOString().split('T')[0] : null,
        hourlyRate: assignment.hourlyRate,
        status:
          assignment.status === EmployeeAssignmentStatus.ACTIVE
            ? 'Active'
            : assignment.status === EmployeeAssignmentStatus.COMPLETED
              ? 'Completed'
              : assignment.status === EmployeeAssignmentStatus.ON_HOLD
                ? 'On Hold'
                : 'Cancelled',
        assignedDate: assignment.assignedDate?.toISOString().split('T')[0] || '',
        assignedBy: assignment.assignedBy,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      }

      console.log('✅ Formatted assignment response:', {
        id: response.id,
        employeeId: response.employeeId,
        employeeCode: response.employeeCode,
        employeeName: response.employeeName,
        employeePhoto: response.employeePhoto
          ? `Photo: ${response.employeePhoto.substring(0, 50)}...`
          : 'No photo',
        designation: response.designation,
        department: response.department,
        projectId: response.projectId,
        projectName: response.projectName,
        projectCode: response.projectCode,
      })

      return response
    } catch (error: any) {
      console.error('Error formatting assignment response:', error)
      console.error('Error stack:', error.stack)
      console.error('Assignment data:', {
        id: assignment?.id,
        projectId: assignment?.projectId,
        hasProject: !!assignment?.project,
        projectName: assignment?.project?.name,
      })
      throw new InternalServerErrorException(
        `Failed to format assignment response: ${error.message || 'Unknown error'}`,
      )
    }
  }
}
