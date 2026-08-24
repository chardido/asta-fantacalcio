"use client";

import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type ConfigurazioneAsta,
  type MacroReparto,
  type RepartoClassic,
  type RepartoMantra,
  type VoceRosa,
} from "@asta/contracts";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconArrowLeft, IconCheck } from "@tabler/icons-react";
import Link from "next/link";

import { useTRPC } from "../../client/fornitore-client";
import { chiaveQuerySessione } from "../../client/query-client";
import type { DatiDashboardSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";

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

export interface StatoRosaAsta {
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: Readonly<Record<string, number>>;
  readonly slotResidui: Readonly<Record<string, number>>;
  readonly slotResiduiTotali: number;
  readonly rosa: readonly VoceRosa[];
}

export interface SezioneRosaAsta {
  readonly reparto: string;
  readonly giocatori: readonly VoceRosa[];
  readonly giocatoriAcquistati: number;
  readonly slotResidui: number;
  readonly budgetRepartoResiduo: number;
  readonly spesaReparto: number;
  readonly fantamediaMediaCentesimi: number | null;
  readonly fantamedieDisponibili: number;
}

function macroRepartoPer(
  configurazione: ConfigurazioneAsta,
  reparto: string,
): MacroReparto {
  return configurazione.modalitaGioco === "classic"
    ? MACRO_REPARTO_PER_RUOLO_CLASSIC[reparto as RepartoClassic]
    : MACRO_REPARTO_PER_RUOLO_MANTRA[reparto as RepartoMantra];
}

function etichettaReparto(reparto: string): string {
  return ETICHETTE_REPARTO[reparto] ?? `Ruolo ${reparto}`;
}

function mediaFantamediaCentesimi(
  giocatori: readonly VoceRosa[],
  fantamediaPerGiocatore: ReadonlyMap<string, number | null>,
): { readonly media: number | null; readonly disponibili: number } {
  const valori = giocatori.flatMap((giocatore) => {
    const valore = fantamediaPerGiocatore.get(
      giocatore.identificativoGiocatore,
    );
    return valore === undefined || valore === null ? [] : [valore];
  });

  if (valori.length === 0) {
    return { media: null, disponibili: 0 };
  }

  const sommaMilli = valori.reduce((somma, valore) => somma + valore, 0);
  const mediaCentesimi = Math.floor(
    (sommaMilli + valori.length * 5) / (valori.length * 10),
  );
  return { media: mediaCentesimi, disponibili: valori.length };
}

/** Raggruppa la rosa nello stesso ordine dei reparti configurati e calcola i riepiloghi. */
export function creaSezioniRosaAsta(
  configurazione: ConfigurazioneAsta,
  stato: StatoRosaAsta,
  dati: DatiDashboardSnapshot | null,
): readonly SezioneRosaAsta[] {
  const fantamediaPerGiocatore = new Map(
    dati?.giocatori.map((giocatore) => [
      giocatore.id,
      giocatore.statFantacalcio.fantamediaMilli,
    ]) ?? [],
  );

  return Object.keys(configurazione.composizioneRosa).map((reparto) => {
    const giocatori = stato.rosa.filter(
      (giocatore) => giocatore.repartoAssegnato === reparto,
    );
    const fantamedia = mediaFantamediaCentesimi(
      giocatori,
      fantamediaPerGiocatore,
    );

    return {
      reparto,
      giocatori,
      giocatoriAcquistati: giocatori.length,
      slotResidui: stato.slotResidui[reparto] ?? 0,
      budgetRepartoResiduo:
        stato.budgetRepartoResiduo[
          macroRepartoPer(configurazione, reparto)
        ] ?? 0,
      spesaReparto: giocatori.reduce(
        (somma, giocatore) => somma + giocatore.prezzoAcquisto,
        0,
      ),
      fantamediaMediaCentesimi: fantamedia.media,
      fantamedieDisponibili: fantamedia.disponibili,
    };
  });
}

/** Formatta un valore già arrotondato ai centesimi senza perdere gli zeri finali. */
export function formattaFantamediaMedia(valoreCentesimi: number): string {
  const parteIntera = Math.floor(valoreCentesimi / 100);
  const parteDecimale = String(valoreCentesimi % 100).padStart(2, "0");
  return `${parteIntera},${parteDecimale}`;
}

function FantamediaReparto({ sezione }: { readonly sezione: SezioneRosaAsta }) {
  if (sezione.fantamediaMediaCentesimi === null) {
    return (
      <Text c="dimmed">
        Fantamedia media: <strong>dato non disponibile</strong>
        {sezione.giocatoriAcquistati === 0
          ? " — nessun giocatore acquistato"
          : " — nessuna fantamedia disponibile"}
      </Text>
    );
  }

  return (
    <Text>
      Fantamedia media: {formattaFantamediaMedia(sezione.fantamediaMediaCentesimi)}
      {sezione.fantamedieDisponibili < sezione.giocatoriAcquistati
        ? ` — calcolata su ${sezione.fantamedieDisponibili} di ${sezione.giocatoriAcquistati} giocatori con dato disponibile`
        : null}
    </Text>
  );
}

function ContenutoReparto({ sezione }: { readonly sezione: SezioneRosaAsta }) {
  return (
    <Stack gap="md">
      <Group gap="xl">
        <Text>Giocatori acquistati: {sezione.giocatoriAcquistati}</Text>
        <Text>Slot residui: {sezione.slotResidui}</Text>
        <Text>Spesa reparto: {sezione.spesaReparto} crediti</Text>
        <Text>Budget reparto residuo: {sezione.budgetRepartoResiduo} crediti</Text>
      </Group>
      <FantamediaReparto sezione={sezione} />

      {sezione.giocatori.length === 0 ? (
        <Text c="dimmed">Nessun giocatore acquistato in questo reparto.</Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Giocatore</Table.Th>
                <Table.Th>Squadra</Table.Th>
                <Table.Th>Prezzo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sezione.giocatori.map((giocatore) => (
                <Table.Tr key={giocatore.voceRegistroId}>
                  <Table.Td>
                    <Group gap="xs">
                      <Text>{giocatore.nomeGiocatore}</Text>
                      {giocatore.giocatoreAssenteDatiCorrenti ? (
                        <Badge color="gray" variant="light">
                          Non presente nei dati correnti
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{giocatore.squadra}</Table.Td>
                  <Table.Td>{giocatore.prezzoAcquisto} crediti</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

export interface SchermataRosaAstaProps {
  readonly sessioneAstaId: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoRosaAsta;
  readonly dati: DatiDashboardSnapshot | null;
  readonly avvisoStatistiche?: string;
}

/** Vista pura della rosa corrente e, a slot esauriti, del riepilogo finale. */
export function SchermataRosaAsta({
  sessioneAstaId,
  configurazione,
  stato,
  dati,
  avvisoStatistiche,
}: SchermataRosaAstaProps) {
  const completata = stato.slotResiduiTotali === 0;
  const sezioni = creaSezioniRosaAsta(configurazione, stato, dati);

  return (
    <Container component="main" size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm">
              <Title order={1}>{completata ? "Riepilogo finale" : "La tua rosa"}</Title>
              <Badge color={completata ? "green" : "blue"} variant="light">
                {completata ? "Sessione completata" : "Sessione in corso"}
              </Badge>
            </Group>
            <Text c="dimmed">
              Giocatori acquistati, spesa e fantamedia media per reparto.
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

        {completata ? (
          <Alert color="green" icon={<IconCheck size={20} />} title="Rosa completata">
            Tutti gli slot sono stati riempiti. Budget residuo complessivo: {stato.budgetResiduo} crediti.
          </Alert>
        ) : (
          <Paper p="md" withBorder>
            <Group justify="space-between">
              <Text fw={700}>Stato rosa</Text>
              <Text>
                {stato.rosa.length} giocatori acquistati · {stato.slotResiduiTotali} slot residui · {stato.budgetResiduo} crediti residui
              </Text>
            </Group>
          </Paper>
        )}

        {avvisoStatistiche === undefined ? null : (
          <Alert color="yellow" icon={<IconAlertCircle size={20} />} title="Fantamedie non disponibili">
            {avvisoStatistiche}
          </Alert>
        )}

        <Accordion
          defaultValue={sezioni.map((sezione) => sezione.reparto)}
          multiple
          variant="separated"
        >
          {sezioni.map((sezione) => (
            <Accordion.Item key={sezione.reparto} value={sezione.reparto}>
              <Accordion.Control>
                <Group justify="space-between" pr="md">
                  <Text fw={700}>{etichettaReparto(sezione.reparto)}</Text>
                  <Group gap="xs">
                    <Badge variant="light">
                      {sezione.giocatoriAcquistati} acquistati
                    </Badge>
                    <Badge color={sezione.slotResidui === 0 ? "green" : "gray"} variant="light">
                      {sezione.slotResidui} slot residui
                    </Badge>
                  </Group>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <ContenutoReparto sezione={sezione} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>
    </Container>
  );
}

class ErroreSnapshotRosa extends Error {
  constructor(readonly codice: string, messaggio: string) {
    super(messaggio);
  }
}

async function recuperaDatiRosa(
  sessioneAstaId: string,
): Promise<DatiDashboardSnapshot> {
  const risposta = await fetch(
    `/api/snapshot/corrente/dashboard?sessioneAstaId=${encodeURIComponent(sessioneAstaId)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  if (!risposta.ok) {
    const corpo = (await risposta.json().catch(() => ({}))) as {
      codice?: string;
      messaggio?: string;
    };
    throw new ErroreSnapshotRosa(
      corpo.codice ?? "snapshot_non_disponibile",
      corpo.messaggio ?? "Le statistiche dei giocatori non sono disponibili.",
    );
  }
  return (await risposta.json()) as DatiDashboardSnapshot;
}

export default function PaginaRosaAsta({
  sessioneAstaId,
}: {
  readonly sessioneAstaId: string;
}) {
  const trpc = useTRPC();
  const ripristino = useQuery(
    trpc.sessioni.ripristina.queryOptions({ sessioneAstaId }),
  );
  const snapshot = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "rosa-snapshot"),
    queryFn: () => recuperaDatiRosa(sessioneAstaId),
  });

  if (ripristino.isPending || snapshot.isPending) {
    return (
      <Container component="main" size="xl" py="xl">
        <Group justify="center">
          <Loader aria-label="Caricamento rosa" />
        </Group>
      </Container>
    );
  }

  if (ripristino.error !== null) {
    return (
      <Container component="main" size="xl" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Rosa non disponibile">
          {ripristino.error.message}
        </Alert>
      </Container>
    );
  }

  return (
    <SchermataRosaAsta
      avvisoStatistiche={snapshot.error?.message}
      configurazione={ripristino.data.configurazione}
      dati={snapshot.error === null ? snapshot.data : null}
      sessioneAstaId={sessioneAstaId}
      stato={ripristino.data.stato}
    />
  );
}
