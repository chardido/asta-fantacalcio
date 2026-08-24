import type {
  ConflittoOperazioneCoda,
  OperazioneCodaLocale,
  StatoCodaLocale,
} from "./coda-locale-store.js";

export const INTERVALLI_REINVIO_MS = [
  10_000,
  20_000,
  40_000,
  80_000,
  160_000,
] as const;
export const MASSIMO_TENTATIVI_REINVIO = INTERVALLI_REINVIO_MS.length;
export const MESSAGGIO_OPERAZIONE_NON_INVIATA =
  "L'operazione non è stata inviata dopo 5 tentativi. Resta conservata nella coda locale.";

export type StoreCodaPerReinvio = Pick<
  StatoCodaLocale,
  "aggiorna" | "rimuovi"
> & {
  readonly leggiOperazioni: () => readonly OperazioneCodaLocale[];
};

export type AttendiReinvio = (
  millisecondi: number,
  segnale?: AbortSignal,
) => Promise<void>;

export interface OpzioniReinvioCoda<TConferma> {
  readonly store: StoreCodaPerReinvio;
  readonly invia: (operazione: OperazioneCodaLocale) => Promise<TConferma>;
  readonly onConfermata?: (
    operazione: OperazioneCodaLocale,
    conferma: TConferma,
  ) => Promise<void> | void;
  readonly onNonInviata?: (
    operazione: OperazioneCodaLocale,
    errore: unknown,
  ) => Promise<void> | void;
  readonly estraiConflitto?: (
    errore: unknown,
  ) => ConflittoOperazioneCoda | null;
  readonly onConflitto?: (
    operazione: OperazioneCodaLocale,
    conflitto: ConflittoOperazioneCoda,
  ) => Promise<void> | void;
  readonly attendi?: AttendiReinvio;
  readonly segnale?: AbortSignal;
}

function erroreAnnullamento(): Error {
  const errore = new Error("Reinvio annullato.");
  errore.name = "AbortError";
  return errore;
}

/** Attesa annullabile usata fra i tentativi di reinvio. */
export function attendiIntervalloReinvio(
  millisecondi: number,
  segnale?: AbortSignal,
): Promise<void> {
  if (segnale?.aborted === true) {
    return Promise.reject(erroreAnnullamento());
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      segnale?.removeEventListener("abort", annulla);
      resolve();
    }, millisecondi);
    const annulla = () => {
      clearTimeout(timer);
      reject(erroreAnnullamento());
    };
    segnale?.addEventListener("abort", annulla, { once: true });
  });
}

function reinvioAnnullato(segnale?: AbortSignal): boolean {
  return segnale?.aborted ?? false;
}

function daReinviare(
  operazione: OperazioneCodaLocale,
): boolean {
  return (
    (operazione.stato === "in_attesa" || operazione.stato === "in_invio") &&
    operazione.tentativi < MASSIMO_TENTATIVI_REINVIO
  );
}

/**
 * Reinvio sequenziale e idempotente delle operazioni accodate. I tentativi sono
 * persistiti prima della chiamata e una conferma aggiorna l'interfaccia prima
 * della rimozione da IndexedDB.
 */
export async function reinviaCodaLocale<TConferma>({
  store,
  invia,
  onConfermata,
  onNonInviata,
  estraiConflitto,
  onConflitto,
  attendi = attendiIntervalloReinvio,
  segnale,
}: OpzioniReinvioCoda<TConferma>): Promise<void> {
  while (!reinvioAnnullato(segnale)) {
    const operazione = store.leggiOperazioni().find(daReinviare);
    if (operazione === undefined) return;

    const prossimoTentativo = operazione.tentativi + 1;
    const intervallo = INTERVALLI_REINVIO_MS[operazione.tentativi];
    if (intervallo === undefined) return;

    try {
      await attendi(intervallo, segnale);
    } catch (errore: unknown) {
      if (reinvioAnnullato(segnale) || (errore instanceof Error && errore.name === "AbortError")) {
        return;
      }
      throw errore;
    }
    if (reinvioAnnullato(segnale)) return;

    await store.aggiorna(operazione.chiaveIdempotenza, {
      tentativi: prossimoTentativo,
      stato: "in_invio",
    });

    try {
      const operazioneAggiornata =
        store
          .leggiOperazioni()
          .find(
            (corrente) =>
              corrente.chiaveIdempotenza === operazione.chiaveIdempotenza,
          ) ?? { ...operazione, tentativi: prossimoTentativo, stato: "in_invio" as const };
      const conferma = await invia(operazioneAggiornata);
      await onConfermata?.(operazioneAggiornata, conferma);
      await store.rimuovi(operazione.chiaveIdempotenza);
    } catch (errore: unknown) {
      const conflitto = estraiConflitto?.(errore) ?? null;
      if (conflitto !== null) {
        await store.aggiorna(operazione.chiaveIdempotenza, {
          conflitto,
          stato: "in_conflitto",
        });
        const operazioneInConflitto =
          store
            .leggiOperazioni()
            .find(
              (corrente) =>
                corrente.chiaveIdempotenza === operazione.chiaveIdempotenza,
            ) ?? {
              ...operazione,
              conflitto,
              tentativi: prossimoTentativo,
              stato: "in_conflitto" as const,
            };
        await onConflitto?.(operazioneInConflitto, conflitto);
        continue;
      }

      if (prossimoTentativo >= MASSIMO_TENTATIVI_REINVIO) {
        await store.aggiorna(operazione.chiaveIdempotenza, {
          stato: "non_inviata",
        });
        const operazioneNonInviata =
          store
            .leggiOperazioni()
            .find(
              (corrente) =>
                corrente.chiaveIdempotenza === operazione.chiaveIdempotenza,
            ) ?? { ...operazione, tentativi: prossimoTentativo, stato: "non_inviata" as const };
        await onNonInviata?.(operazioneNonInviata, errore);
      } else {
        await store.aggiorna(operazione.chiaveIdempotenza, {
          stato: "in_attesa",
        });
      }
    }
  }
}
