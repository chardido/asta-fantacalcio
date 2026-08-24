import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PrismaRepositoryAliasGiocatori } from "./repositories.js";

function prismaMock(overrides: Record<string, unknown>): PrismaClient {
  return overrides as unknown as PrismaClient;
}

const istante = new Date("2026-03-10T12:00:00.000Z");
const alias = {
  id: "00000000-0000-4000-8000-000000000030",
  nomeSorgente: "API-Football",
  identificativoSorgente: "123",
  nomeNormalizzato: "barella nicolo",
  squadraNormalizzata: "inter",
  identificativoGiocatore: "barella-23",
  creatoIl: istante,
  aggiornatoIl: istante,
};

describe("PrismaRepositoryAliasGiocatori", () => {
  it("elenca in ordine stabile gli alias della sola sorgente richiesta", async () => {
    const findMany = vi.fn().mockResolvedValue([alias]);
    const repository = new PrismaRepositoryAliasGiocatori(
      prismaMock({ aliasGiocatore: { findMany } }),
    );

    await expect(repository.elencaPerSorgente("API-Football")).resolves.toEqual([
      alias,
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { nomeSorgente: "API-Football" },
      orderBy: { identificativoSorgente: "asc" },
    });
  });

  it("salva con upsert l'associazione o lo scarto non risolto", async () => {
    const upsert = vi.fn().mockResolvedValue(alias);
    const repository = new PrismaRepositoryAliasGiocatori(
      prismaMock({ aliasGiocatore: { upsert } }),
    );
    const input = {
      nomeSorgente: alias.nomeSorgente,
      identificativoSorgente: alias.identificativoSorgente,
      nomeNormalizzato: alias.nomeNormalizzato,
      squadraNormalizzata: alias.squadraNormalizzata,
      identificativoGiocatore: alias.identificativoGiocatore,
    };

    await expect(repository.salva(input)).resolves.toEqual(alias);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        nomeSorgente_identificativoSorgente: {
          nomeSorgente: "API-Football",
          identificativoSorgente: "123",
        },
      },
      create: input,
      update: {
        nomeNormalizzato: "barella nicolo",
        squadraNormalizzata: "inter",
        identificativoGiocatore: "barella-23",
      },
    });
  });
});
