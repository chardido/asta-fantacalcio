import {
  rispostaStatisticheGrezzaSchema,
  type RispostaStatisticheGrezza,
  type StatFantacalcioGrezze,
  type StatTatticheGrezze,
  type VoceStatisticheGrezza,
} from "@asta/contracts";

import type {
  AdattatoreSorgenteStatistiche,
  LimitiFrequenza,
  SegnaleAnnullamento,
} from "./sorgenti.js";

const UN_GIORNO_MS = 24 * 60 * 60 * 1_000;
const URL_API_FOOTBALL_PREDEFINITO = "https://v3.football.api-sports.io";

export const NOME_ADATTATORE_STATISTICHE_API_FOOTBALL = "api-football";
export const ID_LEGA_SERIE_A_API_FOOTBALL = 135;
export const LIMITI_STATISTICHE_API_FOOTBALL: LimitiFrequenza = Object.freeze({
  richiesteMassime: 100,
  finestraMs: UN_GIORNO_MS,
});

export type FunzioneRecuperoApiFootball = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ConfigurazioneAdattatoreStatisticheApiFootball {
  /** La chiave viene letta da API_FOOTBALL_KEY esclusivamente nel worker. */
  readonly chiaveApi: string;
  readonly idLega?: number;
  readonly urlBase?: string | URL;
  readonly nome?: string;
  readonly limiti?: LimitiFrequenza;
  readonly recuperaHttp?: FunzioneRecuperoApiFootball;
}

export type CodiceErroreStatisticheApiFootball =
  | "stagione_non_valida"
  | "limite_frequenza"
  | "sorgente_non_accessibile"
  | "risposta_non_valida";

/** Errore operativo classificabile dalla pipeline senza conoscere il provider. */
export class ErroreStatisticheApiFootball extends Error {
  override readonly name = "ErroreStatisticheApiFootball";

  constructor(
    readonly codice: CodiceErroreStatisticheApiFootball,
    messaggio: string,
    opzioni?: ErrorOptions,
  ) {
    super(messaggio, opzioni);
  }
}

interface SquadraApiFootball {
  readonly id: number;
  readonly nome: string;
}

interface PaginaApiFootball {
  readonly risposta: readonly unknown[];
  readonly paginaCorrente: number;
  readonly pagineTotali: number;
}

type RecordSconosciuto = Readonly<Record<string, unknown>>;

function eRecord(valore: unknown): valore is RecordSconosciuto {
  return typeof valore === "object" && valore !== null && !Array.isArray(valore);
}

function proprieta(record: RecordSconosciuto, percorso: readonly string[]): unknown {
  let corrente: unknown = record;
  for (const nome of percorso) {
    if (!eRecord(corrente)) return undefined;
    corrente = corrente[nome];
  }
  return corrente;
}

function validaLimiti(limiti: LimitiFrequenza): LimitiFrequenza {
  if (
    !Number.isInteger(limiti.richiesteMassime) ||
    limiti.richiesteMassime < 1 ||
    !Number.isInteger(limiti.finestraMs) ||
    limiti.finestraMs < 1
  ) {
    throw new TypeError(
      "I limiti di frequenza richiedono interi positivi per richiesteMassime e finestraMs",
    );
  }
  return Object.freeze({ ...limiti });
}

function validaUrlBase(url: string | URL): URL {
  const risultato = new URL(url);
  if (risultato.protocol !== "https:" && risultato.protocol !== "http:") {
    throw new TypeError("L'URL base di API-Football deve usare HTTP o HTTPS");
  }
  return risultato;
}

/** Converte 2025/2026, 2025-26 o 2025 nell'anno iniziale richiesto dal provider. */
export function annoApiFootballDaStagione(stagione: string): number {
  const valore = stagione.trim();
  const singoloAnno = /^(\d{4})$/.exec(valore);
  if (singoloAnno) return Number(singoloAnno[1]);

  const intervallo = /^(\d{4})\s*[/-]\s*(\d{2}|\d{4})$/.exec(valore);
  if (intervallo) {
    const annoIniziale = Number(intervallo[1]);
    const parteFinale = intervallo[2];
    const annoFinale =
      parteFinale?.length === 2
        ? Math.floor(annoIniziale / 100) * 100 + Number(parteFinale)
        : Number(parteFinale);
    if (annoFinale === annoIniziale + 1) return annoIniziale;
  }

  throw new ErroreStatisticheApiFootball(
    "stagione_non_valida",
    `La stagione "${stagione}" deve essere un anno oppure due anni consecutivi`,
  );
}

function descriviErroriProvider(errori: unknown): string | undefined {
  if (Array.isArray(errori)) {
    const descrizione = errori.map(String).filter(Boolean).join("; ");
    return descrizione || undefined;
  }
  if (eRecord(errori)) {
    const descrizione = Object.values(errori)
      .map(String)
      .filter(Boolean)
      .join("; ");
    return descrizione || undefined;
  }
  return errori == null ? undefined : String(errori);
}

function eErroreLimite(descrizione: string): boolean {
  return /rate|limit|quota|request/i.test(descrizione);
}

function interoPositivo(valore: unknown): number | undefined {
  return typeof valore === "number" && Number.isInteger(valore) && valore > 0
    ? valore
    : undefined;
}

function conteggio(record: RecordSconosciuto, percorso: readonly string[]): number | undefined {
  const valore = proprieta(record, percorso);
  if (valore == null) return undefined;

  const numero =
    typeof valore === "number"
      ? valore
      : typeof valore === "string" && /^\d+$/.test(valore.trim())
        ? Number(valore)
        : Number.NaN;
  if (!Number.isInteger(numero) || numero < 0) {
    throw new ErroreStatisticheApiFootball(
      "risposta_non_valida",
      `La statistica ${percorso.join(".")} non e' un conteggio intero non negativo`,
    );
  }
  return numero;
}

function precisionePassaggiMilli(record: RecordSconosciuto): number | undefined {
  const valore = proprieta(record, ["passes", "accuracy"]);
  if (valore == null) return undefined;

  const testo = typeof valore === "string" ? valore.trim().replace(/%$/, "") : valore;
  const percentuale = typeof testo === "number" ? testo : Number(testo);
  if (!Number.isFinite(percentuale) || percentuale < 0 || percentuale > 100) {
    throw new ErroreStatisticheApiFootball(
      "risposta_non_valida",
      "La statistica passes.accuracy non e' una percentuale compresa tra 0 e 100",
    );
  }

  // 87,3% equivale a 873 millesimi dell'unita'.
  return Math.round(percentuale * 10);
}

function assegnaSeDefinito<T extends object, K extends keyof T>(
  destinazione: T,
  chiave: K,
  valore: T[K] | undefined,
): void {
  if (valore !== undefined) destinazione[chiave] = valore;
}

function sommaDisponibili(
  primo: number | undefined,
  secondo: number | undefined,
): number | undefined {
  return primo === undefined && secondo === undefined
    ? undefined
    : (primo ?? 0) + (secondo ?? 0);
}

function traduciGiocatore(
  voce: unknown,
  squadra: SquadraApiFootball,
  idLega: number,
): VoceStatisticheGrezza {
  if (!eRecord(voce) || !eRecord(voce.player)) {
    throw new ErroreStatisticheApiFootball(
      "risposta_non_valida",
      `La risposta giocatori della squadra ${squadra.id} non contiene player`,
    );
  }

  const idGiocatore = interoPositivo(voce.player.id);
  const nome = typeof voce.player.name === "string" ? voce.player.name.trim() : "";
  if (!idGiocatore || !nome) {
    throw new ErroreStatisticheApiFootball(
      "risposta_non_valida",
      `Un giocatore della squadra ${squadra.id} non ha identificativo o nome valido`,
    );
  }

  const statistiche = Array.isArray(voce.statistics) ? voce.statistics : [];
  const statistica =
    statistiche.find(
      (candidata) =>
        eRecord(candidata) &&
        proprieta(candidata, ["team", "id"]) === squadra.id &&
        proprieta(candidata, ["league", "id"]) === idLega,
    ) ??
    statistiche.find(
      (candidata) =>
        eRecord(candidata) && proprieta(candidata, ["team", "id"]) === squadra.id,
    );
  const dati = eRecord(statistica) ? statistica : {};

  const fantacalcio: StatFantacalcioGrezze = {};
  assegnaSeDefinito(fantacalcio, "presenze", conteggio(dati, ["games", "appearences"]));
  assegnaSeDefinito(fantacalcio, "gol", conteggio(dati, ["goals", "total"]));
  assegnaSeDefinito(fantacalcio, "assist", conteggio(dati, ["goals", "assists"]));
  assegnaSeDefinito(fantacalcio, "ammonizioni", conteggio(dati, ["cards", "yellow"]));
  assegnaSeDefinito(
    fantacalcio,
    "espulsioni",
    sommaDisponibili(
      conteggio(dati, ["cards", "red"]),
      conteggio(dati, ["cards", "yellowred"]),
    ),
  );
  assegnaSeDefinito(fantacalcio, "rigoriParati", conteggio(dati, ["penalty", "saved"]));
  assegnaSeDefinito(fantacalcio, "rigoriSbagliati", conteggio(dati, ["penalty", "missed"]));

  const tattiche: StatTatticheGrezze = {};
  assegnaSeDefinito(tattiche, "parate", conteggio(dati, ["goals", "saves"]));
  assegnaSeDefinito(tattiche, "golSubiti", conteggio(dati, ["goals", "conceded"]));
  assegnaSeDefinito(tattiche, "duelliDifensiviVinti", conteggio(dati, ["duels", "won"]));
  assegnaSeDefinito(tattiche, "contrasti", conteggio(dati, ["tackles", "total"]));
  assegnaSeDefinito(tattiche, "precisionePassaggiMilli", precisionePassaggiMilli(dati));
  assegnaSeDefinito(tattiche, "passaggiChiave", conteggio(dati, ["passes", "key"]));
  assegnaSeDefinito(tattiche, "tiri", conteggio(dati, ["shots", "total"]));
  assegnaSeDefinito(tattiche, "tiriNelloSpecchio", conteggio(dati, ["shots", "on"]));

  return {
    identificativoSorgente: String(idGiocatore),
    nome,
    squadra: squadra.nome,
    statFantacalcio: fantacalcio,
    statTattiche: tattiche,
  };
}

function descriviErroreSchema(
  errore: { readonly issues: readonly { readonly path: PropertyKey[]; readonly message: string }[] },
): string {
  return errore.issues
    .map((issue) => `${issue.path.join(".") || "radice"}: ${issue.message}`)
    .join("; ");
}

/**
 * Adattatore API-Football. Recupera prima le squadre della lega, poi i
 * giocatori pagina per pagina per ciascuna squadra. Nessun campo specifico del
 * provider oltrepassa il confine del DTO canonico.
 */
export class AdattatoreStatisticheApiFootball
  implements AdattatoreSorgenteStatistiche
{
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
  readonly idLega: number;

  readonly #chiaveApi: string;
  readonly #urlBase: URL;
  readonly #recuperaHttp: FunzioneRecuperoApiFootball;

  constructor(configurazione: ConfigurazioneAdattatoreStatisticheApiFootball) {
    this.nome = configurazione.nome ?? NOME_ADATTATORE_STATISTICHE_API_FOOTBALL;
    this.idLega = configurazione.idLega ?? ID_LEGA_SERIE_A_API_FOOTBALL;
    this.limiti = validaLimiti(
      configurazione.limiti ?? LIMITI_STATISTICHE_API_FOOTBALL,
    );
    this.#chiaveApi = configurazione.chiaveApi.trim();
    this.#urlBase = validaUrlBase(
      configurazione.urlBase ?? URL_API_FOOTBALL_PREDEFINITO,
    );
    this.#recuperaHttp = configurazione.recuperaHttp ?? globalThis.fetch;

    if (!this.#chiaveApi) throw new TypeError("La chiave API-Football e' obbligatoria");
    if (!this.nome.trim()) throw new TypeError("Il nome dell'adattatore non puo essere vuoto");
    if (!Number.isInteger(this.idLega) || this.idLega < 1) {
      throw new TypeError("L'identificativo della lega deve essere un intero positivo");
    }
    if (typeof this.#recuperaHttp !== "function") {
      throw new TypeError("Una funzione fetch compatibile e' obbligatoria");
    }
  }

  async #richiedi(
    percorso: string,
    parametri: Readonly<Record<string, string | number>>,
    segnale: SegnaleAnnullamento,
  ): Promise<PaginaApiFootball> {
    segnale.throwIfAborted();
    const url = new URL(percorso, this.#urlBase);
    for (const [nome, valore] of Object.entries(parametri)) {
      url.searchParams.set(nome, String(valore));
    }

    let rispostaHttp: Response;
    try {
      rispostaHttp = await this.#recuperaHttp(url, {
        headers: {
          accept: "application/json",
          "x-apisports-key": this.#chiaveApi,
        },
        signal: segnale,
      });
    } catch (errore_) {
      if (segnale.aborted) throw errore_;
      throw new ErroreStatisticheApiFootball(
        "sorgente_non_accessibile",
        `API-Football non e' accessibile durante la richiesta ${percorso}`,
        { cause: errore_ },
      );
    }

    if (rispostaHttp.status === 429) {
      throw new ErroreStatisticheApiFootball(
        "limite_frequenza",
        "API-Football ha segnalato il superamento del limite di frequenza",
      );
    }
    if (!rispostaHttp.ok) {
      throw new ErroreStatisticheApiFootball(
        "sorgente_non_accessibile",
        `API-Football ha risposto con stato HTTP ${rispostaHttp.status}`,
      );
    }

    let corpo: unknown;
    try {
      corpo = await rispostaHttp.json();
    } catch (errore_) {
      throw new ErroreStatisticheApiFootball(
        "risposta_non_valida",
        "API-Football non ha restituito JSON valido",
        { cause: errore_ },
      );
    }
    if (!eRecord(corpo)) {
      throw new ErroreStatisticheApiFootball(
        "risposta_non_valida",
        "La radice della risposta API-Football non e' un oggetto",
      );
    }

    const erroreProvider = descriviErroriProvider(corpo.errors);
    if (erroreProvider) {
      throw new ErroreStatisticheApiFootball(
        eErroreLimite(erroreProvider) ? "limite_frequenza" : "sorgente_non_accessibile",
        `API-Football ha rifiutato la richiesta: ${erroreProvider}`,
      );
    }
    if (!Array.isArray(corpo.response)) {
      throw new ErroreStatisticheApiFootball(
        "risposta_non_valida",
        "La risposta API-Football non contiene l'array response",
      );
    }

    const pagina = eRecord(corpo.paging) ? corpo.paging : {};
    const corrente = interoPositivo(pagina.current) ?? 1;
    const totale = interoPositivo(pagina.total) ?? 1;
    if (corrente > totale) {
      throw new ErroreStatisticheApiFootball(
        "risposta_non_valida",
        `La paginazione API-Football e' incoerente: pagina ${corrente} di ${totale}`,
      );
    }

    return {
      risposta: corpo.response,
      paginaCorrente: corrente,
      pagineTotali: totale,
    };
  }

  async recupera(
    stagione: string,
    segnale: SegnaleAnnullamento,
  ): Promise<RispostaStatisticheGrezza> {
    const anno = annoApiFootballDaStagione(stagione);
    segnale.throwIfAborted();

    const paginaSquadre = await this.#richiedi(
      "/teams",
      { league: this.idLega, season: anno },
      segnale,
    );
    const squadre = paginaSquadre.risposta.map((voce): SquadraApiFootball => {
      if (!eRecord(voce) || !eRecord(voce.team)) {
        throw new ErroreStatisticheApiFootball(
          "risposta_non_valida",
          "Una voce dell'indice squadre non contiene team",
        );
      }
      const id = interoPositivo(voce.team.id);
      const nome = typeof voce.team.name === "string" ? voce.team.name.trim() : "";
      if (!id || !nome) {
        throw new ErroreStatisticheApiFootball(
          "risposta_non_valida",
          "Una squadra non ha identificativo o nome valido",
        );
      }
      return { id, nome };
    });

    const giocatori: VoceStatisticheGrezza[] = [];
    const identitaViste = new Set<string>();
    for (const squadra of squadre) {
      let numeroPagina = 1;
      while (true) {
        const pagina = await this.#richiedi(
          "/players",
          {
            league: this.idLega,
            season: anno,
            team: squadra.id,
            page: numeroPagina,
          },
          segnale,
        );
        for (const voce of pagina.risposta) {
          const giocatore = traduciGiocatore(voce, squadra, this.idLega);
          const identita = `${giocatore.identificativoSorgente}|${squadra.id}`;
          if (!identitaViste.has(identita)) {
            identitaViste.add(identita);
            giocatori.push(giocatore);
          }
        }
        if (numeroPagina >= pagina.pagineTotali) break;
        numeroPagina += 1;
      }
    }

    const risultato = rispostaStatisticheGrezzaSchema.safeParse({
      nomeSorgente: this.nome,
      stagione,
      giocatori,
    });
    if (!risultato.success) {
      throw new ErroreStatisticheApiFootball(
        "risposta_non_valida",
        `La traduzione API-Football non rispetta il DTO canonico: ${descriviErroreSchema(risultato.error)}`,
      );
    }
    return risultato.data;
  }
}
