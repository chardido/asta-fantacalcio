import { initTRPC } from "@trpc/server";

import type { ContestoTrpc } from "./contesto";
import {
  descriviErroreTrpc,
  ErroreApplicativo,
  mappaErroreTrpc,
} from "./errori";

const t = initTRPC.context<ContestoTrpc>().create({
  errorFormatter({ shape, error, input }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        ...descriviErroreTrpc(error, input),
      },
    };
  },
});

const normalizzaErrori = t.middleware(async ({ next }) => {
  const risultato = await next();
  if (!risultato.ok) {
    throw mappaErroreTrpc(risultato.error);
  }
  return risultato;
});

const richiedeAutenticazione = t.middleware(({ ctx, next }) => {
  if (ctx.utente === null) {
    throw mappaErroreTrpc(
      new ErroreApplicativo(
        401,
        { codice: "non_autenticato" },
        "Autenticazione richiesta.",
      ),
    );
  }

  return next({
    ctx: {
      ...ctx,
      utente: ctx.utente,
    },
  });
});

export const creaRouter = t.router;
export const creaCallerFactory = t.createCallerFactory;
export const proceduraPubblica = t.procedure.use(normalizzaErrori);
export const proceduraAutenticata = proceduraPubblica.use(
  richiedeAutenticazione,
);
