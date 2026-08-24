import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PrismaRepositorySessioniAuth } from "./repositories.js";

describe("PrismaRepositorySessioniAuth", () => {
  it("aggiorna l'attivita con un'unica scrittura condizionale su soglia, revoca e scadenza", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      sessioneAuth: { updateMany },
    } as unknown as PrismaClient;
    const repository = new PrismaRepositorySessioniAuth(prisma);
    const soglia = new Date("2026-03-10T11:59:00.000Z");
    const istante = new Date("2026-03-10T12:00:00.000Z");

    await expect(
      repository.aggiornaUltimaAttivitaSePrecedenteA(
        "00000000-0000-4000-8000-000000000001",
        soglia,
        istante,
      ),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000001",
        ultimaAttivitaIl: { lte: soglia },
        revocataIl: null,
        scadeIlAssoluto: { gt: istante },
      },
      data: { ultimaAttivitaIl: istante },
    });
  });

  it("segnala che nessuna sessione era aggiornabile quando la condizione atomica non corrisponde", async () => {
    const prisma = {
      sessioneAuth: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaClient;
    const repository = new PrismaRepositorySessioniAuth(prisma);

    await expect(
      repository.aggiornaUltimaAttivitaSePrecedenteA(
        "00000000-0000-4000-8000-000000000001",
        new Date("2026-03-10T11:59:00.000Z"),
        new Date("2026-03-10T12:00:00.000Z"),
      ),
    ).resolves.toBe(false);
  });
});
