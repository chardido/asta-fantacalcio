"use client";

import { Autocomplete, Badge, Group, Highlight, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";

export const LUNGHEZZA_MINIMA_RICERCA = 2;
export const LUNGHEZZA_MASSIMA_RICERCA = 50;
export const NUMERO_MASSIMO_RISULTATI = 20;
export const NUMERO_MASSIMO_SUGGERIMENTI = 5;
export const RITARDO_RICERCA_MS = 200;

export interface GiocatoreRicerca {
  readonly identificativo: string;
  readonly nome: string;
  readonly nomeRicerca: string;
  readonly squadra: string;
  readonly ruolo: string;
  readonly disponibile?: boolean;
}

export type TipoEsitoRicerca = "soglia" | "risultati" | "suggerimenti";

export interface EsitoRicercaGiocatori {
  readonly tipo: TipoEsitoRicerca;
  readonly giocatori: readonly GiocatoreRicerca[];
}

export interface CampoRicercaGiocatoreProps {
  readonly giocatori: readonly GiocatoreRicerca[];
  readonly valore: string;
  readonly onChange: (valore: string) => void;
  readonly onSeleziona?: (giocatore: GiocatoreRicerca) => void;
  readonly disabilitato?: boolean;
  readonly etichetta?: string;
}

export function limitaValoreRicerca(valore: string): string {
  return valore.slice(0, LUNGHEZZA_MASSIMA_RICERCA);
}

export function normalizzaRicerca(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .trim();
}

/** Calcola la distanza con uscita anticipata oltre il limite richiesto. */
export function distanzaModificaLimitata(
  sinistra: string,
  destra: string,
  limite: number,
): number {
  if (Math.abs(sinistra.length - destra.length) > limite) {
    return limite + 1;
  }

  let precedente = Array.from({ length: destra.length + 1 }, (_, indice) => indice);

  for (let indiceSinistra = 1; indiceSinistra <= sinistra.length; indiceSinistra += 1) {
    const corrente = [indiceSinistra];
    let minimoRiga = indiceSinistra;

    for (let indiceDestra = 1; indiceDestra <= destra.length; indiceDestra += 1) {
      const costo =
        sinistra[indiceSinistra - 1] === destra[indiceDestra - 1] ? 0 : 1;
      const valore = Math.min(
        (corrente[indiceDestra - 1] ?? 0) + 1,
        (precedente[indiceDestra] ?? 0) + 1,
        (precedente[indiceDestra - 1] ?? 0) + costo,
      );
      corrente.push(valore);
      minimoRiga = Math.min(minimoRiga, valore);
    }

    if (minimoRiga > limite) {
      return limite + 1;
    }

    precedente = corrente;
  }

  return precedente[destra.length] ?? limite + 1;
}

export function preparaRicercaGiocatori(
  giocatori: readonly GiocatoreRicerca[],
  termine: string,
): EsitoRicercaGiocatori {
  const query = normalizzaRicerca(limitaValoreRicerca(termine));
  if (query.length < LUNGHEZZA_MINIMA_RICERCA) {
    return { tipo: "soglia", giocatori: [] };
  }

  const risultati = giocatori
    .filter((giocatore) => giocatore.nomeRicerca.includes(query))
    .slice(0, NUMERO_MASSIMO_RISULTATI);
  if (risultati.length > 0) {
    return { tipo: "risultati", giocatori: risultati };
  }

  const suggerimenti = giocatori
    .map((giocatore) => ({
      giocatore,
      distanza: distanzaModificaLimitata(query, giocatore.nomeRicerca, 2),
    }))
    .filter(({ distanza }) => distanza <= 2)
    .sort(
      (sinistra, destra) =>
        sinistra.distanza - destra.distanza ||
        sinistra.giocatore.nome.localeCompare(destra.giocatore.nome, "it"),
    )
    .slice(0, NUMERO_MASSIMO_SUGGERIMENTI)
    .map(({ giocatore }) => giocatore);

  return { tipo: "suggerimenti", giocatori: suggerimenti };
}

/** Campo di ricerca in memoria con soglia, debounce e suggerimenti tolleranti agli errori. */
export function CampoRicercaGiocatore({
  giocatori,
  valore,
  onChange,
  onSeleziona,
  disabilitato = false,
  etichetta = "Cerca giocatore",
}: CampoRicercaGiocatoreProps) {
  const valoreLimitato = limitaValoreRicerca(valore);
  const [valoreRitardato] = useDebouncedValue(valoreLimitato, RITARDO_RICERCA_MS);
  const esito = preparaRicercaGiocatori(giocatori, valoreRitardato);
  const giocatoriPerId = new Map(
    esito.giocatori.map((giocatore) => [giocatore.identificativo, giocatore]),
  );
  let descrizione: string | undefined;
  if (esito.tipo === "soglia") {
    descrizione = "Inserisci almeno 2 caratteri";
  } else if (esito.tipo === "suggerimenti") {
    descrizione =
      esito.giocatori.length > 0
        ? "Nessun risultato esatto. Potrebbero interessarti questi giocatori."
        : "Nessun giocatore trovato";
  }

  return (
    <Stack gap="xs">
      <Autocomplete
        clearable
        data={esito.giocatori.map((giocatore) => ({
          value: giocatore.identificativo,
          label: giocatore.nome,
        }))}
        disabled={disabilitato}
        filter={({ options }) => options}
        label={etichetta}
        limit={NUMERO_MASSIMO_RISULTATI}
        maxLength={LUNGHEZZA_MASSIMA_RICERCA}
        onChange={(nuovoValore) => onChange(limitaValoreRicerca(nuovoValore))}
        onOptionSubmit={(identificativo) => {
          const giocatore = giocatoriPerId.get(identificativo);
          if (giocatore !== undefined) {
            onSeleziona?.(giocatore);
          }
        }}
        placeholder="Digita almeno 2 caratteri"
        renderOption={({ option }) => {
          const giocatore = giocatoriPerId.get(option.value);
          if (giocatore === undefined) {
            return option.value;
          }

          return (
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <Highlight highlight={valoreRitardato}>{giocatore.nome}</Highlight>
                {giocatore.disponibile === false ? (
                  <Badge color="gray" size="sm" variant="light">
                    Non disponibile
                  </Badge>
                ) : null}
              </Group>
              <Text c="dimmed" size="sm">
                {giocatore.ruolo} · {giocatore.squadra}
              </Text>
            </Group>
          );
        }}
        value={valoreLimitato}
      />
      {descrizione !== undefined && (
        <Text aria-live="polite" c="dimmed" size="sm">
          {descrizione}
        </Text>
      )}
    </Stack>
  );
}
