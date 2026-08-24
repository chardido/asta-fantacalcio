import { accessoSchema, registrazioneSchema } from "@asta/contracts";
import { describe, expect, it, vi } from "vitest";

import { inviaCredenziali, inviaUscita } from "./autenticazione-client";
import { creaValidatoreZod } from "./validazione-zod";

// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
describe("client di autenticazione", () => {
  it("usa gli schemi condivisi come resolver e riporta il vincolo sul campo", () => {
    const valida = creaValidatoreZod(registrazioneSchema);
    expect(valida({ email: "utente@", password: "breve" })).toMatchObject({
      email: "Il formato dell'indirizzo email non è valido.",
      password: "La password deve contenere da 8 a 128 caratteri.",
    });
    expect(
      creaValidatoreZod(accessoSchema)({
        email: "utente@example.com",
        password: "password-valida",
      }),
    ).toEqual({});
  });

  it("mantiene i dettagli del rifiuto restituiti dal server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            codice: "email_gia_registrata",
            messaggio: "L'indirizzo email è già registrato.",
            campo: "email",
            vincolo: "email_normalizzata_univoca",
          },
          { status: 409 },
        ),
      ),
    );

    await expect(
      inviaCredenziali("/api/autenticazione/registrazione", {
        email: "utente@example.com",
        password: "password-valida",
      }),
    ).rejects.toMatchObject({
      dettagli: {
        codice: "email_gia_registrata",
        campo: "email",
        messaggio: "L'indirizzo email è già registrato.",
        vincolo: "email_normalizzata_univoca",
      },
    });
    vi.unstubAllGlobals();
  });

  it("invia il logout con le credenziali del browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(inviaUscita()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/autenticazione/uscita", {
      method: "POST",
      credentials: "same-origin",
    });
    vi.unstubAllGlobals();
  });
});
