import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
} from "@asta/contracts";

/**
 * Limite dichiarato dalla sorgente per una finestra temporale.
 * Il worker usa questo contratto senza conoscere il provider concreto.
 */
export interface LimitiFrequenza {
  readonly richiesteMassime: number;
  readonly finestraMs: number;
}

/** Segnale standard usato dal worker per annullamento e timeout. */
export type SegnaleAnnullamento = AbortSignal;

/** Confine provider-independent per ogni sorgente del listone. */
export interface AdattatoreSorgenteListone {
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
  recupera(
    stagione: string,
    segnale: SegnaleAnnullamento,
  ): Promise<RispostaListoneGrezza>;
}

/** Confine provider-independent per ogni sorgente di statistiche. */
export interface AdattatoreSorgenteStatistiche {
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
  recupera(
    stagione: string,
    segnale: SegnaleAnnullamento,
  ): Promise<RispostaStatisticheGrezza>;
}
