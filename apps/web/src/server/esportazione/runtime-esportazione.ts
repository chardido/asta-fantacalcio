import { createHash } from "node:crypto";

import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import { leggiCookie } from "../trpc/contesto";
import { ServizioEsportazione } from "./servizio-esportazione";

const DURATA_INATTIVITA_MS = 24 * 60 * 60 * 1000;
const INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS = 60 * 1000;

const globale = globalThis as typeof globalThis & {
  __astaPrismaEsportazione?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaEsportazione !== undefined) {
    return globale.__astaPrismaEsportazione;
  }
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }
  globale.__astaPrismaEsportazione = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaEsportazione;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Costruisce il servizio protetto usando il sid della singola richiesta. */
export function creaServizioEsportazionePerRichiesta(
  richiesta: Request,
): ServizioEsportazione {
  const prisma = prismaRuntime();
  const repositories = creaRepositories(prisma);
  const tokenSessione = leggiCookie(richiesta.headers.get("cookie"), "sid");
  const autenticazione = {
    risolvi: async (token: string) => {
      const ora = new Date();
      const sessione = await prisma.sessioneAuth.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { utente: true },
      });
      if (
        sessione === null ||
        sessione.revocataIl !== null ||
        ora.getTime() - sessione.ultimaAttivitaIl.getTime() >= DURATA_INATTIVITA_MS ||
        ora >= sessione.scadeIlAssoluto
      ) {
        return null;
      }
      if (
        ora.getTime() - sessione.ultimaAttivitaIl.getTime() >=
        INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS
      ) {
        await prisma.sessioneAuth.updateMany({
          where: {
            id: sessione.id,
            ultimaAttivitaIl: {
              lte: new Date(
                ora.getTime() - INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS,
              ),
            },
          },
          data: { ultimaAttivitaIl: ora },
        });
      }
      return {
        id: sessione.utente.id,
        email: sessione.utente.emailVisualizzata,
        creatoIl: sessione.utente.creatoIl,
      };
    },
  };

  return new ServizioEsportazione({
    caricaSessionePropria: (sessioneAstaId) =>
      caricaSessionePropria(
        {
          tokenSessione,
          autenticazione,
          sessioniAsta: repositories.sessioniAsta,
        },
        sessioneAstaId,
      ),
    registro: repositories.registro,
    avversari: repositories.avversari,
    transazioniRegistro: repositories.transazioniRegistro,
  });
}
