# Requirements Document

## Introduction

`asta-fantacalcio-companion` è una web-app di supporto alle decisioni durante l'asta del fantacalcio. L'applicazione **non conduce** l'asta: non gestisce turni, rilanci o aggiudicazioni tra i partecipanti. L'applicazione affianca un singolo utente (l'allenatore) mentre l'asta si svolge altrove (dal vivo o su altra piattaforma).

I dati non vengono caricati a mano: il Sistema li acquisisce automaticamente dal web, lato server, attraverso due canali distinti. Il primo fornisce il listone ufficiale con ruoli, squadre e quotazioni; il secondo fornisce le statistiche dei giocatori tramite integrazione con un servizio esterno. L'Utente non dispone di alcuna funzione di importazione manuale: trova i dati già pronti, con l'indicazione di quando sono stati aggiornati l'ultima volta.

L'esperienza parte da una dashboard. Appena i dati sono disponibili e l'asta sta iniziando, l'allenatore vede i giocatori più convenienti per ciascun reparto, ciascuno con una percentuale di convenienza all'acquisto calcolata sullo stato corrente dell'asta. Da una voce della dashboard si apre la scheda del giocatore. Su questa base l'applicazione fornisce tre servizi:

1. **Consultazione**: dato un giocatore, mostra le statistiche tattiche coerenti con il suo ruolo e i dati specifici di fantacalcio (media voto, fantamedia, presenze, bonus, malus, quotazione).
2. **Valutazione**: calcola e mostra il prezzo massimo consigliato e la percentuale di convenienza, ricalcolati in funzione dello stato corrente dell'asta (budget residuo, slot residui, budget già allocato per reparto).
3. **Guida live**: registra gli acquisti effettuati e genera avvisi contestuali, ad esempio quando l'utente sta valutando un secondo portiere costoso avendo già acquistato il portiere titolare.

L'applicazione è multi-utente con registrazione e login. Ogni utente crea e gestisce esclusivamente le proprie sessioni d'asta e non vede alcun dato delle sessioni di altri utenti: non esistono sessioni condivise, inviti o ruoli. L'utente annota gli acquisti degli avversari per sapere quali giocatori sono ancora svincolati; se un acquisto reale non viene annotato, il Sistema continua a considerare quel giocatore disponibile.

Ogni sessione d'asta ha la propria configurazione (numero di partecipanti, tipologia d'asta, crediti, modificatore di difesa, composizione della rosa, pesi della valutazione e altre regole della lega). Entrambe le modalità di gioco, `classic` e `mantra`, sono supportate nella prima versione. Il tipo d'asta viene registrato nella configurazione a fini documentali ma non influenza alcuna funzionalità del Sistema.

Il presente documento definisce i requisiti funzionali e le proprietà di correttezza della prima versione. Le decisioni chiuse e quelle ancora aperte sono raccolte nell'Appendice A.

## Glossary

- **Sistema**: l'insieme dei componenti dell'applicazione `asta-fantacalcio-companion`.
- **Servizio_Autenticazione**: componente responsabile di registrazione, login, logout e gestione della sessione utente.
- **Utente**: persona registrata che utilizza il Sistema; corrisponde a un allenatore che partecipa a un'asta.
- **Sessione_Asta**: entità persistente creata da un Utente che rappresenta una singola asta, comprensiva di Configurazione_Asta, Rosa_Utente e Registro_Acquisti.
- **Configurazione_Asta**: insieme dei parametri immutabili o modificabili di una Sessione_Asta: numero di partecipanti, Tipo_Asta, Modalita_Gioco, crediti iniziali, Composizione_Rosa, Modificatore_Difesa, e regole opzionali della lega.
- **Tipo_Asta**: modalità di svolgimento dell'asta scelta dalla lega, tra: `chiamata`, `random`, `busta_chiusa`, `asta_live_ordine_listone`, `riparazione`.
- **Modalita_Gioco**: schema di ruoli adottato dalla lega, tra `classic` (ruoli P, D, C, A) e `mantra` (ruoli Por, Dc, Dd, Ds, E, M, C, W, T, A, Pc).
- **Modificatore_Difesa**: regola opzionale del fantacalcio che assegna un bonus al punteggio di squadra in base alla media voto della linea difensiva.
- **Reparto**: raggruppamento di giocatori per ruolo all'interno della Composizione_Rosa; nella Modalita_Gioco `classic` i Reparto sono Portieri, Difensori, Centrocampisti e Attaccanti, nella Modalita_Gioco `mantra` ciascun ruolo dello schema `mantra` costituisce un Reparto distinto, riconducibile a un Macro_Reparto.
- **Macro_Reparto**: raggruppamento dei ruoli della Modalita_Gioco `mantra` nei quattro reparti Portieri, Difensori, Centrocampisti, Attaccanti, usato per selezionare le Statistiche_Tattiche pertinenti e le quote di budget; nella Modalita_Gioco `classic` il Macro_Reparto di un Giocatore coincide con il suo Reparto.
- **Composizione_Rosa**: numero di slot richiesti per ciascun Reparto in una Sessione_Asta.
- **Slot_Residui**: per un dato Reparto, differenza tra gli slot previsti dalla Composizione_Rosa e i giocatori di quel Reparto già presenti nella Rosa_Utente.
- **Rosa_Utente**: insieme dei Giocatori acquistati dall'Utente in una Sessione_Asta, ciascuno con il proprio Prezzo_Acquisto.
- **Registro_Acquisti**: sequenza ordinata e persistente degli acquisti registrati in una Sessione_Asta, sia dell'Utente sia degli Avversari.
- **Avversario**: partecipante alla Sessione_Asta diverso dall'Utente, identificato da un nome scelto dall'Utente.
- **Crediti_Residui_Stimati**: per un Avversario, differenza tra i crediti iniziali della Configurazione_Asta e la somma dei Prezzo_Acquisto delle sue voci del Registro_Acquisti.
- **Giocatore**: calciatore presente nel Listone, identificato univocamente da un Identificativo_Giocatore.
- **Identificativo_Giocatore**: chiave univoca e stabile di un Giocatore all'interno di un Listone.
- **Listone**: insieme dei Giocatori disponibili per una stagione, con ruolo, squadra di appartenenza e Quotazione.
- **Quotazione**: prezzo di riferimento di un Giocatore pubblicato nel Listone, espresso in crediti.
- **Statistiche_Tattiche**: dati di rendimento sul campo di un Giocatore (ad esempio gol, assist, precisione dei passaggi, clean sheet, parate), il cui insieme dipende dal Macro_Reparto del ruolo del Giocatore e dalla Sorgente_Statistiche attiva.
- **Statistiche_Fantacalcio**: dati specifici del fantacalcio di un Giocatore: media voto, fantamedia, presenze, gol, assist, ammonizioni, espulsioni, rigori parati, rigori sbagliati, autogol.
- **Scheda_Giocatore**: vista aggregata che il Sistema presenta per un Giocatore, contenente Statistiche_Tattiche, Statistiche_Fantacalcio, Quotazione e Prezzo_Massimo_Consigliato.
- **Prezzo_Massimo_Consigliato**: valore in crediti, calcolato dal Motore_Valutazione, che rappresenta la spesa massima suggerita per un Giocatore nello stato corrente della Sessione_Asta.
- **Prezzo_Acquisto**: crediti effettivamente spesi per un Giocatore, inseriti dall'Utente al momento della registrazione dell'acquisto.
- **Budget_Residuo**: differenza tra i crediti iniziali della Configurazione_Asta e la somma dei Prezzo_Acquisto della Rosa_Utente.
- **Budget_Reparto_Residuo**: per un dato Reparto, differenza tra il budget pianificato per quel Reparto e la somma dei Prezzo_Acquisto dei Giocatori di quel Reparto nella Rosa_Utente.
- **Riserva_Minima**: crediti che il Sistema mantiene indisponibili per garantire il completamento della Rosa_Utente, pari a 1 credito per ogni slot ancora da riempire escluso quello in valutazione.
- **Lista_Obiettivi**: elenco di Giocatori che l'Utente intende acquistare in una Sessione_Asta, ciascuno con un Prezzo_Massimo_Personale e una priorità.
- **Prezzo_Massimo_Personale**: valore in crediti che l'Utente si prefigge come tetto di spesa per un Giocatore della Lista_Obiettivi.
- **Motore_Valutazione**: componente che calcola il Prezzo_Massimo_Consigliato.
- **Motore_Avvisi**: componente che genera gli Avvisi contestuali.
- **Avviso**: messaggio generato dal Motore_Avvisi, classificato con un Livello_Avviso.
- **Livello_Avviso**: gravità di un Avviso, tra `informativo`, `attenzione`, `critico`.
- **Sorgente_Dati**: servizio esterno da cui il Sistema acquisisce dati, classificato come Sorgente_Listone (ruoli, squadre, Quotazione) o Sorgente_Statistiche (Statistiche_Tattiche e Statistiche_Fantacalcio).
- **Adattatore_Sorgente**: componente che traduce la risposta di una specifica Sorgente_Dati nel modello dati interno, uno per Sorgente_Dati.
- **Servizio_Ingestione**: componente lato server che pianifica ed esegue l'acquisizione dei dati, senza intervento dell'Utente.
- **Normalizzatore_Dati**: componente che trasforma i dati grezzi di un Adattatore_Sorgente in uno Snapshot_Dati.
- **Serializzatore_Dati**: componente che trasforma uno Snapshot_Dati nella sua rappresentazione persistente.
- **Snapshot_Dati**: insieme immutabile e versionato dei dati di una stagione acquisiti in un dato istante, comprensivo di Listone e statistiche disponibili.
- **Stato_Freschezza**: per uno Snapshot_Dati, istante dell'ultima acquisizione riuscita ed esito dell'ultimo tentativo.
- **Dashboard_Asta**: vista iniziale di una Sessione_Asta che elenca i Giocatori più convenienti per ciascun Reparto con il rispettivo Indice_Convenienza.
- **Indice_Convenienza**: valore percentuale intero da 0 a 100 che esprime quanto il Sistema consiglia l'acquisto di un Giocatore nello stato corrente della Sessione_Asta.
- **Pesi_Valutazione**: coefficienti che il Motore_Valutazione applica ai fattori del calcolo, con valori predefiniti forniti dal Sistema e calibrabili dall'Utente nella Configurazione_Asta.
- **Profilo_Strategia**: preimpostazione dei Pesi_Valutazione, tra `conservativo` e `aggressivo`.
- **Giocatore_Disponibile**: Giocatore dello Snapshot_Dati non presente in alcuna voce non annullata del Registro_Acquisti della Sessione_Asta.
- **Coda_Locale**: insieme ordinato di operazioni registrate sul dispositivo dell'Utente e non ancora confermate dal server.

## Requirements

### Requirement 1: Registrazione e autenticazione

**User Story:** Come allenatore, voglio registrarmi e accedere con le mie credenziali, così che le mie aste e le mie rose restino private e disponibili su qualsiasi dispositivo.

#### Acceptance Criteria

1. WHEN un visitatore invia il modulo di registrazione con un indirizzo email non ancora associato ad alcun Utente e una password di lunghezza compresa tra 8 e 128 caratteri, THE Servizio_Autenticazione SHALL creare un nuovo Utente e avviare una sessione autenticata valida per 24 ore di inattività e per un massimo di 30 giorni dalla creazione.
2. IF un visitatore invia il modulo di registrazione con un indirizzo email che, confrontato ignorando la differenza tra maiuscole e minuscole e gli spazi iniziali e finali, risulta già associato a un Utente esistente, THEN THE Servizio_Autenticazione SHALL rifiutare la registrazione, non creare alcun Utente e restituire un messaggio di errore che indica che l'indirizzo email è già registrato.
3. IF un visitatore invia una password di lunghezza inferiore a 8 caratteri o superiore a 128 caratteri, THEN THE Servizio_Autenticazione SHALL rifiutare la registrazione, non creare alcun Utente e restituire un messaggio di errore che indica il vincolo di lunghezza ammesso (da 8 a 128 caratteri).
4. IF un visitatore invia un indirizzo email privo del carattere "@", privo di una parte di dominio successiva al carattere "@", oppure di lunghezza superiore a 254 caratteri, THEN THE Servizio_Autenticazione SHALL rifiutare la registrazione, non creare alcun Utente e restituire un messaggio di errore che indica che il formato dell'indirizzo email non è valido.
5. WHEN un Utente invia un indirizzo email e una password corrispondenti a un account esistente, THE Servizio_Autenticazione SHALL avviare una sessione autenticata valida per 24 ore di inattività e reindirizzare l'Utente all'elenco delle sole Sessione_Asta di cui l'Utente è proprietario.
6. IF un Utente invia credenziali non corrispondenti ad alcun account, THEN THE Servizio_Autenticazione SHALL rifiutare l'accesso, non avviare alcuna sessione autenticata e restituire un messaggio di errore che indica credenziali non valide, identico nel contenuto e nel comportamento osservabile sia quando l'indirizzo email è registrato sia quando non lo è.
7. WHEN un Utente richiede il logout, THE Servizio_Autenticazione SHALL invalidare la sessione autenticata corrente e trattare ogni richiesta successiva presentata con la medesima sessione come richiesta non autenticata.
8. WHEN il periodo di inattività di una sessione autenticata raggiunge 24 ore oppure la sua durata complessiva raggiunge 30 giorni, THE Servizio_Autenticazione SHALL invalidare la sessione e trattare ogni richiesta successiva presentata con la medesima sessione come richiesta non autenticata.
9. THE Servizio_Autenticazione SHALL memorizzare le password esclusivamente come hash prodotti da una funzione di hashing progettata per password con salt univoco per Utente, e SHALL non includere la password né il relativo hash in alcuna risposta restituita a un Utente.
10. WHILE una richiesta non è associata a una sessione autenticata valida, THE Sistema SHALL restituire codice di stato 401 per ogni richiesta a risorse riferite a una Sessione_Asta, senza restituire alcun dato della Sessione_Asta.
11. IF un Utente autenticato richiede una Sessione_Asta di cui non è proprietario, THEN THE Sistema SHALL restituire codice di stato 404 e nessun dato della Sessione_Asta, con risposta indistinguibile da quella restituita per una Sessione_Asta inesistente.

### Requirement 2: Creazione e gestione delle sessioni d'asta

**User Story:** Come allenatore, voglio creare più aste distinte e riprenderle in qualsiasi momento, così da poter gestire leghe diverse e stagioni diverse.

#### Acceptance Criteria

1. WHEN un Utente autenticato invia una Configurazione_Asta che soddisfa tutti i vincoli seguenti (nome da 1 a 60 caratteri, univoco tra le Sessione_Asta dello stesso Utente; Tipo_Asta uguale a uno dei valori ammessi dal Sistema; crediti iniziali interi compresi tra 1 e 100000; numero di partecipanti intero compreso tra 2 e 20; totale degli slot della Composizione_Rosa intero compreso tra 4 e 50), THE Sistema SHALL creare una Sessione_Asta associata a quell'Utente entro 3 secondi, impostare il Budget_Residuo pari ai crediti iniziali, inizializzare Rosa_Utente e Registro_Acquisti vuoti e restituire l'identificativo univoco della Sessione_Asta.
2. THE Sistema SHALL consentire a un Utente di possedere contemporaneamente fino a 50 Sessione_Asta, ciascuna con stato, Budget_Residuo, Rosa_Utente e Registro_Acquisti indipendenti dalle altre.
3. WHEN un Utente autenticato apre l'elenco delle proprie Sessione_Asta, THE Sistema SHALL mostrare entro 3 secondi, per ciascuna Sessione_Asta associata a quell'Utente, il nome, la data e ora di creazione, il Tipo_Asta, il Budget_Residuo e il numero di Giocatori presenti nella Rosa_Utente, ordinando le voci dalla data di ultima modifica più recente alla meno recente.
4. IF un Utente autenticato apre l'elenco delle proprie Sessione_Asta e non possiede alcuna Sessione_Asta, THEN THE Sistema SHALL mostrare un elenco vuoto con un'indicazione che nessuna Sessione_Asta è stata creata e un'azione per crearne una.
5. WHEN un Utente riapre una propria Sessione_Asta creata in precedenza, THE Sistema SHALL ripristinare entro 5 secondi la Configurazione_Asta, la Rosa_Utente, il Registro_Acquisti e il Budget_Residuo con gli stessi valori registrati all'ultima modifica confermata, senza alcuna differenza nel numero di voci del Registro_Acquisti e nel numero di Giocatori della Rosa_Utente.
6. IF il ripristino di una Sessione_Asta non può essere completato entro 5 secondi o i dati recuperati risultano incompleti, THEN THE Sistema SHALL interrompere l'apertura, mantenere invariati i dati persistiti della Sessione_Asta e mostrare un messaggio di errore che indica l'impossibilità di ripristinare la sessione e la possibilità di ritentare.
7. WHEN un Utente richiede la duplicazione di una propria Sessione_Asta, THE Sistema SHALL creare entro 3 secondi una nuova Sessione_Asta con lo stesso Tipo_Asta e gli stessi valori di Configurazione_Asta dell'originale, con nome distinto da quelli già esistenti per lo stesso Utente, con Registro_Acquisti e Rosa_Utente vuoti e con Budget_Residuo pari ai crediti iniziali della Configurazione_Asta, lasciando la Sessione_Asta originale invariata.
8. WHEN un Utente richiede l'eliminazione di una propria Sessione_Asta, THE Sistema SHALL richiedere una conferma esplicita che riporti il nome della Sessione_Asta e non eseguire alcuna modifica prima della conferma.
9. IF l'Utente annulla la richiesta di eliminazione o non fornisce la conferma esplicita entro 120 secondi, THEN THE Sistema SHALL annullare l'operazione e mantenere la Sessione_Asta, la Rosa_Utente e il Registro_Acquisti invariati.
10. WHEN un Utente conferma l'eliminazione di una propria Sessione_Asta, THE Sistema SHALL rimuovere entro 3 secondi la Sessione_Asta, la relativa Rosa_Utente e il relativo Registro_Acquisti in modo irreversibile, escludere la Sessione_Asta dall'elenco successivo e lasciare invariate le altre Sessione_Asta dello stesso Utente.
11. IF un Utente invia una Configurazione_Asta che viola almeno uno dei vincoli del criterio 1, oppure richiede la creazione o la duplicazione di una Sessione_Asta quando ne possiede già 50, THEN THE Sistema SHALL rifiutare l'operazione, non creare alcuna Sessione_Asta e mostrare un messaggio di errore che indica il vincolo violato o il raggiungimento del numero massimo di sessioni, conservando i valori già immessi dall'Utente.
12. IF un Utente richiede la visualizzazione, il ripristino, la duplicazione o l'eliminazione di una Sessione_Asta non associata al proprio account o non esistente, THEN THE Sistema SHALL negare l'operazione, non modificare né esporre alcun dato della Sessione_Asta e mostrare un messaggio di errore che indica che la sessione non è disponibile per quell'Utente.

### Requirement 3: Configurazione dell'asta

**User Story:** Come allenatore, voglio configurare le regole della mia lega, così che i consigli del Sistema siano coerenti con l'asta che sto realmente affrontando.

#### Acceptance Criteria

1. WHEN l'Utente avvia la creazione di una Sessione_Asta, THE Sistema SHALL richiedere come parametri obbligatori: nome della Sessione_Asta (da 1 a 60 caratteri), numero di partecipanti, Tipo_Asta, Modalita_Gioco, crediti iniziali per partecipante e Composizione_Rosa.
2. THE Sistema SHALL accettare come Tipo_Asta esattamente uno tra `chiamata`, `random`, `busta_chiusa`, `asta_live_ordine_listone`, `riparazione`, e come Modalita_Gioco esattamente uno tra `classic` e `mantra`.
3. THE Sistema SHALL accettare come numero di partecipanti un valore intero compreso tra 2 e 20 inclusi.
4. THE Sistema SHALL accettare come crediti iniziali per partecipante un valore intero compreso tra 1 e 100000 inclusi.
5. WHERE la Modalita_Gioco è `classic`, THE Sistema SHALL proporre come Composizione_Rosa predefinita 3 Portieri, 8 Difensori, 8 Centrocampisti e 6 Attaccanti, consentendone la modifica con valori interi da 1 a 25 slot per ciascun Reparto e totale della Composizione_Rosa compreso tra 4 e 50 slot inclusi.
6. WHERE la Modalita_Gioco è `mantra`, THE Sistema SHALL consentire la definizione degli slot per ciascun ruolo dello schema `mantra` con valori interi da 0 a 25 per ruolo, almeno 1 slot di Portiere e totale della Composizione_Rosa compreso tra 4 e 50 slot inclusi.
7. THE Sistema SHALL consentire di attivare o disattivare il Modificatore_Difesa per ogni Sessione_Asta, con valore predefinito disattivato.
8. THE Sistema SHALL consentire all'Utente di specificare, per ciascun Reparto, la quota percentuale di crediti iniziali pianificata come valore intero compreso tra 0 e 100 inclusi.
9. IF la somma delle quote percentuali per Reparto è diversa da 100, THEN THE Sistema SHALL rifiutare la Configurazione_Asta, indicare la somma corrente e conservare i valori già inseriti dall'Utente.
10. WHERE l'Utente non specifica le quote percentuali per Reparto, THE Sistema SHALL applicare la ripartizione predefinita di 8 percento ai Portieri, 20 percento ai Difensori, 32 percento ai Centrocampisti e 40 percento agli Attaccanti.
11. WHEN un Utente conferma la modifica della Configurazione_Asta di una Sessione_Asta con Registro_Acquisti non vuoto, THE Sistema SHALL ricalcolare entro 2 secondi il Budget_Residuo come crediti iniziali meno la somma dei Prezzo_Acquisto registrati nel Registro_Acquisti, il Budget_Reparto_Residuo come quota percentuale aggiornata dei crediti iniziali meno la somma dei Prezzo_Acquisto del Reparto, e gli Slot_Residui come slot previsti dalla nuova Composizione_Rosa meno i Giocatori già presenti in Rosa_Utente per ciascun Reparto.
12. IF una modifica della Configurazione_Asta rende la Rosa_Utente incompatibile con la Composizione_Rosa, perché in almeno un Reparto i Giocatori presenti superano gli slot previsti, THEN THE Sistema SHALL rifiutare la modifica, mantenere invariata la Configurazione_Asta precedente e indicare per ciascun Reparto in eccedenza il numero di Giocatori in esubero.
13. THE Sistema SHALL registrare il Tipo_Asta nella Configurazione_Asta e mostrarlo all'Utente nella schermata di configurazione e nell'elenco delle Sessione_Asta, a soli fini documentali.
14. FOR ALL stati di Sessione_Asta e per ogni Giocatore, a parità di ogni altro parametro della Configurazione_Asta, della Rosa_Utente e del Registro_Acquisti, modificare esclusivamente il Tipo_Asta SHALL produrre lo stesso Prezzo_Massimo_Consigliato, lo stesso Indice_Convenienza e lo stesso insieme di Avvisi, con identici Livello_Avviso, identici valori numerici riportati e identico ordine di presentazione.
15. WHERE l'Utente non modifica i Pesi_Valutazione di una Sessione_Asta, THE Sistema SHALL applicare i valori predefiniti dei Pesi_Valutazione forniti dal Sistema.
16. THE Sistema SHALL consentire all'Utente di specificare nella Configurazione_Asta, per ciascun fattore utilizzato dal Motore_Valutazione, un peso intero compreso tra 0 e 100 inclusi, con almeno un peso maggiore di 0.
17. IF i Pesi_Valutazione confermati dall'Utente contengono un valore non intero, un valore esterno all'intervallo da 0 a 100 inclusi, oppure hanno tutti valore pari a 0, THEN THE Sistema SHALL rifiutare la modifica, conservare i Pesi_Valutazione precedenti e mostrare un messaggio di errore che indica il fattore non valido, l'intervallo ammesso da 0 a 100 e il vincolo di almeno un peso maggiore di 0.
18. WHEN l'Utente richiede il ripristino dei Pesi_Valutazione predefiniti di una Sessione_Asta, THE Sistema SHALL sostituire entro 2 secondi i Pesi_Valutazione della Configurazione_Asta con i valori predefiniti forniti dal Sistema.
19. WHEN l'Utente applica un Profilo_Strategia a una Sessione_Asta, THE Sistema SHALL accettare esattamente uno tra `conservativo` e `aggressivo`, impostare i Pesi_Valutazione ai valori della preimpostazione corrispondente e mantenerli successivamente modificabili dall'Utente secondo i criteri 16 e 17.
20. WHERE la Modalita_Gioco è `mantra`, THE Sistema SHALL associare ciascun ruolo dello schema `mantra` a esattamente un Macro_Reparto tra Portieri, Difensori, Centrocampisti e Attaccanti, e SHALL rendere tale associazione consultabile dall'Utente nella schermata di configurazione.
21. WHERE la Modalita_Gioco è `mantra`, THE Sistema SHALL richiedere le quote percentuali dei crediti iniziali per ciascun Macro_Reparto applicando i vincoli dei criteri 8, 9 e 10, e SHALL utilizzare il Macro_Reparto del ruolo di un Giocatore per selezionare le Statistiche_Tattiche pertinenti.
22. IF un parametro obbligatorio della Configurazione_Asta è assente, vuoto, non intero dove richiesto oppure fuori dagli intervalli ammessi dai criteri da 1 a 8, THEN THE Sistema SHALL rifiutare la Configurazione_Asta, indicare il parametro non valido e l'intervallo o l'insieme di valori ammessi, e conservare i valori già inseriti dall'Utente.
23. WHEN la Configurazione_Asta supera tutte le validazioni dei criteri da 1 a 22, THE Sistema SHALL salvarla e associarla alla Sessione_Asta, rendendone i valori consultabili dall'Utente in forma invariata alle successive aperture della Sessione_Asta.

### Requirement 4: Acquisizione automatica dei dati dal web

**User Story:** Come allenatore, voglio trovare i dati dei giocatori già pronti e aggiornati senza caricare alcun file, così da poter consultare qualsiasi nome venga chiamato appena apro l'applicazione.

#### Acceptance Criteria

1. THE Servizio_Ingestione SHALL acquisire dalla Sorgente_Listone i ruoli, le squadre e le Quotazione dei Giocatori e dalla Sorgente_Statistiche le Statistiche_Tattiche e le Statistiche_Fantacalcio, eseguendo l'acquisizione lato server e senza alcuna azione dell'Utente.
2. THE Sistema SHALL alimentare Listone e statistiche esclusivamente attraverso il Servizio_Ingestione, e SHALL presentare all'Utente i soli dati contenuti in uno Snapshot_Dati consultabile.
3. WHILE la stagione di riferimento è in corso, THE Servizio_Ingestione SHALL eseguire almeno un tentativo di acquisizione ogni 24 ore per la Sorgente_Listone e almeno un tentativo di acquisizione ogni 24 ore per la Sorgente_Statistiche.
4. THE Sistema SHALL utilizzare esattamente un Adattatore_Sorgente per ciascuna Sorgente_Dati, incaricato di tradurre le risposte di quella Sorgente_Dati nel modello dati interno.
5. WHEN una Sorgente_Dati viene sostituita o aggiunta, THE Sistema SHALL confinare le modifiche al solo Adattatore_Sorgente corrispondente, mantenendo invariati il Normalizzatore_Dati, il Serializzatore_Dati, il Motore_Valutazione, il Motore_Avvisi e la Dashboard_Asta.
6. THE Servizio_Ingestione SHALL conservare in una cache lato server l'ultimo Snapshot_Dati valido di ciascuna stagione di riferimento e SHALL servire le consultazioni dell'Utente da tale cache, senza effettuare chiamate alle Sorgente_Dati durante la consultazione.
7. THE Servizio_Ingestione SHALL eseguire le chiamate a ciascuna Sorgente_Dati entro i limiti di frequenza dichiarati da quella Sorgente_Dati.
8. IF una Sorgente_Dati segnala il superamento del proprio limite di frequenza, THEN THE Servizio_Ingestione SHALL sospendere le chiamate a quella Sorgente_Dati e ritentare con attesa a ritardo crescente, a partire da 60 secondi e raddoppiando l'attesa a ogni tentativo successivo fino a un massimo di 3600 secondi.
9. IF una Sorgente_Dati non risponde entro 30 secondi, risponde con un errore oppure restituisce dati rifiutati dal Normalizzatore_Dati, THEN THE Sistema SHALL conservare integralmente l'ultimo Snapshot_Dati valido, SHALL lasciare invariata ogni parte di quello Snapshot_Dati e SHALL registrare nello Stato_Freschezza l'istante e l'esito negativo del tentativo.
10. WHEN il Normalizzatore_Dati termina la costruzione di uno Snapshot_Dati, THE Sistema SHALL rendere consultabile il nuovo Snapshot_Dati soltanto se contiene il Listone completo della stagione di riferimento, e SHALL continuare a presentare all'Utente lo Snapshot_Dati consultabile precedente fino a quel momento, senza esporre alcuno stato intermedio della costruzione.
11. IF un Giocatore restituito da una Sorgente_Dati presenta una Quotazione non intera o esterna all'intervallo da 1 a 999 inclusi, un ruolo non appartenente agli insiemi di ruoli definiti per le Modalita_Gioco `classic` e `mantra`, un campo obbligatorio assente tra Identificativo_Giocatore, nome, ruolo, squadra e Quotazione, un nome di lunghezza superiore a 100 caratteri, oppure un Identificativo_Giocatore già presente nella medesima risposta, THEN THE Normalizzatore_Dati SHALL rifiutare la risposta, SHALL registrare il campo non valido e l'Identificativo_Giocatore interessato, e SHALL conservare come consultabile l'ultimo Snapshot_Dati valido.
12. IF la Sorgente_Statistiche non fornisce una statistica prevista dal Sistema per il ruolo di un Giocatore, THEN THE Normalizzatore_Dati SHALL includere nello Snapshot_Dati le statistiche restanti di quel Giocatore, SHALL contrassegnare la statistica assente come non disponibile e SHALL portare a termine la costruzione dello Snapshot_Dati.
13. THE Sistema SHALL mostrare nella Dashboard_Asta e nella schermata di configurazione della Sessione_Asta lo Stato_Freschezza dello Snapshot_Dati corrente, comprensivo dell'istante dell'ultima acquisizione riuscita, dell'esito dell'ultimo tentativo e del nome di ciascuna Sorgente_Dati.
14. IF l'istante dell'ultima acquisizione riuscita di una Sorgente_Dati precede l'istante corrente di più di 7 giorni, THEN THE Sistema SHALL mostrare all'Utente un avviso che riporta il nome della Sorgente_Dati, l'istante dell'ultima acquisizione riuscita e l'indicazione che i dati potrebbero non essere aggiornati.
15. WHEN un'acquisizione termina con esito positivo, THE Servizio_Ingestione SHALL registrare in modo persistente la stagione di riferimento, l'istante dell'acquisizione, il nome della Sorgente_Dati e il numero di Giocatori acquisiti.
16. THE Sistema SHALL conservare gli Snapshot_Dati associati alla rispettiva stagione di riferimento e SHALL riassociare le voci del Registro_Acquisti ai Giocatori dello Snapshot_Dati più recente tramite Identificativo_Giocatore, conservando invariati numero, ordine e Prezzo_Acquisto delle voci.
17. IF un Giocatore presente in una voce non annullata del Registro_Acquisti è assente dallo Snapshot_Dati più recente, THEN THE Sistema SHALL conservare la voce con nome, Reparto e Prezzo_Acquisto già registrati, contrassegnarla come "giocatore non presente nei dati correnti" e continuare a includerla nel calcolo di Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui.
18. THE Serializzatore_Dati SHALL trasformare uno Snapshot_Dati nella sua rappresentazione persistente e SHALL ricostruire uno Snapshot_Dati a partire da tale rappresentazione.
19. FOR ALL Snapshot_Dati validi contenenti da 1 a 2000 Giocatori, applicare il Serializzatore_Dati e successivamente ricostruire lo Snapshot_Dati dalla rappresentazione persistente prodotta SHALL produrre uno Snapshot_Dati equivalente all'originale secondo la definizione di equivalenza del criterio 21.
20. FOR ALL risposte di Sorgente_Dati accettate dal Normalizzatore_Dati, applicare il Normalizzatore_Dati, poi il Serializzatore_Dati e quindi nuovamente il Normalizzatore_Dati sulla rappresentazione persistente prodotta SHALL terminare senza errori e SHALL produrre uno Snapshot_Dati equivalente a quello ottenuto dalla prima normalizzazione secondo la definizione di equivalenza del criterio 21.
21. THE Sistema SHALL considerare due Snapshot_Dati equivalenti se e solo se contengono lo stesso insieme di Identificativo_Giocatore e, per ciascun Identificativo_Giocatore, valori identici di nome, ruolo, squadra, Quotazione, Statistiche_Fantacalcio e Statistiche_Tattiche, compresi i contrassegni di statistica non disponibile, indipendentemente dall'ordine in cui i Giocatori compaiono.

### Requirement 5: Ricerca e consultazione della scheda giocatore

**User Story:** Come allenatore, voglio cercare un giocatore per nome e vedere subito tutte le informazioni utili, così da decidere in pochi secondi mentre il giocatore viene messo all'asta.

#### Acceptance Criteria

1. WHEN un Utente digita almeno 2 caratteri nel campo di ricerca, THE Sistema SHALL mostrare al massimo 20 Giocatori dello Snapshot_Dati corrente il cui nome contiene la sequenza digitata, confrontando la sequenza senza distinzione tra maiuscole e minuscole e senza distinzione tra lettere accentate e non accentate, e SHALL indicare per ciascun risultato ruolo e squadra.
2. THE Sistema SHALL accettare nel campo di ricerca da 0 a 50 caratteri e SHALL ignorare i caratteri digitati oltre il cinquantesimo.
3. WHEN un Utente digita almeno 2 caratteri nel campo di ricerca, THE Sistema SHALL restituire i risultati entro 300 millisecondi dall'ultimo carattere digitato, con uno Snapshot_Dati contenente fino a 2000 Giocatori.
4. IF la sequenza digitata nel campo di ricerca contiene meno di 2 caratteri, THEN THE Sistema SHALL non mostrare alcun risultato e SHALL mostrare un'indicazione che sono necessari almeno 2 caratteri, mantenendo i caratteri già digitati nel campo di ricerca.
5. IF nessun Giocatore dello Snapshot_Dati corrente contiene la sequenza digitata, THEN THE Sistema SHALL mostrare un messaggio che indica l'assenza di risultati e SHALL proporre al massimo 5 Giocatori il cui nome differisce dalla sequenza digitata per al più 2 caratteri, ordinati dal più simile al meno simile.
6. IF nessuno Snapshot_Dati è consultabile oppure lo Snapshot_Dati corrente contiene 0 Giocatori, THEN THE Sistema SHALL mostrare un messaggio che indica che i dati dei Giocatori non sono ancora disponibili, SHALL mostrare lo Stato_Freschezza e SHALL rendere non utilizzabile il campo di ricerca.
7. WHEN un Utente seleziona un Giocatore dai risultati della ricerca, THE Sistema SHALL mostrare la Scheda_Giocatore entro 500 millisecondi dalla selezione.
8. THE Scheda_Giocatore SHALL contenere le Statistiche_Fantacalcio del Giocatore: media voto, fantamedia, presenze, gol, assist, ammonizioni, espulsioni, rigori parati, rigori sbagliati e autogol.
9. THE Scheda_Giocatore SHALL contenere la Quotazione, il Prezzo_Massimo_Consigliato e l'Indice_Convenienza del Giocatore, con l'Indice_Convenienza espresso come percentuale intera compresa tra 0 e 100 inclusi.
10. THE Scheda_Giocatore SHALL contenere le Statistiche_Tattiche previste per il Macro_Reparto del Giocatore secondo i criteri da 11 a 14, e SHALL omettere le Statistiche_Tattiche previste per gli altri Macro_Reparto.
11. WHERE il Macro_Reparto del Giocatore è Portieri, THE Scheda_Giocatore SHALL contenere parate, gol subiti, clean sheet e rigori parati, e SHALL omettere gol segnati e assist.
12. WHERE il Macro_Reparto del Giocatore è Difensori, THE Scheda_Giocatore SHALL contenere clean sheet della squadra, duelli difensivi vinti, contrasti e precisione dei passaggi.
13. WHERE il Macro_Reparto del Giocatore è Centrocampisti, THE Scheda_Giocatore SHALL contenere assist, passaggi chiave, precisione dei passaggi e tiri.
14. WHERE il Macro_Reparto del Giocatore è Attaccanti, THE Scheda_Giocatore SHALL contenere gol, tiri, tiri nello specchio e gol attesi.
15. WHERE il Modificatore_Difesa è attivo nella Configurazione_Asta e il Macro_Reparto del Giocatore è Difensori o Portieri, THE Scheda_Giocatore SHALL mostrare la media voto del Giocatore accompagnata da un'etichetta che ne indica la rilevanza per il Modificatore_Difesa.
16. IF il valore di una statistica è assente nello Snapshot_Dati, è contrassegnato come non disponibile oppure non è un valore numerico, THEN THE Sistema SHALL mostrare un'indicazione di dato non disponibile al posto del valore e SHALL non sostituire il valore assente con zero.
17. THE Scheda_Giocatore SHALL indicare, per ciascuna statistica mostrata, la stagione di riferimento; WHERE le statistiche mostrate provengono da più stagioni, THE Scheda_Giocatore SHALL indicare la stagione di riferimento separatamente per ciascuna statistica.
18. WHEN un Utente consulta una Scheda_Giocatore mentre è attiva una Sessione_Asta, THE Sistema SHALL registrare nella cronologia della Sessione_Asta l'Identificativo_Giocatore del Giocatore consultato e l'istante della consultazione, e SHALL mantenere tale registrazione per tutta la durata della Sessione_Asta.

### Requirement 6: Calcolo del prezzo massimo consigliato

**User Story:** Come allenatore, voglio sapere quanto al massimo mi conviene spendere per un giocatore adesso, così da non svuotare il budget e non perdere i giocatori che mi servono.

#### Acceptance Criteria

1. WHEN il Sistema mostra una Scheda_Giocatore all'interno di una Sessione_Asta, THE Motore_Valutazione SHALL calcolare e mostrare entro 1 secondo il Prezzo_Massimo_Consigliato come numero intero di crediti compreso tra 0 e il Budget_Residuo.
2. THE Motore_Valutazione SHALL calcolare il Prezzo_Massimo_Consigliato utilizzando come unici dati di ingresso il Budget_Residuo, il Budget_Reparto_Residuo, gli Slot_Residui del Reparto del Giocatore, la Quotazione del Giocatore, le Statistiche_Fantacalcio del Giocatore, la Riserva_Minima e i Pesi_Valutazione della Configurazione_Asta, senza dipendere da alcun altro dato della Sessione_Asta.
3. IF gli Slot_Residui del Reparto del Giocatore sono maggiori o uguali a 1 e la differenza tra Budget_Residuo e Riserva_Minima è maggiore o uguale a 1, THEN THE Motore_Valutazione SHALL produrre un Prezzo_Massimo_Consigliato intero maggiore o uguale a 1.
4. THE Motore_Valutazione SHALL produrre un Prezzo_Massimo_Consigliato minore o uguale al minore tra la differenza tra Budget_Residuo e Riserva_Minima e la differenza tra Budget_Reparto_Residuo e il numero di Slot_Residui del Reparto diminuito di 1.
5. WHEN il Motore_Valutazione mostra il Prezzo_Massimo_Consigliato, THE Sistema SHALL mostrare per ciascuno dei cinque fattori Budget_Residuo, Budget_Reparto_Residuo, Slot_Residui, Quotazione e Statistiche_Fantacalcio il valore utilizzato nel calcolo e il relativo contributo espresso in crediti o in percentuale.
6. IF gli Slot_Residui del Reparto del Giocatore sono pari a 0, THEN THE Motore_Valutazione SHALL mostrare come Prezzo_Massimo_Consigliato il valore 0 e indicare che il Reparto è completo, con precedenza su ogni altro limite inferiore previsto dai criteri 3 e 4.
7. IF gli Slot_Residui del Reparto del Giocatore sono maggiori o uguali a 1 e la differenza tra Budget_Residuo e Riserva_Minima è minore di 1, THEN THE Motore_Valutazione SHALL mostrare come Prezzo_Massimo_Consigliato il valore 1 e indicare che il budget consente solo acquisti al prezzo minimo.
8. WHEN l'Utente conferma una nuova quota percentuale di un Reparto o di un Macro_Reparto, THE Motore_Valutazione SHALL ricalcolare entro 1 secondo il Prezzo_Massimo_Consigliato della Scheda_Giocatore attualmente mostrata e di ogni Giocatore consultato successivamente sulla base della nuova quota.
9. THE Motore_Valutazione SHALL applicare i Pesi_Valutazione registrati nella Configurazione_Asta della Sessione_Asta corrente, mantenendoli invariati fino a una modifica esplicita dell'Utente secondo i criteri da 15 a 19 del Requisito 3.
10. WHERE i Pesi_Valutazione corrispondono alla preimpostazione del Profilo_Strategia `aggressivo`, THE Motore_Valutazione SHALL produrre per ogni Giocatore un Prezzo_Massimo_Consigliato maggiore o uguale a quello prodotto con i Pesi_Valutazione della preimpostazione del Profilo_Strategia `conservativo`, a parità di ogni altro dato della Sessione_Asta e comunque entro i limiti definiti dai criteri 3 e 4.
11. FOR ALL stati di Sessione_Asta e per ogni Giocatore, ripetere almeno 10 volte consecutive il calcolo del Prezzo_Massimo_Consigliato senza modificare Budget_Residuo, Budget_Reparto_Residuo, Slot_Residui, Quotazione, Statistiche_Fantacalcio, Riserva_Minima e Pesi_Valutazione SHALL produrre lo stesso valore intero.
12. FOR ALL coppie di Giocatori dello stesso Reparto con identiche Statistiche_Fantacalcio, valutate a parità di Budget_Residuo, Budget_Reparto_Residuo, Slot_Residui e Pesi_Valutazione, il Giocatore con Quotazione superiore SHALL ricevere un Prezzo_Massimo_Consigliato maggiore o uguale a quello dell'altro Giocatore.
13. IF le Statistiche_Fantacalcio del Giocatore non sono disponibili, THEN THE Motore_Valutazione SHALL calcolare il Prezzo_Massimo_Consigliato sui soli fattori disponibili e indicare nella Scheda_Giocatore che il valore è basato su dati incompleti.
14. IF la quota percentuale di un Reparto o di un Macro_Reparto inserita dall'Utente non è un intero compreso tra 0 e 100 oppure la somma delle quote percentuali è diversa da 100, THEN THE Sistema SHALL rifiutare la modifica, conservare le quote precedenti e mostrare un messaggio di errore che indica il vincolo violato.
15. WHEN l'Utente conferma una modifica dei Pesi_Valutazione, THE Motore_Valutazione SHALL ricalcolare entro 1 secondo il Prezzo_Massimo_Consigliato e l'Indice_Convenienza della Scheda_Giocatore attualmente mostrata e SHALL aggiornare la Dashboard_Asta entro 2 secondi.
16. WHERE la Modalita_Gioco è `mantra`, THE Motore_Valutazione SHALL utilizzare come Budget_Reparto_Residuo del criterio 2 il budget residuo del Macro_Reparto del ruolo del Giocatore e come Slot_Residui del criterio 2 gli slot residui del ruolo del Giocatore.

### Requirement 7: Registrazione degli acquisti e aggiornamento live dello stato

**User Story:** Come allenatore, voglio registrare ogni giocatore che acquisto con il prezzo pagato, così che budget, slot e consigli si aggiornino immediatamente.

#### Acceptance Criteria

1. WHEN un Utente registra l'acquisto di un Giocatore indicando un Prezzo_Acquisto intero compreso tra 1 e il Budget_Residuo corrente, THE Sistema SHALL aggiungere il Giocatore alla Rosa_Utente e aggiungere al Registro_Acquisti una voce che riporta il Giocatore, il suo Reparto, il Prezzo_Acquisto e l'assegnatario, entro 1 secondo dalla conferma dell'Utente.
2. WHEN il Sistema aggiorna Budget_Residuo, Budget_Reparto_Residuo o Slot_Residui, THE Sistema SHALL mostrare i nuovi valori in tutte le viste aperte della Sessione_Asta entro 1 secondo dall'aggiornamento, senza richiedere un ricaricamento della pagina.
3. IF il Prezzo_Acquisto indicato supera il Budget_Residuo corrente, THEN THE Sistema SHALL rifiutare la registrazione, lasciare invariati Rosa_Utente, Registro_Acquisti, Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui, e mostrare un messaggio di errore che indica il Prezzo_Acquisto rifiutato e il valore del Budget_Residuo disponibile.
4. IF il Prezzo_Acquisto indicato è minore di 1, non è un valore intero, oppure supera i crediti iniziali della Configurazione_Asta, THEN THE Sistema SHALL rifiutare la registrazione, lasciare invariati Rosa_Utente, Registro_Acquisti, Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui, e mostrare un messaggio di errore che indica l'intervallo ammesso, da 1 ai crediti iniziali della Configurazione_Asta.
5. IF gli Slot_Residui del Reparto del Giocatore sono pari a 0, THEN THE Sistema SHALL rifiutare la registrazione, lasciare invariati Rosa_Utente, Registro_Acquisti, Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui, e mostrare un messaggio di errore che indica il Reparto completo e il numero di slot previsti dalla Composizione_Rosa per quel Reparto.
6. IF il Giocatore è già presente nella Rosa_Utente o è già assegnato a un Avversario in una voce non annullata del Registro_Acquisti, THEN THE Sistema SHALL rifiutare la registrazione, conservare la voce esistente senza modificarla e mostrare un messaggio di errore che indica l'assegnatario corrente del Giocatore.
7. WHEN un Utente annulla una voce del Registro_Acquisti, THE Sistema SHALL rimuovere la voce, rimuovere il Giocatore dalla Rosa_Utente, incrementare Budget_Residuo e Budget_Reparto_Residuo del Reparto di quel Giocatore del Prezzo_Acquisto della voce annullata e incrementare di 1 gli Slot_Residui dello stesso Reparto, entro 1 secondo dalla conferma dell'Utente.
8. FOR ALL stati di Sessione_Asta, registrare un acquisto valido e poi annullarlo SHALL riportare Budget_Residuo, Budget_Reparto_Residuo, Slot_Residui e Rosa_Utente allo stato precedente alla registrazione.
9. FOR ALL stati di Sessione_Asta, la somma dei Prezzo_Acquisto delle voci non annullate del Registro_Acquisti attribuite all'Utente sommata al Budget_Residuo SHALL essere uguale ai crediti iniziali della Configurazione_Asta.
10. FOR ALL stati di Sessione_Asta, il numero di Giocatori di un Reparto nella Rosa_Utente SHALL essere minore o uguale agli slot previsti dalla Composizione_Rosa per quel Reparto.
11. WHEN un Utente modifica il Prezzo_Acquisto di una voce esistente del Registro_Acquisti indicando un valore intero compreso tra 1 e la somma del Budget_Residuo corrente e del Prezzo_Acquisto precedente della voce, THE Sistema SHALL applicare a Budget_Residuo e al Budget_Reparto_Residuo del Reparto del Giocatore la differenza tra Prezzo_Acquisto precedente e nuovo, lasciando invariati Slot_Residui e Rosa_Utente, entro 1 secondo dalla conferma dell'Utente.
12. THE Sistema SHALL persistere ogni voce del Registro_Acquisti aggiunta, modificata o annullata prima di confermare l'operazione all'Utente.
13. WHILE la stessa Sessione_Asta è aperta su due o più dispositivi, WHEN una voce del Registro_Acquisti viene aggiunta, modificata o annullata su uno dei dispositivi, THE Sistema SHALL propagare a tutti i dispositivi la voce e i valori aggiornati di Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui entro 2 secondi.
14. WHEN il Sistema aggiunge una voce al Registro_Acquisti, THE Sistema SHALL decrementare Budget_Residuo e Budget_Reparto_Residuo del Reparto del Giocatore di un valore pari al Prezzo_Acquisto e decrementare di 1 gli Slot_Residui dello stesso Reparto.
15. IF il nuovo Prezzo_Acquisto indicato per una voce esistente del Registro_Acquisti è minore di 1, non è un valore intero, oppure supera la somma del Budget_Residuo corrente e del Prezzo_Acquisto precedente della voce, THEN THE Sistema SHALL rifiutare la modifica, conservare il Prezzo_Acquisto precedente e i valori correnti di Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui, e mostrare un messaggio di errore che indica l'intervallo ammesso per la modifica.
16. IF la persistenza di una voce del Registro_Acquisti non si completa entro 5 secondi oppure termina con esito negativo, THEN THE Sistema SHALL annullare l'operazione, ripristinare Rosa_Utente, Registro_Acquisti, Budget_Residuo, Budget_Reparto_Residuo e Slot_Residui ai valori precedenti all'operazione e mostrare un messaggio di errore che indica il mancato salvataggio.

### Requirement 8: Disponibilità dei giocatori e annotazione degli acquisti altrui

**User Story:** Come allenatore, voglio sapere quali giocatori sono ancora svincolati annotando gli acquisti degli altri partecipanti, così da concentrare le mie scelte su chi è realmente ancora in gioco.

#### Acceptance Criteria

1. THE Sistema SHALL consentire all'Utente di contrassegnare un Giocatore dello Snapshot_Dati corrente come acquistato da altri, aggiungendo al Registro_Acquisti una voce che riporta l'Identificativo_Giocatore e, quando indicati dall'Utente, il nome dell'Avversario assegnatario e il Prezzo_Acquisto.
2. THE Sistema SHALL trattare il nome dell'Avversario e il Prezzo_Acquisto come informazioni facoltative della voce di cui al criterio 1 e SHALL accettare la voce anche quando entrambe sono assenti.
3. THE Sistema SHALL consentire all'Utente di definire, per ciascun Avversario della Sessione_Asta, un nome composto da 1 a 30 caratteri, univoco all'interno della Sessione_Asta, fino a un massimo di 19 Avversari oltre all'Utente.
4. IF l'Utente conferma per un Avversario un nome vuoto, di lunghezza superiore a 30 caratteri o già assegnato a un altro Avversario della stessa Sessione_Asta, THEN THE Sistema SHALL rifiutare l'operazione, SHALL mantenere invariato l'elenco degli Avversari e SHALL mostrare un messaggio di errore che indica il motivo del rifiuto.
5. WHERE l'Utente indica un Prezzo_Acquisto per una voce attribuita a un Avversario, THE Sistema SHALL accettare un valore intero compreso tra 1 e i Crediti_Residui_Stimati di quell'Avversario.
6. IF l'Utente indica per una voce attribuita a un Avversario un Prezzo_Acquisto non intero, inferiore a 1 oppure superiore ai Crediti_Residui_Stimati di quell'Avversario, oppure contrassegna un Giocatore già presente in una voce non annullata del Registro_Acquisti, THEN THE Sistema SHALL rifiutare l'operazione, SHALL mantenere invariato il Registro_Acquisti e SHALL mostrare un messaggio di errore che indica il motivo del rifiuto.
7. THE Sistema SHALL determinare l'insieme dei Giocatore_Disponibile di una Sessione_Asta come i Giocatori dello Snapshot_Dati corrente che non compaiono in alcuna voce non annullata del Registro_Acquisti di quella Sessione_Asta.
8. THE Sistema SHALL mostrare nella Dashboard_Asta e nella vista di ricerca l'indicazione che l'insieme dei Giocatore_Disponibile riflette esclusivamente le voci annotate dall'Utente e può differire dallo stato reale dell'asta.
9. IF un Giocatore acquistato nell'asta reale non compare in alcuna voce non annullata del Registro_Acquisti, THEN THE Sistema SHALL continuare a includerlo nell'insieme dei Giocatore_Disponibile e SHALL presentarlo come disponibile senza generare alcun messaggio di errore.
10. THE Dashboard_Asta e i risultati della ricerca SHALL includere, per impostazione predefinita, esclusivamente i Giocatore_Disponibile.
11. WHEN un Utente disattiva il filtro di disponibilità nella ricerca o nella Dashboard_Asta, THE Sistema SHALL includere entro 1 secondo anche i Giocatori presenti in voci non annullate del Registro_Acquisti, contrassegnandoli come non disponibili.
12. WHILE un Giocatore compare in una voce non annullata del Registro_Acquisti, THE Sistema SHALL mostrare nella Scheda_Giocatore il nome dell'assegnatario e il Prezzo_Acquisto registrati, SHALL mostrare un'indicazione di valore non annotato per ciascuna delle due informazioni facoltative assente, e SHALL omettere il Prezzo_Massimo_Consigliato.
13. WHEN un Utente annulla una voce del Registro_Acquisti attribuita a un Avversario, THE Sistema SHALL includere nuovamente il Giocatore nell'insieme dei Giocatore_Disponibile e SHALL aggiornare entro 1 secondo i crediti spesi e i Crediti_Residui_Stimati di quell'Avversario.
14. WHEN un Utente apre la vista degli Avversari, THE Sistema SHALL mostrare entro 1 secondo, per ciascun Avversario, i crediti spesi pari alla somma dei Prezzo_Acquisto annotati nelle sue voci non annullate del Registro_Acquisti, i Crediti_Residui_Stimati e il numero di Giocatori acquistati per ciascun Reparto.
15. FOR ALL Avversari per i quali l'Utente ha annotato almeno un Prezzo_Acquisto, in ogni istante, la somma dei Prezzo_Acquisto delle relative voci non annullate del Registro_Acquisti sommata ai Crediti_Residui_Stimati SHALL essere esattamente uguale ai crediti iniziali della Configurazione_Asta.

### Requirement 9: Avvisi e raccomandazioni contestuali

**User Story:** Come allenatore, voglio essere avvisato quando sto per fare una scelta incoerente con la mia rosa o col mio budget, così da evitare errori sotto pressione.

#### Acceptance Criteria

1. WHEN il Sistema mostra una Scheda_Giocatore all'interno di una Sessione_Asta oppure lo stato della Sessione_Asta cambia mentre la Scheda_Giocatore è visibile, THE Motore_Avvisi SHALL valutare ciascuna condizione di avviso definita dai criteri da 2 a 8 e generare al massimo un Avviso per ogni condizione soddisfatta, fino a un massimo di 8 Avvisi per Scheda_Giocatore, escludendo gli Avvisi di Livello_Avviso `informativo` quando l'Utente li ha disattivati per quella Sessione_Asta.
2. IF il Reparto del Giocatore consultato ha Slot_Residui pari a 0, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `critico` indicante il nome del Reparto e il fatto che gli slot previsti dalla Composizione_Rosa per quel Reparto sono già tutti occupati.
3. IF il Macro_Reparto del Giocatore consultato è Portieri e la Rosa_Utente contiene già almeno un Giocatore di Macro_Reparto Portieri con Prezzo_Acquisto maggiore o uguale al 5 percento dei crediti iniziali della Configurazione_Asta, arrotondato all'intero inferiore con valore minimo 1 credito, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `attenzione` indicante il nome e il Prezzo_Acquisto del Giocatore di Macro_Reparto Portieri già presente nella Rosa_Utente.
4. IF la Quotazione del Giocatore consultato è maggiore del Prezzo_Massimo_Consigliato, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `attenzione` indicante la differenza in crediti tra Quotazione e Prezzo_Massimo_Consigliato.
5. IF la Quotazione del Giocatore consultato è maggiore del Budget_Reparto_Residuo del Reparto del Giocatore consultato, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `attenzione` indicante il valore in crediti del Budget_Reparto_Residuo e la differenza in crediti rispetto alla Quotazione.
6. IF il Budget_Residuo diminuito della Quotazione del Giocatore consultato è minore della Riserva_Minima calcolata escludendo lo slot del Giocatore consultato, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `critico` indicante il numero di slot ancora da riempire e i crediti mancanti rispetto alla Riserva_Minima.
7. IF la Rosa_Utente contiene un numero di Giocatori appartenenti alla stessa squadra del Giocatore consultato maggiore o uguale a 3, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `informativo` indicante il nome della squadra e il numero di Giocatori di quella squadra già presenti nella Rosa_Utente.
8. WHERE il Modificatore_Difesa è attivo nella Configurazione_Asta, IF il Macro_Reparto del Giocatore consultato è Difensori e la Rosa_Utente contiene un numero di Giocatori di Macro_Reparto Difensori appartenenti alla squadra del Giocatore consultato compreso tra 1 e 3 inclusi, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `informativo` indicante il numero di Giocatori di Macro_Reparto Difensori di quella squadra già presenti nella Rosa_Utente e il numero mancante per raggiungere 4 Giocatori di Macro_Reparto Difensori della stessa squadra.
9. WHEN il Motore_Avvisi genera uno o più Avvisi per la stessa Scheda_Giocatore, THE Sistema SHALL mostrarli entro 500 millisecondi dalla visualizzazione della Scheda_Giocatore, ordinati per Livello_Avviso decrescente nella sequenza `critico`, `attenzione`, `informativo` e, a parità di Livello_Avviso, in ordine crescente del numero del criterio che li ha generati.
10. FOR ALL stati di Sessione_Asta e per ogni Giocatore, ripetere la valutazione degli Avvisi senza modificare lo stato della Sessione_Asta né l'impostazione di disattivazione degli Avvisi `informativo` SHALL produrre lo stesso insieme di Avvisi, con identici Livello_Avviso, identici valori numerici riportati e identico ordine di presentazione.
11. THE Sistema SHALL consentire all'Utente di disattivare e riattivare gli Avvisi di Livello_Avviso `informativo` di una Sessione_Asta, conservando l'impostazione scelta tra le riaperture della stessa Sessione_Asta e mantenendo sempre attivi gli Avvisi di Livello_Avviso `attenzione` e `critico`.
12. IF nessuna condizione di avviso applicabile è soddisfatta per la Scheda_Giocatore consultata, THEN THE Sistema SHALL mostrare l'area degli Avvisi priva di Avvisi, senza messaggi di errore e senza alterare gli altri contenuti della Scheda_Giocatore.
13. IF il Giocatore consultato compare in una voce non annullata del Registro_Acquisti e quindi non appartiene all'insieme dei Giocatore_Disponibile, THEN THE Motore_Avvisi SHALL omettere gli Avvisi la cui condizione dipende dal Prezzo_Massimo_Consigliato e generare gli Avvisi restanti la cui condizione è soddisfatta.
14. IF il Motore_Avvisi non completa la valutazione delle condizioni entro 500 millisecondi oppure i dati necessari alla valutazione non sono disponibili, THEN THE Sistema SHALL mostrare la Scheda_Giocatore con l'indicazione che gli Avvisi non sono disponibili per la consultazione corrente, senza modificare lo stato della Sessione_Asta.

### Requirement 10: Monitoraggio dello stato dell'asta

**User Story:** Come allenatore, voglio avere sempre sotto gli occhi budget, slot e composizione della mia rosa, così da orientare le prossime puntate.

#### Acceptance Criteria

1. WHILE una Sessione_Asta è aperta, THE Sistema SHALL mantenere visibili senza richiedere all'Utente alcuna azione di navigazione il Budget_Residuo, il numero totale di Slot_Residui e, per ciascun Reparto definito nella Configurazione_Asta, il Budget_Reparto_Residuo e gli Slot_Residui del Reparto, aggiornando tutti questi valori entro 1 secondo dalla registrazione di un nuovo Prezzo_Acquisto nel Registro_Acquisti.
2. WHEN un Utente apre la vista della Rosa_Utente, THE Sistema SHALL mostrare entro 2 secondi i Giocatori acquistati raggruppati per Reparto, indicando per ciascun Giocatore il nome e il Prezzo_Acquisto, e per ciascun Reparto il numero di Giocatori acquistati e gli Slot_Residui del Reparto.
3. WHEN un Utente apre la vista della Rosa_Utente, THE Sistema SHALL mostrare per ciascun Reparto la media aritmetica delle fantamedie, ricavate dalle Statistiche_Fantacalcio, dei Giocatori acquistati in quel Reparto, arrotondata a due cifre decimali.
4. WHEN il numero totale di Slot_Residui raggiunge 0, THE Sistema SHALL contrassegnare la Sessione_Asta come completata e mostrare il riepilogo finale della Rosa_Utente contenente, per ciascun Reparto, l'elenco dei Giocatori acquistati con il rispettivo Prezzo_Acquisto, la somma dei Prezzo_Acquisto del Reparto, la fantamedia media del Reparto e il Budget_Residuo complessivo.
5. WHEN un Utente richiede l'esportazione, THE Sistema SHALL produrre entro 5 secondi un file, in un formato di esportazione supportato dal Sistema, contenente la Configurazione_Asta della Sessione_Asta, tutti i Giocatori della Rosa_Utente con Reparto e Prezzo_Acquisto, e tutte le voci del Registro_Acquisti nel loro ordine cronologico di registrazione.
6. FOR ALL Rosa_Utente esportate, importare il file esportato in una nuova Sessione_Asta con la stessa Configurazione_Asta SHALL produrre una Rosa_Utente equivalente all'originale, dove l'equivalenza richiede: stesso insieme di Giocatori, stesso Prezzo_Acquisto per ogni Giocatore, stessa assegnazione dei Giocatori ai Reparto, stesso Budget_Residuo, stesso Budget_Reparto_Residuo per ciascun Reparto, stessi Slot_Residui e stesso ordine cronologico delle voci del Registro_Acquisti.
7. IF un Reparto non contiene alcun Giocatore acquistato, THEN THE Sistema SHALL mostrare per quel Reparto un indicatore esplicito di valore non disponibile al posto della fantamedia media, mantenendo visibili Budget_Reparto_Residuo e Slot_Residui del Reparto.
8. IF l'esportazione della Rosa_Utente e del Registro_Acquisti non si completa, THEN THE Sistema SHALL mostrare all'Utente un messaggio di errore che indica il mancato completamento dell'esportazione e SHALL lasciare invariati Rosa_Utente, Registro_Acquisti, Budget_Residuo e Slot_Residui.
9. IF il file da importare non è leggibile, è incompleto oppure contiene una Configurazione_Asta diversa da quella della Sessione_Asta di destinazione, THEN THE Sistema SHALL rifiutare l'importazione, mostrare un messaggio di errore che indica il motivo del rifiuto e lasciare la Sessione_Asta di destinazione nello stato precedente al tentativo di importazione.

### Requirement 11: Preparazione della strategia prima dell'asta

**User Story:** Come allenatore, voglio preparare in anticipo i miei obiettivi e le mie alternative, così da arrivare all'asta con un piano invece di improvvisare.

#### Acceptance Criteria

1. WHEN l'Utente aggiunge un Giocatore alla lista di obiettivi di una Sessione_Asta esistente, THE Sistema SHALL inserire il Giocatore nella lista come voce univoca e rendere la voce visibile all'Utente entro 2 secondi, fino a un massimo di 200 Giocatori per Sessione_Asta.
2. IF l'Utente aggiunge un Giocatore già presente nella lista di obiettivi della stessa Sessione_Asta, oppure la lista ha già raggiunto 200 Giocatori, oppure non esiste una Sessione_Asta associata, THEN THE Sistema SHALL rifiutare l'inserimento, mantenere la lista di obiettivi invariata e mostrare all'Utente un messaggio di errore che indica il motivo del rifiuto.
3. WHEN l'Utente assegna a un Giocatore della lista di obiettivi un prezzo massimo personale, THE Sistema SHALL accettare un valore intero in crediti compreso tra 1 e i crediti iniziali della Configurazione_Asta e memorizzarlo come valore corrente per quel Giocatore nella Sessione_Asta.
4. IF il prezzo massimo personale inserito non è un intero, è inferiore a 1 oppure superiore ai crediti iniziali della Configurazione_Asta, THEN THE Sistema SHALL rifiutare l'inserimento, conservare il valore precedentemente memorizzato o lo stato di valore non assegnato, e mostrare un messaggio di errore che indica l'intervallo ammesso.
5. WHERE un Giocatore consultato è presente nella lista di obiettivi, THE Scheda_Giocatore SHALL mostrare contemporaneamente il prezzo massimo personale in crediti e il Prezzo_Massimo_Consigliato in crediti; WHERE il prezzo massimo personale non è stato assegnato, THE Scheda_Giocatore SHALL mostrare l'indicazione esplicita di valore non assegnato al posto del prezzo massimo personale.
6. IF il prezzo massimo personale di un Giocatore supera il Prezzo_Massimo_Consigliato di almeno 1 credito, THEN THE Motore_Avvisi SHALL generare un Avviso di Livello_Avviso `informativo` che riporta lo scostamento in crediti e la relativa percentuale rispetto al Prezzo_Massimo_Consigliato, arrotondata all'intero.
7. WHEN un Giocatore della lista di obiettivi è contrassegnato come non disponibile, THE Sistema SHALL mantenere la voce nella lista di obiettivi, marcarla con un indicatore di "non raggiungibile" ed escluderla dai conteggi degli obiettivi ancora perseguibili per Reparto, entro 2 secondi dal contrassegno.
8. WHEN l'Utente assegna una priorità a un Giocatore della lista di obiettivi, THE Sistema SHALL accettare un valore intero compreso tra 1, priorità più alta, e 99, priorità più bassa, e considerare come priorità 99 ogni Giocatore privo di priorità assegnata.
9. WHEN l'Utente richiede l'ordinamento della lista di obiettivi per Reparto o per priorità assegnata, THE Sistema SHALL riordinare tutte le voci della lista secondo il criterio selezionato, applicando come criterio di parità l'ordine alfabetico crescente del nome del Giocatore, e mostrare l'esito entro 2 secondi.

### Requirement 12: Utilizzo in mobilità

**User Story:** Come allenatore, voglio usare la web-app dal telefono durante l'asta dal vivo, così da consultare i dati senza portare un computer.

#### Acceptance Criteria

1. THE Sistema SHALL rendere disponibili le funzioni di ricerca dei Giocatori, consultazione della Scheda_Giocatore e registrazione degli acquisti su viewport di larghezza compresa tra 360 e 1920 pixel CSS, senza scorrimento orizzontale della pagina, senza contenuto troncato o sovrapposto e con elementi interattivi di dimensione minima pari a 44x44 pixel CSS.
2. WHEN l'Utente apre la ricerca dei Giocatori, la Scheda_Giocatore o la registrazione di un acquisto su viewport di larghezza compresa tra 360 e 1920 pixel CSS, THE Sistema SHALL completare la visualizzazione dei dati richiesti entro 3 secondi in presenza di connessione di rete disponibile.
3. IF la connessione di rete non è disponibile durante la registrazione di un acquisto, THEN THE Sistema SHALL conservare l'operazione in una coda locale di massimo 50 operazioni, mantenerla per almeno 24 ore e ritentare l'invio al ripristino della connessione per un massimo di 5 tentativi a intervalli di almeno 10 secondi.
4. IF la coda locale contiene già 50 operazioni non inviate, THEN THE Sistema SHALL rifiutare la registrazione di ulteriori acquisti, mostrare un messaggio di errore indicante che la coda locale è piena e conservare invariate le operazioni già in coda.
5. WHILE la coda locale contiene almeno un'operazione non inviata, THE Sistema SHALL mostrare un indicatore di stato con il numero di operazioni in attesa di invio.
6. WHEN il Sistema completa l'invio di un'operazione conservata localmente, THE Sistema SHALL aggiornare l'interfaccia con lo stato confermato dal server entro 3 secondi e rimuovere l'operazione dalla coda locale.
7. IF tutti i 5 tentativi di invio di un'operazione conservata localmente terminano senza conferma dal server, THEN THE Sistema SHALL mantenere l'operazione nella coda locale, contrassegnarla come non inviata e mostrare un messaggio di errore indicante il mancato invio.
8. IF un'operazione conservata localmente entra in conflitto con lo stato registrato sul server per lo stesso Giocatore nella stessa Sessione_Asta, THEN THE Sistema SHALL mostrare entrambe le versioni in confronto, richiedere all'Utente quale versione conservare e mantenere invariati sia l'operazione locale sia il Registro_Acquisti fino alla scelta dell'Utente.
9. WHEN l'Utente seleziona la versione da conservare per un'operazione in conflitto, THE Sistema SHALL applicare la versione scelta al Registro_Acquisti, rimuovere l'operazione dalla coda locale e mostrare l'esito dell'operazione entro 3 secondi.

### Requirement 13: Dashboard iniziale dei giocatori consigliati

**User Story:** Come allenatore, all'apertura dell'asta voglio vedere subito i migliori giocatori per ruolo con un'indicazione di quanto conviene comprarli, così da orientarmi senza cercare nome per nome.

#### Acceptance Criteria

1. WHEN un Utente apre una propria Sessione_Asta e uno Snapshot_Dati è consultabile, THE Sistema SHALL mostrare la Dashboard_Asta entro 3 secondi, con una sezione distinta per ciascun Reparto definito nella Composizione_Rosa della Configurazione_Asta.
2. THE Dashboard_Asta SHALL elencare in ciascuna sezione al massimo 10 Giocatore_Disponibile del Reparto corrispondente, ordinati per Indice_Convenienza decrescente e, a parità di Indice_Convenienza, in ordine alfabetico crescente del nome del Giocatore.
3. THE Dashboard_Asta SHALL mostrare per ciascuna voce elencata il nome del Giocatore, la squadra, il ruolo, la Quotazione, il Prezzo_Massimo_Consigliato e l'Indice_Convenienza espresso come percentuale intera compresa tra 0 e 100 inclusi.
4. THE Motore_Valutazione SHALL calcolare l'Indice_Convenienza di un Giocatore utilizzando come unici dati di ingresso il Prezzo_Massimo_Consigliato del Giocatore, la Quotazione del Giocatore, le Statistiche_Fantacalcio del Giocatore, gli Slot_Residui del Reparto del Giocatore, il Budget_Reparto_Residuo del Reparto del Giocatore e i Pesi_Valutazione della Configurazione_Asta.
5. WHEN l'Utente seleziona una voce della Dashboard_Asta, THE Sistema SHALL mostrare la Scheda_Giocatore del Giocatore corrispondente entro 500 millisecondi dalla selezione.
6. WHEN una voce del Registro_Acquisti viene aggiunta, modificata o annullata, THE Sistema SHALL ricalcolare l'Indice_Convenienza dei Giocatore_Disponibile e riordinare le sezioni della Dashboard_Asta entro 2 secondi.
7. IF gli Slot_Residui di un Reparto sono pari a 0, THEN THE Sistema SHALL contrassegnare la sezione corrispondente della Dashboard_Asta come completa e SHALL mostrare per ciascun Giocatore di quella sezione un Indice_Convenienza pari a 0.
8. IF nessuno Snapshot_Dati è consultabile, THEN THE Dashboard_Asta SHALL mostrare lo Stato_Freschezza e l'indicazione che i dati dei Giocatori non sono ancora disponibili, senza sezioni di Giocatori e senza messaggi di errore.
9. THE Dashboard_Asta SHALL consentire all'Utente di filtrare le voci per Reparto, per squadra e per intervallo di Quotazione, accettando come estremi dell'intervallo valori interi compresi tra 1 e 999 inclusi.
10. THE Dashboard_Asta SHALL consentire all'Utente di includere o escludere i Giocatori che non appartengono all'insieme dei Giocatore_Disponibile, applicando l'esclusione per impostazione predefinita.
11. WHEN l'Utente applica o modifica un filtro della Dashboard_Asta, THE Sistema SHALL mostrare l'elenco aggiornato entro 1 secondo.
12. FOR ALL stati di Sessione_Asta e per ogni Giocatore, ripetere almeno 10 volte consecutive il calcolo dell'Indice_Convenienza senza modificare Prezzo_Massimo_Consigliato, Quotazione, Statistiche_Fantacalcio, Slot_Residui, Budget_Reparto_Residuo e Pesi_Valutazione SHALL produrre lo stesso valore intero.
13. FOR ALL stati di Sessione_Asta e per ogni Giocatore, l'Indice_Convenienza SHALL essere un valore intero compreso tra 0 e 100 inclusi.
14. FOR ALL coppie di voci consecutive all'interno di una sezione della Dashboard_Asta, l'Indice_Convenienza della voce precedente SHALL essere maggiore o uguale all'Indice_Convenienza della voce successiva.

## Proprietà di Correttezza

Le seguenti proprietà sono verificabili con test basati su proprietà e sono già espresse come criteri di accettazione nei requisiti indicati.

| # | Proprietà | Tipo | Requisito |
|---|-----------|------|-----------|
| P1 | `deserializza(serializza(snapshot)) == snapshot` | Round-trip | 4.19 |
| P2 | `normalizza(serializza(normalizza(risposta))) == normalizza(risposta)` | Round-trip | 4.20 |
| P3 | `somma(prezzi_rosa) + budget_residuo == crediti_iniziali` | Invariante | 7.9 |
| P4 | `giocatori_reparto <= slot_reparto` per ogni Reparto | Invariante | 7.10 |
| P5 | `annulla(registra(stato, acquisto)) == stato` | Round-trip | 7.8 |
| P6 | `valuta(stato, giocatore) == valuta(stato, giocatore)` a stato invariato | Idempotenza / determinismo | 6.11 |
| P7 | `1 <= prezzo_consigliato <= budget_residuo - riserva_minima` | Invariante | 6.3, 6.4 |
| P8 | `prezzo_consigliato_aggressivo >= prezzo_consigliato_conservativo` | Metamorfica | 6.10 |
| P9 | A parità di Statistiche_Fantacalcio, Quotazione maggiore implica Prezzo_Massimo_Consigliato maggiore o uguale | Metamorfica | 6.12 |
| P10 | `avvisi(stato, giocatore) == avvisi(stato, giocatore)` a stato invariato | Idempotenza / determinismo | 9.10 |
| P11 | `somma(prezzi_avversario) + crediti_residui_stimati == crediti_iniziali` per gli Avversari con almeno un Prezzo_Acquisto annotato | Invariante | 8.15 |
| P12 | `importa(esporta(rosa)) == rosa` | Round-trip | 10.6 |
| P13 | Una risposta di Sorgente_Dati non valida produce sempre un rifiuto descrittivo e conserva l'ultimo Snapshot_Dati valido, mai uno Snapshot_Dati parziale | Condizioni di errore | 4.9, 4.10, 4.11 |
| P14 | `convenienza(stato, giocatore) == convenienza(stato, giocatore)` a stato invariato | Idempotenza / determinismo | 13.12 |
| P15 | `0 <= indice_convenienza <= 100` | Invariante | 13.13 |
| P16 | All'interno di una sezione della Dashboard_Asta, l'ordinamento è coerente con l'Indice_Convenienza decrescente | Invariante | 13.14 |
| P17 | A parità di ogni altro dato, variare il solo Tipo_Asta non modifica Prezzo_Massimo_Consigliato, Indice_Convenienza né l'insieme degli Avvisi | Metamorfica | 3.14 |

Le seguenti verifiche non sono adatte a test basati su proprietà e vanno coperte con test di integrazione su 1-3 esempi rappresentativi: autenticazione e gestione della sessione (Requisito 1), controllo di accesso alle Sessione_Asta (1.10, 1.11), pianificazione dell'acquisizione automatica e rispetto dei limiti di frequenza delle Sorgente_Dati (4.1, 4.3, 4.7, 4.8), presentazione dello Stato_Freschezza (4.13, 4.14), propagazione multi-dispositivo (7.13), comportamento offline e risoluzione dei conflitti (Requisito 12), rendering responsive (12.1), percorsi di errore su esportazione e importazione della Rosa_Utente (10.8, 10.9).

## Appendice A: Decisioni

### A. Decisioni chiuse

Le voci seguenti sono state decise e sono già recepite nei requisiti.

**A1. Sorgente dei dati.** Nessun caricamento manuale di file. Il Sistema acquisisce i dati automaticamente dal web, lato server: il Listone (ruoli, squadre, Quotazione) dalla Sorgente_Listone e le statistiche dei Giocatori dalla Sorgente_Statistiche, tramite integrazione con un servizio esterno. Recepita nel Requisito 4.

**A2. Dashboard iniziale.** Appena i dati sono disponibili e l'asta sta iniziando, l'Utente vede una Dashboard_Asta con i migliori Giocatori per ciascun Reparto e, per ciascuno, un Indice_Convenienza espresso in percentuale. La selezione di una voce apre la Scheda_Giocatore. Recepita nel Requisito 13.

**A3. Isolamento tra utenti.** Ogni account accede esclusivamente alle proprie Sessione_Asta e non vede alcun dato delle sessioni di altri Utenti: nessuna sessione condivisa, nessun invito, nessun ruolo. Il Sistema calcola l'insieme dei Giocatore_Disponibile dalle sole annotazioni dell'Utente; se un acquisto reale non viene annotato, il Giocatore resta considerato disponibile e questo scostamento è accettato. Recepita nei Requisiti 1 e 8.

**A4. Pesi della formula.** I Pesi_Valutazione hanno valori predefiniti forniti dal Sistema e sono calibrabili dall'Utente nella Configurazione_Asta, con il Profilo_Strategia come preimpostazione. Recepita nei Requisiti 3 e 6.

**A5. Tipo d'asta.** Il Tipo_Asta è registrato nella Configurazione_Asta a fini documentali e non influenza alcuna funzionalità del Sistema. Recepita nei criteri 3.13 e 3.14.

**A6. Modalità di gioco.** Entrambe le Modalita_Gioco, `classic` e `mantra`, sono supportate nella prima versione, con i ruoli `mantra` riconducibili ai quattro Macro_Reparto. Recepita nei Requisiti 3, 5, 6 e 9.

### B. Decisioni ancora aperte

Le voci seguenti restano da chiudere prima o durante la fase di design.

**B1. Scelta dei provider.** Va scelto il provider concreto per la Sorgente_Listone e per la Sorgente_Statistiche, valutando vincoli di licenza, condizioni d'uso, affidabilità e costo. Le quotazioni e il listone ufficiale sono pubblicati senza API pubblica documentata; le statistiche avanzate (gol attesi, passaggi chiave, contrasti, duelli difensivi, precisione dei passaggi) sono disponibili solo tramite provider terzi commerciali o community. I due canali hanno licenze e affidabilità diverse.

**B2. Statistiche tattiche effettivamente disponibili.** L'elenco delle Statistiche_Tattiche dei criteri da 5.11 a 5.14 va confermato contro il provider scelto in B1. Le statistiche non fornite dal provider attivo sono contrassegnate come non disponibili secondo il criterio 4.12, ma va deciso se l'insieme residuo è sufficiente per ciascun Macro_Reparto.

**B3. Legittimità dell'acquisizione automatica.** Va verificata la conformità dell'acquisizione automatica alle condizioni d'uso delle sorgenti pubbliche e va definito un piano di ripiego per il caso in cui una sorgente diventi inaccessibile o vieti l'accesso automatizzato.

**B4. Frequenza di aggiornamento e costo delle chiamate.** La soglia di almeno un tentativo ogni 24 ore per canale (criterio 4.3) va confermata rispetto al costo delle chiamate e ai limiti di frequenza del provider scelto.

**B5. Formula dell'Indice_Convenienza e pesi predefiniti.** I criteri 6.2 e 13.4 elencano i fattori senza fissarne la combinazione. Vanno definiti la formula e i valori predefiniti dei Pesi_Valutazione, comprese le preimpostazioni dei due Profilo_Strategia.

**B6. Stagioni multiple e indicatore di tendenza.** I requisiti attuali si riferiscono a una singola stagione di riferimento. Va deciso se mostrare più stagioni con un indicatore di tendenza e se il Motore_Valutazione deve tenerne conto.

**B7. Analisi a posteriori delle aste concluse.** Il criterio 5.18 registra le consultazioni e il criterio 10.4 completa la Sessione_Asta. Va deciso se il Sistema offre un'analisi a posteriori dell'asta conclusa e se i prezzi effettivi registrati alimentano le valutazioni delle aste successive.

**B8. Regole di lega non standard.** I criteri 3.3 e 3.4 fissano intervalli ampi. Va confermato se servono regole meno comuni, ad esempio rose asimmetriche, panchine estese o svincolati a prezzo fisso.

**B9. Soglie non funzionali e concorrenza.** Le soglie temporali proposte (300 ms, 500 ms, 1 s, 2 s, 3 s nei criteri 5.3, 5.7, 7.2, 7.13, 13.1, 13.5, 13.6, 13.11) vanno confermate o riviste, insieme al numero di Utenti concorrenti previsto e alla dimensione massima dello Snapshot_Dati.
