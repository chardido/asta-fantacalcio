import type { FormErrors } from "@mantine/form";
import type { ZodType } from "zod";

/** Adatta uno schema condiviso al resolver richiesto da Mantine Form. */
export function creaValidatoreZod<T extends Record<string, unknown>>(
  schema: ZodType<T>,
): (valori: T) => FormErrors {
  return (valori) => {
    const esito = schema.safeParse(valori);
    if (esito.success) {
      return {};
    }

    const errori: FormErrors = {};
    for (const issue of esito.error.issues) {
      const campo = issue.path.map(String).join(".");
      if (campo.length > 0 && errori[campo] === undefined) {
        errori[campo] = issue.message;
      }
    }
    return errori;
  };
}
