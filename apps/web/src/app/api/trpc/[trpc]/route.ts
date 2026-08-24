import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { servizioAutenticazioneRuntime } from "@/server/autenticazione/runtime-autenticazione";
import { creaContestoTrpc } from "@/server/trpc/contesto";
import { routerApplicazione } from "@/server/trpc/router-applicazione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gestisci(richiesta: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: richiesta,
    router: routerApplicazione,
    createContext: () =>
      creaContestoTrpc(richiesta, {
        autenticazione: servizioAutenticazioneRuntime(),
      }),
  });
}

export { gestisci as GET, gestisci as POST };
