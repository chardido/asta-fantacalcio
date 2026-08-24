const PREFISSO_CANALE_SESSIONE = "sessione_";
const IDENTIFICATIVO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Restituisce il canale PostgreSQL stabile associato a una sessione d'asta. */
export function nomeCanaleEventiSessione(sessioneAstaId: string): string {
  if (!IDENTIFICATIVO_UUID.test(sessioneAstaId)) {
    throw new RangeError("L'identificativo della sessione deve essere un UUID valido.");
  }
  return `${PREFISSO_CANALE_SESSIONE}${sessioneAstaId}`;
}

export interface PayloadMutazioneRegistro {
  readonly ordinale: number;
}

export function codificaPayloadMutazioneRegistro(ordinale: number): string {
  if (!Number.isInteger(ordinale) || ordinale < 1) {
    throw new RangeError("L'ordinale della notifica deve essere un intero positivo.");
  }
  return JSON.stringify({ ordinale } satisfies PayloadMutazioneRegistro);
}

export function decodificaPayloadMutazioneRegistro(
  payload: string,
): PayloadMutazioneRegistro | null {
  try {
    const valore: unknown = JSON.parse(payload);
    if (
      typeof valore === "object" &&
      valore !== null &&
      "ordinale" in valore &&
      Number.isInteger(valore.ordinale) &&
      (valore.ordinale as number) >= 1
    ) {
      return { ordinale: valore.ordinale as number };
    }
  } catch {
    // Le notifiche estranee o malformate vengono ignorate dal canale.
  }
  return null;
}
