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
import {
  IconLayoutDashboard,
  IconShirt,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const ALTEZZA_NAVIGAZIONE = "calc(74px + env(safe-area-inset-bottom))";

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

function NavigazioneSessioneMobile({
  sessioneAstaId,
}: {
  readonly sessioneAstaId: string;
}) {
  const pathname = usePathname();
  const base = `/sessioni/${encodeURIComponent(sessioneAstaId)}`;
  const voci = [
    { etichetta: "Dashboard", href: base, icona: IconLayoutDashboard },
    { etichetta: "Obiettivi", href: `${base}/obiettivi`, icona: IconTargetArrow },
    { etichetta: "Rosa", href: `${base}/rosa`, icona: IconShirt },
    { etichetta: "Avversari", href: `${base}/avversari`, icona: IconUsers },
  ] as const;

  return (
    <AppShell.Footer
      aria-label="Navigazione sessione"
      className="nocturne-bottom-nav"
      hiddenFrom="md"
    >
      <nav className="nocturne-bottom-nav-inner">
        {voci.map((voce) => {
          const attiva = pathname === voce.href;
          const Icona = voce.icona;
          return (
            <Link
              aria-current={attiva ? "page" : undefined}
              className="nocturne-bottom-nav-link"
              data-active={attiva}
              href={voce.href}
              key={voce.href}
            >
              <Icona aria-hidden size={21} stroke={1.8} />
              <span>{voce.etichetta}</span>
            </Link>
          );
        })}
      </nav>
    </AppShell.Footer>
  );
}

export interface VistaLayoutSessioneAstaProps {
  readonly children: ReactNode;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoSessioneBarraClient;
  readonly operazioniInAttesa?: number;
  readonly sessioneAstaId?: string;
}

/** Vista pura usata dal layout persistente e dai test di rendering. */
export function VistaLayoutSessioneAsta({
  children,
  configurazione,
  stato,
  operazioniInAttesa = 0,
  sessioneAstaId,
}: VistaLayoutSessioneAstaProps) {
  const reparti = creaStatiRepartoBarra(configurazione, stato);

  return (
    <AppShell
      footer={{ height: { base: ALTEZZA_NAVIGAZIONE, md: 0 } }}
      header={{ height: { base: 174, sm: 126 } }}
    >
      <BarraStatoAsta
        budgetResiduo={stato.budgetResiduo}
        operazioniInAttesa={operazioniInAttesa}
        reparti={reparti}
        slotResiduiTotali={stato.slotResiduiTotali}
      />
      <AppShell.Main>{children}</AppShell.Main>
      {sessioneAstaId === undefined ? null : (
        <NavigazioneSessioneMobile sessioneAstaId={sessioneAstaId} />
      )}
    </AppShell>
  );
}

function LayoutSessioneInAttesa({
  children,
  errore,
  sessioneAstaId,
}: {
  readonly children: ReactNode;
  readonly errore?: string;
  readonly sessioneAstaId: string;
}) {
  return (
    <AppShell
      footer={{ height: { base: ALTEZZA_NAVIGAZIONE, md: 0 } }}
      header={{ height: 80 }}
    >
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
      <NavigazioneSessioneMobile sessioneAstaId={sessioneAstaId} />
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
    return (
      <LayoutSessioneInAttesa sessioneAstaId={sessioneAstaId}>
        {children}
      </LayoutSessioneInAttesa>
    );
  }

  if (ripristino.error !== null) {
    return (
      <LayoutSessioneInAttesa
        errore={ripristino.error.message}
        sessioneAstaId={sessioneAstaId}
      >
        {children}
      </LayoutSessioneInAttesa>
    );
  }

  return (
    <VistaLayoutSessioneAsta
      configurazione={ripristino.data.configurazione}
      operazioniInAttesa={operazioniInAttesa}
      sessioneAstaId={sessioneAstaId}
      stato={ripristino.data.stato}
    >
      {children}
    </VistaLayoutSessioneAsta>
  );
}
