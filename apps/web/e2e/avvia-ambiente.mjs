import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { Client } from "pg";
import {
  GenericContainer,
  Wait,
} from "testcontainers";

const cartellaCorrente = dirname(fileURLToPath(import.meta.url));
const radiceRepository = resolve(cartellaCorrente, "../../..");
const cartellaWeb = resolve(radiceRepository, "apps/web");
const cartellaMigrazioni = resolve(
  radiceRepository,
  "packages/db/prisma/migrations",
);

const STAGIONE_LISTONE = "e2e-2026";
const STAGIONE_STATISTICHE = "e2e-2025";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000150";

const giocatori = [
  {
    id: "e2e-portiere",
    nome: "Portiere E2E",
    squadra: "Torino",
    ruoloClassic: "P",
    ruoliMantra: ["Por"],
    quotazione: 8,
    statTattiche: {
      macroReparto: "POR",
      parate: 90,
      golSubiti: 28,
      cleanSheet: 12,
      rigoriParati: 2,
      stagione: STAGIONE_STATISTICHE,
    },
  },
  {
    id: "e2e-difensore",
    nome: "Difensore E2E",
    squadra: "Milano",
    ruoloClassic: "D",
    ruoliMantra: ["Dc"],
    quotazione: 14,
    statTattiche: {
      macroReparto: "DIF",
      cleanSheetSquadra: 13,
      duelliDifensiviVinti: 72,
      contrasti: 48,
      precisionePassaggiMilli: 842,
      stagione: STAGIONE_STATISTICHE,
    },
  },
  {
    id: "e2e-centrocampista",
    nome: "Centrocampista E2E",
    squadra: "Roma",
    ruoloClassic: "C",
    ruoliMantra: ["C"],
    quotazione: 20,
    statTattiche: {
      macroReparto: "CEN",
      assist: 8,
      passaggiChiave: 55,
      precisionePassaggiMilli: 865,
      tiri: 42,
      stagione: STAGIONE_STATISTICHE,
    },
  },
  {
    id: "e2e-attaccante",
    nome: "Attaccante E2E",
    squadra: "Napoli",
    ruoloClassic: "A",
    ruoliMantra: ["Pc"],
    quotazione: 30,
    statTattiche: {
      macroReparto: "ATT",
      gol: 18,
      tiri: 80,
      tiriNelloSpecchio: 45,
      golAttesiMilli: 16_500,
      stagione: STAGIONE_STATISTICHE,
    },
  },
  {
    id: "e2e-riserva-avversaria",
    nome: "Riserva Avversaria E2E",
    squadra: "Bologna",
    ruoloClassic: "A",
    ruoliMantra: ["A"],
    quotazione: 12,
    statTattiche: {
      macroReparto: "ATT",
      gol: 7,
      tiri: 38,
      tiriNelloSpecchio: 19,
      golAttesiMilli: 7_200,
      stagione: STAGIONE_STATISTICHE,
    },
  },
];

const statFantacalcio = {
  mediaVotoMilli: 6_300,
  fantamediaMilli: 7_100,
  presenze: 30,
  gol: 8,
  assist: 5,
  ammonizioni: 3,
  espulsioni: 0,
  rigoriParati: 0,
  rigoriSbagliati: 0,
  autogol: 0,
  stagione: STAGIONE_STATISTICHE,
};

async function applicaSql(container, sql) {
  const risultato = await container.exec([
    "psql",
    "--username=postgres",
    "--dbname=asta_e2e",
    "--set=ON_ERROR_STOP=1",
    "--command",
    sql,
  ]);
  if (risultato.exitCode !== 0) {
    throw new Error(`Migrazione E2E non applicata: ${risultato.output}`);
  }
}

async function preparaSchema(container) {
  const iniziale = await readFile(
    resolve(
      cartellaMigrazioni,
      "20260308120000_schema_iniziale/migration.sql",
    ),
    "utf8",
  );
  const lockIngestione = await readFile(
    resolve(
      cartellaMigrazioni,
      "20260310120000_lock_ingestione/migration.sql",
    ),
    "utf8",
  );

  await applicaSql(container, iniziale);
  await applicaSql(
    container,
    'CREATE UNIQUE INDEX "ux_registro_giocatore_attivo" ON "voce_registro_acquisti"("sessione_asta_id", "identificativo_giocatore") WHERE "annullata_il" IS NULL;',
  );
  await applicaSql(container, lockIngestione);
}

async function seminaSnapshot(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO snapshot_dati (
        id, stagione_listone, stagione_statistiche, stato, num_giocatori,
        nome_sorgente_listone, nome_sorgente_statistiche, hash_contenuto
      ) VALUES ($1, $2, $3, 'consultabile', $4, $5, $6, $7)`,
      [
        SNAPSHOT_ID,
        STAGIONE_LISTONE,
        STAGIONE_STATISTICHE,
        giocatori.length,
        "listone-e2e",
        "statistiche-e2e",
        "e".repeat(64),
      ],
    );

    for (const giocatore of giocatori) {
      await client.query(
        `INSERT INTO giocatore_snapshot (
          snapshot_id, identificativo_giocatore, nome, nome_ricerca,
          squadra, ruolo_classic, ruoli_mantra, quotazione,
          stat_fantacalcio, stat_tattiche
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
        [
          SNAPSHOT_ID,
          giocatore.id,
          giocatore.nome,
          giocatore.nome.toLocaleLowerCase("it"),
          giocatore.squadra,
          giocatore.ruoloClassic,
          giocatore.ruoliMantra,
          giocatore.quotazione,
          JSON.stringify(statFantacalcio),
          JSON.stringify(giocatore.statTattiche),
        ],
      );
    }

    await client.query(
      "INSERT INTO pubblicazione_snapshot (stagione_listone, snapshot_id) VALUES ($1, $2)",
      [STAGIONE_LISTONE, SNAPSHOT_ID],
    );
    await client.query(
      `INSERT INTO stato_freschezza (
        nome_sorgente, stagione, ultimo_successo_il, ultimo_tentativo_il,
        ultimo_esito, num_giocatori_acquisiti, budget_token
      ) VALUES
        ('listone-e2e', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'successo', $2, 1),
        ('statistiche-e2e', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'successo', $2, 1)`,
      [STAGIONE_LISTONE, giocatori.length],
    );
  } finally {
    await client.end();
  }
}

let container;
let server;
let chiusuraInCorso = false;

async function chiudi(codice = 0) {
  if (chiusuraInCorso) return;
  chiusuraInCorso = true;
  if (server !== undefined && server.exitCode === null) {
    server.kill("SIGTERM");
  }
  if (container !== undefined) {
    await container.stop().catch(() => undefined);
  }
  process.exit(codice);
}

process.on("SIGINT", () => void chiudi(0));
process.on("SIGTERM", () => void chiudi(0));

try {
  container = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({
      POSTGRES_DB: "asta_e2e",
      POSTGRES_PASSWORD: "postgres",
      POSTGRES_USER: "postgres",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();

  await preparaSchema(container);
  const connectionString = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/asta_e2e`;
  await seminaSnapshot(connectionString);

  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli === undefined || pnpmCli.length === 0) {
    throw new Error("Percorso dell'eseguibile pnpm non disponibile.");
  }
  server = spawn(
    process.execPath,
    [pnpmCli, "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3100"],
    {
      cwd: cartellaWeb,
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        NEXT_PUBLIC_ORIGINE_APPLICAZIONE: "http://127.0.0.1:3100",
      },
      stdio: "inherit",
    },
  );
  server.on("exit", (codice) => void chiudi(codice ?? 1));
} catch (error_) {
  process.stderr.write(`${String(error_)}\n`);
  await chiudi(1);
}
