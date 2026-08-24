import { z } from "zod";

export const EMAIL_LUNGHEZZA_MASSIMA = 254;
export const PASSWORD_LUNGHEZZA_MINIMA = 8;
export const PASSWORD_LUNGHEZZA_MASSIMA = 128;

const MESSAGGIO_EMAIL = "Il formato dell'indirizzo email non è valido.";
const MESSAGGIO_PASSWORD = "La password deve contenere da 8 a 128 caratteri.";

/** Validazione condivisa dal modulo e dall'endpoint di registrazione. */
export const emailRegistrazioneSchema = z
  .string()
  .max(EMAIL_LUNGHEZZA_MASSIMA, MESSAGGIO_EMAIL)
  .refine((email) => {
    const valore = email.trim();
    const separatore = valore.lastIndexOf("@");
    return separatore >= 0 && separatore < valore.length - 1;
  }, MESSAGGIO_EMAIL);

export const passwordRegistrazioneSchema = z
  .string()
  .min(PASSWORD_LUNGHEZZA_MINIMA, MESSAGGIO_PASSWORD)
  .max(PASSWORD_LUNGHEZZA_MASSIMA, MESSAGGIO_PASSWORD);

export const registrazioneSchema = z.object({
  email: emailRegistrazioneSchema,
  password: passwordRegistrazioneSchema,
});

/**
 * Il login richiede solo valori presenti: ogni credenziale errata viene poi
 * trattata dal servizio con lo stesso messaggio, senza distinguere l'account.
 */
export const accessoSchema = z.object({
  email: z
    .string()
    .min(1, "Inserisci l'indirizzo email.")
    .max(EMAIL_LUNGHEZZA_MASSIMA, "Credenziali non valide."),
  password: z
    .string()
    .min(1, "Inserisci la password.")
    .max(PASSWORD_LUNGHEZZA_MASSIMA, "Credenziali non valide."),
});

export type InputRegistrazione = z.infer<typeof registrazioneSchema>;
export type InputAccesso = z.infer<typeof accessoSchema>;
