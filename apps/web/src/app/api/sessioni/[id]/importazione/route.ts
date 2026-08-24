import { gestisciImportazione } from "@/server/esportazione/gestori-http";
import { creaServizioEsportazionePerRichiesta } from "@/server/esportazione/runtime-esportazione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContestoRoute = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

export async function POST(
  richiesta: Request,
  contesto: ContestoRoute,
): Promise<Response> {
  const { id } = await contesto.params;
  return gestisciImportazione(
    richiesta,
    id,
    creaServizioEsportazionePerRichiesta(richiesta),
  );
}
