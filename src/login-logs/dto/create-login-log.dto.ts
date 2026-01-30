import { IsString, IsOptional, IsEnum } from 'class-validator'

export enum LoginLogStatus {
  Success = 'Success',
  Failed = 'Failed',
}

export class CreateLoginLogDto {
  @IsOptional()
  @IsString()
  userId?: string

  @IsString()
  userName: string

  @IsOptional()
  @IsString()
  userCode?: string

  @IsString()
  email: string

  @IsString()
  ipAddress: string

  @IsString()
  device: string

  @IsString()
  browser: string

  @IsOptional()
  @IsString()
  location?: string

  @IsEnum(LoginLogStatus)
  status: LoginLogStatus

  @IsOptional()
  @IsString()
  failureReason?: string
}
