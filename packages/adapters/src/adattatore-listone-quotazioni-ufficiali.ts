import { Readable } from "node:stream";

import ExcelJS from "exceljs";

import {
  rispostaListoneGrezzaSchema,
  type RispostaListoneGrezza,
  type VoceListoneGrezza,
} from "@asta/contracts";

import type {
  AdattatoreSorgenteListone,
  LimitiFrequenza,
  SegnaleAnnullamento,
} from "./sorgenti.js";

const ORIGINE_FANTACALCIO = "https://www.fantacalcio.it";
const UN_GIORNO_MS = 24 * 60 * 60 * 1_000;
const DIMENSIONE_MASSIMA_PREDEFINITA = 20 * 1024 * 1024;
const NUMERO_MASSIMO_RIGHE_INTESTAZIONE = 30;

export const NOME_ADATTATORE_LISTONE_QUOTAZIONI_UFFICIALI =
  "listone-quotazioni-ufficiali";
export const USER_AGENT_LISTONE_QUOTAZIONI_UFFICIALI =
  "asta-fantacalcio-companion/0.0.0";
export const LIMITI_LISTONE_QUOTAZIONI_UFFICIALI: LimitiFrequenza =
  Object.freeze({
    richiesteMassime: 1,
    finestraMs: UN_GIORNO_MS,
  });

type FunzioneRecupero = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RisolutoreUrlFile = (stagione: string) => string | URL;

export interface ConfigurazioneAdattatoreListoneQuotazioniUfficiali {
  /** URL diretto del file pubblicato oppure funzione che lo risolve per stagione. */
  readonly urlFile?: string | URL | RisolutoreUrlFile;
  readonly urlRobots?: string | URL;
  readonly userAgent?: string;
  readonly nome?: string;
  readonly limiti?: LimitiFrequenza;
  readonly dimensioneMassimaByte?: number;
  /** Confine iniettabile usato dai test e da runtime con implementazioni fetch compatibili. */
  readonly recuperaHttp?: FunzioneRecupero;
}

export type CodiceErroreListoneQuotazioniUfficiali =
  | "stagione_non_valida"
  | "robots_non_accessibile"
  | "accesso_negato_robots"
  | "file_non_accessibile"
  | "limite_frequenza"
  | "risposta_troppo_grande"
  | "formato_non_supportato"
  | "formato_non_valido";

/** Errore operativo classificabile dal worker senza conoscere HTTP, XLSX o CSV. */
export class ErroreListoneQuotazioniUfficiali extends Error {
  override readonly name = "ErroreListoneQuotazioniUfficiali";

  constructor(
    readonly codice: CodiceErroreListoneQuotazioniUfficiali,
    messaggio: string,
    opzioni?: ErrorOptions,
  ) {
    super(messaggio, opzioni);
  }
}

interface RegolaRobots {
  readonly consenti: boolean;
  readonly modello: string;
}

interface GruppoRobots {
  readonly agenti: readonly string[];
  readonly regole: readonly RegolaRobots[];
}

interface ColonneListone {
  readonly id: number;
  readonly nome: number;
  readonly squadra: number;
  readonly ruoloClassic?: number;
  readonly ruoliMantra?: number;
  readonly quotazioneClassic?: number;
  readonly quotazioneGenerica?: number;
  readonly quotazioneMantra?: number;
}

interface VoceIntermedia extends VoceListoneGrezza {
  readonly prioritaQuotazione: number;
}

const ALIAS_ID = new Set(["id", "id calciatore", "id giocatore"]);
const ALIAS_NOME = new Set(["nome", "calciatore", "giocatore"]);
const ALIAS_SQUADRA = new Set(["squadra", "sq", "team"]);
const ALIAS_RUOLO_CLASSIC = new Set([
  "r",
  "ruolo",
  "ruolo classic",
  "r classic",
  "classic ruolo",
]);
const ALIAS_RUOLI_MANTRA = new Set([
  "rm",
  "ruolo mantra",
  "ruoli mantra",
  "r mantra",
  "mantra ruolo",
]);
const ALIAS_QUOTAZIONE_CLASSIC = new Set([
  "qa classic",
  "qt a classic",
  "quotazione attuale classic",
  "classic qa",
  "classic qt a",
]);
const ALIAS_QUOTAZIONE_MANTRA = new Set([
  "qa mantra",
  "qt a mantra",
  "quotazione attuale mantra",
  "mantra qa",
  "mantra qt a",
]);
const ALIAS_QUOTAZIONE_GENERICA = new Set([
  "qa",
  "qt a",
  "quotazione",
  "quotazione attuale",
]);

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

function validaUrlHttp(url: string | URL, descrizione: string): URL {
  const risultato = new URL(url);
  if (risultato.protocol !== "https:" && risultato.protocol !== "http:") {
    throw new TypeError(`${descrizione} deve usare il protocollo HTTP o HTTPS`);
  }
  return risultato;
}

/**
 * Converte la stagione applicativa nel percorso pubblico corrente del provider.
 * La configurazione permette di sostituire questa convenzione senza modificare
 * il resto della pipeline quando il provider cambia URL.
 */
export function risolviUrlFileQuotazioniUfficiali(stagione: string): URL {
  const corrispondenza = /^(\d{4})\s*[/-]\s*(\d{2}|\d{4})$/.exec(
    stagione.trim(),
  );
  if (!corrispondenza) {
    throw new ErroreListoneQuotazioniUfficiali(
      "stagione_non_valida",
      `La stagione "${stagione}" deve avere formato AAAA/AAAA oppure AAAA-AA`,
    );
  }

  const annoIniziale = Number(corrispondenza[1]);
  const parteFinale = corrispondenza[2];
  const annoFinale =
    parteFinale?.length === 2
      ? Math.floor(annoIniziale / 100) * 100 + Number(parteFinale)
      : Number(parteFinale);
  const identificativoCampionato = annoIniziale - 2005;

  if (
    annoFinale !== annoIniziale + 1 ||
    !Number.isInteger(identificativoCampionato) ||
    identificativoCampionato < 1
  ) {
    throw new ErroreListoneQuotazioniUfficiali(
      "stagione_non_valida",
      `La stagione "${stagione}" non identifica due anni consecutivi supportati`,
    );
  }

  return new URL(
    `/api/v1/Excel/prices/${identificativoCampionato}/1`,
    ORIGINE_FANTACALCIO,
  );
}

function normalizzaTesto(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valoreCella(valore: ExcelJS.CellValue | undefined): unknown {
  if (valore === null || valore === undefined) return undefined;
  if (valore instanceof Date) return valore.toISOString();
  if (typeof valore !== "object") return valore;
  if ("result" in valore) return valoreCella(valore.result);
  if ("richText" in valore) {
    return valore.richText.map((parte) => parte.text).join("");
  }
  if ("text" in valore) return valore.text;
  return String(valore);
}

function testoCella(valore: unknown): string {
  if (valore === null || valore === undefined) return "";
  if (typeof valore === "number") return String(valore);
  return String(valore).trim();
}

function numeroCella(valore: unknown): number | undefined {
  if (typeof valore === "number") {
    return Number.isFinite(valore) ? valore : undefined;
  }
  const testo = testoCella(valore).replace(/\s/g, "");
  if (testo.length === 0) return undefined;
  const normalizzato = /^-?\d+,\d+$/.test(testo)
    ? testo.replace(",", ".")
    : testo.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const numero = Number(normalizzato);
  return Number.isFinite(numero) ? numero : undefined;
}

function separaRuoli(valore: unknown): string[] {
  const testo = testoCella(valore);
  if (testo.length === 0 || testo === "-") return [];
  return [
    ...new Set(
      testo
        .split(/[;,/|]+/)
        .map((ruolo) => ruolo.trim())
        .filter((ruolo) => ruolo.length > 0),
    ),
  ];
}

function trovaIndice(
  intestazioni: readonly string[],
  alias: ReadonlySet<string>,
): number | undefined {
  const indice = intestazioni.findIndex((intestazione) => alias.has(intestazione));
  return indice >= 0 ? indice : undefined;
}

function combinaIntestazione(
  precedente: string,
  corrente: string,
): string {
  if (precedente.length === 0) return corrente;
  if (corrente.length === 0) return precedente;
  return `${precedente} ${corrente}`;
}

function trovaColonne(righe: readonly (readonly unknown[])[]): {
  readonly indiceIntestazione: number;
  readonly colonne: ColonneListone;
} {
  const limite = Math.min(righe.length, NUMERO_MASSIMO_RIGHE_INTESTAZIONE);

  for (let indiceRiga = 0; indiceRiga < limite; indiceRiga += 1) {
    const riga = righe[indiceRiga] ?? [];
    const precedente = righe[indiceRiga - 1] ?? [];
    const larghezza = Math.max(riga.length, precedente.length);
    const semplici = Array.from({ length: larghezza }, (_, indice) =>
      normalizzaTesto(testoCella(riga[indice])),
    );
    const composte = semplici.map((corrente, indice) =>
      normalizzaTesto(
        combinaIntestazione(
          normalizzaTesto(testoCella(precedente[indice])),
          corrente,
        ),
      ),
    );
    const cerca = (alias: ReadonlySet<string>): number | undefined =>
      trovaIndice(composte, alias) ?? trovaIndice(semplici, alias);

    const id = cerca(ALIAS_ID);
    const nome = cerca(ALIAS_NOME);
    const squadra = cerca(ALIAS_SQUADRA);
    const ruoloClassic = cerca(ALIAS_RUOLO_CLASSIC);
    const ruoliMantra = cerca(ALIAS_RUOLI_MANTRA);
    const quotazioneClassic = cerca(ALIAS_QUOTAZIONE_CLASSIC);
    const quotazioneMantra = cerca(ALIAS_QUOTAZIONE_MANTRA);
    const quotazioneGenerica = cerca(ALIAS_QUOTAZIONE_GENERICA);

    if (
      id !== undefined &&
      nome !== undefined &&
      squadra !== undefined &&
      (ruoloClassic !== undefined || ruoliMantra !== undefined) &&
      (quotazioneClassic !== undefined ||
        quotazioneGenerica !== undefined ||
        quotazioneMantra !== undefined)
    ) {
      return {
        indiceIntestazione: indiceRiga,
        colonne: {
          id,
          nome,
          squadra,
          ...(ruoloClassic === undefined ? {} : { ruoloClassic }),
          ...(ruoliMantra === undefined ? {} : { ruoliMantra }),
          ...(quotazioneClassic === undefined ? {} : { quotazioneClassic }),
          ...(quotazioneGenerica === undefined
            ? {}
            : { quotazioneGenerica }),
          ...(quotazioneMantra === undefined ? {} : { quotazioneMantra }),
        },
      };
    }
  }

  throw new ErroreListoneQuotazioniUfficiali(
    "formato_non_valido",
    "Il file delle quotazioni non contiene le colonne Id, nome, squadra, ruolo e quotazione attese",
  );
}

function leggiRighe(
  righe: readonly (readonly unknown[])[],
  origine: string,
): VoceIntermedia[] {
  const { indiceIntestazione, colonne } = trovaColonne(righe);
  const risultato: VoceIntermedia[] = [];

  for (let indice = indiceIntestazione + 1; indice < righe.length; indice += 1) {
    const riga = righe[indice] ?? [];
    const identificativoGiocatore = testoCella(riga[colonne.id]);
    const nome = testoCella(riga[colonne.nome]);
    const squadra = testoCella(riga[colonne.squadra]);
    const ruoloClassicTesto =
      colonne.ruoloClassic === undefined
        ? ""
        : testoCella(riga[colonne.ruoloClassic]);
    const ruoliMantra =
      colonne.ruoliMantra === undefined
        ? []
        : separaRuoli(riga[colonne.ruoliMantra]);

    if (
      identificativoGiocatore.length === 0 &&
      nome.length === 0 &&
      squadra.length === 0 &&
      ruoloClassicTesto.length === 0 &&
      ruoliMantra.length === 0
    ) {
      continue;
    }

    const quotazioneClassic =
      colonne.quotazioneClassic === undefined
        ? undefined
        : numeroCella(riga[colonne.quotazioneClassic]);
    const quotazioneGenerica =
      colonne.quotazioneGenerica === undefined
        ? undefined
        : numeroCella(riga[colonne.quotazioneGenerica]);
    const quotazioneMantra =
      colonne.quotazioneMantra === undefined
        ? undefined
        : numeroCella(riga[colonne.quotazioneMantra]);
    const quotazione =
      quotazioneClassic ?? quotazioneGenerica ?? quotazioneMantra;

    if (quotazione === undefined) {
      throw new ErroreListoneQuotazioniUfficiali(
        "formato_non_valido",
        `Quotazione non numerica nel foglio ${origine}, riga ${indice + 1}, giocatore "${identificativoGiocatore || nome}"`,
      );
    }

    risultato.push({
      identificativoGiocatore,
      nome,
      squadra,
      ruoloClassic: ruoloClassicTesto.length > 0 ? ruoloClassicTesto : null,
      ruoliMantra,
      quotazione,
      prioritaQuotazione:
        quotazioneClassic !== undefined
          ? 3
          : quotazioneGenerica !== undefined
            ? 2
            : 1,
    });
  }

  return risultato;
}

function unisciModalita(voci: readonly VoceIntermedia[]): VoceListoneGrezza[] {
  const perIdentificativo = new Map<string, VoceIntermedia>();

  for (const voce of voci) {
    const esistente = perIdentificativo.get(voce.identificativoGiocatore);
    if (!esistente) {
      perIdentificativo.set(voce.identificativoGiocatore, voce);
      continue;
    }

    if (
      esistente.nome !== voce.nome ||
      esistente.squadra !== voce.squadra ||
      (esistente.ruoloClassic !== null &&
        voce.ruoloClassic !== null &&
        esistente.ruoloClassic !== voce.ruoloClassic)
    ) {
      throw new ErroreListoneQuotazioniUfficiali(
        "formato_non_valido",
        `Dati discordanti per l'identificativo giocatore "${voce.identificativoGiocatore}"`,
      );
    }

    const usaNuovaQuotazione =
      voce.prioritaQuotazione > esistente.prioritaQuotazione;
    perIdentificativo.set(voce.identificativoGiocatore, {
      identificativoGiocatore: voce.identificativoGiocatore,
      nome: esistente.nome,
      squadra: esistente.squadra,
      ruoloClassic: esistente.ruoloClassic ?? voce.ruoloClassic,
      ruoliMantra: [...new Set([...esistente.ruoliMantra, ...voce.ruoliMantra])],
      quotazione: usaNuovaQuotazione
        ? voce.quotazione
        : esistente.quotazione,
      prioritaQuotazione: Math.max(
        esistente.prioritaQuotazione,
        voce.prioritaQuotazione,
      ),
    });
  }

  return [...perIdentificativo.values()].map(
    ({ prioritaQuotazione: _prioritaQuotazione, ...voce }) => voce,
  );
}

function scegliSeparatore(contenuto: string): string {
  const primaRiga = contenuto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/, 1)[0] ?? "";
  const candidati = [";", ",", "\t"];
  let migliore = ";";
  let numeroMigliore = -1;

  for (const candidato of candidati) {
    let numero = 0;
    let traVirgolette = false;
    for (let indice = 0; indice < primaRiga.length; indice += 1) {
      const carattere = primaRiga[indice];
      if (carattere === '"') traVirgolette = !traVirgolette;
      if (!traVirgolette && carattere === candidato) numero += 1;
    }
    if (numero > numeroMigliore) {
      migliore = candidato;
      numeroMigliore = numero;
    }
  }

  return migliore;
}

function decodificaCsv(contenuto: string): unknown[][] {
  const testo = contenuto.replace(/^\uFEFF/, "");
  const separatore = scegliSeparatore(testo);
  const righe: unknown[][] = [];
  let riga: string[] = [];
  let campo = "";
  let traVirgolette = false;

  const completaCampo = (): void => {
    riga.push(campo);
    campo = "";
  };
  const completaRiga = (): void => {
    completaCampo();
    righe.push(riga);
    riga = [];
  };

  for (let indice = 0; indice < testo.length; indice += 1) {
    const carattere = testo[indice];
    if (carattere === '"') {
      if (traVirgolette && testo[indice + 1] === '"') {
        campo += '"';
        indice += 1;
      } else {
        traVirgolette = !traVirgolette;
      }
    } else if (carattere === separatore && !traVirgolette) {
      completaCampo();
    } else if ((carattere === "\n" || carattere === "\r") && !traVirgolette) {
      if (carattere === "\r" && testo[indice + 1] === "\n") indice += 1;
      completaRiga();
    } else {
      campo += carattere;
    }
  }

  if (traVirgolette) {
    throw new ErroreListoneQuotazioniUfficiali(
      "formato_non_valido",
      "Il CSV delle quotazioni contiene un campo tra virgolette non terminato",
    );
  }
  if (campo.length > 0 || riga.length > 0) completaRiga();
  return righe;
}

async function decodificaXlsx(
  contenuto: Buffer<ArrayBuffer>,
): Promise<VoceListoneGrezza[]> {
  const cartella = new ExcelJS.Workbook();
  try {
    await cartella.xlsx.read(Readable.from([contenuto]));
  } catch (errore_) {
    throw new ErroreListoneQuotazioniUfficiali(
      "formato_non_valido",
      "Il file delle quotazioni non e un XLSX valido",
      { cause: errore_ },
    );
  }

  const voci: VoceIntermedia[] = [];
  for (const foglio of cartella.worksheets) {
    const righe: unknown[][] = [];
    foglio.eachRow({ includeEmpty: false }, (riga) => {
      const valori: unknown[] = [];
      riga.eachCell({ includeEmpty: true }, (cella, numeroColonna) => {
        valori[numeroColonna - 1] = valoreCella(cella.value);
      });
      righe.push(valori);
    });
    if (righe.length === 0) continue;

    try {
      voci.push(...leggiRighe(righe, foglio.name));
    } catch (errore_) {
      if (
        errore_ instanceof ErroreListoneQuotazioniUfficiali &&
        errore_.codice === "formato_non_valido" &&
        /non contiene le colonne/.test(errore_.message)
      ) {
        continue;
      }
      throw errore_;
    }
  }

  if (voci.length === 0) {
    throw new ErroreListoneQuotazioniUfficiali(
      "formato_non_valido",
      "Nessun foglio XLSX contiene un listone riconoscibile",
    );
  }
  return unisciModalita(voci);
}

function analizzaRobots(contenuto: string): GruppoRobots[] {
  const gruppi: { agenti: string[]; regole: RegolaRobots[] }[] = [];
  let gruppo: { agenti: string[]; regole: RegolaRobots[] } | undefined;

  for (const rigaOriginale of contenuto.split(/\r?\n/)) {
    const riga = rigaOriginale.replace(/#.*$/, "").trim();
    if (riga.length === 0) continue;
    const separatore = riga.indexOf(":");
    if (separatore < 0) continue;
    const campo = riga.slice(0, separatore).trim().toLowerCase();
    const valore = riga.slice(separatore + 1).trim();

    if (campo === "user-agent") {
      if (!gruppo || gruppo.regole.length > 0) {
        gruppo = { agenti: [], regole: [] };
        gruppi.push(gruppo);
      }
      gruppo.agenti.push(valore.toLowerCase());
    } else if (
      gruppo &&
      (campo === "allow" || campo === "disallow") &&
      valore.length > 0
    ) {
      gruppo.regole.push({ consenti: campo === "allow", modello: valore });
    }
  }

  return gruppi;
}

function modelloRobotsCorrisponde(modello: string, percorso: string): boolean {
  const ancoraFinale = modello.endsWith("$");
  const senzaAncora = ancoraFinale ? modello.slice(0, -1) : modello;
  const espressione = senzaAncora
    .split("*")
    .map((parte) => parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${espressione}${ancoraFinale ? "$" : ""}`).test(percorso);
}

function robotsConsente(
  contenuto: string,
  userAgent: string,
  url: URL,
): boolean {
  const agente = userAgent.toLowerCase();
  const gruppi = analizzaRobots(contenuto);
  const corrispondenti = gruppi
    .map((gruppo) => ({
      gruppo,
      specificita: Math.max(
        ...gruppo.agenti.map((voce) =>
          voce === "*" ? 0 : agente.includes(voce) ? voce.length : -1,
        ),
      ),
    }))
    .filter(({ specificita }) => specificita >= 0);
  if (corrispondenti.length === 0) return true;
  const specificitaMassima = Math.max(
    ...corrispondenti.map(({ specificita }) => specificita),
  );
  const percorso = `${url.pathname}${url.search}`;
  const regole = corrispondenti
    .filter(({ specificita }) => specificita === specificitaMassima)
    .flatMap(({ gruppo }) => gruppo.regole)
    .filter((regola) => modelloRobotsCorrisponde(regola.modello, percorso))
    .sort((a, b) => {
      const differenza = b.modello.length - a.modello.length;
      return differenza !== 0 ? differenza : Number(b.consenti) - Number(a.consenti);
    });
  return regole[0]?.consenti ?? true;
}

function descriviErroreSchema(
  errore: { readonly issues: readonly { readonly path: PropertyKey[]; readonly message: string }[] },
): string {
  return errore.issues
    .map((issue) => `${issue.path.join(".") || "radice"}: ${issue.message}`)
    .join("; ");
}

/**
 * Adattatore della sorgente ufficiale. Effettua solo I/O e traduzione nel DTO
 * canonico: validazione di dominio e pubblicazione restano nella pipeline.
 */
export class AdattatoreListoneQuotazioniUfficiali
  implements AdattatoreSorgenteListone
{
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
  readonly userAgent: string;
  readonly dimensioneMassimaByte: number;

  readonly #urlFile: string | URL | RisolutoreUrlFile;
  readonly #urlRobots?: string | URL;
  readonly #recuperaHttp: FunzioneRecupero;

  constructor(
    configurazione: ConfigurazioneAdattatoreListoneQuotazioniUfficiali = {},
  ) {
    this.nome =
      configurazione.nome ?? NOME_ADATTATORE_LISTONE_QUOTAZIONI_UFFICIALI;
    this.userAgent =
      configurazione.userAgent ?? USER_AGENT_LISTONE_QUOTAZIONI_UFFICIALI;
    this.dimensioneMassimaByte =
      configurazione.dimensioneMassimaByte ?? DIMENSIONE_MASSIMA_PREDEFINITA;
    this.limiti = validaLimiti(
      configurazione.limiti ?? LIMITI_LISTONE_QUOTAZIONI_UFFICIALI,
    );
    this.#urlFile =
      configurazione.urlFile ?? risolviUrlFileQuotazioniUfficiali;
    this.#urlRobots = configurazione.urlRobots;
    this.#recuperaHttp = configurazione.recuperaHttp ?? globalThis.fetch;

    if (this.nome.trim().length === 0) {
      throw new TypeError("Il nome dell'adattatore non puo essere vuoto");
    }
    if (this.userAgent.trim().length === 0) {
      throw new TypeError("Lo User-Agent identificativo non puo essere vuoto");
    }
    if (
      !Number.isInteger(this.dimensioneMassimaByte) ||
      this.dimensioneMassimaByte < 1
    ) {
      throw new TypeError("La dimensione massima deve essere un intero positivo");
    }
    if (typeof this.#recuperaHttp !== "function") {
      throw new TypeError("Una funzione fetch compatibile e obbligatoria");
    }
  }

  async recupera(
    stagione: string,
    segnale: SegnaleAnnullamento,
  ): Promise<RispostaListoneGrezza> {
    if (stagione.trim().length === 0) {
      throw new TypeError("La stagione richiesta non puo essere vuota");
    }
    segnale.throwIfAborted();

    const urlFile = validaUrlHttp(
      typeof this.#urlFile === "function"
        ? this.#urlFile(stagione)
        : this.#urlFile,
      "L'URL del file delle quotazioni",
    );
    const urlRobots = validaUrlHttp(
      this.#urlRobots ?? new URL("/robots.txt", urlFile),
      "L'URL di robots.txt",
    );

    let rispostaRobots: Response;
    try {
      rispostaRobots = await this.#recuperaHttp(urlRobots, {
        headers: {
          accept: "text/plain",
          "user-agent": this.userAgent,
        },
        signal: segnale,
      });
    } catch (errore_) {
      if (segnale.aborted) throw errore_;
      throw new ErroreListoneQuotazioniUfficiali(
        "robots_non_accessibile",
        `Impossibile verificare robots.txt della sorgente ${urlRobots.origin}`,
        { cause: errore_ },
      );
    }

    if (rispostaRobots.status !== 404 && !rispostaRobots.ok) {
      throw new ErroreListoneQuotazioniUfficiali(
        "robots_non_accessibile",
        `robots.txt ha risposto con stato HTTP ${rispostaRobots.status}`,
      );
    }
    if (
      rispostaRobots.status !== 404 &&
      !robotsConsente(await rispostaRobots.text(), this.userAgent, urlFile)
    ) {
      throw new ErroreListoneQuotazioniUfficiali(
        "accesso_negato_robots",
        `robots.txt non consente il recupero di ${urlFile.pathname}`,
      );
    }

    segnale.throwIfAborted();
    let rispostaFile: Response;
    try {
      rispostaFile = await this.#recuperaHttp(urlFile, {
        headers: {
          accept:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv;q=0.9, application/csv;q=0.9",
          "user-agent": this.userAgent,
        },
        signal: segnale,
      });
    } catch (errore_) {
      if (segnale.aborted) throw errore_;
      throw new ErroreListoneQuotazioniUfficiali(
        "file_non_accessibile",
        `Impossibile recuperare il file ufficiale delle quotazioni da ${urlFile.origin}`,
        { cause: errore_ },
      );
    }

    if (rispostaFile.status === 429) {
      throw new ErroreListoneQuotazioniUfficiali(
        "limite_frequenza",
        "La sorgente ufficiale ha segnalato il superamento del limite di frequenza",
      );
    }
    if (!rispostaFile.ok) {
      throw new ErroreListoneQuotazioniUfficiali(
        "file_non_accessibile",
        `Il file ufficiale delle quotazioni ha risposto con stato HTTP ${rispostaFile.status}`,
      );
    }

    const lunghezzaDichiarata = Number(
      rispostaFile.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(lunghezzaDichiarata) &&
      lunghezzaDichiarata > this.dimensioneMassimaByte
    ) {
      throw new ErroreListoneQuotazioniUfficiali(
        "risposta_troppo_grande",
        `Il file dichiara ${lunghezzaDichiarata} byte, oltre il limite di ${this.dimensioneMassimaByte}`,
      );
    }

    const contenuto = Buffer.from(await rispostaFile.arrayBuffer());
    if (contenuto.byteLength > this.dimensioneMassimaByte) {
      throw new ErroreListoneQuotazioniUfficiali(
        "risposta_troppo_grande",
        `Il file contiene ${contenuto.byteLength} byte, oltre il limite di ${this.dimensioneMassimaByte}`,
      );
    }
    segnale.throwIfAborted();

    const tipoContenuto =
      rispostaFile.headers.get("content-type")?.toLowerCase() ?? "";
    const eXlsx =
      contenuto[0] === 0x50 &&
      contenuto[1] === 0x4b &&
      (tipoContenuto.includes("spreadsheet") ||
        tipoContenuto.includes("excel") ||
        urlFile.pathname.toLowerCase().endsWith(".xlsx") ||
        !tipoContenuto.includes("text"));
    const eCsv =
      tipoContenuto.includes("csv") ||
      urlFile.pathname.toLowerCase().endsWith(".csv") ||
      tipoContenuto.startsWith("text/plain");

    let giocatori: VoceListoneGrezza[];
    if (eXlsx) {
      giocatori = await decodificaXlsx(contenuto);
    } else if (eCsv) {
      giocatori = unisciModalita(
        leggiRighe(decodificaCsv(contenuto.toString("utf8")), "CSV"),
      );
    } else {
      throw new ErroreListoneQuotazioniUfficiali(
        "formato_non_supportato",
        `Formato del file ufficiale non supportato: ${tipoContenuto || "sconosciuto"}`,
      );
    }

    const candidato = {
      nomeSorgente: this.nome,
      stagione,
      giocatori,
    };
    const risultato = rispostaListoneGrezzaSchema.safeParse(candidato);
    if (!risultato.success) {
      throw new ErroreListoneQuotazioniUfficiali(
        "formato_non_valido",
        `La traduzione non rispetta RispostaListoneGrezza: ${descriviErroreSchema(risultato.error)}`,
        { cause: risultato.error },
      );
    }
    return risultato.data;
  }
}
