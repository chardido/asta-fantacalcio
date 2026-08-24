import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type StatFantacalcio,
  type VoceRosa,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DatiDashboardSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import { tema } from "../../tema/tema";
import {
  SchermataRosaAsta,
  creaSezioniRosaAsta,
  formattaFantamediaMedia,
  type StatoRosaAsta,
} from "./rosa-asta";

const configurazione: ConfigurazioneAsta = {
  nome: "Asta test",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 1, D: 1, C: 1, A: 2 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

function voceRosa(
  id: string,
  reparto: "P" | "D" | "C" | "A",
  prezzoAcquisto: number,
  modifiche: Partial<VoceRosa> = {},
): VoceRosa {
  const macroReparto = {
    P: "POR",
    D: "DIF",
    C: "CEN",
    A: "ATT",
  } as const;

  return {
    voceRegistroId: `voce-${id}`,
    identificativoGiocatore: id,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: reparto,
    squadra: "Roma",
    repartoAssegnato: reparto,
    macroReparto: macroReparto[reparto],
    prezzoAcquisto,
    giocatoreAssenteDatiCorrenti: false,
    ...modifiche,
  };
}

function statistiche(fantamediaMilli: number | null): StatFantacalcio {
  return {
    mediaVotoMilli: 6200,
    fantamediaMilli,
    presenze: 30,
    gol: 8,
    assist: 4,
    ammonizioni: 2,
    espulsioni: 0,
    rigoriParati: 0,
    rigoriSbagliati: 0,
    autogol: 0,
    stagione: "2025-26",
  };
}

const rosa = [
  voceRosa("portiere", "P", 10),
  voceRosa("difensore", "D", 20),
  voceRosa("centrocampista", "C", 30),
  voceRosa("attaccante-1", "A", 40),
  voceRosa("attaccante-2", "A", 50),
] as const;

const stato: StatoRosaAsta = {
  budgetResiduo: 350,
  budgetRepartoResiduo: { POR: 30, DIF: 80, CEN: 130, ATT: 110 },
  slotResidui: { P: 0, D: 0, C: 0, A: 0 },
  slotResiduiTotali: 0,
  rosa,
};

const dati: DatiDashboardSnapshot = {
  snapshotId: "snapshot-1",
  hashContenuto: "hash",
  giocatori: [
    { id: "portiere", nome: "Portiere", squadra: "Roma", ruoli: ["P"], quotazione: 10, statFantacalcio: statistiche(6500) },
    { id: "difensore", nome: "Difensore", squadra: "Roma", ruoli: ["D"], quotazione: 10, statFantacalcio: statistiche(6250) },
    { id: "centrocampista", nome: "Centrocampista", squadra: "Roma", ruoli: ["C"], quotazione: 10, statFantacalcio: statistiche(null) },
    { id: "attaccante-1", nome: "Attaccante 1", squadra: "Roma", ruoli: ["A"], quotazione: 10, statFantacalcio: statistiche(7120) },
    { id: "attaccante-2", nome: "Attaccante 2", squadra: "Roma", ruoli: ["A"], quotazione: 10, statFantacalcio: statistiche(7130) },
  ],
};

// **Validates: Requirements 10.2, 10.3, 10.7**
describe("creaSezioniRosaAsta", () => {
  it("raggruppa per reparto e calcola conteggi, spesa e fantamedia arrotondata a due decimali", () => {
    const sezioni = creaSezioniRosaAsta(configurazione, stato, dati);
    const attaccanti = sezioni.find((sezione) => sezione.reparto === "A");

    expect(sezioni.map((sezione) => sezione.reparto)).toEqual(["P", "D", "C", "A"]);
    expect(attaccanti).toMatchObject({
      giocatoriAcquistati: 2,
      slotResidui: 0,
      budgetRepartoResiduo: 110,
      spesaReparto: 90,
      fantamediaMediaCentesimi: 713,
      fantamedieDisponibili: 2,
    });
    expect(formattaFantamediaMedia(713)).toBe("7,13");
  });

  it("non sostituisce con zero le fantamedie assenti", () => {
    const centrocampisti = creaSezioniRosaAsta(configurazione, stato, dati).find(
      (sezione) => sezione.reparto === "C",
    );

    expect(centrocampisti).toMatchObject({
      giocatoriAcquistati: 1,
      fantamediaMediaCentesimi: null,
      fantamedieDisponibili: 0,
    });
  });

  it("mantiene anche i reparti vuoti con valore medio non disponibile", () => {
    const statoParziale = {
      ...stato,
      rosa: stato.rosa.filter((giocatore) => giocatore.repartoAssegnato !== "D"),
      slotResidui: { ...stato.slotResidui, D: 1 },
      slotResiduiTotali: 1,
    };
    const difensori = creaSezioniRosaAsta(configurazione, statoParziale, dati).find(
      (sezione) => sezione.reparto === "D",
    );

    expect(difensori).toMatchObject({
      giocatori: [],
      giocatoriAcquistati: 0,
      slotResidui: 1,
      budgetRepartoResiduo: 80,
      spesaReparto: 0,
      fantamediaMediaCentesimi: null,
    });
  });
});

function renderizza(
  statoVista: StatoRosaAsta,
  datiVista: DatiDashboardSnapshot | null = dati,
): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <SchermataRosaAsta
        configurazione={configurazione}
        dati={datiVista}
        sessioneAstaId="00000000-0000-4000-8000-000000000001"
        stato={statoVista}
      />
    </MantineProvider>,
  );
}

// **Validates: Requirements 10.2, 10.3, 10.4, 10.7**
describe("SchermataRosaAsta", () => {
  it("mostra il riepilogo finale completo quando non restano slot", () => {
    const markup = renderizza(stato);

    expect(markup).toContain("Riepilogo finale");
    expect(markup).toContain("Sessione completata");
    expect(markup).toContain("Budget residuo complessivo: 350 crediti");
    expect(markup).toContain("Giocatore attaccante-1");
    expect(markup).toContain("40 crediti");
    expect(markup).toContain("Spesa reparto: 90 crediti");
    expect(markup).toContain("Fantamedia media: 7,13");
    expect(markup).toContain('href="/sessioni/00000000-0000-4000-8000-000000000001"');
  });

  it("mostra stato in corso, slot residui e indicatore non disponibile per un reparto vuoto", () => {
    const statoParziale: StatoRosaAsta = {
      ...stato,
      rosa: stato.rosa.filter((giocatore) => giocatore.repartoAssegnato !== "D"),
      slotResidui: { ...stato.slotResidui, D: 1 },
      slotResiduiTotali: 1,
    };
    const markup = renderizza(statoParziale);

    expect(markup).toContain("La tua rosa");
    expect(markup).toContain("Sessione in corso");
    expect(markup).toContain("1 slot residui");
    expect(markup).toContain("Budget reparto residuo: 80 crediti");
    expect(markup).toContain("Fantamedia media: <strong>dato non disponibile</strong> — nessun giocatore acquistato");
    expect(markup).not.toContain("Riepilogo finale");
  });

  it("mantiene rosa e prezzi visibili anche senza snapshot", () => {
    const markup = renderizza(stato, null);

    expect(markup).toContain("Giocatore portiere");
    expect(markup).toContain("10 crediti");
    expect(markup).toContain("nessuna fantamedia disponibile");
  });
});
