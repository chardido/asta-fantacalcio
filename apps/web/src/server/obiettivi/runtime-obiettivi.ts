import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import type { ContestoTrpc } from "../trpc/contesto";
import { ServizioObiettivi } from "./servizio-obiettivi";

const globale = globalThis as typeof globalThis & {
  __astaPrismaObiettivi?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaObiettivi !== undefined) {
    return globale.__astaPrismaObiettivi;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaObiettivi = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaObiettivi;
}

/** Compone il servizio obiettivi con snapshot pubblicato e guardia centralizzata di proprietà. */
export function creaServizioObiettiviRuntime(
  contesto: ContestoTrpc & {
    readonly utente: NonNullable<ContestoTrpc["utente"]>;
  },
): ServizioObiettivi {
  const repositories = creaRepositories(prismaRuntime());

  return new ServizioObiettivi({
    obiettivi: repositories.obiettivi,
    registro: repositories.registro,
    snapshot: repositories.snapshot,
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
