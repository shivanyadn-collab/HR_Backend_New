import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator'

/** DC type in API: frontend sends "Returnable" or "NonReturnable" */
export type DcTypeApi = 'Returnable' | 'NonReturnable'

export class CreateEmployeeAssetDto {
  @IsString()
  employeeMasterId: string

  @IsString()
  assetItemId: string

  /** Returnable or NonReturnable - set at issuance; used for Acceptance Issuance Form and Return with DC */
  @IsOptional()
  @IsIn(['Returnable', 'NonReturnable'])
  dcType?: DcTypeApi

  /** Unique DC number at issuance (e.g. DC-20260131-1234); frontend may generate */
  @IsOptional()
  @IsString()
  issuanceDcNumber?: string

  /** URL to Asset Issuance Form document (e.g. S3); can be set when DC is created after issue */
  @IsOptional()
  @IsString()
  issuanceFormUrl?: string

  @IsOptional()
  @IsString()
  issuanceFormKey?: string

  @IsOptional()
  @IsString()
  serialNumber?: string

  @IsOptional()
  @IsDateString()
  issueDate?: string

  @IsOptional()
  @IsDateString()
  expectedReturnDate?: string

  @IsOptional()
  @IsString()
  condition?: string

  @IsOptional()
  @IsDateString()
  warrantyExpiryDate?: string

  @IsOptional()
  @IsString()
  location?: string

  @IsOptional()
  @IsString()
  remarks?: string

  @IsOptional()
  @IsString()
  issuedBy?: string
}
