import { IsString, IsDateString, IsOptional, IsEnum, IsInt } from 'class-validator'
import { EmployeeMasterStatus } from '@prisma/client'

export class CreateEmployeeMasterDto {
  @IsOptional()
  @IsString()
  employeeCode?: string

  @IsString()
  firstName: string

  @IsString()
  lastName: string

  @IsString()
  email: string

  @IsString()
  phone: string

  @IsOptional()
  @IsString()
  alternatePhone?: string

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string

  @IsOptional()
  @IsString()
  gender?: string

  @IsOptional()
  @IsString()
  maritalStatus?: string

  @IsOptional()
  @IsString()
  bloodGroup?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  designationId?: string

  @IsOptional()
  @IsString()
  employeeType?: string

  @IsOptional()
  @IsDateString()
  joiningDate?: string

  @IsOptional()
  @IsDateString()
  confirmationDate?: string

  @IsOptional()
  @IsString()
  reportingManagerId?: string

  @IsOptional()
  @IsString()
  reportingManager?: string

  @IsOptional()
  @IsString()
  workLocationId?: string

  @IsOptional()
  @IsString()
  workLocation?: string

  @IsOptional()
  @IsString()
  shiftId?: string

  @IsOptional()
  @IsString()
  salaryTemplateId?: string

  @IsOptional()
  @IsString()
  panNumber?: string

  @IsOptional()
  @IsString()
  aadharNumber?: string

  @IsOptional()
  @IsString()
  uanNumber?: string

  @IsOptional()
  @IsString()
  pfAccountNumber?: string

  @IsOptional()
  @IsString()
  esicNumber?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  state?: string

  @IsOptional()
  @IsString()
  zipCode?: string

  @IsOptional()
  @IsString()
  country?: string

  @IsOptional()
  @IsString()
  emergencyContactName?: string

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string

  @IsOptional()
  @IsEnum(EmployeeMasterStatus)
  status?: EmployeeMasterStatus

  @IsOptional()
  @IsString()
  profilePhoto?: string

  @IsOptional()
  @IsString()
  userId?: string

  // Additional personal information
  @IsOptional()
  @IsString()
  parentRelationType?: string

  @IsOptional()
  @IsString()
  parentName?: string

  @IsOptional()
  @IsString()
  motherName?: string

  @IsOptional()
  @IsString()
  nationality?: string

  @IsOptional()
  @IsString()
  religion?: string

  @IsOptional()
  @IsInt()
  experience?: number

  @IsOptional()
  @IsString()
  education?: string

  @IsOptional()
  @IsString()
  languages?: string

  // Bank details
  @IsOptional()
  @IsString()
  bankName?: string

  @IsOptional()
  @IsString()
  accountNumber?: string

  @IsOptional()
  @IsString()
  ifscCode?: string

  @IsOptional()
  @IsString()
  branchName?: string

  @IsOptional()
  @IsString()
  accountHolderName?: string
}
