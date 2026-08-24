"use client";

import { MACRO_REPARTI, type MacroReparto } from "@asta/contracts";
import { NumberInput, Progress, SimpleGrid, Stack, Text } from "@mantine/core";

export type ValoreQuotaReparto = number | string;
export type QuoteRepartoModificabili = Readonly<
  Record<MacroReparto, ValoreQuotaReparto>
>;

export interface SelettoreQuoteRepartoProps {
  readonly quote: QuoteRepartoModificabili;
  readonly onChange: (reparto: MacroReparto, valore: ValoreQuotaReparto) => void;
  readonly disabilitato?: boolean;
}

const ETICHETTE_REPARTO: Readonly<Record<MacroReparto, string>> = {
  POR: "Portieri",
  DIF: "Difensori",
  CEN: "Centrocampisti",
  ATT: "Attaccanti",
};

function quotaNumerica(valore: ValoreQuotaReparto): number {
  return typeof valore === "number" && Number.isInteger(valore) ? valore : 0;
}

export function sommaQuoteReparto(quote: QuoteRepartoModificabili): number {
  return MACRO_REPARTI.reduce(
    (somma, reparto) => somma + quotaNumerica(quote[reparto]),
    0,
  );
}

/** Selettore percentuale che rende immediatamente visibile lo scarto dalla somma 100. */
export function SelettoreQuoteReparto({
  quote,
  onChange,
  disabilitato = false,
}: SelettoreQuoteRepartoProps) {
  const somma = sommaQuoteReparto(quote);
  const sommaValida = somma === 100;

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        {MACRO_REPARTI.map((reparto) => (
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="strict"
            disabled={disabilitato}
            key={reparto}
            label={ETICHETTE_REPARTO[reparto]}
            max={100}
            min={0}
            onChange={(valore) => onChange(reparto, valore)}
            suffix="%"
            value={quote[reparto]}
          />
        ))}
      </SimpleGrid>
      <Progress
        aria-label={`Somma quote: ${somma} su 100`}
        color={sommaValida ? "green" : "red"}
        value={Math.min(100, Math.max(0, somma))}
      />
      <Text aria-live="polite" c={sommaValida ? "green" : "red"} fw={600} size="sm">
        Somma quote: {somma}%{sommaValida ? "" : " — deve essere esattamente 100%"}
      </Text>
    </Stack>
  );
}
