import { verify } from "@node-rs/argon2";
import type {
  NuovoUtente,
  RepositoryUtenti,
  UtentePersistito,
} from "@asta/db";
import { describe, expect, it } from "vitest";

import {
  ServizioAutenticazione,
  emailValida,
  passwordValida,
  preparaEmail,
} from "./servizio-autenticazione.js";

class RepositoryUtentiInMemoria implements RepositoryUtenti {
  readonly utenti: UtentePersistito[] = [];
  creaInvocazioni = 0;
  erroreCreazione: unknown = null;

  async crea(input: NuovoUtente): Promise<UtentePersistito> {
    this.creaInvocazioni += 1;
    if (this.erroreCreazione !== null) {
      throw this.erroreCreazione;
    }

    const utente: UtentePersistito = {
      ...input,
      id: `utente-${this.utenti.length + 1}`,
      creatoIl: new Date("2026-01-01T00:00:00.000Z"),
    };
    this.utenti.push(utente);
    return utente;
  }

  async trovaPerId(id: string): Promise<UtentePersistito | null> {
    return this.utenti.find((utente) => utente.id === id) ?? null;
  }

  async trovaPerEmailNormalizzata(email: string): Promise<UtentePersistito | null> {
    return (
      this.utenti.find((utente) => utente.emailNormalizzata === email) ?? null
    );
  }
}

const PASSWORD_VALIDA = "password-sicura";

describe("preparazione e validazione delle credenziali", () => {
  it("normalizza con trim e minuscolo conservando il formato visualizzato senza spazi esterni", () => {
    expect(preparaEmail("  Mario.Rossi@Example.COM  ")).toEqual({
      normalizzata: "mario.rossi@example.com",
      visualizzata: "Mario.Rossi@Example.COM",
    });
  });

  it.each([
    ["manca-il-separatore", false],
    ["utente@", false],
    [`utente@${"d".repeat(247)}`, true],
    [`utente@${"d".repeat(248)}`, false],
    ["@dominio.it", true],
    ["utente@@dominio.it", true],
  ])("valida l'email %s secondo i soli vincoli richiesti", (email, attesa) => {
    expect(emailValida(email)).toBe(attesa);
  });

  it.each([
    [7, false],
    [8, true],
    [128, true],
    [129, false],
  ])("valida password lunghe %i caratteri", (lunghezza, attesa) => {
    expect(passwordValida("x".repeat(lunghezza))).toBe(attesa);
  });
});

describe("ServizioAutenticazione.registra", () => {
  it("persiste email e hash Argon2id con i parametri richiesti, esponendo solo dati pubblici", async () => {
    const repository = new RepositoryUtentiInMemoria();
    const servizio = new ServizioAutenticazione(repository);

    const risultato = await servizio.registra(
      "  Mario.Rossi@Example.COM  ",
      PASSWORD_VALIDA,
    );

    expect(risultato).toEqual({
      ok: true,
      valore: {
        id: "utente-1",
        email: "Mario.Rossi@Example.COM",
        creatoIl: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    expect(risultato.ok && Object.keys(risultato.valore)).toEqual([
      "id",
      "email",
      "creatoIl",
    ]);

    const persistito = repository.utenti[0];
    expect(persistito).toBeDefined();
    expect(persistito).toMatchObject({
      emailNormalizzata: "mario.rossi@example.com",
      emailVisualizzata: "Mario.Rossi@Example.COM",
    });
    expect(persistito?.passwordHash).not.toBe(PASSWORD_VALIDA);
    expect(persistito?.passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
    );
    expect(await verify(persistito?.passwordHash ?? "", PASSWORD_VALIDA)).toBe(
      true,
    );
  });

  it("usa un salt univoco per utenti con la stessa password", async () => {
    const repository = new RepositoryUtentiInMemoria();
    const servizio = new ServizioAutenticazione(repository);

    await servizio.registra("primo@example.com", PASSWORD_VALIDA);
    await servizio.registra("secondo@example.com", PASSWORD_VALIDA);

    expect(repository.utenti).toHaveLength(2);
    expect(repository.utenti[0]?.passwordHash).not.toBe(
      repository.utenti[1]?.passwordHash,
    );
  });

  it("rifiuta un duplicato ignorando maiuscole e spazi esterni senza creare un utente", async () => {
    const repository = new RepositoryUtentiInMemoria();
    const servizio = new ServizioAutenticazione(repository);
    await servizio.registra("Mario@example.com", PASSWORD_VALIDA);

    const risultato = await servizio.registra(
      "  MARIO@EXAMPLE.COM ",
      PASSWORD_VALIDA,
    );

    expect(risultato).toEqual({
      ok: false,
      errore: {
        codice: "email_gia_registrata",
        campo: "email",
        vincolo: "email_normalizzata_univoca",
        messaggio: "L'indirizzo email è già registrato.",
      },
    });
    expect(repository.utenti).toHaveLength(1);
    expect(repository.creaInvocazioni).toBe(1);
  });

  it("traduce anche il conflitto unico concorrente nello stesso errore di duplicato", async () => {
    const repository = new RepositoryUtentiInMemoria();
    repository.erroreCreazione = { code: "P2002" };
    const servizio = new ServizioAutenticazione(repository);

    const risultato = await servizio.registra(
      "concorrente@example.com",
      PASSWORD_VALIDA,
    );

    expect(risultato).toMatchObject({
      ok: false,
      errore: { codice: "email_gia_registrata" },
    });
  });

  it.each([
    ["email-senza-chiocciola", PASSWORD_VALIDA, "email_non_valida"],
    ["utente@", PASSWORD_VALIDA, "email_non_valida"],
    [`utente@${"d".repeat(248)}`, PASSWORD_VALIDA, "email_non_valida"],
    ["utente@example.com", "x".repeat(7), "password_lunghezza_non_valida"],
    ["utente@example.com", "x".repeat(129), "password_lunghezza_non_valida"],
  ])(
    "rifiuta credenziali non valide senza persistere (%s)",
    async (email, password, codice) => {
      const repository = new RepositoryUtentiInMemoria();
      const servizio = new ServizioAutenticazione(repository);

      const risultato = await servizio.registra(email, password);

      expect(risultato).toMatchObject({ ok: false, errore: { codice } });
      expect(JSON.stringify(risultato)).not.toContain(password);
      expect(repository.creaInvocazioni).toBe(0);
      expect(repository.utenti).toHaveLength(0);
    },
  );

  it("propaga gli errori di persistenza che non rappresentano un duplicato", async () => {
    const repository = new RepositoryUtentiInMemoria();
    const errorePersistenza = new Error("database non disponibile");
    repository.erroreCreazione = errorePersistenza;
    const servizio = new ServizioAutenticazione(repository);

    await expect(
      servizio.registra("utente@example.com", PASSWORD_VALIDA),
    ).rejects.toBe(errorePersistenza);
  });
});
