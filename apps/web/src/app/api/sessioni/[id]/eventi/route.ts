import { gestisciStreamEventi } from "@/server/eventi/gestori-http";
import { creaCanaleEventiPerRichiesta } from "@/server/eventi/runtime-eventi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContestoRoute = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

export async function GET(
  richiesta: Request,
  contesto: ContestoRoute,
): Promise<Response> {
  const { id } = await contesto.params;
  return gestisciStreamEventi(
    richiesta,
    id,
    creaCanaleEventiPerRichiesta(richiesta),
  );
}
