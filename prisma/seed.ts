import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    const username = process.env.AUTH_USERNAME || 'admin';
    const password = process.env.AUTH_PASSWORD || 'design2026';

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        console.log(`User "${username}" already exists, skipping seed.`);
        return;
    }

    const hashedPassword = password.startsWith('$2a$') || password.startsWith('$2b$')
        ? password
        : await bcrypt.hash(password, 10);

    await prisma.user.create({
        data: { username, password: hashedPassword },
    });

    console.log(`Admin user "${username}" created.`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
