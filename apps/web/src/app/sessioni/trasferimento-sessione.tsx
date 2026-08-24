"use client";

import {
  Alert,
  Button,
  Container,
  FileButton,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconFileImport,
  IconUpload,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type RefObject } from "react";

import {
  queryAppartieneASessione,
} from "../../client/query-client";

interface CorpoErroreTrasferimento {
  readonly codice?: unknown;
  readonly messaggio?: unknown;
  readonly dettagli?: {
    readonly campo?: unknown;
    readonly vincolo?: unknown;
  } | null;
}

interface EsitoImportazioneClient {
  readonly numeroVociImportate?: number;
}

export interface FileEsportatoClient {
  readonly contenuto: Blob;
  readonly nome: string;
}

type EsecutoreFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ErroreTrasferimentoSessione extends Error {
  override readonly name = "ErroreTrasferimentoSessione";

  constructor(
    readonly codice: string,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

function testoNonVuoto(valore: unknown): string | null {
  return typeof valore === "string" && valore.trim().length > 0
    ? valore.trim()
    : null;
}

async function erroreDaRisposta(
  risposta: Response,
  messaggioPredefinito: string,
): Promise<ErroreTrasferimentoSessione> {
  let corpo: CorpoErroreTrasferimento = {};
  try {
    corpo = (await risposta.json()) as CorpoErroreTrasferimento;
  } catch {
    // Una risposta di errore non JSON conserva comunque un messaggio utile lato client.
  }

  const messaggio = testoNonVuoto(corpo.messaggio) ?? messaggioPredefinito;
  const campo = testoNonVuoto(corpo.dettagli?.campo);
  const vincolo = testoNonVuoto(corpo.dettagli?.vincolo);
  const dettagli = [
    campo === null ? null : `Campo: ${campo}.`,
    vincolo === null ? null : `Motivo: ${vincolo}`,
  ].filter((valore): valore is string => valore !== null);

  return new ErroreTrasferimentoSessione(
    testoNonVuoto(corpo.codice) ?? "trasferimento_non_completato",
    [messaggio, ...dettagli].join(" "),
  );
}

/** Estrae un nome sicuro dall'allegato, con un ripiego deterministico. */
export function nomeFileEsportazione(
  contentDisposition: string | null,
  sessioneAstaId: string,
): string {
  const ripiego = `asta-${sessioneAstaId}.json`;
  if (contentDisposition === null) return ripiego;

  const corrispondenza = /filename=(?:"([^"]+)"|([^;]+))/iu.exec(
    contentDisposition,
  );
  const candidato = (corrispondenza?.[1] ?? corrispondenza?.[2])?.trim();
  if (candidato === undefined || candidato.length === 0) return ripiego;

  const sicuro = candidato.replaceAll(/[\\/\0]/gu, "-");
  return sicuro.length > 0 ? sicuro : ripiego;
}

/** Recupera il file senza modificare lo stato della sessione. */
export async function richiediEsportazione(
  sessioneAstaId: string,
  eseguiFetch: EsecutoreFetch = fetch,
): Promise<FileEsportatoClient> {
  const risposta = await eseguiFetch(
    `/api/sessioni/${encodeURIComponent(sessioneAstaId)}/esportazione`,
    {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!risposta.ok) {
    throw await erroreDaRisposta(
      risposta,
      "L'esportazione non è stata completata. Riprova.",
    );
  }

  return {
    contenuto: await risposta.blob(),
    nome: nomeFileEsportazione(
      risposta.headers.get("content-disposition"),
      sessioneAstaId,
    ),
  };
}

/** Invia al server il contenuto integrale del file scelto e restituisce l'esito confermato. */
export async function inviaImportazione(
  sessioneAstaId: string,
  file: Pick<File, "text">,
  eseguiFetch: EsecutoreFetch = fetch,
): Promise<EsitoImportazioneClient> {
  let contenuto: string;
  try {
    contenuto = await file.text();
  } catch {
    throw new ErroreTrasferimentoSessione(
      "file_illeggibile",
      "Il file selezionato non è leggibile.",
    );
  }

  const risposta = await eseguiFetch(
    `/api/sessioni/${encodeURIComponent(sessioneAstaId)}/importazione`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: contenuto,
    },
  );

  if (!risposta.ok) {
    throw await erroreDaRisposta(
      risposta,
      "L'importazione è stata rifiutata.",
    );
  }

  return (await risposta.json()) as EsitoImportazioneClient;
}

function messaggioErrore(error_: unknown): string {
  return error_ instanceof Error
    ? error_.message
    : "Operazione non completata. Riprova.";
}

interface FeedbackTrasferimento {
  readonly tipo: "successo" | "errore";
  readonly messaggio: string;
}

export interface VistaTrasferimentoSessioneProps {
  readonly sessioneAstaId: string;
  readonly fileSelezionato: File | null;
  readonly esportazioneInCorso: boolean;
  readonly importazioneInCorso: boolean;
  readonly feedback: FeedbackTrasferimento | null;
  readonly onEsporta: () => void;
  readonly onFileSelezionato: (file: File | null) => void;
  readonly onImporta: () => void;
  readonly resetFileRef?: RefObject<(() => void) | null>;
}

/** Vista Mantine della portabilità della sessione, senza CSS locale. */
export function VistaTrasferimentoSessione({
  sessioneAstaId,
  fileSelezionato,
  esportazioneInCorso,
  importazioneInCorso,
  feedback,
  onEsporta,
  onFileSelezionato,
  onImporta,
  resetFileRef,
}: VistaTrasferimentoSessioneProps) {
  const operazioneInCorso = esportazioneInCorso || importazioneInCorso;

  return (
    <Container component="main" size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Esportazione e importazione</Title>
          <Text c="dimmed" mt="xs">
            Salva una copia portabile della configurazione, della rosa e del registro,
            oppure ripristina un file compatibile in questa sessione.
          </Text>
        </div>

        {feedback === null ? null : (
          <Alert
            color={feedback.tipo === "successo" ? "green" : "red"}
            icon={
              feedback.tipo === "successo" ? (
                <IconCheck size={20} />
              ) : (
                <IconAlertCircle size={20} />
              )
            }
            role="status"
            title={feedback.tipo === "successo" ? "Operazione completata" : "Operazione rifiutata"}
          >
            {feedback.messaggio}
          </Alert>
        )}

        <Paper component="section" p="lg" withBorder>
          <Stack align="flex-start" gap="md">
            <Title order={2} size="h3">Esporta sessione</Title>
            <Text>
              Il file JSON contiene la configurazione corrente, tutti i giocatori della
              rosa e il registro nell&apos;ordine cronologico confermato.
            </Text>
            <Button
              disabled={importazioneInCorso}
              leftSection={<IconDownload size={18} />}
              loading={esportazioneInCorso}
              onClick={onEsporta}
            >
              Esporta sessione
            </Button>
          </Stack>
        </Paper>

        <Paper component="section" p="lg" withBorder>
          <Stack align="flex-start" gap="md">
            <Title order={2} size="h3">Importa in questa sessione</Title>
            <Text>
              Sono accettati soltanto file JSON integri con una configurazione identica
              a quella della sessione di destinazione.
            </Text>
            <FileButton
              accept="application/json,.json"
              disabled={operazioneInCorso}
              onChange={onFileSelezionato}
              resetRef={resetFileRef}
            >
              {(proprieta) => (
                <Button
                  {...proprieta}
                  leftSection={<IconFileImport size={18} />}
                  variant="default"
                >
                  Seleziona file JSON
                </Button>
              )}
            </FileButton>
            <Text c={fileSelezionato === null ? "dimmed" : undefined} size="sm">
              {fileSelezionato === null
                ? "Nessun file selezionato."
                : `File selezionato: ${fileSelezionato.name}`}
            </Text>
            <Button
              disabled={fileSelezionato === null || esportazioneInCorso}
              leftSection={<IconUpload size={18} />}
              loading={importazioneInCorso}
              onClick={onImporta}
            >
              Importa file selezionato
            </Button>
          </Stack>
        </Paper>

        <Group justify="flex-start">
          <Button
            component={Link}
            href={`/sessioni/${encodeURIComponent(sessioneAstaId)}`}
            variant="subtle"
          >
            Torna alla dashboard
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}

export default function PaginaTrasferimentoSessione({
  sessioneAstaId,
}: {
  readonly sessioneAstaId: string;
}) {
  const queryClient = useQueryClient();
  const resetFileRef = useRef<() => void>(null);
  const [fileSelezionato, setFileSelezionato] = useState<File | null>(null);
  const [esportazioneInCorso, setEsportazioneInCorso] = useState(false);
  const [importazioneInCorso, setImportazioneInCorso] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackTrasferimento | null>(null);

  async function esporta(): Promise<void> {
    setEsportazioneInCorso(true);
    setFeedback(null);
    try {
      const file = await richiediEsportazione(sessioneAstaId);
      const url = URL.createObjectURL(file.contenuto);
      const collegamento = document.createElement("a");
      collegamento.href = url;
      collegamento.download = file.nome;
      document.body.append(collegamento);
      collegamento.click();
      collegamento.remove();
      URL.revokeObjectURL(url);

      const messaggio = `Esportazione completata: ${file.nome}`;
      setFeedback({ tipo: "successo", messaggio });
      notifications.show({ color: "green", title: "Esportazione completata", message: messaggio });
    } catch (error_: unknown) {
      const messaggio = messaggioErrore(error_);
      setFeedback({ tipo: "errore", messaggio });
      notifications.show({ color: "red", title: "Esportazione non completata", message: messaggio });
    } finally {
      setEsportazioneInCorso(false);
    }
  }

  async function importa(): Promise<void> {
    if (fileSelezionato === null) return;
    setImportazioneInCorso(true);
    setFeedback(null);
    try {
      const esito = await inviaImportazione(sessioneAstaId, fileSelezionato);
      await queryClient.invalidateQueries({
        predicate: (query) =>
          queryAppartieneASessione(query.queryKey, sessioneAstaId),
      });
      const numeroVoci = esito.numeroVociImportate;
      const messaggio = numeroVoci === undefined
        ? "Importazione completata e stato della sessione aggiornato."
        : `Importazione completata: ${numeroVoci} voci del registro importate.`;
      setFeedback({ tipo: "successo", messaggio });
      setFileSelezionato(null);
      resetFileRef.current?.();
      notifications.show({ color: "green", title: "Importazione completata", message: messaggio });
    } catch (error_: unknown) {
      const messaggio = messaggioErrore(error_);
      setFeedback({ tipo: "errore", messaggio });
      notifications.show({ color: "red", title: "Importazione rifiutata", message: messaggio });
    } finally {
      setImportazioneInCorso(false);
    }
  }

  return (
    <VistaTrasferimentoSessione
      esportazioneInCorso={esportazioneInCorso}
      feedback={feedback}
      fileSelezionato={fileSelezionato}
      importazioneInCorso={importazioneInCorso}
      onEsporta={() => void esporta()}
      onFileSelezionato={(file) => {
        setFileSelezionato(file);
        setFeedback(null);
      }}
      onImporta={() => void importa()}
      resetFileRef={resetFileRef}
      sessioneAstaId={sessioneAstaId}
    />
  );
}
