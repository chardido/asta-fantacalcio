import { z } from "zod";

export const REPARTI_CLASSIC = ["P", "D", "C", "A"] as const;
export const REPARTI_MANTRA = [
  "Por",
  "Dc",
  "Dd",
  "Ds",
  "E",
  "M",
  "C",
  "W",
  "T",
  "A",
  "Pc",
] as const;
export const REPARTI = [
  "P",
  "D",
  "C",
  "A",
  "Por",
  "Dc",
  "Dd",
  "Ds",
  "E",
  "M",
  "W",
  "T",
  "Pc",
] as const;
export const MACRO_REPARTI = ["POR", "DIF", "CEN", "ATT"] as const;

export const repartoClassicSchema = z.enum(REPARTI_CLASSIC);
export const repartoMantraSchema = z.enum(REPARTI_MANTRA);
export const repartoSchema = z.enum(REPARTI);
export const macroRepartoSchema = z.enum(MACRO_REPARTI);

export type RepartoClassic = z.infer<typeof repartoClassicSchema>;
export type RepartoMantra = z.infer<typeof repartoMantraSchema>;
export type Reparto = z.infer<typeof repartoSchema>;
export type MacroReparto = z.infer<typeof macroRepartoSchema>;

/** Associazione esplicita richiesta per ricondurre ogni ruolo Mantra a un macro-reparto. */
export const MACRO_REPARTO_PER_RUOLO_MANTRA = {
  Por: "POR",
  Dc: "DIF",
  Dd: "DIF",
  Ds: "DIF",
  E: "CEN",
  M: "CEN",
  C: "CEN",
  W: "CEN",
  T: "CEN",
  A: "ATT",
  Pc: "ATT",
} as const satisfies Readonly<Record<RepartoMantra, MacroReparto>>;

export const TIPI_ASTA = [
  "chiamata",
  "random",
  "busta_chiusa",
  "asta_live_ordine_listone",
  "riparazione",
] as const;
export const MODALITA_GIOCO = ["classic", "mantra"] as const;

export const tipoAstaSchema = z.enum(TIPI_ASTA);
export const modalitaGiocoSchema = z.enum(MODALITA_GIOCO);

const slotClassicSchema = z.number().int().min(1).max(25);
const slotMantraSchema = z.number().int().min(0).max(25);

export const composizioneRosaClassicSchema = z
  .strictObject({
    P: slotClassicSchema,
    D: slotClassicSchema,
    C: slotClassicSchema,
    A: slotClassicSchema,
  })
  .refine(
    (composizione) =>
      Object.values(composizione).reduce((totale, slot) => totale + slot, 0) <=
      50,
    { message: "Il totale degli slot deve essere compreso tra 4 e 50" },
  );

export const composizioneRosaMantraSchema = z
  .strictObject({
    Por: slotMantraSchema.min(1),
    Dc: slotMantraSchema,
    Dd: slotMantraSchema,
    Ds: slotMantraSchema,
    E: slotMantraSchema,
    M: slotMantraSchema,
    C: slotMantraSchema,
    W: slotMantraSchema,
    T: slotMantraSchema,
    A: slotMantraSchema,
    Pc: slotMantraSchema,
  })
  .refine(
    (composizione) => {
      const totale = Object.values(composizione).reduce(
        (somma, slot) => somma + slot,
        0,
      );
      return totale >= 4 && totale <= 50;
    },
    { message: "Il totale degli slot deve essere compreso tra 4 e 50" },
  );

export const COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA = {
  P: 3,
  D: 8,
  C: 8,
  A: 6,
} as const;

export const QUOTE_REPARTO_PREDEFINITE = {
  POR: 8,
  DIF: 20,
  CEN: 32,
  ATT: 40,
} as const;

export const quoteRepartoSchema = z
  .strictObject({
    POR: z.number().int().min(0).max(100),
    DIF: z.number().int().min(0).max(100),
    CEN: z.number().int().min(0).max(100),
    ATT: z.number().int().min(0).max(100),
  })
  .superRefine((quote, contesto) => {
    const somma = Object.values(quote).reduce(
      (totale, percentuale) => totale + percentuale,
      0,
    );
    if (somma !== 100) {
      contesto.addIssue({
        code: "custom",
        message: `La somma delle quote deve essere 100; somma corrente: ${somma}`,
      });
    }
  });

export const PESI_VALUTAZIONE_PREDEFINITI = {
  quotazione: 30,
  budgetReparto: 25,
  budgetTotale: 15,
  slotResidui: 10,
  statistiche: 20,
  audacia: 20,
} as const;

const pesoValutazioneSchema = z.number().int().min(0).max(100);

export const pesiValutazioneSchema = z
  .strictObject({
    quotazione: pesoValutazioneSchema,
    budgetReparto: pesoValutazioneSchema,
    budgetTotale: pesoValutazioneSchema,
    slotResidui: pesoValutazioneSchema,
    statistiche: pesoValutazioneSchema,
    audacia: pesoValutazioneSchema,
  })
  .refine((pesi) => Object.values(pesi).some((peso) => peso > 0), {
    message: "Almeno un peso di valutazione deve essere maggiore di 0",
  });

const configurazioneAstaComuneSchema = {
  nome: z
    .string()
    .min(1)
    .max(60)
    .refine((nome) => nome.trim().length > 0, {
      message: "Il nome non può essere vuoto",
    }),
  tipoAsta: tipoAstaSchema,
  numeroPartecipanti: z.number().int().min(2).max(20),
  creditiIniziali: z.number().int().min(1).max(100_000),
  modificatoreDifesa: z.boolean().default(false),
  quoteReparto: quoteRepartoSchema.default(QUOTE_REPARTO_PREDEFINITE),
  pesiValutazione: pesiValutazioneSchema.default(
    PESI_VALUTAZIONE_PREDEFINITI,
  ),
};

/**
 * Configurazione completa della sessione, discriminata per impedire composizioni
 * Classic e Mantra incoerenti con la modalità scelta.
 */
export const configurazioneAstaSchema = z.discriminatedUnion("modalitaGioco", [
  z.strictObject({
    ...configurazioneAstaComuneSchema,
    modalitaGioco: z.literal("classic"),
    composizioneRosa: composizioneRosaClassicSchema,
  }),
  z.strictObject({
    ...configurazioneAstaComuneSchema,
    modalitaGioco: z.literal("mantra"),
    composizioneRosa: composizioneRosaMantraSchema,
  }),
]);

export type TipoAsta = z.infer<typeof tipoAstaSchema>;
export type ModalitaGioco = z.infer<typeof modalitaGiocoSchema>;
export type QuoteReparto = z.infer<typeof quoteRepartoSchema>;
export type PesiValutazione = z.infer<typeof pesiValutazioneSchema>;
export type ConfigurazioneAstaInput = z.input<typeof configurazioneAstaSchema>;
export type ConfigurazioneAsta = z.output<typeof configurazioneAstaSchema>;

const stringaNonVuotaSchema = z.string().min(1);
const conteggioStatisticoSchema = z.number().int().nonnegative().nullable();
const valoreStatisticoMilliSchema = z.number().int().nonnegative().nullable();
const prezzoSchema = z.number().int().positive();

/**
 * Le medie sono interi in millesimi (es. 6,83 diventa 6830).
 * `null` distingue una statistica non disponibile dal valore numerico zero.
 */
export const statFantacalcioSchema = z.strictObject({
  mediaVotoMilli: valoreStatisticoMilliSchema,
  fantamediaMilli: valoreStatisticoMilliSchema,
  presenze: conteggioStatisticoSchema,
  gol: conteggioStatisticoSchema,
  assist: conteggioStatisticoSchema,
  ammonizioni: conteggioStatisticoSchema,
  espulsioni: conteggioStatisticoSchema,
  rigoriParati: conteggioStatisticoSchema,
  rigoriSbagliati: conteggioStatisticoSchema,
  autogol: conteggioStatisticoSchema,
  stagione: stringaNonVuotaSchema,
});

const statTattichePortieriSchema = z.strictObject({
  macroReparto: z.literal("POR"),
  parate: conteggioStatisticoSchema,
  golSubiti: conteggioStatisticoSchema,
  cleanSheet: conteggioStatisticoSchema,
  rigoriParati: conteggioStatisticoSchema,
  stagione: stringaNonVuotaSchema,
});

const statTatticheDifensoriSchema = z.strictObject({
  macroReparto: z.literal("DIF"),
  cleanSheetSquadra: conteggioStatisticoSchema,
  duelliDifensiviVinti: conteggioStatisticoSchema,
  contrasti: conteggioStatisticoSchema,
  precisionePassaggiMilli: valoreStatisticoMilliSchema,
  stagione: stringaNonVuotaSchema,
});

const statTatticheCentrocampistiSchema = z.strictObject({
  macroReparto: z.literal("CEN"),
  assist: conteggioStatisticoSchema,
  passaggiChiave: conteggioStatisticoSchema,
  precisionePassaggiMilli: valoreStatisticoMilliSchema,
  tiri: conteggioStatisticoSchema,
  stagione: stringaNonVuotaSchema,
});

const statTatticheAttaccantiSchema = z.strictObject({
  macroReparto: z.literal("ATT"),
  gol: conteggioStatisticoSchema,
  tiri: conteggioStatisticoSchema,
  tiriNelloSpecchio: conteggioStatisticoSchema,
  golAttesiMilli: valoreStatisticoMilliSchema,
  stagione: stringaNonVuotaSchema,
});

/** Le statistiche tattiche sono discriminate per evitare dati di reparti non pertinenti. */
export const statTatticheSchema = z.discriminatedUnion("macroReparto", [
  statTattichePortieriSchema,
  statTatticheDifensoriSchema,
  statTatticheCentrocampistiSchema,
  statTatticheAttaccantiSchema,
]);

const voceRegistroBaseSchema = z.strictObject({
  id: stringaNonVuotaSchema,
  sessioneAstaId: stringaNonVuotaSchema,
  ordinale: z.number().int().positive(),
  identificativoGiocatore: stringaNonVuotaSchema,
  nomeGiocatore: z.string().min(1).max(100),
  ruolo: repartoSchema,
  squadra: stringaNonVuotaSchema,
  repartoAssegnato: repartoSchema,
  macroReparto: macroRepartoSchema,
  annullataIl: z.iso.datetime({ offset: true }).nullable(),
  chiaveIdempotenza: z.uuid(),
  giocatoreAssenteDatiCorrenti: z.boolean(),
});

const voceRegistroUtenteSchema = voceRegistroBaseSchema.extend({
  assegnatarioTipo: z.literal("utente"),
  avversarioId: z.null(),
  prezzoAcquisto: prezzoSchema,
});

const voceRegistroAvversarioSchema = voceRegistroBaseSchema.extend({
  assegnatarioTipo: z.literal("avversario"),
  avversarioId: stringaNonVuotaSchema.nullable(),
  prezzoAcquisto: prezzoSchema.nullable(),
});

/**
 * Il prezzo e l'avversario sono facoltativi solo per le annotazioni degli acquisti altrui.
 */
export const voceRegistroSchema = z.discriminatedUnion("assegnatarioTipo", [
  voceRegistroUtenteSchema,
  voceRegistroAvversarioSchema,
]);

/** Proiezione derivata dalle sole voci attive del registro attribuite all'utente. */
export const voceRosaSchema = z.strictObject({
  voceRegistroId: stringaNonVuotaSchema,
  identificativoGiocatore: stringaNonVuotaSchema,
  nomeGiocatore: z.string().min(1).max(100),
  ruolo: repartoSchema,
  squadra: stringaNonVuotaSchema,
  repartoAssegnato: repartoSchema,
  macroReparto: macroRepartoSchema,
  prezzoAcquisto: prezzoSchema,
  giocatoreAssenteDatiCorrenti: z.boolean(),
});

export type StatFantacalcio = z.infer<typeof statFantacalcioSchema>;
export type StatTattiche = z.infer<typeof statTatticheSchema>;
export type VoceRegistro = z.infer<typeof voceRegistroSchema>;
export type VoceRosa = z.infer<typeof voceRosaSchema>;
