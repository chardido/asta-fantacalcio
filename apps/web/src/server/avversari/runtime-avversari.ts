import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import type { ContestoTrpc } from "../trpc/contesto";
import { ServizioAvversari } from "./servizio-avversari";

const globale = globalThis as typeof globalThis & {
  __astaPrismaAvversari?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaAvversari !== undefined) {
    return globale.__astaPrismaAvversari;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaAvversari = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaAvversari;
}

/** Compone il servizio avversari con la guardia centralizzata di proprietà. */
export function creaServizioAvversariRuntime(
  contesto: ContestoTrpc & {
    readonly utente: NonNullable<ContestoTrpc["utente"]>;
  },
): ServizioAvversari {
  const repositories = creaRepositories(prismaRuntime());

  return new ServizioAvversari({
    avversari: repositories.avversari,
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
