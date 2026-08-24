// Punto di ingresso del pacchetto di dominio.
//
// Regola architetturale (design.md, sezione "Struttura del monorepo"):
// questo pacchetto non importa `db`, `adapters`, `fetch`, `Date` o
// `Math.random`. Il tempo e la casualita' entrano come parametri espliciti.
// Ogni sottocartella corrisponde a un componente del design:
//   - stato-asta:   derivaStato, registra, annulla (Requisiti 6, 7, 8)
//   - snapshot:     Normalizzatore_Dati, Serializzatore_Dati (Requisito 4)
//   - valutazione:  Motore_Valutazione, Indice_Convenienza (Requisiti 6, 13)
//   - avvisi:       Motore_Avvisi (Requisito 9)
//   - esportazione: esporta / importa (Requisito 10)
//
// I moduli concreti sono implementati nelle attivita' successive del piano
// (2. Contratti condivisi, 3-7. Nucleo di dominio).

export * from "./avvisi/predicati.js";
export * from "./avvisi/valuta-avvisi.js";
export * from "./esportazione/esporta-importa.js";
export * from "./snapshot/normalizzatore.js";
export * from "./snapshot/serializzatore.js";
export * from "./stato-asta/deriva-stato.js";
export * from "./stato-asta/disponibilita.js";
export * from "./stato-asta/registro.js";
export * from "./valutazione/indice-convenienza.js";
export * from "./valutazione/profili-strategia.js";
export * from "./valutazione/rendimento.js";
export * from "./valutazione/valuta.js";

export const DOMAIN_PACKAGE_NAME = "@asta/domain";
