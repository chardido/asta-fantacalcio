import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import type { ContestoTrpc } from "../trpc/contesto";
import { ServizioRegistro } from "./servizio-registro";

const globale = globalThis as typeof globalThis & {
  __astaPrismaRegistro?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaRegistro !== undefined) {
    return globale.__astaPrismaRegistro;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaRegistro = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaRegistro;
}

/** Compone il servizio registro con guardia di proprietà e transazione autorevole. */
export function creaServizioRegistroRuntime(
  contesto: ContestoTrpc & {
    readonly utente: NonNullable<ContestoTrpc["utente"]>;
  },
): ServizioRegistro {
  const repositories = creaRepositories(prismaRuntime());

  return new ServizioRegistro({
    transazioniRegistro: repositories.transazioniRegistro,
    registro: repositories.registro,
    avversari: repositories.avversari,
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
