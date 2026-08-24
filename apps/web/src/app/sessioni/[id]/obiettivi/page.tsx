import PaginaListaObiettivi from "../../lista-obiettivi";

export default async function PaginaObiettiviSessione({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaListaObiettivi sessioneAstaId={id} />;
}
