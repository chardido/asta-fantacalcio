"use client";

import { repartoSchema, type VoceRegistro } from "@asta/contracts";
import {
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useNetwork } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  QueryClientProvider,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { RouterApplicazione } from "@/server/trpc/router-applicazione";

import {
  storeCodaLocale,
  useCodaLocale,
  type ConflittoOperazioneCoda,
  type OperazioneCodaLocale,
} from "./coda-locale-store";
import { creaQueryClient, queryAppartieneASessione } from "./query-client";
import {
  MESSAGGIO_OPERAZIONE_NON_INVIATA,
  reinviaCodaLocale,
} from "./reinvio-coda-locale";

const { TRPCProvider, useTRPC } = createTRPCContext<RouterApplicazione>();

export { useTRPC };

function origineServer(): string {
  const originePubblica = process.env.NEXT_PUBLIC_ORIGINE_APPLICAZIONE;
  if (originePubblica !== undefined && originePubblica.length > 0) {
    return originePubblica.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function urlTrpc(): string {
  return typeof window === "undefined"
    ? `${origineServer()}/api/trpc`
    : `${window.location.origin}/api/trpc`;
}

function inputRegistrazioneDaOperazione(operazione: OperazioneCodaLocale) {
  const identificativoGiocatore = operazione.dati.identificativoGiocatore;
  const prezzoAcquisto = operazione.dati.prezzoAcquisto;
  const repartoAssegnato = operazione.dati.repartoAssegnato;

  if (
    typeof identificativoGiocatore !== "string" ||
    !Number.isInteger(prezzoAcquisto) ||
    Number(prezzoAcquisto) < 1
  ) {
    throw new Error("L'operazione nella coda locale non contiene un acquisto valido.");
  }

  return {
    sessioneAstaId: operazione.sessioneAstaId,
    identificativoGiocatore,
    prezzoAcquisto: Number(prezzoAcquisto),
    ...(repartoAssegnato === undefined
      ? {}
      : { repartoAssegnato: repartoSchema.parse(repartoAssegnato) }),
    chiaveIdempotenza: operazione.chiaveIdempotenza,
  };
}

function recordSconosciuto(valore: unknown): Record<string, unknown> | null {
  return typeof valore === "object" && valore !== null
    ? (valore as Record<string, unknown>)
    : null;
}

/** Estrae esclusivamente i 409 del registro che includono la versione autorevole. */
export function estraiConflittoRegistro(
  errore: unknown,
): ConflittoOperazioneCoda | null {
  const dati = recordSconosciuto(recordSconosciuto(errore)?.data);
  if (dati?.codice !== "giocatore_gia_assegnato") return null;
  const dettagli = recordSconosciuto(dati.dettagli);
  const voce = recordSconosciuto(dettagli?.voceEsistente);
  if (
    typeof voce?.id !== "string" ||
    typeof voce.identificativoGiocatore !== "string" ||
    typeof voce.nomeGiocatore !== "string" ||
    typeof voce.ordinale !== "number"
  ) {
    return null;
  }
  return { versioneServer: voce as unknown as VoceRegistro };
}

async function aggiornaCacheDopoConferma(
  queryClient: QueryClient,
  operazione: OperazioneCodaLocale,
  conferma: { readonly stato: unknown },
): Promise<void> {
  queryClient.setQueriesData(
    {
      predicate: (query) =>
        queryAppartieneASessione(query.queryKey, operazione.sessioneAstaId),
    },
    (corrente) =>
      corrente !== null &&
      typeof corrente === "object" &&
      "stato" in corrente
        ? { ...corrente, stato: conferma.stato }
        : corrente,
  );
  await queryClient.invalidateQueries({
    predicate: (query) =>
      queryAppartieneASessione(query.queryKey, operazione.sessioneAstaId),
  });
}

/** Avvia un solo ciclo di reinvio quando il browser torna online. */
function GestoreReinvioCodaLocale() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const rete = useNetwork();
  const inizializzata = useCodaLocale((stato) => stato.inizializzata);
  const carica = useCodaLocale((stato) => stato.carica);
  const { mutateAsync: inviaRegistrazione } = useMutation(
    trpc.registro.aggiungi.mutationOptions(),
  );
  const esecuzioneCorrente = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void carica();
  }, [carica]);

  useEffect(() => {
    if (!rete.online || !inizializzata || esecuzioneCorrente.current !== null) {
      return;
    }

    const controller = new AbortController();
    const esecuzione = reinviaCodaLocale({
      store: {
        leggiOperazioni: () => storeCodaLocale.getState().operazioni,
        aggiorna: (chiave, aggiornamento) =>
          storeCodaLocale.getState().aggiorna(chiave, aggiornamento),
        rimuovi: (chiave) => storeCodaLocale.getState().rimuovi(chiave),
      },
      segnale: controller.signal,
      invia: (operazione) =>
        inviaRegistrazione(inputRegistrazioneDaOperazione(operazione)),
      onConfermata: (operazione, conferma) =>
        aggiornaCacheDopoConferma(queryClient, operazione, conferma),
      estraiConflitto: estraiConflittoRegistro,
      onConflitto: () => {
        notifications.show({
          color: "yellow",
          title: "Conflitto da risolvere",
          message:
            "Il server contiene già una versione per questo giocatore. Confronta le versioni prima di continuare.",
        });
      },
      onNonInviata: () => {
        notifications.show({
          color: "red",
          title: "Operazione non inviata",
          message: MESSAGGIO_OPERAZIONE_NON_INVIATA,
        });
      },
    });

    esecuzioneCorrente.current = esecuzione;
    void esecuzione.finally(() => {
      if (esecuzioneCorrente.current === esecuzione) {
        esecuzioneCorrente.current = null;
      }
    });

    return () => {
      controller.abort();
    };
  }, [inizializzata, inviaRegistrazione, queryClient, rete.online]);

  return null;
}

function valoreMostrato(valore: unknown): string {
  if (
    typeof valore === "string" ||
    typeof valore === "number" ||
    typeof valore === "boolean"
  ) {
    return String(valore);
  }
  return "Non annotato";
}

/** Mantiene entrambe le versioni visibili e immutate finché l'utente non sceglie. */
function GestoreConflittiCodaLocale() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const operazione = useCodaLocale((stato) =>
    stato.operazioni.find(
      (corrente) =>
        corrente.stato === "in_conflitto" &&
        corrente.conflitto !== undefined,
    ),
  );
  const rimuovi = useCodaLocale((stato) => stato.rimuovi);
  const aggiorna = useCodaLocale((stato) => stato.aggiorna);
  const risoluzione = useMutation(
    trpc.registro.risolviConflitto.mutationOptions(),
  );

  if (operazione?.conflitto === undefined) return null;
  const versioneServer = operazione.conflitto.versioneServer;
  const prezzoLocale = operazione.dati.prezzoAcquisto;
  const repartoLocale = operazione.dati.repartoAssegnato;

  const applicaScelta = async (scelta: "locale" | "server") => {
    try {
      const conferma = await risoluzione.mutateAsync({
        ...inputRegistrazioneDaOperazione(operazione),
        voceServerId: versioneServer.id,
        risoluzione: scelta,
      });
      await aggiornaCacheDopoConferma(queryClient, operazione, conferma);
      await rimuovi(operazione.chiaveIdempotenza);
      notifications.show({
        color: "green",
        title: "Conflitto risolto",
        message:
          scelta === "locale"
            ? "La versione locale è stata applicata al registro."
            : "La versione già presente sul server è stata conservata.",
      });
    } catch (error_: unknown) {
      const conflittoAggiornato = estraiConflittoRegistro(error_);
      if (conflittoAggiornato !== null) {
        await aggiorna(operazione.chiaveIdempotenza, {
          conflitto: conflittoAggiornato,
          stato: "in_conflitto",
        });
      }
      let messaggio = "La versione server è cambiata: confronta nuovamente i dati.";
      if (conflittoAggiornato === null) {
        messaggio =
          error_ instanceof Error
            ? error_.message
            : "Non è stato possibile applicare la scelta.";
      }
      notifications.show({
        color: "red",
        title: "Conflitto non risolto",
        message: messaggio,
      });
    }
  };

  return (
    <Modal
      centered
      closeOnClickOutside={false}
      closeOnEscape={false}
      onClose={() => undefined}
      opened
      title={`Conflitto per ${versioneServer.nomeGiocatore}`}
      withCloseButton={false}
    >
      <Stack>
        <Text size="sm">
          Scegli quale versione conservare. La coda locale e il registro restano
          invariati finché non confermi una scelta.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Paper p="md" withBorder>
            <Stack gap="xs">
              <Text fw={700}>Versione locale</Text>
              <Text>Assegnatario: Utente</Text>
              <Text>Prezzo: {valoreMostrato(prezzoLocale)}</Text>
              <Text>Reparto: {valoreMostrato(repartoLocale)}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder>
            <Stack gap="xs">
              <Text fw={700}>Versione server</Text>
              <Text>
                Assegnatario: {versioneServer.assegnatarioTipo === "utente"
                  ? "Utente"
                  : valoreMostrato(versioneServer.avversarioId)}
              </Text>
              <Text>
                Prezzo: {valoreMostrato(versioneServer.prezzoAcquisto)}
              </Text>
              <Text>Reparto: {versioneServer.repartoAssegnato}</Text>
            </Stack>
          </Paper>
        </SimpleGrid>
        <Group grow>
          <Button
            disabled={risoluzione.isPending}
            onClick={() => void applicaScelta("locale")}
          >
            Conserva locale
          </Button>
          <Button
            disabled={risoluzione.isPending}
            onClick={() => void applicaScelta("server")}
            variant="outline"
          >
            Conserva server
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function FornitoreClient({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(creaQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<RouterApplicazione>({
      links: [
        httpBatchLink({
          url: urlTrpc(),
          fetch(url, opzioni) {
            return fetch(url, { ...opzioni, credentials: "same-origin" });
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <GestoreReinvioCodaLocale />
        <GestoreConflittiCodaLocale />
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
