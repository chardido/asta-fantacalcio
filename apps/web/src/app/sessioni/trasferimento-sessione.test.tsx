import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { tema } from "../../tema/tema";
import {
  ErroreTrasferimentoSessione,
  inviaImportazione,
  nomeFileEsportazione,
  richiediEsportazione,
  VistaTrasferimentoSessione,
} from "./trasferimento-sessione";

const SESSIONE = "00000000-0000-4000-8000-000000000011";

function renderizza(fileSelezionato: File | null = null): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <VistaTrasferimentoSessione
        esportazioneInCorso={false}
        feedback={null}
        fileSelezionato={fileSelezionato}
        importazioneInCorso={false}
        onEsporta={vi.fn()}
        onFileSelezionato={vi.fn()}
        onImporta={vi.fn()}
        sessioneAstaId={SESSIONE}
      />
    </MantineProvider>,
  );
}

// **Validates: Requirements 10.5, 10.8, 10.9**
describe("interfaccia di esportazione e importazione", () => {
  it("mostra le azioni di esportazione, selezione JSON e importazione", () => {
    const markup = renderizza();

    expect(markup).toContain("Esportazione e importazione");
    expect(markup).toContain("Esporta sessione");
    expect(markup).toContain("Seleziona file JSON");
    expect(markup).toContain("Importa file selezionato");
    expect(markup).toContain("Nessun file selezionato");
    expect(markup).toContain(`href="/sessioni/${SESSIONE}"`);
  });

  it("rende visibile il nome del file selezionato", () => {
    const file = { name: "backup-asta.json" } as File;

    expect(renderizza(file)).toContain("File selezionato: backup-asta.json");
  });

  it("usa il nome dell'allegato e scarica il contenuto JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"schema":"asta-fantacalcio-companion/export/v1"}', {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="asta-prova.json"',
        },
      }),
    );

    const file = await richiediEsportazione(SESSIONE, fetchMock);

    expect(file.nome).toBe("asta-prova.json");
    await expect(file.contenuto.text()).resolves.toContain("export/v1");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessioni/${SESSIONE}/esportazione`,
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("mostra nel rifiuto il messaggio, il campo e il vincolo restituiti dal server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          codice: "configurazione_divergente",
          messaggio: "Importazione rifiutata.",
          dettagli: {
            campo: "configurazione.creditiIniziali",
            vincolo: "La configurazione deve coincidere.",
          },
        },
        { status: 400 },
      ),
    );

    await expect(
      inviaImportazione(
        SESSIONE,
        { text: async () => "{}" },
        fetchMock,
      ),
    ).rejects.toEqual(
      new ErroreTrasferimentoSessione(
        "configurazione_divergente",
        "Importazione rifiutata. Campo: configurazione.creditiIniziali. Motivo: La configurazione deve coincidere.",
      ),
    );
  });

  it("invia integralmente il file selezionato e restituisce il numero di voci importate", async () => {
    const contenuto = '{"schema":"asta-fantacalcio-companion/export/v1"}';
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ numeroVociImportate: 3 }, { status: 200 }),
    );

    await expect(
      inviaImportazione(
        SESSIONE,
        { text: async () => contenuto },
        fetchMock,
      ),
    ).resolves.toEqual({ numeroVociImportate: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessioni/${SESSIONE}/importazione`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: contenuto,
      }),
    );
  });

  it("rifiuta localmente un file illeggibile senza inviare richieste", async () => {
    const fetchMock = vi.fn();

    await expect(
      inviaImportazione(
        SESSIONE,
        { text: async () => Promise.reject(new Error("lettura fallita")) },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      codice: "file_illeggibile",
      message: "Il file selezionato non è leggibile.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizza il nome dell'allegato e usa un ripiego quando manca", () => {
    expect(nomeFileEsportazione('attachment; filename="cartella/asta.json"', SESSIONE)).toBe(
      "cartella-asta.json",
    );
    expect(nomeFileEsportazione(null, SESSIONE)).toBe(`asta-${SESSIONE}.json`);
  });
});
