import {
  configurazioneAstaSchema,
  pesiValutazioneSchema,
  repartoSchema,
} from "@asta/contracts";
import { PROFILI_STRATEGIA } from "@asta/domain";
import { z } from "zod";

import { creaServizioAvversariRuntime } from "../avversari/runtime-avversari";
import type { ServizioAvversari } from "../avversari/servizio-avversari";
import {
  caricaFreschezzaConfigurazioneRuntime,
  creaServizioConfigurazioneRuntime,
  type StatoFreschezzaConfigurazione,
} from "../configurazione/runtime-configurazione";
import type { ServizioConfigurazione } from "../configurazione/servizio-configurazione";
import { creaServizioObiettiviRuntime } from "../obiettivi/runtime-obiettivi";
import type {
  ListaObiettivi,
  ServizioObiettivi,
} from "../obiettivi/servizio-obiettivi";
import { creaServizioRegistroRuntime } from "../registro/runtime-registro";
import type {
  EsitoMutazioneRegistro,
  ServizioRegistro,
} from "../registro/servizio-registro";
import { creaServizioSessioniAstaRuntime } from "../sessioni/runtime-sessioni-asta";
import type {
  ServizioSessioniAsta,
  VoceElencoSessioniAsta,
} from "../sessioni/servizio-sessioni-asta";
import type { ContestoTrpc } from "./contesto";
import { creaRouter, proceduraAutenticata } from "./trpc";

const idSessioneSchema = z.uuid(
  "L'identificativo della sessione non è valido.",
);
const idVoceRegistroSchema = z.string().trim().min(1);
const idAvversarioSchema = z.string().trim().min(1);
const nomeAvversarioSchema = z.string().trim().min(1).max(30);
const inputSessioneSchema = z.object({ sessioneAstaId: idSessioneSchema });
const inputCreazioneSchema = z.object({
  stagioneListone: z.string().trim().min(1).max(20),
  configurazione: configurazioneAstaSchema,
});
const inputConfigurazioneSchema = inputSessioneSchema.extend({
  configurazione: configurazioneAstaSchema,
});
const inputPesiSchema = inputSessioneSchema.extend({
  pesiValutazione: pesiValutazioneSchema,
});
const inputProfiloSchema = inputSessioneSchema.extend({
  profiloStrategia: z.enum(PROFILI_STRATEGIA),
});
const inputAggiuntaRegistroSchema = inputSessioneSchema.extend({
  identificativoGiocatore: z.string().trim().min(1).max(128),
  prezzoAcquisto: z.number().int().positive(),
  repartoAssegnato: repartoSchema.optional(),
  chiaveIdempotenza: z.uuid(),
});
const inputAnnotazioneAvversarioSchema = inputSessioneSchema.extend({
  identificativoGiocatore: z.string().trim().min(1).max(128),
  avversarioId: idAvversarioSchema.nullish(),
  prezzoAcquisto: z.number().int().positive().nullish(),
  repartoAssegnato: repartoSchema.optional(),
  chiaveIdempotenza: z.uuid(),
});
const inputAnnullamentoRegistroSchema = inputSessioneSchema.extend({
  voceRegistroId: idVoceRegistroSchema,
});
const inputRisoluzioneConflittoSchema = inputAggiuntaRegistroSchema.extend({
  voceServerId: idVoceRegistroSchema,
  risoluzione: z.enum(["locale", "server"]),
});
const inputCreazioneAvversarioSchema = inputSessioneSchema.extend({
  nome: nomeAvversarioSchema,
});
const idObiettivoSchema = z.string().trim().min(1);
const ordinamentoObiettiviSchema = z.enum(["reparto", "priorita"]);
const inputElencoObiettiviSchema = inputSessioneSchema.extend({
  ordinamento: ordinamentoObiettiviSchema,
});
const inputAggiuntaObiettivoSchema = inputSessioneSchema.extend({
  identificativoGiocatore: z.string().trim().min(1).max(128),
  prezzoMassimoPersonale: z.number().int().min(1).max(100000).nullish(),
  priorita: z.number().int().min(1).max(99).optional(),
  reparto: repartoSchema.optional(),
});
const inputPrezzoObiettivoSchema = inputSessioneSchema.extend({
  obiettivoId: idObiettivoSchema,
  prezzoMassimoPersonale: z.number().int().min(1).max(100000).nullable(),
});
const inputPrioritaObiettivoSchema = inputSessioneSchema.extend({
  obiettivoId: idObiettivoSchema,
  priorita: z.number().int().min(1).max(99),
});

type ContestoAutenticato = ContestoTrpc & {
  readonly utente: NonNullable<ContestoTrpc["utente"]>;
};

type ServizioSessioniRouter = Pick<
  ServizioSessioniAsta,
  "crea" | "elenca" | "ripristina" | "duplica" | "elimina"
>;

type ServizioConfigurazioneRouter = Pick<
  ServizioConfigurazione,
  | "modifica"
  | "modificaPesi"
  | "applicaProfilo"
  | "ripristinaPesi"
  | "consultaMappaRuoliMantra"
>;

type ServizioRegistroRouter = Pick<
  ServizioRegistro,
  "aggiungi" | "annotaAcquistoAltrui" | "annulla" | "risolviConflitto"
>;

type ServizioAvversariRouter = Pick<
  ServizioAvversari,
  "crea" | "elenca" | "elencaAnnotazioni"
>;

type ServizioObiettiviRouter = Pick<
  ServizioObiettivi,
  | "aggiungi"
  | "aggiornaPrezzoMassimoPersonale"
  | "aggiornaPriorita"
  | "elenca"
>;

export interface DipendenzeRouterApplicazione {
  readonly creaServizioSessioni: (
    contesto: ContestoAutenticato,
  ) => ServizioSessioniRouter;
  readonly creaServizioRegistro: (
    contesto: ContestoAutenticato,
  ) => ServizioRegistroRouter;
  readonly creaServizioAvversari: (
    contesto: ContestoAutenticato,
  ) => ServizioAvversariRouter;
  readonly creaServizioObiettivi: (
    contesto: ContestoAutenticato,
  ) => ServizioObiettiviRouter;
  readonly creaServizioConfigurazione: (
    contesto: ContestoAutenticato,
  ) => ServizioConfigurazioneRouter;
  readonly caricaFreschezzaConfigurazione: (
    contesto: ContestoAutenticato,
    sessioneAstaId: string,
  ) => Promise<readonly StatoFreschezzaConfigurazione[]>;
}

function serializzaVoceSessione(voce: VoceElencoSessioniAsta) {
  return {
    ...voce,
    creatoIl: voce.creatoIl.toISOString(),
    aggiornatoIl: voce.aggiornatoIl.toISOString(),
  };
}

function serializzaEsitoRegistro(esito: EsitoMutazioneRegistro) {
  return {
    voce: esito.voce,
    stato: {
      budgetResiduo: esito.budgetResiduo,
      budgetRepartoResiduo: Object.fromEntries(esito.budgetRepartoResiduo),
      slotResidui: Object.fromEntries(esito.slotResidui),
      slotResiduiTotali: esito.slotResiduiTotali,
      riservaMinima: esito.riservaMinima,
      rosa: esito.rosa,
    },
  };
}

function serializzaObiettivo(
  voce: ListaObiettivi["voci"][number],
) {
  return {
    id: voce.id,
    identificativoGiocatore: voce.identificativoGiocatore,
    nomeGiocatore: voce.nomeGiocatore,
    reparto: voce.reparto,
    prezzoMassimoPersonale: voce.prezzoMassimoPersonale,
    priorita: voce.priorita,
    nonRaggiungibile: voce.nonRaggiungibile,
  };
}

/** Router costruibile con dipendenze sostituibili per testare il confine UI/API. */
export function creaRouterApplicazione(
  dipendenze: DipendenzeRouterApplicazione,
) {
  return creaRouter({
    sessioni: creaRouter({
      crea: proceduraAutenticata
        .input(inputCreazioneSchema)
        .mutation(({ ctx, input }) =>
          dipendenze.creaServizioSessioni(ctx).crea(input),
        ),
      elenca: proceduraAutenticata.query(async ({ ctx }) => {
        const voci = await dipendenze.creaServizioSessioni(ctx).elenca();
        return voci.map(serializzaVoceSessione);
      }),
      ripristina: proceduraAutenticata
        .input(inputSessioneSchema)
        .query(async ({ ctx, input }) => {
          const sessione = await dipendenze
            .creaServizioSessioni(ctx)
            .ripristina(input.sessioneAstaId);
          return {
            id: sessione.id,
            stagioneListone: sessione.stagioneListone,
            configurazione: sessione.configurazione,
            stato: {
              budgetResiduo: sessione.budgetResiduo,
              budgetRepartoResiduo: Object.fromEntries(
                sessione.budgetRepartoResiduo,
              ),
              slotResidui: Object.fromEntries(sessione.slotResidui),
              slotResiduiTotali: sessione.slotResiduiTotali,
              riservaMinima: sessione.riservaMinima,
              rosa: sessione.rosa,
              identificativiNonDisponibili: sessione.registro
                .filter((voce) => voce.annullataIl === null)
                .map((voce) => voce.identificativoGiocatore),
            },
            avvisiInformativiAttivi: sessione.avvisiInformativiAttivi,
          };
        }),
      duplica: proceduraAutenticata
        .input(inputSessioneSchema)
        .mutation(({ ctx, input }) =>
          dipendenze
            .creaServizioSessioni(ctx)
            .duplica(input.sessioneAstaId),
        ),
      elimina: proceduraAutenticata
        .input(inputSessioneSchema)
        .mutation(async ({ ctx, input }) => {
          await dipendenze
            .creaServizioSessioni(ctx)
            .elimina(input.sessioneAstaId);
          return { eliminata: true as const };
        }),
    }),
    registro: creaRouter({
      aggiungi: proceduraAutenticata
        .input(inputAggiuntaRegistroSchema)
        .mutation(async ({ ctx, input }) => {
          const { sessioneAstaId, ...acquisto } = input;
          const esito = await dipendenze
            .creaServizioRegistro(ctx)
            .aggiungi(sessioneAstaId, acquisto);
          return serializzaEsitoRegistro(esito);
        }),
      annotaAcquistoAltrui: proceduraAutenticata
        .input(inputAnnotazioneAvversarioSchema)
        .mutation(async ({ ctx, input }) => {
          const { sessioneAstaId, ...annotazione } = input;
          const esito = await dipendenze
            .creaServizioRegistro(ctx)
            .annotaAcquistoAltrui(sessioneAstaId, annotazione);
          return serializzaEsitoRegistro(esito);
        }),
      annulla: proceduraAutenticata
        .input(inputAnnullamentoRegistroSchema)
        .mutation(async ({ ctx, input }) => {
          const esito = await dipendenze
            .creaServizioRegistro(ctx)
            .annulla(input.sessioneAstaId, input.voceRegistroId);
          return serializzaEsitoRegistro(esito);
        }),
      risolviConflitto: proceduraAutenticata
        .input(inputRisoluzioneConflittoSchema)
        .mutation(async ({ ctx, input }) => {
          const { sessioneAstaId, ...risoluzione } = input;
          const esito = await dipendenze
            .creaServizioRegistro(ctx)
            .risolviConflitto(sessioneAstaId, risoluzione);
          return serializzaEsitoRegistro(esito);
        }),
    }),
    avversari: creaRouter({
      crea: proceduraAutenticata
        .input(inputCreazioneAvversarioSchema)
        .mutation(async ({ ctx, input }) => {
          const avversario = await dipendenze
            .creaServizioAvversari(ctx)
            .crea(input.sessioneAstaId, input.nome);
          return { id: avversario.id, nome: avversario.nome };
        }),
      elenca: proceduraAutenticata
        .input(inputSessioneSchema)
        .query(({ ctx, input }) =>
          dipendenze
            .creaServizioAvversari(ctx)
            .elenca(input.sessioneAstaId),
        ),
      annotazioni: proceduraAutenticata
        .input(inputSessioneSchema)
        .query(({ ctx, input }) =>
          dipendenze
            .creaServizioAvversari(ctx)
            .elencaAnnotazioni(input.sessioneAstaId),
        ),
    }),
    obiettivi: creaRouter({
      elenca: proceduraAutenticata
        .input(inputElencoObiettiviSchema)
        .query(async ({ ctx, input }) => {
          const lista = await dipendenze
            .creaServizioObiettivi(ctx)
            .elenca(input.sessioneAstaId, input.ordinamento);
          return {
            voci: lista.voci.map(serializzaObiettivo),
            conteggiPerReparto: lista.conteggiPerReparto,
          };
        }),
      aggiungi: proceduraAutenticata
        .input(inputAggiuntaObiettivoSchema)
        .mutation(async ({ ctx, input }) => {
          const { sessioneAstaId, ...obiettivo } = input;
          const voce = await dipendenze
            .creaServizioObiettivi(ctx)
            .aggiungi(sessioneAstaId, obiettivo);
          return serializzaObiettivo(voce);
        }),
      aggiornaPrezzo: proceduraAutenticata
        .input(inputPrezzoObiettivoSchema)
        .mutation(async ({ ctx, input }) => {
          const voce = await dipendenze
            .creaServizioObiettivi(ctx)
            .aggiornaPrezzoMassimoPersonale(
              input.sessioneAstaId,
              input.obiettivoId,
              input.prezzoMassimoPersonale,
            );
          return serializzaObiettivo(voce);
        }),
      aggiornaPriorita: proceduraAutenticata
        .input(inputPrioritaObiettivoSchema)
        .mutation(async ({ ctx, input }) => {
          const voce = await dipendenze
            .creaServizioObiettivi(ctx)
            .aggiornaPriorita(
              input.sessioneAstaId,
              input.obiettivoId,
              input.priorita,
            );
          return serializzaObiettivo(voce);
        }),
    }),
    configurazione: creaRouter({
      modifica: proceduraAutenticata
        .input(inputConfigurazioneSchema)
        .mutation(({ ctx, input }) =>
          dipendenze
            .creaServizioConfigurazione(ctx)
            .modifica(input.sessioneAstaId, input.configurazione),
        ),
      modificaPesi: proceduraAutenticata
        .input(inputPesiSchema)
        .mutation(({ ctx, input }) =>
          dipendenze
            .creaServizioConfigurazione(ctx)
            .modificaPesi(input.sessioneAstaId, input.pesiValutazione),
        ),
      applicaProfilo: proceduraAutenticata
        .input(inputProfiloSchema)
        .mutation(({ ctx, input }) =>
          dipendenze
            .creaServizioConfigurazione(ctx)
            .applicaProfilo(input.sessioneAstaId, input.profiloStrategia),
        ),
      ripristinaPesi: proceduraAutenticata
        .input(inputSessioneSchema)
        .mutation(({ ctx, input }) =>
          dipendenze
            .creaServizioConfigurazione(ctx)
            .ripristinaPesi(input.sessioneAstaId),
        ),
      mappaRuoliMantra: proceduraAutenticata.query(({ ctx }) =>
        dipendenze
          .creaServizioConfigurazione(ctx)
          .consultaMappaRuoliMantra(),
      ),
      freschezza: proceduraAutenticata
        .input(inputSessioneSchema)
        .query(({ ctx, input }) =>
          dipendenze.caricaFreschezzaConfigurazione(
            ctx,
            input.sessioneAstaId,
          ),
        ),
    }),
  });
}

export const routerApplicazione = creaRouterApplicazione({
  creaServizioSessioni: creaServizioSessioniAstaRuntime,
  creaServizioRegistro: creaServizioRegistroRuntime,
  creaServizioAvversari: creaServizioAvversariRuntime,
  creaServizioObiettivi: creaServizioObiettiviRuntime,
  creaServizioConfigurazione: creaServizioConfigurazioneRuntime,
  caricaFreschezzaConfigurazione: caricaFreschezzaConfigurazioneRuntime,
});

export type RouterApplicazione = typeof routerApplicazione;
