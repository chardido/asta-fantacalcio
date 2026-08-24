import PaginaAvversariAsta from "../../avversari-asta";

export default async function PaginaAvversariSessione({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaAvversariAsta sessioneAstaId={id} />;
}
