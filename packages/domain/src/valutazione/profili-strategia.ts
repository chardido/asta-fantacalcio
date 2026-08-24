import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type PesiValutazione,
} from "@asta/contracts";

export { PESI_VALUTAZIONE_PREDEFINITI };

export const PROFILI_STRATEGIA = ["conservativo", "aggressivo"] as const;

export type ProfiloStrategia = (typeof PROFILI_STRATEGIA)[number];

export const PESI_PROFILO_CONSERVATIVO = Object.freeze({
  ...PESI_VALUTAZIONE_PREDEFINITI,
  audacia: 0,
}) satisfies PesiValutazione;

export const PESI_PROFILO_AGGRESSIVO = Object.freeze({
  ...PESI_VALUTAZIONE_PREDEFINITI,
  audacia: 80,
}) satisfies PesiValutazione;

export const PREIMPOSTAZIONI_PROFILO_STRATEGIA = Object.freeze({
  conservativo: PESI_PROFILO_CONSERVATIVO,
  aggressivo: PESI_PROFILO_AGGRESSIVO,
}) satisfies Readonly<Record<ProfiloStrategia, PesiValutazione>>;

function isProfiloStrategia(valore: string): valore is ProfiloStrategia {
  return (PROFILI_STRATEGIA as readonly string[]).includes(valore);
}

/**
 * Restituisce una copia modificabile dei pesi del profilo richiesto.
 * Le preimpostazioni restano immutate se l'utente personalizza la copia.
 */
export function applicaProfiloStrategia(
  profilo: ProfiloStrategia,
): PesiValutazione {
  if (!isProfiloStrategia(profilo)) {
    throw new RangeError(
      `Profilo strategia non valido: ${profilo}. Valori ammessi: ${PROFILI_STRATEGIA.join(", ")}`,
    );
  }

  return { ...PREIMPOSTAZIONI_PROFILO_STRATEGIA[profilo] };
}

/** Sostituisce eventuali pesi personalizzati con una nuova copia dei default. */
export function ripristinaPesiPredefiniti(): PesiValutazione {
  return { ...PESI_VALUTAZIONE_PREDEFINITI };
}
