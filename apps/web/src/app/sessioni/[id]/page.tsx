import PaginaDashboardAsta from "../dashboard-asta";

export default async function PaginaSessioneAsta({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaDashboardAsta sessioneAstaId={id} />;
}
