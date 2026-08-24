import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import type { ContestoTrpc } from "../trpc/contesto";
import { caricaSessionePropria } from "./carica-sessione-propria";
import { ServizioSessioniAsta } from "./servizio-sessioni-asta";

const globale = globalThis as typeof globalThis & {
  __astaPrismaSessioni?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaSessioni !== undefined) {
    return globale.__astaPrismaSessioni;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaSessioni = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaSessioni;
}

/** Compone il servizio sessioni per il solo utente autenticato della richiesta. */
export function creaServizioSessioniAstaRuntime(
  contesto: ContestoTrpc & { readonly utente: NonNullable<ContestoTrpc["utente"]> },
): ServizioSessioniAsta {
  const repositories = creaRepositories(prismaRuntime());

  return new ServizioSessioniAsta({
    utenteId: contesto.utente.id,
    sessioniAsta: repositories.sessioniAsta,
    registro: repositories.registro,
    caricaSessionePropria: (sessioneAstaId) =>
      caricaSessionePropria(
        {
          tokenSessione: contesto.tokenSessione,
          autenticazione: contesto.autenticazione,
          sessioniAsta: repositories.sessioniAsta,
        },
        sessioneAstaId,
      ),
  });
}
