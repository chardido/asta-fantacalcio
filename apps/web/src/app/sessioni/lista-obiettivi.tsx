"use client";

import type { Reparto } from "@asta/contracts";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconDeviceFloppy,
  IconPlus,
  IconTargetArrow,
} from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  chiaveQuerySessione,
  queryAppartieneASessione,
} from "../../client/query-client";
import { useTRPC } from "../../client/fornitore-client";
import {
  CampoRicercaGiocatore,
  type GiocatoreRicerca,
} from "../../componenti/campo-ricerca-giocatore";
import type { IndiceRicercaSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";

export type OrdinamentoListaObiettivi = "reparto" | "priorita";

export interface VoceObiettivoClient {
  readonly id: string;
  readonly identificativoGiocatore: string;
  readonly nomeGiocatore: string;
  readonly reparto: Reparto;
  readonly prezzoMassimoPersonale: number | null;
  readonly priorita: number;
  readonly nonRaggiungibile: boolean;
}

interface GiocatoreObiettivo extends GiocatoreRicerca {
  readonly ruoli: readonly Reparto[];
}

export interface InputNuovoObiettivo {
  readonly identificativoGiocatore: string;
  readonly prezzoMassimoPersonale: number | null;
  readonly priorita: number;
  readonly reparto?: Reparto;
}

export function creaGiocatoriObiettivo(
  indice: IndiceRicercaSnapshot | null,
  identificativiNonDisponibili: readonly string[],
): readonly GiocatoreObiettivo[] {
  if (indice === null) return [];
  const nonDisponibili = new Set(identificativiNonDisponibili);

  return indice.giocatori.map((giocatore) => ({
    identificativo: giocatore.id,
    nome: giocatore.nome,
    nomeRicerca: giocatore.nomeRicerca,
    squadra: giocatore.squadra,
    ruolo: giocatore.ruoli.join("/") || "—",
    ruoli: giocatore.ruoli as readonly Reparto[],
    disponibile: !nonDisponibili.has(giocatore.id),
  }));
}

function valoreInteroValido(
  valore: number | string,
  minimo: number,
  massimo: number,
): valore is number {
  return (
    typeof valore === "number" &&
    Number.isInteger(valore) &&
    valore >= minimo &&
    valore <= massimo
  );
}

function RigaObiettivo({
  voce,
  creditiIniziali,
  aggiornamentoPrezzoInCorso,
  aggiornamentoPrioritaInCorso,
  onAggiornaPrezzo,
  onAggiornaPriorita,
}: {
  readonly voce: VoceObiettivoClient;
  readonly creditiIniziali: number;
  readonly aggiornamentoPrezzoInCorso: boolean;
  readonly aggiornamentoPrioritaInCorso: boolean;
  readonly onAggiornaPrezzo: (
    obiettivoId: string,
    prezzoMassimoPersonale: number | null,
  ) => Promise<boolean>;
  readonly onAggiornaPriorita: (
    obiettivoId: string,
    priorita: number,
  ) => Promise<boolean>;
}) {
  const [prezzo, setPrezzo] = useState<number | string>(
    voce.prezzoMassimoPersonale ?? "",
  );
  const [priorita, setPriorita] = useState<number | string>(voce.priorita);
  const prezzoValido =
    prezzo === "" || valoreInteroValido(prezzo, 1, creditiIniziali);
  const prioritaValida = valoreInteroValido(priorita, 1, 99);

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text fw={600}>{voce.nomeGiocatore}</Text>
          {voce.nonRaggiungibile ? (
            <Badge color="red" variant="light">
              Non raggiungibile
            </Badge>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td>{voce.reparto}</Table.Td>
      <Table.Td>
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            aria-label={`Prezzo massimo personale di ${voce.nomeGiocatore}`}
            clampBehavior="none"
            max={creditiIniziali}
            min={1}
            onChange={setPrezzo}
            placeholder="Non assegnato"
            value={prezzo}
          />
          <Button
            aria-label={`Salva prezzo massimo personale di ${voce.nomeGiocatore}`}
            disabled={!prezzoValido}
            loading={aggiornamentoPrezzoInCorso}
            onClick={() =>
              void onAggiornaPrezzo(
                voce.id,
                prezzo === "" ? null : Number(prezzo),
              )
            }
            px="sm"
            variant="light"
          >
            <IconDeviceFloppy aria-hidden size={18} />
          </Button>
        </Group>
        <Text c="dimmed" size="xs">
          Da 1 a {creditiIniziali}; vuoto = non assegnato
        </Text>
      </Table.Td>
      <Table.Td>
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            aria-label={`Priorità di ${voce.nomeGiocatore}`}
            clampBehavior="none"
            max={99}
            min={1}
            onChange={setPriorita}
            value={priorita}
          />
          <Button
            aria-label={`Salva priorità di ${voce.nomeGiocatore}`}
            disabled={!prioritaValida}
            loading={aggiornamentoPrioritaInCorso}
            onClick={() =>
              void onAggiornaPriorita(voce.id, Number(priorita))
            }
            px="sm"
            variant="light"
          >
            <IconDeviceFloppy aria-hidden size={18} />
          </Button>
        </Group>
        <Text c="dimmed" size="xs">1 = più alta, 99 = più bassa</Text>
      </Table.Td>
    </Table.Tr>
  );
}

export interface SchermataListaObiettiviProps {
  readonly sessioneAstaId: string;
  readonly creditiIniziali: number;
  readonly voci: readonly VoceObiettivoClient[];
  readonly conteggiPerReparto: Readonly<Partial<Record<Reparto, number>>>;
  readonly giocatori: readonly GiocatoreObiettivo[];
  readonly ordinamento: OrdinamentoListaObiettivi;
  readonly onCambiaOrdinamento: (ordinamento: OrdinamentoListaObiettivi) => void;
  readonly onAggiungi: (input: InputNuovoObiettivo) => Promise<boolean>;
  readonly onAggiornaPrezzo: (
    obiettivoId: string,
    prezzoMassimoPersonale: number | null,
  ) => Promise<boolean>;
  readonly onAggiornaPriorita: (
    obiettivoId: string,
    priorita: number,
  ) => Promise<boolean>;
  readonly erroreAggiunta?: string | null;
  readonly erroreAggiornamento?: string | null;
  readonly aggiuntaInCorso?: boolean;
  readonly aggiornamentoPrezzoInCorsoId?: string | null;
  readonly aggiornamentoPrioritaInCorsoId?: string | null;
}

/** Vista della strategia pre-asta con inserimento, ordinamento e modifica inline. */
export function SchermataListaObiettivi({
  sessioneAstaId,
  creditiIniziali,
  voci,
  conteggiPerReparto,
  giocatori,
  ordinamento,
  onCambiaOrdinamento,
  onAggiungi,
  onAggiornaPrezzo,
  onAggiornaPriorita,
  erroreAggiunta = null,
  erroreAggiornamento = null,
  aggiuntaInCorso = false,
  aggiornamentoPrezzoInCorsoId = null,
  aggiornamentoPrioritaInCorsoId = null,
}: SchermataListaObiettiviProps) {
  const [termineGiocatore, setTermineGiocatore] = useState("");
  const [giocatoreSelezionato, setGiocatoreSelezionato] =
    useState<GiocatoreObiettivo | null>(null);
  const [prezzo, setPrezzo] = useState<number | string>("");
  const [priorita, setPriorita] = useState<number | string>(99);
  const [reparto, setReparto] = useState<Reparto | null>(null);
  const listaPiena = voci.length >= 200;
  const prezzoValido =
    prezzo === "" || valoreInteroValido(prezzo, 1, creditiIniziali);
  const prioritaValida = valoreInteroValido(priorita, 1, 99);
  const inserimentoValido =
    !listaPiena &&
    giocatoreSelezionato !== null &&
    reparto !== null &&
    prezzoValido &&
    prioritaValida;

  return (
    <Container component="main" size="xl" py="xl">
      <Stack gap="lg">
        <Group align="flex-start" justify="space-between">
          <div>
            <Group gap="xs">
              <IconTargetArrow aria-hidden size={28} />
              <Title order={1}>Lista obiettivi</Title>
            </Group>
            <Text c="dimmed">
              Prepara giocatori, tetti personali e priorità prima dell’asta.
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

        <Paper component="section" p="md" withBorder>
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              if (!inserimentoValido || giocatoreSelezionato === null || reparto === null) return;
              void onAggiungi({
                identificativoGiocatore: giocatoreSelezionato.identificativo,
                prezzoMassimoPersonale: prezzo === "" ? null : Number(prezzo),
                priorita: Number(priorita),
                reparto,
              }).then((aggiunto) => {
                if (!aggiunto) return;
                setTermineGiocatore("");
                setGiocatoreSelezionato(null);
                setPrezzo("");
                setPriorita(99);
                setReparto(null);
              });
            }}
          >
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={2} size="h3">Aggiungi obiettivo</Title>
                <Badge color={listaPiena ? "red" : "blue"}>{voci.length}/200</Badge>
              </Group>
              <SimpleGrid cols={{ base: 1, md: 3 }}>
                <CampoRicercaGiocatore
                  disabilitato={giocatori.length === 0 || listaPiena}
                  etichetta="Giocatore"
                  giocatori={giocatori}
                  onChange={(valore) => {
                    setTermineGiocatore(valore);
                    if (giocatoreSelezionato?.nome !== valore) {
                      setGiocatoreSelezionato(null);
                      setReparto(null);
                    }
                  }}
                  onSeleziona={(giocatore) => {
                    const selezionato = giocatori.find(
                      (corrente) => corrente.identificativo === giocatore.identificativo,
                    );
                    if (selezionato === undefined) return;
                    setGiocatoreSelezionato(selezionato);
                    setTermineGiocatore(selezionato.nome);
                    setReparto(selezionato.ruoli[0] ?? null);
                  }}
                  valore={termineGiocatore}
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="none"
                  description={`Facoltativo, da 1 a ${creditiIniziali}`}
                  label="Prezzo massimo personale"
                  max={creditiIniziali}
                  min={1}
                  onChange={setPrezzo}
                  placeholder="Non assegnato"
                  value={prezzo}
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="none"
                  description="Da 1 (più alta) a 99 (più bassa)"
                  label="Priorità"
                  max={99}
                  min={1}
                  onChange={setPriorita}
                  value={priorita}
                />
              </SimpleGrid>
              {giocatoreSelezionato !== null && giocatoreSelezionato.ruoli.length > 1 ? (
                <Select
                  data={giocatoreSelezionato.ruoli.map((ruolo) => ({
                    value: ruolo,
                    label: ruolo,
                  }))}
                  label="Reparto"
                  onChange={(valore) => setReparto(valore as Reparto | null)}
                  value={reparto}
                />
              ) : null}
              {listaPiena ? (
                <Alert color="red" icon={<IconAlertCircle size={18} />}>
                  La lista ha raggiunto il limite di 200 obiettivi.
                </Alert>
              ) : null}
              {erroreAggiunta === null ? null : (
                <Alert color="red" icon={<IconAlertCircle size={18} />}>
                  {erroreAggiunta}
                </Alert>
              )}
              <Button
                disabled={!inserimentoValido}
                leftSection={<IconPlus size={18} />}
                loading={aggiuntaInCorso}
                type="submit"
              >
                Aggiungi alla lista
              </Button>
            </Stack>
          </form>
        </Paper>

        <Paper component="section" p="md" withBorder>
          <Stack gap="md">
            <Group align="flex-end" justify="space-between">
              <div>
                <Title order={2} size="h3">Obiettivi perseguibili per reparto</Title>
                <Group gap="xs" mt="xs">
                  {Object.entries(conteggiPerReparto).map(([repartoVoce, conteggio]) => (
                    <Badge key={repartoVoce} variant="light">
                      {repartoVoce}: {conteggio}
                    </Badge>
                  ))}
                </Group>
              </div>
              <SegmentedControl
                aria-label="Ordina lista obiettivi"
                data={[
                  { label: "Priorità", value: "priorita" },
                  { label: "Reparto", value: "reparto" },
                ]}
                onChange={(valore) =>
                  onCambiaOrdinamento(valore as OrdinamentoListaObiettivi)
                }
                value={ordinamento}
              />
            </Group>

            {erroreAggiornamento === null ? null : (
              <Alert color="red" icon={<IconAlertCircle size={18} />}>
                {erroreAggiornamento}
              </Alert>
            )}

            {voci.length === 0 ? (
              <Text c="dimmed">Nessun giocatore nella lista obiettivi.</Text>
            ) : (
              <Table.ScrollContainer minWidth={860}>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Giocatore</Table.Th>
                      <Table.Th>Reparto</Table.Th>
                      <Table.Th>Prezzo massimo personale</Table.Th>
                      <Table.Th>Priorità</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {voci.map((voce) => (
                      <RigaObiettivo
                        aggiornamentoPrezzoInCorso={
                          aggiornamentoPrezzoInCorsoId === voce.id
                        }
                        aggiornamentoPrioritaInCorso={
                          aggiornamentoPrioritaInCorsoId === voce.id
                        }
                        creditiIniziali={creditiIniziali}
                        key={voce.id}
                        onAggiornaPrezzo={onAggiornaPrezzo}
                        onAggiornaPriorita={onAggiornaPriorita}
                        voce={voce}
                      />
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

class ErroreIndiceObiettivi extends Error {}

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
    throw new ErroreIndiceObiettivi(
      corpo.messaggio ?? "La ricerca dei giocatori non è disponibile.",
    );
  }
  return (await risposta.json()) as IndiceRicercaSnapshot;
}

export default function PaginaListaObiettivi({
  sessioneAstaId,
}: {
  readonly sessioneAstaId: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [ordinamento, setOrdinamento] =
    useState<OrdinamentoListaObiettivi>("priorita");
  const [aggiornamentoPrezzoId, setAggiornamentoPrezzoId] =
    useState<string | null>(null);
  const [aggiornamentoPrioritaId, setAggiornamentoPrioritaId] =
    useState<string | null>(null);
  const ripristino = useQuery(
    trpc.sessioni.ripristina.queryOptions({ sessioneAstaId }),
  );
  const lista = useQuery(
    trpc.obiettivi.elenca.queryOptions({ sessioneAstaId, ordinamento }),
  );
  const indice = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "indice-ricerca-obiettivi"),
    queryFn: () => recuperaIndiceRicerca(sessioneAstaId),
  });
  const aggiunta = useMutation(trpc.obiettivi.aggiungi.mutationOptions());
  const aggiornamentoPrezzo = useMutation(
    trpc.obiettivi.aggiornaPrezzo.mutationOptions(),
  );
  const aggiornamentoPriorita = useMutation(
    trpc.obiettivi.aggiornaPriorita.mutationOptions(),
  );

  const giocatori = useMemo(
    () =>
      creaGiocatoriObiettivo(
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

  if (ripristino.isPending || lista.isPending || indice.isPending) {
    return (
      <Group justify="center" py="xl">
        <Loader aria-label="Caricamento lista obiettivi" />
      </Group>
    );
  }

  const erroreCaricamento = ripristino.error ?? lista.error ?? indice.error;
  if (
    erroreCaricamento !== null ||
    ripristino.data === undefined ||
    lista.data === undefined
  ) {
    return (
      <Container component="main" py="xl">
        <Alert
          color="red"
          icon={<IconAlertCircle size={20} />}
          title="Lista obiettivi non disponibile"
        >
          {erroreCaricamento?.message ?? "Impossibile caricare la sessione."}
        </Alert>
      </Container>
    );
  }

  return (
    <SchermataListaObiettivi
      aggiuntaInCorso={aggiunta.isPending}
      aggiornamentoPrezzoInCorsoId={aggiornamentoPrezzoId}
      aggiornamentoPrioritaInCorsoId={aggiornamentoPrioritaId}
      conteggiPerReparto={lista.data.conteggiPerReparto}
      creditiIniziali={ripristino.data.configurazione.creditiIniziali}
      erroreAggiunta={aggiunta.error?.message ?? null}
      erroreAggiornamento={
        aggiornamentoPrezzo.error?.message ??
        aggiornamentoPriorita.error?.message ??
        null
      }
      giocatori={giocatori}
      onAggiornaPrezzo={async (obiettivoId, prezzoMassimoPersonale) => {
        aggiornamentoPrezzo.reset();
        setAggiornamentoPrezzoId(obiettivoId);
        try {
          await aggiornamentoPrezzo.mutateAsync({
            sessioneAstaId,
            obiettivoId,
            prezzoMassimoPersonale,
          });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        } finally {
          setAggiornamentoPrezzoId(null);
        }
      }}
      onAggiornaPriorita={async (obiettivoId, priorita) => {
        aggiornamentoPriorita.reset();
        setAggiornamentoPrioritaId(obiettivoId);
        try {
          await aggiornamentoPriorita.mutateAsync({
            sessioneAstaId,
            obiettivoId,
            priorita,
          });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        } finally {
          setAggiornamentoPrioritaId(null);
        }
      }}
      onAggiungi={async (input) => {
        aggiunta.reset();
        try {
          await aggiunta.mutateAsync({ sessioneAstaId, ...input });
          await invalidaSessione();
          return true;
        } catch {
          return false;
        }
      }}
      onCambiaOrdinamento={setOrdinamento}
      ordinamento={ordinamento}
      sessioneAstaId={sessioneAstaId}
      voci={lista.data.voci}
    />
  );
}
