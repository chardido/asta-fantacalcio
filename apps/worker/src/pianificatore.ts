import cron, { type ScheduledTask } from "node-cron";

import type {
  EsitoEsecuzioneIngestione,
  PipelineIngestione,
} from "./pipeline-ingestione.js";

export const ESPRESSIONE_CRON_INGESTIONE = "0 5 * * *";
export const FUSO_ORARIO_INGESTIONE = "Europe/Rome";

interface OpzioniPianificazione {
  readonly timezone: string;
  readonly noOverlap: boolean;
  readonly name: string;
}

type FunzionePianifica = (
  espressione: string,
  operazione: () => void | Promise<void>,
  opzioni: OpzioniPianificazione,
) => ScheduledTask;

export interface PianificatoreIngestioneAvviato {
  readonly attivita: ScheduledTask;
  /** Controllo immediato per coprire riavvii avvenuti dopo le 05:00. */
  readonly controlloIniziale: Promise<EsitoEsecuzioneIngestione>;
}

/**
 * Pianifica alle 05:00 italiane e verifica anche all'avvio se uno dei canali
 * non ha un tentativo nelle ultime 24 ore. Il lock persistente resta la
 * protezione autorevole fra processi distinti.
 */
export function avviaPianificatoreIngestione(
  pipeline: Pick<PipelineIngestione, "eseguiSeNecessario">,
  segnalaErrore: (errore: unknown) => void = console.error,
  pianifica: FunzionePianifica = cron.schedule.bind(cron),
): PianificatoreIngestioneAvviato {
  const eseguiProtetto = async (): Promise<EsitoEsecuzioneIngestione> => {
    try {
      return await pipeline.eseguiSeNecessario();
    } catch (errore) {
      segnalaErrore(errore);
      throw errore;
    }
  };

  const controlloIniziale = eseguiProtetto();
  // Il rifiuto e' gia' inoltrato al logger; il catch evita un rejection non gestito
  // quando il chiamante runtime non deve attendere il controllo iniziale.
  void controlloIniziale.catch(() => undefined);

  const attivita = pianifica(
    ESPRESSIONE_CRON_INGESTIONE,
    async () => {
      await eseguiProtetto();
    },
    {
      timezone: FUSO_ORARIO_INGESTIONE,
      noOverlap: true,
      name: "ingestione-giornaliera",
    },
  );
  return { attivita, controlloIniziale };
}
