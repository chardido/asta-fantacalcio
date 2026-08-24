import {
  PESI_VALUTAZIONE_PREDEFINITI,
  QUOTE_REPARTO_PREDEFINITE,
  type ConfigurazioneAsta,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { tema } from "../../tema/tema";
import {
  SchermataConfigurazioneAsta,
  applicaProfiloLocale,
  validaValoriConfigurazione,
  type ValoriConfigurazioneForm,
} from "./configurazione-asta";

const configurazioneClassic: ConfigurazioneAsta = {
  nome: "Lega amici",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { ...QUOTE_REPARTO_PREDEFINITE },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

const configurazioneMantra: ConfigurazioneAsta = {
  ...configurazioneClassic,
  modalitaGioco: "mantra",
  composizioneRosa: {
    Por: 2,
    Dc: 2,
    Dd: 1,
    Ds: 1,
    E: 2,
    M: 2,
    C: 2,
    W: 1,
    T: 1,
    A: 2,
    Pc: 2,
  },
};

function renderizza(
  passoIniziale: number,
  configurazione: ConfigurazioneAsta = configurazioneClassic,
): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <SchermataConfigurazioneAsta
        configurazioneIniziale={configurazione}
        onSalva={vi.fn().mockResolvedValue(undefined)}
        passoIniziale={passoIniziale}
        stagioneListone="2026-27"
        statoFreschezza={[
          {
            nomeSorgente: "listone-quotazioni-ufficiali",
            ultimoSuccessoIl: "2026-08-01T05:00:00.000Z",
            ultimoTentativoIl: "2026-08-01T05:00:00.000Z",
            ultimoEsito: "successo",
          },
          {
            nomeSorgente: "api-football",
            ultimoSuccessoIl: null,
            ultimoTentativoIl: null,
            ultimoEsito: "mai_eseguito",
          },
        ]}
      />
    </MantineProvider>,
  );
}

function valoriValidi(): ValoriConfigurazioneForm {
  return {
    stagioneListone: "2026-27",
    nome: configurazioneClassic.nome,
    tipoAsta: configurazioneClassic.tipoAsta,
    modalitaGioco: "classic",
    numeroPartecipanti: configurazioneClassic.numeroPartecipanti,
    creditiIniziali: configurazioneClassic.creditiIniziali,
    modificatoreDifesa: configurazioneClassic.modificatoreDifesa,
    composizioneClassic: { P: 3, D: 8, C: 8, A: 6 },
    composizioneMantra: {
      Por: 1,
      Dc: 1,
      Dd: 0,
      Ds: 0,
      E: 0,
      M: 0,
      C: 1,
      W: 0,
      T: 0,
      A: 1,
      Pc: 0,
    },
    quoteReparto: { ...configurazioneClassic.quoteReparto },
    pesiValutazione: { ...configurazioneClassic.pesiValutazione },
  };
}

// **Validates: Requirements 3.1-3.10, 3.13, 3.15-3.22, 4.13**
describe("SchermataConfigurazioneAsta", () => {
  it("mostra il passo principale con vincoli, modalità e modificatore", () => {
    const markup = renderizza(0);

    expect(markup).toContain("Nome della sessione");
    expect(markup).toContain("Numero di partecipanti");
    expect(markup).toContain("Crediti iniziali per partecipante");
    expect(markup).toContain("Classic");
    expect(markup).toContain("Mantra");
    expect(markup).toContain("Modificatore di difesa");
    expect(markup).toContain("fini documentali");
  });

  it("presenta gli slot classic preesistenti e la mappa completa dei ruoli Mantra", () => {
    const classic = renderizza(1);
    const mantra = renderizza(1, configurazioneMantra);

    expect(classic).toContain("Portieri");
    expect(classic).toContain("Difensori");
    expect(classic).toContain("Totale: 25 slot");
    expect(mantra).toContain("Mappa ruoli Mantra");
    expect(mantra).toContain("Ruolo Por");
    expect(mantra).toContain("Ruolo Pc");
    expect(mantra).toContain("Macro-reparto");
  });

  it("mostra quote con somma verso cento e tutti i pesi con profili e ripristino", () => {
    const quote = renderizza(2);
    const strategia = renderizza(3);

    expect(quote).toContain("Somma quote: 100%");
    expect(quote).toContain("esattamente 100");
    expect(strategia).toContain("Profilo conservativo");
    expect(strategia).toContain("Profilo aggressivo");
    expect(strategia).toContain("Ripristina predefiniti");
    expect(strategia).toContain("Budget reparto");
    expect(strategia).toContain("Audacia");
  });

  it("mostra stato di freschezza, nomi sorgente e riepilogo prima del salvataggio", () => {
    const markup = renderizza(4);

    expect(markup).toContain("Stato di freschezza dei dati");
    expect(markup).toContain("listone-quotazioni-ufficiali");
    expect(markup).toContain("api-football");
    expect(markup).toContain("Acquisizione riuscita");
    expect(markup).toContain("Nessun tentativo registrato");
    expect(markup).toContain("Salva configurazione");
  });

  it("avvisa con sorgente e ultimo successo quando i dati superano sette giorni", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataConfigurazioneAsta
          configurazioneIniziale={configurazioneClassic}
          onSalva={vi.fn().mockResolvedValue(undefined)}
          passoIniziale={4}
          stagioneListone="2026-27"
          statoFreschezza={[{
            nomeSorgente: "api-football",
            ultimoSuccessoIl: "2020-01-01T05:00:00.000Z",
            ultimoTentativoIl: "2020-01-01T05:00:00.000Z",
            ultimoEsito: "successo",
          }]}
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Dati potenzialmente non aggiornati");
    expect(markup).toContain("L’ultima acquisizione riuscita della sorgente api-football risale al");
    expect(markup).toContain("I dati potrebbero non essere aggiornati");
  });
});

// **Validates: Requirements 3.5, 3.6, 3.9, 3.16, 3.17, 3.22**
describe("validazione del modulo configurazione", () => {
  it("costruisce una configurazione valida conservando i valori inseriti", () => {
    const valori = valoriValidi();
    const esito = validaValoriConfigurazione(valori);

    expect(esito).toEqual({
      ok: true,
      stagioneListone: "2026-27",
      configurazione: configurazioneClassic,
    });
  });

  it("rifiuta somma quote diversa da cento, pesi tutti nulli e portiere Mantra assente", () => {
    const quoteErrate = valoriValidi();
    quoteErrate.quoteReparto = { POR: 8, DIF: 20, CEN: 30, ATT: 40 };
    const pesiErrati = valoriValidi();
    pesiErrati.pesiValutazione = {
      quotazione: 0,
      budgetReparto: 0,
      budgetTotale: 0,
      slotResidui: 0,
      statistiche: 0,
      audacia: 0,
    };
    const mantraErrato = valoriValidi();
    mantraErrato.modalitaGioco = "mantra";
    mantraErrato.composizioneMantra.Por = 0;

    expect(validaValoriConfigurazione(quoteErrate)).toMatchObject({
      ok: false,
      errori: { quoteReparto: expect.stringContaining("somma corrente: 98") },
    });
    expect(validaValoriConfigurazione(pesiErrati)).toMatchObject({
      ok: false,
      errori: { pesiValutazione: expect.stringContaining("maggiore di 0") },
    });
    expect(validaValoriConfigurazione(mantraErrato)).toMatchObject({
      ok: false,
      errori: { "composizioneMantra.Por": expect.any(String) },
    });
  });

  it("applica profili che differiscono soltanto per audacia", () => {
    const conservativo = applicaProfiloLocale("conservativo");
    const aggressivo = applicaProfiloLocale("aggressivo");

    expect(conservativo.audacia).toBe(0);
    expect(aggressivo.audacia).toBe(80);
    expect({ ...conservativo, audacia: 20 }).toEqual(
      PESI_VALUTAZIONE_PREDEFINITI,
    );
    expect({ ...aggressivo, audacia: 20 }).toEqual(
      PESI_VALUTAZIONE_PREDEFINITI,
    );
  });
});
