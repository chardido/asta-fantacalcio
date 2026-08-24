import { configurazioneAstaSchema } from "@asta/contracts";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

import type { UtenteRegistrato } from "../autenticazione/servizio-autenticazione.js";
import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria.js";
import { creaContestoTrpc, leggiCookie, type ContestoTrpc } from "./contesto.js";
import {
  descriviErroreTrpc,
  ErroreApplicativo,
  mappaErroreTrpc,
  sanitizzaValoriImmessi,
  type StatoErroreApi,
} from "./errori.js";
import {
  creaRouter,
  proceduraAutenticata,
  proceduraPubblica,
} from "./trpc.js";

const utente: UtenteRegistrato = {
  id: "utente-1",
  email: "utente@example.com",
  creatoIl: new Date("2026-01-01T00:00:00.000Z"),
};

const configurazioneValida = {
  nome: "Asta principale",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: {
    quotazione: 30,
    budgetReparto: 25,
    budgetTotale: 15,
    slotResidui: 10,
    statistiche: 20,
    audacia: 20,
  },
} as const;

function contesto(utenteRisolto: UtenteRegistrato | null): ContestoTrpc {
  return {
    tokenSessione: utenteRisolto === null ? null : "token-valido",
    utente: utenteRisolto,
    autenticazione: { risolvi: vi.fn().mockResolvedValue(utenteRisolto) },
  };
}

describe("contesto tRPC", () => {
  it("legge sid fra piu cookie preservando i caratteri codificati", () => {
    expect(leggiCookie("tema=scuro; sid=abc%2Fdef%3D; lingua=it", "sid")).toBe(
      "abc/def=",
    );
    expect(leggiCookie("tema=scuro", "sid")).toBeNull();
    expect(leggiCookie("sid=%E0%A4%A", "sid")).toBeNull();
  });

  it("risolve la sessione una sola volta e rende l'utente disponibile al middleware", async () => {
    const risolvi = vi.fn().mockResolvedValue(utente);
    const richiesta = new Request("https://asta.example/api/trpc", {
      headers: { cookie: "sid=token-sessione" },
    });

    await expect(
      creaContestoTrpc(richiesta, { autenticazione: { risolvi } }),
    ).resolves.toEqual({
      tokenSessione: "token-sessione",
      utente,
      autenticazione: { risolvi },
    });
    expect(risolvi).toHaveBeenCalledOnce();
    expect(risolvi).toHaveBeenCalledWith("token-sessione");
  });

  it("non interroga il servizio auth quando sid e assente", async () => {
    const risolvi = vi.fn();

    const risultato = await creaContestoTrpc(
      new Request("https://asta.example/api/trpc"),
      { autenticazione: { risolvi } },
    );

    expect(risultato.utente).toBeNull();
    expect(risultato.tokenSessione).toBeNull();
    expect(risolvi).not.toHaveBeenCalled();
  });
});

describe("mappatura degli errori tRPC", () => {
  it.each<[StatoErroreApi, TRPCError["code"]]>([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [503, "SERVICE_UNAVAILABLE"],
  ])("mappa lo status %i nel codice %s", (status, codiceTrpc) => {
    const errore = new ErroreApplicativo(
      status,
      { codice: `errore_${status}` },
      "Operazione rifiutata.",
    );

    expect(mappaErroreTrpc(errore)).toMatchObject({
      code: codiceTrpc,
      message: "Operazione rifiutata.",
      cause: errore,
    });
  });

  it("riusa la semantica 401/404 della guardia delle sessioni", () => {
    expect(mappaErroreTrpc(new ErroreHttpAccessoSessione(401)).code).toBe(
      "UNAUTHORIZED",
    );
    expect(mappaErroreTrpc(new ErroreHttpAccessoSessione(404)).code).toBe(
      "NOT_FOUND",
    );
  });

  it("formatta gli errori Zod con codice, campo, vincolo e valori immessi", () => {
    const input = { ...configurazioneValida, nome: "" };
    const validazione = configurazioneAstaSchema.safeParse(input);
    expect(validazione.success).toBe(false);
    if (validazione.success) return;

    const formattato = descriviErroreTrpc(
      new TRPCError({
        code: "BAD_REQUEST",
        message: "Input non valido",
        cause: validazione.error,
      }),
      input,
    );

    expect(formattato).toMatchObject({
      codice: "validazione_input",
      campo: "nome",
      valoriImmessi: input,
    });
    expect(formattato.vincolo).toEqual(expect.any(String));
  });

  it("conserva i dettagli applicativi ma redige credenziali e token", () => {
    const errore = mappaErroreTrpc(
      new ErroreApplicativo(
        409,
        {
          codice: "giocatore_gia_assegnato",
          campo: "identificativoGiocatore",
          vincolo: "giocatore_univoco_nel_registro_attivo",
          dettagli: { assegnatario: "Avversario 1" },
        },
        "Il giocatore e gia assegnato.",
      ),
    );

    expect(
      descriviErroreTrpc(errore, {
        identificativoGiocatore: "g-1",
        password: "non-deve-apparire",
        tokenSessione: "segreto",
      }),
    ).toEqual({
      codice: "giocatore_gia_assegnato",
      campo: "identificativoGiocatore",
      vincolo: "giocatore_univoco_nel_registro_attivo",
      valoriImmessi: {
        identificativoGiocatore: "g-1",
        password: "[redatto]",
        tokenSessione: "[redatto]",
      },
      dettagli: { assegnatario: "Avversario 1" },
    });
  });

  it("rende serializzabili anche valori ricorsivi senza propagare eccezioni", () => {
    const input: { nome: string; self?: unknown } = { nome: "Asta" };
    input.self = input;

    expect(sanitizzaValoriImmessi(input)).toEqual({
      nome: "Asta",
      self: "[valore_circolare]",
    });
  });
});

describe("procedure tRPC", () => {
  const router = creaRouter({
    configura: proceduraPubblica
      .input(configurazioneAstaSchema)
      .query(({ input }) => input.nome),
    identita: proceduraAutenticata.query(({ ctx }) => ctx.utente.id),
    conflitto: proceduraAutenticata.mutation(() => {
      throw new ErroreApplicativo(
        409,
        { codice: "conflitto_stato" },
        "Conflitto di stato.",
      );
    }),
  });

  it("usa direttamente i contratti Zod condivisi come parser di input", async () => {
    const caller = router.createCaller(contesto(null));

    await expect(caller.configura(configurazioneValida)).resolves.toBe(
      "Asta principale",
    );
    await expect(
      caller.configura({ ...configurazioneValida, creditiIniziali: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("nega una procedura protetta senza utente e restringe il tipo del contesto quando autenticato", async () => {
    await expect(
      router.createCaller(contesto(null)).identita(),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Autenticazione richiesta.",
    });
    await expect(router.createCaller(contesto(utente)).identita()).resolves.toBe(
      utente.id,
    );
  });

  it("normalizza gli errori applicativi sollevati dai resolver", async () => {
    await expect(
      router.createCaller(contesto(utente)).conflitto(),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Conflitto di stato.",
    });
  });
});
