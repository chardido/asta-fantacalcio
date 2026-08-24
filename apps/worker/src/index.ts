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
import { avviaPianificatoreIngestione } from "./pianificatore.js";
import { RisolutoreIdentita } from "./risolutore-identita.js";

function variabileObbligatoria(nome: string): string {
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

async function main(): Promise<void> {
  const connectionString = variabileObbligatoria("DATABASE_URL");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const repositories = creaRepositories(prisma);
  const listone = creaAdattatoreListone();
  const statistiche = creaAdattatoreStatisticheApiFootballDaAmbiente();
  const pipeline = new PipelineIngestione(
    {
      stagioneListone: variabileObbligatoria("STAGIONE_LISTONE"),
      stagioneStatistiche: variabileObbligatoria("STAGIONE_STATISTICHE"),
    },
    {
      listone,
      statistiche,
      limitatore: new LimitatoreFrequenza(repositories.freschezza),
      risolutoreIdentita: new RisolutoreIdentita(
        repositories.aliasGiocatori,
      ),
      freschezza: repositories.freschezza,
      ingestione: repositories.ingestione,
    },
  );

  avviaPianificatoreIngestione(pipeline, (errore) => {
    console.error("[worker] ingestione fallita", errore);
  });
  console.log(
    "[worker] pianificatore attivo: 05:00 Europe/Rome, con controllo iniziale",
  );

  const termina = async (): Promise<void> => {
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void termina());
  process.once("SIGTERM", () => void termina());
}

void main().catch((errore: unknown) => {
  console.error("[worker] avvio fallito", errore);
  process.exitCode = 1;
});
