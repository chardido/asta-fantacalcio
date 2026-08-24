import { createHash } from "node:crypto";

import type { ConfigurazioneAsta, VoceRegistro } from "@asta/contracts";
import { PrismaClient, type Prisma } from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import { leggiCookie } from "../trpc/contesto";
import { CanaleEventi } from "./canale-eventi";
import { TrasportoEventiPostgres } from "./trasporto-postgres";

const DURATA_INATTIVITA_MS = 24 * 60 * 60 * 1000;
const INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS = 60 * 1000;

interface RuntimeEventi {
  readonly prisma: PrismaClient;
  readonly trasporto: TrasportoEventiPostgres;
}

const globale = globalThis as typeof globalThis & {
  __astaRuntimeEventi?: RuntimeEventi;
};

function creaRuntime(): RuntimeEventi {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }
  return {
    prisma: new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    }),
    trasporto: new TrasportoEventiPostgres(connectionString),
  };
}

function runtime(): RuntimeEventi {
  globale.__astaRuntimeEventi ??= creaRuntime();
  return globale.__astaRuntimeEventi;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function mappaVoceRegistro(
  riga: Prisma.VoceRegistroAcquistiGetPayload<object>,
): VoceRegistro {
  return {
    id: riga.id,
    sessioneAstaId: riga.sessioneAstaId,
    ordinale: riga.ordinale,
    identificativoGiocatore: riga.identificativoGiocatore,
    nomeGiocatore: riga.nomeGiocatore,
    ruolo: riga.ruolo as VoceRegistro["ruolo"],
    squadra: riga.squadra,
    repartoAssegnato: riga.repartoAssegnato as VoceRegistro["repartoAssegnato"],
    macroReparto: riga.macroReparto as VoceRegistro["macroReparto"],
    prezzoAcquisto: riga.prezzoAcquisto,
    assegnatarioTipo: riga.assegnatarioTipo,
    avversarioId: riga.avversarioId,
    annullataIl: riga.annullataIl?.toISOString() ?? null,
    chiaveIdempotenza: riga.chiaveIdempotenza,
    giocatoreAssenteDatiCorrenti: riga.giocatoreAssenteDatiCorrenti,
  } as VoceRegistro;
}

/** Costruisce il canale protetto usando il sid della singola richiesta. */
export function creaCanaleEventiPerRichiesta(richiesta: Request): CanaleEventi {
  const corrente = runtime();
  const tokenSessione = leggiCookie(richiesta.headers.get("cookie"), "sid");
  const autenticazione = {
    risolvi: async (token: string) => {
      const ora = new Date();
      const sessione = await corrente.prisma.sessioneAuth.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { utente: true },
      });
      if (
        sessione === null ||
        sessione.revocataIl !== null ||
        ora.getTime() - sessione.ultimaAttivitaIl.getTime() >=
          DURATA_INATTIVITA_MS ||
        ora >= sessione.scadeIlAssoluto
      ) {
        return null;
      }
      if (
        ora.getTime() - sessione.ultimaAttivitaIl.getTime() >=
        INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS
      ) {
        await corrente.prisma.sessioneAuth.updateMany({
          where: {
            id: sessione.id,
            ultimaAttivitaIl: {
              lte: new Date(
                ora.getTime() - INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS,
              ),
            },
          },
          data: { ultimaAttivitaIl: ora },
        });
      }
      return {
        id: sessione.utente.id,
        email: sessione.utente.emailVisualizzata,
        creatoIl: sessione.utente.creatoIl,
      };
    },
  };
  const sessioniAsta = {
    trovaPerId: async (id: string) => {
      const riga = await corrente.prisma.sessioneAsta.findUnique({
        where: { id },
      });
      if (riga === null) return null;
      const configurazione = {
        nome: riga.nome,
        tipoAsta: riga.tipoAsta,
        modalitaGioco: riga.modalitaGioco,
        numeroPartecipanti: riga.numeroPartecipanti,
        creditiIniziali: riga.creditiIniziali,
        modificatoreDifesa: riga.modificatoreDifesa,
        composizioneRosa:
          riga.composizioneRosa as ConfigurazioneAsta["composizioneRosa"],
        quoteReparto:
          riga.quoteReparto as ConfigurazioneAsta["quoteReparto"],
        pesiValutazione:
          riga.pesiValutazione as ConfigurazioneAsta["pesiValutazione"],
      } as ConfigurazioneAsta;
      return {
        id: riga.id,
        utenteId: riga.utenteId,
        stagioneListone: riga.stagioneListone,
        stato: riga.stato,
        configurazione,
        avvisiInformativiAttivi: riga.avvisiInformativiAttivi,
        creatoIl: riga.creatoIl,
        aggiornatoIl: riga.aggiornatoIl,
      };
    },
  };

  return new CanaleEventi({
    caricaSessionePropria: (sessioneAstaId) =>
      caricaSessionePropria(
        { tokenSessione, autenticazione, sessioniAsta },
        sessioneAstaId,
      ),
    registro: {
      elencaPerSessione: async (sessioneAstaId) => {
        const righe = await corrente.prisma.voceRegistroAcquisti.findMany({
          where: { sessioneAstaId },
          orderBy: { ordinale: "asc" },
        });
        return righe.map(mappaVoceRegistro);
      },
    },
    trasporto: corrente.trasporto,
  });
}
