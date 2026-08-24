import { accessoSchema, registrazioneSchema } from "@asta/contracts";

import { leggiCookie } from "../trpc/contesto";
import type {
  CookieSid,
  ServizioAutenticazione,
} from "./servizio-autenticazione";

export interface ErroreAutenticazioneHttp {
  readonly codice: string;
  readonly messaggio: string;
  readonly campo: string | null;
  readonly vincolo: string | null;
}

type ServizioAuthHttp = Pick<
  ServizioAutenticazione,
  "accedi" | "esci" | "registraConSessione"
>;

function rispostaErrore(
  status: number,
  errore: ErroreAutenticazioneHttp,
): Response {
  return Response.json(errore, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function serializzaCookie(cookie: CookieSid): string {
  return [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Max-Age=${cookie.maxAge}`,
    `Path=${cookie.path}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

async function leggiCorpoJson(richiesta: Request): Promise<unknown> {
  try {
    return await richiesta.json();
  } catch {
    return null;
  }
}

function rispostaValidazione(errore: {
  readonly issues: readonly {
    readonly message: string;
    readonly path: readonly PropertyKey[];
  }[];
}): Response {
  const issue = errore.issues[0];
  return rispostaErrore(400, {
    codice: "validazione_input",
    messaggio: issue?.message ?? "I dati inseriti non sono validi.",
    campo:
      issue === undefined || issue.path.length === 0
        ? null
        : issue.path.map(String).join("."),
    vincolo: issue?.message ?? null,
  });
}

function rispostaSessione(
  cookie: CookieSid,
  utente: Readonly<{ id: string; email: string }>,
): Response {
  return Response.json(
    { utente: { id: utente.id, email: utente.email } },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "set-cookie": serializzaCookie(cookie),
      },
    },
  );
}

/** Prima voce affidabile della catena proxy, usata soltanto dal limitatore login. */
export function indirizzoIpRichiesta(richiesta: Request): string {
  const inoltrato = richiesta.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (inoltrato !== undefined && inoltrato.length > 0) {
    return inoltrato;
  }
  return richiesta.headers.get("x-real-ip")?.trim() || "indirizzo-sconosciuto";
}

/** Registra l'account e avvia la sessione nella stessa interazione utente. */
export async function gestisciRegistrazione(
  richiesta: Request,
  servizio: ServizioAuthHttp,
): Promise<Response> {
  const input = registrazioneSchema.safeParse(await leggiCorpoJson(richiesta));
  if (!input.success) {
    return rispostaValidazione(input.error);
  }

  const risultato = await servizio.registraConSessione(
    input.data.email,
    input.data.password,
  );
  if (!risultato.ok) {
    return rispostaErrore(
      risultato.errore.codice === "email_gia_registrata" ? 409 : 400,
      {
        codice: risultato.errore.codice,
        messaggio: risultato.errore.messaggio,
        campo: risultato.errore.campo,
        vincolo: risultato.errore.vincolo,
      },
    );
  }

  return rispostaSessione(risultato.valore.cookie, risultato.valore.utente);
}

export async function gestisciAccesso(
  richiesta: Request,
  servizio: ServizioAuthHttp,
): Promise<Response> {
  const input = accessoSchema.safeParse(await leggiCorpoJson(richiesta));
  if (!input.success) {
    return rispostaValidazione(input.error);
  }

  const risultato = await servizio.accedi(
    input.data.email,
    input.data.password,
    indirizzoIpRichiesta(richiesta),
  );
  if (!risultato.ok) {
    return rispostaErrore(401, {
      codice: risultato.errore.codice,
      messaggio: risultato.errore.messaggio,
      campo: null,
      vincolo: null,
    });
  }

  return rispostaSessione(risultato.valore.cookie, risultato.valore.utente);
}

export async function gestisciUscita(
  richiesta: Request,
  servizio: ServizioAuthHttp,
): Promise<Response> {
  const tokenSessione = leggiCookie(richiesta.headers.get("cookie"), "sid");
  if (tokenSessione !== null) {
    await servizio.esci(tokenSessione);
  }

  const risposta = new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
  risposta.headers.set(
    "set-cookie",
    serializzaCookie({
      name: "sid",
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    }),
  );
  return risposta;
}
