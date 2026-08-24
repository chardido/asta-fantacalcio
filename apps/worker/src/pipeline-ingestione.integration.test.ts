import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type {
  AdattatoreSorgenteListone,
  AdattatoreSorgenteStatistiche,
} from "@asta/adapters";
import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
  VoceListoneGrezza,
} from "@asta/contracts";
import { creaRepositories, PrismaClient, type Repositories } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

import {
  BACKOFF_INIZIALE_MS,
  LimitatoreFrequenza,
} from "./limitatore-frequenza.js";
import { PipelineIngestione } from "./pipeline-ingestione.js";
import { RisolutoreIdentita } from "./risolutore-identita.js";

const STAGIONE_LISTONE = "2026/2027";
const STAGIONE_STATISTICHE = "2025/2026";
const NOME_LISTONE = "listone-integrazione";
const NOME_STATISTICHE = "statistiche-integrazione";
const ISTANTE_INIZIALE = new Date("2026-03-10T05:00:00.000Z");
const ID_ESECUZIONE = "00000000-0000-4000-8000-000000000099";

const migrazioni = [
  "20260308120000_schema_iniziale",
  "20260309120000_invarianti_registro",
  "20260310120000_lock_ingestione",
].map((cartella) =>
  readFileSync(
    new URL(
      `../../../packages/db/prisma/migrations/${cartella}/migration.sql`,
      import.meta.url,
    ),
    "utf8",
  ),
);

const dockerDisponibile =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const descriviConPostgres = dockerDisponibile ? describe : describe.skip;

function giocatoreListone(
  identificativoGiocatore: string,
  nome: string,
  quotazione = 24,
): VoceListoneGrezza {
  return {
    identificativoGiocatore,
    nome,
    squadra: "Roma",
    ruoloClassic: "A",
    ruoliMantra: ["Pc"],
    quotazione,
  };
}

function rispostaListone(
  giocatori: readonly VoceListoneGrezza[] = [
    giocatoreListone("10", "Mario Rossi"),
  ],
): RispostaListoneGrezza {
  return {
    nomeSorgente: NOME_LISTONE,
    stagione: STAGIONE_LISTONE,
    giocatori: [...giocatori],
  };
}

function rispostaStatistiche(
  giocatoriListone: readonly VoceListoneGrezza[] = rispostaListone().giocatori,
): RispostaStatisticheGrezza {
  return {
    nomeSorgente: NOME_STATISTICHE,
    stagione: STAGIONE_STATISTICHE,
    giocatori: giocatoriListone.map((giocatore, indice) => ({
      identificativoSorgente: `api-${indice + 1}`,
      nome: giocatore.nome,
      squadra: giocatore.squadra,
      statFantacalcio: {
        mediaVotoMilli: 6300,
        fantamediaMilli: 7100,
        presenze: 30,
        gol: 12,
        assist: 4,
      },
      statTattiche: {
        tiri: 60,
        tiriNelloSpecchio: 30,
      },
    })),
  };
}

function erroreLimiteFrequenza(): Error & {
  readonly codice: "limite_frequenza";
} {
  return Object.assign(new Error("429 Too Many Requests"), {
    codice: "limite_frequenza" as const,
  });
}

interface OpzioniPipeline {
  readonly ora?: () => Date;
  readonly timeoutMs?: number;
  readonly listone?: RispostaListoneGrezza;
  readonly statistiche?: RispostaStatisticheGrezza;
  readonly recuperaListone?: AdattatoreSorgenteListone["recupera"];
  readonly recuperaStatistiche?: AdattatoreSorgenteStatistiche["recupera"];
}

function creaPipeline(
  repositories: Repositories,
  opzioni: OpzioniPipeline = {},
): {
  readonly pipeline: PipelineIngestione;
  readonly listone: AdattatoreSorgenteListone;
  readonly statistiche: AdattatoreSorgenteStatistiche;
} {
  const rispostaListoneCorrente = opzioni.listone ?? rispostaListone();
  const rispostaStatisticheCorrente =
    opzioni.statistiche ??
    rispostaStatistiche(rispostaListoneCorrente.giocatori);
  const ora = opzioni.ora ?? (() => new Date(ISTANTE_INIZIALE));
  const listone: AdattatoreSorgenteListone = {
    nome: NOME_LISTONE,
    limiti: { richiesteMassime: 1_000, finestraMs: 86_400_000 },
    recupera: vi.fn(
      opzioni.recuperaListone ??
        (async () => rispostaListoneCorrente),
    ),
  };
  const statistiche: AdattatoreSorgenteStatistiche = {
    nome: NOME_STATISTICHE,
    limiti: { richiesteMassime: 1_000, finestraMs: 86_400_000 },
    recupera: vi.fn(
      opzioni.recuperaStatistiche ??
        (async () => rispostaStatisticheCorrente),
    ),
  };
  const pipeline = new PipelineIngestione(
    {
      stagioneListone: STAGIONE_LISTONE,
      stagioneStatistiche: STAGIONE_STATISTICHE,
    },
    {
      listone,
      statistiche,
      limitatore: new LimitatoreFrequenza(
        repositories.freschezza,
        ora,
        opzioni.timeoutMs,
      ),
      risolutoreIdentita: new RisolutoreIdentita(
        repositories.aliasGiocatori,
      ),
      freschezza: repositories.freschezza,
      ingestione: repositories.ingestione,
      ora,
      creaIdentificativoEsecuzione: () => ID_ESECUZIONE,
    },
  );
  return { pipeline, listone, statistiche };
}

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

function firmaSnapshot(
  snapshot: Awaited<ReturnType<Repositories["snapshot"]["trovaPubblicato"]>>,
): string {
  if (snapshot === null) return "assente";
  const identificativi = snapshot.giocatori
    .map(({ identificativoGiocatore }) => identificativoGiocatore)
    .sort()
    .join(",");
  return `${snapshot.numGiocatori}:${identificativi}`;
}

async function attendi(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

descriviConPostgres("pipeline di ingestione su PostgreSQL", () => {
  let postgres: StartedTestContainer;
  let prismaScrittura: PrismaClient;
  let prismaLettura: PrismaClient;
  let repositories: Repositories;
  let repositoriesLettura: Repositories;

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
    const connectionString =
      `postgresql://postgres:postgres@${postgres.getHost()}:` +
      `${postgres.getMappedPort(5432)}/asta_test`;
    prismaScrittura = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    prismaLettura = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    repositories = creaRepositories(prismaScrittura);
    repositoriesLettura = creaRepositories(prismaLettura);
  }, 60_000);

  beforeEach(async () => {
    await prismaScrittura.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS ritarda_pubblicazione_test
       ON "pubblicazione_snapshot"`,
    );
    await prismaScrittura.$executeRawUnsafe(
      "DROP FUNCTION IF EXISTS ritarda_pubblicazione_test()",
    );
    await prismaScrittura.$executeRawUnsafe(
      `TRUNCATE TABLE
        "lock_ingestione",
        "alias_giocatore",
        "esecuzione_ingestione",
        "stato_freschezza",
        "pubblicazione_snapshot",
        "giocatore_snapshot",
        "snapshot_dati"
       RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await Promise.all([
      prismaScrittura?.$disconnect(),
      prismaLettura?.$disconnect(),
    ]);
    await postgres?.stop();
  });

  // **Validates: Requirements 4.3, 4.7, 4.10**
  it("pubblica il listone completo e non ripete i due canali prima di 24 ore", async () => {
    const scenario = creaPipeline(repositories);

    const esito = await scenario.pipeline.eseguiSeNecessario();

    expect(esito).toMatchObject({ stato: "pubblicato", numGiocatori: 1 });
    const pubblicato = await repositories.snapshot.trovaPubblicato(
      STAGIONE_LISTONE,
    );
    expect(pubblicato).toMatchObject({
      stato: "consultabile",
      numGiocatori: 1,
      nomeSorgenteListone: NOME_LISTONE,
      nomeSorgenteStatistiche: NOME_STATISTICHE,
    });
    expect(pubblicato?.giocatori).toHaveLength(1);
    await expect(scenario.pipeline.eseguiSeNecessario()).resolves.toEqual({
      stato: "non_necessario",
    });
    expect(scenario.listone.recupera).toHaveBeenCalledOnce();
    expect(scenario.statistiche.recupera).toHaveBeenCalledOnce();
    expect(await prismaScrittura.esecuzioneIngestione.count()).toBe(2);
  });

  // **Validates: Requirements 4.9, 4.10**
  it("registra il timeout e conserva le tabelle snapshot invariate", async () => {
    const scenario = creaPipeline(repositories, {
      timeoutMs: 20,
      recuperaStatistiche: async (_stagione, segnale) =>
        new Promise((_resolve, reject) => {
          segnale.addEventListener("abort", () => reject(segnale.reason), {
            once: true,
          });
        }),
    });

    await expect(scenario.pipeline.esegui()).resolves.toEqual({
      stato: "fallito",
      esiti: ["successo", "timeout"],
    });
    expect(await prismaScrittura.snapshotDati.count()).toBe(0);
    expect(
      await repositories.snapshot.trovaPubblicato(STAGIONE_LISTONE),
    ).toBeNull();
    expect(
      await repositories.freschezza.trova(
        NOME_STATISTICHE,
        STAGIONE_STATISTICHE,
      ),
    ).toMatchObject({
      ultimoSuccessoIl: null,
      ultimoEsito: "timeout",
      numGiocatoriAcquisiti: null,
    });
  });

  // **Validates: Requirements 4.7, 4.8, 4.9**
  it("persiste il backoff dopo un 429 e sospende le chiamate premature", async () => {
    const recuperaStatistiche = vi.fn(async () => {
      throw erroreLimiteFrequenza();
    });
    const primoScenario = creaPipeline(repositories, {
      recuperaStatistiche,
    });

    await expect(primoScenario.pipeline.esegui()).resolves.toEqual({
      stato: "fallito",
      esiti: ["successo", "limite_frequenza"],
    });
    const primoStato = await repositories.freschezza.trova(
      NOME_STATISTICHE,
      STAGIONE_STATISTICHE,
    );
    expect(primoStato).toMatchObject({ ultimoEsito: "limite_frequenza" });
    expect(primoStato?.prossimoTentativoNonPrimaDi).toEqual(
      new Date(ISTANTE_INIZIALE.getTime() + BACKOFF_INIZIALE_MS),
    );

    const secondoScenario = creaPipeline(repositories, {
      recuperaStatistiche,
    });
    await expect(secondoScenario.pipeline.esegui()).resolves.toEqual({
      stato: "fallito",
      esiti: ["successo", "limite_frequenza"],
    });
    expect(recuperaStatistiche).toHaveBeenCalledOnce();
    expect(await prismaScrittura.snapshotDati.count()).toBe(0);
  });

  // **Validates: Requirements 4.9, 4.10**
  it("rifiuta la risposta non valida mantenendo consultabile lo snapshot precedente", async () => {
    const valido = creaPipeline(repositories);
    const pubblicazioneValida = await valido.pipeline.esegui();
    expect(pubblicazioneValida.stato).toBe("pubblicato");
    if (pubblicazioneValida.stato !== "pubblicato") return;

    const istanteSuccessivo = new Date(
      ISTANTE_INIZIALE.getTime() + 86_400_000,
    );
    const nonValido = creaPipeline(repositories, {
      ora: () => istanteSuccessivo,
      listone: rispostaListone([
        giocatoreListone("10", "Mario Rossi", 0),
      ]),
    });

    await expect(nonValido.pipeline.eseguiSeNecessario()).resolves.toEqual({
      stato: "fallito",
      esiti: ["dati_non_validi", "dati_non_validi"],
    });
    const ancoraPubblicato = await repositories.snapshot.trovaPubblicato(
      STAGIONE_LISTONE,
    );
    expect(ancoraPubblicato?.id).toBe(pubblicazioneValida.snapshotId);
    expect(ancoraPubblicato?.giocatori).toHaveLength(1);
    expect(await prismaScrittura.snapshotDati.count()).toBe(1);
    expect(
      await repositories.freschezza.trova(NOME_LISTONE, STAGIONE_LISTONE),
    ).toMatchObject({ ultimoEsito: "dati_non_validi" });
  });

  // **Validates: Requirement 4.10**
  it("mostra sotto lettura concorrente solo lo snapshot vecchio o quello nuovo completi", async () => {
    const vecchio = creaPipeline(repositories);
    await expect(vecchio.pipeline.esegui()).resolves.toMatchObject({
      stato: "pubblicato",
    });
    expect(
      firmaSnapshot(
        await repositoriesLettura.snapshot.trovaPubblicato(
          STAGIONE_LISTONE,
        ),
      ),
    ).toBe("1:10");

    await prismaScrittura.$executeRawUnsafe(`
      CREATE FUNCTION ritarda_pubblicazione_test()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        PERFORM pg_sleep(0.25);
        RETURN NEW;
      END;
      $$
    `);
    await prismaScrittura.$executeRawUnsafe(`
      CREATE TRIGGER ritarda_pubblicazione_test
      BEFORE UPDATE ON "pubblicazione_snapshot"
      FOR EACH ROW EXECUTE FUNCTION ritarda_pubblicazione_test()
    `);

    const giocatoriNuovi = [
      giocatoreListone("20", "Luigi Bianchi", 18),
      giocatoreListone("30", "Paolo Verdi", 22),
    ];
    const nuovo = creaPipeline(repositories, {
      listone: rispostaListone(giocatoriNuovi),
      statistiche: rispostaStatistiche(giocatoriNuovi),
    });
    let terminata = false;
    const pubblicazione = nuovo.pipeline.esegui().finally(() => {
      terminata = true;
    });
    const firmeOsservate: string[] = [];

    while (!terminata) {
      firmeOsservate.push(
        firmaSnapshot(
          await repositoriesLettura.snapshot.trovaPubblicato(
            STAGIONE_LISTONE,
          ),
        ),
      );
      await attendi(5);
    }
    await expect(pubblicazione).resolves.toMatchObject({
      stato: "pubblicato",
      numGiocatori: 2,
    });
    firmeOsservate.push(
      firmaSnapshot(
        await repositoriesLettura.snapshot.trovaPubblicato(
          STAGIONE_LISTONE,
        ),
      ),
    );

    expect(firmeOsservate).toContain("1:10");
    expect(firmeOsservate).toContain("2:20,30");
    expect(
      firmeOsservate.every(
        (firma) => firma === "1:10" || firma === "2:20,30",
      ),
    ).toBe(true);
  }, 15_000);
});
