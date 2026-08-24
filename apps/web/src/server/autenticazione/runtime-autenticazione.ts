import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { ServizioAutenticazione } from "./servizio-autenticazione";

const globale = globalThis as typeof globalThis & {
  __astaPrismaAutenticazione?: PrismaClient;
  __astaServizioAutenticazione?: ServizioAutenticazione;
};

function prismaAutenticazione(): PrismaClient {
  if (globale.__astaPrismaAutenticazione !== undefined) {
    return globale.__astaPrismaAutenticazione;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaAutenticazione = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaAutenticazione;
}

/** Composition root condivisa dai tre route handler di autenticazione. */
export function servizioAutenticazioneRuntime(): ServizioAutenticazione {
  if (globale.__astaServizioAutenticazione !== undefined) {
    return globale.__astaServizioAutenticazione;
  }

  const repositories = creaRepositories(prismaAutenticazione());
  globale.__astaServizioAutenticazione = new ServizioAutenticazione(
    repositories.utenti,
    repositories.sessioniAuth,
  );
  return globale.__astaServizioAutenticazione;
}
