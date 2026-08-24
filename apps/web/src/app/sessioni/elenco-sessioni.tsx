"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCopy,
  IconDotsVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useTRPC } from "../../client/fornitore-client";

export const DURATA_CONFERMA_ELIMINAZIONE_MS = 120_000;

export interface VoceSessioneAstaClient {
  readonly id: string;
  readonly nome: string;
  readonly creatoIl: string;
  readonly aggiornatoIl: string;
  readonly tipoAsta:
    | "chiamata"
    | "random"
    | "busta_chiusa"
    | "asta_live_ordine_listone"
    | "riparazione";
  readonly budgetResiduo: number;
  readonly numeroGiocatoriRosa: number;
}

const ETICHETTE_TIPO_ASTA: Record<VoceSessioneAstaClient["tipoAsta"], string> = {
  chiamata: "Chiamata",
  random: "Random",
  busta_chiusa: "Busta chiusa",
  asta_live_ordine_listone: "Live in ordine di listone",
  riparazione: "Riparazione",
};

const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export function etichettaTipoAsta(
  tipoAsta: VoceSessioneAstaClient["tipoAsta"],
): string {
  return ETICHETTE_TIPO_ASTA[tipoAsta];
}

export function formattaDataCreazione(dataIso: string): string {
  return FORMATO_DATA.format(new Date(dataIso));
}

function messaggioErrore(error_: unknown): string {
  return error_ instanceof Error
    ? error_.message
    : "Operazione non completata. Riprova.";
}

export interface ElencoSessioniAstaProps {
  readonly sessioni: readonly VoceSessioneAstaClient[];
  readonly caricamento?: boolean;
  readonly erroreCaricamento?: string | null;
  readonly duplicazioneInCorsoId?: string | null;
  readonly eliminazioneInCorso?: boolean;
  readonly onDuplica: (sessione: VoceSessioneAstaClient) => Promise<void>;
  readonly onElimina: (sessione: VoceSessioneAstaClient) => Promise<boolean>;
}

/** Schermata dell'elenco; usa esclusivamente primitive Mantine e nessun CSS locale. */
export function ElencoSessioniAsta({
  sessioni,
  caricamento = false,
  erroreCaricamento = null,
  duplicazioneInCorsoId = null,
  eliminazioneInCorso = false,
  onDuplica,
  onElimina,
}: ElencoSessioniAstaProps) {
  const [sessioneDaEliminare, setSessioneDaEliminare] =
    useState<VoceSessioneAstaClient | null>(null);

  useEffect(() => {
    if (sessioneDaEliminare === null) return undefined;
    const timeout = window.setTimeout(
      () => setSessioneDaEliminare(null),
      DURATA_CONFERMA_ELIMINAZIONE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [sessioneDaEliminare]);

  async function confermaEliminazione(): Promise<void> {
    if (sessioneDaEliminare === null) return;
    if (await onElimina(sessioneDaEliminare)) {
      setSessioneDaEliminare(null);
    }
  }

  return (
    <Container className="nocturne-page" component="main" size="lg" py="xl">
      <Stack gap="xl">
        <Group className="nocturne-page-header" justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Le tue sessioni d&apos;asta</Title>
            <Text c="dimmed" mt="xs">
              Riprendi un&apos;asta o duplicane la configurazione per una nuova lega.
            </Text>
          </div>
          <Button component={Link} href="/sessioni/nuova" leftSection={<IconPlus size={18} />}>
            Crea sessione
          </Button>
        </Group>

        {erroreCaricamento === null ? null : (
          <Alert color="red" icon={<IconAlertCircle size={20} />} title="Elenco non disponibile">
            {erroreCaricamento}
          </Alert>
        )}

        {caricamento ? (
          <Group justify="center" py="xl">
            <Loader aria-label="Caricamento sessioni" />
          </Group>
        ) : null}

        {!caricamento && erroreCaricamento === null && sessioni.length === 0 ? (
          <Card withBorder padding="xl" radius="md">
            <Stack align="center" gap="md">
              <Title order={2}>Nessuna sessione d&apos;asta</Title>
              <Text c="dimmed" ta="center">
                Non hai ancora creato una sessione. Inizia configurando la tua prima asta.
              </Text>
              <Button component={Link} href="/sessioni/nuova" leftSection={<IconPlus size={18} />}>
                Crea la prima sessione
              </Button>
            </Stack>
          </Card>
        ) : null}

        {!caricamento && sessioni.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {sessioni.map((sessione) => (
              <Card className="nocturne-session-card" key={sessione.id} withBorder padding="lg" radius="md">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div>
                      <Title order={2} size="h3">
                        {sessione.nome}
                      </Title>
                      <Text c="dimmed" size="sm">
                        Creata il {formattaDataCreazione(sessione.creatoIl)}
                      </Text>
                    </div>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <Button
                          aria-label={`Azioni per ${sessione.nome}`}
                          loading={duplicazioneInCorsoId === sessione.id}
                          px="xs"
                          variant="subtle"
                        >
                          <IconDotsVertical size={20} />
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconCopy size={16} />}
                          onClick={() => void onDuplica(sessione)}
                        >
                          Duplica
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={() => setSessioneDaEliminare(sessione)}
                        >
                          Elimina
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  <Badge variant="light">{etichettaTipoAsta(sessione.tipoAsta)}</Badge>
                  <Group grow>
                    <div>
                      <Text c="dimmed" size="sm">Budget residuo</Text>
                      <Text fw={700}>{sessione.budgetResiduo} crediti</Text>
                    </div>
                    <div>
                      <Text c="dimmed" size="sm">Giocatori in rosa</Text>
                      <Text fw={700}>{sessione.numeroGiocatoriRosa}</Text>
                    </div>
                  </Group>
                  <Button component={Link} href={`/sessioni/${encodeURIComponent(sessione.id)}`} variant="light">
                    Apri sessione
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        ) : null}
      </Stack>

      <Modal
        centered
        onClose={() => setSessioneDaEliminare(null)}
        opened={sessioneDaEliminare !== null}
        title="Elimina sessione d'asta"
      >
        <Stack>
          <Text>
            Confermi l&apos;eliminazione irreversibile di <strong>{sessioneDaEliminare?.nome}</strong>?
          </Text>
          <Text c="dimmed" size="sm">
            La richiesta viene annullata automaticamente dopo 120 secondi.
          </Text>
          <Group justify="flex-end">
            <Button onClick={() => setSessioneDaEliminare(null)} variant="default">
              Annulla
            </Button>
            <Button color="red" loading={eliminazioneInCorso} onClick={() => void confermaEliminazione()}>
              Elimina definitivamente
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default function PaginaElencoSessioni() {
  const trpc = useTRPC();
  const elenco = useQuery(trpc.sessioni.elenca.queryOptions());
  const [erroreOperazione, setErroreOperazione] = useState<string | null>(null);
  const [duplicazioneInCorsoId, setDuplicazioneInCorsoId] = useState<string | null>(null);

  const duplicazione = useMutation(trpc.sessioni.duplica.mutationOptions());
  const eliminazione = useMutation(trpc.sessioni.elimina.mutationOptions());

  async function duplica(sessione: VoceSessioneAstaClient): Promise<void> {
    setDuplicazioneInCorsoId(sessione.id);
    setErroreOperazione(null);
    try {
      await duplicazione.mutateAsync({ sessioneAstaId: sessione.id });
      await elenco.refetch();
    } catch (error_: unknown) {
      setErroreOperazione(messaggioErrore(error_));
    } finally {
      setDuplicazioneInCorsoId(null);
    }
  }

  async function elimina(sessione: VoceSessioneAstaClient): Promise<boolean> {
    setErroreOperazione(null);
    try {
      await eliminazione.mutateAsync({ sessioneAstaId: sessione.id });
      await elenco.refetch();
      return true;
    } catch (error_: unknown) {
      setErroreOperazione(messaggioErrore(error_));
      return false;
    }
  }

  return (
    <ElencoSessioniAsta
      caricamento={elenco.isPending}
      duplicazioneInCorsoId={duplicazioneInCorsoId}
      eliminazioneInCorso={eliminazione.isPending}
      erroreCaricamento={
        erroreOperazione ?? (elenco.error === null ? null : messaggioErrore(elenco.error))
      }
      onDuplica={duplica}
      onElimina={elimina}
      sessioni={(elenco.data ?? []) as readonly VoceSessioneAstaClient[]}
    />
  );
}
