import { creaContestoIngestione } from "./composizione.js";
import { avviaPianificatoreIngestione } from "./pianificatore.js";

async function main(): Promise<void> {
  const { prisma, pipeline } = creaContestoIngestione();

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
