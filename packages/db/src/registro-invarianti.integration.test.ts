// @ts-expect-error I tipi Node sono disponibili transitivamente nel workspace, ma non sono una dipendenza diretta del pacchetto.
import { spawnSync } from "node:child_process";
// @ts-expect-error I tipi Node sono disponibili transitivamente nel workspace, ma non sono una dipendenza diretta del pacchetto.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

interface RisultatoExec {
  readonly exitCode: number;
  readonly output: string;
}

interface ContainerPostgresAvviato {
  exec(comando: readonly string[]): Promise<RisultatoExec>;
  stop(): Promise<void>;
}

interface CostruttoreContainerPostgres {
  withEnvironment(variabili: Readonly<Record<string, string>>): CostruttoreContainerPostgres;
  withWaitStrategy(strategia: unknown): CostruttoreContainerPostgres;
  start(): Promise<ContainerPostgresAvviato>;
}

interface ModuloTestcontainers {
  readonly GenericContainer: new (immagine: string) => CostruttoreContainerPostgres;
  readonly Wait: {
    forLogMessage(messaggio: RegExp): unknown;
  };
}

const nomeModuloTestcontainers = "testcontainers";
const moduloTestcontainers = await import(nomeModuloTestcontainers).catch(
  () => null,
);
const dockerDisponibile =
  moduloTestcontainers !== null &&
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const descriviConPostgres =
  moduloTestcontainers !== null && dockerDisponibile ? describe : describe.skip;
const testcontainers = moduloTestcontainers as unknown as ModuloTestcontainers;

const percorsoMigrazioneInvarianti =
  "prisma/migrations/20260309120000_invarianti_registro/migration.sql";
const sqlMigrazioneInvarianti = readFileSync(
  percorsoMigrazioneInvarianti,
  "utf8",
) as string;

const ID_UTENTE = "00000000-0000-4000-8000-000000000001";
const ID_SESSIONE = "00000000-0000-4000-8000-000000000002";

const sqlInizializzazione = `
  INSERT INTO "utente" (
    "id", "email_normalizzata", "email_visualizzata", "password_hash"
  ) VALUES (
    '${ID_UTENTE}', 'test@example.com', 'test@example.com', 'hash-test'
  );

  INSERT INTO "sessione_asta" (
    "id", "utente_id", "nome", "stagione_listone", "tipo_asta",
    "modalita_gioco", "numero_partecipanti", "crediti_iniziali",
    "composizione_rosa", "quote_reparto", "pesi_valutazione"
  ) VALUES (
    '${ID_SESSIONE}', '${ID_UTENTE}', 'Asta test', '2025-26', 'chiamata',
    'classic', 8, 500, '{"P":3,"D":8,"C":8,"A":6}',
    '{"POR":8,"DIF":20,"CEN":32,"ATT":40}',
    '{"quotazione":30,"budgetReparto":25,"budgetTotale":15,"slotResidui":10,"statistiche":20,"audacia":20}'
  );
`;

function inserimentoRegistro({
  id,
  ordinale,
  giocatore,
  chiaveIdempotenza,
  onConflict = "",
}: {
  readonly id: string;
  readonly ordinale: number;
  readonly giocatore: string;
  readonly chiaveIdempotenza: string;
  readonly onConflict?: string;
}): string {
  return `
    INSERT INTO "voce_registro_acquisti" (
      "id", "sessione_asta_id", "ordinale", "identificativo_giocatore",
      "nome_giocatore", "ruolo", "squadra", "reparto_assegnato",
      "macro_reparto", "prezzo_acquisto", "assegnatario_tipo",
      "chiave_idempotenza"
    ) VALUES (
      '${id}', '${ID_SESSIONE}', ${ordinale}, '${giocatore}',
      'Giocatore ${giocatore}', 'A', 'Squadra', 'A', 'ATT', 10, 'utente',
      '${chiaveIdempotenza}'
    )
    ${onConflict};
  `;
}

async function eseguiSql(
  container: ContainerPostgresAvviato,
  sql: string,
): Promise<string> {
  const risultato = await container.exec([
    "psql",
    "--username=postgres",
    "--dbname=asta_test",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);

  if (risultato.exitCode !== 0) {
    throw new Error(risultato.output);
  }

  return risultato.output.trim();
}

describe("migrazione delle invarianti del registro", () => {
  it("dichiara gli indici unici parziale e di idempotenza richiesti", () => {
    expect(sqlMigrazioneInvarianti).toMatch(
      /CREATE UNIQUE INDEX "ux_registro_giocatore_attivo"[\s\S]*WHERE "annullata_il" IS NULL;/,
    );
    expect(sqlMigrazioneInvarianti).toMatch(
      /CREATE UNIQUE INDEX "ux_registro_idempotenza"[\s\S]*\("sessione_asta_id", "chiave_idempotenza"\);/,
    );
  });
});

descriviConPostgres("invarianti del registro acquisti su PostgreSQL", () => {
  let postgres: ContainerPostgresAvviato;

  beforeAll(async () => {
    postgres = await new testcontainers.GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "asta_test",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_USER: "postgres",
      })
      .withWaitStrategy(
        testcontainers.Wait.forLogMessage(
          /database system is ready to accept connections/,
        ),
      )
      .start();

    const migrazioneIniziale = readFileSync(
      "prisma/migrations/20260308120000_schema_iniziale/migration.sql",
      "utf8",
    ) as string;
    await eseguiSql(postgres, migrazioneIniziale);
    await eseguiSql(postgres, sqlMigrazioneInvarianti);
  }, 60_000);

  beforeEach(async () => {
    await eseguiSql(postgres, 'TRUNCATE TABLE "utente" CASCADE;');
    await eseguiSql(postgres, sqlInizializzazione);
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it("consente un solo inserimento concorrente dello stesso giocatore attivo e lo riabilita dopo l'annullamento", async () => {
    const risultati = await Promise.allSettled([
      eseguiSql(
        postgres,
        inserimentoRegistro({
          id: "00000000-0000-4000-8000-000000000011",
          ordinale: 1,
          giocatore: "giocatore-concorrente",
          chiaveIdempotenza: "10000000-0000-4000-8000-000000000001",
        }),
      ),
      eseguiSql(
        postgres,
        inserimentoRegistro({
          id: "00000000-0000-4000-8000-000000000012",
          ordinale: 2,
          giocatore: "giocatore-concorrente",
          chiaveIdempotenza: "10000000-0000-4000-8000-000000000002",
        }),
      ),
    ]);

    expect(risultati.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const messaggiRifiuto = risultati.flatMap((risultato) =>
      risultato.status === "rejected" ? [String(risultato.reason)] : [],
    );
    expect(messaggiRifiuto).toHaveLength(1);
    expect(messaggiRifiuto[0]).toContain("ux_registro_giocatore_attivo");
    expect(
      await eseguiSql(
        postgres,
        `SELECT count(*) FROM "voce_registro_acquisti"
         WHERE "sessione_asta_id" = '${ID_SESSIONE}'
           AND "identificativo_giocatore" = 'giocatore-concorrente'
           AND "annullata_il" IS NULL;`,
      ),
    ).toBe("1");

    await eseguiSql(
      postgres,
      `UPDATE "voce_registro_acquisti"
       SET "annullata_il" = CURRENT_TIMESTAMP
       WHERE "sessione_asta_id" = '${ID_SESSIONE}';`,
    );
    await eseguiSql(
      postgres,
      inserimentoRegistro({
        id: "00000000-0000-4000-8000-000000000013",
        ordinale: 3,
        giocatore: "giocatore-concorrente",
        chiaveIdempotenza: "10000000-0000-4000-8000-000000000003",
      }),
    );

    expect(
      await eseguiSql(
        postgres,
        `SELECT count(*) FROM "voce_registro_acquisti"
         WHERE "sessione_asta_id" = '${ID_SESSIONE}'
           AND "identificativo_giocatore" = 'giocatore-concorrente';`,
      ),
    ).toBe("2");
  });

  it("ignora il reinvio della stessa chiave di idempotenza senza creare duplicati", async () => {
    const chiaveIdempotenza = "20000000-0000-4000-8000-000000000001";

    await eseguiSql(
      postgres,
      inserimentoRegistro({
        id: "00000000-0000-4000-8000-000000000021",
        ordinale: 1,
        giocatore: "giocatore-originale",
        chiaveIdempotenza,
      }),
    );
    await eseguiSql(
      postgres,
      inserimentoRegistro({
        id: "00000000-0000-4000-8000-000000000022",
        ordinale: 2,
        giocatore: "giocatore-reinviato",
        chiaveIdempotenza,
        onConflict:
          'ON CONFLICT ("sessione_asta_id", "chiave_idempotenza") DO NOTHING',
      }),
    );

    expect(
      await eseguiSql(
        postgres,
        `SELECT count(*) FROM "voce_registro_acquisti"
         WHERE "sessione_asta_id" = '${ID_SESSIONE}'
           AND "chiave_idempotenza" = '${chiaveIdempotenza}';`,
      ),
    ).toBe("1");
    expect(
      await eseguiSql(
        postgres,
        `SELECT "identificativo_giocatore" FROM "voce_registro_acquisti"
         WHERE "sessione_asta_id" = '${ID_SESSIONE}'
           AND "chiave_idempotenza" = '${chiaveIdempotenza}';`,
      ),
    ).toBe("giocatore-originale");
  });
});
