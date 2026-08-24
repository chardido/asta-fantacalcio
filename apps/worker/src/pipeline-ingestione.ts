import type {
  AdattatoreSorgenteListone,
  AdattatoreSorgenteStatistiche,
} from "@asta/adapters";
import type {
  AcquisizioneRiuscita,
  EsitoIngestione,
  PubblicazioneSnapshotAtomica,
  RepositoryFreschezza,
  RepositoryIngestione,
  StatoFreschezzaPersistito,
  TentativoIngestioneDaRegistrare,
} from "@asta/db";
import {
  normalizzaDati,
  serializza,
  type RappresentazionePersistente,
} from "@asta/domain";
import { createHash, randomUUID } from "node:crypto";

import {
  ErroreBudgetTokenEsaurito,
  ErroreChiamataRinviata,
  ErroreTimeoutSorgente,
  type SorgenteLimitata,
} from "./limitatore-frequenza.js";
import type { RisultatoRisoluzioneIdentita } from "./risolutore-identita.js";

export const INTERVALLO_MASSIMO_TENTATIVI_MS = 24 * 60 * 60 * 1_000;
export const DURATA_LOCK_INGESTIONE_MS = 2 * 60 * 60 * 1_000;

interface EsecutoreLimitato {
  esegui<T>(
    sorgente: SorgenteLimitata,
    stagione: string,
    operazione: (segnale: AbortSignal) => Promise<T>,
  ): Promise<T>;
}

interface RisolutoreIdentitaPipeline {
  accoppia(
    listone: Awaited<ReturnType<AdattatoreSorgenteListone["recupera"]>>,
    statistiche: Awaited<ReturnType<AdattatoreSorgenteStatistiche["recupera"]>>,
  ): Promise<RisultatoRisoluzioneIdentita>;
}

export interface ConfigurazionePipelineIngestione {
  readonly stagioneListone: string;
  readonly stagioneStatistiche: string;
}

export interface DipendenzePipelineIngestione {
  readonly listone: AdattatoreSorgenteListone;
  readonly statistiche: AdattatoreSorgenteStatistiche;
  readonly limitatore: EsecutoreLimitato;
  readonly risolutoreIdentita: RisolutoreIdentitaPipeline;
  readonly freschezza: Pick<RepositoryFreschezza, "trova">;
  readonly ingestione: Pick<
    RepositoryIngestione,
    | "acquisisciLock"
    | "rilasciaLock"
    | "registraTentativo"
    | "pubblicaSnapshot"
  >;
  readonly ora?: () => Date;
  readonly creaIdentificativoEsecuzione?: () => string;
}

export type EsitoEsecuzioneIngestione =
  | Readonly<{ stato: "pubblicato"; snapshotId: string; numGiocatori: number }>
  | Readonly<{ stato: "fallito"; esiti: readonly EsitoIngestione[] }>
  | Readonly<{ stato: "lock_non_acquisito" }>
  | Readonly<{ stato: "non_necessario" }>;

type RisultatoCanale<T> =
  | Readonly<{
      ok: true;
      valore: T;
      acquisizione: AcquisizioneRiuscita;
    }>
  | Readonly<{
      ok: false;
      tentativo: TentativoIngestioneDaRegistrare;
    }>;

function messaggioErrore(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}

function classificaErrore(errore: unknown): EsitoIngestione {
  if (errore instanceof ErroreTimeoutSorgente) return "timeout";
  if (
    errore instanceof ErroreChiamataRinviata ||
    errore instanceof ErroreBudgetTokenEsaurito
  ) {
    return "limite_frequenza";
  }
  if (
    typeof errore === "object" &&
    errore !== null &&
    "codice" in errore &&
    errore.codice === "limite_frequenza"
  ) {
    return "limite_frequenza";
  }
  return "errore";
}

function hashRappresentazione(
  rappresentazione: RappresentazionePersistente,
): string {
  return createHash("sha256")
    .update(JSON.stringify(rappresentazione), "utf8")
    .digest("hex");
}

function tentativoFallito(
  nomeSorgente: string,
  stagione: string,
  iniziatoIl: Date,
  terminatoIl: Date,
  esito: EsitoIngestione,
  dettaglioErrore: string,
): TentativoIngestioneDaRegistrare {
  return {
    nomeSorgente,
    stagione,
    iniziatoIl,
    terminatoIl,
    esito,
    numGiocatoriAcquisiti: null,
    dettaglioErrore,
  };
}

function tentativoScaduto(
  stato: StatoFreschezzaPersistito | null,
  ora: Date,
): boolean {
  return (
    stato === null ||
    ora.getTime() - stato.ultimoTentativoIl.getTime() >=
      INTERVALLO_MASSIMO_TENTATIVI_MS
  );
}

/** Coordina i due canali e non affida mai uno snapshot parziale alla persistenza. */
export class PipelineIngestione {
  readonly #ora: () => Date;
  readonly #creaIdentificativoEsecuzione: () => string;

  constructor(
    private readonly configurazione: ConfigurazionePipelineIngestione,
    private readonly dipendenze: DipendenzePipelineIngestione,
  ) {
    if (
      configurazione.stagioneListone.trim().length === 0 ||
      configurazione.stagioneStatistiche.trim().length === 0
    ) {
      throw new TypeError("Le stagioni della pipeline sono obbligatorie");
    }
    this.#ora = dipendenze.ora ?? (() => new Date());
    this.#creaIdentificativoEsecuzione =
      dipendenze.creaIdentificativoEsecuzione ?? randomUUID;
  }

  async eseguiSeNecessario(): Promise<EsitoEsecuzioneIngestione> {
    const ora = this.#ora();
    const [freschezzaListone, freschezzaStatistiche] = await Promise.all([
      this.dipendenze.freschezza.trova(
        this.dipendenze.listone.nome,
        this.configurazione.stagioneListone,
      ),
      this.dipendenze.freschezza.trova(
        this.dipendenze.statistiche.nome,
        this.configurazione.stagioneStatistiche,
      ),
    ]);
    if (
      !tentativoScaduto(freschezzaListone, ora) &&
      !tentativoScaduto(freschezzaStatistiche, ora)
    ) {
      return { stato: "non_necessario" };
    }
    return this.esegui();
  }

  async esegui(): Promise<EsitoEsecuzioneIngestione> {
    const proprietario = this.#creaIdentificativoEsecuzione();
    const acquisitoIl = this.#ora();
    const chiaveLock = `snapshot:${this.configurazione.stagioneListone}`;
    const acquisito = await this.dipendenze.ingestione.acquisisciLock({
      chiave: chiaveLock,
      proprietario,
      acquisitoIl,
      scadeIl: new Date(acquisitoIl.getTime() + DURATA_LOCK_INGESTIONE_MS),
    });
    if (!acquisito) return { stato: "lock_non_acquisito" };

    try {
      const [listone, statistiche] = await Promise.all([
        this.#recupera(
          this.dipendenze.listone,
          this.configurazione.stagioneListone,
        ),
        this.#recupera(
          this.dipendenze.statistiche,
          this.configurazione.stagioneStatistiche,
        ),
      ]);

      if (!listone.ok || !statistiche.ok) {
        const tentativi = [
          listone.ok ? listone.acquisizione : listone.tentativo,
          statistiche.ok ? statistiche.acquisizione : statistiche.tentativo,
        ];
        await Promise.all(
          tentativi.map((tentativo) =>
            this.dipendenze.ingestione.registraTentativo(tentativo),
          ),
        );
        return {
          stato: "fallito",
          esiti: tentativi.map((tentativo) => tentativo.esito),
        };
      }

      let risoluzione: RisultatoRisoluzioneIdentita;
      try {
        risoluzione = await this.dipendenze.risolutoreIdentita.accoppia(
          listone.valore,
          statistiche.valore,
        );
      } catch (errore) {
        return await this.#registraFallimentoPipeline(
          "errore",
          messaggioErrore(errore),
          listone.acquisizione,
          statistiche.acquisizione,
        );
      }

      const normalizzato = normalizzaDati(
        risoluzione.listone,
        risoluzione.statistiche,
      );
      if (!normalizzato.ok) {
        return await this.#registraFallimentoPipeline(
          "dati_non_validi",
          JSON.stringify(normalizzato.errore),
          listone.acquisizione,
          statistiche.acquisizione,
        );
      }
      if (
        risoluzione.listone.giocatori.length === 0 ||
        normalizzato.valore.giocatori.length !==
          risoluzione.listone.giocatori.length
      ) {
        return await this.#registraFallimentoPipeline(
          "dati_non_validi",
          "Il listone normalizzato non e' completo o e' vuoto",
          listone.acquisizione,
          statistiche.acquisizione,
        );
      }

      const rappresentazione = serializza(normalizzato.valore);
      const giocatori = rappresentazione.giocatori.map((giocatore) => {
        const statisticheTattiche = giocatore.statTattiche[0];
        if (statisticheTattiche === undefined) {
          throw new Error(
            `Statistiche tattiche non costruite per ${giocatore.identificativoGiocatore}`,
          );
        }
        return {
          identificativoGiocatore: giocatore.identificativoGiocatore,
          nome: giocatore.nome,
          nomeRicerca: giocatore.nomeRicerca,
          squadra: giocatore.squadra,
          ruoloClassic: giocatore.ruoloClassic,
          ruoliMantra: giocatore.ruoliMantra,
          quotazione: giocatore.quotazione,
          statFantacalcio: giocatore.statFantacalcio,
          statTattiche: statisticheTattiche,
        };
      });

      try {
        const pubblicazione: PubblicazioneSnapshotAtomica = {
          snapshot: {
            stagioneListone: rappresentazione.stagioneListone,
            stagioneStatistiche: rappresentazione.stagioneStatistiche,
            stato: "in_costruzione",
            numGiocatori: giocatori.length,
            nomeSorgenteListone: rappresentazione.nomeSorgenteListone,
            nomeSorgenteStatistiche:
              rappresentazione.nomeSorgenteStatistiche,
            hashContenuto: hashRappresentazione(rappresentazione),
          },
          giocatori,
          pubblicatoIl: this.#ora(),
          acquisizioni: [listone.acquisizione, statistiche.acquisizione],
        };
        const snapshot = await this.dipendenze.ingestione.pubblicaSnapshot(
          pubblicazione,
        );
        return {
          stato: "pubblicato",
          snapshotId: snapshot.id,
          numGiocatori: snapshot.numGiocatori,
        };
      } catch (errore) {
        return await this.#registraFallimentoPipeline(
          "errore",
          messaggioErrore(errore),
          listone.acquisizione,
          statistiche.acquisizione,
        );
      }
    } finally {
      await this.dipendenze.ingestione.rilasciaLock(
        chiaveLock,
        proprietario,
      );
    }
  }

  async #recupera<T>(
    sorgente: SorgenteLimitata & {
      recupera(stagione: string, segnale: AbortSignal): Promise<T>;
    },
    stagione: string,
  ): Promise<RisultatoCanale<T>> {
    const iniziatoIl = this.#ora();
    try {
      const valore = await this.dipendenze.limitatore.esegui(
        sorgente,
        stagione,
        (segnale) => sorgente.recupera(stagione, segnale),
      );
      const terminatoIl = this.#ora();
      const numeroGiocatori =
        typeof valore === "object" &&
        valore !== null &&
        "giocatori" in valore &&
        Array.isArray(valore.giocatori)
          ? valore.giocatori.length
          : 0;
      return {
        ok: true,
        valore,
        acquisizione: {
          nomeSorgente: sorgente.nome,
          stagione,
          iniziatoIl,
          terminatoIl,
          esito: "successo",
          numGiocatoriAcquisiti: numeroGiocatori,
          dettaglioErrore: null,
        },
      };
    } catch (errore) {
      const terminatoIl = this.#ora();
      return {
        ok: false,
        tentativo: tentativoFallito(
          sorgente.nome,
          stagione,
          iniziatoIl,
          terminatoIl,
          classificaErrore(errore),
          messaggioErrore(errore),
        ),
      };
    }
  }

  async #registraFallimentoPipeline(
    esito: Extract<EsitoIngestione, "errore" | "dati_non_validi">,
    dettaglio: string,
    listone: AcquisizioneRiuscita,
    statistiche: AcquisizioneRiuscita,
  ): Promise<Extract<EsitoEsecuzioneIngestione, { stato: "fallito" }>> {
    const terminatoIl = this.#ora();
    const tentativi = [listone, statistiche].map((acquisizione) =>
      tentativoFallito(
        acquisizione.nomeSorgente,
        acquisizione.stagione,
        acquisizione.iniziatoIl,
        terminatoIl,
        esito,
        dettaglio,
      ),
    );
    await Promise.all(
      tentativi.map((tentativo) =>
        this.dipendenze.ingestione.registraTentativo(tentativo),
      ),
    );
    return { stato: "fallito", esiti: tentativi.map(() => esito) };
  }
}
