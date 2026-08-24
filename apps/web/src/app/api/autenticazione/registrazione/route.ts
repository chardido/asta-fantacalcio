import { gestisciRegistrazione } from "@/server/autenticazione/gestori-http";
import { servizioAutenticazioneRuntime } from "@/server/autenticazione/runtime-autenticazione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(richiesta: Request): Promise<Response> {
  return gestisciRegistrazione(richiesta, servizioAutenticazioneRuntime());
}
