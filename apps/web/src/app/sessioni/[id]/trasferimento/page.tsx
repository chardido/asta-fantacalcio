import PaginaTrasferimentoSessione from "../../trasferimento-sessione";

export default async function PaginaTrasferimento({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaTrasferimentoSessione sessioneAstaId={id} />;
}
