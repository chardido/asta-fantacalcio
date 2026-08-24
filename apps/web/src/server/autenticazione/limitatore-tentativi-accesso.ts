export const DURATA_FINESTRA_TENTATIVI_ACCESSO_MS = 15 * 60 * 1000;
export const MASSIMO_TENTATIVI_ACCESSO_PER_IP = 10;
export const MASSIMO_TENTATIVI_ACCESSO_PER_EMAIL = 5;

interface FinestraTentativi {
  readonly iniziataIlMs: number;
  readonly tentativi: number;
}

/**
 * Limitatore a finestra fissa avviata dal primo tentativo per ciascuna chiave.
 * La registrazione e il controllo sono intenzionalmente sincroni: in una singola
 * istanza Node nessun altro tentativo puo inserirsi tra incremento e decisione.
 */
export class LimitatoreTentativiAccesso {
  private readonly finestrePerIp = new Map<string, FinestraTentativi>();
  private readonly finestrePerEmail = new Map<string, FinestraTentativi>();
  private prossimaPuliziaIlMs = 0;

  registraTentativo(
    indirizzoIp: string,
    emailNormalizzata: string,
    istante: Date,
  ): boolean {
    const istanteMs = istante.getTime();
    if (!Number.isFinite(istanteMs)) {
      throw new RangeError("L'istante del tentativo di accesso non e valido.");
    }

    this.pulisciFinestreScaduteSeNecessario(istanteMs);

    const tentativiIp = this.incrementa(
      this.finestrePerIp,
      indirizzoIp.trim(),
      istanteMs,
    );
    const tentativiEmail = this.incrementa(
      this.finestrePerEmail,
      emailNormalizzata,
      istanteMs,
    );

    return (
      tentativiIp <= MASSIMO_TENTATIVI_ACCESSO_PER_IP &&
      tentativiEmail <= MASSIMO_TENTATIVI_ACCESSO_PER_EMAIL
    );
  }

  private incrementa(
    finestre: Map<string, FinestraTentativi>,
    chiave: string,
    istanteMs: number,
  ): number {
    const corrente = finestre.get(chiave);
    if (
      corrente === undefined ||
      istanteMs - corrente.iniziataIlMs >=
        DURATA_FINESTRA_TENTATIVI_ACCESSO_MS
    ) {
      finestre.set(chiave, { iniziataIlMs: istanteMs, tentativi: 1 });
      return 1;
    }

    const tentativi = corrente.tentativi + 1;
    finestre.set(chiave, { ...corrente, tentativi });
    return tentativi;
  }

  private pulisciFinestreScaduteSeNecessario(istanteMs: number): void {
    if (istanteMs < this.prossimaPuliziaIlMs) {
      return;
    }

    this.rimuoviFinestreScadute(this.finestrePerIp, istanteMs);
    this.rimuoviFinestreScadute(this.finestrePerEmail, istanteMs);
    this.prossimaPuliziaIlMs =
      istanteMs + DURATA_FINESTRA_TENTATIVI_ACCESSO_MS;
  }

  private rimuoviFinestreScadute(
    finestre: Map<string, FinestraTentativi>,
    istanteMs: number,
  ): void {
    for (const [chiave, finestra] of finestre) {
      if (
        istanteMs - finestra.iniziataIlMs >=
        DURATA_FINESTRA_TENTATIVI_ACCESSO_MS
      ) {
        finestre.delete(chiave);
      }
    }
  }
}
