import { z } from "zod";

import {
  configurazioneAstaSchema,
  macroRepartoSchema,
  repartoSchema,
} from "./domain.js";

export const SCHEMA_FILE_ESPORTAZIONE =
  "asta-fantacalcio-companion/export/v1" as const;

export const voceRosaEsportataSchema = z.strictObject({
  identificativoGiocatore: z.string().min(1),
  nome: z.string().min(1).max(100),
  reparto: repartoSchema,
  prezzoAcquisto: z.number().int().positive(),
});

const voceRegistroEsportataBaseSchema = z.strictObject({
  ordinale: z.number().int().positive(),
  identificativoGiocatore: z.string().min(1),
  nomeGiocatore: z.string().min(1).max(100),
  ruolo: repartoSchema,
  squadra: z.string().min(1),
  repartoAssegnato: repartoSchema,
  macroReparto: macroRepartoSchema,
  annullataIl: z.iso.datetime({ offset: true }).nullable(),
  giocatoreAssenteDatiCorrenti: z.boolean(),
});

const voceRegistroUtenteEsportataSchema =
  voceRegistroEsportataBaseSchema.extend({
    assegnatarioTipo: z.literal("utente"),
    avversarioNome: z.null(),
    prezzoAcquisto: z.number().int().positive(),
  });

const voceRegistroAvversarioEsportataSchema =
  voceRegistroEsportataBaseSchema.extend({
    assegnatarioTipo: z.literal("avversario"),
    avversarioNome: z.string().min(1).max(30).nullable(),
    prezzoAcquisto: z.number().int().positive().nullable(),
  });

export const voceRegistroEsportataSchema = z.discriminatedUnion(
  "assegnatarioTipo",
  [
    voceRegistroUtenteEsportataSchema,
    voceRegistroAvversarioEsportataSchema,
  ],
);

const registroCronologicoSchema = z
  .array(voceRegistroEsportataSchema)
  .superRefine((registro, contesto) => {
    for (let indice = 1; indice < registro.length; indice += 1) {
      const precedente = registro[indice - 1];
      const corrente = registro[indice];
      if (
        precedente !== undefined &&
        corrente !== undefined &&
        corrente.ordinale <= precedente.ordinale
      ) {
        contesto.addIssue({
          code: "custom",
          path: [indice, "ordinale"],
          message:
            "Le voci del registro devono essere in ordine cronologico per ordinale crescente",
        });
      }
    }
  });

const corpoFileEsportazioneShape = {
  schema: z.literal(SCHEMA_FILE_ESPORTAZIONE),
  esportatoIl: z.iso.datetime({ offset: true }),
  configurazione: configurazioneAstaSchema,
  rosa: z.array(voceRosaEsportataSchema),
  registro: registroCronologicoSchema,
};

/** Corpo canonicalizzabile sul quale il dominio calcolerà la firma. */
export const corpoFileEsportazioneSchema = z.strictObject(
  corpoFileEsportazioneShape,
);

/** Formato JSON portabile e versionato usato da esportazione e importazione. */
export const fileEsportazioneSchema = z.strictObject({
  ...corpoFileEsportazioneShape,
  firma: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "La firma deve essere uno SHA-256 esadecimale"),
});

export type VoceRosaEsportata = z.infer<typeof voceRosaEsportataSchema>;
export type VoceRegistroEsportata = z.infer<
  typeof voceRegistroEsportataSchema
>;
export type CorpoFileEsportazione = z.infer<
  typeof corpoFileEsportazioneSchema
>;
export type FileEsportazione = z.infer<typeof fileEsportazioneSchema>;
