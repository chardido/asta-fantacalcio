import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

import { checkArchitecture } from "../../scripts/check-architecture.mjs";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const eslint = new ESLint({
  cwd: workspaceRoot,
  overrideConfigFile: join(workspaceRoot, "eslint.config.mjs"),
});

async function lint(source, relativeFilePath) {
  const [result] = await eslint.lintText(source, {
    filePath: join(workspaceRoot, relativeFilePath),
  });

  return result.messages.filter((message) => message.severity === 2);
}

const domainViolations = [
  {
    name: "import del database",
    source: 'import "@asta/db";',
    ruleId: "no-restricted-imports",
  },
  {
    name: "import degli adattatori",
    source: 'import "@asta/adapters";',
    ruleId: "no-restricted-imports",
  },
  {
    name: "I/O tramite fetch",
    source: 'export const load = () => fetch("https://example.test");',
    ruleId: "no-restricted-globals",
  },
  {
    name: "lettura implicita del tempo tramite Date",
    source: "export const now = () => new Date();",
    ruleId: "no-restricted-globals",
  },
  {
    name: "casualita implicita tramite Math.random",
    source: "export const random = () => Math.random();",
    ruleId: "no-restricted-properties",
  },
];

for (const violation of domainViolations) {
  test(`packages/domain rifiuta ${violation.name}`, async () => {
    const errors = await lint(
      violation.source,
      "packages/domain/src/violazione-deliberata.ts",
    );

    assert.ok(
      errors.some((error) => error.ruleId === violation.ruleId),
      `Regola ${violation.ruleId} non attivata: ${JSON.stringify(errors)}`,
    );
  });
}

test("lo strato API rifiuta l'accesso diretto a @asta/db", async () => {
  const errors = await lint(
    'import { repositorySessioni } from "@asta/db";\nexport { repositorySessioni };',
    "apps/web/src/app/api/sessioni/route.ts",
  );

  assert.ok(
    errors.some((error) => error.ruleId === "no-restricted-imports"),
    `Regola no-restricted-imports non attivata: ${JSON.stringify(errors)}`,
  );
});

test("lo strato API rifiuta anche gli accessi diretti a moduli interni di @asta/db", async () => {
  const errors = await lint(
    'import type { RepositorySessioniAsta } from "@asta/db/repository-contracts";\nexport type { RepositorySessioniAsta };',
    "apps/web/src/server/api/sessioni.ts",
  );

  assert.ok(
    errors.some((error) => error.ruleId === "no-restricted-imports"),
    `Regola no-restricted-imports non attivata: ${JSON.stringify(errors)}`,
  );
});

test("lo strato API puo dipendere dalla guardia applicativa", async () => {
  const errors = await lint(
    'import { caricaSessionePropria } from "@/server/sessioni/carica-sessione-propria";\nexport { caricaSessionePropria };',
    "apps/web/src/app/api/sessioni/route.ts",
  );

  assert.deepEqual(errors, []);
});

test("il dominio consente dipendenze pure e parametri espliciti", async () => {
  const errors = await lint(
    'import type { Configurazione } from "@asta/contracts";\nexport const valuta = (_cfg: Configurazione, now: number) => Math.max(0, now);',
    "packages/domain/src/codice-valido.ts",
  );

  assert.deepEqual(errors, []);
});

test("il lint architetturale fallisce per un CSS fuori dal tema", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-lint-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  const forbiddenCss = join(
    temporaryWorkspace,
    "apps/web/src/app/styles.module.css",
  );
  await mkdir(dirname(forbiddenCss), { recursive: true });
  await writeFile(forbiddenCss, ".root { display: block; }\n");

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts/check-architecture.mjs"),
      "--root",
      temporaryWorkspace,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/web\/src\/app\/styles\.module\.css/);
});

test("il lint architetturale consente CSS nella cartella tema", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-lint-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  const allowedCss = join(temporaryWorkspace, "apps/web/src/tema/theme.css");
  await mkdir(dirname(allowedCss), { recursive: true });
  await writeFile(allowedCss, ":root { color-scheme: light; }\n");

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts/check-architecture.mjs"),
      "--root",
      temporaryWorkspace,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
});

async function writeFixture(root, relativePath, source) {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source);
}

test("il controllo architetturale accetta il workspace corrente", async () => {
  assert.deepEqual(await checkArchitecture(workspaceRoot), []);
});

test("il controllo architetturale rileva dipendenze e globali vietati nel dominio", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-architecture-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  await writeFixture(
    temporaryWorkspace,
    "packages/domain/src/violazioni.ts",
    [
      'import "@asta/db";',
      'import "@asta/adapters";',
      'export const carica = () => fetch("https://example.test");',
      "export const ora = () => new Date();",
      "export const casuale = () => Math.random();",
    ].join("\n"),
  );

  const violations = await checkArchitecture(temporaryWorkspace);
  assert.ok(violations.some((violation) => violation.includes("@asta/db")));
  assert.ok(violations.some((violation) => violation.includes("@asta/adapters")));
  assert.ok(violations.some((violation) => violation.includes("fetch")));
  assert.ok(violations.some((violation) => violation.includes("Date")));
  assert.ok(violations.some((violation) => violation.includes("Math.random")));
});

test("il controllo architetturale richiede .int() negli schemi Zod di dominio", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-architecture-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  await writeFixture(
    temporaryWorkspace,
    "packages/contracts/src/domain.ts",
    [
      'import { z } from "zod";',
      "export const prezzoSchema = z.number().positive();",
    ].join("\n"),
  );

  const violations = await checkArchitecture(temporaryWorkspace);
  assert.ok(
    violations.some((violation) => violation.includes("deve applicare .int()")),
    JSON.stringify(violations),
  );
});

test("il controllo architetturale accetta schemi Zod numerici interi", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-architecture-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  await writeFixture(
    temporaryWorkspace,
    "packages/contracts/src/domain.ts",
    [
      'import { z } from "zod";',
      "export const prezzoSchema = z.number().int().positive();",
    ].join("\n"),
  );

  assert.deepEqual(await checkArchitecture(temporaryWorkspace), []);
});

test("il controllo architetturale rifiuta campi decimali non scalati nei tipi di dominio", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-architecture-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  await writeFixture(
    temporaryWorkspace,
    "packages/domain/src/statistiche.ts",
    "export interface Statistiche { readonly mediaVoto: number; }\n",
  );

  const violations = await checkArchitecture(temporaryWorkspace);
  assert.ok(
    violations.some(
      (violation) =>
        violation.includes("mediaVoto") && violation.includes("suffisso Milli"),
    ),
    JSON.stringify(violations),
  );
});

test("il controllo architetturale rifiuta accessi diretti al database dallo strato API", async (t) => {
  const temporaryWorkspace = await mkdtemp(join(tmpdir(), "asta-architecture-"));
  t.after(() => rm(temporaryWorkspace, { recursive: true, force: true }));

  await writeFixture(
    temporaryWorkspace,
    "apps/web/src/app/api/sessioni/route.ts",
    'import { creaRepositories } from "@asta/db";\nexport { creaRepositories };\n',
  );

  const violations = await checkArchitecture(temporaryWorkspace);
  assert.ok(
    violations.some(
      (violation) =>
        violation.includes("@asta/db") &&
        violation.includes("caricaSessionePropria"),
    ),
    JSON.stringify(violations),
  );
});

test("le sorgenti reali rispettano le regole ESLint architetturali", async () => {
  const results = await eslint.lintFiles([
    "packages/domain/**/*.{js,mjs,cjs,ts,tsx}",
    "apps/web/src/**/*.{js,mjs,cjs,ts,tsx}",
  ]);
  const architectureRuleIds = new Set([
    "no-restricted-globals",
    "no-restricted-imports",
    "no-restricted-properties",
  ]);
  const violations = results.flatMap((result) =>
    result.messages
      .filter(
        (message) =>
          message.severity === 2 && architectureRuleIds.has(message.ruleId),
      )
      .map((message) => `${result.filePath}:${message.line}:${message.column} ${message.message}`),
  );

  assert.deepEqual(violations, []);
});
