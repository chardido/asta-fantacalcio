"use client";

import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type ConfigurazioneAsta,
  type MacroReparto,
  type Reparto,
  type RepartoClassic,
  type StatFantacalcio,
  type VoceRosa,
} from "@asta/contracts";
import {
  indiceConvenienza,
  valuta,
  valutaAvvisi,
  type EsitoValutazione,
} from "@asta/domain";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  creaOperazioneCodaLocale,
  storeCodaLocale,
} from "../../client/coda-locale-store";
import { chiaveQuerySessione, queryAppartieneASessione } from "../../client/query-client";
import { useTRPC } from "../../client/fornitore-client";
import { IndicatoreConvenienza } from "../../componenti/indicatore-convenienza";
import { ListaAvvisi } from "../../componenti/lista-avvisi";
import type {
  SchedaGiocatoreSnapshot,
  StatisticheFantacalcioScheda,
  StatisticheTatticheScheda,
} from "../../server/snapshot/servizio-consultazione-snapshot";

const MACRO_REPARTO_PER_RUOLO_CLASSIC = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const satisfies Readonly<Record<RepartoClassic, MacroReparto>>;

const ETICHETTE_FATTORI = {
  budgetResiduo: "Budget residuo",
  budgetRepartoResiduo: "Budget reparto residuo",
  slotResidui: "Slot residui",
  quotazione: "Quotazione",
  statisticheFantacalcio: "Statistiche fantacalcio",
} as const;

const ETICHETTE_VINCOLI = {
  nessuno: "Nessun vincolo",
  reparto_completo: "Reparto completo",
  budget_minimo: "Budget minimo",
  tetto_globale: "Tetto globale",
  tetto_reparto: "Tetto di reparto",
  budget_reparto_esaurito: "Budget di reparto esaurito",
} as const;

export interface StatoSchedaGiocatore {
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: Readonly<Record<string, number>>;
  readonly slotResidui: Readonly<Record<string, number>>;
  readonly slotResiduiTotali: number;
  readonly riservaMinima: number;
  readonly rosa: readonly VoceRosa[];
  readonly identificativiNonDisponibili: readonly string[];
}

interface StatisticaPresentata {
  readonly chiave: string;
  readonly etichetta: string;
  readonly valore: number | null;
  readonly stagione: string;
  readonly formato: "intero" | "milli" | "percentuale";
}

function macroRepartoPer(
  configurazione: ConfigurazioneAsta,
  reparto: Reparto,
): MacroReparto {
  return configurazione.modalitaGioco === "classic"
    ? MACRO_REPARTO_PER_RUOLO_CLASSIC[reparto as RepartoClassic]
    : MACRO_REPARTO_PER_RUOLO_MANTRA[
        reparto as keyof typeof MACRO_REPARTO_PER_RUOLO_MANTRA
      ];
}

function statFantacalcioDaScheda(
  statistiche: StatisticheFantacalcioScheda,
): StatFantacalcio {
  return {
    mediaVotoMilli: statistiche.mediaVotoMilli.valore,
    fantamediaMilli: statistiche.fantamediaMilli.valore,
    presenze: statistiche.presenze.valore,
    gol: statistiche.gol.valore,
    assist: statistiche.assist.valore,
    ammonizioni: statistiche.ammonizioni.valore,
    espulsioni: statistiche.espulsioni.valore,
    rigoriParati: statistiche.rigoriParati.valore,
    rigoriSbagliati: statistiche.rigoriSbagliati.valore,
    autogol: statistiche.autogol.valore,
    stagione: statistiche.mediaVotoMilli.stagione,
  };
}

export function statisticheFantacalcioPresentate(
  statistiche: StatisticheFantacalcioScheda,
): readonly StatisticaPresentata[] {
  return [
    { chiave: "mediaVotoMilli", etichetta: "Media voto", ...statistiche.mediaVotoMilli, formato: "milli" },
    { chiave: "fantamediaMilli", etichetta: "Fantamedia", ...statistiche.fantamediaMilli, formato: "milli" },
    { chiave: "presenze", etichetta: "Presenze", ...statistiche.presenze, formato: "intero" },
    { chiave: "gol", etichetta: "Gol", ...statistiche.gol, formato: "intero" },
    { chiave: "assist", etichetta: "Assist", ...statistiche.assist, formato: "intero" },
    { chiave: "ammonizioni", etichetta: "Ammonizioni", ...statistiche.ammonizioni, formato: "intero" },
    { chiave: "espulsioni", etichetta: "Espulsioni", ...statistiche.espulsioni, formato: "intero" },
    { chiave: "rigoriParati", etichetta: "Rigori parati", ...statistiche.rigoriParati, formato: "intero" },
    { chiave: "rigoriSbagliati", etichetta: "Rigori sbagliati", ...statistiche.rigoriSbagliati, formato: "intero" },
    { chiave: "autogol", etichetta: "Autogol", ...statistiche.autogol, formato: "intero" },
  ];
}

export function statisticheTattichePresentate(
  statistiche: StatisticheTatticheScheda,
): readonly StatisticaPresentata[] {
  switch (statistiche.macroReparto) {
    case "POR":
      return [
        { chiave: "parate", etichetta: "Parate", ...statistiche.parate, formato: "intero" },
        { chiave: "golSubiti", etichetta: "Gol subiti", ...statistiche.golSubiti, formato: "intero" },
        { chiave: "cleanSheet", etichetta: "Clean sheet", ...statistiche.cleanSheet, formato: "intero" },
        { chiave: "rigoriParati", etichetta: "Rigori parati", ...statistiche.rigoriParati, formato: "intero" },
      ];
    case "DIF":
      return [
        { chiave: "cleanSheetSquadra", etichetta: "Clean sheet squadra", ...statistiche.cleanSheetSquadra, formato: "intero" },
        { chiave: "duelliDifensiviVinti", etichetta: "Duelli difensivi vinti", ...statistiche.duelliDifensiviVinti, formato: "intero" },
        { chiave: "contrasti", etichetta: "Contrasti", ...statistiche.contrasti, formato: "intero" },
        { chiave: "precisionePassaggiMilli", etichetta: "Precisione passaggi", ...statistiche.precisionePassaggiMilli, formato: "percentuale" },
      ];
    case "CEN":
      return [
        { chiave: "assist", etichetta: "Assist", ...statistiche.assist, formato: "intero" },
        { chiave: "passaggiChiave", etichetta: "Passaggi chiave", ...statistiche.passaggiChiave, formato: "intero" },
        { chiave: "precisionePassaggiMilli", etichetta: "Precisione passaggi", ...statistiche.precisionePassaggiMilli, formato: "percentuale" },
        { chiave: "tiri", etichetta: "Tiri", ...statistiche.tiri, formato: "intero" },
      ];
    case "ATT":
      return [
        { chiave: "gol", etichetta: "Gol", ...statistiche.gol, formato: "intero" },
        { chiave: "tiri", etichetta: "Tiri", ...statistiche.tiri, formato: "intero" },
        { chiave: "tiriNelloSpecchio", etichetta: "Tiri nello specchio", ...statistiche.tiriNelloSpecchio, formato: "intero" },
        { chiave: "golAttesiMilli", etichetta: "Gol attesi", ...statistiche.golAttesiMilli, formato: "milli" },
      ];
  }
}

function formattaStatistica(statistica: StatisticaPresentata): string {
  if (statistica.valore === null || !Number.isFinite(statistica.valore)) {
    return "Dato non disponibile";
  }
  if (statistica.formato === "milli") {
    return (statistica.valore / 1_000).toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (statistica.formato === "percentuale") {
    return `${(statistica.valore / 10).toLocaleString("it-IT", {
      maximumFractionDigits: 1,
    })}%`;
  }
  return statistica.valore.toLocaleString("it-IT");
}

function valoreSpiegazione(valore: EsitoValutazione["spiegazione"][number]["valoreUsato"]): string {
  if (typeof valore === "number") return String(valore);
  return `FM ${valore.fantamediaMilli ?? "—"}, MV ${valore.mediaVotoMilli ?? "—"}, presenze ${valore.presenze ?? "—"}, rendimento ${valore.punteggioRendimento}/1000`;
}

function ruoloPredefinito(
  configurazione: ConfigurazioneAsta,
  stato: StatoSchedaGiocatore,
  scheda: SchedaGiocatoreSnapshot,
): Reparto {
  if (configurazione.modalitaGioco === "classic") {
    return scheda.giocatore.ruoloClassic ?? "P";
  }
  return [...scheda.giocatore.ruoliMantra].sort(
    (sinistra, destra) =>
      (stato.slotResidui[destra] ?? 0) - (stato.slotResidui[sinistra] ?? 0),
  )[0] ?? "Por";
}

interface ContenutoSchedaGiocatoreProps {
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoSchedaGiocatore;
  readonly scheda: SchedaGiocatoreSnapshot;
  readonly repartoSelezionato: Reparto;
  readonly onRepartoChange: (reparto: Reparto) => void;
  readonly prezzoAcquisto: number | string;
  readonly onPrezzoChange: (prezzo: number | string) => void;
  readonly onRegistra: () => void;
  readonly registrazioneInCorso?: boolean;
  readonly erroreRegistrazione?: string | null;
  readonly avvisiInformativiAttivi: boolean;
}

/** Contenuto presentazionale puro della scheda, riusato da Drawer e Modal. */
export function ContenutoSchedaGiocatore({
  configurazione,
  stato,
  scheda,
  repartoSelezionato,
  onRepartoChange,
  prezzoAcquisto,
  onPrezzoChange,
  onRegistra,
  registrazioneInCorso = false,
  erroreRegistrazione = null,
  avvisiInformativiAttivi,
}: ContenutoSchedaGiocatoreProps) {
  const giocatore = scheda.giocatore;
  const disponibile = scheda.assegnazione === null;
  const macroReparto = macroRepartoPer(configurazione, repartoSelezionato);
  const budgetRepartoResiduo = stato.budgetRepartoResiduo[macroReparto] ?? 0;
  const slotResiduiReparto = stato.slotResidui[repartoSelezionato] ?? 0;
  const statFantacalcio = statFantacalcioDaScheda(giocatore.statisticheFantacalcio);
  const valutazione = disponibile
    ? valuta({
        budgetResiduo: stato.budgetResiduo,
        budgetRepartoResiduo,
        slotResiduiReparto,
        slotResiduiTotali: stato.slotResiduiTotali,
        quotazione: giocatore.quotazione,
        statFantacalcio,
        pesi: configurazione.pesiValutazione,
      })
    : null;
  const indice = valutazione === null
    ? null
    : indiceConvenienza({
        prezzoMassimoConsigliato: valutazione.prezzoMassimoConsigliato,
        quotazione: giocatore.quotazione,
        statFantacalcio,
        slotResiduiReparto,
        budgetRepartoResiduo,
        pesi: configurazione.pesiValutazione,
      });

  let avvisi: ReturnType<typeof valutaAvvisi> = [];
  let avvisiDisponibili = true;
  try {
    avvisi = valutaAvvisi({
      avvisiInformativiAttivi,
      reparto: repartoSelezionato,
      macroReparto,
      squadra: giocatore.squadra,
      quotazione: giocatore.quotazione,
      creditiIniziali: configurazione.creditiIniziali,
      slotResiduiReparto,
      budgetRepartoResiduo,
      budgetResiduo: stato.budgetResiduo,
      riservaMinima: stato.riservaMinima,
      modificatoreDifesa: configurazione.modificatoreDifesa,
      rosa: stato.rosa,
      prezzoMassimoPersonale: scheda.prezzoMassimoPersonale,
      ...(valutazione === null
        ? { giocatoreDisponibile: false as const, prezzoMassimoConsigliato: null }
        : {
            giocatoreDisponibile: true as const,
            prezzoMassimoConsigliato: valutazione.prezzoMassimoConsigliato,
          }),
    });
  } catch {
    avvisiDisponibili = false;
  }

  const mostraRilevanzaModificatore =
    configurazione.modificatoreDifesa &&
    (macroReparto === "POR" || macroReparto === "DIF");

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{giocatore.nome}</Title>
          <Text c="dimmed">{giocatore.squadra} · {configurazione.modalitaGioco === "classic" ? giocatore.ruoloClassic : giocatore.ruoliMantra.join("/")}</Text>
        </div>
        <Badge size="lg" color={disponibile ? "green" : "gray"}>
          {disponibile ? "Disponibile" : "Non disponibile"}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Paper p="md" withBorder>
          <Text c="dimmed" size="sm">Quotazione</Text>
          <Text fw={700} size="xl">{giocatore.quotazione} crediti</Text>
        </Paper>
        <Paper p="md" withBorder>
          <Text c="dimmed" size="sm">Prezzo massimo consigliato</Text>
          <Text fw={700} size="xl">{valutazione === null ? "Non disponibile" : `${valutazione.prezzoMassimoConsigliato} crediti`}</Text>
          {valutazione?.datiIncompleti === true ? <Badge color="yellow">Basato su dati incompleti</Badge> : null}
        </Paper>
        <Paper p="md" withBorder>
          <Text c="dimmed" size="sm">Indice di convenienza</Text>
          {indice === null ? <Text fw={700}>Non disponibile</Text> : <IndicatoreConvenienza valore={indice} dimensione={88} />}
        </Paper>
      </SimpleGrid>

      {scheda.inListaObiettivi ? (
        <Alert color="blue" title="Lista obiettivi">
          Prezzo massimo personale: {scheda.prezzoMassimoPersonale === null ? "Valore non assegnato" : `${scheda.prezzoMassimoPersonale} crediti`}.
        </Alert>
      ) : null}

      {!disponibile ? (
        <Alert color="gray" title="Giocatore già assegnato">
          Assegnatario: {scheda.assegnazione?.nome ?? "Valore non annotato"}. Prezzo: {scheda.assegnazione?.prezzoAcquisto ?? "Valore non annotato"}{scheda.assegnazione?.prezzoAcquisto === null ? "" : " crediti"}.
        </Alert>
      ) : null}

      <section aria-labelledby="statistiche-fantacalcio">
        <Group gap="xs" mb="sm">
          <Title id="statistiche-fantacalcio" order={3} size="h4">Statistiche fantacalcio</Title>
          {mostraRilevanzaModificatore ? <Badge color="violet">Rilevante per il modificatore di difesa</Badge> : null}
        </Group>
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {statisticheFantacalcioPresentate(giocatore.statisticheFantacalcio).map((statistica) => (
            <Paper key={statistica.chiave} p="sm" withBorder>
              <Text c="dimmed" size="sm">{statistica.etichetta}</Text>
              <Text fw={600}>{formattaStatistica(statistica)}</Text>
              <Text c="dimmed" size="xs">Stagione {statistica.stagione}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </section>

      <section aria-labelledby="statistiche-tattiche">
        <Title id="statistiche-tattiche" order={3} size="h4" mb="sm">Statistiche tattiche</Title>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {statisticheTattichePresentate(giocatore.statisticheTattiche).map((statistica) => (
            <Paper key={statistica.chiave} p="sm" withBorder>
              <Text c="dimmed" size="sm">{statistica.etichetta}</Text>
              <Text fw={600}>{formattaStatistica(statistica)}</Text>
              <Text c="dimmed" size="xs">Stagione {statistica.stagione}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </section>

      {valutazione !== null ? (
        <section aria-labelledby="spiegazione-valutazione">
          <Title id="spiegazione-valutazione" order={3} size="h4" mb="sm">Spiegazione della valutazione</Title>
          <Table.ScrollContainer minWidth={620}>
            <Table withTableBorder>
              <Table.Thead><Table.Tr><Table.Th>Fattore</Table.Th><Table.Th>Valore usato</Table.Th><Table.Th>Ancora</Table.Th><Table.Th>Peso</Table.Th><Table.Th>Contributo</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {valutazione.spiegazione.map((fattore) => (
                  <Table.Tr key={fattore.fattore}>
                    <Table.Td>{ETICHETTE_FATTORI[fattore.fattore]}</Table.Td>
                    <Table.Td>{valoreSpiegazione(fattore.valoreUsato)}</Table.Td>
                    <Table.Td>{fattore.ancoraCrediti} crediti</Table.Td>
                    <Table.Td>{fattore.peso}</Table.Td>
                    <Table.Td>{fattore.contributoCrediti} crediti</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group mt="sm" gap="xs">
            <Badge variant="light">Audacia: {valutazione.audacia.contributoCrediti} crediti (peso {valutazione.audacia.peso})</Badge>
            <Badge variant="light">Rettifica arrotondamento: {valutazione.rettificaArrotondamento}</Badge>
            <Badge variant="light">Rettifica vincolo: {valutazione.rettificaVincolo}</Badge>
            <Badge color="orange" variant="light">Vincolo attivo: {ETICHETTE_VINCOLI[valutazione.vincoloAttivo]}</Badge>
          </Group>
        </section>
      ) : null}

      <Divider />
      <section aria-labelledby="avvisi-scheda">
        <Title id="avvisi-scheda" order={3} size="h4" mb="sm">Avvisi</Title>
        {avvisiDisponibili ? <ListaAvvisi avvisi={avvisi} /> : <Text c="dimmed">Gli avvisi non sono disponibili per questa consultazione.</Text>}
      </section>

      {disponibile ? (
        <Paper component="section" aria-label="Registra acquisto" p="md" withBorder>
          <Stack gap="sm">
            <Title order={3} size="h4">Registra acquisto</Title>
            {configurazione.modalitaGioco === "mantra" ? (
              <Select
                data={giocatore.ruoliMantra.map((ruolo) => ({ value: ruolo, label: ruolo }))}
                label="Ruolo di imputazione"
                onChange={(valore) => { if (valore !== null) onRepartoChange(valore as Reparto); }}
                value={repartoSelezionato}
              />
            ) : null}
            <NumberInput
              allowDecimal={false}
              label="Prezzo di acquisto"
              max={stato.budgetResiduo}
              min={1}
              onChange={onPrezzoChange}
              value={prezzoAcquisto}
            />
            {erroreRegistrazione !== null ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{erroreRegistrazione}</Alert> : null}
            <Button
              loading={registrazioneInCorso}
              leftSection={<IconCheck size={18} />}
              onClick={onRegistra}
              disabled={!Number.isInteger(prezzoAcquisto) || Number(prezzoAcquisto) < 1}
            >
              Conferma acquisto
            </Button>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}

class ErroreScheda extends Error {}

async function recuperaScheda(
  sessioneAstaId: string,
  identificativoGiocatore: string,
): Promise<SchedaGiocatoreSnapshot> {
  const risposta = await fetch(
    `/api/snapshot/corrente/giocatori/${encodeURIComponent(identificativoGiocatore)}?sessioneAstaId=${encodeURIComponent(sessioneAstaId)}`,
    { credentials: "same-origin", headers: { Accept: "application/json" } },
  );
  if (!risposta.ok) {
    const corpo = await risposta.json().catch(() => ({})) as { messaggio?: string };
    throw new ErroreScheda(corpo.messaggio ?? "La scheda giocatore non è disponibile.");
  }
  return await risposta.json() as SchedaGiocatoreSnapshot;
}

export interface SchedaGiocatoreProps {
  readonly aperta: boolean;
  readonly identificativoGiocatore: string | null;
  readonly sessioneAstaId: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly stato: StatoSchedaGiocatore;
  readonly avvisiInformativiAttivi: boolean;
  readonly onClose: () => void;
}

/** Scheda responsive: Drawer su viewport stretti, Modal su viewport ampi. */
export function SchedaGiocatore({
  aperta,
  identificativoGiocatore,
  sessioneAstaId,
  configurazione,
  stato,
  avvisiInformativiAttivi,
  onClose,
}: SchedaGiocatoreProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewportStretto = useMediaQuery("(max-width: 48em)");
  const scheda = useQuery({
    queryKey: chiaveQuerySessione(sessioneAstaId, "scheda-giocatore", identificativoGiocatore),
    queryFn: () => recuperaScheda(sessioneAstaId, identificativoGiocatore ?? ""),
    enabled: aperta && identificativoGiocatore !== null,
  });
  const registrazione = useMutation(trpc.registro.aggiungi.mutationOptions());
  const [repartoSelezionato, setRepartoSelezionato] = useState<Reparto>("P");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState<number | string>(1);
  const [accodamentoInCorso, setAccodamentoInCorso] = useState(false);
  const [erroreAccodamento, setErroreAccodamento] = useState<string | null>(null);

  useEffect(() => {
    if (scheda.data !== undefined) {
      setRepartoSelezionato(ruoloPredefinito(configurazione, stato, scheda.data));
      setPrezzoAcquisto(1);
      setErroreAccodamento(null);
      registrazione.reset();
    }
  }, [configurazione, scheda.data, stato]);

  const registraAcquisto = useCallback(async () => {
    if (!Number.isInteger(prezzoAcquisto) || scheda.data === undefined) return;

    const chiaveIdempotenza = crypto.randomUUID();
    const input = {
      sessioneAstaId,
      identificativoGiocatore: scheda.data.giocatore.id,
      prezzoAcquisto: Number(prezzoAcquisto),
      repartoAssegnato: repartoSelezionato,
      chiaveIdempotenza,
    };
    setErroreAccodamento(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setAccodamentoInCorso(true);
      try {
        await storeCodaLocale.getState().accoda(
          creaOperazioneCodaLocale({
            chiaveIdempotenza,
            sessioneAstaId,
            tipo: "registra_acquisto",
            dati: {
              identificativoGiocatore: input.identificativoGiocatore,
              prezzoAcquisto: input.prezzoAcquisto,
              repartoAssegnato: input.repartoAssegnato,
            },
          }),
        );
        notifications.show({
          color: "orange",
          title: "Acquisto in attesa",
          message:
            "L'acquisto è conservato sul dispositivo e sarà inviato al ripristino della connessione.",
        });
      } catch (error_: unknown) {
        setErroreAccodamento(
          error_ instanceof Error
            ? error_.message
            : "Impossibile conservare l'operazione nella coda locale.",
        );
      } finally {
        setAccodamentoInCorso(false);
      }
      return;
    }

    registrazione.mutate(input, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          predicate: (query) =>
            queryAppartieneASessione(query.queryKey, sessioneAstaId),
        });
      },
    });
  }, [
    prezzoAcquisto,
    queryClient,
    registrazione,
    repartoSelezionato,
    scheda.data,
    sessioneAstaId,
  ]);

  const contenuto = useMemo(() => {
    if (scheda.isPending || !scheda.isEnabled) {
      return <Group justify="center" py="xl"><Loader aria-label="Caricamento scheda giocatore" /></Group>;
    }
    if (scheda.error !== null || scheda.data === undefined) {
      return <Alert color="red" icon={<IconAlertCircle size={20} />} title="Scheda non disponibile">{scheda.error?.message ?? "Impossibile caricare il giocatore."}</Alert>;
    }
    return (
      <ContenutoSchedaGiocatore
        avvisiInformativiAttivi={avvisiInformativiAttivi}
        configurazione={configurazione}
        erroreRegistrazione={
          erroreAccodamento ?? registrazione.error?.message ?? null
        }
        onPrezzoChange={setPrezzoAcquisto}
        onRegistra={() => {
          void registraAcquisto();
        }}
        onRepartoChange={setRepartoSelezionato}
        prezzoAcquisto={prezzoAcquisto}
        registrazioneInCorso={registrazione.isPending || accodamentoInCorso}
        repartoSelezionato={repartoSelezionato}
        scheda={scheda.data}
        stato={stato}
      />
    );
  }, [
    accodamentoInCorso,
    avvisiInformativiAttivi,
    configurazione,
    erroreAccodamento,
    prezzoAcquisto,
    registraAcquisto,
    registrazione.error,
    registrazione.isPending,
    repartoSelezionato,
    scheda.data,
    scheda.error,
    scheda.isEnabled,
    scheda.isPending,
    stato,
  ]);

  const titolo = scheda.data?.giocatore.nome ?? "Scheda giocatore";
  return viewportStretto ? (
    <Drawer opened={aperta} onClose={onClose} position="bottom" size="95%" title={titolo}>
      {contenuto}
    </Drawer>
  ) : (
    <Modal opened={aperta} onClose={onClose} size="xl" title={titolo}>
      {contenuto}
    </Modal>
  );
}
