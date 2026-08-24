import { Client, type Notification } from "pg";

import type {
  SottoscrizioneEventi,
  TrasportoEventiSessione,
} from "./canale-eventi";

function nomeCanaleEventiSessione(sessioneAstaId: string): string {
  return `sessione_${sessioneAstaId}`;
}

function decodificaOrdinale(payload: string): number | null {
  try {
    const valore: unknown = JSON.parse(payload);
    if (
      typeof valore === "object" &&
      valore !== null &&
      "ordinale" in valore &&
      Number.isInteger(valore.ordinale) &&
      (valore.ordinale as number) >= 1
    ) {
      return valore.ordinale as number;
    }
  } catch {
    // Payload estranei o malformati vengono ignorati.
  }
  return null;
}

function identificatoreSql(nome: string): string {
  return `"${nome.replaceAll('"', '""')}"`;
}

/** Una connessione PostgreSQL dedicata per ogni stream, necessaria a LISTEN. */
export class TrasportoEventiPostgres implements TrasportoEventiSessione {
  constructor(private readonly connectionString: string) {
    if (connectionString.trim().length === 0) {
      throw new Error("DATABASE_URL è richiesta per il canale eventi.");
    }
  }

  async sottoscrivi(
    sessioneAstaId: string,
    ricevi: (ordinale: number) => void,
    errore: (causa: Error) => void,
  ): Promise<SottoscrizioneEventi> {
    const canale = nomeCanaleEventiSessione(sessioneAstaId);
    const client = new Client({ connectionString: this.connectionString });
    let chiusa = false;

    const gestisciNotifica = (notifica: Notification): void => {
      if (notifica.channel !== canale || notifica.payload === undefined) return;
      const ordinale = decodificaOrdinale(notifica.payload);
      if (ordinale !== null) ricevi(ordinale);
    };
    const gestisciErrore = (causa: Error): void => {
      if (!chiusa) errore(causa);
    };

    client.on("notification", gestisciNotifica);
    client.on("error", gestisciErrore);
    await client.connect();
    await client.query(`LISTEN ${identificatoreSql(canale)}`);

    return {
      chiudi: async () => {
        if (chiusa) return;
        chiusa = true;
        client.off("notification", gestisciNotifica);
        client.off("error", gestisciErrore);
        try {
          await client.query(`UNLISTEN ${identificatoreSql(canale)}`);
        } finally {
          await client.end();
        }
      },
    };
  }
}
