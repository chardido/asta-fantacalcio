# Copertura delle proprietà di correttezza P1–P17

La suite usa Vitest e fast-check. I test nel pacchetto `@asta/domain` ereditano da `packages/domain/vitest.setup.ts` il seed riproducibile `424242` e `100` iterazioni per proprietà. P16, eseguita nell'app web perché verifica la proiezione produttiva della dashboard, dichiara gli stessi valori direttamente nel test. Totale: **17 proprietà × 100 iterazioni = 1700 esecuzioni generate**, oltre alle verifiche interne ripetute da alcune proprietà (per esempio le 10 valutazioni di P6, P10 e P14).

| Proprietà | Requisiti | Test | Copertura verificata |
|---|---|---|---|
| P1 | 4.19 | `packages/domain/src/snapshot/snapshot.property.test.ts` — `P1 preserva ogni snapshot valido nel round-trip di serializzazione` | Round-trip `deserializza(serializza(snapshot))` su snapshot validi da 1 a 2000 giocatori e statistiche parziali. |
| P2 | 4.20 | `packages/domain/src/snapshot/snapshot.property.test.ts` — `P2 rinormalizza senza errori la rappresentazione persistente equivalente` | Equivalenza dopo normalizzazione, serializzazione e rinormalizzazione. |
| P3 | 7.9 | `packages/domain/src/stato-asta/stato-registro.property.test.ts` — `P3 conserva la somma fra prezzi della rosa e budget residuo` | Invariante prezzi utente più budget residuo su tutti gli stati raggiungibili. |
| P4 | 7.10 | `packages/domain/src/stato-asta/stato-registro.property.test.ts` — `P4 non supera mai gli slot previsti in alcun reparto` | Limite degli slot per ogni reparto Classic e Mantra in tutti gli stati raggiungibili. |
| P5 | 7.8 | `packages/domain/src/stato-asta/stato-registro.property.test.ts` — `P5 annullare una registrazione ripristina lo stato precedente` | Round-trip registrazione/annullamento su budget, budget di reparto, slot e rosa. |
| P6 | 6.11 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P6 produce lo stesso prezzo intero in 10 valutazioni consecutive` | Determinismo e integralità del prezzo su 10 valutazioni identiche. |
| P7 | 6.3, 6.4 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P7 mantiene il prezzo entro i tetti applicabili` | Prezzo minimo e tetti globale/reparto negli stati in cui sono applicabili. |
| P8 | 6.10 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P8 il profilo aggressivo non produce un prezzo inferiore al conservativo` | Relazione metamorfica fra profili a parità di input. |
| P9 | 6.12 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P9 una quotazione maggiore non riduce il prezzo a parità di statistiche` | Monotonia rispetto alla quotazione. |
| P10 | 9.10 | `packages/domain/src/avvisi/avvisi.property.test.ts` — `P10 mantiene insieme, livelli, valori e ordine in valutazioni ripetute` | Determinismo completo degli avvisi su 10 valutazioni. |
| P11 | 8.15 | `packages/domain/src/stato-asta/stato-registro.property.test.ts` — `P11 conserva la somma fra prezzi annotati e crediti residui stimati` | Invariante dei crediti avversario ignorando prezzi assenti, voci annullate e altri assegnatari. |
| P12 | 10.6 | `packages/domain/src/esportazione/esporta-importa.property.test.ts` — `P12 preserva rose complete e parziali nel round-trip importa(esporta(rosa))` | Round-trip di rose complete e parziali, registro cronologico, reparti, prezzi, budget e slot. |
| P13 | 4.9, 4.10, 4.11 | `packages/domain/src/snapshot/snapshot.property.test.ts` — `P13 rifiuta descrittivamente ogni risposta non valida senza snapshot parziale` | Tutte le classi di risposta non valida previste producono errore descrittivo senza valore parziale; la conservazione dello snapshot pubblicato è verificata anche da `apps/worker/src/pipeline-ingestione.integration.test.ts`. |
| P14 | 13.12 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P14 produce lo stesso indice intero in 10 valutazioni consecutive` | Determinismo e integralità dell'indice su 10 valutazioni identiche. |
| P15 | 13.13 | `packages/domain/src/valutazione/valutazione.property.test.ts` — `P15 mantiene sempre l'indice intero nell'intervallo da 0 a 100` | Intervallo e integralità dell'indice per input arbitrari. |
| P16 | 13.14 | `apps/web/src/app/sessioni/dashboard-asta.property.test.ts` — `P16 ordina ogni coppia consecutiva per indice di convenienza decrescente` | Ordinamento della funzione produttiva `creaSezioniDashboard` su insiemi arbitrari, verificato per ogni coppia consecutiva dopo il limite di 10 voci. |
| P17 | 3.14 | `packages/domain/src/avvisi/avvisi.property.test.ts` — `P17 ignora il tipo d'asta per prezzo, indice e avvisi su tutti i valori ammessi` | Invarianza metamorfica di prezzo, indice e avvisi su tutti e cinque i tipi d'asta ammessi. |

## Comando della suite P1–P17

```sh
pnpm --filter @asta/domain exec vitest run \
  src/snapshot/snapshot.property.test.ts \
  src/stato-asta/stato-registro.property.test.ts \
  src/valutazione/valutazione.property.test.ts \
  src/avvisi/avvisi.property.test.ts \
  src/esportazione/esporta-importa.property.test.ts
pnpm --filter @asta/web exec vitest run src/app/sessioni/dashboard-asta.property.test.ts
```
