import {
  configurazioneAstaSchema,
  repartoClassicSchema,
  repartoMantraSchema,
  repartoSchema,
  voceRegistroSchema,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  leggiComposizioneRosaJson,
  leggiPesiValutazioneJson,
  leggiQuoteRepartoJson,
  leggiStatFantacalcioJson,
  leggiStatTatticheJson,
  scriviComposizioneRosaJson,
  scriviPesiValutazioneJson,
  scriviQuoteRepartoJson,
  scriviStatFantacalcioJson,
  scriviStatTatticheJson,
} from "./jsonb.js";
import {
  codificaPayloadMutazioneRegistro,
  nomeCanaleEventiSessione,
} from "./canale-eventi.js";
import type {
  AliasGiocatoreDaSalvare,
  AliasGiocatorePersistito,
  AvversarioPersistito,
  ConsultazioneSchedaPersistita,
  EsitoCreazioneAvversario,
  EsitoCreazioneObiettivo,
  EsitoCreazioneSessioneAsta,
  GestoreTransazioniRegistro,
  GiocatoreSnapshotPersistito,
  LockIngestioneDaAcquisire,
  NuovaConsultazioneScheda,
  NuovaSessioneAsta,
  NuovaSessioneAuth,
  NuovoObiettivo,
  NuovoSnapshot,
  NuovoUtente,
  ObiettivoPersistito,
  Repositories,
  RepositoryAliasGiocatori,
  RepositoryAvversari,
  RepositoryConsultazioniScheda,
  RepositoryFreschezza,
  RepositoryIngestione,
  RepositoryObiettivi,
  RepositoryRegistro,
  RepositorySessioniAsta,
  RepositorySessioniAuth,
  RepositorySnapshot,
  RepositoryUtenti,
  RegistroTransazionale,
  SessioneAstaPersistita,
  SessioneAuthPersistita,
  SnapshotPersistito,
  StatoFreschezzaDaSalvare,
  StatoFreschezzaPersistito,
  StatoLimitazioneFrequenzaDaSalvare,
  TentativoIngestioneDaRegistrare,
  PubblicazioneSnapshotAtomica,
  UtentePersistito,
  VoceRegistroDaImportare,
} from "./repository-contracts.js";

type RigaUtente = Prisma.UtenteGetPayload<object>;
type RigaSessioneAuth = Prisma.SessioneAuthGetPayload<object>;
type RigaSessioneAsta = Prisma.SessioneAstaGetPayload<object>;
type RigaAvversario = Prisma.AvversarioGetPayload<object>;
type RigaRegistro = Prisma.VoceRegistroAcquistiGetPayload<object>;
type RigaObiettivo = Prisma.VoceObiettivoGetPayload<object>;
type RigaGiocatoreSnapshot = Prisma.GiocatoreSnapshotGetPayload<object>;
type RigaSnapshotConGiocatori = Prisma.SnapshotDatiGetPayload<{
  include: { giocatori: true };
}>;
type RigaFreschezza = Prisma.StatoFreschezzaGetPayload<object>;
type RigaAliasGiocatore = Prisma.AliasGiocatoreGetPayload<object>;
type ClientRegistro = Pick<PrismaClient, "voceRegistroAcquisti">;
type ClientRegistroTransazionale = ClientRegistro &
  Pick<Prisma.TransactionClient, "avversario" | "$executeRaw">;

/** Errore stabile esposto al servizio quando PostgreSQL rifiuta un vincolo unico del registro. */
export class ErroreUnicitaRegistro extends Error {
  override readonly name = "ErroreUnicitaRegistro";

  constructor(readonly causa: unknown) {
    super("Un vincolo di unicità del registro è stato violato.");
  }
}

function errorePrismaUnicita(errore: unknown): boolean {
  return (
    typeof errore === "object" &&
    errore !== null &&
    "code" in errore &&
    errore.code === "P2002"
  );
}

function jsonPrisma(valore: unknown): Prisma.InputJsonValue {
  return valore as Prisma.InputJsonValue;
}

function mappaUtente(riga: RigaUtente): UtentePersistito {
  return riga;
}

function mappaSessioneAuth(riga: RigaSessioneAuth): SessioneAuthPersistita {
  return riga;
}

function validaConfigurazione(configurazione: ConfigurazioneAsta): ConfigurazioneAsta {
  const validata = configurazioneAstaSchema.parse(configurazione);
  return {
    ...validata,
    composizioneRosa: scriviComposizioneRosaJson(
      validata.modalitaGioco,
      validata.composizioneRosa,
    ),
    quoteReparto: scriviQuoteRepartoJson(validata.quoteReparto),
    pesiValutazione: scriviPesiValutazioneJson(validata.pesiValutazione),
  } as ConfigurazioneAsta;
}

function configurazioneDaRiga(riga: RigaSessioneAsta): ConfigurazioneAsta {
  return configurazioneAstaSchema.parse({
    nome: riga.nome,
    tipoAsta: riga.tipoAsta,
    modalitaGioco: riga.modalitaGioco,
    numeroPartecipanti: riga.numeroPartecipanti,
    creditiIniziali: riga.creditiIniziali,
    modificatoreDifesa: riga.modificatoreDifesa,
    composizioneRosa: leggiComposizioneRosaJson(
      riga.modalitaGioco,
      riga.composizioneRosa,
    ),
    quoteReparto: leggiQuoteRepartoJson(riga.quoteReparto),
    pesiValutazione: leggiPesiValutazioneJson(riga.pesiValutazione),
  });
}

function datiConfigurazione(configurazione: ConfigurazioneAsta) {
  const validata = validaConfigurazione(configurazione);
  return {
    nome: validata.nome,
    tipoAsta: validata.tipoAsta,
    modalitaGioco: validata.modalitaGioco,
    numeroPartecipanti: validata.numeroPartecipanti,
    creditiIniziali: validata.creditiIniziali,
    modificatoreDifesa: validata.modificatoreDifesa,
    composizioneRosa: jsonPrisma(validata.composizioneRosa),
    quoteReparto: jsonPrisma(validata.quoteReparto),
    pesiValutazione: jsonPrisma(validata.pesiValutazione),
  };
}

function mappaSessioneAsta(riga: RigaSessioneAsta): SessioneAstaPersistita {
  return {
    id: riga.id,
    utenteId: riga.utenteId,
    stagioneListone: riga.stagioneListone,
    stato: riga.stato,
    configurazione: configurazioneDaRiga(riga),
    avvisiInformativiAttivi: riga.avvisiInformativiAttivi,
    creatoIl: riga.creatoIl,
    aggiornatoIl: riga.aggiornatoIl,
  };
}

function mappaRegistro(riga: RigaRegistro): VoceRegistro {
  return voceRegistroSchema.parse({
    id: riga.id,
    sessioneAstaId: riga.sessioneAstaId,
    ordinale: riga.ordinale,
    identificativoGiocatore: riga.identificativoGiocatore,
    nomeGiocatore: riga.nomeGiocatore,
    ruolo: riga.ruolo,
    squadra: riga.squadra,
    repartoAssegnato: riga.repartoAssegnato,
    macroReparto: riga.macroReparto,
    prezzoAcquisto: riga.prezzoAcquisto,
    assegnatarioTipo: riga.assegnatarioTipo,
    avversarioId: riga.avversarioId,
    annullataIl: riga.annullataIl?.toISOString() ?? null,
    chiaveIdempotenza: riga.chiaveIdempotenza,
    giocatoreAssenteDatiCorrenti: riga.giocatoreAssenteDatiCorrenti,
  });
}

function datiRegistro(voce: VoceRegistro): Prisma.VoceRegistroAcquistiUncheckedCreateInput {
  const validata = voceRegistroSchema.parse(voce);
  return {
    ...validata,
    annullataIl:
      validata.annullataIl === null ? null : new Date(validata.annullataIl),
  };
}

function mappaAvversario(riga: RigaAvversario): AvversarioPersistito {
  return riga;
}

function mappaObiettivo(riga: RigaObiettivo): ObiettivoPersistito {
  return {
    ...riga,
    reparto: repartoSchema.parse(riga.reparto),
  };
}

function mappaGiocatoreSnapshot(
  riga: RigaGiocatoreSnapshot,
): GiocatoreSnapshotPersistito {
  return {
    snapshotId: riga.snapshotId,
    identificativoGiocatore: riga.identificativoGiocatore,
    nome: riga.nome,
    nomeRicerca: riga.nomeRicerca,
    squadra: riga.squadra,
    ruoloClassic:
      riga.ruoloClassic === null
        ? null
        : repartoClassicSchema.parse(riga.ruoloClassic),
    ruoliMantra: riga.ruoliMantra.map((ruolo) =>
      repartoMantraSchema.parse(ruolo),
    ),
    quotazione: riga.quotazione,
    statFantacalcio: leggiStatFantacalcioJson(riga.statFantacalcio),
    statTattiche: leggiStatTatticheJson(riga.statTattiche),
  };
}

function datiGiocatoreSnapshot(
  snapshotId: string,
  giocatore: Omit<GiocatoreSnapshotPersistito, "snapshotId">,
): Prisma.GiocatoreSnapshotCreateManyInput {
  const ruoloClassic =
    giocatore.ruoloClassic === null
      ? null
      : repartoClassicSchema.parse(giocatore.ruoloClassic);
  const ruoliMantra = giocatore.ruoliMantra.map((ruolo) =>
    repartoMantraSchema.parse(ruolo),
  );

  return {
    ...giocatore,
    snapshotId,
    ruoloClassic,
    ruoliMantra,
    statFantacalcio: jsonPrisma(
      scriviStatFantacalcioJson(giocatore.statFantacalcio),
    ),
    statTattiche: jsonPrisma(scriviStatTatticheJson(giocatore.statTattiche)),
  };
}

function mappaSnapshot(riga: RigaSnapshotConGiocatori): SnapshotPersistito {
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
    giocatori: riga.giocatori.map(mappaGiocatoreSnapshot),
  };
}

function mappaFreschezza(riga: RigaFreschezza): StatoFreschezzaPersistito {
  return riga;
}

export class PrismaRepositoryUtenti implements RepositoryUtenti {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(input: NuovoUtente): Promise<UtentePersistito> {
    return mappaUtente(await this.prisma.utente.create({ data: input }));
  }

  async trovaPerId(id: string): Promise<UtentePersistito | null> {
    const riga = await this.prisma.utente.findUnique({ where: { id } });
    return riga === null ? null : mappaUtente(riga);
  }

  async trovaPerEmailNormalizzata(emailNormalizzata: string): Promise<UtentePersistito | null> {
    const riga = await this.prisma.utente.findUnique({
      where: { emailNormalizzata },
    });
    return riga === null ? null : mappaUtente(riga);
  }
}

export class PrismaRepositorySessioniAuth implements RepositorySessioniAuth {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(input: NuovaSessioneAuth): Promise<SessioneAuthPersistita> {
    return mappaSessioneAuth(
      await this.prisma.sessioneAuth.create({ data: input }),
    );
  }

  async trovaPerTokenHash(tokenHash: string): Promise<SessioneAuthPersistita | null> {
    const riga = await this.prisma.sessioneAuth.findUnique({
      where: { tokenHash },
    });
    return riga === null ? null : mappaSessioneAuth(riga);
  }

  async aggiornaUltimaAttivita(id: string, ultimaAttivitaIl: Date): Promise<SessioneAuthPersistita> {
    return mappaSessioneAuth(
      await this.prisma.sessioneAuth.update({
        where: { id },
        data: { ultimaAttivitaIl },
      }),
    );
  }

  async aggiornaUltimaAttivitaSePrecedenteA(
    id: string,
    soglia: Date,
    ultimaAttivitaIl: Date,
  ): Promise<boolean> {
    const risultato = await this.prisma.sessioneAuth.updateMany({
      where: {
        id,
        ultimaAttivitaIl: { lte: soglia },
        revocataIl: null,
        scadeIlAssoluto: { gt: ultimaAttivitaIl },
      },
      data: { ultimaAttivitaIl },
    });
    return risultato.count === 1;
  }

  async revoca(id: string, revocataIl: Date): Promise<SessioneAuthPersistita> {
    return mappaSessioneAuth(
      await this.prisma.sessioneAuth.update({
        where: { id },
        data: { revocataIl },
      }),
    );
  }
}

export class PrismaRepositorySessioniAsta implements RepositorySessioniAsta {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(input: NuovaSessioneAsta): Promise<SessioneAstaPersistita> {
    const riga = await this.prisma.sessioneAsta.create({
      data: {
        utenteId: input.utenteId,
        stagioneListone: input.stagioneListone,
        stato: input.stato ?? "in_corso",
        avvisiInformativiAttivi: input.avvisiInformativiAttivi ?? true,
        ...datiConfigurazione(input.configurazione),
      },
    });
    return mappaSessioneAsta(riga);
  }

  async creaEntroLimite(
    input: NuovaSessioneAsta,
    limite: number,
    nomiCandidati: readonly string[],
  ): Promise<EsitoCreazioneSessioneAsta> {
    const configurazioniCandidate = [
      ...new Set(nomiCandidati),
    ].map((nome) =>
      configurazioneAstaSchema.parse({
        ...input.configurazione,
        nome,
      }),
    );

    if (!Number.isInteger(limite) || limite < 1) {
      throw new RangeError("Il limite delle sessioni deve essere un intero positivo.");
    }
    if (configurazioniCandidate.length === 0) {
      throw new RangeError("Deve essere fornito almeno un nome candidato.");
    }

    return this.prisma.$transaction(async (transaction) => {
      // Il lock dell'utente serializza conteggio e inserimento per lo stesso
      // proprietario, impedendo che due creazioni concorrenti superino il limite.
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "utente" WHERE "id" = ${input.utenteId}::uuid FOR UPDATE`,
      );

      const numeroSessioni = await transaction.sessioneAsta.count({
        where: { utenteId: input.utenteId },
      });
      if (numeroSessioni >= limite) {
        return { ok: false, motivo: "limite_sessioni" };
      }

      const nomiOccupati = await transaction.sessioneAsta.findMany({
        where: {
          utenteId: input.utenteId,
          nome: { in: configurazioniCandidate.map(({ nome }) => nome) },
        },
        select: { nome: true },
      });
      const insiemeNomiOccupati = new Set(
        nomiOccupati.map(({ nome }) => nome),
      );
      const configurazione = configurazioniCandidate.find(
        ({ nome }) => !insiemeNomiOccupati.has(nome),
      );
      if (configurazione === undefined) {
        return { ok: false, motivo: "nome_duplicato" };
      }

      const riga = await transaction.sessioneAsta.create({
        data: {
          utenteId: input.utenteId,
          stagioneListone: input.stagioneListone,
          stato: input.stato ?? "in_corso",
          avvisiInformativiAttivi: input.avvisiInformativiAttivi ?? true,
          ...datiConfigurazione(configurazione),
        },
      });
      return { ok: true, sessione: mappaSessioneAsta(riga) };
    });
  }

  async trovaPerId(id: string): Promise<SessioneAstaPersistita | null> {
    const riga = await this.prisma.sessioneAsta.findUnique({ where: { id } });
    return riga === null ? null : mappaSessioneAsta(riga);
  }

  async elencaPerUtente(utenteId: string): Promise<readonly SessioneAstaPersistita[]> {
    const righe = await this.prisma.sessioneAsta.findMany({
      where: { utenteId },
      orderBy: { aggiornatoIl: "desc" },
    });
    return righe.map(mappaSessioneAsta);
  }

  async aggiornaConfigurazione(id: string, configurazione: ConfigurazioneAsta): Promise<SessioneAstaPersistita> {
    const riga = await this.prisma.sessioneAsta.update({
      where: { id },
      data: datiConfigurazione(configurazione),
    });
    return mappaSessioneAsta(riga);
  }

  async elimina(id: string): Promise<void> {
    await this.prisma.sessioneAsta.delete({ where: { id } });
  }
}

export class PrismaRepositoryRegistro implements RepositoryRegistro {
  constructor(private readonly prisma: ClientRegistro) {}

  async crea(voce: VoceRegistro): Promise<VoceRegistro> {
    try {
      return mappaRegistro(
        await this.prisma.voceRegistroAcquisti.create({
          data: datiRegistro(voce),
        }),
      );
    } catch (error_) {
      if (errorePrismaUnicita(error_)) {
        throw new ErroreUnicitaRegistro(error_);
      }
      throw error_;
    }
  }

  async trovaPerId(id: string): Promise<VoceRegistro | null> {
    const riga = await this.prisma.voceRegistroAcquisti.findUnique({
      where: { id },
    });
    return riga === null ? null : mappaRegistro(riga);
  }

  async trovaAttivaPerGiocatore(
    sessioneAstaId: string,
    identificativoGiocatore: string,
  ): Promise<VoceRegistro | null> {
    const riga = await this.prisma.voceRegistroAcquisti.findFirst({
      where: {
        sessioneAstaId,
        identificativoGiocatore,
        annullataIl: null,
      },
    });
    return riga === null ? null : mappaRegistro(riga);
  }

  async elencaPerSessione(sessioneAstaId: string): Promise<readonly VoceRegistro[]> {
    const righe = await this.prisma.voceRegistroAcquisti.findMany({
      where: { sessioneAstaId },
      orderBy: { ordinale: "asc" },
    });
    return righe.map(mappaRegistro);
  }

  async aggiornaPrezzo(id: string, prezzoAcquisto: number | null): Promise<VoceRegistro> {
    return mappaRegistro(
      await this.prisma.voceRegistroAcquisti.update({
        where: { id },
        data: { prezzoAcquisto },
      }),
    );
  }

  async annulla(id: string, annullataIl: Date): Promise<VoceRegistro> {
    return mappaRegistro(
      await this.prisma.voceRegistroAcquisti.update({
        where: { id },
        data: { annullataIl },
      }),
    );
  }
}

class PrismaRegistroTransazionale
  extends PrismaRepositoryRegistro
  implements RegistroTransazionale
{
  constructor(
    private readonly transazione: ClientRegistroTransazionale,
    private readonly sessioneAstaId: string,
  ) {
    super(transazione);
  }

  async notificaMutazione(ordinale: number): Promise<void> {
    await this.transazione.$executeRaw(
      Prisma.sql`SELECT pg_notify(
        ${nomeCanaleEventiSessione(this.sessioneAstaId)},
        ${codificaPayloadMutazioneRegistro(ordinale)}
      )`,
    );
  }

  async sostituisciDaImportazione(
    voci: readonly VoceRegistroDaImportare[],
  ): Promise<readonly VoceRegistro[]> {
    const vociValide = voci.map((voce) => {
      const { avversarioNome: _avversarioNome, ...persistibile } = voce;
      return voceRegistroSchema.parse({ ...persistibile, avversarioId: null });
    });
    if (vociValide.some((voce) => voce.sessioneAstaId !== this.sessioneAstaId)) {
      throw new Error("Tutte le voci importate devono appartenere alla sessione bloccata.");
    }

    await this.transazione.voceRegistroAcquisti.deleteMany({
      where: { sessioneAstaId: this.sessioneAstaId },
    });
    await this.transazione.avversario.deleteMany({
      where: { sessioneAstaId: this.sessioneAstaId },
    });

    const nomiAvversari = [
      ...new Set(
        voci
          .map((voce) => voce.avversarioNome)
          .filter((nome): nome is string => nome !== null),
      ),
    ];
    if (nomiAvversari.length > 0) {
      await this.transazione.avversario.createMany({
        data: nomiAvversari.map((nome) => ({
          sessioneAstaId: this.sessioneAstaId,
          nome,
        })),
      });
    }
    const avversari = await this.transazione.avversario.findMany({
      where: { sessioneAstaId: this.sessioneAstaId },
      select: { id: true, nome: true },
    });
    const idAvversarioPerNome = new Map(
      avversari.map((avversario) => [avversario.nome, avversario.id]),
    );

    const salvate: VoceRegistro[] = [];
    for (let indice = 0; indice < voci.length; indice += 1) {
      const voce = voci[indice];
      const validata = vociValide[indice];
      if (voce === undefined || validata === undefined) continue;
      const avversarioId =
        voce.avversarioNome === null
          ? null
          : (idAvversarioPerNome.get(voce.avversarioNome) ?? null);
      if (voce.avversarioNome !== null && avversarioId === null) {
        throw new Error("Impossibile risolvere l'avversario importato.");
      }
      const daSalvare: VoceRegistro =
        validata.assegnatarioTipo === "utente"
          ? { ...validata, avversarioId: null }
          : { ...validata, avversarioId };
      salvate.push(await this.crea(daSalvare));
    }
    return salvate;
  }
}

/**
 * Serializza le mutazioni della stessa sessione mediante lock di riga e usa il
 * timeout della transazione interattiva per garantire il rollback automatico.
 */
export class PrismaGestoreTransazioniRegistro
  implements GestoreTransazioniRegistro
{
  constructor(private readonly prisma: PrismaClient) {}

  async esegui<T>(
    sessioneAstaId: string,
    operazione: (registro: RegistroTransazionale) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new RangeError("Il timeout deve essere un intero positivo.");
    }

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "sessione_asta" WHERE "id" = ${sessioneAstaId}::uuid FOR UPDATE`,
        );
        return operazione(
          new PrismaRegistroTransazionale(transaction, sessioneAstaId),
        );
      },
      { timeout: timeoutMs, maxWait: timeoutMs },
    );
  }
}

/** Errore stabile esposto al servizio quando il nome di un avversario viola l'unicità. */
export class ErroreUnicitaAvversario extends Error {
  override readonly name = "ErroreUnicitaAvversario";

  constructor(readonly causa: unknown) {
    super("Il nome dell'avversario è già presente nella sessione.");
  }
}

export class PrismaRepositoryAvversari implements RepositoryAvversari {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(sessioneAstaId: string, nome: string): Promise<AvversarioPersistito> {
    try {
      return mappaAvversario(
        await this.prisma.avversario.create({ data: { sessioneAstaId, nome } }),
      );
    } catch (error_) {
      if (errorePrismaUnicita(error_)) {
        throw new ErroreUnicitaAvversario(error_);
      }
      throw error_;
    }
  }

  async creaEntroLimite(
    sessioneAstaId: string,
    nome: string,
    limite: number,
  ): Promise<EsitoCreazioneAvversario> {
    if (!Number.isInteger(limite) || limite < 1) {
      throw new RangeError("Il limite degli avversari deve essere un intero positivo.");
    }

    return this.prisma.$transaction(async (transaction) => {
      // Il lock della sessione serializza verifica del nome, conteggio e inserimento.
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "sessione_asta" WHERE "id" = ${sessioneAstaId}::uuid FOR UPDATE`,
      );

      const esistente = await transaction.avversario.findUnique({
        where: { sessioneAstaId_nome: { sessioneAstaId, nome } },
        select: { id: true },
      });
      if (esistente !== null) {
        return { ok: false, motivo: "nome_duplicato" };
      }

      const numeroAvversari = await transaction.avversario.count({
        where: { sessioneAstaId },
      });
      if (numeroAvversari >= limite) {
        return { ok: false, motivo: "limite_avversari" };
      }

      const riga = await transaction.avversario.create({
        data: { sessioneAstaId, nome },
      });
      return { ok: true, avversario: mappaAvversario(riga) };
    });
  }

  async trovaPerId(id: string): Promise<AvversarioPersistito | null> {
    const riga = await this.prisma.avversario.findUnique({ where: { id } });
    return riga === null ? null : mappaAvversario(riga);
  }

  async elencaPerSessione(sessioneAstaId: string): Promise<readonly AvversarioPersistito[]> {
    const righe = await this.prisma.avversario.findMany({
      where: { sessioneAstaId },
      orderBy: { creatoIl: "asc" },
    });
    return righe.map(mappaAvversario);
  }

  async rinomina(id: string, nome: string): Promise<AvversarioPersistito> {
    try {
      return mappaAvversario(
        await this.prisma.avversario.update({ where: { id }, data: { nome } }),
      );
    } catch (error_) {
      if (errorePrismaUnicita(error_)) {
        throw new ErroreUnicitaAvversario(error_);
      }
      throw error_;
    }
  }

  async elimina(id: string): Promise<void> {
    await this.prisma.avversario.delete({ where: { id } });
  }
}

export class PrismaRepositoryObiettivi implements RepositoryObiettivi {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(input: NuovoObiettivo): Promise<ObiettivoPersistito> {
    const reparto = repartoSchema.parse(input.reparto);
    return mappaObiettivo(
      await this.prisma.voceObiettivo.create({
        data: {
          ...input,
          reparto,
          prezzoMassimoPersonale: input.prezzoMassimoPersonale ?? null,
          priorita: input.priorita ?? 99,
          nonRaggiungibile: input.nonRaggiungibile ?? false,
        },
      }),
    );
  }

  async creaEntroLimite(
    input: NuovoObiettivo,
    limite: number,
  ): Promise<EsitoCreazioneObiettivo> {
    if (!Number.isInteger(limite) || limite < 1) {
      throw new RangeError("Il limite degli obiettivi deve essere un intero positivo.");
    }
    const reparto = repartoSchema.parse(input.reparto);

    return this.prisma.$transaction(async (transaction) => {
      // Il lock della sessione serializza unicità, conteggio e inserimento.
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "sessione_asta" WHERE "id" = ${input.sessioneAstaId}::uuid FOR UPDATE`,
      );

      const esistente = await transaction.voceObiettivo.findUnique({
        where: {
          sessioneAstaId_identificativoGiocatore: {
            sessioneAstaId: input.sessioneAstaId,
            identificativoGiocatore: input.identificativoGiocatore,
          },
        },
        select: { id: true },
      });
      if (esistente !== null) {
        return { ok: false, motivo: "obiettivo_duplicato" };
      }

      const numeroObiettivi = await transaction.voceObiettivo.count({
        where: { sessioneAstaId: input.sessioneAstaId },
      });
      if (numeroObiettivi >= limite) {
        return { ok: false, motivo: "limite_obiettivi" };
      }

      const riga = await transaction.voceObiettivo.create({
        data: {
          ...input,
          reparto,
          prezzoMassimoPersonale: input.prezzoMassimoPersonale ?? null,
          priorita: input.priorita ?? 99,
          nonRaggiungibile: input.nonRaggiungibile ?? false,
        },
      });
      return { ok: true, obiettivo: mappaObiettivo(riga) };
    });
  }

  async elencaPerSessione(sessioneAstaId: string): Promise<readonly ObiettivoPersistito[]> {
    const righe = await this.prisma.voceObiettivo.findMany({
      where: { sessioneAstaId },
      orderBy: [{ priorita: "asc" }, { nomeGiocatore: "asc" }],
    });
    return righe.map(mappaObiettivo);
  }

  async aggiorna(
    id: string,
    input: Partial<Pick<ObiettivoPersistito, "prezzoMassimoPersonale" | "priorita" | "nonRaggiungibile">>,
  ): Promise<ObiettivoPersistito> {
    return mappaObiettivo(
      await this.prisma.voceObiettivo.update({ where: { id }, data: input }),
    );
  }

  async elimina(id: string): Promise<void> {
    await this.prisma.voceObiettivo.delete({ where: { id } });
  }
}

export class PrismaRepositoryConsultazioniScheda
  implements RepositoryConsultazioniScheda
{
  constructor(private readonly prisma: PrismaClient) {}

  async registra(
    input: NuovaConsultazioneScheda,
  ): Promise<ConsultazioneSchedaPersistita> {
    return this.prisma.consultazioneScheda.create({ data: input });
  }
}

export class PrismaRepositorySnapshot implements RepositorySnapshot {
  constructor(private readonly prisma: PrismaClient) {}

  async crea(input: NuovoSnapshot): Promise<SnapshotPersistito> {
    const riga = await this.prisma.snapshotDati.create({
      data: { ...input, stato: input.stato ?? "in_costruzione" },
      include: { giocatori: true },
    });
    return mappaSnapshot(riga);
  }

  async aggiungiGiocatori(
    snapshotId: string,
    giocatori: readonly Omit<GiocatoreSnapshotPersistito, "snapshotId">[],
  ): Promise<void> {
    const data = giocatori.map((giocatore) =>
      datiGiocatoreSnapshot(snapshotId, giocatore),
    );
    if (data.length > 0) {
      await this.prisma.giocatoreSnapshot.createMany({ data });
    }
  }

  async trovaPerId(id: string): Promise<SnapshotPersistito | null> {
    const riga = await this.prisma.snapshotDati.findUnique({
      where: { id },
      include: { giocatori: true },
    });
    return riga === null ? null : mappaSnapshot(riga);
  }

  async trovaPubblicato(stagioneListone: string): Promise<SnapshotPersistito | null> {
    const pubblicazione = await this.prisma.pubblicazioneSnapshot.findUnique({
      where: { stagioneListone },
      include: { snapshot: { include: { giocatori: true } } },
    });
    if (
      pubblicazione === null ||
      pubblicazione.snapshot.stato !== "consultabile"
    ) {
      return null;
    }
    return mappaSnapshot(pubblicazione.snapshot);
  }

  async pubblica(stagioneListone: string, snapshotId: string, pubblicatoIl: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.snapshotDati.updateMany({
        where: { stagioneListone, stato: "consultabile", id: { not: snapshotId } },
        data: { stato: "superato" },
      }),
      this.prisma.snapshotDati.update({
        where: { id: snapshotId },
        data: { stato: "consultabile" },
      }),
      this.prisma.pubblicazioneSnapshot.upsert({
        where: { stagioneListone },
        create: { stagioneListone, snapshotId, pubblicatoIl },
        update: { snapshotId, pubblicatoIl },
      }),
    ]);
  }
}

export class PrismaRepositoryFreschezza implements RepositoryFreschezza {
  constructor(private readonly prisma: PrismaClient) {}

  async trova(nomeSorgente: string, stagione: string): Promise<StatoFreschezzaPersistito | null> {
    const riga = await this.prisma.statoFreschezza.findUnique({
      where: { nomeSorgente_stagione: { nomeSorgente, stagione } },
    });
    return riga === null ? null : mappaFreschezza(riga);
  }

  async salva(input: StatoFreschezzaDaSalvare): Promise<StatoFreschezzaPersistito> {
    const data = {
      ultimoSuccessoIl: input.ultimoSuccessoIl ?? null,
      ultimoTentativoIl: input.ultimoTentativoIl,
      ultimoEsito: input.ultimoEsito,
      dettaglioErrore: input.dettaglioErrore ?? null,
      numGiocatoriAcquisiti: input.numGiocatoriAcquisiti ?? null,
      budgetToken: input.budgetToken,
      prossimoTentativoNonPrimaDi: input.prossimoTentativoNonPrimaDi ?? null,
    };
    return mappaFreschezza(
      await this.prisma.statoFreschezza.upsert({
        where: {
          nomeSorgente_stagione: {
            nomeSorgente: input.nomeSorgente,
            stagione: input.stagione,
          },
        },
        create: {
          nomeSorgente: input.nomeSorgente,
          stagione: input.stagione,
          ...data,
        },
        update: data,
      }),
    );
  }

  async salvaLimitazione(
    input: StatoLimitazioneFrequenzaDaSalvare,
  ): Promise<StatoFreschezzaPersistito> {
    const limitazione = {
      budgetToken: input.budgetToken,
      prossimoTentativoNonPrimaDi: input.prossimoTentativoNonPrimaDi,
      aggiornatoIl: input.aggiornatoIl,
    };
    return mappaFreschezza(
      await this.prisma.statoFreschezza.upsert({
        where: {
          nomeSorgente_stagione: {
            nomeSorgente: input.nomeSorgente,
            stagione: input.stagione,
          },
        },
        create: {
          nomeSorgente: input.nomeSorgente,
          stagione: input.stagione,
          ultimoTentativoIl: input.aggiornatoIl,
          ultimoEsito: "errore",
          dettaglioErrore: "Nessun tentativo di ingestione completato",
          ...limitazione,
        },
        update: limitazione,
      }),
    );
  }
}

export class PrismaRepositoryIngestione implements RepositoryIngestione {
  constructor(private readonly prisma: PrismaClient) {}

  async acquisisciLock(input: LockIngestioneDaAcquisire): Promise<boolean> {
    if (input.scadeIl <= input.acquisitoIl) {
      throw new RangeError("La scadenza del lock deve essere successiva all'acquisizione");
    }
    const righe = await this.prisma.$queryRaw<readonly { proprietario: string }[]>(
      Prisma.sql`
        INSERT INTO "lock_ingestione" ("chiave", "proprietario", "acquisito_il", "scade_il")
        VALUES (${input.chiave}, ${input.proprietario}::uuid, ${input.acquisitoIl}, ${input.scadeIl})
        ON CONFLICT ("chiave") DO UPDATE
        SET "proprietario" = EXCLUDED."proprietario",
            "acquisito_il" = EXCLUDED."acquisito_il",
            "scade_il" = EXCLUDED."scade_il"
        WHERE "lock_ingestione"."scade_il" <= EXCLUDED."acquisito_il"
           OR "lock_ingestione"."proprietario" = EXCLUDED."proprietario"
        RETURNING "proprietario"
      `,
    );
    return righe.length === 1;
  }

  async rilasciaLock(chiave: string, proprietario: string): Promise<void> {
    await this.prisma.lockIngestione.deleteMany({
      where: { chiave, proprietario },
    });
  }

  async registraTentativo(
    input: TentativoIngestioneDaRegistrare,
  ): Promise<StatoFreschezzaPersistito> {
    return this.prisma.$transaction(async (tx) => {
      const successo = input.esito === "successo";
      const comune = {
        ultimoTentativoIl: input.terminatoIl,
        ultimoEsito: input.esito,
        dettaglioErrore: input.dettaglioErrore,
        numGiocatoriAcquisiti: input.numGiocatoriAcquisiti,
      };
      const stato = await tx.statoFreschezza.upsert({
        where: {
          nomeSorgente_stagione: {
            nomeSorgente: input.nomeSorgente,
            stagione: input.stagione,
          },
        },
        create: {
          nomeSorgente: input.nomeSorgente,
          stagione: input.stagione,
          ultimoSuccessoIl: successo ? input.terminatoIl : null,
          budgetToken: 0,
          prossimoTentativoNonPrimaDi: null,
          ...comune,
        },
        update: successo
          ? { ...comune, ultimoSuccessoIl: input.terminatoIl }
          : comune,
      });
      if (successo) {
        await tx.esecuzioneIngestione.create({
          data: {
            nomeSorgente: input.nomeSorgente,
            stagione: input.stagione,
            iniziataIl: input.iniziatoIl,
            terminataIl: input.terminatoIl,
            esito: "successo",
            numGiocatoriAcquisiti: input.numGiocatoriAcquisiti,
            dettaglioErrore: null,
          },
        });
      }
      return mappaFreschezza(stato);
    });
  }

  async pubblicaSnapshot(
    input: PubblicazioneSnapshotAtomica,
  ): Promise<SnapshotPersistito> {
    if (
      input.giocatori.length === 0 ||
      input.snapshot.numGiocatori !== input.giocatori.length
    ) {
      throw new RangeError(
        "Uno snapshot pubblicabile deve contenere il listone completo e non vuoto",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.snapshotDati.create({
        data: { ...input.snapshot, stato: "in_costruzione" },
      });
      await tx.giocatoreSnapshot.createMany({
        data: input.giocatori.map((giocatore) =>
          datiGiocatoreSnapshot(snapshot.id, giocatore),
        ),
      });
      const inseriti = await tx.giocatoreSnapshot.count({
        where: { snapshotId: snapshot.id },
      });
      if (inseriti !== input.snapshot.numGiocatori) {
        throw new Error("Il listone persistito non e' completo");
      }

      await tx.snapshotDati.updateMany({
        where: {
          stagioneListone: input.snapshot.stagioneListone,
          stato: "consultabile",
        },
        data: { stato: "superato" },
      });
      await tx.snapshotDati.update({
        where: { id: snapshot.id },
        data: { stato: "consultabile" },
      });
      await tx.pubblicazioneSnapshot.upsert({
        where: { stagioneListone: input.snapshot.stagioneListone },
        create: {
          stagioneListone: input.snapshot.stagioneListone,
          snapshotId: snapshot.id,
          pubblicatoIl: input.pubblicatoIl,
        },
        update: {
          snapshotId: snapshot.id,
          pubblicatoIl: input.pubblicatoIl,
        },
      });

      const identificativiCorrenti = input.giocatori.map(
        ({ identificativoGiocatore }) => identificativoGiocatore,
      );
      const sessioniDellaStagione = {
        stagioneListone: input.snapshot.stagioneListone,
      };
      await tx.voceRegistroAcquisti.updateMany({
        where: {
          sessioneAsta: sessioniDellaStagione,
          identificativoGiocatore: { notIn: identificativiCorrenti },
          giocatoreAssenteDatiCorrenti: false,
        },
        data: { giocatoreAssenteDatiCorrenti: true },
      });
      await tx.voceRegistroAcquisti.updateMany({
        where: {
          sessioneAsta: sessioniDellaStagione,
          identificativoGiocatore: { in: identificativiCorrenti },
          giocatoreAssenteDatiCorrenti: true,
        },
        data: { giocatoreAssenteDatiCorrenti: false },
      });

      for (const acquisizione of input.acquisizioni) {
        await tx.statoFreschezza.upsert({
          where: {
            nomeSorgente_stagione: {
              nomeSorgente: acquisizione.nomeSorgente,
              stagione: acquisizione.stagione,
            },
          },
          create: {
            nomeSorgente: acquisizione.nomeSorgente,
            stagione: acquisizione.stagione,
            ultimoSuccessoIl: acquisizione.terminatoIl,
            ultimoTentativoIl: acquisizione.terminatoIl,
            ultimoEsito: "successo",
            dettaglioErrore: null,
            numGiocatoriAcquisiti: acquisizione.numGiocatoriAcquisiti,
            budgetToken: 0,
            prossimoTentativoNonPrimaDi: null,
          },
          update: {
            ultimoSuccessoIl: acquisizione.terminatoIl,
            ultimoTentativoIl: acquisizione.terminatoIl,
            ultimoEsito: "successo",
            dettaglioErrore: null,
            numGiocatoriAcquisiti: acquisizione.numGiocatoriAcquisiti,
          },
        });
        await tx.esecuzioneIngestione.create({
          data: {
            nomeSorgente: acquisizione.nomeSorgente,
            stagione: acquisizione.stagione,
            iniziataIl: acquisizione.iniziatoIl,
            terminataIl: acquisizione.terminatoIl,
            esito: "successo",
            numGiocatoriAcquisiti: acquisizione.numGiocatoriAcquisiti,
            dettaglioErrore: null,
          },
        });
      }

      const pubblicato = await tx.snapshotDati.findUniqueOrThrow({
        where: { id: snapshot.id },
        include: { giocatori: true },
      });
      return mappaSnapshot(pubblicato);
    });
  }
}

export class PrismaRepositoryAliasGiocatori implements RepositoryAliasGiocatori {
  constructor(private readonly prisma: PrismaClient) {}

  async elencaPerSorgente(
    nomeSorgente: string,
  ): Promise<readonly AliasGiocatorePersistito[]> {
    const righe = await this.prisma.aliasGiocatore.findMany({
      where: { nomeSorgente },
      orderBy: { identificativoSorgente: "asc" },
    });
    return righe.map((riga: RigaAliasGiocatore) => riga);
  }

  async salva(
    input: AliasGiocatoreDaSalvare,
  ): Promise<AliasGiocatorePersistito> {
    return this.prisma.aliasGiocatore.upsert({
      where: {
        nomeSorgente_identificativoSorgente: {
          nomeSorgente: input.nomeSorgente,
          identificativoSorgente: input.identificativoSorgente,
        },
      },
      create: input,
      update: {
        nomeNormalizzato: input.nomeNormalizzato,
        squadraNormalizzata: input.squadraNormalizzata,
        identificativoGiocatore: input.identificativoGiocatore,
      },
    });
  }
}

export function creaRepositories(prisma: PrismaClient): Repositories {
  return {
    utenti: new PrismaRepositoryUtenti(prisma),
    sessioniAuth: new PrismaRepositorySessioniAuth(prisma),
    sessioniAsta: new PrismaRepositorySessioniAsta(prisma),
    registro: new PrismaRepositoryRegistro(prisma),
    transazioniRegistro: new PrismaGestoreTransazioniRegistro(prisma),
    avversari: new PrismaRepositoryAvversari(prisma),
    obiettivi: new PrismaRepositoryObiettivi(prisma),
    consultazioniScheda: new PrismaRepositoryConsultazioniScheda(prisma),
    snapshot: new PrismaRepositorySnapshot(prisma),
    freschezza: new PrismaRepositoryFreschezza(prisma),
    ingestione: new PrismaRepositoryIngestione(prisma),
    aliasGiocatori: new PrismaRepositoryAliasGiocatori(prisma),
  };
}
