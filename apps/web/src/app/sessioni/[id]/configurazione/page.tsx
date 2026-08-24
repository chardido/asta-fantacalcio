import PaginaConfigurazioneAsta from "../../configurazione-asta";

export default async function PaginaConfigurazioneSessione({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <PaginaConfigurazioneAsta sessioneAstaId={id} />;
}
