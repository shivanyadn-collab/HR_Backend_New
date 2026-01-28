import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function linkEmployeesToUsers() {
  console.log('Starting to link employees to users...')

  // Get all employees without userId
  const employeesWithoutUser = await prisma.employeeMaster.findMany({
    where: {
      userId: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  })

  console.log(`Found ${employeesWithoutUser.length} employees without linked users`)

  let linkedCount = 0
  let notFoundCount = 0

  for (const employee of employeesWithoutUser) {
    // Find user with matching email (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: employee.email,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (user) {
      // Link the employee to the user
      await prisma.employeeMaster.update({
        where: { id: employee.id },
        data: { userId: user.id },
      })

      // Also update user's employeeId if not set
      await prisma.user.update({
        where: { id: user.id },
        data: { employeeId: employee.id },
      })

      console.log(`✓ Linked: ${employee.firstName} ${employee.lastName} (${employee.email}) -> User: ${user.name}`)
      linkedCount++
    } else {
      console.log(`✗ No user found for: ${employee.firstName} ${employee.lastName} (${employee.email})`)
      notFoundCount++
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Total employees without users: ${employeesWithoutUser.length}`)
  console.log(`Successfully linked: ${linkedCount}`)
  console.log(`No matching user found: ${notFoundCount}`)
}

linkEmployeesToUsers()
  .then(() => {
    console.log('\nDone!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
