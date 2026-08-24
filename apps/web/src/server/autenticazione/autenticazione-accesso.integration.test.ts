import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import type { ConfigurazioneAsta } from "@asta/contracts";
import {
  creaRepositories,
  PrismaClient,
  type Repositories,
} from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

import {
  ErroreHttpAccessoSessione,
  caricaSessionePropria,
} from "../sessioni/carica-sessione-propria.js";
import { LimitatoreTentativiAccesso } from "./limitatore-tentativi-accesso.js";
import {
  ServizioAutenticazione,
  hashTokenSessione,
} from "./servizio-autenticazione.js";

const PASSWORD_VALIDA = "password-sicura";
const ORA_BASE = new Date("2026-03-10T12:00:00.000Z");
const GIORNO_MS = 24 * 60 * 60 * 1000;

const configurazione: ConfigurazioneAsta = {
  nome: "Asta privata",
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

  if (risultato.exitCode !== 0) {
    throw new Error(risultato.output);
  }
}

function creaServizio(
  repositories: Repositories,
  ora: () => Date,
): ServizioAutenticazione {
  let sequenzaToken = 0;

  return new ServizioAutenticazione(
    repositories.utenti,
    repositories.sessioniAuth,
    {
      ora,
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      generaByteCasuali: () => {
        sequenzaToken += 1;
        return Uint8Array.from(
          { length: 32 },
          (_, indice) => (sequenzaToken + indice) % 256,
        );
      },
    },
  );
}

async function catturaErroreAccesso(
  operazione: Promise<unknown>,
): Promise<ErroreHttpAccessoSessione> {
  try {
    await operazione;
  } catch (errore: unknown) {
    expect(errore).toBeInstanceOf(ErroreHttpAccessoSessione);
    return errore as ErroreHttpAccessoSessione;
  }

  throw new Error("Era atteso un errore di accesso alla sessione.");
}

descriviConPostgres(
  "integrazione autenticazione e controllo di accesso su PostgreSQL",
  () => {
    let postgres: StartedTestContainer;
    let prisma: PrismaClient;
    let repositories: Repositories;

    beforeAll(async () => {
      postgres = await new GenericContainer("postgres:16-alpine")
        .withEnvironment({
          POSTGRES_DB: "asta_test",
          POSTGRES_PASSWORD: "postgres",
          POSTGRES_USER: "postgres",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(
          Wait.forLogMessage(
            /database system is ready to accept connections/,
            2,
          ),
        )
        .start();

      for (const migrazione of migrazioni) {
        await applicaMigrazione(postgres, migrazione);
      }

      const adapter = new PrismaPg({
        connectionString: `postgresql://postgres:postgres@${postgres.getHost()}:${postgres.getMappedPort(5432)}/asta_test`,
      });
      prisma = new PrismaClient({ adapter });
      repositories = creaRepositories(prisma);
    }, 60_000);

    beforeEach(async () => {
      await prisma.utente.deleteMany();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await postgres?.stop();
    });

    // **Validates: Requirements 1.2, 1.6**
    it("rifiuta l'email duplicata normalizzata e rende indistinguibili le credenziali errate", async () => {
      const servizio = creaServizio(repositories, () => ORA_BASE);

      await expect(
        servizio.registra("Mario.Rossi@Example.COM", PASSWORD_VALIDA),
      ).resolves.toMatchObject({ ok: true });

      const duplicato = await servizio.registra(
        "  MARIO.ROSSI@example.com  ",
        PASSWORD_VALIDA,
      );
      expect(duplicato).toEqual({
        ok: false,
        errore: {
          codice: "email_gia_registrata",
          campo: "email",
          vincolo: "email_normalizzata_univoca",
          messaggio: "L'indirizzo email è già registrato.",
        },
      });
      await expect(prisma.utente.count()).resolves.toBe(1);
      await expect(
        prisma.utente.findUnique({
          where: { emailNormalizzata: "mario.rossi@example.com" },
          select: { emailVisualizzata: true },
        }),
      ).resolves.toEqual({ emailVisualizzata: "Mario.Rossi@Example.COM" });

      const emailEsistente = await servizio.accedi(
        "mario.rossi@example.com",
        "password-errata",
        "192.0.2.10",
      );
      const emailInesistente = await servizio.accedi(
        "assente@example.com",
        "password-errata",
        "192.0.2.11",
      );

      expect(emailInesistente).toEqual(emailEsistente);
      expect(emailInesistente).toEqual({
        ok: false,
        errore: {
          codice: "credenziali_non_valide",
          messaggio: "Credenziali non valide.",
        },
      });
      await expect(prisma.sessioneAuth.count()).resolves.toBe(0);
    });

    // **Validates: Requirements 1.8**
    it("invalida le sessioni ai limiti esatti di inattivita e durata assoluta", async () => {
      let ora = new Date(ORA_BASE);
      const servizio = creaServizio(repositories, () => ora);
      await servizio.registra("sessioni@example.com", PASSWORD_VALIDA);

      const accessoInattivita = await servizio.accedi(
        "sessioni@example.com",
        PASSWORD_VALIDA,
        "192.0.2.20",
      );
      const accessoAssoluto = await servizio.accedi(
        "sessioni@example.com",
        PASSWORD_VALIDA,
        "192.0.2.21",
      );
      expect(accessoInattivita.ok).toBe(true);
      expect(accessoAssoluto.ok).toBe(true);
      if (!accessoInattivita.ok || !accessoAssoluto.ok) return;

      ora = new Date(ORA_BASE.getTime() + GIORNO_MS);
      await expect(
        servizio.risolvi(accessoInattivita.valore.tokenSessione),
      ).resolves.toBeNull();

      await prisma.sessioneAuth.update({
        where: {
          tokenHash: hashTokenSessione(
            accessoAssoluto.valore.tokenSessione,
          ),
        },
        data: {
          ultimaAttivitaIl: new Date(
            ORA_BASE.getTime() + 30 * GIORNO_MS - 1,
          ),
        },
      });
      ora = new Date(ORA_BASE.getTime() + 30 * GIORNO_MS);

      await expect(
        servizio.risolvi(accessoAssoluto.valore.tokenSessione),
      ).resolves.toBeNull();
    });

    // **Validates: Requirements 1.10, 1.11**
    it("applica 401 senza sessione e un 404 identico per sessione altrui o inesistente", async () => {
      const servizio = creaServizio(repositories, () => ORA_BASE);
      const proprietario = await servizio.registra(
        "proprietario@example.com",
        PASSWORD_VALIDA,
      );
      const altroUtente = await servizio.registra(
        "altro@example.com",
        PASSWORD_VALIDA,
      );
      expect(proprietario.ok).toBe(true);
      expect(altroUtente.ok).toBe(true);
      if (!proprietario.ok || !altroUtente.ok) return;

      const accesso = await servizio.accedi(
        "proprietario@example.com",
        PASSWORD_VALIDA,
        "192.0.2.30",
      );
      expect(accesso.ok).toBe(true);
      if (!accesso.ok) return;

      const sessionePropria = await repositories.sessioniAsta.crea({
        utenteId: proprietario.valore.id,
        stagioneListone: "2025/2026",
        configurazione,
      });
      const sessioneAltrui = await repositories.sessioniAsta.crea({
        utenteId: altroUtente.valore.id,
        stagioneListone: "2025/2026",
        configurazione: { ...configurazione, nome: "Asta altro utente" },
      });

      await expect(
        caricaSessionePropria(
          {
            tokenSessione: null,
            autenticazione: servizio,
            sessioniAsta: repositories.sessioniAsta,
          },
          sessionePropria.id,
        ),
      ).rejects.toMatchObject({
        status: 401,
        codice: "non_autenticato",
        message: "Autenticazione richiesta.",
      });

      await expect(
        caricaSessionePropria(
          {
            tokenSessione: accesso.valore.tokenSessione,
            autenticazione: servizio,
            sessioniAsta: repositories.sessioniAsta,
          },
          sessionePropria.id,
        ),
      ).resolves.toEqual(sessionePropria);

      const contesto = {
        tokenSessione: accesso.valore.tokenSessione,
        autenticazione: servizio,
        sessioniAsta: repositories.sessioniAsta,
      };
      const erroreAltrui = await catturaErroreAccesso(
        caricaSessionePropria(contesto, sessioneAltrui.id),
      );
      const erroreInesistente = await catturaErroreAccesso(
        caricaSessionePropria(
          contesto,
          "00000000-0000-4000-8000-000000000099",
        ),
      );

      expect({ status: erroreAltrui.status, ...erroreAltrui.toJSON() }).toEqual({
        status: erroreInesistente.status,
        ...erroreInesistente.toJSON(),
      });
      expect(erroreAltrui).toMatchObject({
        status: 404,
        codice: "sessione_non_disponibile",
        message: "Sessione d'asta non disponibile.",
      });
      expect(JSON.stringify(erroreAltrui)).not.toContain(altroUtente.valore.id);
    });
  },
);
