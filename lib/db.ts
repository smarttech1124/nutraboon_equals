import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * Shared client, created on first use so modules can be imported without a
 * database. Reused across dev hot reloads to avoid exhausting connections.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPrisma.prisma = createPrismaClient(url);
  }
  return globalForPrisma.prisma;
}
