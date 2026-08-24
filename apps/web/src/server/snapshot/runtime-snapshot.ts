import { createHash } from "node:crypto";

import type {
  ConfigurazioneAsta,
  Reparto,
  StatFantacalcio,
  StatTattiche,
} from "@asta/contracts";
import {
  creaRepositories,
  PrismaClient,
  type Prisma,
  type SessioneAstaPersistita,
  type SnapshotPersistito,
} from "@asta/db";
import { PrismaPg } from "@prisma/adapter-pg";

import { caricaSessionePropria } from "../sessioni/carica-sessione-propria";
import { leggiCookie } from "../trpc/contesto";
import { ServizioConsultazioneSnapshot } from "./servizio-consultazione-snapshot";

const DURATA_INATTIVITA_MS = 24 * 60 * 60 * 1000;
const INTERVALLO_AGGIORNAMENTO_ATTIVITA_MS = 60 * 1000;

type RigaSessioneAsta = Prisma.SessioneAstaGetPayload<object>;
type RigaSnapshotPubblicato = Prisma.PubblicazioneSnapshotGetPayload<{
  include: { snapshot: { include: { giocatori: true } } };
}>;

const globale = globalThis as typeof globalThis & {
  __astaPrismaSnapshot?: PrismaClient;
};

function prismaRuntime(): PrismaClient {
  if (globale.__astaPrismaSnapshot !== undefined) {
    return globale.__astaPrismaSnapshot;
  }
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL non configurata.");
  }
  globale.__astaPrismaSnapshot = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globale.__astaPrismaSnapshot;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function mappaSessione(riga: RigaSessioneAsta): SessioneAstaPersistita {
  return {
    id: riga.id,
    utenteId: riga.utenteId,
    stagioneListone: riga.stagioneListone,
    stato: riga.stato,
    configurazione: {
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
    } as ConfigurazioneAsta,
    avvisiInformativiAttivi: riga.avvisiInformativiAttivi,
    creatoIl: riga.creatoIl,
    aggiornatoIl: riga.aggiornatoIl,
  };
}

function mappaSnapshot(
  pubblicazione: RigaSnapshotPubblicato,
): SnapshotPersistito | null {
  const riga = pubblicazione.snapshot;
  if (riga.stato !== "consultabile") return null;
  return {
    id: riga.id,
    stagioneListone: riga.stagioneListone,
    stagioneStatistiche: riga.stagioneStatistiche,
    stato: riga.stato,
    creatoIl: riga.creatoIl,
    numGiocatori: riga.numGiocatori,
    nomeSorgenteListone: riga.nomeSorgenteListone,
    nomeSorgenteStatistiche: riga.nomeSorgenteStatistiche,
    hashContenuto: riga.hashContenuto,
    giocatori: riga.giocatori.map((giocatore) => ({
      snapshotId: giocatore.snapshotId,
      identificativoGiocatore: giocatore.identificativoGiocatore,
      nome: giocatore.nome,
      nomeRicerca: giocatore.nomeRicerca,
      squadra: giocatore.squadra,
      ruoloClassic: giocatore.ruoloClassic as "P" | "D" | "C" | "A" | null,
      ruoliMantra: giocatore.ruoliMantra as Reparto[],
      quotazione: giocatore.quotazione,
      statFantacalcio:
        giocatore.statFantacalcio as unknown as StatFantacalcio,
      statTattiche: giocatore.statTattiche as unknown as StatTattiche,
    })),
  };
}

/** Costruisce il servizio protetto usando il sid della singola richiesta. */
export function creaServizioConsultazioneSnapshotPerRichiesta(
  richiesta: Request,
): ServizioConsultazioneSnapshot {
  const prisma = prismaRuntime();
  const tokenSessione = leggiCookie(richiesta.headers.get("cookie"), "sid");
  const autenticazione = {
    risolvi: async (token: string) => {
      const ora = new Date();
      const sessione = await prisma.sessioneAuth.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { utente: true },
      });
      if (sessione === null) return null;
      if (
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
        await prisma.sessioneAuth.updateMany({
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
      const riga = await prisma.sessioneAsta.findUnique({ where: { id } });
      return riga === null ? null : mappaSessione(riga);
    },
  };

  return new ServizioConsultazioneSnapshot({
    caricaSessionePropria: (sessioneAstaId) =>
      caricaSessionePropria(
        { tokenSessione, autenticazione, sessioniAsta },
        sessioneAstaId,
      ),
    snapshot: {
      trovaPubblicato: async (stagioneListone) => {
        const pubblicazione = await prisma.pubblicazioneSnapshot.findUnique({
          where: { stagioneListone },
          include: { snapshot: { include: { giocatori: true } } },
        });
        return pubblicazione === null ? null : mappaSnapshot(pubblicazione);
      },
    },
    registro: {
      trovaAttivaPerGiocatore: async (
        sessioneAstaId,
        identificativoGiocatore,
      ) => {
        const repositories = creaRepositories(prisma);
        return repositories.registro.trovaAttivaPerGiocatore(
          sessioneAstaId,
          identificativoGiocatore,
        );
      },
    },
    obiettivi: {
      elencaPerSessione: (sessioneAstaId) =>
        creaRepositories(prisma).obiettivi.elencaPerSessione(sessioneAstaId),
    },
    avversari: {
      trovaPerId: (id) => creaRepositories(prisma).avversari.trovaPerId(id),
    },
    consultazioniScheda: {
      registra: (input) => prisma.consultazioneScheda.create({ data: input }),
    },
    ora: () => new Date(),
  });
}
