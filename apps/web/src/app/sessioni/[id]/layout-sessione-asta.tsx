"use client";

import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type ConfigurazioneAsta,
  type MacroReparto,
  type RepartoClassic,
  type RepartoMantra,
} from "@asta/contracts";
import { Alert, AppShell, Group, Loader } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { useCodaLocale } from "../../../client/coda-locale-store";
import { useTRPC } from "../../../client/fornitore-client";
import { avviaRiconciliazioneSessione } from "../../../client/riconciliazione-eventi";
import {
  BarraStatoAsta,
  type StatoRepartoBarra,
} from "../../../componenti/barra-stato-asta";

const MACRO_REPARTO_PER_RUOLO_CLASSIC = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const satisfies Readonly<Record<RepartoClassic, MacroReparto>>;

export interface StatoSessioneBarraClient {
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: Readonly<Record<string, number>>;
  readonly slotResidui: Readonly<Record<string, number>>;
  readonly slotResiduiTotali: number;
}

function macroRepartoPer(
  configurazione: ConfigurazioneAsta,
  reparto: string,
): MacroReparto {
  return configurazione.modalitaGioco === "classic"
    ? MACRO_REPARTO_PER_RUOLO_CLASSIC[reparto as RepartoClassic]
    : MACRO_REPARTO_PER_RUOLO_MANTRA[reparto as RepartoMantra];
}

/** Converte lo stato serializzabile dell'API nel modello presentazionale della barra. */
export function creaStatiRepartoBarra(
  configurazione: ConfigurazioneAsta,
  stato: StatoSessioneBarraClient,
): readonly StatoRepartoBarra[] {
  return Object.entries(configurazione.composizioneRosa).map(
    ([reparto, slotTotali]) => ({
      reparto,
      budgetResiduo:
        stato.budgetRepartoResiduo[
          macroRepartoPer(configurazione, reparto)
        ] ?? 0,
      slotResidui: stato.slotResidui[reparto] ?? 0,
      slotTotali,
    }),
  );
}

export interface VistaLayoutSessioneAstaProps {
  readonly children: ReactNode;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoSessioneBarraClient;
  readonly operazioniInAttesa?: number;
}

/** Vista pura usata dal layout persistente e dai test di rendering. */
export function VistaLayoutSessioneAsta({
  children,
  configurazione,
  stato,
  operazioniInAttesa = 0,
}: VistaLayoutSessioneAstaProps) {
  const reparti = creaStatiRepartoBarra(configurazione, stato);
  const altezzaIntestazione =
    reparti.length > 6
      ? { base: 265, sm: 185, md: 130 }
      : { base: 175, sm: 130 };

  return (
    <AppShell header={{ height: altezzaIntestazione }}>
      <BarraStatoAsta
        budgetResiduo={stato.budgetResiduo}
        operazioniInAttesa={operazioniInAttesa}
        reparti={reparti}
        slotResiduiTotali={stato.slotResiduiTotali}
      />
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}

function LayoutSessioneInAttesa({
  children,
  errore,
}: {
  readonly children: ReactNode;
  readonly errore?: string;
}) {
  return (
    <AppShell header={{ height: 80 }}>
      <AppShell.Header aria-label="Stato corrente dell'asta" p="sm">
        {errore === undefined ? (
          <Group justify="center">
            <Loader aria-label="Caricamento stato dell'asta" size="sm" />
          </Group>
        ) : (
          <Alert color="red" title="Stato dell'asta non disponibile">
            {errore}
          </Alert>
        )}
      </AppShell.Header>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}

export default function LayoutSessioneAsta({
  children,
  sessioneAstaId,
}: {
  readonly children: ReactNode;
  readonly sessioneAstaId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const operazioniInAttesa = useCodaLocale(
    (stato) => stato.operazioni.length,
  );
  const ripristino = useQuery(
    trpc.sessioni.ripristina.queryOptions({ sessioneAstaId }),
  );

  useEffect(
    () =>
      avviaRiconciliazioneSessione({
        queryClient,
        sessioneAstaId,
      }),
    [queryClient, sessioneAstaId],
  );

  if (ripristino.isPending) {
    return <LayoutSessioneInAttesa>{children}</LayoutSessioneInAttesa>;
  }

  if (ripristino.error !== null) {
    return (
      <LayoutSessioneInAttesa errore={ripristino.error.message}>
        {children}
      </LayoutSessioneInAttesa>
    );
  }

  return (
    <VistaLayoutSessioneAsta
      configurazione={ripristino.data.configurazione}
      operazioniInAttesa={operazioniInAttesa}
      stato={ripristino.data.stato}
    >
      {children}
    </VistaLayoutSessioneAsta>
  );
}
