import {
  AdattatoreListoneFileLocale,
  AdattatoreListoneQuotazioniUfficiali,
  type AdattatoreSorgenteListone,
} from "@asta/adapters";
import { creaRepositories, PrismaClient } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { creaAdattatoreStatisticheApiFootballDaAmbiente } from "./configura-api-football.js";
import { LimitatoreFrequenza } from "./limitatore-frequenza.js";
import { PipelineIngestione } from "./pipeline-ingestione.js";
import { RisolutoreIdentita } from "./risolutore-identita.js";

export function variabileObbligatoria(nome: string): string {
  const valore = process.env[nome]?.trim();
  if (!valore) throw new Error(`La variabile ${nome} e' obbligatoria`);
  return valore;
}

function creaAdattatoreListone(): AdattatoreSorgenteListone {
  const percorsoLocale = process.env.LISTONE_FILE_LOCALE?.trim();
  return percorsoLocale
    ? new AdattatoreListoneFileLocale(percorsoLocale)
    : new AdattatoreListoneQuotazioniUfficiali();
}

export interface ContestoIngestione {
  readonly prisma: PrismaClient;
  readonly pipeline: PipelineIngestione;
}

/**
 * Composizione unica della pipeline, condivisa dal processo pianificato e
 * dall'esecuzione singola avviata da uno scheduler esterno.
 */
export function creaContestoIngestione(): ContestoIngestione {
  const connectionString = variabileObbligatoria("DATABASE_URL");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const repositories = creaRepositories(prisma);
  const pipeline = new PipelineIngestione(
    {
      stagioneListone: variabileObbligatoria("STAGIONE_LISTONE"),
      stagioneStatistiche: variabileObbligatoria("STAGIONE_STATISTICHE"),
    },
    {
      listone: creaAdattatoreListone(),
      statistiche: creaAdattatoreStatisticheApiFootballDaAmbiente(),
      limitatore: new LimitatoreFrequenza(repositories.freschezza),
      risolutoreIdentita: new RisolutoreIdentita(repositories.aliasGiocatori),
      freschezza: repositories.freschezza,
      ingestione: repositories.ingestione,
    },
  );

  return { prisma, pipeline };
}
