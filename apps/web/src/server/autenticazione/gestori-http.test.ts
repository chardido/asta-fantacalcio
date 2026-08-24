import { describe, expect, it } from "vitest";

import type {
  RisultatoAccesso,
  RisultatoRegistrazioneConSessione,
} from "./servizio-autenticazione";
import {
  gestisciAccesso,
  gestisciRegistrazione,
  gestisciUscita,
  indirizzoIpRichiesta,
} from "./gestori-http";

const sessioneAvviata = {
  utente: {
    id: "utente-1",
    email: "Mario@example.com",
    creatoIl: new Date("2026-01-01T00:00:00.000Z"),
  },
  tokenSessione: "token-opaco",
  cookie: {
    name: "sid" as const,
    value: "token-opaco",
    httpOnly: true as const,
    secure: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: 2_592_000,
  },
  creatoIl: new Date("2026-01-01T00:00:00.000Z"),
  scadeIlAssoluto: new Date("2026-01-31T00:00:00.000Z"),
};

function servizio(overrides: {
  readonly registrazione?: RisultatoRegistrazioneConSessione;
  readonly accesso?: RisultatoAccesso;
  readonly onEsci?: (token: string) => void;
  readonly onAccesso?: (ip: string) => void;
} = {}) {
  return {
    registraConSessione: async () =>
      overrides.registrazione ?? ({ ok: true, valore: sessioneAvviata } as const),
    accedi: async (_email: string, _password: string, ip: string) => {
      overrides.onAccesso?.(ip);
      return overrides.accesso ?? ({ ok: true, valore: sessioneAvviata } as const);
    },
    esci: async (token: string) => {
      overrides.onEsci?.(token);
    },
  };
}

// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
describe("gestori HTTP di autenticazione", () => {
  it("registra, avvia la sessione e imposta esclusivamente il cookie sicuro", async () => {
    const risposta = await gestisciRegistrazione(
      new Request("http://localhost/api/autenticazione/registrazione", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Mario@example.com",
          password: "password-sicura",
        }),
      }),
      servizio(),
    );

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("set-cookie")).toContain(
      "sid=token-opaco; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    expect(await risposta.json()).toEqual({
      utente: { id: "utente-1", email: "Mario@example.com" },
    });
  });

  it("riporta campo e vincolo di registrazione senza riflettere la password", async () => {
    const risposta = await gestisciRegistrazione(
      new Request("http://localhost/api/autenticazione/registrazione", {
        method: "POST",
        body: JSON.stringify({ email: "utente@", password: "breve" }),
      }),
      servizio(),
    );

    expect(risposta.status).toBe(400);
    const corpo = await risposta.json();
    expect(corpo).toMatchObject({
      codice: "validazione_input",
      campo: "email",
      vincolo: "Il formato dell'indirizzo email non è valido.",
    });
    expect(JSON.stringify(corpo)).not.toContain("breve");
  });

  it("restituisce lo stesso errore generico per credenziali non valide", async () => {
    let ipRicevuto = "";
    const risposta = await gestisciAccesso(
      new Request("http://localhost/api/autenticazione/accesso", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.10, 10.0.0.1" },
        body: JSON.stringify({ email: "assente@example.com", password: "errata" }),
      }),
      servizio({
        accesso: {
          ok: false,
          errore: {
            codice: "credenziali_non_valide",
            messaggio: "Credenziali non valide.",
          },
        },
        onAccesso: (ip) => {
          ipRicevuto = ip;
        },
      }),
    );

    expect(risposta.status).toBe(401);
    expect(ipRicevuto).toBe("192.0.2.10");
    await expect(risposta.json()).resolves.toEqual({
      codice: "credenziali_non_valide",
      messaggio: "Credenziali non valide.",
      campo: null,
      vincolo: null,
    });
  });

  it("revoca il sid corrente e lo elimina dal browser", async () => {
    let tokenRevocato = "";
    const risposta = await gestisciUscita(
      new Request("http://localhost/api/autenticazione/uscita", {
        method: "POST",
        headers: { cookie: "altro=1; sid=token%2Dcorrente" },
      }),
      servizio({
        onEsci: (token) => {
          tokenRevocato = token;
        },
      }),
    );

    expect(tokenRevocato).toBe("token-corrente");
    expect(risposta.status).toBe(204);
    expect(risposta.headers.get("set-cookie")).toContain("sid=; Max-Age=0");
  });

  it("usa un fallback stabile quando nessun proxy espone l'indirizzo IP", () => {
    expect(indirizzoIpRichiesta(new Request("http://localhost"))).toBe(
      "indirizzo-sconosciuto",
    );
  });
});
