import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import type { ContestoTrpc } from "../trpc/contesto";
import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import { ServizioConfigurazione } from "./servizio-configurazione";

const NOME_SORGENTE_LISTONE_PREDEFINITO = "listone-quotazioni-ufficiali";
const NOME_SORGENTE_STATISTICHE_PREDEFINITO = "api-football";

const globale = globalThis as typeof globalThis & {
  __astaPrismaConfigurazione?: PrismaClient;
};

type ContestoAutenticato = ContestoTrpc & {
  readonly utente: NonNullable<ContestoTrpc["utente"]>;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaConfigurazione !== undefined) {
    return globale.__astaPrismaConfigurazione;
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }

  globale.__astaPrismaConfigurazione = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaConfigurazione;
}

function dipendenzeRuntime(contesto: ContestoAutenticato) {
  const repositories = creaRepositories(prismaRuntime());
  const caricaPropria = (sessioneAstaId: string) =>
    caricaSessionePropria(
      {
        tokenSessione: contesto.tokenSessione,
        autenticazione: contesto.autenticazione,
        sessioniAsta: repositories.sessioniAsta,
      },
      sessioneAstaId,
    );

  return { repositories, caricaPropria };
}

/** Compone il servizio di configurazione dietro la guardia unica di proprietà. */
export function creaServizioConfigurazioneRuntime(
  contesto: ContestoAutenticato,
): ServizioConfigurazione {
  const { repositories, caricaPropria } = dipendenzeRuntime(contesto);
  return new ServizioConfigurazione({
    sessioniAsta: repositories.sessioniAsta,
    registro: repositories.registro,
    caricaSessionePropria: caricaPropria,
  });
}

export interface StatoFreschezzaConfigurazione {
  readonly nomeSorgente: string;
  readonly ultimoSuccessoIl: string | null;
  readonly ultimoTentativoIl: string | null;
  readonly ultimoEsito:
    | "mai_eseguito"
    | "successo"
    | "errore"
    | "limite_frequenza"
    | "timeout"
    | "dati_non_validi";
}

/** Legge le due sorgenti della stagione della sessione, anche prima del primo snapshot. */
export async function caricaFreschezzaConfigurazioneRuntime(
  contesto: ContestoAutenticato,
  sessioneAstaId: string,
): Promise<readonly StatoFreschezzaConfigurazione[]> {
  const { repositories, caricaPropria } = dipendenzeRuntime(contesto);
  const sessione = await caricaPropria(sessioneAstaId);
  const snapshot = await repositories.snapshot.trovaPubblicato(
    sessione.stagioneListone,
  );
  const sorgenti = [
    {
      nome:
        snapshot?.nomeSorgenteListone ??
        NOME_SORGENTE_LISTONE_PREDEFINITO,
      stagione: sessione.stagioneListone,
    },
    {
      nome:
        snapshot?.nomeSorgenteStatistiche ??
        NOME_SORGENTE_STATISTICHE_PREDEFINITO,
      stagione: snapshot?.stagioneStatistiche ?? sessione.stagioneListone,
    },
  ] as const;

  return Promise.all(
    sorgenti.map(async ({ nome, stagione }) => {
      const stato = await repositories.freschezza.trova(nome, stagione);
      return {
        nomeSorgente: nome,
        ultimoSuccessoIl: stato?.ultimoSuccessoIl?.toISOString() ?? null,
        ultimoTentativoIl: stato?.ultimoTentativoIl.toISOString() ?? null,
        ultimoEsito: stato?.ultimoEsito ?? "mai_eseguito",
      } satisfies StatoFreschezzaConfigurazione;
    }),
  );
}
