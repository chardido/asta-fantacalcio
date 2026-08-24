import { gestisciSchedaGiocatoreSnapshot } from "@/server/snapshot/gestori-http";
import { creaServizioConsultazioneSnapshotPerRichiesta } from "@/server/snapshot/runtime-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContestoRoute = Readonly<{
  params: Promise<Readonly<{ identificativo: string }>>;
}>;

export async function GET(
  richiesta: Request,
  contesto: ContestoRoute,
): Promise<Response> {
  const { identificativo } = await contesto.params;
  return gestisciSchedaGiocatoreSnapshot(
    richiesta,
    identificativo,
    creaServizioConsultazioneSnapshotPerRichiesta(richiesta),
  );
}
