import { gestisciDeltaRegistro } from "@/server/eventi/gestori-http";
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
  return gestisciDeltaRegistro(
    richiesta,
    id,
    creaCanaleEventiPerRichiesta(richiesta),
  );
}
