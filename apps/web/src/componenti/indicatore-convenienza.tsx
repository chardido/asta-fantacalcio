"use client";

import { RingProgress, Text } from "@mantine/core";

export interface IndicatoreConvenienzaProps {
  readonly valore: number;
  readonly dimensione?: number;
  readonly spessore?: number;
}

export function normalizzaConvenienza(valore: number): number {
  if (!Number.isFinite(valore)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.trunc(valore)));
}

export function coloreConvenienza(valore: number): string {
  const normalizzato = normalizzaConvenienza(valore);
  if (normalizzato >= 70) return "green";
  if (normalizzato >= 40) return "yellow";
  return "red";
}

/** Indicatore percentuale condiviso fra dashboard e scheda giocatore. */
export function IndicatoreConvenienza({
  valore,
  dimensione = 92,
  spessore = 10,
}: IndicatoreConvenienzaProps) {
  const normalizzato = normalizzaConvenienza(valore);

  return (
    <RingProgress
      aria-label={`Indice di convenienza: ${normalizzato}%`}
      label={
        <Text fw={700} size="sm" ta="center">
          {normalizzato}%
        </Text>
      }
      roundCaps
      sections={[{ value: normalizzato, color: coloreConvenienza(normalizzato) }]}
      size={dimensione}
      thickness={spessore}
    />
  );
}
