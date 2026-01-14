import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProjectCategoryDto } from './dto/create-project-category.dto'
import { UpdateProjectCategoryDto } from './dto/update-project-category.dto'

@Injectable()
export class ProjectCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createProjectCategoryDto: CreateProjectCategoryDto) {
    // Check if category code already exists
    const existing = await this.prisma.projectCategory.findUnique({
      where: { categoryCode: createProjectCategoryDto.categoryCode },
    })

    if (existing) {
      throw new BadRequestException('Category code already exists')
    }

    // Validate locationIds if provided
    if (createProjectCategoryDto.locationIds && createProjectCategoryDto.locationIds.length > 0) {
      for (const locationId of createProjectCategoryDto.locationIds) {
        const location = await this.prisma.location.findUnique({
          where: { id: locationId },
        })
        if (!location) {
          throw new BadRequestException(`Location with id ${locationId} not found`)
        }
      }
    }

    const created = await this.prisma.projectCategory.create({
      data: {
        ...createProjectCategoryDto,
        locationIds: createProjectCategoryDto.locationIds || [],
        isActive: createProjectCategoryDto.isActive ?? true,
      } as any,
    })

    // Fetch locations for the created category
    const locationIds = (created as any).locationIds || []
    const locations = locationIds.length > 0 ? await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: {
        id: true,
        branchName: true,
        branchCode: true,
      },
    }) : []

    return {
      ...created,
      projectCount: 0,
      locations,
    }
  }

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {}
    const categories = await this.prisma.projectCategory.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Fetch all unique location IDs
    const allLocationIds = new Set<string>()
    categories.forEach((category: any) => {
      if (category.locationIds && Array.isArray(category.locationIds)) {
        category.locationIds.forEach((id: string) => allLocationIds.add(id))
      }
    })

    // Fetch locations
    const locations = await this.prisma.location.findMany({
      where: { id: { in: Array.from(allLocationIds) } },
      select: {
        id: true,
        branchName: true,
        branchCode: true,
      },
    })

    const locationMap = new Map(locations.map(loc => [loc.id, loc]))

    // Calculate project count and attach locations for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category: any) => {
        const projectCount = await this.prisma.project.count({ 
          where: { categoryId: category.id } 
        })
        
        // Map locationIds to location objects
        const categoryLocations = (category.locationIds || [])
          .map((id: string) => locationMap.get(id))
          .filter(Boolean)

        return {
          ...category,
          projectCount,
          locations: categoryLocations,
        }
      })
    )

    return categoriesWithCount
  }

  async findOne(id: string) {
    const category = await this.prisma.projectCategory.findUnique({
      where: { id },
    })

    if (!category) {
      throw new NotFoundException('Project category not found')
    }

    const projectCount = await this.prisma.project.count({ 
      where: { categoryId: category.id } 
    })

    // Fetch locations for this category
    const locationIds = (category as any).locationIds || []
    const locations = locationIds.length > 0 ? await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: {
        id: true,
        branchName: true,
        branchCode: true,
      },
    }) : []

    return {
      ...category,
      projectCount,
      locations,
    }
  }

  async update(id: string, updateProjectCategoryDto: UpdateProjectCategoryDto) {
    const category = await this.prisma.projectCategory.findUnique({
      where: { id },
    })

    if (!category) {
      throw new NotFoundException('Project category not found')
    }

    // Check if category code is being updated and if it conflicts
    if (updateProjectCategoryDto.categoryCode && updateProjectCategoryDto.categoryCode !== category.categoryCode) {
      const existing = await this.prisma.projectCategory.findUnique({
        where: { categoryCode: updateProjectCategoryDto.categoryCode },
      })

      if (existing) {
        throw new BadRequestException('Category code already exists')
      }
    }

    // Validate locationIds if provided
    if (updateProjectCategoryDto.locationIds !== undefined) {
      if (updateProjectCategoryDto.locationIds && updateProjectCategoryDto.locationIds.length > 0) {
        for (const locationId of updateProjectCategoryDto.locationIds) {
          const location = await this.prisma.location.findUnique({
            where: { id: locationId },
          })
          if (!location) {
            throw new BadRequestException(`Location with id ${locationId} not found`)
          }
        }
      }
    }

    const updated = await this.prisma.projectCategory.update({
      where: { id },
      data: {
        ...updateProjectCategoryDto,
        locationIds: updateProjectCategoryDto.locationIds !== undefined 
          ? (updateProjectCategoryDto.locationIds || [])
          : undefined,
      } as any,
    })

    // Fetch locations for the updated category
    const locationIds = (updated as any).locationIds || []
    const locations = locationIds.length > 0 ? await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: {
        id: true,
        branchName: true,
        branchCode: true,
      },
    }) : []

    const projectCount = await this.prisma.project.count({ 
      where: { categoryId: updated.id } 
    })

    return {
      ...updated,
      projectCount,
      locations,
    }
  }

  async remove(id: string) {
    const category = await this.prisma.projectCategory.findUnique({
      where: { id },
    })

    if (!category) {
      throw new NotFoundException('Project category not found')
    }

    // TODO: Check if projects exist for this category before deletion
    // const projectCount = await this.prisma.project.count({ where: { categoryId: id } })
    // if (projectCount > 0) {
    //   throw new BadRequestException(`Cannot delete category. ${projectCount} project(s) are assigned to this category.`)
    // }

    return this.prisma.projectCategory.delete({
      where: { id },
    })
  }

  async toggleActive(id: string) {
    const category = await this.prisma.projectCategory.findUnique({
      where: { id },
    })

    if (!category) {
      throw new NotFoundException('Project category not found')
    }

    const updated = await this.prisma.projectCategory.update({
      where: { id },
      data: { isActive: !category.isActive },
    })

    // Fetch locations for the updated category
    const locationIds = (updated as any).locationIds || []
    const locations = locationIds.length > 0 ? await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: {
        id: true,
        branchName: true,
        branchCode: true,
      },
    }) : []

    const projectCount = await this.prisma.project.count({ 
      where: { categoryId: updated.id } 
    })

    return {
      ...updated,
      projectCount,
      locations,
    }
  }
}

