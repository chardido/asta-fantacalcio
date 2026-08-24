import type {
  RepartoClassic,
  RepartoMantra,
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
  StatFantacalcioGrezze,
  StatTatticheGrezze,
  VoceListoneGrezza,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  normalizzaDati,
  type MotivoErroreValidazione,
  type SnapshotDati,
} from "./normalizzatore.js";
import {
  deserializza,
  type RappresentazionePersistente,
  serializza,
  snapshotEquivalenti,
} from "./serializzatore.js";

const STAGIONE_LISTONE = "2026/2027";
const STAGIONE_STATISTICHE = "2025/2026";
const NOME_SORGENTE_LISTONE = "Listone property";
const NOME_SORGENTE_STATISTICHE = "Statistiche property";

const testoBreveArbitrary = fc.stringMatching(/^[A-Za-z0-9]{1,20}$/);
const valoreStatisticoArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 0, max: 100_000 }),
);

const statFantacalcioGrezzeArbitrary: fc.Arbitrary<StatFantacalcioGrezze> =
  fc.record({
    mediaVotoMilli: valoreStatisticoArbitrary,
    fantamediaMilli: valoreStatisticoArbitrary,
    presenze: valoreStatisticoArbitrary,
    gol: valoreStatisticoArbitrary,
    assist: valoreStatisticoArbitrary,
    ammonizioni: valoreStatisticoArbitrary,
    espulsioni: valoreStatisticoArbitrary,
    rigoriParati: valoreStatisticoArbitrary,
    rigoriSbagliati: valoreStatisticoArbitrary,
    autogol: valoreStatisticoArbitrary,
  });

const statTatticheGrezzeArbitrary: fc.Arbitrary<StatTatticheGrezze> = fc.record({
  parate: valoreStatisticoArbitrary,
  golSubiti: valoreStatisticoArbitrary,
  cleanSheet: valoreStatisticoArbitrary,
  cleanSheetSquadra: valoreStatisticoArbitrary,
  duelliDifensiviVinti: valoreStatisticoArbitrary,
  contrasti: valoreStatisticoArbitrary,
  precisionePassaggiMilli: valoreStatisticoArbitrary,
  passaggiChiave: valoreStatisticoArbitrary,
  tiri: valoreStatisticoArbitrary,
  tiriNelloSpecchio: valoreStatisticoArbitrary,
  golAttesiMilli: valoreStatisticoArbitrary,
});

interface ProfiloRuoli {
  readonly ruoloClassic: RepartoClassic | null;
  readonly ruoliMantra: readonly RepartoMantra[];
}

const profiloRuoliArbitrary: fc.Arbitrary<ProfiloRuoli> = fc.constantFrom(
  { ruoloClassic: "P", ruoliMantra: ["Por"] },
  { ruoloClassic: "D", ruoliMantra: ["Dc", "Dd", "Ds"] },
  { ruoloClassic: "C", ruoliMantra: ["E", "M", "C", "W", "T"] },
  { ruoloClassic: "A", ruoliMantra: ["A", "Pc"] },
  { ruoloClassic: null, ruoliMantra: ["Por", "Dc", "C", "Pc"] },
);

interface SemeGiocatore {
  readonly nome: string;
  readonly squadra: string;
  readonly quotazione: number;
  readonly profiloRuoli: ProfiloRuoli;
  readonly statFantacalcio: StatFantacalcioGrezze;
  readonly statTattiche: StatTatticheGrezze;
}

const semeGiocatoreArbitrary: fc.Arbitrary<SemeGiocatore> = fc.record({
  nome: testoBreveArbitrary,
  squadra: testoBreveArbitrary,
  quotazione: fc.integer({ min: 1, max: 999 }),
  profiloRuoli: profiloRuoliArbitrary,
  statFantacalcio: statFantacalcioGrezzeArbitrary,
  statTattiche: statTatticheGrezzeArbitrary,
});

interface RisposteValide {
  readonly listone: RispostaListoneGrezza;
  readonly statistiche: RispostaStatisticheGrezza;
}

function creaRisposteValide(
  semi: readonly SemeGiocatore[],
): RisposteValide {
  const giocatoriListone: VoceListoneGrezza[] = [];
  const giocatoriStatistiche: RispostaStatisticheGrezza["giocatori"][number][] =
    [];

  for (const [indice, seme] of semi.entries()) {
    const suffissoUnivoco = `${indice}-${seme.nome}`;
    const nome = `Giocatore ${suffissoUnivoco}`;
    const squadra = `Squadra ${indice}-${seme.squadra}`;

    giocatoriListone.push({
      identificativoGiocatore: `giocatore-${indice}`,
      nome,
      squadra,
      ruoloClassic: seme.profiloRuoli.ruoloClassic,
      ruoliMantra: [...seme.profiloRuoli.ruoliMantra],
      quotazione: seme.quotazione,
    });
    giocatoriStatistiche.push({
      nome,
      squadra,
      statFantacalcio: seme.statFantacalcio,
      statTattiche: seme.statTattiche,
    });
  }

  return {
    listone: {
      nomeSorgente: NOME_SORGENTE_LISTONE,
      stagione: STAGIONE_LISTONE,
      giocatori: giocatoriListone,
    },
    statistiche: {
      nomeSorgente: NOME_SORGENTE_STATISTICHE,
      stagione: STAGIONE_STATISTICHE,
      giocatori: giocatoriStatistiche,
    },
  };
}

function risposteValideArbitrary(
  maxGiocatori: number,
): fc.Arbitrary<RisposteValide> {
  return fc
    .array(semeGiocatoreArbitrary, { minLength: 1, maxLength: maxGiocatori })
    .map(creaRisposteValide);
}

function normalizzaConSuccesso(risposte: RisposteValide): SnapshotDati {
  const risultato = normalizzaDati(risposte.listone, risposte.statistiche);
  if (!risultato.ok) {
    throw new Error(
      `Il generatore ha prodotto dati non validi: ${risultato.errore.campo}/${risultato.errore.motivo}`,
    );
  }
  return risultato.valore;
}

function aggiungiSeDisponibile(
  destinazione: Record<string, number>,
  campo: string,
  valore: number | null,
): void {
  if (valore !== null) destinazione[campo] = valore;
}

function rappresentazioneInRisposte(
  rappresentazione: RappresentazionePersistente,
): RisposteValide {
  return {
    listone: {
      nomeSorgente: rappresentazione.nomeSorgenteListone,
      stagione: rappresentazione.stagioneListone,
      giocatori: rappresentazione.giocatori.map((giocatore) => ({
        identificativoGiocatore: giocatore.identificativoGiocatore,
        nome: giocatore.nome,
        squadra: giocatore.squadra,
        ruoloClassic: giocatore.ruoloClassic,
        ruoliMantra: [...giocatore.ruoliMantra],
        quotazione: giocatore.quotazione,
      })),
    },
    statistiche: {
      nomeSorgente: rappresentazione.nomeSorgenteStatistiche,
      stagione: rappresentazione.stagioneStatistiche,
      giocatori: rappresentazione.giocatori.map((giocatore) => {
        const statFantacalcio: Record<string, number> = {};
        const statTattiche: Record<string, number> = {};

        for (const campo of [
          "mediaVotoMilli",
          "fantamediaMilli",
          "presenze",
          "gol",
          "assist",
          "ammonizioni",
          "espulsioni",
          "rigoriParati",
          "rigoriSbagliati",
          "autogol",
        ] as const) {
          aggiungiSeDisponibile(
            statFantacalcio,
            campo,
            giocatore.statFantacalcio[campo],
          );
        }

        for (const statistiche of giocatore.statTattiche) {
          switch (statistiche.macroReparto) {
            case "POR":
              aggiungiSeDisponibile(statTattiche, "parate", statistiche.parate);
              aggiungiSeDisponibile(
                statTattiche,
                "golSubiti",
                statistiche.golSubiti,
              );
              aggiungiSeDisponibile(
                statTattiche,
                "cleanSheet",
                statistiche.cleanSheet,
              );
              break;
            case "DIF":
              aggiungiSeDisponibile(
                statTattiche,
                "cleanSheetSquadra",
                statistiche.cleanSheetSquadra,
              );
              aggiungiSeDisponibile(
                statTattiche,
                "duelliDifensiviVinti",
                statistiche.duelliDifensiviVinti,
              );
              aggiungiSeDisponibile(
                statTattiche,
                "contrasti",
                statistiche.contrasti,
              );
              aggiungiSeDisponibile(
                statTattiche,
                "precisionePassaggiMilli",
                statistiche.precisionePassaggiMilli,
              );
              break;
            case "CEN":
              aggiungiSeDisponibile(
                statTattiche,
                "passaggiChiave",
                statistiche.passaggiChiave,
              );
              aggiungiSeDisponibile(statTattiche, "tiri", statistiche.tiri);
              aggiungiSeDisponibile(
                statTattiche,
                "precisionePassaggiMilli",
                statistiche.precisionePassaggiMilli,
              );
              break;
            case "ATT":
              aggiungiSeDisponibile(statTattiche, "tiri", statistiche.tiri);
              aggiungiSeDisponibile(
                statTattiche,
                "tiriNelloSpecchio",
                statistiche.tiriNelloSpecchio,
              );
              aggiungiSeDisponibile(
                statTattiche,
                "golAttesiMilli",
                statistiche.golAttesiMilli,
              );
              break;
          }
        }

        return {
          nome: giocatore.nome,
          squadra: giocatore.squadra,
          statFantacalcio: statFantacalcio as StatFantacalcioGrezze,
          statTattiche: statTattiche as StatTatticheGrezze,
        };
      }),
    },
  };
}

interface CasoNonValido {
  readonly descrizione: string;
  readonly listone: RispostaListoneGrezza;
  readonly campo: string;
  readonly identificativoGiocatore: string | null;
  readonly motivo: MotivoErroreValidazione;
}

function voceNonVerificata(
  base: VoceListoneGrezza,
  modifiche: Record<string, unknown>,
): VoceListoneGrezza {
  return { ...base, ...modifiche } as VoceListoneGrezza;
}

function creaCasoNonValido(
  base: RisposteValide,
  descrizione: string,
  giocatori: readonly VoceListoneGrezza[],
  campo: string,
  identificativoGiocatore: string | null,
  motivo: MotivoErroreValidazione,
): CasoNonValido {
  return {
    descrizione,
    listone: { ...base.listone, giocatori: [...giocatori] },
    campo,
    identificativoGiocatore,
    motivo,
  };
}

function creaCasiNonValidi(
  base: RisposteValide,
  quotazioneNonIntera: number,
  quotazioneFuoriIntervallo: number,
): readonly CasoNonValido[] {
  const voce = base.listone.giocatori[0];
  if (voce === undefined) throw new Error("Fixture property priva di giocatori");
  const id = voce.identificativoGiocatore;

  const casoSingolo = (
    descrizione: string,
    modifiche: Record<string, unknown>,
    campo: string,
    identificativo: string | null,
    motivo: MotivoErroreValidazione,
  ): CasoNonValido =>
    creaCasoNonValido(
      base,
      descrizione,
      [voceNonVerificata(voce, modifiche)],
      campo,
      identificativo,
      motivo,
    );

  return [
    casoSingolo(
      "identificativo assente",
      { identificativoGiocatore: undefined },
      "identificativoGiocatore",
      null,
      "campo_obbligatorio_assente",
    ),
    casoSingolo(
      "nome assente",
      { nome: undefined },
      "nome",
      id,
      "campo_obbligatorio_assente",
    ),
    casoSingolo(
      "squadra assente",
      { squadra: undefined },
      "squadra",
      id,
      "campo_obbligatorio_assente",
    ),
    casoSingolo(
      "quotazione assente",
      { quotazione: undefined },
      "quotazione",
      id,
      "campo_obbligatorio_assente",
    ),
    casoSingolo(
      "ruolo assente",
      { ruoloClassic: null, ruoliMantra: [] },
      "ruolo",
      id,
      "campo_obbligatorio_assente",
    ),
    casoSingolo(
      "quotazione non intera",
      { quotazione: quotazioneNonIntera },
      "quotazione",
      id,
      "quotazione_non_intera",
    ),
    casoSingolo(
      "quotazione fuori intervallo",
      { quotazione: quotazioneFuoriIntervallo },
      "quotazione",
      id,
      "quotazione_fuori_intervallo",
    ),
    casoSingolo(
      "nome oltre 100 caratteri",
      { nome: "x".repeat(101) },
      "nome",
      id,
      "nome_troppo_lungo",
    ),
    casoSingolo(
      "ruolo classic non ammesso",
      { ruoloClassic: "X" },
      "ruoloClassic",
      id,
      "ruolo_non_ammesso",
    ),
    casoSingolo(
      "ruolo mantra non ammesso",
      { ruoloClassic: null, ruoliMantra: ["X"] },
      "ruoliMantra[0]",
      id,
      "ruolo_non_ammesso",
    ),
    creaCasoNonValido(
      base,
      "identificativo duplicato",
      [voce, { ...voce, nome: `${voce.nome} duplicato` }],
      "identificativoGiocatore",
      id,
      "identificativo_duplicato",
    ),
  ];
}

describe("proprietà di normalizzazione e serializzazione", () => {
  // **Validates: Requirements 4.19**
  it("P1 preserva ogni snapshot valido nel round-trip di serializzazione", () => {
    fc.assert(
      fc.property(risposteValideArbitrary(2_000), (risposte) => {
        const originale = normalizzaConSuccesso(risposte);
        const ricostruito = deserializza(serializza(originale));

        expect(originale.giocatori.length).toBeGreaterThanOrEqual(1);
        expect(originale.giocatori.length).toBeLessThanOrEqual(2_000);
        expect(snapshotEquivalenti(ricostruito, originale)).toBe(true);
      }),
    );
  });

  // **Validates: Requirements 4.20**
  it("P2 rinormalizza senza errori la rappresentazione persistente equivalente", () => {
    fc.assert(
      fc.property(risposteValideArbitrary(100), (risposte) => {
        const primaNormalizzazione = normalizzaConSuccesso(risposte);
        const rispostePersistite = rappresentazioneInRisposte(
          serializza(primaNormalizzazione),
        );
        const secondaNormalizzazione = normalizzaDati(
          rispostePersistite.listone,
          rispostePersistite.statistiche,
        );

        expect(secondaNormalizzazione.ok).toBe(true);
        if (!secondaNormalizzazione.ok) return;
        expect(
          snapshotEquivalenti(
            secondaNormalizzazione.valore,
            primaNormalizzazione,
          ),
        ).toBe(true);
      }),
    );
  });

  // **Validates: Requirements 4.9, 4.10, 4.11**
  it("P13 rifiuta descrittivamente ogni risposta non valida senza snapshot parziale", () => {
    fc.assert(
      fc.property(
        risposteValideArbitrary(1),
        fc.integer({ min: 1, max: 998 }).map((valore) => valore + 0.5),
        fc.oneof(
          fc.integer({ min: -1_000, max: 0 }),
          fc.integer({ min: 1_000, max: 2_000 }),
        ),
        (base, quotazioneNonIntera, quotazioneFuoriIntervallo) => {
          for (const caso of creaCasiNonValidi(
            base,
            quotazioneNonIntera,
            quotazioneFuoriIntervallo,
          )) {
            const risultato = normalizzaDati(
              caso.listone,
              base.statistiche,
            );

            expect(risultato, caso.descrizione).toMatchObject({
              ok: false,
              errore: {
                codice: "risposta_non_valida",
                campo: caso.campo,
                identificativoGiocatore: caso.identificativoGiocatore,
                motivo: caso.motivo,
              },
            });
            expect("valore" in risultato, caso.descrizione).toBe(false);
            if (!risultato.ok) {
              expect(risultato.errore.vincolo.length, caso.descrizione).toBeGreaterThan(
                0,
              );
            }
          }
        },
      ),
    );
  });
});
