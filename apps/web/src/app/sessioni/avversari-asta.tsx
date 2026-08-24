"use client";

import type { ConfigurazioneAsta, Reparto } from "@asta/contracts";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { chiaveQuerySessione, queryAppartieneASessione } from "../../client/query-client";
import { useTRPC } from "../../client/fornitore-client";
import {
  CampoRicercaGiocatore,
  type GiocatoreRicerca,
} from "../../componenti/campo-ricerca-giocatore";
import type {
  AnnotazioneAcquistoAvversario,
  RiepilogoAvversario,
} from "../../server/avversari/servizio-avversari";
import type { IndiceRicercaSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";

interface GiocatoreAnnotabile extends GiocatoreRicerca {
  readonly ruoli: readonly Reparto[];
}

export interface InputAnnotazioneVista {
  readonly identificativoGiocatore: string;
  readonly avversarioId: string | null;
  readonly prezzoAcquisto: number | null;
  readonly repartoAssegnato: Reparto;
}

export function creaGiocatoriAnnotabili(
  indice: IndiceRicercaSnapshot | null,
  identificativiNonDisponibili: readonly string[],
): readonly GiocatoreAnnotabile[] {
  if (indice === null) return [];
  const nonDisponibili = new Set(identificativiNonDisponibili);

  return indice.giocatori
    .filter((giocatore) => !nonDisponibili.has(giocatore.id))
    .map((giocatore) => ({
      identificativo: giocatore.id,
      nome: giocatore.nome,
      nomeRicerca: giocatore.nomeRicerca,
      squadra: giocatore.squadra,
      ruolo: giocatore.ruoli.join("/") || "—",
      ruoli: giocatore.ruoli as readonly Reparto[],
      disponibile: true,
    }));
}

function etichettaValore(valore: number | null, suffisso: string): string {
  return valore === null ? "Non annotato" : `${valore} ${suffisso}`;
}

function ConteggiReparto({ conteggi }: {
  readonly conteggi: RiepilogoAvversario["giocatoriPerReparto"];
}) {
  return (
    <Group gap="xs">
      {Object.entries(conteggi).map(([reparto, numero]) => (
        <Badge key={reparto} variant="light">
          {reparto}: {numero}
        </Badge>
      ))}
    </Group>
  );
}

function TabellaAnnotazioni({
  annotazioni,
  annullamentoInCorsoId,
  onAnnulla,
}: {
  readonly annotazioni: readonly AnnotazioneAcquistoAvversario[];
  readonly annullamentoInCorsoId: string | null;
  readonly onAnnulla: (voceRegistroId: string) => Promise<boolean>;
}) {
  if (annotazioni.length === 0) {
    return <Text c="dimmed">Nessun acquisto avversario annotato.</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={720}>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Giocatore</Table.Th>
            <Table.Th>Avversario</Table.Th>
            <Table.Th>Reparto</Table.Th>
            <Table.Th>Prezzo</Table.Th>
            <Table.Th>Azioni</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {annotazioni.map((annotazione) => (
            <Table.Tr key={annotazione.id}>
              <Table.Td>
                <Text fw={600}>{annotazione.nomeGiocatore}</Text>
                <Text c="dimmed" size="sm">{annotazione.squadra}</Text>
              </Table.Td>
              <Table.Td>{annotazione.avversarioNome ?? "Non annotato"}</Table.Td>
              <Table.Td>{annotazione.repartoAssegnato}</Table.Td>
              <Table.Td>{etichettaValore(annotazione.prezzoAcquisto, "crediti")}</Table.Td>
              <Table.Td>
                <ActionIcon
                  aria-label={`Annulla acquisto di ${annotazione.nomeGiocatore}`}
                  color="red"
                  loading={annullamentoInCorsoId === annotazione.id}
                  onClick={() => void onAnnulla(annotazione.id)}
                  variant="light"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export interface SchermataAvversariAstaProps {
  readonly sessioneAstaId: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly avversari: readonly RiepilogoAvversario[];
  readonly annotazioni: readonly AnnotazioneAcquistoAvversario[];
  readonly giocatori: readonly GiocatoreAnnotabile[];
  readonly onCreaAvversario: (nome: string) => Promise<boolean>;
  readonly onAnnota: (input: InputAnnotazioneVista) => Promise<boolean>;
  readonly onAnnulla: (voceRegistroId: string) => Promise<boolean>;
  readonly erroreCreazione?: string | null;
  readonly erroreAnnotazione?: string | null;
  readonly erroreAnnullamento?: string | null;
  readonly creazioneInCorso?: boolean;
  readonly annotazioneInCorso?: boolean;
  readonly annullamentoInCorsoId?: string | null;
}

/** Vista degli avversari, dei relativi budget stimati e delle annotazioni. */
export function SchermataAvversariAsta({
  sessioneAstaId,
  configurazione,
  avversari,
  annotazioni,
  giocatori,
  onCreaAvversario,
  onAnnota,
  onAnnulla,
  erroreCreazione = null,
  erroreAnnotazione = null,
  erroreAnnullamento = null,
  creazioneInCorso = false,
  annotazioneInCorso = false,
  annullamentoInCorsoId = null,
}: SchermataAvversariAstaProps) {
  const [nomeAvversario, setNomeAvversario] = useState("");
  const [termineGiocatore, setTermineGiocatore] = useState("");
  const [giocatoreSelezionato, setGiocatoreSelezionato] = useState<GiocatoreAnnotabile | null>(null);
  const [avversarioId, setAvversarioId] = useState<string | null>(null);
  const [prezzoAcquisto, setPrezzoAcquisto] = useState<number | string>("");
  const [repartoAssegnato, setRepartoAssegnato] = useState<Reparto | null>(null);

  const opzioniAvversari = avversari.map((avversario) => ({
    value: avversario.id,
    label: avversario.nome,
  }));
  const creditiResiduiSelezionati = avversari.find(
    (avversario) => avversario.id === avversarioId,
  )?.creditiResiduiStimati ?? configurazione.creditiIniziali;
  const annotazioneValida =
    giocatoreSelezionato !== null &&
    repartoAssegnato !== null &&
    (prezzoAcquisto === "" ||
      (Number.isInteger(prezzoAcquisto) &&
        Number(prezzoAcquisto) >= 1 &&
        Number(prezzoAcquisto) <= creditiResiduiSelezionati));

  return (
    <Container component="main" size="xl" py="xl">
      <Stack gap="lg">
        <Group align="flex-start" justify="space-between">
          <div>
            <Title order={1}>Avversari</Title>
            <Text c="dimmed">
              Annota gli acquisti altrui e controlla crediti e reparti di ogni partecipante.
            </Text>
          </div>
          <Button
            component={Link}
            href={`/sessioni/${encodeURIComponent(sessioneAstaId)}`}
            leftSection={<IconArrowLeft size={18} />}
            variant="light"
          >
            Torna alla dashboard
          </Button>
        </Group>

        <Alert color="blue" title="Disponibilità basata sulle annotazioni">
          Annullando una voce, il giocatore torna immediatamente tra quelli disponibili.
        </Alert>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper component="section" p="md" withBorder>
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void onCreaAvversario(nomeAvversario).then((creato) => {
                  if (creato) setNomeAvversario("");
                });
              }}
            >
              <Stack gap="sm">
                <Title order={2} size="h3">Definisci avversario</Title>
                <TextInput
                  label="Nome avversario"
                  maxLength={30}
                  minLength={1}
                  onChange={(evento) => setNomeAvversario(evento.currentTarget.value)}
                  placeholder="Da 1 a 30 caratteri"
                  required
                  value={nomeAvversario}
                />
                {erroreCreazione === null ? null : (
                  <Alert color="red" icon={<IconAlertCircle size={18} />}>
                    {erroreCreazione}
                  </Alert>
                )}
                <Button
                  disabled={nomeAvversario.trim().length < 1 || nomeAvversario.trim().length > 30}
                  leftSection={<IconUserPlus size={18} />}
                  loading={creazioneInCorso}
                  type="submit"
                >
                  Aggiungi avversario
                </Button>
              </Stack>
            </form>
          </Paper>

          <Paper component="section" p="md" withBorder>
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                if (!annotazioneValida || giocatoreSelezionato === null || repartoAssegnato === null) return;
                void onAnnota({
                  identificativoGiocatore: giocatoreSelezionato.identificativo,
                  avversarioId,
                  prezzoAcquisto: prezzoAcquisto === "" ? null : Number(prezzoAcquisto),
                  repartoAssegnato,
                }).then((annotata) => {
                  if (!annotata) return;
                  setTermineGiocatore("");
                  setGiocatoreSelezionato(null);
                  setAvversarioId(null);
                  setPrezzoAcquisto("");
                  setRepartoAssegnato(null);
                });
              }}
            >
              <Stack gap="sm">
                <Title order={2} size="h3">Annota acquisto altrui</Title>
                <CampoRicercaGiocatore
                  disabilitato={giocatori.length === 0}
                  etichetta="Giocatore disponibile"
                  giocatori={giocatori}
                  onChange={(valore) => {
                    setTermineGiocatore(valore);
                    if (
                      giocatoreSelezionato !== null &&
                      giocatoreSelezionato.nome !== valore
                    ) {
                      setGiocatoreSelezionato(null);
                      setRepartoAssegnato(null);
                    }
                  }}
                  onSeleziona={(giocatore) => {
                    const selezionato = giocatori.find(
                      (corrente) => corrente.identificativo === giocatore.identificativo,
                    );
                    if (selezionato === undefined) return;
                    setGiocatoreSelezionato(selezionato);
                    setTermineGiocatore(selezionato.nome);
                    setRepartoAssegnato(selezionato.ruoli[0] ?? null);
                  }}
                  valore={termineGiocatore}
                />
                <Select
                  clearable
                  data={opzioniAvversari}
                  description="Facoltativo"
                  label="Avversario assegnatario"
                  onChange={setAvversarioId}
                  placeholder="Nome non annotato"
                  searchable
                  value={avversarioId}
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="none"
                  description={`Facoltativo; massimo ${creditiResiduiSelezionati} crediti`}
                  label="Prezzo di acquisto"
                  max={creditiResiduiSelezionati}
                  min={1}
                  onChange={setPrezzoAcquisto}
                  placeholder="Prezzo non annotato"
                  value={prezzoAcquisto}
                />
                {giocatoreSelezionato !== null && giocatoreSelezionato.ruoli.length > 1 ? (
                  <Select
                    data={giocatoreSelezionato.ruoli.map((ruolo) => ({ value: ruolo, label: ruolo }))}
                    label="Ruolo di imputazione"
                    onChange={(valore) => setRepartoAssegnato(valore as Reparto | null)}
                    value={repartoAssegnato}
                  />
                ) : null}
                {erroreAnnotazione === null ? null : (
                  <Alert color="red" icon={<IconAlertCircle size={18} />}>
                    {erroreAnnotazione}
                  </Alert>
                )}
                <Button
                  disabled={!annotazioneValida}
                  leftSection={<IconPlus size={18} />}
                  loading={annotazioneInCorso}
                  type="submit"
                >
                  Registra annotazione
                </Button>
              </Stack>
            </form>
          </Paper>
        </SimpleGrid>

        <Paper component="section" p="md" withBorder>
          <Stack gap="md">
            <Title order={2} size="h3">Riepilogo avversari</Title>
            {avversari.length === 0 ? (
              <Text c="dimmed">Nessun avversario definito.</Text>
            ) : (
              <Table.ScrollContainer minWidth={720}>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Nome</Table.Th>
                      <Table.Th>Crediti spesi</Table.Th>
                      <Table.Th>Crediti residui stimati</Table.Th>
                      <Table.Th>Giocatori per reparto</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {avversari.map((avversario) => (
                      <Table.Tr key={avversario.id}>
                        <Table.Td><Text fw={600}>{avversario.nome}</Text></Table.Td>
                        <Table.Td>{avversario.creditiSpesi}</Table.Td>
                        <Table.Td>{avversario.creditiResiduiStimati}</Table.Td>
                        <Table.Td><ConteggiReparto conteggi={avversario.giocatoriPerReparto} /></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>

        <Paper component="section" p="md" withBorder>
          <Stack gap="md">
            <Title order={2} size="h3">Acquisti annotati</Title>
            {erroreAnnullamento === null ? null : (
              <Alert color="red" icon={<IconAlertCircle size={18} />}>
                {erroreAnnullamento}
              </Alert>
            )}
            <TabellaAnnotazioni
              annotazioni={annotazioni}
              annullamentoInCorsoId={annullamentoInCorsoId}
              onAnnulla={onAnnulla}
            />
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

class ErroreIndiceAvversari extends Error {}

async function recuperaIndiceRicerca(
  sessioneAstaId: string,
): Promise<IndiceRicercaSnapshot> {
  const risposta = await fetch(
    `/api/snapshot/corrente/indice?sessioneAstaId=${encodeURIComponent(sessioneAstaId)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as {
      readonly messaggio?: string;
    };
    throw new ErroreIndiceAvversari(
      corpo.messaggio ?? "La ricerca dei giocatori non è disponibile.",
    );
  }
  return (await risposta.json()) as IndiceRicercaSnapshot;
}

export default function PaginaAvversariAsta({
  sessioneAstaId,
}: {
  readonly sessioneAstaId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ripristino = useQuery(
    trpc.sessioni.ripristina.queryOptions({ sessioneAstaId }),
  );
  const avversari = useQuery(
    trpc.avversari.elenca.queryOptions({ sessioneAstaId }),
  );
  const annotazioni = useQuery(
    trpc.avversari.annotazioni.queryOptions({ sessioneAstaId }),
  );
  const indice = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "indice-ricerca-snapshot"),
    queryFn: () => recuperaIndiceRicerca(sessioneAstaId),
  });
  const creazione = useMutation(trpc.avversari.crea.mutationOptions());
  const annotazione = useMutation(
    trpc.registro.annotaAcquistoAltrui.mutationOptions(),
  );
  const annullamento = useMutation(trpc.registro.annulla.mutationOptions());
  const [annullamentoInCorsoId, setAnnullamentoInCorsoId] = useState<string | null>(null);

  const giocatori = useMemo(
    () =>
      creaGiocatoriAnnotabili(
        indice.data ?? null,
        ripristino.data?.stato.identificativiNonDisponibili ?? [],
      ),
    [indice.data, ripristino.data?.stato.identificativiNonDisponibili],
  );

  async function invalidaSessione(): Promise<void> {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        queryAppartieneASessione(query.queryKey, sessioneAstaId),
    });
  }

  if (
    ripristino.isPending ||
    avversari.isPending ||
    annotazioni.isPending ||
    indice.isPending
  ) {
    return (
      <Group justify="center" py="xl">
        <Loader aria-label="Caricamento vista avversari" />
      </Group>
    );
  }

  const erroreCaricamento =
    ripristino.error ?? avversari.error ?? annotazioni.error ?? indice.error;
  if (erroreCaricamento !== null || ripristino.data === undefined) {
    return (
      <Container component="main" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Vista avversari non disponibile">
          {erroreCaricamento?.message ?? "Impossibile caricare la sessione."}
        </Alert>
      </Container>
    );
  }

  return (
    <SchermataAvversariAsta
      annotazioneInCorso={annotazione.isPending}
      annotazioni={annotazioni.data ?? []}
      annullamentoInCorsoId={annullamentoInCorsoId}
      avversari={avversari.data ?? []}
      configurazione={ripristino.data.configurazione}
      creazioneInCorso={creazione.isPending}
      erroreAnnotazione={annotazione.error?.message ?? null}
      erroreAnnullamento={annullamento.error?.message ?? null}
      erroreCreazione={creazione.error?.message ?? null}
      giocatori={giocatori}
      onAnnota={async (input) => {
        annotazione.reset();
        try {
          await annotazione.mutateAsync({
            sessioneAstaId,
            ...input,
            chiaveIdempotenza: crypto.randomUUID(),
          });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        }
      }}
      onAnnulla={async (voceRegistroId) => {
        annullamento.reset();
        setAnnullamentoInCorsoId(voceRegistroId);
        try {
          await annullamento.mutateAsync({ sessioneAstaId, voceRegistroId });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        } finally {
          setAnnullamentoInCorsoId(null);
        }
      }}
      onCreaAvversario={async (nome) => {
        creazione.reset();
        try {
          await creazione.mutateAsync({ sessioneAstaId, nome });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        }
      }}
      sessioneAstaId={sessioneAstaId}
    />
  );
}
