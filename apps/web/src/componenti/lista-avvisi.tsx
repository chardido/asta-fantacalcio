"use client";

import type { Avviso, LivelloAvviso } from "@asta/domain";
import { Alert, Stack, Text } from "@mantine/core";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

export interface ListaAvvisiProps {
  readonly avvisi: readonly Avviso[];
  readonly formattaMessaggio?: (avviso: Avviso) => string;
}

const PRESENTAZIONE_LIVELLO: Readonly<
  Record<LivelloAvviso, { readonly colore: string; readonly titolo: string; readonly icona: ReactNode }>
> = {
  critico: {
    colore: "red",
    titolo: "Critico",
    icona: <IconAlertCircle aria-hidden size={20} />,
  },
  attenzione: {
    colore: "yellow",
    titolo: "Attenzione",
    icona: <IconAlertTriangle aria-hidden size={20} />,
  },
  informativo: {
    colore: "blue",
    titolo: "Informazione",
    icona: <IconInfoCircle aria-hidden size={20} />,
  },
};

function valore(avviso: Avviso, chiave: string): string {
  const trovato = avviso.valori[chiave];
  return trovato === undefined ? "—" : String(trovato);
}

/** Traduce le chiavi prodotte dal dominio senza introdurre testo nel motore avvisi. */
export function formattaMessaggioAvviso(avviso: Avviso): string {
  switch (avviso.chiaveMessaggio) {
    case "avvisi.repartoCompleto":
      return `Il reparto ${valore(avviso, "reparto")} è completo.`;
    case "avvisi.portiereCostosoGiaInRosa":
      return `${valore(avviso, "nomePortiere")} è già stato acquistato per ${valore(avviso, "prezzoAcquisto")} crediti.`;
    case "avvisi.quotazioneOltrePrezzoConsigliato":
      return `La quotazione supera il prezzo consigliato di ${valore(avviso, "differenzaCrediti")} crediti.`;
    case "avvisi.quotazioneOltreBudgetReparto":
      return `La quotazione supera il budget residuo del reparto di ${valore(avviso, "differenzaCrediti")} crediti.`;
    case "avvisi.riservaMinimaInsufficiente":
      return `Mancano ${valore(avviso, "creditiMancanti")} crediti per garantire i ${valore(avviso, "slotDaRiempire")} slot ancora da riempire.`;
    case "avvisi.concentrazioneSquadra":
      return `Hai già ${valore(avviso, "giocatoriStessaSquadra")} giocatori della squadra ${valore(avviso, "squadra")}.`;
    case "avvisi.bloccoDifensivo":
      return `Hai ${valore(avviso, "difensoriStessaSquadra")} difensori di ${valore(avviso, "squadra")}; ne mancano ${valore(avviso, "difensoriMancanti")} per completare il blocco.`;
    case "avvisi.prezzoPersonaleOltreConsigliato":
      return `Il prezzo personale supera il consiglio di ${valore(avviso, "scostamentoCrediti")} crediti (${valore(avviso, "scostamentoPercentuale")}%).`;
    default:
      return avviso.chiaveMessaggio;
  }
}

/** Presenta gli avvisi già filtrati e ordinati dal dominio, senza mutarne l'ordine. */
export function ListaAvvisi({
  avvisi,
  formattaMessaggio = formattaMessaggioAvviso,
}: ListaAvvisiProps) {
  if (avvisi.length === 0) {
    return (
      <Text aria-live="polite" c="dimmed" size="sm">
        Nessun avviso
      </Text>
    );
  }

  return (
    <Stack aria-label="Avvisi contestuali" gap="sm" role="list">
      {avvisi.map((avviso) => {
        const presentazione = PRESENTAZIONE_LIVELLO[avviso.livello];

        return (
          <Alert
            color={presentazione.colore}
            icon={presentazione.icona}
            key={`${avviso.criterio}-${avviso.chiaveMessaggio}`}
            role="listitem"
            title={presentazione.titolo}
            variant="light"
          >
            {formattaMessaggio(avviso)}
          </Alert>
        );
      })}
    </Stack>
  );
}
