import {
  composizioneRosaClassicSchema,
  composizioneRosaMantraSchema,
  pesiValutazioneSchema,
  quoteRepartoSchema,
  statFantacalcioSchema,
  statTatticheSchema,
  type ConfigurazioneAsta,
  type ModalitaGioco,
  type PesiValutazione,
  type QuoteReparto,
  type StatFantacalcio,
  type StatTattiche,
} from "@asta/contracts";

type SchemaJson<T> = {
  parse(valore: unknown): T;
};

export type ComposizioneRosa = ConfigurazioneAsta["composizioneRosa"];

function validaJson<T>(schema: SchemaJson<T>, valore: unknown): T {
  return schema.parse(valore);
}

/** Valida il JSONB proveniente dal database prima di esporlo all'applicazione. */
export function leggiComposizioneRosaJson(
  modalitaGioco: ModalitaGioco,
  valore: unknown,
): ComposizioneRosa {
  return modalitaGioco === "classic"
    ? validaJson(composizioneRosaClassicSchema, valore)
    : validaJson(composizioneRosaMantraSchema, valore);
}

/** Valida il valore applicativo prima di affidarlo a Prisma per la scrittura JSONB. */
export function scriviComposizioneRosaJson(
  modalitaGioco: ModalitaGioco,
  valore: ComposizioneRosa,
): ComposizioneRosa {
  return modalitaGioco === "classic"
    ? validaJson(composizioneRosaClassicSchema, valore)
    : validaJson(composizioneRosaMantraSchema, valore);
}

export function leggiQuoteRepartoJson(valore: unknown): QuoteReparto {
  return validaJson(quoteRepartoSchema, valore);
}

export function scriviQuoteRepartoJson(
  valore: QuoteReparto,
): QuoteReparto {
  return validaJson(quoteRepartoSchema, valore);
}

export function leggiPesiValutazioneJson(
  valore: unknown,
): PesiValutazione {
  return validaJson(pesiValutazioneSchema, valore);
}

export function scriviPesiValutazioneJson(
  valore: PesiValutazione,
): PesiValutazione {
  return validaJson(pesiValutazioneSchema, valore);
}

export function leggiStatFantacalcioJson(valore: unknown): StatFantacalcio {
  return validaJson(statFantacalcioSchema, valore);
}

export function scriviStatFantacalcioJson(
  valore: StatFantacalcio,
): StatFantacalcio {
  return validaJson(statFantacalcioSchema, valore);
}

export function leggiStatTatticheJson(valore: unknown): StatTattiche {
  return validaJson(statTatticheSchema, valore);
}

export function scriviStatTatticheJson(
  valore: StatTattiche,
): StatTattiche {
  return validaJson(statTatticheSchema, valore);
}
