import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
  VoceListoneGrezza,
  VoceStatisticheGrezza,
} from "@asta/contracts";
import type {
  AliasGiocatoreDaSalvare,
  AliasGiocatorePersistito,
  RepositoryAliasGiocatori,
} from "@asta/db";
import { createHash } from "node:crypto";

const SEPARATORE_IDENTITA = "\u0000";

function tokenNormalizzati(valore: string): string[] {
  const senzaDiacritici = valore
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const testo = senzaDiacritici.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return testo.length === 0 ? [] : testo.split(/\s+/u);
}

/**
 * Normalizza un nome ignorando maiuscole, segni diacritici, punteggiatura e
 * ordine dei termini, come richiesto dal Risolutore_Identita del design.
 */
export function normalizzaNomeIdentita(nome: string): string {
  return tokenNormalizzati(nome)
    .sort((sinistra, destra) => sinistra.localeCompare(destra, "it"))
    .join(" ");
}

/** Normalizza la squadra senza alterare l'ordine significativo dei termini. */
export function normalizzaSquadraIdentita(squadra: string): string {
  return tokenNormalizzati(squadra).join(" ");
}

function chiaveIdentita(nome: string, squadra: string): string {
  return `${normalizzaNomeIdentita(nome)}${SEPARATORE_IDENTITA}${normalizzaSquadraIdentita(squadra)}`;
}

function hashIdentita(nomeNormalizzato: string, squadraNormalizzata: string): string {
  return createHash("sha1")
    .update(`${nomeNormalizzato}|${squadraNormalizzata}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/**
 * Mantiene l'identificativo autoritativo del listone; quando manca genera il
 * fallback deterministico richiesto dal task.
 */
export function identificativoGiocatoreListone(
  giocatore: Pick<VoceListoneGrezza, "identificativoGiocatore" | "nome" | "squadra">,
): string {
  const identificativo = giocatore.identificativoGiocatore.trim();
  return identificativo.length > 0
    ? identificativo
    : hashIdentita(
        normalizzaNomeIdentita(giocatore.nome),
        normalizzaSquadraIdentita(giocatore.squadra),
      );
}

function identificativoStatistica(voce: VoceStatisticheGrezza): string {
  const identificativo = voce.identificativoSorgente?.trim();
  return identificativo && identificativo.length > 0
    ? identificativo
    : hashIdentita(
        normalizzaNomeIdentita(voce.nome),
        normalizzaSquadraIdentita(voce.squadra),
      );
}

export interface RisultatoRisoluzioneIdentita {
  /** Listone completo, inclusi i giocatori privi di statistiche. */
  readonly listone: RispostaListoneGrezza;
  /** Sole statistiche accoppiate, canonizzate su nome e squadra del listone. */
  readonly statistiche: RispostaStatisticheGrezza;
  readonly accoppiati: ReadonlyMap<string, VoceStatisticheGrezza>;
  readonly nonRisolti: readonly VoceStatisticheGrezza[];
  readonly aliasDaSalvare: readonly AliasGiocatoreDaSalvare[];
}

function indicizzaListonePerIdentita(
  giocatori: readonly VoceListoneGrezza[],
): ReadonlyMap<string, readonly VoceListoneGrezza[]> {
  const indice = new Map<string, VoceListoneGrezza[]>();
  for (const giocatore of giocatori) {
    const chiave = chiaveIdentita(giocatore.nome, giocatore.squadra);
    const candidati = indice.get(chiave) ?? [];
    candidati.push(giocatore);
    indice.set(chiave, candidati);
  }
  return indice;
}

/**
 * Funzione pura di accoppiamento. Un alias persistito ha precedenza sul match
 * testuale; un'identità ambigua o già assegnata resta non risolta.
 */
export function accoppiaIdentita(
  listoneGrezzo: RispostaListoneGrezza,
  statisticheGrezze: RispostaStatisticheGrezza,
  alias: readonly Pick<
    AliasGiocatorePersistito,
    "nomeSorgente" | "identificativoSorgente" | "identificativoGiocatore"
  >[],
): RisultatoRisoluzioneIdentita {
  const listone: RispostaListoneGrezza = {
    ...listoneGrezzo,
    giocatori: listoneGrezzo.giocatori.map((giocatore) => ({
      ...giocatore,
      identificativoGiocatore: identificativoGiocatoreListone(giocatore),
    })),
  };
  const perIdentita = indicizzaListonePerIdentita(listone.giocatori);
  const perIdentificativo = new Map(
    listone.giocatori.map((giocatore) => [
      giocatore.identificativoGiocatore,
      giocatore,
    ]),
  );
  const aliasPerIdentificativo = new Map(
    alias
      .filter((voce) => voce.nomeSorgente === statisticheGrezze.nomeSorgente)
      .map((voce) => [voce.identificativoSorgente, voce]),
  );

  const identificativiAccoppiati = new Set<string>();
  const accoppiati = new Map<string, VoceStatisticheGrezza>();
  const nonRisolti: VoceStatisticheGrezza[] = [];
  const statisticheCanoniche: VoceStatisticheGrezza[] = [];
  const aliasDaSalvare = new Map<string, AliasGiocatoreDaSalvare>();

  for (const statistica of statisticheGrezze.giocatori) {
    const identificativoSorgente = identificativoStatistica(statistica);
    const aliasPersistito = aliasPerIdentificativo.get(identificativoSorgente);
    const daAlias = aliasPersistito?.identificativoGiocatore
      ? perIdentificativo.get(aliasPersistito.identificativoGiocatore)
      : undefined;
    const candidati = perIdentita.get(
      chiaveIdentita(statistica.nome, statistica.squadra),
    );
    const daIdentita = candidati?.length === 1 ? candidati[0] : undefined;
    const giocatore = daAlias ?? daIdentita;
    const identificativoGiocatore = giocatore?.identificativoGiocatore ?? null;
    const disponibile =
      identificativoGiocatore !== null &&
      !identificativiAccoppiati.has(identificativoGiocatore);

    aliasDaSalvare.set(identificativoSorgente, {
      nomeSorgente: statisticheGrezze.nomeSorgente,
      identificativoSorgente,
      nomeNormalizzato: normalizzaNomeIdentita(statistica.nome),
      squadraNormalizzata: normalizzaSquadraIdentita(statistica.squadra),
      identificativoGiocatore: disponibile ? identificativoGiocatore : null,
    });

    if (!giocatore || !disponibile) {
      nonRisolti.push(statistica);
      continue;
    }

    const canonica: VoceStatisticheGrezza = {
      ...statistica,
      identificativoSorgente,
      nome: giocatore.nome,
      squadra: giocatore.squadra,
    };
    identificativiAccoppiati.add(giocatore.identificativoGiocatore);
    accoppiati.set(giocatore.identificativoGiocatore, canonica);
    statisticheCanoniche.push(canonica);
  }

  return {
    listone,
    statistiche: {
      ...statisticheGrezze,
      giocatori: statisticheCanoniche,
    },
    accoppiati,
    nonRisolti,
    aliasDaSalvare: [...aliasDaSalvare.values()],
  };
}

/** Coordina il risolutore puro con la tabella persistente degli alias. */
export class RisolutoreIdentita {
  constructor(private readonly repositoryAlias: RepositoryAliasGiocatori) {}

  async accoppia(
    listone: RispostaListoneGrezza,
    statistiche: RispostaStatisticheGrezza,
  ): Promise<RisultatoRisoluzioneIdentita> {
    const alias = await this.repositoryAlias.elencaPerSorgente(
      statistiche.nomeSorgente,
    );
    const risultato = accoppiaIdentita(listone, statistiche, alias);
    for (const voce of risultato.aliasDaSalvare) {
      await this.repositoryAlias.salva(voce);
    }
    return risultato;
  }
}
