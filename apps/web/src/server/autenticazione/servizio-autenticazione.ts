import { createHash, randomBytes } from "node:crypto";

import { hash, verify, type Options } from "@node-rs/argon2";

import type {
  RepositorySessioniAuth,
  RepositoryUtenti,
  SessioneAuthPersistita,
  UtentePersistito,
} from "@asta/db";

import { LimitatoreTentativiAccesso } from "./limitatore-tentativi-accesso";

const EMAIL_LUNGHEZZA_MASSIMA = 254;
const PASSWORD_LUNGHEZZA_MINIMA = 8;
const PASSWORD_LUNGHEZZA_MASSIMA = 128;
const BYTE_TOKEN_SESSIONE = 32;
const DURATA_INATTIVITA_MS = 24 * 60 * 60 * 1000;
const DURATA_ASSOLUTA_MS = 30 * 24 * 60 * 60 * 1000;
const INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS = 60 * 1000;

export const PARAMETRI_ARGON2ID: Readonly<Options> = Object.freeze({
  algorithm: 2,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
});

/** Hash Argon2id precalcolato usato per mantenere invariato il lavoro di verifica. */
export const HASH_PASSWORD_FITTIZIO =
  "$argon2id$v=19$m=19456,t=2,p=1$VuNbw2iKpf2qPbIVnkuivw$AS+LeXAno03WP7OubkM+A/7tVnegQYBOPX6wZnivuS8";

export interface UtenteRegistrato {
  readonly id: string;
  readonly email: string;
  readonly creatoIl: Date;
}

export interface CookieSid {
  readonly name: "sid";
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

export interface SessioneAvviata {
  readonly utente: UtenteRegistrato;
  /** Valore da trasferire esclusivamente nel cookie sid, mai da persistere. */
  readonly tokenSessione: string;
  readonly cookie: CookieSid;
  readonly creatoIl: Date;
  readonly scadeIlAssoluto: Date;
}

export interface ErroreAccesso {
  readonly codice: "credenziali_non_valide";
  readonly messaggio: "Credenziali non valide.";
}

export type RisultatoAccesso =
  | { readonly ok: true; readonly valore: SessioneAvviata }
  | { readonly ok: false; readonly errore: ErroreAccesso };

export type ErroreRegistrazione =
  | {
      readonly codice: "email_non_valida";
      readonly campo: "email";
      readonly vincolo: "presenza_di_@_dominio_non_vuoto_lunghezza_massima_254";
      readonly messaggio: "Il formato dell'indirizzo email non è valido.";
    }
  | {
      readonly codice: "password_lunghezza_non_valida";
      readonly campo: "password";
      readonly vincolo: "lunghezza_compresa_tra_8_e_128";
      readonly minimo: 8;
      readonly massimo: 128;
      readonly messaggio: "La password deve contenere da 8 a 128 caratteri.";
    }
  | {
      readonly codice: "email_gia_registrata";
      readonly campo: "email";
      readonly vincolo: "email_normalizzata_univoca";
      readonly messaggio: "L'indirizzo email è già registrato.";
    };

export type RisultatoRegistrazione =
  | { readonly ok: true; readonly valore: UtenteRegistrato }
  | { readonly ok: false; readonly errore: ErroreRegistrazione };

export type RisultatoRegistrazioneConSessione =
  | { readonly ok: true; readonly valore: SessioneAvviata }
  | { readonly ok: false; readonly errore: ErroreRegistrazione };

export interface DipendenzeAutenticazione {
  readonly ora?: () => Date;
  readonly generaByteCasuali?: (numeroByte: number) => Uint8Array;
  readonly verificaPassword?: (
    passwordHash: string,
    password: string,
  ) => Promise<boolean>;
  readonly limitatoreTentativiAccesso?: LimitatoreTentativiAccesso;
}

interface EmailPreparata {
  readonly normalizzata: string;
  readonly visualizzata: string;
}

const ERRORE_EMAIL_NON_VALIDA: ErroreRegistrazione = {
  codice: "email_non_valida",
  campo: "email",
  vincolo: "presenza_di_@_dominio_non_vuoto_lunghezza_massima_254",
  messaggio: "Il formato dell'indirizzo email non è valido.",
};

const ERRORE_PASSWORD_NON_VALIDA: ErroreRegistrazione = {
  codice: "password_lunghezza_non_valida",
  campo: "password",
  vincolo: "lunghezza_compresa_tra_8_e_128",
  minimo: PASSWORD_LUNGHEZZA_MINIMA,
  massimo: PASSWORD_LUNGHEZZA_MASSIMA,
  messaggio: "La password deve contenere da 8 a 128 caratteri.",
};

const ERRORE_EMAIL_GIA_REGISTRATA: ErroreRegistrazione = {
  codice: "email_gia_registrata",
  campo: "email",
  vincolo: "email_normalizzata_univoca",
  messaggio: "L'indirizzo email è già registrato.",
};

const ERRORE_CREDENZIALI_NON_VALIDE: ErroreAccesso = Object.freeze({
  codice: "credenziali_non_valide",
  messaggio: "Credenziali non valide.",
});

// Condiviso fra le istanze del servizio nello stesso processo server: il limite
// non dipende dal ciclo di vita scelto dal futuro composition root/API.
const LIMITATORE_TENTATIVI_ACCESSO_PREDEFINITO =
  new LimitatoreTentativiAccesso();

/** Prepara le due rappresentazioni persistite dell'email senza alterarne il contenuto interno. */
export function preparaEmail(email: string): EmailPreparata {
  const visualizzata = email.trim();
  return {
    visualizzata,
    normalizzata: visualizzata.toLowerCase(),
  };
}

/** Applica esclusivamente i vincoli email richiesti dal requisito 1.4. */
export function emailValida(email: string): boolean {
  if (email.length > EMAIL_LUNGHEZZA_MASSIMA) {
    return false;
  }

  const ultimoSeparatore = email.lastIndexOf("@");
  return ultimoSeparatore >= 0 && ultimoSeparatore < email.length - 1;
}

/** La password non viene normalizzata: gli estremi 8 e 128 sono inclusivi. */
export function passwordValida(password: string): boolean {
  return (
    password.length >= PASSWORD_LUNGHEZZA_MINIMA &&
    password.length <= PASSWORD_LUNGHEZZA_MASSIMA
  );
}

/** Restituisce il solo valore persistibile di un token di sessione. */
export function hashTokenSessione(tokenSessione: string): string {
  return createHash("sha256").update(tokenSessione, "utf8").digest("hex");
}

/** Descrittore direttamente compatibile con cookies().set di Next.js. */
export function creaCookieSid(tokenSessione: string): CookieSid {
  return {
    name: "sid",
    value: tokenSessione,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DURATA_ASSOLUTA_MS / 1000,
  };
}

/** Cancella sid mantenendo gli stessi attributi di sicurezza e ambito. */
export function creaCookieSidScaduto(): CookieSid {
  return { ...creaCookieSid(""), maxAge: 0 };
}

function erroreDiUnicitaPrisma(errore: unknown): boolean {
  if (typeof errore !== "object" || errore === null || !("code" in errore)) {
    return false;
  }

  return (errore as { readonly code?: unknown }).code === "P2002";
}

function utentePubblico(utente: UtentePersistito): UtenteRegistrato {
  return {
    id: utente.id,
    email: utente.emailVisualizzata,
    creatoIl: utente.creatoIl,
  };
}

function successoRegistrazione(utente: UtentePersistito): RisultatoRegistrazione {
  return { ok: true, valore: utentePubblico(utente) };
}

function sessioneValida(sessione: SessioneAuthPersistita, istante: Date): boolean {
  const ora = istante.getTime();
  return (
    sessione.revocataIl === null &&
    ora < sessione.ultimaAttivitaIl.getTime() + DURATA_INATTIVITA_MS &&
    ora < sessione.scadeIlAssoluto.getTime()
  );
}

export class ServizioAutenticazione {
  private readonly ora: () => Date;
  private readonly generaByteCasuali: (numeroByte: number) => Uint8Array;
  private readonly verificaPassword: (
    passwordHash: string,
    password: string,
  ) => Promise<boolean>;
  private readonly limitatoreTentativiAccesso: LimitatoreTentativiAccesso;

  constructor(
    private readonly utenti: RepositoryUtenti,
    private readonly sessioniAuth?: RepositorySessioniAuth,
    dipendenze: DipendenzeAutenticazione = {},
  ) {
    this.ora = dipendenze.ora ?? (() => new Date());
    this.generaByteCasuali =
      dipendenze.generaByteCasuali ?? ((numeroByte) => randomBytes(numeroByte));
    this.verificaPassword = dipendenze.verificaPassword ?? verify;
    this.limitatoreTentativiAccesso =
      dipendenze.limitatoreTentativiAccesso ??
      LIMITATORE_TENTATIVI_ACCESSO_PREDEFINITO;
  }

  async registra(email: string, password: string): Promise<RisultatoRegistrazione> {
    const emailPreparata = preparaEmail(email);

    if (!emailValida(emailPreparata.visualizzata)) {
      return { ok: false, errore: ERRORE_EMAIL_NON_VALIDA };
    }

    if (!passwordValida(password)) {
      return { ok: false, errore: ERRORE_PASSWORD_NON_VALIDA };
    }

    const esistente = await this.utenti.trovaPerEmailNormalizzata(
      emailPreparata.normalizzata,
    );
    if (esistente !== null) {
      return { ok: false, errore: ERRORE_EMAIL_GIA_REGISTRATA };
    }

    const passwordHash = await hash(password, PARAMETRI_ARGON2ID);

    try {
      const creato = await this.utenti.crea({
        emailNormalizzata: emailPreparata.normalizzata,
        emailVisualizzata: emailPreparata.visualizzata,
        passwordHash,
      });
      return successoRegistrazione(creato);
    } catch (error_: unknown) {
      // La ricerca preventiva migliora il messaggio comune; il vincolo DB copre la gara
      // fra due registrazioni contemporanee con la stessa email normalizzata.
      if (erroreDiUnicitaPrisma(error_)) {
        return { ok: false, errore: ERRORE_EMAIL_GIA_REGISTRATA };
      }
      throw error_;
    }
  }

  /** Registra l'utente e avvia subito la sessione richiesta dal flusso di registrazione. */
  async registraConSessione(
    email: string,
    password: string,
  ): Promise<RisultatoRegistrazioneConSessione> {
    const registrazione = await this.registra(email, password);
    if (!registrazione.ok) {
      return registrazione;
    }

    const utente = await this.utenti.trovaPerId(registrazione.valore.id);
    if (utente === null) {
      throw new Error("L'utente appena registrato non è più disponibile.");
    }

    return { ok: true, valore: await this.avviaSessione(utente) };
  }

  async accedi(
    email: string,
    password: string,
    indirizzoIp: string,
  ): Promise<RisultatoAccesso> {
    const emailNormalizzata = preparaEmail(email).normalizzata;
    const tentativoConsentito =
      this.limitatoreTentativiAccesso.registraTentativo(
        indirizzoIp,
        emailNormalizzata,
        this.istanteCorrente(),
      );
    const utente = await this.utenti.trovaPerEmailNormalizzata(emailNormalizzata);
    const hashDaVerificare = utente?.passwordHash ?? HASH_PASSWORD_FITTIZIO;
    const passwordCorretta = await this.verificaPassword(
      hashDaVerificare,
      password,
    );

    // Anche un tentativo limitato completa lookup e verifica Argon2: contenuto,
    // lavoro osservabile e assenza di sessione coincidono con credenziali errate.
    if (!tentativoConsentito || utente === null || !passwordCorretta) {
      return { ok: false, errore: ERRORE_CREDENZIALI_NON_VALIDE };
    }

    return { ok: true, valore: await this.avviaSessione(utente) };
  }

  async esci(tokenSessione: string): Promise<void> {
    const sessioniAuth = this.repositorySessioniAuth();
    const sessione = await sessioniAuth.trovaPerTokenHash(
      hashTokenSessione(tokenSessione),
    );
    if (sessione !== null && sessione.revocataIl === null) {
      await sessioniAuth.revoca(sessione.id, this.istanteCorrente());
    }
  }

  async risolvi(tokenSessione: string): Promise<UtenteRegistrato | null> {
    const sessioniAuth = this.repositorySessioniAuth();
    const sessione = await sessioniAuth.trovaPerTokenHash(
      hashTokenSessione(tokenSessione),
    );
    const istante = this.istanteCorrente();

    if (sessione === null || !sessioneValida(sessione, istante)) {
      return null;
    }

    const trascorsoDallUltimoAggiornamento =
      istante.getTime() - sessione.ultimaAttivitaIl.getTime();
    if (
      trascorsoDallUltimoAggiornamento >=
      INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS
    ) {
      await sessioniAuth.aggiornaUltimaAttivitaSePrecedenteA(
        sessione.id,
        new Date(istante.getTime() - INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS),
        istante,
      );
    }

    const utente = await this.utenti.trovaPerId(sessione.utenteId);
    return utente === null ? null : utentePubblico(utente);
  }

  private async avviaSessione(utente: UtentePersistito): Promise<SessioneAvviata> {
    const byteCasuali = this.generaByteCasuali(BYTE_TOKEN_SESSIONE);
    if (byteCasuali.byteLength !== BYTE_TOKEN_SESSIONE) {
      throw new Error("La sorgente di casualita deve produrre esattamente 32 byte.");
    }

    const tokenSessione = Buffer.from(byteCasuali).toString("base64url");
    const istante = this.istanteCorrente();
    const sessione = await this.repositorySessioniAuth().crea({
      utenteId: utente.id,
      tokenHash: hashTokenSessione(tokenSessione),
      ultimaAttivitaIl: istante,
      scadeIlAssoluto: new Date(istante.getTime() + DURATA_ASSOLUTA_MS),
    });

    return {
      utente: utentePubblico(utente),
      tokenSessione,
      cookie: creaCookieSid(tokenSessione),
      creatoIl: sessione.creatoIl,
      scadeIlAssoluto: sessione.scadeIlAssoluto,
    };
  }

  private repositorySessioniAuth(): RepositorySessioniAuth {
    if (this.sessioniAuth === undefined) {
      throw new Error("Il repository delle sessioni auth non e configurato.");
    }
    return this.sessioniAuth;
  }

  private istanteCorrente(): Date {
    return new Date(Number(this.ora()));
  }
}
