import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type { ConfigurazioneAsta, VoceRegistro } from "@asta/contracts";
import { creaRepositories, PrismaClient, type Repositories } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

import { CanaleEventi } from "./canale-eventi.js";
import { TrasportoEventiPostgres } from "./trasporto-postgres.js";

const ID_UTENTE = "00000000-0000-4000-8000-000000000010";
const ID_SESSIONE = "00000000-0000-4000-8000-000000000011";
const configurazione: ConfigurazioneAsta = {
  nome: "Asta SSE",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: {
    quotazione: 20,
    budgetReparto: 20,
    budgetTotale: 20,
    slotResidui: 15,
    statistiche: 20,
    audacia: 5,
  },
};

const migrazioni = [
  readFileSync(
    new URL(
      "../../../../../packages/db/prisma/migrations/20260308120000_schema_iniziale/migration.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFileSync(
    new URL(
      "../../../../../packages/db/prisma/migrations/20260309120000_invarianti_registro/migration.sql",
      import.meta.url,
    ),
    "utf8",
  ),
];

const dockerDisponibile =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const descriviConPostgres = dockerDisponibile ? describe : describe.skip;

async function applicaMigrazione(
  container: StartedTestContainer,
  sql: string,
): Promise<void> {
  const risultato = await container.exec([
    "psql",
    "--username=postgres",
    "--dbname=asta_test",
    "--set=ON_ERROR_STOP=1",
    "--command",
    sql,
  ]);
  if (risultato.exitCode !== 0) throw new Error(risultato.output);
}

function voceRegistro(): VoceRegistro {
  return {
    id: "00000000-0000-4000-8000-000000000012",
    sessioneAstaId: ID_SESSIONE,
    ordinale: 1,
    identificativoGiocatore: "player-sse",
    nomeGiocatore: "Giocatore SSE",
    ruolo: "D",
    squadra: "Roma",
    repartoAssegnato: "D",
    macroReparto: "DIF",
    prezzoAcquisto: 20,
    assegnatarioTipo: "utente",
    avversarioId: null,
    annullataIl: null,
    chiaveIdempotenza: "00000000-0000-4000-8000-000000000013",
    giocatoreAssenteDatiCorrenti: false,
  };
}

async function leggiEvento(
  lettore: ReadableStreamDefaultReader<Uint8Array>,
  datoAtteso: string,
  timeoutMs: number,
): Promise<string> {
  const decodificatore = new TextDecoder();
  let testo = "";
  return Promise.race([
    (async () => {
      while (!testo.includes(datoAtteso)) {
        const risultato = await lettore.read();
        if (risultato.done) break;
        testo += decodificatore.decode(risultato.value, { stream: true });
      }
      return testo;
    })(),
    new Promise<string>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Evento non ricevuto entro ${timeoutMs} ms`)),
        timeoutMs,
      );
    }),
  ]);
}

descriviConPostgres("CanaleEventi su PostgreSQL", () => {
  let postgres: StartedTestContainer;
  let prisma: PrismaClient;
  let repositories: Repositories;
  let connectionString: string;

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "asta_test",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_USER: "postgres",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();
    for (const migrazione of migrazioni) {
      await applicaMigrazione(postgres, migrazione);
    }
    connectionString = `postgresql://postgres:postgres@${postgres.getHost()}:${postgres.getMappedPort(5432)}/asta_test`;
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    repositories = creaRepositories(prisma);
    await prisma.utente.create({
      data: {
        id: ID_UTENTE,
        emailNormalizzata: "sse@example.com",
        emailVisualizzata: "sse@example.com",
        passwordHash: "hash-non-usato",
      },
    });
    await prisma.sessioneAsta.create({
      data: {
        id: ID_SESSIONE,
        utenteId: ID_UTENTE,
        stagioneListone: "2025-26",
        nome: configurazione.nome,
        tipoAsta: configurazione.tipoAsta,
        modalitaGioco: configurazione.modalitaGioco,
        numeroPartecipanti: configurazione.numeroPartecipanti,
        creditiIniziali: configurazione.creditiIniziali,
        modificatoreDifesa: configurazione.modificatoreDifesa,
        composizioneRosa: configurazione.composizioneRosa,
        quoteReparto: configurazione.quoteReparto,
        pesiValutazione: configurazione.pesiValutazione,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.stop();
  });

  // **Validates: Requirements 7.2, 7.13**
  it("propaga la notifica transazionale a due connessioni concorrenti entro 2 secondi", async () => {
    const canale = new CanaleEventi({
      caricaSessionePropria: async () => repositories.sessioniAsta.trovaPerId(ID_SESSIONE),
      registro: repositories.registro,
      trasporto: new TrasportoEventiPostgres(connectionString),
    });
    const rispostaA = await canale.apri(
      ID_SESSIONE,
      null,
      new AbortController().signal,
    );
    const rispostaB = await canale.apri(
      ID_SESSIONE,
      null,
      new AbortController().signal,
    );
    const lettoreA = rispostaA.body?.getReader();
    const lettoreB = rispostaB.body?.getReader();
    expect(lettoreA).toBeDefined();
    expect(lettoreB).toBeDefined();
    if (lettoreA === undefined || lettoreB === undefined) return;

    await Promise.all([
      leggiEvento(lettoreA, 'data: {"ordinaleCorrente":0}', 2_000),
      leggiEvento(lettoreB, 'data: {"ordinaleCorrente":0}', 2_000),
    ]);

    const iniziatoIl = Date.now();
    await repositories.transazioniRegistro.esegui(
      ID_SESSIONE,
      async (registro) => {
        const voce = await registro.crea(voceRegistro());
        await registro.notificaMutazione(voce.ordinale);
      },
      5_000,
    );
    const [eventoA, eventoB] = await Promise.all([
      leggiEvento(lettoreA, 'data: {"ordinale":1}', 2_000),
      leggiEvento(lettoreB, 'data: {"ordinale":1}', 2_000),
    ]);

    expect(Date.now() - iniziatoIl).toBeLessThan(2_000);
    expect(eventoA).toContain("event: registro\nid: 1");
    expect(eventoB).toContain("event: registro\nid: 1");
    await Promise.all([lettoreA.cancel(), lettoreB.cancel()]);
  }, 15_000);
});
