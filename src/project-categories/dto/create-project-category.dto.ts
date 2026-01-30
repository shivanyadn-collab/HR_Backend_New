import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator'

export class CreateProjectCategoryDto {
  @IsString()
  categoryName: string

  @IsString()
  categoryCode: string

  @IsString()
  description: string

  @IsOptional()
  @IsString()
  color?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
