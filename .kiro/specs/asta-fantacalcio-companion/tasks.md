# Piano di Implementazione

Il piano segue l'ordine imposto dal design: prima il nucleo di dominio puro, che è testabile per proprietà senza alcuna infrastruttura, poi la persistenza, poi lo strato API, poi l'interfaccia, infine il worker di ingestione e la modalità offline. Ogni attività produce codice compilabile e verificato; nessuna attività lascia il repository in stato non funzionante.

Assunzioni recepite dal design (sezione "Punti da confermare"): la contraddizione 6.3/6.4 è risolta a favore del 6.3 con `vincoloAttivo = 'budget_reparto_esaurito'`; i ruoli multipli Mantra sono gestiti con `reparto_assegnato` scelto dall'utente; l'`AdattatoreListoneFileLocale` è implementato come ripiego di esercizio.

---

## 1. Fondazioni del monorepo

- [x] 1.1 Inizializzare il monorepo pnpm + Turborepo con la struttura dei pacchetti
  - Creare `apps/web`, `apps/worker`, `packages/domain`, `packages/contracts`, `packages/db`, `packages/adapters` come da struttura del design
  - Configurare `pnpm-workspace.yaml`, `turbo.json` con pipeline `build`, `test`, `lint`, `typecheck`
  - TypeScript 5.x in modalità `strict` con `noUncheckedIndexedAccess`, config base condivisa estesa da ogni pacchetto
  - _Requirements: nessuno (fondazione)_

- [x] 1.2 Implementare le regole di lint architetturali che falliscono la build
  - `no-restricted-imports` su `packages/domain`: divieto di `db`, `adapters`, `fetch`, `Date`, `Math.random`
  - Divieto di file `.css` e `.module.css` fuori da `apps/web/src/tema`
  - Divieto di accesso diretto al repository delle sessioni d'asta dallo strato API
  - Test che verifica il fallimento della lint su violazioni deliberate di ciascuna regola
  - _Requirements: 4.5, 6.2, 12.1_

- [x] 1.3 Configurare Vitest con fast-check nel pacchetto di dominio
  - Runner per pacchetto, soglia di iterazioni fast-check e seme riproducibile fissato in configurazione
  - _Requirements: nessuno (fondazione)_

## 2. Contratti condivisi (`packages/contracts`)

- [x] 2.1 Definire gli schemi Zod dei tipi di dominio
  - `Reparto`, `MacroReparto`, `StatFantacalcio`, `StatTattiche`, `VoceRegistro`, `VoceRosa` con tutti i numerici dichiarati `.int()`
  - Rappresentazione in millesimi per media voto e fantamedia, nessun campo in virgola mobile
  - Mappa ruolo Mantra → `MacroReparto` come tabella esplicita ed esportata
  - _Requirements: 3.20, 4.21, 5.16_

- [x] 2.2 Definire lo schema Zod della `Configurazione_Asta` con tutti i vincoli dei requisiti
  - Nome 1–60 caratteri, `tipo_asta` fra i 5 valori, `modalita_gioco` fra i 2, partecipanti 2–20, crediti 1–100000
  - `composizione_rosa`: 1–25 slot per reparto in `classic`, 0–25 in `mantra` con almeno 1 portiere, totale 4–50
  - `quote_reparto`: interi 0–100 con somma esattamente 100
  - `pesi_valutazione`: sei interi 0–100 con almeno uno maggiore di 0
  - Test unitari sui confini di ogni intervallo, inclusi i valori appena fuori
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.16, 3.17, 3.22_

- [x] 2.3 Definire i DTO grezzi delle sorgenti e lo schema del file di esportazione
  - `RispostaListoneGrezza`, `RispostaStatisticheGrezza` come unico vocabolario esposto dagli adattatori
  - `FileEsportazione` con identificatore di schema `asta-fantacalcio-companion/export/v1` e campo firma
  - _Requirements: 4.4, 4.5, 10.5, 10.9_

## 3. Nucleo di dominio: stato dell'asta (`packages/domain/stato-asta`)

- [x] 3.1 Implementare `derivaStato` come unica funzione produttrice dello stato d'asta
  - Derivare `budgetResiduo`, `budgetRepartoResiduo`, `slotResidui`, `slotResiduiTotali`, `riservaMinima`, `rosa` da configurazione e registro
  - `riservaMinima = max(0, slotResiduiTotali - 1)`
  - Includere nel calcolo le voci contrassegnate come giocatore assente dallo snapshot corrente
  - Escludere le voci annullate; imputare il budget di reparto tramite `macro_reparto` derivato da `reparto_assegnato`
  - _Requirements: 3.11, 4.17, 7.14, 10.1_

- [x] 3.2 Implementare `registra` e `annulla` come trasformazioni pure del registro
  - Validazione dei prezzi: 1–`budgetResiduo` in registrazione, 1–(`budgetResiduo` + prezzo precedente) in modifica
  - Rifiuto per reparto completo, giocatore già assegnato, prezzo non intero o fuori intervallo, con errore che riporta vincolo e valore ammesso
  - Selezione del `reparto_assegnato` predefinito in Mantra: ruolo ammesso con più slot residui, a parità il primo in ordine di listone
  - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.11, 7.15_

- [x] 3.3 Implementare `creditiResiduiStimati` per gli avversari e il filtro `Giocatore_Disponibile`
  - Crediti residui stimati come crediti iniziali meno la somma dei prezzi annotati nelle voci non annullate dell'avversario
  - `Giocatore_Disponibile` come giocatori dello snapshot assenti da ogni voce non annullata
  - _Requirements: 8.5, 8.7, 8.13, 8.14_

- [x] 3.4 Scrivere i test di proprietà su stato e registro
  - P3: `somma(prezzi_utente) + budgetResiduo == creditiIniziali` su sequenze arbitrarie di registrazioni valide
  - P4: `giocatoriReparto <= slotReparto` per ogni reparto, in ogni stato raggiungibile
  - P5: `annulla(registra(stato, acquisto)) == stato` su budget, budget di reparto, slot e rosa
  - P11: `somma(prezzi_avversario) + creditiResiduiStimati == creditiIniziali` per gli avversari con almeno un prezzo annotato
  - _Requirements: 7.8, 7.9, 7.10, 8.15_

## 4. Nucleo di dominio: snapshot dei dati (`packages/domain/snapshot`)

- [x] 4.1 Implementare il `Normalizzatore_Dati`
  - Funzione pura da risposte grezze a `Risultato<SnapshotDati, ErroreValidazione>`
  - Rifiuto dell'intera risposta con campo e identificativo per: quotazione non intera o fuori da 1–999, ruolo estraneo agli insiemi `classic`/`mantra`, campo obbligatorio assente, nome oltre 100 caratteri, identificativo duplicato
  - Statistica assente convertita in `null` con contrassegno di non disponibilità, senza interrompere la costruzione
  - Calcolo di `nome_ricerca` in forma minuscola e priva di segni diacritici
  - _Requirements: 4.11, 4.12, 5.1_

- [x] 4.2 Implementare il `Serializzatore_Dati` e la relazione di equivalenza fra snapshot
  - `serializza` e `deserializza` inverse sulla rappresentazione persistente
  - Confronto di equivalenza indipendente dall'ordine, per identificativo, campo per campo, inclusi i contrassegni di non disponibilità
  - _Requirements: 4.18, 4.21_

- [x] 4.3 Scrivere i test di proprietà su normalizzazione e serializzazione
  - P1: `deserializza(serializza(snapshot)) == snapshot` su snapshot da 1 a 2000 giocatori con statistiche parzialmente assenti
  - P2: `normalizza(serializza(normalizza(risposta))) == normalizza(risposta)`
  - P13: ogni risposta non valida produce un rifiuto descrittivo e mai uno snapshot parziale
  - _Requirements: 4.9, 4.10, 4.11, 4.19, 4.20_

## 5. Nucleo di dominio: motore di valutazione (`packages/domain/valutazione`)

- [x] 5.1 Implementare le costanti di sistema e il punteggio di rendimento
  - Costanti `FM_BASE`, `FM_ESCURSIONE`, `MV_BASE`, `MV_ESCURSIONE`, `PRESENZE_RIF`, `K_FM`, `K_MV`, `K_PRES`, `MR_MIN`, `MR_MAX`, `BONUS_SCARSITA`, `PASSO_AUDACIA`
  - Punteggio `R` in 0–1000 dai soli termini disponibili; `R = 500` e `datiIncompleti` quando nessun termine è disponibile
  - Aritmetica intera su operandi non negativi, divisione troncata
  - _Requirements: 6.2, 6.13_

- [x] 5.2 Implementare `valuta` con i sei passi dell'algoritmo
  - Passo 0: `riserva`, `capGlobale`, `capReparto`
  - Passo 1: casi terminali reparto completo (prezzo 0) e budget minimo (prezzo 1), con precedenza assoluta del primo
  - Passi 2–5: rendimento, quattro ancore, valore base, moltiplicatori di rendimento e audacia
  - Passo 6: applicazione dei tetti con risoluzione `budget_reparto_esaurito` quando `capReparto < 1`
  - Firma che espone esclusivamente gli input ammessi dal criterio 6.2
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.9, 6.16_

- [x] 5.3 Implementare la spiegazione dei fattori
  - Per ciascuno dei cinque fattori: valore usato, ancora in crediti, peso e contributo
  - `audacia`, rettifica di arrotondamento e `vincoloAttivo` mostrati separatamente, con somma che riconcilia con il prezzo esposto
  - _Requirements: 6.5, 6.13_

- [x] 5.4 Implementare le preimpostazioni dei pesi e del `Profilo_Strategia`
  - Valori predefiniti di sistema e le due preimpostazioni, differenti solo nel peso `audacia`
  - Funzione di ripristino dei pesi predefiniti
  - _Requirements: 3.15, 3.18, 3.19, 6.9, 6.10_

- [x] 5.5 Implementare `indiceConvenienza`
  - Valore 0 quando gli slot residui del reparto sono 0
  - Componenti `c_marg`, `c_rend`, `c_acc` con le utilità `u_marg`, `u_rend`, `u_acc`, arrotondamento a metà per eccesso e clamp finale 0–100
  - Solo gli input ammessi dal criterio 13.4
  - _Requirements: 13.3, 13.4, 13.7, 13.13_

- [x] 5.6 Scrivere i test di proprietà del motore di valutazione
  - P6: 10 valutazioni consecutive a stato invariato producono lo stesso intero
  - P7: `1 <= prezzo <= capGlobale` quando slot e budget lo consentono, e `prezzo <= capReparto` quando `capReparto >= 1`
  - P8: prezzo con profilo `aggressivo` maggiore o uguale a quello con profilo `conservativo`
  - P9: a parità di statistiche, quotazione maggiore implica prezzo maggiore o uguale
  - P14, P15: determinismo e intervallo 0–100 dell'indice di convenienza
  - _Requirements: 6.10, 6.11, 6.12, 13.12, 13.13_

## 6. Nucleo di dominio: motore avvisi (`packages/domain/avvisi`)

- [x] 6.1 Implementare i predicati puri delle otto condizioni di avviso
  - Un predicato separato per ciascun criterio da 9.2 a 9.8, più la condizione del criterio 11.6
  - Ciascun predicato produce al massimo un avviso con `criterio`, `livello`, `valori` numerici e `chiaveMessaggio`
  - Nessun testo di messaggio nel dominio
  - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 11.6_

- [x] 6.2 Implementare `valutaAvvisi` con filtro, ordinamento e troncamento
  - Filtro degli avvisi `informativo` disattivati prima dell'ordinamento
  - Esclusione dei predicati dipendenti dal prezzo consigliato per i giocatori non disponibili
  - Ordinamento stabile per livello decrescente e numero di criterio crescente, troncamento a 8 dopo l'ordinamento
  - Insieme vuoto restituito senza errore quando nessuna condizione è soddisfatta
  - _Requirements: 9.1, 9.9, 9.11, 9.12, 9.13_

- [x] 6.3 Scrivere i test di proprietà del motore avvisi
  - P10: valutazioni ripetute a stato invariato producono insieme, livelli, valori e ordine identici
  - P17: variare il solo `tipo_asta` non modifica prezzo, indice né insieme di avvisi, verificato su tutti i valori ammessi
  - _Requirements: 3.14, 9.10_

## 7. Nucleo di dominio: esportazione (`packages/domain/esportazione`)

- [x] 7.1 Implementare `esporta` e `importa`
  - Esportazione di configurazione, rosa e registro in ordine cronologico per ordinale, con firma sha256 del corpo canonicalizzato
  - Importazione con rifiuto per file illeggibile, firma non corrispondente, schema ignoto o configurazione divergente, indicando il primo campo divergente
  - _Requirements: 10.5, 10.9_

- [x] 7.2 Scrivere il test di proprietà P12
  - `importa(esporta(rosa)) == rosa` su rose complete e parziali, con verifica di insieme giocatori, prezzi, imputazione ai reparti, budget, budget di reparto, slot e ordine cronologico
  - _Requirements: 10.6_

## 8. Persistenza (`packages/db`)

- [x] 8.1 Definire lo schema Prisma e la migrazione iniziale
  - Tabelle `utente`, `sessione_auth`, `sessione_asta`, `avversario`, `voce_registro_acquisti`, `voce_obiettivo`, `consultazione_scheda`, `snapshot_dati`, `giocatore_snapshot`, `pubblicazione_snapshot`, `stato_freschezza`, `esecuzione_ingestione`, `alias_giocatore`
  - `UNIQUE (utente_id, nome)` sulle sessioni d'asta, `UNIQUE (sessione_asta_id, identificativo_giocatore)` sugli obiettivi
  - `jsonb` per composizione, quote, pesi e statistiche, ciascuno validato dagli schemi Zod in lettura e scrittura
  - _Requirements: 2.1, 2.2, 11.1_

- [x] 8.2 Creare gli indici unici parziali che impongono le invarianti nel database
  - `ux_registro_giocatore_attivo` su `(sessione_asta_id, identificativo_giocatore)` con predicato `annullata_il IS NULL`
  - `ux_registro_idempotenza` su `(sessione_asta_id, chiave_idempotenza)`
  - Test di integrazione con Testcontainers: inserimenti concorrenti dello stesso giocatore, uno solo riesce; reinvio della stessa chiave di idempotenza non crea duplicati
  - _Requirements: 7.6, 8.6, 12.3_

- [x] 8.3 Implementare i repository con validazione Zod ai confini
  - Repository per utenti, sessioni auth, sessioni d'asta, registro, avversari, obiettivi, snapshot, freschezza
  - Ogni contenuto `jsonb` validato in ingresso e in uscita
  - _Requirements: 2.5, 3.23_

## 9. Autenticazione e controllo di accesso

- [x] 9.1 Implementare il `Servizio_Autenticazione`
  - `registra` con normalizzazione email (`trim` più minuscolo) come chiave unica ed email originale conservata per la visualizzazione
  - Validazione email: presenza di `@`, dominio non vuoto, lunghezza massima 254; validazione password 8–128 caratteri
  - Hash Argon2id con parametri 19 MiB / 2 iterazioni / parallelismo 1, mai restituito in alcuna risposta
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.9_

- [x] 9.2 Implementare accesso, uscita e ciclo di vita della sessione
  - Token opaco da 256 bit persistito solo come hash SHA-256, cookie `sid` `HttpOnly`, `Secure`, `SameSite=Lax`
  - Validità: non revocata, entro 24 ore dall'ultima attività ed entro 30 giorni dalla creazione
  - `ultima_attivita_il` aggiornato al massimo una volta ogni 60 secondi per sessione
  - Verifica Argon2id contro un hash fittizio quando l'email non esiste, per rendere indistinguibile la risposta
  - _Requirements: 1.5, 1.6, 1.7, 1.8_

- [x] 9.3 Implementare `caricaSessionePropria` come unico punto di controllo di accesso
  - 401 in assenza di sessione autenticata valida, 404 indistinguibile fra sessione non propria e inesistente
  - _Requirements: 1.10, 1.11, 2.12_

- [x] 9.4 Implementare la limitazione dei tentativi di accesso
  - 10 tentativi per indirizzo IP ogni 15 minuti, 5 per indirizzo email, con risposta identica a quella delle credenziali non valide
  - _Requirements: 1.6_

- [x] 9.5 Scrivere i test di integrazione di autenticazione e accesso
  - Registrazione con email duplicata a differente combinazione di maiuscole e spazi, indistinguibilità del criterio 1.6, scadenza per inattività e assoluta, guardia 401/404
  - _Requirements: 1.2, 1.6, 1.8, 1.10, 1.11_

## 10. Strato API e servizi applicativi

- [x] 10.1 Configurare tRPC con i contratti Zod e la mappatura degli errori
  - Contesto con risoluzione della sessione, middleware di autenticazione, formattatore di errori con `codice`, `campo`, `vincolo` e valori immessi
  - Mappatura verso 400, 401, 404, 409, 503 secondo la tabella di gestione degli errori del design
  - _Requirements: 2.11, 3.22, 6.14, 7.4, 8.4, 11.4_

- [x] 10.2 Implementare `ServizioSessioniAsta`
  - Creazione con validazione completa della configurazione, elenco ordinato per ultima modifica discendente con nome, data di creazione, tipo d'asta, budget residuo e numero di giocatori in rosa
  - Duplicazione con nome distinto, registro e rosa vuoti, budget pari ai crediti iniziali
  - Eliminazione irreversibile di sessione, rosa e registro, previa conferma esplicita gestita dall'interfaccia
  - Limite di 50 sessioni per utente applicato in transazione
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.10, 2.11_

- [x] 10.3 Implementare il ripristino di una sessione d'asta
  - Ripristino di configurazione, rosa, registro e budget con conteggi identici all'ultima modifica confermata
  - Interruzione dell'apertura con dati persistiti invariati in caso di dati incompleti o superamento della soglia temporale
  - _Requirements: 2.5, 2.6_

- [x] 10.4 Implementare `ServizioConfigurazione`
  - Modifica della configurazione su sessione con registro non vuoto, con ricalcolo di budget, budget di reparto e slot residui
  - Rifiuto della modifica che rende la rosa incompatibile, indicando per ogni reparto il numero di giocatori in esubero
  - Applicazione del profilo strategia, modifica dei pesi e ripristino dei predefiniti
  - Mappa ruolo Mantra → macro-reparto consultabile
  - _Requirements: 3.11, 3.12, 3.13, 3.17, 3.18, 3.19, 3.20, 3.21, 3.23_

- [x] 10.5 Implementare `ServizioRegistro`
  - Aggiunta, modifica e annullamento logico delle voci in transazione singola, con `ordinale` monotono per sessione
  - Copia di nome, ruolo e squadra al momento della registrazione; `reparto_assegnato` e `macro_reparto` persistiti
  - Traduzione della violazione dell'indice unico parziale in 409 con voce esistente e assegnatario
  - Risposta emessa solo dopo il commit; annullamento dell'operazione oltre i 5 secondi o in caso di esito negativo
  - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.11, 7.12, 7.15, 7.16_

- [x] 10.6 Implementare la gestione degli avversari e delle annotazioni
  - Nomi 1–30 caratteri, univoci nella sessione, fino a 19 avversari
  - Annotazione con nome assegnatario e prezzo facoltativi, prezzo entro 1–crediti residui stimati
  - Vista avversari con crediti spesi, crediti residui stimati e giocatori per reparto
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.13, 8.14_

- [x] 10.7 Implementare `ServizioObiettivi`
  - Inserimento univoco con limite di 200 voci verificato in transazione, prezzo massimo personale 1–crediti iniziali, priorità 1–99 con predefinito 99
  - Contrassegno di non raggiungibilità ed esclusione dai conteggi per reparto
  - Ordinamento per reparto o priorità con parità risolta alfabeticamente
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7, 11.8, 11.9_

- [x] 10.8 Implementare `Canale_Eventi` su SSE
  - Verifica di proprietà alla connessione, `LISTEN sessione_<id>`, evento iniziale con l'ordinale corrente
  - `NOTIFY` emesso nella stessa transazione della scrittura, payload con ordinale
  - Endpoint di delta `dopoOrdinale=N`, riconnessione con `Last-Event-ID`, keep-alive a 25 s, ripiego su polling a 5 s
  - Test di integrazione su due connessioni concorrenti entro la soglia di 2 secondi
  - _Requirements: 7.2, 7.13_

- [x] 10.9 Implementare gli endpoint di consultazione dello snapshot
  - Indice di ricerca compatto con `ETag` sull'`hash_contenuto` e `Cache-Control`
  - Scheda giocatore con statistiche fantacalcio, statistiche tattiche del macro-reparto e stagione per singola statistica
  - Registrazione della consultazione della scheda
  - Lettura esclusiva dello snapshot pubblicato, mai di uno snapshot in costruzione
  - _Requirements: 4.2, 4.6, 4.10, 5.8, 5.17, 5.18_

- [x] 10.10 Implementare gli endpoint di esportazione e importazione
  - Esportazione entro la soglia temporale, con messaggio di errore e stato invariato in caso di mancato completamento
  - Importazione in transazione singola con rifiuto descrittivo e sessione di destinazione invariata
  - _Requirements: 10.5, 10.8, 10.9_

## 11. Worker di ingestione (`apps/worker`, `packages/adapters`)

- [x] 11.1 Implementare le interfacce degli adattatori e l'`AdattatoreListoneFileLocale`
  - `AdattatoreSorgenteListone` e `AdattatoreSorgenteStatistiche` con `nome`, `limiti` e `recupera` con segnale di annullamento
  - Adattatore da file locale come ripiego di esercizio, non esposto all'interfaccia utente
  - _Requirements: 4.1, 4.4, 4.5_

- [x] 11.2 Implementare `AdattatoreListoneQuotazioniUfficiali`
  - Recupero del file pubblicato di quotazioni, interpretazione per `classic` e `mantra`, `User-Agent` identificativo, rispetto di `robots.txt`
  - Produzione esclusiva di `RispostaListoneGrezza`
  - _Requirements: 4.1, 4.4_

- [x] 11.3 Implementare `AdattatoreStatisticheApiFootball`
  - Acquisizione a lotti per squadra, chiave del provider da variabile d'ambiente del solo processo worker
  - Produzione esclusiva di `RispostaStatisticheGrezza`, statistiche non fornite lasciate assenti
  - _Requirements: 4.1, 4.4, 4.12_

- [x] 11.4 Implementare il `Limitatore_Frequenza` con backoff persistente
  - Token bucket per sorgente persistito su `stato_freschezza.budget_token`, valido fra i riavvii
  - Alla segnalazione di superamento del limite: `prossimo_tentativo_non_prima_di` con attesa da 60 s raddoppiata fino a 3600 s
  - Timeout di 30 secondi per richiesta tramite segnale di annullamento
  - _Requirements: 4.7, 4.8, 4.9_

- [x] 11.5 Implementare il `Risolutore_Identita`
  - Accoppiamento per nome normalizzato più squadra normalizzata, con tabella di alias persistente
  - Identificativo sempre dalla sorgente listone; in sua assenza `sha1(nome_normalizzato|squadra)` troncato a 16 caratteri esadecimali
  - Gli scarti non bloccano la pubblicazione: il giocatore entra con statistiche non disponibili
  - _Requirements: 4.12, 4.16_

- [x] 11.6 Implementare il pianificatore e la pubblicazione atomica dello snapshot
  - Esecuzione giornaliera alle 05:00 Europe/Rome con tabella di lock, almeno un tentativo ogni 24 ore per canale
  - Snapshot costruito in stato `in_costruzione`, pubblicato con `UPDATE` del puntatore `pubblicazione_snapshot` in transazione, solo se il listone è completo
  - Errore, timeout o rifiuto scrivono esclusivamente su `stato_freschezza`, senza toccare le tabelle degli snapshot
  - Registro delle acquisizioni riuscite con stagione, istante, nome sorgente e numero di giocatori
  - _Requirements: 4.3, 4.6, 4.9, 4.10, 4.15_

- [x] 11.7 Implementare la riassociazione delle voci del registro fra snapshot
  - Riassociazione per identificativo con numero, ordine e prezzi invariati
  - Voci con giocatore assente dallo snapshot più recente conservate e contrassegnate, ma ancora incluse nei calcoli di budget e slot
  - _Requirements: 4.16, 4.17_

- [x] 11.8 Scrivere i test di integrazione della pipeline di ingestione
  - Sorgente simulata nei casi successo, timeout, superamento del limite con backoff e risposta non valida
  - Pubblicazione atomica verificata sotto lettura concorrente: il lettore vede lo snapshot precedente per intero o quello nuovo per intero, mai uno stato intermedio
  - _Requirements: 4.3, 4.7, 4.8, 4.9, 4.10_

## 12. Interfaccia: fondazioni

- [x] 12.1 Configurare il tema Mantine con il vincolo dimensionale
  - `theme.components` con dimensioni predefinite che garantiscono elementi interattivi di almeno 44×44 px CSS
  - `allowDecimal: false` come predefinito globale dei campi numerici
  - _Requirements: 12.1, 3.22, 6.14, 7.4, 11.4_

- [x] 12.2 Configurare TanStack Query, lo store Zustand della coda e il client tRPC
  - Cache per query, riconciliazione con gli eventi SSE, coda locale separata dalla cache
  - _Requirements: 7.2, 7.13_

- [x] 12.3 Implementare i cinque componenti di composizione ammessi
  - `BarraStatoAsta`, `CampoRicercaGiocatore`, `ListaAvvisi`, `IndicatoreConvenienza`, `SelettoreQuoteReparto`
  - Nessun CSS proprio oltre alle proprietà di layout offerte da Mantine
  - _Requirements: 5.4, 5.5, 9.9, 10.1, 3.9_

## 13. Interfaccia: schermate

- [x] 13.1 Implementare registrazione, accesso e uscita
  - Moduli con resolver Zod condiviso, messaggi di errore che riportano il vincolo violato, valori conservati dopo il rifiuto
  - Reindirizzamento all'elenco delle sole sessioni proprie dopo l'accesso
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 13.2 Implementare l'elenco delle sessioni d'asta
  - Schede con nome, data di creazione, tipo d'asta, budget residuo e giocatori in rosa, ordinate per ultima modifica
  - Stato vuoto con azione di creazione, duplicazione, eliminazione con conferma che riporta il nome e annullamento entro il tempo previsto
  - _Requirements: 2.3, 2.4, 2.7, 2.8, 2.9, 2.10, 3.13_

- [x] 13.3 Implementare la schermata di configurazione dell'asta
  - Passi guidati con campi numerici vincolati agli intervalli dei requisiti, selettore della modalità di gioco, interruttore del modificatore di difesa
  - Slot per reparto con predefiniti `classic`, definizione per ruolo in `mantra` con almeno un portiere
  - Quote per reparto con indicatore della somma verso 100 e rifiuto che indica la somma corrente
  - Pesi di valutazione, profili strategia, ripristino dei predefiniti, mappa ruoli Mantra → macro-reparto consultabile
  - Stato di freschezza dei dati con nome delle sorgenti
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.13, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20, 3.21, 3.22, 4.13_

- [x] 13.4 Implementare la barra di stato persistente della sessione
  - Budget residuo, slot residui totali e, per ciascun reparto, budget di reparto residuo e slot residui, visibili senza navigazione e aggiornati entro 1 secondo
  - _Requirements: 10.1, 7.2_

- [x] 13.5 Implementare la dashboard
  - Una sezione per reparto con al massimo 10 giocatori disponibili, ordinati per indice decrescente e per nome a parità
  - Voci con nome, squadra, ruolo, quotazione, prezzo massimo consigliato e indice di convenienza
  - Sezione contrassegnata come completa e indice 0 quando gli slot residui sono 0
  - Filtri per reparto, squadra e intervallo di quotazione 1–999, inclusione facoltativa dei non disponibili
  - Stato di freschezza e messaggio di dati non disponibili in assenza di snapshot consultabile
  - Ricalcolo e riordino dopo ogni mutazione del registro
  - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.14, 8.8, 8.10_

- [x] 13.6 Implementare la ricerca dei giocatori
  - Soglia di 2 caratteri con indicazione esplicita, massimo 50 caratteri accettati, massimo 20 risultati con ruolo e squadra
  - Confronto insensibile a maiuscole e segni diacritici su `nome_ricerca` precalcolato, con ritardo di digitazione entro il budget di 300 ms
  - Assenza di risultati con al massimo 5 suggerimenti a distanza di edit non superiore a 2, ordinati per somiglianza
  - Campo non utilizzabile e stato di freschezza mostrato in assenza di dati consultabili
  - Filtro di disponibilità predefinito con avvertenza che l'insieme riflette solo le annotazioni dell'utente
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.8, 8.10, 8.11_

- [x] 13.7 Implementare la scheda giocatore
  - Statistiche fantacalcio complete, statistiche tattiche del solo macro-reparto pertinente, indicazione di dato non disponibile senza sostituzione con zero
  - Stagione di riferimento per singola statistica, etichetta di rilevanza per il modificatore di difesa su portieri e difensori
  - Quotazione, prezzo massimo consigliato, indice di convenienza e spiegazione dei cinque fattori
  - Prezzo massimo personale accanto al consigliato per i giocatori in lista obiettivi, con indicazione di valore non assegnato
  - Assegnatario e prezzo con prezzo consigliato omesso per i giocatori non disponibili
  - Registrazione dell'acquisto con selettore del ruolo di imputazione in Mantra
  - Area avvisi con ordinamento per livello e messaggio di avvisi non disponibili come ripiego
  - _Requirements: 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 5.17, 6.5, 6.6, 6.7, 6.13, 8.12, 9.9, 9.12, 9.14, 11.5, 13.5_

- [x] 13.8 Implementare la vista della rosa e il riepilogo finale
  - Giocatori raggruppati per reparto con nome e prezzo, giocatori acquistati e slot residui per reparto
  - Fantamedia media per reparto arrotondata a due decimali, con indicatore esplicito di valore non disponibile per i reparti vuoti
  - Sessione contrassegnata come completata al raggiungimento di 0 slot residui totali, con riepilogo per reparto e budget residuo complessivo
  - _Requirements: 10.2, 10.3, 10.4, 10.7_

- [x] 13.9 Implementare la vista degli avversari
  - Definizione dei nomi con vincoli e messaggi di rifiuto, annotazione degli acquisti con campi facoltativi
  - Crediti spesi, crediti residui stimati e giocatori per reparto per ciascun avversario
  - Annullamento di una voce con ritorno del giocatore fra i disponibili
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.13, 8.14_

- [x] 13.10 Implementare la lista obiettivi
  - Tabella ordinabile per reparto e priorità, prezzo massimo personale e priorità con vincoli, contrassegno di non raggiungibilità
  - Messaggi di rifiuto per duplicati, limite di 200 voci e valori fuori intervallo
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.7, 11.8, 11.9_

- [x] 13.11 Implementare l'interfaccia di esportazione e importazione
  - Azione di esportazione con notifica di esito, selezione del file per l'importazione, messaggi di errore che indicano il motivo del rifiuto
  - _Requirements: 10.5, 10.8, 10.9_

- [x] 13.12 Implementare l'avviso di dati potenzialmente non aggiornati
  - Avviso con nome della sorgente e istante dell'ultima acquisizione riuscita quando questa precede l'istante corrente di più di 7 giorni
  - _Requirements: 4.13, 4.14_

## 14. Modalità offline e mobilità

- [x] 14.1 Implementare la `Coda_Locale` su IndexedDB
  - Store con massimo 50 operazioni, ciascuna con chiave di idempotenza, tentativi e stato
  - Rifiuto di nuove registrazioni a coda piena con messaggio esplicito e operazioni in coda invariate
  - Conservazione per almeno 24 ore
  - _Requirements: 12.3, 12.4_

- [x] 14.2 Implementare il reinvio e l'indicatore di stato
  - Massimo 5 tentativi a intervalli 10/20/40/80/160 secondi al ripristino della connessione
  - Indicatore permanente con il numero di operazioni in attesa, aggiornamento allo stato confermato dal server e rimozione dalla coda
  - Operazione contrassegnata come non inviata con messaggio di errore dopo il quinto tentativo senza conferma
  - _Requirements: 12.3, 12.5, 12.6, 12.7_

- [x] 14.3 Implementare la risoluzione dei conflitti
  - Marcatura in conflitto sulla risposta 409, con coda locale e registro entrambi invariati fino alla scelta dell'utente
  - Confronto affiancato delle due versioni, applicazione della versione scelta in transazione singola e rimozione dalla coda
  - _Requirements: 12.8, 12.9_

- [x] 14.4 Configurare il Service Worker e la PWA
  - Registrazione del Service Worker, strategia di cache per lo scheletro applicativo e per l'indice di ricerca
  - _Requirements: 12.2, 12.3_

## 15. Verifica finale

- [x] 15.1 Implementare i test architetturali che falliscono la build
  - Assenza di import vietati in `packages/domain`, assenza di campi in virgola mobile nei tipi di dominio e negli schemi Zod
  - Nessun accesso al repository delle sessioni d'asta che non passi da `caricaSessionePropria`
  - Nessun file CSS fuori dalla cartella del tema
  - _Requirements: 4.5, 6.2, 12.1_

- [x] 15.2 Implementare i test end-to-end del percorso completo
  - Dalla registrazione al completamento della rosa, con registrazione di acquisti propri e annotazioni degli avversari
  - _Requirements: 2.1, 7.1, 10.4, 13.1_

- [x] 15.3 Implementare i test end-to-end di responsive e offline
  - Misura delle dimensioni effettive degli elementi interattivi e assenza di scorrimento orizzontale a 360, 768, 1024 e 1920 px
  - Modalità offline con riempimento della coda fino a 50 operazioni, reinvio e risoluzione di un conflitto
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.8, 12.9_

- [x] 15.4 Verificare la copertura delle 17 proprietà di correttezza
  - Esecuzione dell'intera suite di proprietà con semi riproducibili e conteggio delle iterazioni, con mappatura esplicita da P1 a P17 verso i test corrispondenti
  - _Requirements: 4.19, 4.20, 6.10, 6.11, 6.12, 7.8, 7.9, 7.10, 8.15, 9.10, 10.6, 13.12, 13.13, 13.14, 3.14_
