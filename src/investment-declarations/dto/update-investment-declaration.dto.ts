import { PartialType } from '@nestjs/mapped-types'
import { CreateInvestmentDeclarationDto } from './create-investment-declaration.dto'

export class UpdateInvestmentDeclarationDto extends PartialType(CreateInvestmentDeclarationDto) {}
