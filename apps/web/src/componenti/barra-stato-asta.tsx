"use client";

import {
  AppShell,
  Badge,
  Group,
  Indicator,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";

export interface StatoRepartoBarra {
  readonly reparto: string;
  readonly budgetResiduo: number;
  readonly slotResidui: number;
  readonly slotTotali: number;
}

export interface BarraStatoAstaProps {
  readonly budgetResiduo: number;
  readonly slotResiduiTotali: number;
  readonly reparti: readonly StatoRepartoBarra[];
  readonly operazioniInAttesa?: number;
}

function percentualeSlotResidui(slotResidui: number, slotTotali: number): number {
  if (slotTotali <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.trunc((slotResidui * 100) / slotTotali)));
}

/**
 * Riepilogo persistente dello stato dell'asta, pensato per essere inserito
 * nell'AppShell della sessione. Usa esclusivamente primitive di layout Mantine.
 */
export function BarraStatoAsta({
  budgetResiduo,
  slotResiduiTotali,
  reparti,
  operazioniInAttesa = 0,
}: BarraStatoAstaProps) {
  return (
    <AppShell.Header
      aria-label="Stato corrente dell'asta"
      aria-live="polite"
      p="xs"
    >
      <Stack gap="xs">
        <Group gap="md" wrap="wrap">
          <Group gap="xs">
            <Text fw={600}>Budget residuo</Text>
            <Badge color="blue" variant="filled">
              {budgetResiduo} crediti
            </Badge>
          </Group>
          <Group gap="xs">
            <Text fw={600}>Slot residui totali</Text>
            <Badge color={slotResiduiTotali === 0 ? "green" : "gray"} variant="light">
              {slotResiduiTotali}
            </Badge>
          </Group>
          {operazioniInAttesa > 0 ? (
            <Indicator
              color="orange"
              inline
              label={operazioniInAttesa}
              size={22}
            >
              <Badge
                aria-label={`${operazioniInAttesa} operazioni in attesa di invio`}
                color="orange"
                size="lg"
                variant="light"
              >
                Coda offline
              </Badge>
            </Indicator>
          ) : null}
        </Group>
        <SimpleGrid cols={{ base: 4, sm: 6, md: Math.max(1, reparti.length) }} spacing="xs">
          {reparti.map((stato) => {
            const percentuale = percentualeSlotResidui(
              stato.slotResidui,
              stato.slotTotali,
            );

            return (
              <Stack
                aria-label={`Stato reparto ${stato.reparto}`}
                gap={2}
                key={stato.reparto}
              >
                <Text fw={700} size="sm">
                  {stato.reparto}
                </Text>
                <Text c="dimmed" size="xs">
                  {stato.budgetResiduo} crediti
                </Text>
                <Text c="dimmed" size="xs">
                  {stato.slotResidui} slot residui
                </Text>
                <Progress
                  aria-label={`Slot residui ${stato.reparto}: ${stato.slotResidui} su ${stato.slotTotali}`}
                  color={stato.slotResidui === 0 ? "green" : "blue"}
                  size="sm"
                  value={percentuale}
                />
              </Stack>
            );
          })}
        </SimpleGrid>
      </Stack>
    </AppShell.Header>
  );
}
