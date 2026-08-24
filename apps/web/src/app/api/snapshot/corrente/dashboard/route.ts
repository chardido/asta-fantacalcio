import { gestisciDashboardSnapshot } from "@/server/snapshot/gestori-http";
import { creaServizioConsultazioneSnapshotPerRichiesta } from "@/server/snapshot/runtime-snapshot";

export const runtime = "nodejs";

export function GET(richiesta: Request): Promise<Response> {
  return gestisciDashboardSnapshot(
    richiesta,
    creaServizioConsultazioneSnapshotPerRichiesta(richiesta),
  );
}
