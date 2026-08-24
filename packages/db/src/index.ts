// Persistenza: schema Prisma, migrazioni, repository e confini JSONB validati.

export { Prisma, PrismaClient } from "@prisma/client";
export * from "./canale-eventi.js";
export * from "./jsonb.js";
export * from "./repository-contracts.js";
export * from "./repositories.js";

export const DB_PACKAGE_NAME = "@asta/db";
