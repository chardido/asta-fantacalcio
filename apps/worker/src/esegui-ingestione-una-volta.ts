import { creaContestoIngestione } from "./composizione.js";
import type { EsitoEsecuzioneIngestione } from "./pipeline-ingestione.js";

/** L'esito è un fallimento solo quando almeno un canale non ha completato. */
export function uscitaPerEsito(esito: EsitoEsecuzioneIngestione): number {
  return esito.stato === "fallito" ? 1 : 0;
}

/**
 * Esecuzione singola pensata per uno scheduler esterno: nessun cron interno,
 * il processo termina appena l'ingestione è conclusa. Il lock persistente in
 * database resta la protezione autorevole contro esecuzioni sovrapposte.
 */
async function main(): Promise<void> {
  const { prisma, pipeline } = creaContestoIngestione();
  const forzata = process.env.FORZA_INGESTIONE?.trim() === "1";

  try {
    const esito = forzata
      ? await pipeline.esegui()
      : await pipeline.eseguiSeNecessario();
    console.log(`[worker] esito ingestione: ${JSON.stringify(esito)}`);
    process.exitCode = uscitaPerEsito(esito);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((errore: unknown) => {
  console.error("[worker] ingestione non completata", errore);
  process.exitCode = 1;
});
