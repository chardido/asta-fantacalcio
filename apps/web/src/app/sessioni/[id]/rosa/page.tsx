import PaginaRosaAsta from "../../rosa-asta";

export default async function PaginaRosaSessione({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaRosaAsta sessioneAstaId={id} />;
}
