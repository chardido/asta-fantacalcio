"use client";

import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type ConfigurazioneAsta,
  type MacroReparto,
  type Reparto,
  type RepartoClassic,
  type VoceRosa,
} from "@asta/contracts";
import { indiceConvenienza, valuta } from "@asta/domain";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  MultiSelect,
  Paper,
  RangeSlider,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconDatabaseOff,
  IconFileExport,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { chiaveQuerySessione } from "../../client/query-client";
import { useTRPC } from "../../client/fornitore-client";
import { CampoRicercaGiocatore, type GiocatoreRicerca } from "../../componenti/campo-ricerca-giocatore";
import { IndicatoreConvenienza } from "../../componenti/indicatore-convenienza";
import type { DatiDashboardSnapshot, IndiceRicercaSnapshot, VoceDashboardSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import { acquisizionePotenzialmenteNonAggiornata } from "./freschezza-dati";
import { SchedaGiocatore } from "./scheda-giocatore";

const MACRO_REPARTO_PER_RUOLO_CLASSIC = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const satisfies Readonly<Record<RepartoClassic, MacroReparto>>;

const ETICHETTE_REPARTO: Readonly<Record<string, string>> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
  Por: "Portieri",
};

const CONFRONTO_NOMI = new Intl.Collator("it", { sensitivity: "base" });
const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export interface StatoDashboardAsta {
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: Readonly<Record<string, number>>;
  readonly slotResidui: Readonly<Record<string, number>>;
  readonly slotResiduiTotali: number;
  readonly riservaMinima: number;
  readonly rosa: readonly VoceRosa[];
  readonly identificativiNonDisponibili: readonly string[];
}

export interface FiltriDashboard {
  readonly reparto: string | null;
  readonly squadre: readonly string[];
  readonly quotazione: readonly [number, number];
  readonly includiNonDisponibili: boolean;
}

export interface VoceDashboardCalcolata extends VoceDashboardSnapshot {
  readonly disponibile: boolean;
  readonly prezzoMassimoConsigliato: number | null;
  readonly indice: number | null;
}

export interface SezioneDashboard {
  readonly reparto: string;
  readonly completa: boolean;
  readonly voci: readonly VoceDashboardCalcolata[];
}

export interface StatoFreschezzaDashboard {
  readonly nomeSorgente: string;
  readonly ultimoSuccessoIl: string | null;
  readonly ultimoTentativoIl: string | null;
  readonly ultimoEsito: string;
}

/** Prepara l'indice presentazionale applicando il filtro di disponibilità della sessione. */
export function creaIndiceRicercaGiocatori(
  dati: IndiceRicercaSnapshot | null,
  identificativiNonDisponibili: readonly string[],
  includiNonDisponibili: boolean,
): readonly GiocatoreRicerca[] {
  if (dati === null) return [];

  const nonDisponibili = new Set(identificativiNonDisponibili);
  return dati.giocatori
    .filter(
      (giocatore) =>
        includiNonDisponibili || !nonDisponibili.has(giocatore.id),
    )
    .map((giocatore) => ({
      identificativo: giocatore.id,
      nome: giocatore.nome,
      nomeRicerca: giocatore.nomeRicerca,
      squadra: giocatore.squadra,
      ruolo: giocatore.ruoli.join("/") || "—",
      disponibile: !nonDisponibili.has(giocatore.id),
    }));
}

function macroRepartoPer(configurazione: ConfigurazioneAsta, reparto: string): MacroReparto {
  return configurazione.modalitaGioco === "classic"
    ? MACRO_REPARTO_PER_RUOLO_CLASSIC[reparto as RepartoClassic]
    : MACRO_REPARTO_PER_RUOLO_MANTRA[reparto as keyof typeof MACRO_REPARTO_PER_RUOLO_MANTRA];
}

function etichettaReparto(reparto: string): string {
  return ETICHETTE_REPARTO[reparto] ?? `Ruolo ${reparto}`;
}

/** Proiezione pura: filtra, valuta, ordina e tronca ogni reparto a dieci voci. */
export function creaSezioniDashboard(
  configurazione: ConfigurazioneAsta,
  stato: StatoDashboardAsta,
  giocatori: readonly VoceDashboardSnapshot[],
  filtri: FiltriDashboard,
): readonly SezioneDashboard[] {
  const nonDisponibili = new Set(stato.identificativiNonDisponibili);
  const squadre = new Set(filtri.squadre);

  return Object.keys(configurazione.composizioneRosa)
    .filter((reparto) => filtri.reparto === null || filtri.reparto === reparto)
    .map((reparto) => {
      const slotResiduiReparto = stato.slotResidui[reparto] ?? 0;
      const macroReparto = macroRepartoPer(configurazione, reparto);
      const budgetRepartoResiduo = stato.budgetRepartoResiduo[macroReparto] ?? 0;
      const completa = slotResiduiReparto === 0;

      const voci = giocatori
        .filter(
          (giocatore) =>
            giocatore.ruoli.includes(reparto as Reparto) &&
            (squadre.size === 0 || squadre.has(giocatore.squadra)) &&
            giocatore.quotazione >= filtri.quotazione[0] &&
            giocatore.quotazione <= filtri.quotazione[1] &&
            (filtri.includiNonDisponibili || !nonDisponibili.has(giocatore.id)),
        )
        .map((giocatore): VoceDashboardCalcolata => {
          const disponibile = !nonDisponibili.has(giocatore.id);
          if (!disponibile) {
            return {
              ...giocatore,
              disponibile: false,
              prezzoMassimoConsigliato: null,
              indice: null,
            };
          }

          const valutazione = valuta({
            budgetResiduo: stato.budgetResiduo,
            budgetRepartoResiduo,
            slotResiduiReparto,
            slotResiduiTotali: stato.slotResiduiTotali,
            quotazione: giocatore.quotazione,
            statFantacalcio: giocatore.statFantacalcio,
            pesi: configurazione.pesiValutazione,
          });
          const indice = indiceConvenienza({
            prezzoMassimoConsigliato: valutazione.prezzoMassimoConsigliato,
            quotazione: giocatore.quotazione,
            statFantacalcio: giocatore.statFantacalcio,
            slotResiduiReparto,
            budgetRepartoResiduo,
            pesi: configurazione.pesiValutazione,
          });

          return {
            ...giocatore,
            disponibile: true,
            prezzoMassimoConsigliato: valutazione.prezzoMassimoConsigliato,
            indice,
          };
        })
        .sort((sinistra, destra) => {
          if (sinistra.indice === null && destra.indice !== null) return 1;
          if (sinistra.indice !== null && destra.indice === null) return -1;
          if (sinistra.indice !== null && destra.indice !== null && sinistra.indice !== destra.indice) {
            return destra.indice - sinistra.indice;
          }
          return CONFRONTO_NOMI.compare(sinistra.nome, destra.nome);
        })
        .slice(0, 10);

      return { reparto, completa, voci };
    });
}

function dataFreschezza(dataIso: string): string {
  return FORMATO_DATA.format(new Date(dataIso));
}

function statoFreschezzaTesto(stato: StatoFreschezzaDashboard): string {
  if (stato.ultimoSuccessoIl === null) return "Nessuna acquisizione riuscita";
  return `Ultimo aggiornamento: ${dataFreschezza(stato.ultimoSuccessoIl)}`;
}

function FreschezzaDati({ stati }: { readonly stati: readonly StatoFreschezzaDashboard[] }) {
  const sorgentiNonAggiornate = stati.filter(
    (stato): stato is StatoFreschezzaDashboard & { readonly ultimoSuccessoIl: string } =>
      stato.ultimoSuccessoIl !== null &&
      acquisizionePotenzialmenteNonAggiornata(stato.ultimoSuccessoIl),
  );

  return (
    <Paper aria-label="Stato di freschezza dei dati" p="md" withBorder>
      <Stack gap="sm">
        <Text fw={700}>Stato di freschezza dei dati</Text>
        {stati.length === 0 ? (
          <Text c="dimmed" size="sm">Nessuna informazione di acquisizione disponibile.</Text>
        ) : (
          <Group gap="xs">
            {stati.map((stato) => (
              <Badge key={stato.nomeSorgente} color={stato.ultimoEsito === "successo" ? "green" : "gray"} variant="light">
                {stato.nomeSorgente}: {statoFreschezzaTesto(stato)}
              </Badge>
            ))}
          </Group>
        )}
        {sorgentiNonAggiornate.map((stato) => (
          <Alert
            color="yellow"
            icon={<IconAlertCircle size={18} />}
            key={stato.nomeSorgente}
            title={`Dati potenzialmente non aggiornati — ${stato.nomeSorgente}`}
          >
            L’ultima acquisizione riuscita risale al {dataFreschezza(stato.ultimoSuccessoIl)}. I dati potrebbero non essere aggiornati.
          </Alert>
        ))}
      </Stack>
    </Paper>
  );
}

function TabellaReparto({
  sezione,
  onSeleziona,
}: {
  readonly sezione: SezioneDashboard;
  readonly onSeleziona: (identificativo: string) => void;
}) {
  return (
    <Paper component="section" p="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h3">{etichettaReparto(sezione.reparto)}</Title>
        {sezione.completa ? <Badge color="green">Reparto completo</Badge> : null}
      </Group>
      {sezione.voci.length === 0 ? (
        <Text c="dimmed">Nessun giocatore corrisponde ai filtri.</Text>
      ) : (
        <Table.ScrollContainer
          className="nocturne-responsive-player-table"
          minWidth={720}
        >
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Giocatore</Table.Th>
                <Table.Th>Squadra</Table.Th>
                <Table.Th>Ruolo</Table.Th>
                <Table.Th>Quotazione</Table.Th>
                <Table.Th>Prezzo massimo</Table.Th>
                <Table.Th>Convenienza</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sezione.voci.map((voce) => (
                <Table.Tr key={`${sezione.reparto}-${voce.id}`}>
                  <Table.Td data-label="Giocatore">
                    <Group gap="xs">
                      <Button variant="subtle" onClick={() => onSeleziona(voce.id)}>
                        {voce.nome}
                      </Button>
                      {!voce.disponibile ? <Badge color="gray">Non disponibile</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td data-label="Squadra">{voce.squadra}</Table.Td>
                  <Table.Td data-label="Ruolo">{sezione.reparto}</Table.Td>
                  <Table.Td data-label="Quotazione">{voce.quotazione}</Table.Td>
                  <Table.Td data-label="Prezzo massimo">{voce.prezzoMassimoConsigliato ?? "—"}</Table.Td>
                  <Table.Td data-label="Convenienza">
                    {voce.indice === null ? "—" : (
                      <IndicatoreConvenienza valore={voce.indice} dimensione={64} spessore={7} />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}

export interface SchermataDashboardAstaProps {
  readonly sessioneAstaId: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoDashboardAsta;
  readonly dati: DatiDashboardSnapshot | null;
  readonly indiceRicerca: IndiceRicercaSnapshot | null;
  readonly freschezza: readonly StatoFreschezzaDashboard[];
  readonly avvisiInformativiAttivi: boolean;
}

export function SchermataDashboardAsta({ sessioneAstaId, configurazione, stato, dati, indiceRicerca, freschezza, avvisiInformativiAttivi }: SchermataDashboardAstaProps) {
  const [reparto, setReparto] = useState<string | null>(null);
  const [squadre, setSquadre] = useState<string[]>([]);
  const [quotazione, setQuotazione] = useState<[number, number]>([1, 999]);
  const [includiNonDisponibili, setIncludiNonDisponibili] = useState(false);
  const [termineRicerca, setTermineRicerca] = useState("");
  const [ricercaIncludeNonDisponibili, setRicercaIncludeNonDisponibili] = useState(false);
  const [giocatoreSelezionato, setGiocatoreSelezionato] = useState<string | null>(null);

  const giocatoriRicerca = useMemo(
    () => creaIndiceRicercaGiocatori(
      indiceRicerca,
      stato.identificativiNonDisponibili,
      ricercaIncludeNonDisponibili,
    ),
    [indiceRicerca, ricercaIncludeNonDisponibili, stato.identificativiNonDisponibili],
  );
  const ricercaDisponibile = (indiceRicerca?.giocatori.length ?? 0) > 0;

  const opzioniSquadra = useMemo(
    () => [...new Set(dati?.giocatori.map((giocatore) => giocatore.squadra) ?? [])].sort(CONFRONTO_NOMI.compare),
    [dati],
  );
  const sezioni = useMemo(
    () => dati === null ? [] : creaSezioniDashboard(configurazione, stato, dati.giocatori, {
      reparto,
      squadre,
      quotazione,
      includiNonDisponibili,
    }),
    [configurazione, dati, includiNonDisponibili, quotazione, reparto, squadre, stato],
  );

  return (
    <Container className="nocturne-page" component="main" size="xl" py="xl">
      <Stack gap="lg">
        <Group className="nocturne-page-header" justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Dashboard asta</Title>
            <Text c="dimmed">I migliori giocatori per reparto, ricalcolati sullo stato corrente dell’asta.</Text>
          </div>
          <Group className="nocturne-page-actions" gap="sm">
            <Button
              component={Link}
              href={`/sessioni/${encodeURIComponent(sessioneAstaId)}/trasferimento`}
              leftSection={<IconFileExport size={18} />}
              variant="light"
            >
              Esporta / importa
            </Button>
            <Button
              component={Link}
              href={`/sessioni/${encodeURIComponent(sessioneAstaId)}/obiettivi`}
              leftSection={<IconTargetArrow size={18} />}
              variant="light"
            >
              Obiettivi
            </Button>
            <Button
              component={Link}
              href={`/sessioni/${encodeURIComponent(sessioneAstaId)}/avversari`}
              leftSection={<IconUsers size={18} />}
              variant="light"
            >
              Avversari
            </Button>
            <Button
              component={Link}
              href={`/sessioni/${encodeURIComponent(sessioneAstaId)}/rosa`}
              leftSection={<IconUsers size={18} />}
              variant="light"
            >
              Visualizza rosa
            </Button>
          </Group>
        </Group>
        <FreschezzaDati stati={freschezza} />
        <Alert color="blue" title="Disponibilità annotata dall’utente">
          I giocatori disponibili riflettono esclusivamente gli acquisti annotati e possono differire dallo stato reale dell’asta.
        </Alert>

        <Paper aria-label="Ricerca giocatori" component="section" p="md" withBorder>
          <Stack gap="sm">
            <Title order={2} size="h3">Ricerca giocatori</Title>
            <CampoRicercaGiocatore
              disabilitato={!ricercaDisponibile}
              giocatori={giocatoriRicerca}
              onChange={setTermineRicerca}
              onSeleziona={(giocatore) => setGiocatoreSelezionato(giocatore.identificativo)}
              valore={termineRicerca}
            />
            <Switch
              checked={ricercaIncludeNonDisponibili}
              disabled={!ricercaDisponibile}
              label="Includi giocatori non disponibili"
              onChange={(evento) =>
                setRicercaIncludeNonDisponibili(evento.currentTarget.checked)
              }
            />
            {!ricercaDisponibile ? (
              <Text c="dimmed" role="status">
                I dati dei giocatori non sono ancora disponibili. Consulta lo stato di freschezza sopra riportato.
              </Text>
            ) : null}
          </Stack>
        </Paper>

        {dati === null ? (
          <Alert color="yellow" icon={<IconDatabaseOff size={20} />} title="Dati dei giocatori non ancora disponibili">
            Non esiste ancora uno snapshot consultabile. La dashboard verrà popolata dopo la prima acquisizione riuscita.
          </Alert>
        ) : (
          <>
            <Paper aria-label="Filtri dashboard" p="md" withBorder>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <Select
                  clearable
                  data={Object.keys(configurazione.composizioneRosa).map((valore) => ({ value: valore, label: etichettaReparto(valore) }))}
                  label="Reparto"
                  onChange={setReparto}
                  placeholder="Tutti i reparti"
                  value={reparto}
                />
                <MultiSelect
                  data={opzioniSquadra}
                  label="Squadra"
                  onChange={setSquadre}
                  placeholder="Tutte le squadre"
                  searchable
                  value={squadre}
                />
                <Stack gap={4}>
                  <Text fw={500} size="sm">Quotazione: {quotazione[0]}–{quotazione[1]}</Text>
                  <RangeSlider
                    aria-label="Intervallo di quotazione"
                    label={(valore) => valore}
                    max={999}
                    min={1}
                    minRange={0}
                    onChange={setQuotazione}
                    value={quotazione}
                  />
                </Stack>
                <Switch
                  checked={includiNonDisponibili}
                  label="Includi giocatori non disponibili"
                  onChange={(evento) => setIncludiNonDisponibili(evento.currentTarget.checked)}
                />
              </SimpleGrid>
            </Paper>
            <Stack gap="lg">
              {sezioni.map((sezione) => (
                <TabellaReparto
                  key={sezione.reparto}
                  onSeleziona={setGiocatoreSelezionato}
                  sezione={sezione}
                />
              ))}
            </Stack>
          </>
        )}
        {giocatoreSelezionato !== null ? (
          <SchedaGiocatore
            aperta
            avvisiInformativiAttivi={avvisiInformativiAttivi}
            configurazione={configurazione}
            identificativoGiocatore={giocatoreSelezionato}
            onClose={() => setGiocatoreSelezionato(null)}
            sessioneAstaId={sessioneAstaId}
            stato={stato}
          />
        ) : null}
      </Stack>
    </Container>
  );
}

class ErroreDashboard extends Error {
  constructor(readonly codice: string, messaggio: string) {
    super(messaggio);
  }
}

async function recuperaDatiDashboard(sessioneAstaId: string): Promise<DatiDashboardSnapshot> {
  const risposta = await fetch(`/api/snapshot/corrente/dashboard?sessioneAstaId=${encodeURIComponent(sessioneAstaId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!risposta.ok) {
    const corpo = await risposta.json().catch(() => ({})) as { codice?: string; messaggio?: string };
    throw new ErroreDashboard(
      corpo.codice ?? "dashboard_non_disponibile",
      corpo.messaggio ?? "La dashboard non è momentaneamente disponibile.",
    );
  }
  return await risposta.json() as DatiDashboardSnapshot;
}

async function recuperaIndiceRicerca(sessioneAstaId: string): Promise<IndiceRicercaSnapshot> {
  const risposta = await fetch(`/api/snapshot/corrente/indice?sessioneAstaId=${encodeURIComponent(sessioneAstaId)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!risposta.ok) {
    const corpo = await risposta.json().catch(() => ({})) as { codice?: string; messaggio?: string };
    throw new ErroreDashboard(
      corpo.codice ?? "indice_ricerca_non_disponibile",
      corpo.messaggio ?? "La ricerca non è momentaneamente disponibile.",
    );
  }
  return await risposta.json() as IndiceRicercaSnapshot;
}

export default function PaginaDashboardAsta({ sessioneAstaId }: { readonly sessioneAstaId: string }) {
  const trpc = useTRPC();
  const ripristino = useQuery(trpc.sessioni.ripristina.queryOptions({ sessioneAstaId }));
  const freschezza = useQuery(trpc.configurazione.freschezza.queryOptions({ sessioneAstaId }));
  const dashboard = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "dashboard-snapshot"),
    queryFn: () => recuperaDatiDashboard(sessioneAstaId),
  });
  const indiceRicerca = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "indice-ricerca-snapshot"),
    queryFn: () => recuperaIndiceRicerca(sessioneAstaId),
  });

  if (ripristino.isPending || dashboard.isPending || indiceRicerca.isPending) {
    return <Container component="main" size="xl" py="xl"><Group justify="center"><Loader aria-label="Caricamento dashboard" /></Group></Container>;
  }
  if (ripristino.error !== null) {
    return (
      <Container component="main" size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Dashboard non disponibile">{ripristino.error.message}</Alert>
      </Container>
    );
  }

  const snapshotAssente = dashboard.error instanceof ErroreDashboard && dashboard.error.codice === "snapshot_non_disponibile";
  const indiceAssente = indiceRicerca.error instanceof ErroreDashboard && indiceRicerca.error.codice === "snapshot_non_disponibile";
  if (dashboard.error !== null && !snapshotAssente) {
    return (
      <Container component="main" size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Dashboard non disponibile">{dashboard.error.message}</Alert>
      </Container>
    );
  }
  if (indiceRicerca.error !== null && !indiceAssente) {
    return (
      <Container component="main" size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Ricerca non disponibile">{indiceRicerca.error.message}</Alert>
      </Container>
    );
  }

  return (
    <SchermataDashboardAsta
      avvisiInformativiAttivi={ripristino.data.avvisiInformativiAttivi}
      configurazione={ripristino.data.configurazione}
      dati={snapshotAssente ? null : (dashboard.data ?? null)}
      freschezza={(freschezza.data ?? []) as readonly StatoFreschezzaDashboard[]}
      indiceRicerca={indiceAssente ? null : (indiceRicerca.data ?? null)}
      sessioneAstaId={sessioneAstaId}
      stato={ripristino.data.stato}
    />
  );
}
