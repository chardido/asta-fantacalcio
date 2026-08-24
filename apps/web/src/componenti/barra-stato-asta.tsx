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
 * nell'AppShell della sessione. Il rail dei reparti scorre internamente e non
 * aumenta mai la larghezza del documento.
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
      <Stack gap={6}>
        <SimpleGrid cols={3} spacing="xs" verticalSpacing={4}>
          <Stack gap={0}>
            <Text c="dimmed" fw={600} size="xs">Budget residuo</Text>
            <Badge color="nocturne" size="lg" variant="filled">
              {budgetResiduo} crediti
            </Badge>
          </Stack>
          <Stack gap={0}>
            <Text c="dimmed" fw={600} size="xs">Slot residui totali</Text>
            <Badge color={slotResiduiTotali === 0 ? "green" : "gray"} size="lg" variant="light">
              {slotResiduiTotali}
            </Badge>
          </Stack>
          {operazioniInAttesa > 0 ? (
            <Stack gap={0}>
              <Text c="dimmed" fw={600} size="xs">Sincronizzazione</Text>
              <Indicator
                color="orange"
                inline
                label={operazioniInAttesa}
                size={20}
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
            </Stack>
          ) : null}
        </SimpleGrid>

        <div className="nocturne-status-rail">
          {reparti.map((stato) => {
            const percentuale = percentualeSlotResidui(
              stato.slotResidui,
              stato.slotTotali,
            );

            return (
              <Stack
                aria-label={`Stato reparto ${stato.reparto}`}
                className="nocturne-status-item"
                gap={1}
                key={stato.reparto}
              >
                <Group gap="xs" justify="space-between" wrap="nowrap">
                  <Text fw={700} size="sm">{stato.reparto}</Text>
                  <Text c="dimmed" size="xs">{stato.budgetResiduo} crediti</Text>
                </Group>
                <Text c="dimmed" size="xs">
                  {stato.slotResidui} slot residui
                </Text>
                <Progress
                  aria-label={`Slot residui ${stato.reparto}: ${stato.slotResidui} su ${stato.slotTotali}`}
                  color={stato.slotResidui === 0 ? "green" : "nocturne"}
                  size={5}
                  value={percentuale}
                />
              </Stack>
            );
          })}
        </div>
      </Stack>
    </AppShell.Header>
  );
}
