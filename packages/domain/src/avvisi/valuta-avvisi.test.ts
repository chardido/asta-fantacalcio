import type { MacroReparto, VoceRosa } from "@asta/contracts";
import { describe, expect, it } from "vitest";

import {
  valutaAvvisi,
  type IngressoAvvisi,
} from "./valuta-avvisi.js";

function giocatoreRosa(
  id: string,
  macroReparto: MacroReparto,
  squadra: string,
  prezzoAcquisto = 10,
): VoceRosa {
  const repartoAssegnato =
    macroReparto === "POR"
      ? "P"
      : macroReparto === "DIF"
        ? "D"
        : macroReparto === "CEN"
          ? "C"
          : "A";

  return {
    voceRegistroId: `voce-${id}`,
    identificativoGiocatore: `giocatore-${id}`,
    nomeGiocatore: `Giocatore ${id}`,
    ruolo: repartoAssegnato,
    squadra,
    repartoAssegnato,
    macroReparto,
    prezzoAcquisto,
    giocatoreAssenteDatiCorrenti: false,
  };
}

type IngressoAvvisiDisponibile = IngressoAvvisi & {
  readonly giocatoreDisponibile: true;
  readonly prezzoMassimoConsigliato: number;
};

function ingressoSenzaCondizioni(): IngressoAvvisiDisponibile {
  return {
    avvisiInformativiAttivi: true,
    giocatoreDisponibile: true,
    reparto: "D",
    macroReparto: "DIF",
    squadra: "Inter",
    quotazione: 10,
    creditiIniziali: 500,
    slotResiduiReparto: 1,
    budgetRepartoResiduo: 20,
    budgetResiduo: 100,
    riservaMinima: 5,
    modificatoreDifesa: false,
    rosa: [],
    prezzoMassimoPersonale: null,
    prezzoMassimoConsigliato: 20,
  };
}

describe("valutaAvvisi", () => {
  it("restituisce un insieme vuoto senza errore quando nessuna condizione è soddisfatta", () => {
    expect(valutaAvvisi(ingressoSenzaCondizioni())).toEqual([]);
  });

  it("ordina per livello decrescente e criterio crescente, applicando il limite dopo l'ordinamento", () => {
    const ingresso: IngressoAvvisi = {
      ...ingressoSenzaCondizioni(),
      reparto: "P",
      macroReparto: "POR",
      quotazione: 50,
      slotResiduiReparto: 0,
      budgetRepartoResiduo: 10,
      budgetResiduo: 40,
      riservaMinima: 20,
      rosa: [
        giocatoreRosa("1", "POR", "Inter", 25),
        giocatoreRosa("2", "DIF", "Inter"),
        giocatoreRosa("3", "CEN", "Inter"),
      ],
      prezzoMassimoPersonale: 30,
      prezzoMassimoConsigliato: 20,
    };

    const avvisi = valutaAvvisi(ingresso);

    expect(avvisi.map(({ criterio }) => criterio)).toEqual([
      2, 6, 3, 4, 5, 7, 11.6,
    ]);
    expect(avvisi.map(({ livello }) => livello)).toEqual([
      "critico",
      "critico",
      "attenzione",
      "attenzione",
      "attenzione",
      "informativo",
      "informativo",
    ]);
    expect(avvisi).toHaveLength(7);
    expect(avvisi.length).toBeLessThanOrEqual(8);
  });

  it("filtra tutti gli avvisi informativi disattivati mantenendo attenzione e critici", () => {
    const ingresso: IngressoAvvisi = {
      ...ingressoSenzaCondizioni(),
      avvisiInformativiAttivi: false,
      quotazione: 50,
      slotResiduiReparto: 0,
      budgetRepartoResiduo: 10,
      budgetResiduo: 40,
      riservaMinima: 20,
      modificatoreDifesa: true,
      rosa: [
        giocatoreRosa("1", "DIF", "Inter"),
        giocatoreRosa("2", "DIF", "Inter"),
        giocatoreRosa("3", "CEN", "Inter"),
      ],
      prezzoMassimoPersonale: 30,
      prezzoMassimoConsigliato: 20,
    };

    const avvisi = valutaAvvisi(ingresso);

    expect(avvisi.map(({ criterio }) => criterio)).toEqual([2, 6, 4, 5]);
    expect(avvisi.every(({ livello }) => livello !== "informativo")).toBe(
      true,
    );
  });

  it("per un giocatore non disponibile omette solo i predicati dipendenti dal prezzo consigliato", () => {
    const ingresso: IngressoAvvisi = {
      ...ingressoSenzaCondizioni(),
      giocatoreDisponibile: false,
      prezzoMassimoConsigliato: null,
      quotazione: 50,
      slotResiduiReparto: 0,
      budgetRepartoResiduo: 10,
      budgetResiduo: 40,
      riservaMinima: 20,
      modificatoreDifesa: true,
      rosa: [
        giocatoreRosa("1", "DIF", "Inter"),
        giocatoreRosa("2", "DIF", "Inter"),
        giocatoreRosa("3", "CEN", "Inter"),
      ],
      prezzoMassimoPersonale: 100,
    };

    const avvisi = valutaAvvisi(ingresso);

    expect(avvisi.map(({ criterio }) => criterio)).toEqual([2, 6, 5, 7, 8]);
    expect(avvisi.some(({ criterio }) => criterio === 4)).toBe(false);
    expect(avvisi.some(({ criterio }) => criterio === 11.6)).toBe(false);
  });
});
