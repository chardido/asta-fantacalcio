import type { LimitiFrequenza } from "@asta/adapters";
import type {
  RepositoryFreschezza,
  StatoFreschezzaPersistito,
} from "@asta/db";

export const TIMEOUT_RICHIESTA_MS = 30_000;
export const BACKOFF_INIZIALE_MS = 60_000;
export const BACKOFF_MASSIMO_MS = 3_600_000;

export interface SorgenteLimitata {
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
}

type RepositoryLimitatore = Pick<
  RepositoryFreschezza,
  "trova" | "salvaLimitazione"
>;

type Orologio = () => Date;

interface PermessoChiamata {
  readonly attesaBackoffPrecedenteMs: number | null;
}

export class ErroreChiamataRinviata extends Error {
  override readonly name = "ErroreChiamataRinviata";

  constructor(readonly prossimoTentativoNonPrimaDi: Date) {
    super(
      `La sorgente e' sospesa fino a ${prossimoTentativoNonPrimaDi.toISOString()}`,
    );
  }
}

export class ErroreBudgetTokenEsaurito extends Error {
  override readonly name = "ErroreBudgetTokenEsaurito";

  constructor(readonly tokenDisponibileNonPrimaDi: Date) {
    super(
      `Il budget di frequenza sara' nuovamente disponibile da ${tokenDisponibileNonPrimaDi.toISOString()}`,
    );
  }
}

export class ErroreTimeoutSorgente extends Error {
  override readonly name = "ErroreTimeoutSorgente";

  constructor(readonly timeoutMs: number) {
    super(`La sorgente non ha risposto entro ${timeoutMs} ms`);
  }
}

function validaLimiti(limiti: LimitiFrequenza): void {
  if (
    !Number.isSafeInteger(limiti.richiesteMassime) ||
    limiti.richiesteMassime < 1 ||
    !Number.isSafeInteger(limiti.finestraMs) ||
    limiti.finestraMs < 1
  ) {
    throw new RangeError(
      "I limiti richiedono richiesteMassime e finestraMs interi positivi",
    );
  }
}

function chiaveSorgente(nomeSorgente: string, stagione: string): string {
  return `${nomeSorgente}\u0000${stagione}`;
}

function millisecondi(data: Date): number {
  const valore = data.getTime();
  if (!Number.isFinite(valore)) {
    throw new RangeError("L'istante del limitatore non e' valido");
  }
  return valore;
}

/** Calcola il backoff 60 s, 120 s, ... fino al tetto di 3600 s. */
export function calcolaAttesaBackoffMs(
  attesaPrecedenteMs: number | null,
): number {
  if (attesaPrecedenteMs === null || attesaPrecedenteMs < BACKOFF_INIZIALE_MS) {
    return BACKOFF_INIZIALE_MS;
  }
  return Math.min(BACKOFF_MASSIMO_MS, attesaPrecedenteMs * 2);
}

/** Ricarica il bucket in modo conservativo usando l'ultimo istante persistito. */
export function calcolaBudgetToken(
  budgetPersistito: number,
  aggiornatoIl: Date,
  istante: Date,
  limiti: LimitiFrequenza,
): number {
  validaLimiti(limiti);
  const budgetValido = Math.min(
    limiti.richiesteMassime,
    Math.max(0, Math.trunc(budgetPersistito)),
  );
  const trascorsoMs = Math.max(
    0,
    millisecondi(istante) - millisecondi(aggiornatoIl),
  );
  const tokenRicaricati = Math.floor(
    (trascorsoMs * limiti.richiesteMassime) / limiti.finestraMs,
  );
  return Math.min(limiti.richiesteMassime, budgetValido + tokenRicaricati);
}

function attesaBackoffPersistitaMs(
  stato: StatoFreschezzaPersistito,
): number | null {
  if (stato.prossimoTentativoNonPrimaDi === null) return null;
  const attesa =
    millisecondi(stato.prossimoTentativoNonPrimaDi) -
    millisecondi(stato.aggiornatoIl);
  return attesa > 0
    ? Math.min(BACKOFF_MASSIMO_MS, Math.max(BACKOFF_INIZIALE_MS, attesa))
    : null;
}

function eErroreLimiteFrequenza(errore: unknown): boolean {
  return (
    typeof errore === "object" &&
    errore !== null &&
    "codice" in errore &&
    errore.codice === "limite_frequenza"
  );
}

/**
 * Token bucket persistente per sorgente e stagione. Le acquisizioni del
 * permesso sono serializzate nel processo worker; il budget salvato impedisce
 * che un riavvio ripristini artificialmente i token.
 */
export class LimitatoreFrequenza {
  readonly #code = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: RepositoryLimitatore,
    private readonly ora: Orologio = () => new Date(),
    private readonly timeoutMs: number = TIMEOUT_RICHIESTA_MS,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new RangeError("Il timeout deve essere un intero positivo");
    }
  }

  async esegui<T>(
    sorgente: SorgenteLimitata,
    stagione: string,
    operazione: (segnale: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const permesso = await this.#inCoda(
      chiaveSorgente(sorgente.nome, stagione),
      () => this.#consumaToken(sorgente, stagione),
    );

    try {
      const risultato = await this.#eseguiConTimeout(operazione);
      await this.#azzeraBackoff(sorgente.nome, stagione);
      return risultato;
    } catch (error_) {
      if (eErroreLimiteFrequenza(error_)) {
        await this.#registraSuperamentoLimite(
          sorgente.nome,
          stagione,
          permesso.attesaBackoffPrecedenteMs,
        );
      }
      throw error_;
    }
  }

  async #inCoda<T>(chiave: string, operazione: () => Promise<T>): Promise<T> {
    const precedente = this.#code.get(chiave) ?? Promise.resolve();
    let rilascia = (): void => undefined;
    const turno = new Promise<void>((resolve) => {
      rilascia = resolve;
    });
    const coda = precedente.catch(() => undefined).then(() => turno);
    this.#code.set(chiave, coda);

    await precedente.catch(() => undefined);
    try {
      return await operazione();
    } finally {
      rilascia();
      if (this.#code.get(chiave) === coda) this.#code.delete(chiave);
    }
  }

  async #consumaToken(
    sorgente: SorgenteLimitata,
    stagione: string,
  ): Promise<PermessoChiamata> {
    validaLimiti(sorgente.limiti);
    const istante = this.ora();
    const oraMs = millisecondi(istante);
    const stato = await this.repository.trova(sorgente.nome, stagione);

    const prossimoTentativoNonPrimaDi =
      stato?.prossimoTentativoNonPrimaDi;
    if (
      prossimoTentativoNonPrimaDi &&
      millisecondi(prossimoTentativoNonPrimaDi) > oraMs
    ) {
      throw new ErroreChiamataRinviata(prossimoTentativoNonPrimaDi);
    }

    const budgetDisponibile =
      stato === null
        ? sorgente.limiti.richiesteMassime
        : calcolaBudgetToken(
            stato.budgetToken,
            stato.aggiornatoIl,
            istante,
            sorgente.limiti,
          );

    if (budgetDisponibile < 1) {
      const intervalloTokenMs = Math.ceil(
        sorgente.limiti.finestraMs / sorgente.limiti.richiesteMassime,
      );
      const baseMs = stato === null ? oraMs : millisecondi(stato.aggiornatoIl);
      throw new ErroreBudgetTokenEsaurito(
        new Date(baseMs + intervalloTokenMs),
      );
    }

    const attesaBackoffPrecedenteMs =
      stato === null ? null : attesaBackoffPersistitaMs(stato);
    await this.repository.salvaLimitazione({
      nomeSorgente: sorgente.nome,
      stagione,
      budgetToken: budgetDisponibile - 1,
      prossimoTentativoNonPrimaDi:
        stato?.prossimoTentativoNonPrimaDi ?? null,
      aggiornatoIl: istante,
    });
    return { attesaBackoffPrecedenteMs };
  }

  async #registraSuperamentoLimite(
    nomeSorgente: string,
    stagione: string,
    attesaPrecedenteMs: number | null,
  ): Promise<void> {
    const istante = this.ora();
    const stato = await this.repository.trova(nomeSorgente, stagione);
    const attesaMs = calcolaAttesaBackoffMs(attesaPrecedenteMs);
    await this.repository.salvaLimitazione({
      nomeSorgente,
      stagione,
      budgetToken: stato?.budgetToken ?? 0,
      prossimoTentativoNonPrimaDi: new Date(
        millisecondi(istante) + attesaMs,
      ),
      aggiornatoIl: istante,
    });
  }

  async #azzeraBackoff(
    nomeSorgente: string,
    stagione: string,
  ): Promise<void> {
    const stato = await this.repository.trova(nomeSorgente, stagione);
    if (!stato?.prossimoTentativoNonPrimaDi) return;
    await this.repository.salvaLimitazione({
      nomeSorgente,
      stagione,
      budgetToken: stato.budgetToken,
      prossimoTentativoNonPrimaDi: null,
      aggiornatoIl: this.ora(),
    });
  }

  async #eseguiConTimeout<T>(
    operazione: (segnale: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const erroreTimeout = new ErroreTimeoutSorgente(this.timeoutMs);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(erroreTimeout);
        reject(erroreTimeout);
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        Promise.resolve().then(() => operazione(controller.signal)),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
