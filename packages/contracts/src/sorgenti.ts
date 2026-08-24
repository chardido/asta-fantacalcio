import { z } from "zod";

/**
 * Vocabolario canonico prodotto dagli adattatori del listone.
 * I valori restano grezzi: intervalli, ruoli e duplicati sono verificati dal
 * Normalizzatore_Dati, non dallo specifico adattatore.
 */
export const voceListoneGrezzaSchema = z.strictObject({
  identificativoGiocatore: z.string(),
  nome: z.string(),
  squadra: z.string(),
  ruoloClassic: z.string().nullable(),
  ruoliMantra: z.array(z.string()),
  quotazione: z.number(),
});

export const rispostaListoneGrezzaSchema = z.strictObject({
  nomeSorgente: z.string().min(1),
  stagione: z.string().min(1),
  giocatori: z.array(voceListoneGrezzaSchema),
});

const valoreStatisticoGrezzoSchema = z.number().int().nonnegative().optional();

/**
 * Le statistiche assenti sono omesse dall'adattatore. Il normalizzatore le
 * convertirà in `null`, distinguendole dai conteggi realmente uguali a zero.
 */
export const statFantacalcioGrezzeSchema = z.strictObject({
  mediaVotoMilli: valoreStatisticoGrezzoSchema,
  fantamediaMilli: valoreStatisticoGrezzoSchema,
  presenze: valoreStatisticoGrezzoSchema,
  gol: valoreStatisticoGrezzoSchema,
  assist: valoreStatisticoGrezzoSchema,
  ammonizioni: valoreStatisticoGrezzoSchema,
  espulsioni: valoreStatisticoGrezzoSchema,
  rigoriParati: valoreStatisticoGrezzoSchema,
  rigoriSbagliati: valoreStatisticoGrezzoSchema,
  autogol: valoreStatisticoGrezzoSchema,
});

/** Statistiche tattiche provider-independent disponibili al normalizzatore. */
export const statTatticheGrezzeSchema = z.strictObject({
  parate: valoreStatisticoGrezzoSchema,
  golSubiti: valoreStatisticoGrezzoSchema,
  cleanSheet: valoreStatisticoGrezzoSchema,
  cleanSheetSquadra: valoreStatisticoGrezzoSchema,
  duelliDifensiviVinti: valoreStatisticoGrezzoSchema,
  contrasti: valoreStatisticoGrezzoSchema,
  precisionePassaggiMilli: valoreStatisticoGrezzoSchema,
  passaggiChiave: valoreStatisticoGrezzoSchema,
  tiri: valoreStatisticoGrezzoSchema,
  tiriNelloSpecchio: valoreStatisticoGrezzoSchema,
  golAttesiMilli: valoreStatisticoGrezzoSchema,
});

export const voceStatisticheGrezzaSchema = z.strictObject({
  identificativoSorgente: z.string().min(1).optional(),
  nome: z.string(),
  squadra: z.string(),
  statFantacalcio: statFantacalcioGrezzeSchema,
  statTattiche: statTatticheGrezzeSchema,
});

export const rispostaStatisticheGrezzaSchema = z.strictObject({
  nomeSorgente: z.string().min(1),
  stagione: z.string().min(1),
  giocatori: z.array(voceStatisticheGrezzaSchema),
});

export type VoceListoneGrezza = z.infer<typeof voceListoneGrezzaSchema>;
export type RispostaListoneGrezza = z.infer<
  typeof rispostaListoneGrezzaSchema
>;
export type StatFantacalcioGrezze = z.infer<
  typeof statFantacalcioGrezzeSchema
>;
export type StatTatticheGrezze = z.infer<typeof statTatticheGrezzeSchema>;
export type VoceStatisticheGrezza = z.infer<
  typeof voceStatisticheGrezzaSchema
>;
export type RispostaStatisticheGrezza = z.infer<
  typeof rispostaStatisticheGrezzaSchema
>;
