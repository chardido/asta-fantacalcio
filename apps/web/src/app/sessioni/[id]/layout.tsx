import type { ReactNode } from "react";

import LayoutSessioneAsta from "./layout-sessione-asta";

export default async function LayoutSessione({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return (
    <LayoutSessioneAsta sessioneAstaId={id}>
      {children}
    </LayoutSessioneAsta>
  );
}
