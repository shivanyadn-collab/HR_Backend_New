import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class CreateInvestmentDeclarationDto {
  @IsString()
  employeeMasterId: string;

  @IsString()
  financialYear: string;

  @IsString()
  section: string;

  @IsString()
  particulars: string;

  @IsNumber()
  @IsOptional()
  declaredAmount?: number;

  @IsBoolean()
  @IsOptional()
  proofSubmitted?: boolean;

  @IsNumber()
  @IsOptional()
  verifiedAmount?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  proofDocumentUrl?: string;

  @IsString()
  @IsOptional()
  verifiedBy?: string;

  @IsDateString()
  @IsOptional()
  verifiedDate?: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}
