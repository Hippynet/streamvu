import { PrismaClient, GlobalRole, OrgMemberRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ==========================================================================
  // SUPER ADMIN (Platform Admin)
  // ==========================================================================
  const adminPasswordHash = await bcrypt.hash('admin123', 12)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@streamvu.local' },
    update: {},
    create: {
      email: 'admin@streamvu.local',
      passwordHash: adminPasswordHash,
      name: 'Super Admin',
      globalRole: GlobalRole.SUPER_ADMIN,
    },
  })

  // Create admin's organization
  const adminOrg = await prisma.organization.upsert({
    where: { slug: 'platform-admin' },
    update: {},
    create: {
      name: 'Platform Admin',
      slug: 'platform-admin',
      maxStreams: 999,
      maxUsers: 999,
      maxCallRooms: 999,
      apiEnabled: true,
    },
  })

  // Link admin to their org as owner
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: adminOrg.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      organizationId: adminOrg.id,
      userId: adminUser.id,
      role: OrgMemberRole.OWNER,
    },
  })

  console.log(`✅ Admin user created: ${adminUser.email}`)
  console.log(`   Organization: ${adminOrg.name} (${adminOrg.slug})`)

  // ==========================================================================
  // DEMO ORGANIZATION
  // ==========================================================================
  const demoPasswordHash = await bcrypt.hash('demo123', 12)

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@streamvu.local' },
    update: {},
    create: {
      email: 'demo@streamvu.local',
      passwordHash: demoPasswordHash,
      name: 'Demo User',
      globalRole: GlobalRole.USER,
    },
  })

  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-radio' },
    update: {},
    create: {
      name: 'Demo Radio Station',
      slug: 'demo-radio',
      maxStreams: 5,
      maxUsers: 3,
      maxCallRooms: 10,
      apiEnabled: false,
      primaryColor: '#3B82F6',
    },
  })

  // Link demo user to their org as owner
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: demoOrg.id,
        userId: demoUser.id,
      },
    },
    update: {},
    create: {
      organizationId: demoOrg.id,
      userId: demoUser.id,
      role: OrgMemberRole.OWNER,
    },
  })

  // Create demo streams
  const demoStreams = [
    {
      name: 'Main Studio',
      url: 'https://stream.example.com:8000/main',
      mountPoint: '/main',
      displayOrder: 0,
    },
    {
      name: 'Outside Broadcast 1',
      url: 'https://stream.example.com:8000/ob1',
      mountPoint: '/ob1',
      displayOrder: 1,
    },
    {
      name: 'Outside Broadcast 2',
      url: 'https://stream.example.com:8000/ob2',
      mountPoint: '/ob2',
      displayOrder: 2,
    },
  ]

  for (const streamData of demoStreams) {
    await prisma.stream.upsert({
      where: {
        organizationId_url: {
          organizationId: demoOrg.id,
          url: streamData.url,
        },
      },
      update: {},
      create: {
        ...streamData,
        organizationId: demoOrg.id,
      },
    })
  }

  console.log(`✅ Demo user created: ${demoUser.email}`)
  console.log(`   Organization: ${demoOrg.name} (${demoOrg.slug})`)
  console.log(`   Streams: ${demoStreams.length}`)

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n📋 Login credentials:')
  console.log('   Admin: admin@streamvu.local / admin123')
  console.log('   Demo:  demo@streamvu.local / demo123')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
