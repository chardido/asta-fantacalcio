import type {
  ConfigurazioneAsta,
  Reparto,
  StatFantacalcio,
  StatTattiche,
  VoceRegistro,
} from "@asta/contracts";

export interface UtentePersistito {
  readonly id: string;
  readonly emailNormalizzata: string;
  readonly emailVisualizzata: string;
  readonly passwordHash: string;
  readonly creatoIl: Date;
}

export interface NuovoUtente {
  readonly emailNormalizzata: string;
  readonly emailVisualizzata: string;
  readonly passwordHash: string;
}

export interface SessioneAuthPersistita {
  readonly id: string;
  readonly utenteId: string;
  readonly tokenHash: string;
  readonly creatoIl: Date;
  readonly ultimaAttivitaIl: Date;
  readonly scadeIlAssoluto: Date;
  readonly revocataIl: Date | null;
}

export interface NuovaSessioneAuth {
  readonly utenteId: string;
  readonly tokenHash: string;
  readonly ultimaAttivitaIl: Date;
  readonly scadeIlAssoluto: Date;
}

export type StatoSessioneAsta = "in_corso" | "completata";

export interface SessioneAstaPersistita {
  readonly id: string;
  readonly utenteId: string;
  readonly stagioneListone: string;
  readonly stato: StatoSessioneAsta;
  readonly configurazione: ConfigurazioneAsta;
  readonly avvisiInformativiAttivi: boolean;
  readonly creatoIl: Date;
  readonly aggiornatoIl: Date;
}

export interface NuovaSessioneAsta {
  readonly utenteId: string;
  readonly stagioneListone: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato?: StatoSessioneAsta;
  readonly avvisiInformativiAttivi?: boolean;
}

export interface AvversarioPersistito {
  readonly id: string;
  readonly sessioneAstaId: string;
  readonly nome: string;
  readonly creatoIl: Date;
  readonly aggiornatoIl: Date;
}

export interface ObiettivoPersistito {
  readonly id: string;
  readonly sessioneAstaId: string;
  readonly identificativoGiocatore: string;
  readonly nomeGiocatore: string;
  readonly reparto: Reparto;
  readonly prezzoMassimoPersonale: number | null;
  readonly priorita: number;
  readonly nonRaggiungibile: boolean;
  readonly creatoIl: Date;
  readonly aggiornatoIl: Date;
}

export interface NuovoObiettivo {
  readonly sessioneAstaId: string;
  readonly identificativoGiocatore: string;
  readonly nomeGiocatore: string;
  readonly reparto: Reparto;
  readonly prezzoMassimoPersonale?: number | null;
  readonly priorita?: number;
  readonly nonRaggiungibile?: boolean;
}

export type EsitoCreazioneObiettivo =
  | Readonly<{ ok: true; obiettivo: ObiettivoPersistito }>
  | Readonly<{
      ok: false;
      motivo: "obiettivo_duplicato" | "limite_obiettivi";
    }>;

export type StatoSnapshot = "in_costruzione" | "consultabile" | "superato";

export interface GiocatoreSnapshotPersistito {
  readonly snapshotId: string;
  readonly identificativoGiocatore: string;
  readonly nome: string;
  readonly nomeRicerca: string;
  readonly squadra: string;
  readonly ruoloClassic: "P" | "D" | "C" | "A" | null;
  readonly ruoliMantra: readonly Reparto[];
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio;
  readonly statTattiche: StatTattiche;
}

export interface SnapshotPersistito {
  readonly id: string;
  readonly stagioneListone: string;
  readonly stagioneStatistiche: string;
  readonly stato: StatoSnapshot;
  readonly creatoIl: Date;
  readonly numGiocatori: number;
  readonly nomeSorgenteListone: string;
  readonly nomeSorgenteStatistiche: string;
  readonly hashContenuto: string;
  readonly giocatori: readonly GiocatoreSnapshotPersistito[];
}

export interface NuovoSnapshot {
  readonly stagioneListone: string;
  readonly stagioneStatistiche: string;
  readonly stato?: StatoSnapshot;
  readonly numGiocatori: number;
  readonly nomeSorgenteListone: string;
  readonly nomeSorgenteStatistiche: string;
  readonly hashContenuto: string;
}

export type EsitoIngestione =
  | "successo"
  | "errore"
  | "limite_frequenza"
  | "timeout"
  | "dati_non_validi";

export interface StatoFreschezzaPersistito {
  readonly nomeSorgente: string;
  readonly stagione: string;
  readonly ultimoSuccessoIl: Date | null;
  readonly ultimoTentativoIl: Date;
  readonly ultimoEsito: EsitoIngestione;
  readonly dettaglioErrore: string | null;
  readonly numGiocatoriAcquisiti: number | null;
  readonly budgetToken: number;
  readonly prossimoTentativoNonPrimaDi: Date | null;
  readonly aggiornatoIl: Date;
}

export interface StatoFreschezzaDaSalvare {
  readonly nomeSorgente: string;
  readonly stagione: string;
  readonly ultimoSuccessoIl?: Date | null;
  readonly ultimoTentativoIl: Date;
  readonly ultimoEsito: EsitoIngestione;
  readonly dettaglioErrore?: string | null;
  readonly numGiocatoriAcquisiti?: number | null;
  readonly budgetToken: number;
  readonly prossimoTentativoNonPrimaDi?: Date | null;
}

export interface TentativoIngestioneDaRegistrare {
  readonly nomeSorgente: string;
  readonly stagione: string;
  readonly iniziatoIl: Date;
  readonly terminatoIl: Date;
  readonly esito: EsitoIngestione;
  readonly numGiocatoriAcquisiti: number | null;
  readonly dettaglioErrore: string | null;
}

export type AcquisizioneRiuscita = TentativoIngestioneDaRegistrare & {
  readonly esito: "successo";
  readonly numGiocatoriAcquisiti: number;
  readonly dettaglioErrore: null;
};

export interface PubblicazioneSnapshotAtomica {
  readonly snapshot: NuovoSnapshot;
  readonly giocatori: readonly Omit<GiocatoreSnapshotPersistito, "snapshotId">[];
  readonly pubblicatoIl: Date;
  readonly acquisizioni: readonly AcquisizioneRiuscita[];
}

export interface LockIngestioneDaAcquisire {
  readonly chiave: string;
  readonly proprietario: string;
  readonly acquisitoIl: Date;
  readonly scadeIl: Date;
}

export interface RepositoryUtenti {
  crea(input: NuovoUtente): Promise<UtentePersistito>;
  trovaPerId(id: string): Promise<UtentePersistito | null>;
  trovaPerEmailNormalizzata(email: string): Promise<UtentePersistito | null>;
}

export interface RepositorySessioniAuth {
  crea(input: NuovaSessioneAuth): Promise<SessioneAuthPersistita>;
  trovaPerTokenHash(tokenHash: string): Promise<SessioneAuthPersistita | null>;
  aggiornaUltimaAttivita(id: string, istante: Date): Promise<SessioneAuthPersistita>;
  aggiornaUltimaAttivitaSePrecedenteA(
    id: string,
    soglia: Date,
    istante: Date,
  ): Promise<boolean>;
  revoca(id: string, istante: Date): Promise<SessioneAuthPersistita>;
}

export type MotivoCreazioneSessioneAstaNonEseguita =
  | "limite_sessioni"
  | "nome_duplicato";

export type EsitoCreazioneSessioneAsta =
  | Readonly<{ ok: true; sessione: SessioneAstaPersistita }>
  | Readonly<{
      ok: false;
      motivo: MotivoCreazioneSessioneAstaNonEseguita;
    }>;

export interface RepositorySessioniAsta {
  crea(input: NuovaSessioneAsta): Promise<SessioneAstaPersistita>;
  creaEntroLimite(
    input: NuovaSessioneAsta,
    limite: number,
    nomiCandidati: readonly string[],
  ): Promise<EsitoCreazioneSessioneAsta>;
  trovaPerId(id: string): Promise<SessioneAstaPersistita | null>;
  elencaPerUtente(utenteId: string): Promise<readonly SessioneAstaPersistita[]>;
  aggiornaConfigurazione(id: string, configurazione: ConfigurazioneAsta): Promise<SessioneAstaPersistita>;
  elimina(id: string): Promise<void>;
}

export interface RepositoryRegistro {
  crea(voce: VoceRegistro): Promise<VoceRegistro>;
  trovaPerId(id: string): Promise<VoceRegistro | null>;
  trovaAttivaPerGiocatore(
    sessioneAstaId: string,
    identificativoGiocatore: string,
  ): Promise<VoceRegistro | null>;
  elencaPerSessione(sessioneAstaId: string): Promise<readonly VoceRegistro[]>;
  aggiornaPrezzo(id: string, prezzoAcquisto: number | null): Promise<VoceRegistro>;
  annulla(id: string, istante: Date): Promise<VoceRegistro>;
}

type VoceRegistroSenzaAvversarioId = VoceRegistro extends infer Voce
  ? Voce extends VoceRegistro
    ? Omit<Voce, "avversarioId">
    : never
  : never;

export type VoceRegistroDaImportare = VoceRegistroSenzaAvversarioId & {
  /** Nome portabile risolto o creato atomicamente nella sessione destinazione. */
  readonly avversarioNome: string | null;
};

export interface RegistroTransazionale extends RepositoryRegistro {
  /** Accoda una notifica PostgreSQL consegnata soltanto al commit. */
  notificaMutazione(ordinale: number): Promise<void>;
  /**
   * Sostituisce registro e avversari della sessione con il contenuto importato.
   * Tutte le cancellazioni e creazioni appartengono alla transazione corrente.
   */
  sostituisciDaImportazione(
    voci: readonly VoceRegistroDaImportare[],
  ): Promise<readonly VoceRegistro[]>;
}

/**
 * Esegue una mutazione del registro sotto lock della sessione. La Promise si
 * risolve soltanto dopo il commit; un rifiuto implica il rollback completo.
 */
export interface GestoreTransazioniRegistro {
  esegui<T>(
    sessioneAstaId: string,
    operazione: (registro: RegistroTransazionale) => Promise<T>,
    timeoutMs: number,
  ): Promise<T>;
}

export type EsitoCreazioneAvversario =
  | Readonly<{ ok: true; avversario: AvversarioPersistito }>
  | Readonly<{
      ok: false;
      motivo: "limite_avversari" | "nome_duplicato";
    }>;

export interface RepositoryAvversari {
  crea(sessioneAstaId: string, nome: string): Promise<AvversarioPersistito>;
  creaEntroLimite(
    sessioneAstaId: string,
    nome: string,
    limite: number,
  ): Promise<EsitoCreazioneAvversario>;
  trovaPerId(id: string): Promise<AvversarioPersistito | null>;
  elencaPerSessione(sessioneAstaId: string): Promise<readonly AvversarioPersistito[]>;
  rinomina(id: string, nome: string): Promise<AvversarioPersistito>;
  elimina(id: string): Promise<void>;
}

export interface RepositoryObiettivi {
  crea(input: NuovoObiettivo): Promise<ObiettivoPersistito>;
  creaEntroLimite(
    input: NuovoObiettivo,
    limite: number,
  ): Promise<EsitoCreazioneObiettivo>;
  elencaPerSessione(sessioneAstaId: string): Promise<readonly ObiettivoPersistito[]>;
  aggiorna(id: string, input: Partial<Pick<ObiettivoPersistito, "prezzoMassimoPersonale" | "priorita" | "nonRaggiungibile">>): Promise<ObiettivoPersistito>;
  elimina(id: string): Promise<void>;
}

export interface ConsultazioneSchedaPersistita {
  readonly id: string;
  readonly sessioneAstaId: string;
  readonly identificativoGiocatore: string;
  readonly istante: Date;
}

export interface NuovaConsultazioneScheda {
  readonly sessioneAstaId: string;
  readonly identificativoGiocatore: string;
  readonly istante: Date;
}

export interface RepositoryConsultazioniScheda {
  registra(
    input: NuovaConsultazioneScheda,
  ): Promise<ConsultazioneSchedaPersistita>;
}

export interface RepositorySnapshot {
  crea(input: NuovoSnapshot): Promise<SnapshotPersistito>;
  aggiungiGiocatori(snapshotId: string, giocatori: readonly Omit<GiocatoreSnapshotPersistito, "snapshotId">[]): Promise<void>;
  trovaPerId(id: string): Promise<SnapshotPersistito | null>;
  trovaPubblicato(stagioneListone: string): Promise<SnapshotPersistito | null>;
  pubblica(stagioneListone: string, snapshotId: string, pubblicatoIl: Date): Promise<void>;
}

export interface StatoLimitazioneFrequenzaDaSalvare {
  readonly nomeSorgente: string;
  readonly stagione: string;
  readonly budgetToken: number;
  readonly prossimoTentativoNonPrimaDi: Date | null;
  /** Istante usato come base persistente per la successiva ricarica del bucket. */
  readonly aggiornatoIl: Date;
}

export interface RepositoryFreschezza {
  trova(nomeSorgente: string, stagione: string): Promise<StatoFreschezzaPersistito | null>;
  salva(input: StatoFreschezzaDaSalvare): Promise<StatoFreschezzaPersistito>;
  /** Aggiorna soltanto i campi del limitatore, senza sovrascrivere l'esito di ingestione. */
  salvaLimitazione(
    input: StatoLimitazioneFrequenzaDaSalvare,
  ): Promise<StatoFreschezzaPersistito>;
}

/** Confine transazionale del worker: lock, tentativi e pubblicazione completa. */
export interface RepositoryIngestione {
  acquisisciLock(input: LockIngestioneDaAcquisire): Promise<boolean>;
  rilasciaLock(chiave: string, proprietario: string): Promise<void>;
  registraTentativo(
    input: TentativoIngestioneDaRegistrare,
  ): Promise<StatoFreschezzaPersistito>;
  pubblicaSnapshot(
    input: PubblicazioneSnapshotAtomica,
  ): Promise<SnapshotPersistito>;
}

export interface AliasGiocatorePersistito {
  readonly id: string;
  readonly nomeSorgente: string;
  readonly identificativoSorgente: string;
  readonly nomeNormalizzato: string;
  readonly squadraNormalizzata: string;
  readonly identificativoGiocatore: string | null;
  readonly creatoIl: Date;
  readonly aggiornatoIl: Date;
}

export interface AliasGiocatoreDaSalvare {
  readonly nomeSorgente: string;
  readonly identificativoSorgente: string;
  readonly nomeNormalizzato: string;
  readonly squadraNormalizzata: string;
  readonly identificativoGiocatore: string | null;
}

/** Persistenza degli accoppiamenti fra identificativi del provider e listone. */
export interface RepositoryAliasGiocatori {
  elencaPerSorgente(
    nomeSorgente: string,
  ): Promise<readonly AliasGiocatorePersistito[]>;
  salva(input: AliasGiocatoreDaSalvare): Promise<AliasGiocatorePersistito>;
}

export interface Repositories {
  readonly utenti: RepositoryUtenti;
  readonly sessioniAuth: RepositorySessioniAuth;
  readonly sessioniAsta: RepositorySessioniAsta;
  readonly registro: RepositoryRegistro;
  readonly transazioniRegistro: GestoreTransazioniRegistro;
  readonly avversari: RepositoryAvversari;
  readonly obiettivi: RepositoryObiettivi;
  readonly consultazioniScheda: RepositoryConsultazioniScheda;
  readonly snapshot: RepositorySnapshot;
  readonly freschezza: RepositoryFreschezza;
  readonly ingestione: RepositoryIngestione;
  readonly aliasGiocatori: RepositoryAliasGiocatori;
}
