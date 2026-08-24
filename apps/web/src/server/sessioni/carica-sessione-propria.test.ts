import type { ConfigurazioneAsta } from "@asta/contracts";
import type { SessioneAstaPersistita } from "@asta/db";
import { describe, expect, it, vi } from "vitest";

import type { UtenteRegistrato } from "../autenticazione/servizio-autenticazione.js";
import {
  ErroreHttpAccessoSessione,
  caricaSessionePropria,
  type ContestoAccessoSessione,
} from "./carica-sessione-propria.js";

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

const utente: UtenteRegistrato = {
  id: "utente-proprietario",
  email: "proprietario@example.com",
  creatoIl: new Date("2026-01-01T00:00:00.000Z"),
};

function sessionePersistita(
  utenteId = utente.id,
): SessioneAstaPersistita {
  return {
    id: "sessione-asta-1",
    utenteId,
    stagioneListone: "2025/2026",
    stato: "in_corso",
    configurazione,
    avvisiInformativiAttivi: true,
    creatoIl: new Date("2026-01-02T00:00:00.000Z"),
    aggiornatoIl: new Date("2026-01-03T00:00:00.000Z"),
  };
}

function contesto(
  tokenSessione: string | null | undefined,
  utenteRisolto: UtenteRegistrato | null,
  sessioneRisolta: SessioneAstaPersistita | null,
): {
  valore: ContestoAccessoSessione;
  risolvi: ReturnType<typeof vi.fn>;
  trovaPerId: ReturnType<typeof vi.fn>;
} {
  const risolvi = vi.fn().mockResolvedValue(utenteRisolto);
  const trovaPerId = vi.fn().mockResolvedValue(sessioneRisolta);
  return {
    valore: {
      tokenSessione,
      autenticazione: { risolvi },
      sessioniAsta: { trovaPerId },
    },
    risolvi,
    trovaPerId,
  };
}

async function catturaErrore(
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

// **Validates: Requirements 1.10**
describe("caricaSessionePropria - autenticazione", () => {
  it.each([null, undefined, ""])(
    "restituisce 401 senza interrogare autenticazione o repository quando sid e %s",
    async (tokenSessione) => {
      const scenario = contesto(tokenSessione, utente, sessionePersistita());

      await expect(
        caricaSessionePropria(scenario.valore, "sessione-asta-1"),
      ).rejects.toMatchObject({
        status: 401,
        codice: "non_autenticato",
        message: "Autenticazione richiesta.",
      });
      expect(scenario.risolvi).not.toHaveBeenCalled();
      expect(scenario.trovaPerId).not.toHaveBeenCalled();
    },
  );

  it("restituisce 401 e non legge la sessione quando il token e scaduto, revocato o ignoto", async () => {
    const scenario = contesto("token-non-valido", null, sessionePersistita());

    await expect(
      caricaSessionePropria(scenario.valore, "sessione-asta-1"),
    ).rejects.toMatchObject({ status: 401, codice: "non_autenticato" });
    expect(scenario.risolvi).toHaveBeenCalledOnce();
    expect(scenario.risolvi).toHaveBeenCalledWith("token-non-valido");
    expect(scenario.trovaPerId).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 1.11, 2.12**
describe("caricaSessionePropria - proprieta", () => {
  it("restituisce soltanto la sessione appartenente all'utente autenticato", async () => {
    const sessione = sessionePersistita();
    const scenario = contesto("token-valido", utente, sessione);

    await expect(
      caricaSessionePropria(scenario.valore, sessione.id),
    ).resolves.toBe(sessione);
    expect(scenario.risolvi).toHaveBeenCalledBefore(scenario.trovaPerId);
    expect(scenario.trovaPerId).toHaveBeenCalledWith(sessione.id);
  });

  it("produce una risposta 404 indistinguibile per sessione altrui e inesistente", async () => {
    const altrui = contesto(
      "token-valido",
      utente,
      sessionePersistita("utente-diverso"),
    );
    const inesistente = contesto("token-valido", utente, null);

    const erroreAltrui = await catturaErrore(
      caricaSessionePropria(altrui.valore, "sessione-richiesta"),
    );
    const erroreInesistente = await catturaErrore(
      caricaSessionePropria(inesistente.valore, "sessione-richiesta"),
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
    expect(JSON.stringify(erroreAltrui)).not.toContain("utente-diverso");
    expect(altrui.trovaPerId).toHaveBeenCalledOnce();
    expect(inesistente.trovaPerId).toHaveBeenCalledOnce();
  });
});
