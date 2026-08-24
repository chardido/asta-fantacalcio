import { gestisciIndiceSnapshot } from "@/server/snapshot/gestori-http";
import { creaServizioConsultazioneSnapshotPerRichiesta } from "@/server/snapshot/runtime-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(richiesta: Request): Promise<Response> {
  return gestisciIndiceSnapshot(
    richiesta,
    creaServizioConsultazioneSnapshotPerRichiesta(richiesta),
  );
}
