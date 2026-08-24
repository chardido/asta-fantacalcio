import { hash, verify } from "@node-rs/argon2";
import type {
  NuovaSessioneAuth,
  NuovoUtente,
  RepositorySessioniAuth,
  RepositoryUtenti,
  SessioneAuthPersistita,
  UtentePersistito,
} from "@asta/db";
import { beforeAll, describe, expect, it } from "vitest";

import { LimitatoreTentativiAccesso } from "./limitatore-tentativi-accesso.js";
import {
  HASH_PASSWORD_FITTIZIO,
  PARAMETRI_ARGON2ID,
  ServizioAutenticazione,
  creaCookieSidScaduto,
  hashTokenSessione,
} from "./servizio-autenticazione.js";

const PASSWORD_VALIDA = "password-sicura";
const ORA_BASE = new Date("2026-03-10T12:00:00.000Z");
const GIORNO_MS = 24 * 60 * 60 * 1000;

let passwordHashValido = "";

beforeAll(async () => {
  passwordHashValido = await hash(PASSWORD_VALIDA, PARAMETRI_ARGON2ID);
});

class RepositoryUtentiInMemoria implements RepositoryUtenti {
  readonly utenti: UtentePersistito[];

  constructor(utenti: readonly UtentePersistito[] = []) {
    this.utenti = [...utenti];
  }

  async crea(input: NuovoUtente): Promise<UtentePersistito> {
    const utente: UtentePersistito = {
      ...input,
      id: `utente-${this.utenti.length + 1}`,
      creatoIl: ORA_BASE,
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

class RepositorySessioniAuthInMemoria implements RepositorySessioniAuth {
  readonly sessioni: SessioneAuthPersistita[] = [];
  aggiornamentiRiusciti = 0;
  revoche = 0;

  async crea(input: NuovaSessioneAuth): Promise<SessioneAuthPersistita> {
    const sessione: SessioneAuthPersistita = {
      ...input,
      id: `sessione-${this.sessioni.length + 1}`,
      creatoIl: input.ultimaAttivitaIl,
      revocataIl: null,
    };
    this.sessioni.push(sessione);
    return sessione;
  }

  async trovaPerTokenHash(
    tokenHash: string,
  ): Promise<SessioneAuthPersistita | null> {
    return (
      this.sessioni.find((sessione) => sessione.tokenHash === tokenHash) ?? null
    );
  }

  async aggiornaUltimaAttivita(
    id: string,
    istante: Date,
  ): Promise<SessioneAuthPersistita> {
    return this.sostituisci(id, { ultimaAttivitaIl: istante });
  }

  async aggiornaUltimaAttivitaSePrecedenteA(
    id: string,
    soglia: Date,
    istante: Date,
  ): Promise<boolean> {
    const sessione = this.sessioni.find((corrente) => corrente.id === id);
    if (
      sessione === undefined ||
      sessione.revocataIl !== null ||
      sessione.scadeIlAssoluto.getTime() <= istante.getTime() ||
      sessione.ultimaAttivitaIl.getTime() > soglia.getTime()
    ) {
      return false;
    }

    this.aggiornamentiRiusciti += 1;
    this.sostituisci(id, { ultimaAttivitaIl: istante });
    return true;
  }

  async revoca(id: string, istante: Date): Promise<SessioneAuthPersistita> {
    this.revoche += 1;
    return this.sostituisci(id, { revocataIl: istante });
  }

  private sostituisci(
    id: string,
    modifica: Partial<SessioneAuthPersistita>,
  ): SessioneAuthPersistita {
    const indice = this.sessioni.findIndex((sessione) => sessione.id === id);
    const corrente = this.sessioni[indice];
    if (indice < 0 || corrente === undefined) {
      throw new Error(`Sessione ${id} non trovata.`);
    }

    const aggiornata = { ...corrente, ...modifica };
    this.sessioni[indice] = aggiornata;
    return aggiornata;
  }
}

function utentePersistito(): UtentePersistito {
  return {
    id: "utente-1",
    emailNormalizzata: "mario@example.com",
    emailVisualizzata: "Mario@example.com",
    passwordHash: passwordHashValido,
    creatoIl: new Date("2026-01-01T00:00:00.000Z"),
  };
}

async function aggiungiSessione(
  repository: RepositorySessioniAuthInMemoria,
  token: string,
  ultimaAttivitaIl: Date,
  scadeIlAssoluto: Date,
): Promise<SessioneAuthPersistita> {
  return repository.crea({
    utenteId: "utente-1",
    tokenHash: hashTokenSessione(token),
    ultimaAttivitaIl,
    scadeIlAssoluto,
  });
}

describe("ServizioAutenticazione.registraConSessione", () => {
  it("crea l'account e avvia immediatamente una sessione autenticata", async () => {
    const utenti = new RepositoryUtentiInMemoria();
    const sessioni = new RepositorySessioniAuthInMemoria();
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      ora: () => ORA_BASE,
      generaByteCasuali: () => new Uint8Array(32).fill(7),
    });

    const risultato = await servizio.registraConSessione(
      "Nuovo@example.com",
      PASSWORD_VALIDA,
    );

    expect(risultato).toMatchObject({
      ok: true,
      valore: {
        utente: { email: "Nuovo@example.com" },
        cookie: {
          name: "sid",
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        },
      },
    });
    expect(utenti.utenti).toHaveLength(1);
    expect(sessioni.sessioni).toHaveLength(1);
    expect(
      risultato.ok &&
        sessioni.sessioni[0]?.tokenHash ===
          hashTokenSessione(risultato.valore.tokenSessione),
    ).toBe(true);
  });
});

describe("ServizioAutenticazione.accedi", () => {
  it("crea un token opaco da 256 bit e persiste esclusivamente il suo hash SHA-256", async () => {
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    const byteDeterministici = Uint8Array.from({ length: 32 }, (_, indice) => indice);
    const richiesteCasualita: number[] = [];
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
      generaByteCasuali: (numeroByte) => {
        richiesteCasualita.push(numeroByte);
        return byteDeterministici;
      },
    });

    const risultato = await servizio.accedi(
      "  MARIO@EXAMPLE.COM ",
      PASSWORD_VALIDA,
      "192.0.2.10",
    );

    expect(risultato.ok).toBe(true);
    if (!risultato.ok) return;

    const tokenAtteso = Buffer.from(byteDeterministici).toString("base64url");
    expect(richiesteCasualita).toEqual([32]);
    expect(risultato.valore).toMatchObject({
      utente: {
        id: "utente-1",
        email: "Mario@example.com",
      },
      tokenSessione: tokenAtteso,
      creatoIl: ORA_BASE,
      scadeIlAssoluto: new Date(ORA_BASE.getTime() + 30 * GIORNO_MS),
      cookie: {
        name: "sid",
        value: tokenAtteso,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      },
    });
    expect(sessioni.sessioni).toHaveLength(1);
    expect(sessioni.sessioni[0]?.tokenHash).toBe(hashTokenSessione(tokenAtteso));
    expect(sessioni.sessioni[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(sessioni.sessioni[0])).not.toContain(tokenAtteso);
  });

  it("verifica l'hash fittizio Argon2id per email inesistente e restituisce lo stesso errore", async () => {
    expect(await verify(HASH_PASSWORD_FITTIZIO, PASSWORD_VALIDA)).toBe(false);

    const utente = utentePersistito();
    const utenti = new RepositoryUtentiInMemoria([utente]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    const hashVerificati: string[] = [];
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      verificaPassword: async (passwordHash) => {
        hashVerificati.push(passwordHash);
        return false;
      },
    });

    const emailEsistente = await servizio.accedi(
      "mario@example.com",
      "password-errata",
      "192.0.2.11",
    );
    const emailInesistente = await servizio.accedi(
      "assente@example.com",
      "password-errata",
      "192.0.2.12",
    );

    expect(emailInesistente).toEqual(emailEsistente);
    expect(emailInesistente).toEqual({
      ok: false,
      errore: {
        codice: "credenziali_non_valide",
        messaggio: "Credenziali non valide.",
      },
    });
    expect(hashVerificati).toEqual([
      utente.passwordHash,
      HASH_PASSWORD_FITTIZIO,
    ]);
    expect(sessioni.sessioni).toHaveLength(0);
  });

  it("completa la verifica password e restituisce lo stesso errore quando l'email e limitata", async () => {
    const utente = utentePersistito();
    const utenti = new RepositoryUtentiInMemoria([utente]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    const hashVerificati: string[] = [];
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
      verificaPassword: async (passwordHash, password) => {
        hashVerificati.push(passwordHash);
        return password === PASSWORD_VALIDA;
      },
    });

    for (let indice = 0; indice < 5; indice += 1) {
      await servizio.accedi(
        indice % 2 === 0 ? "MARIO@example.com" : " mario@EXAMPLE.COM ",
        "password-errata",
        `192.0.2.${20 + indice}`,
      );
    }

    const limitato = await servizio.accedi(
      "mario@example.com",
      PASSWORD_VALIDA,
      "192.0.2.25",
    );
    const credenzialiErrate = await servizio.accedi(
      "assente@example.com",
      "password-errata",
      "192.0.2.26",
    );

    expect(limitato).toEqual(credenzialiErrate);
    expect(limitato).toEqual({
      ok: false,
      errore: {
        codice: "credenziali_non_valide",
        messaggio: "Credenziali non valide.",
      },
    });
    expect(hashVerificati).toHaveLength(7);
    expect(hashVerificati.slice(-2)).toEqual([
      utente.passwordHash,
      HASH_PASSWORD_FITTIZIO,
    ]);
    expect(sessioni.sessioni).toHaveLength(0);
  });

  it("con richieste concorrenti crea al massimo cinque sessioni per la stessa email", async () => {
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    let sequenzaToken = 0;
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
      verificaPassword: async () => true,
      generaByteCasuali: () => {
        sequenzaToken += 1;
        return Uint8Array.from(
          { length: 32 },
          (_, indice) => (sequenzaToken + indice) % 256,
        );
      },
    });

    const risultati = await Promise.all(
      Array.from({ length: 6 }, (_, indice) =>
        servizio.accedi(
          "mario@example.com",
          PASSWORD_VALIDA,
          `198.51.100.${indice + 1}`,
        ),
      ),
    );

    expect(risultati.filter((risultato) => risultato.ok)).toHaveLength(5);
    expect(risultati.filter((risultato) => !risultato.ok)).toEqual([
      {
        ok: false,
        errore: {
          codice: "credenziali_non_valide",
          messaggio: "Credenziali non valide.",
        },
      },
    ]);
    expect(sessioni.sessioni).toHaveLength(5);
  });
});

describe("ciclo di vita della sessione", () => {
  it("risolve una sessione valida e aggiorna l'attivita con scrittura atomica al massimo ogni 60 secondi", async () => {
    let ora = new Date(ORA_BASE);
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    const token = "token-attivita";
    await aggiungiSessione(
      sessioni,
      token,
      new Date(ora.getTime() - 60_000),
      new Date(ora.getTime() + GIORNO_MS),
    );
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ora,
    });

    const risultati = await Promise.all([
      servizio.risolvi(token),
      servizio.risolvi(token),
      servizio.risolvi(token),
    ]);

    expect(risultati).toEqual([
      expect.objectContaining({ id: "utente-1" }),
      expect.objectContaining({ id: "utente-1" }),
      expect.objectContaining({ id: "utente-1" }),
    ]);
    expect(sessioni.aggiornamentiRiusciti).toBe(1);

    ora = new Date(ora.getTime() + 59_999);
    await servizio.risolvi(token);
    expect(sessioni.aggiornamentiRiusciti).toBe(1);

    ora = new Date(ora.getTime() + 1);
    await servizio.risolvi(token);
    expect(sessioni.aggiornamentiRiusciti).toBe(2);
  });

  it("considera invalida la sessione quando raggiunge 24 ore di inattivita", async () => {
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    await aggiungiSessione(
      sessioni,
      "ancora-valida",
      new Date(ORA_BASE.getTime() - GIORNO_MS + 1),
      new Date(ORA_BASE.getTime() + GIORNO_MS),
    );
    await aggiungiSessione(
      sessioni,
      "appena-scaduta",
      new Date(ORA_BASE.getTime() - GIORNO_MS),
      new Date(ORA_BASE.getTime() + GIORNO_MS),
    );
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
    });

    await expect(servizio.risolvi("ancora-valida")).resolves.toMatchObject({
      id: "utente-1",
    });
    await expect(servizio.risolvi("appena-scaduta")).resolves.toBeNull();
  });

  it("considera invalida la sessione quando raggiunge 30 giorni dalla creazione", async () => {
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    await aggiungiSessione(
      sessioni,
      "limite-assoluto",
      ORA_BASE,
      ORA_BASE,
    );
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
    });

    await expect(servizio.risolvi("limite-assoluto")).resolves.toBeNull();
    expect(sessioni.aggiornamentiRiusciti).toBe(0);
  });

  it("revoca al logout e tratta sia il token revocato sia un token ignoto come non autenticati", async () => {
    const utenti = new RepositoryUtentiInMemoria([utentePersistito()]);
    const sessioni = new RepositorySessioniAuthInMemoria();
    const token = "token-logout";
    await aggiungiSessione(
      sessioni,
      token,
      ORA_BASE,
      new Date(ORA_BASE.getTime() + GIORNO_MS),
    );
    const servizio = new ServizioAutenticazione(utenti, sessioni, {
      limitatoreTentativiAccesso: new LimitatoreTentativiAccesso(),
      ora: () => ORA_BASE,
    });

    await servizio.esci(token);
    await servizio.esci("token-ignoto");

    expect(sessioni.revoche).toBe(1);
    await expect(servizio.risolvi(token)).resolves.toBeNull();
    expect(creaCookieSidScaduto()).toEqual({
      name: "sid",
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
