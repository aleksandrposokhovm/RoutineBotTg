import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', '..', 'prisma', 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: dbPath });

const prisma = new PrismaClient({ adapter });

export default prisma;
