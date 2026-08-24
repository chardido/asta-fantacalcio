import type {
  Reparto,
  StatFantacalcio,
  StatTattiche,
} from "@asta/contracts";
import type {
  RepositoryAvversari,
  RepositoryConsultazioniScheda,
  RepositoryObiettivi,
  RepositoryRegistro,
  RepositorySnapshot,
  SessioneAstaPersistita,
} from "@asta/db";

export type ErroreConsultazioneSnapshotCodice =
  | "snapshot_non_disponibile"
  | "giocatore_non_disponibile";

export class ErroreConsultazioneSnapshot extends Error {
  override readonly name = "ErroreConsultazioneSnapshot";

  constructor(
    readonly status: 404 | 503,
    readonly codice: ErroreConsultazioneSnapshotCodice,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

export interface VoceIndiceRicerca {
  readonly id: string;
  readonly nome: string;
  readonly nomeRicerca: string;
  readonly squadra: string;
  readonly ruoli: readonly Reparto[];
  readonly quotazione: number;
}

export interface IndiceRicercaSnapshot {
  readonly snapshotId: string;
  readonly hashContenuto: string;
  readonly giocatori: readonly VoceIndiceRicerca[];
}

export interface VoceDashboardSnapshot {
  readonly id: string;
  readonly nome: string;
  readonly squadra: string;
  readonly ruoli: readonly Reparto[];
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio;
}

export interface DatiDashboardSnapshot {
  readonly snapshotId: string;
  readonly hashContenuto: string;
  readonly giocatori: readonly VoceDashboardSnapshot[];
}

type StatisticaConStagione = Readonly<{
  valore: number | null;
  stagione: string;
}>;

export type StatisticheFantacalcioScheda = Readonly<{
  mediaVotoMilli: StatisticaConStagione;
  fantamediaMilli: StatisticaConStagione;
  presenze: StatisticaConStagione;
  gol: StatisticaConStagione;
  assist: StatisticaConStagione;
  ammonizioni: StatisticaConStagione;
  espulsioni: StatisticaConStagione;
  rigoriParati: StatisticaConStagione;
  rigoriSbagliati: StatisticaConStagione;
  autogol: StatisticaConStagione;
}>;

export type StatisticheTatticheScheda =
  | Readonly<{
      macroReparto: "POR";
      parate: StatisticaConStagione;
      golSubiti: StatisticaConStagione;
      cleanSheet: StatisticaConStagione;
      rigoriParati: StatisticaConStagione;
    }>
  | Readonly<{
      macroReparto: "DIF";
      cleanSheetSquadra: StatisticaConStagione;
      duelliDifensiviVinti: StatisticaConStagione;
      contrasti: StatisticaConStagione;
      precisionePassaggiMilli: StatisticaConStagione;
    }>
  | Readonly<{
      macroReparto: "CEN";
      assist: StatisticaConStagione;
      passaggiChiave: StatisticaConStagione;
      precisionePassaggiMilli: StatisticaConStagione;
      tiri: StatisticaConStagione;
    }>
  | Readonly<{
      macroReparto: "ATT";
      gol: StatisticaConStagione;
      tiri: StatisticaConStagione;
      tiriNelloSpecchio: StatisticaConStagione;
      golAttesiMilli: StatisticaConStagione;
    }>;

export interface SchedaGiocatoreSnapshot {
  readonly snapshotId: string;
  readonly hashContenuto: string;
  readonly giocatore: Readonly<{
    id: string;
    nome: string;
    squadra: string;
    ruoloClassic: "P" | "D" | "C" | "A" | null;
    ruoliMantra: readonly Reparto[];
    quotazione: number;
    statisticheFantacalcio: StatisticheFantacalcioScheda;
    statisticheTattiche: StatisticheTatticheScheda;
  }>;
  readonly prezzoMassimoPersonale: number | null;
  readonly inListaObiettivi: boolean;
  readonly assegnazione: Readonly<{
    tipo: "utente" | "avversario";
    nome: string | null;
    prezzoAcquisto: number | null;
  }> | null;
}

export interface DipendenzeConsultazioneSnapshot {
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
  readonly snapshot: Pick<RepositorySnapshot, "trovaPubblicato">;
  readonly registro: Pick<RepositoryRegistro, "trovaAttivaPerGiocatore">;
  readonly obiettivi: Pick<RepositoryObiettivi, "elencaPerSessione">;
  readonly avversari: Pick<RepositoryAvversari, "trovaPerId">;
  readonly consultazioniScheda: Pick<
    RepositoryConsultazioniScheda,
    "registra"
  >;
  readonly ora: () => Date;
}

function conStagione(
  valore: number | null,
  stagione: string,
): StatisticaConStagione {
  return { valore, stagione };
}

function mappaStatFantacalcio(
  statistiche: StatFantacalcio,
): StatisticheFantacalcioScheda {
  const stagione = statistiche.stagione;
  return {
    mediaVotoMilli: conStagione(statistiche.mediaVotoMilli, stagione),
    fantamediaMilli: conStagione(statistiche.fantamediaMilli, stagione),
    presenze: conStagione(statistiche.presenze, stagione),
    gol: conStagione(statistiche.gol, stagione),
    assist: conStagione(statistiche.assist, stagione),
    ammonizioni: conStagione(statistiche.ammonizioni, stagione),
    espulsioni: conStagione(statistiche.espulsioni, stagione),
    rigoriParati: conStagione(statistiche.rigoriParati, stagione),
    rigoriSbagliati: conStagione(statistiche.rigoriSbagliati, stagione),
    autogol: conStagione(statistiche.autogol, stagione),
  };
}

function mappaStatTattiche(
  statistiche: StatTattiche,
): StatisticheTatticheScheda {
  const stagione = statistiche.stagione;
  switch (statistiche.macroReparto) {
    case "POR":
      return {
        macroReparto: "POR",
        parate: conStagione(statistiche.parate, stagione),
        golSubiti: conStagione(statistiche.golSubiti, stagione),
        cleanSheet: conStagione(statistiche.cleanSheet, stagione),
        rigoriParati: conStagione(statistiche.rigoriParati, stagione),
      };
    case "DIF":
      return {
        macroReparto: "DIF",
        cleanSheetSquadra: conStagione(
          statistiche.cleanSheetSquadra,
          stagione,
        ),
        duelliDifensiviVinti: conStagione(
          statistiche.duelliDifensiviVinti,
          stagione,
        ),
        contrasti: conStagione(statistiche.contrasti, stagione),
        precisionePassaggiMilli: conStagione(
          statistiche.precisionePassaggiMilli,
          stagione,
        ),
      };
    case "CEN":
      return {
        macroReparto: "CEN",
        assist: conStagione(statistiche.assist, stagione),
        passaggiChiave: conStagione(statistiche.passaggiChiave, stagione),
        precisionePassaggiMilli: conStagione(
          statistiche.precisionePassaggiMilli,
          stagione,
        ),
        tiri: conStagione(statistiche.tiri, stagione),
      };
    case "ATT":
      return {
        macroReparto: "ATT",
        gol: conStagione(statistiche.gol, stagione),
        tiri: conStagione(statistiche.tiri, stagione),
        tiriNelloSpecchio: conStagione(
          statistiche.tiriNelloSpecchio,
          stagione,
        ),
        golAttesiMilli: conStagione(statistiche.golAttesiMilli, stagione),
      };
  }
}

function ruoliPerSessione(
  sessione: SessioneAstaPersistita,
  ruoloClassic: "P" | "D" | "C" | "A" | null,
  ruoliMantra: readonly Reparto[],
): readonly Reparto[] {
  if (sessione.configurazione.modalitaGioco === "mantra") {
    return ruoliMantra;
  }
  return ruoloClassic === null ? [] : [ruoloClassic];
}

export class ServizioConsultazioneSnapshot {
  constructor(private readonly dipendenze: DipendenzeConsultazioneSnapshot) {}

  async indice(sessioneAstaId: string): Promise<IndiceRicercaSnapshot> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreConsultazioneSnapshot(
        503,
        "snapshot_non_disponibile",
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }

    return {
      snapshotId: snapshot.id,
      hashContenuto: snapshot.hashContenuto,
      giocatori: snapshot.giocatori.map((giocatore) => ({
        id: giocatore.identificativoGiocatore,
        nome: giocatore.nome,
        nomeRicerca: giocatore.nomeRicerca,
        squadra: giocatore.squadra,
        ruoli: ruoliPerSessione(
          sessione,
          giocatore.ruoloClassic,
          giocatore.ruoliMantra,
        ),
        quotazione: giocatore.quotazione,
      })),
    };
  }

  async dashboard(sessioneAstaId: string): Promise<DatiDashboardSnapshot> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreConsultazioneSnapshot(
        503,
        "snapshot_non_disponibile",
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }

    return {
      snapshotId: snapshot.id,
      hashContenuto: snapshot.hashContenuto,
      giocatori: snapshot.giocatori.map((giocatore) => ({
        id: giocatore.identificativoGiocatore,
        nome: giocatore.nome,
        squadra: giocatore.squadra,
        ruoli: ruoliPerSessione(
          sessione,
          giocatore.ruoloClassic,
          giocatore.ruoliMantra,
        ),
        quotazione: giocatore.quotazione,
        statFantacalcio: giocatore.statFantacalcio,
      })),
    };
  }

  async scheda(
    sessioneAstaId: string,
    identificativoGiocatore: string,
  ): Promise<SchedaGiocatoreSnapshot> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreConsultazioneSnapshot(
        503,
        "snapshot_non_disponibile",
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }

    const giocatore = snapshot.giocatori.find(
      (voce) =>
        voce.identificativoGiocatore === identificativoGiocatore,
    );
    if (giocatore === undefined) {
      throw new ErroreConsultazioneSnapshot(
        404,
        "giocatore_non_disponibile",
        "Il giocatore non è disponibile nello snapshot corrente.",
      );
    }

    const [voceAttiva, obiettivi] = await Promise.all([
      this.dipendenze.registro.trovaAttivaPerGiocatore(
        sessione.id,
        identificativoGiocatore,
      ),
      this.dipendenze.obiettivi.elencaPerSessione(sessione.id),
    ]);
    const obiettivo = obiettivi.find(
      (voce) => voce.identificativoGiocatore === identificativoGiocatore,
    );
    const avversario =
      voceAttiva?.assegnatarioTipo === "avversario" &&
      voceAttiva.avversarioId !== null
        ? await this.dipendenze.avversari.trovaPerId(voceAttiva.avversarioId)
        : null;

    await this.dipendenze.consultazioniScheda.registra({
      sessioneAstaId: sessione.id,
      identificativoGiocatore,
      istante: this.dipendenze.ora(),
    });

    return {
      snapshotId: snapshot.id,
      hashContenuto: snapshot.hashContenuto,
      giocatore: {
        id: giocatore.identificativoGiocatore,
        nome: giocatore.nome,
        squadra: giocatore.squadra,
        ruoloClassic: giocatore.ruoloClassic,
        ruoliMantra: giocatore.ruoliMantra,
        quotazione: giocatore.quotazione,
        statisticheFantacalcio: mappaStatFantacalcio(
          giocatore.statFantacalcio,
        ),
        statisticheTattiche: mappaStatTattiche(giocatore.statTattiche),
      },
      prezzoMassimoPersonale: obiettivo?.prezzoMassimoPersonale ?? null,
      inListaObiettivi: obiettivo !== undefined,
      assegnazione:
        voceAttiva === null
          ? null
          : {
              tipo: voceAttiva.assegnatarioTipo,
              nome:
                voceAttiva.assegnatarioTipo === "utente"
                  ? "Tu"
                  : (avversario?.nome ?? null),
              prezzoAcquisto: voceAttiva.prezzoAcquisto,
            },
    };
  }
}
