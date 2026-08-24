export interface DettagliErroreAutenticazione {
  readonly codice: string;
  readonly messaggio: string;
  readonly campo: string | null;
  readonly vincolo: string | null;
}

export class ErroreAutenticazioneClient extends Error {
  override readonly name = "ErroreAutenticazioneClient";

  constructor(readonly dettagli: DettagliErroreAutenticazione) {
    super(dettagli.messaggio);
  }
}

function sonoDettagliErrore(valore: unknown): valore is DettagliErroreAutenticazione {
  return (
    typeof valore === "object" &&
    valore !== null &&
    "codice" in valore &&
    typeof valore.codice === "string" &&
    "messaggio" in valore &&
    typeof valore.messaggio === "string"
  );
}

/** Invia credenziali senza mai restituire o conservare il token di sessione. */
export async function inviaCredenziali(
  percorso: "/api/autenticazione/accesso" | "/api/autenticazione/registrazione",
  credenziali: Readonly<{ email: string; password: string }>,
): Promise<void> {
  const risposta = await fetch(percorso, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credenziali),
  });

  if (risposta.ok) {
    return;
  }

  let corpo: unknown;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  if (sonoDettagliErrore(corpo)) {
    throw new ErroreAutenticazioneClient({
      codice: corpo.codice,
      messaggio: corpo.messaggio,
      campo: corpo.campo ?? null,
      vincolo: corpo.vincolo ?? null,
    });
  }

  throw new ErroreAutenticazioneClient({
    codice: "servizio_non_disponibile",
    messaggio: "Il servizio non è disponibile. Riprova.",
    campo: null,
    vincolo: null,
  });
}

export async function inviaUscita(): Promise<void> {
  const risposta = await fetch("/api/autenticazione/uscita", {
    method: "POST",
    credentials: "same-origin",
  });
  if (!risposta.ok) {
    throw new ErroreAutenticazioneClient({
      codice: "uscita_non_completata",
      messaggio: "Non è stato possibile completare l'uscita. Riprova.",
      campo: null,
      vincolo: null,
    });
  }
}
