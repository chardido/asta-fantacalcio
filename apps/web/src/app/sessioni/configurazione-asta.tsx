"use client";

import {
  COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA,
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  PESI_VALUTAZIONE_PREDEFINITI,
  QUOTE_REPARTO_PREDEFINITE,
  REPARTI_CLASSIC,
  REPARTI_MANTRA,
  TIPI_ASTA,
  configurazioneAstaSchema,
  type ConfigurazioneAsta,
  type MacroReparto,
  type ModalitaGioco,
  type PesiValutazione,
  type RepartoClassic,
  type RepartoMantra,
  type TipoAsta,
} from "@asta/contracts";
import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconCheck, IconRefresh } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useTRPC } from "../../client/fornitore-client";
import {
  SelettoreQuoteReparto,
  sommaQuoteReparto,
  type QuoteRepartoModificabili,
} from "../../componenti/selettore-quote-reparto";
import { acquisizionePotenzialmenteNonAggiornata } from "./freschezza-dati";

export type NumeroForm = number | string;

type ComposizioneClassicForm = Record<RepartoClassic, NumeroForm>;
type ComposizioneMantraForm = Record<RepartoMantra, NumeroForm>;
type PesiForm = Record<keyof PesiValutazione, NumeroForm>;

export interface ValoriConfigurazioneForm {
  stagioneListone: string;
  nome: string;
  tipoAsta: TipoAsta;
  modalitaGioco: ModalitaGioco;
  numeroPartecipanti: NumeroForm;
  creditiIniziali: NumeroForm;
  modificatoreDifesa: boolean;
  composizioneClassic: ComposizioneClassicForm;
  composizioneMantra: ComposizioneMantraForm;
  quoteReparto: QuoteRepartoModificabili;
  pesiValutazione: PesiForm;
}

export interface StatoFreschezzaClient {
  readonly nomeSorgente: string;
  readonly ultimoSuccessoIl: string | null;
  readonly ultimoTentativoIl: string | null;
  readonly ultimoEsito:
    | "mai_eseguito"
    | "successo"
    | "errore"
    | "limite_frequenza"
    | "timeout"
    | "dati_non_validi";
}

export type EsitoValidazioneConfigurazione =
  | {
      readonly ok: true;
      readonly stagioneListone: string;
      readonly configurazione: ConfigurazioneAsta;
    }
  | {
      readonly ok: false;
      readonly errori: Readonly<Record<string, string>>;
    };

const COMPOSIZIONE_MANTRA_PREDEFINITA: ComposizioneMantraForm = {
  Por: 1,
  Dc: 1,
  Dd: 0,
  Ds: 0,
  E: 0,
  M: 0,
  C: 1,
  W: 0,
  T: 0,
  A: 1,
  Pc: 0,
};

const PESI_PROFILO = {
  conservativo: { ...PESI_VALUTAZIONE_PREDEFINITI, audacia: 0 },
  aggressivo: { ...PESI_VALUTAZIONE_PREDEFINITI, audacia: 80 },
} as const satisfies Readonly<Record<"conservativo" | "aggressivo", PesiValutazione>>;

const ETICHETTE_TIPO_ASTA: Readonly<Record<TipoAsta, string>> = {
  chiamata: "Chiamata",
  random: "Random",
  busta_chiusa: "Busta chiusa",
  asta_live_ordine_listone: "Live in ordine di listone",
  riparazione: "Riparazione",
};

const ETICHETTE_REPARTO_CLASSIC: Readonly<Record<RepartoClassic, string>> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
};

const ETICHETTE_MACRO_REPARTO: Readonly<Record<MacroReparto, string>> = {
  POR: "Portieri",
  DIF: "Difensori",
  CEN: "Centrocampisti",
  ATT: "Attaccanti",
};

const ETICHETTE_PESO: Readonly<Record<keyof PesiValutazione, string>> = {
  quotazione: "Quotazione",
  budgetReparto: "Budget reparto",
  budgetTotale: "Budget totale",
  slotResidui: "Slot residui",
  statistiche: "Statistiche",
  audacia: "Audacia",
};

const ETICHETTE_ESITO: Readonly<Record<StatoFreschezzaClient["ultimoEsito"], string>> = {
  mai_eseguito: "Nessun tentativo registrato",
  successo: "Acquisizione riuscita",
  errore: "Errore",
  limite_frequenza: "Limite di frequenza",
  timeout: "Tempo massimo superato",
  dati_non_validi: "Dati non validi",
};

const SORGENTI_PREDEFINITE: readonly StatoFreschezzaClient[] = [
  {
    nomeSorgente: "listone-quotazioni-ufficiali",
    ultimoSuccessoIl: null,
    ultimoTentativoIl: null,
    ultimoEsito: "mai_eseguito",
  },
  {
    nomeSorgente: "api-football",
    ultimoSuccessoIl: null,
    ultimoTentativoIl: null,
    ultimoEsito: "mai_eseguito",
  },
];

const ID_QUERY_DISABILITATA = "00000000-0000-4000-8000-000000000000";
const FORMATO_DATA = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

function valoriIniziali(
  configurazione?: ConfigurazioneAsta,
  stagioneListone = "",
): ValoriConfigurazioneForm {
  const classic =
    configurazione?.modalitaGioco === "classic"
      ? configurazione.composizioneRosa
      : COMPOSIZIONE_ROSA_CLASSIC_PREDEFINITA;
  const mantra =
    configurazione?.modalitaGioco === "mantra"
      ? configurazione.composizioneRosa
      : COMPOSIZIONE_MANTRA_PREDEFINITA;

  return {
    stagioneListone,
    nome: configurazione?.nome ?? "",
    tipoAsta: configurazione?.tipoAsta ?? "chiamata",
    modalitaGioco: configurazione?.modalitaGioco ?? "classic",
    numeroPartecipanti: configurazione?.numeroPartecipanti ?? 8,
    creditiIniziali: configurazione?.creditiIniziali ?? 500,
    modificatoreDifesa: configurazione?.modificatoreDifesa ?? false,
    composizioneClassic: { ...classic },
    composizioneMantra: { ...mantra },
    quoteReparto: {
      ...(configurazione?.quoteReparto ?? QUOTE_REPARTO_PREDEFINITE),
    },
    pesiValutazione: {
      ...(configurazione?.pesiValutazione ?? PESI_VALUTAZIONE_PREDEFINITI),
    },
  };
}

function percorsoCampo(
  percorso: readonly PropertyKey[],
  modalita: ModalitaGioco,
): string {
  const parti = percorso.map(String);
  if (parti[0] === "composizioneRosa") {
    parti[0] =
      modalita === "classic" ? "composizioneClassic" : "composizioneMantra";
  }
  return parti.join(".");
}

export function validaValoriConfigurazione(
  valori: ValoriConfigurazioneForm,
): EsitoValidazioneConfigurazione {
  const stagioneListone = valori.stagioneListone.trim();
  const configurazioneSconosciuta = {
    nome: valori.nome,
    tipoAsta: valori.tipoAsta,
    modalitaGioco: valori.modalitaGioco,
    numeroPartecipanti: valori.numeroPartecipanti,
    creditiIniziali: valori.creditiIniziali,
    modificatoreDifesa: valori.modificatoreDifesa,
    composizioneRosa:
      valori.modalitaGioco === "classic"
        ? valori.composizioneClassic
        : valori.composizioneMantra,
    quoteReparto: valori.quoteReparto,
    pesiValutazione: valori.pesiValutazione,
  };
  const esito = configurazioneAstaSchema.safeParse(configurazioneSconosciuta);
  const errori: Record<string, string> = {};

  if (stagioneListone.length < 1 || stagioneListone.length > 20) {
    errori.stagioneListone =
      "La stagione deve contenere da 1 a 20 caratteri.";
  }
  if (!esito.success) {
    for (const issue of esito.error.issues) {
      const campo = percorsoCampo(issue.path, valori.modalitaGioco);
      if (campo.length > 0 && errori[campo] === undefined) {
        errori[campo] = issue.message;
      }
    }
  }

  if (Object.keys(errori).length > 0 || !esito.success) {
    return { ok: false, errori };
  }
  return { ok: true, stagioneListone, configurazione: esito.data };
}

export function applicaProfiloLocale(
  profilo: "conservativo" | "aggressivo",
): PesiValutazione {
  return { ...PESI_PROFILO[profilo] };
}

function totaleSlot(valori: ValoriConfigurazioneForm): number {
  const composizione =
    valori.modalitaGioco === "classic"
      ? valori.composizioneClassic
      : valori.composizioneMantra;
  return (Object.values(composizione) as NumeroForm[]).reduce<number>(
    (totale, valore) =>
      totale + (typeof valore === "number" && Number.isInteger(valore) ? valore : 0),
    0,
  );
}

function messaggioErrore(errore: unknown): string {
  return errore instanceof Error
    ? errore.message
    : "Operazione non completata. Riprova.";
}

function dataFreschezza(dataIso: string | null): string {
  return dataIso === null ? "Non disponibile" : FORMATO_DATA.format(new Date(dataIso));
}

export interface SchermataConfigurazioneAstaProps {
  readonly configurazioneIniziale?: ConfigurazioneAsta;
  readonly stagioneListone?: string;
  readonly statoFreschezza?: readonly StatoFreschezzaClient[];
  readonly salvataggioInCorso?: boolean;
  readonly azionePesiInCorso?: boolean;
  readonly erroreEsterno?: string | null;
  readonly onSalva: (
    configurazione: ConfigurazioneAsta,
    stagioneListone: string,
  ) => Promise<void>;
  readonly onApplicaProfilo?: (
    profilo: "conservativo" | "aggressivo",
  ) => Promise<PesiValutazione>;
  readonly onRipristinaPesi?: () => Promise<PesiValutazione>;
  readonly passoIniziale?: number;
}

/** Schermata guidata di creazione/modifica, composta soltanto con primitive Mantine. */
export function SchermataConfigurazioneAsta({
  configurazioneIniziale,
  stagioneListone = "",
  statoFreschezza = SORGENTI_PREDEFINITE,
  salvataggioInCorso = false,
  azionePesiInCorso = false,
  erroreEsterno = null,
  onSalva,
  onApplicaProfilo,
  onRipristinaPesi,
  passoIniziale = 0,
}: SchermataConfigurazioneAstaProps) {
  const [passo, setPasso] = useState(passoIniziale);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  const [salvata, setSalvata] = useState(false);
  const form = useForm<ValoriConfigurazioneForm>({
    initialValues: valoriIniziali(configurazioneIniziale, stagioneListone),
  });

  async function salva(): Promise<void> {
    setErroreLocale(null);
    setSalvata(false);
    const esito = validaValoriConfigurazione(form.getValues());
    if (!esito.ok) {
      form.setErrors(esito.errori);
      setErroreLocale(
        sommaQuoteReparto(form.getValues().quoteReparto) === 100
          ? "Correggi i parametri indicati e riprova."
          : `La somma corrente delle quote è ${sommaQuoteReparto(form.getValues().quoteReparto)}%; deve essere esattamente 100%.`,
      );
      return;
    }

    try {
      await onSalva(esito.configurazione, esito.stagioneListone);
      setSalvata(true);
    } catch (error_: unknown) {
      setErroreLocale(messaggioErrore(error_));
    }
  }

  async function applicaProfilo(
    profilo: "conservativo" | "aggressivo",
  ): Promise<void> {
    setErroreLocale(null);
    try {
      const pesi =
        onApplicaProfilo === undefined
          ? applicaProfiloLocale(profilo)
          : await onApplicaProfilo(profilo);
      form.setFieldValue("pesiValutazione", { ...pesi });
    } catch (error_: unknown) {
      setErroreLocale(messaggioErrore(error_));
    }
  }

  async function ripristinaPesi(): Promise<void> {
    setErroreLocale(null);
    try {
      const pesi =
        onRipristinaPesi === undefined
          ? { ...PESI_VALUTAZIONE_PREDEFINITI }
          : await onRipristinaPesi();
      form.setFieldValue("pesiValutazione", pesi);
    } catch (error_: unknown) {
      setErroreLocale(messaggioErrore(error_));
    }
  }

  const valori = form.getValues();
  const errore = erroreLocale ?? erroreEsterno;

  return (
    <Container className="nocturne-page" component="main" size="lg" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1}>
            {configurazioneIniziale === undefined
              ? "Configura una nuova asta"
              : "Configurazione dell'asta"}
          </Title>
          <Text c="dimmed" mt="xs">
            Imposta regole, composizione della rosa e strategia. Il tipo d&apos;asta è registrato a fini documentali.
          </Text>
        </div>

        {errore === null ? null : (
          <Alert color="red" icon={<IconAlertCircle size={20} />} title="Configurazione non salvata">
            {errore}
          </Alert>
        )}
        {!salvata ? null : (
          <Alert color="green" icon={<IconCheck size={20} />} title="Configurazione salvata">
            I valori confermati sono stati associati alla sessione.
          </Alert>
        )}

        <Paper className="nocturne-wizard" withBorder p="lg" radius="md">
          <Stepper active={passo} onStepClick={setPasso} allowNextStepsSelect={false}>
            <Stepper.Step label="Dati principali" description="Lega e modalità">
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl">
                <TextInput
                  label="Nome della sessione"
                  maxLength={60}
                  required
                  {...form.getInputProps("nome")}
                />
                <TextInput
                  disabled={configurazioneIniziale !== undefined}
                  label="Stagione del listone"
                  maxLength={20}
                  required
                  {...form.getInputProps("stagioneListone")}
                />
                <Select
                  data={TIPI_ASTA.map((tipo) => ({ value: tipo, label: ETICHETTE_TIPO_ASTA[tipo] }))}
                  label="Tipo d'asta"
                  required
                  {...form.getInputProps("tipoAsta")}
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="strict"
                  label="Numero di partecipanti"
                  min={2}
                  max={20}
                  required
                  {...form.getInputProps("numeroPartecipanti")}
                />
                <NumberInput
                  allowDecimal={false}
                  allowNegative={false}
                  clampBehavior="strict"
                  label="Crediti iniziali per partecipante"
                  min={1}
                  max={100_000}
                  required
                  {...form.getInputProps("creditiIniziali")}
                />
                <Stack gap="xs">
                  <Text fw={500} size="sm">Modalità di gioco</Text>
                  <SegmentedControl
                    data={[
                      { value: "classic", label: "Classic" },
                      { value: "mantra", label: "Mantra" },
                    ]}
                    fullWidth
                    value={valori.modalitaGioco}
                    onChange={(valore) => form.setFieldValue("modalitaGioco", valore as ModalitaGioco)}
                  />
                </Stack>
                <Switch
                  label="Modificatore di difesa"
                  description="Disattivato per impostazione predefinita"
                  {...form.getInputProps("modificatoreDifesa", { type: "checkbox" })}
                />
              </SimpleGrid>
            </Stepper.Step>

            <Stepper.Step label="Composizione" description="Slot per ruolo">
              <Stack gap="lg" mt="xl">
                <Group justify="space-between">
                  <Title order={2} size="h3">Composizione della rosa</Title>
                  <Badge variant="light">Totale: {totaleSlot(valori)} slot</Badge>
                </Group>
                <Text c="dimmed" size="sm">
                  Il totale deve essere compreso tra 4 e 50 slot.
                </Text>
                {valori.modalitaGioco === "classic" ? (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                    {REPARTI_CLASSIC.map((reparto) => (
                      <NumberInput
                        allowDecimal={false}
                        allowNegative={false}
                        clampBehavior="strict"
                        key={reparto}
                        label={ETICHETTE_REPARTO_CLASSIC[reparto]}
                        min={1}
                        max={25}
                        {...form.getInputProps(`composizioneClassic.${reparto}`)}
                      />
                    ))}
                  </SimpleGrid>
                ) : (
                  <>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                      {REPARTI_MANTRA.map((reparto) => (
                        <NumberInput
                          allowDecimal={false}
                          allowNegative={false}
                          clampBehavior="strict"
                          key={reparto}
                          label={`Ruolo ${reparto}`}
                          min={reparto === "Por" ? 1 : 0}
                          max={25}
                          {...form.getInputProps(`composizioneMantra.${reparto}`)}
                        />
                      ))}
                    </SimpleGrid>
                    <Divider label="Mappa ruoli Mantra" labelPosition="left" />
                    <Table striped withTableBorder>
                      <Table.Thead>
                        <Table.Tr><Table.Th>Ruolo</Table.Th><Table.Th>Macro-reparto</Table.Th></Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {REPARTI_MANTRA.map((ruolo) => (
                          <Table.Tr key={ruolo}>
                            <Table.Td>{ruolo}</Table.Td>
                            <Table.Td>{ETICHETTE_MACRO_REPARTO[MACRO_REPARTO_PER_RUOLO_MANTRA[ruolo]]}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </>
                )}
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Quote" description="Piano del budget">
              <Stack gap="lg" mt="xl">
                <Title order={2} size="h3">Quote percentuali per macro-reparto</Title>
                <Text c="dimmed" size="sm">
                  Le quote devono essere intere, comprese tra 0 e 100, e la loro somma deve essere esattamente 100.
                </Text>
                <SelettoreQuoteReparto
                  quote={valori.quoteReparto}
                  onChange={(reparto, valore) =>
                    form.setFieldValue(`quoteReparto.${reparto}`, valore)
                  }
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Strategia" description="Pesi e profili">
              <Stack gap="lg" mt="xl">
                <div>
                  <Title order={2} size="h3">Pesi di valutazione</Title>
                  <Text c="dimmed" size="sm" mt="xs">
                    Ogni peso deve essere un intero tra 0 e 100 e almeno uno deve essere maggiore di 0.
                  </Text>
                </div>
                <Group>
                  <Button
                    loading={azionePesiInCorso}
                    onClick={() => void applicaProfilo("conservativo")}
                    variant="light"
                  >
                    Profilo conservativo
                  </Button>
                  <Button
                    loading={azionePesiInCorso}
                    onClick={() => void applicaProfilo("aggressivo")}
                    variant="light"
                  >
                    Profilo aggressivo
                  </Button>
                  <Button
                    leftSection={<IconRefresh size={18} />}
                    loading={azionePesiInCorso}
                    onClick={() => void ripristinaPesi()}
                    variant="default"
                  >
                    Ripristina predefiniti
                  </Button>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                  {(Object.keys(ETICHETTE_PESO) as (keyof PesiValutazione)[]).map((peso) => (
                    <NumberInput
                      allowDecimal={false}
                      allowNegative={false}
                      clampBehavior="strict"
                      key={peso}
                      label={ETICHETTE_PESO[peso]}
                      min={0}
                      max={100}
                      {...form.getInputProps(`pesiValutazione.${peso}`)}
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Conferma" description="Dati e sorgenti">
              <Stack gap="lg" mt="xl">
                <Title order={2} size="h3">Stato di freschezza dei dati</Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {statoFreschezza.map((stato) => (
                    <Paper key={stato.nomeSorgente} withBorder p="md">
                      <Stack gap="xs">
                        <Group justify="space-between" align="flex-start">
                          <Text fw={700}>{stato.nomeSorgente}</Text>
                          <Badge color={stato.ultimoEsito === "successo" ? "green" : "gray"}>
                            {ETICHETTE_ESITO[stato.ultimoEsito]}
                          </Badge>
                        </Group>
                        <Text size="sm">Ultimo successo: {dataFreschezza(stato.ultimoSuccessoIl)}</Text>
                        <Text c="dimmed" size="sm">Ultimo tentativo: {dataFreschezza(stato.ultimoTentativoIl)}</Text>
                        {acquisizionePotenzialmenteNonAggiornata(stato.ultimoSuccessoIl) ? (
                          <Alert
                            color="yellow"
                            icon={<IconAlertCircle size={18} />}
                            title="Dati potenzialmente non aggiornati"
                          >
                            L’ultima acquisizione riuscita della sorgente {stato.nomeSorgente} risale al {dataFreschezza(stato.ultimoSuccessoIl)}. I dati potrebbero non essere aggiornati.
                          </Alert>
                        ) : null}
                      </Stack>
                    </Paper>
                  ))}
                </SimpleGrid>
                <Divider />
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Text><strong>Modalità:</strong> {valori.modalitaGioco === "classic" ? "Classic" : "Mantra"}</Text>
                  <Text><strong>Tipo d&apos;asta:</strong> {ETICHETTE_TIPO_ASTA[valori.tipoAsta]}</Text>
                  <Text><strong>Crediti:</strong> {String(valori.creditiIniziali)}</Text>
                  <Text><strong>Slot totali:</strong> {totaleSlot(valori)}</Text>
                  <Text><strong>Somma quote:</strong> {sommaQuoteReparto(valori.quoteReparto)}%</Text>
                </SimpleGrid>
              </Stack>
            </Stepper.Step>
          </Stepper>

          <Group className="nocturne-wizard-actions" justify="space-between" mt="xl">
            <Button disabled={passo === 0} onClick={() => setPasso((corrente) => Math.max(0, corrente - 1))} variant="default">
              Indietro
            </Button>
            {passo < 4 ? (
              <Button onClick={() => setPasso((corrente) => Math.min(4, corrente + 1))}>
                Continua
              </Button>
            ) : (
              <Button loading={salvataggioInCorso} onClick={() => void salva()}>
                Salva configurazione
              </Button>
            )}
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}

export interface PaginaConfigurazioneAstaProps {
  readonly sessioneAstaId?: string;
}

export default function PaginaConfigurazioneAsta({
  sessioneAstaId,
}: PaginaConfigurazioneAstaProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const idQuery = sessioneAstaId ?? ID_QUERY_DISABILITATA;
  const ripristino = useQuery({
    ...trpc.sessioni.ripristina.queryOptions({ sessioneAstaId: idQuery }),
    enabled: sessioneAstaId !== undefined,
  });
  const freschezza = useQuery({
    ...trpc.configurazione.freschezza.queryOptions({ sessioneAstaId: idQuery }),
    enabled: sessioneAstaId !== undefined,
  });
  const creazione = useMutation(trpc.sessioni.crea.mutationOptions());
  const modifica = useMutation(trpc.configurazione.modifica.mutationOptions());
  const profilo = useMutation(trpc.configurazione.applicaProfilo.mutationOptions());
  const ripristinoPesi = useMutation(trpc.configurazione.ripristinaPesi.mutationOptions());

  if (sessioneAstaId !== undefined && ripristino.isPending) {
    return (
      <Container component="main" size="lg" py="xl">
        <Group justify="center"><Loader aria-label="Caricamento configurazione" /></Group>
      </Container>
    );
  }

  if (sessioneAstaId !== undefined && ripristino.error !== null) {
    return (
      <Container component="main" size="lg" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={20} />} title="Configurazione non disponibile">
          {messaggioErrore(ripristino.error)}
        </Alert>
      </Container>
    );
  }

  const sessione = ripristino.data;

  async function salva(
    configurazione: ConfigurazioneAsta,
    stagione: string,
  ): Promise<void> {
    if (sessioneAstaId === undefined) {
      const creata = await creazione.mutateAsync({
        stagioneListone: stagione,
        configurazione,
      });
      router.replace(`/sessioni/${encodeURIComponent(creata.id)}/configurazione`);
      return;
    }
    await modifica.mutateAsync({ sessioneAstaId, configurazione });
    await ripristino.refetch();
  }

  async function applicaProfiloRemoto(
    nomeProfilo: "conservativo" | "aggressivo",
  ): Promise<PesiValutazione> {
    if (sessioneAstaId === undefined) return applicaProfiloLocale(nomeProfilo);
    const risultato = await profilo.mutateAsync({
      sessioneAstaId,
      profiloStrategia: nomeProfilo,
    });
    await ripristino.refetch();
    return risultato.configurazione.pesiValutazione;
  }

  async function ripristinaPesiRemoto(): Promise<PesiValutazione> {
    if (sessioneAstaId === undefined) return { ...PESI_VALUTAZIONE_PREDEFINITI };
    const risultato = await ripristinoPesi.mutateAsync({ sessioneAstaId });
    await ripristino.refetch();
    return risultato.configurazione.pesiValutazione;
  }

  return (
    <SchermataConfigurazioneAsta
      azionePesiInCorso={profilo.isPending || ripristinoPesi.isPending}
      configurazioneIniziale={sessione?.configurazione}
      erroreEsterno={freschezza.error === null ? null : messaggioErrore(freschezza.error)}
      onApplicaProfilo={applicaProfiloRemoto}
      onRipristinaPesi={ripristinaPesiRemoto}
      onSalva={salva}
      salvataggioInCorso={creazione.isPending || modifica.isPending}
      stagioneListone={sessione?.stagioneListone ?? ""}
      statoFreschezza={(freschezza.data ?? SORGENTI_PREDEFINITE) as readonly StatoFreschezzaClient[]}
    />
  );
}
