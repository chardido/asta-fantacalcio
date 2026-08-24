import {
  AdattatoreStatisticheApiFootball,
  type ConfigurazioneAdattatoreStatisticheApiFootball,
} from "@asta/adapters";

export const VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL = "API_FOOTBALL_KEY";

type ConfigurazioneSenzaChiave = Omit<
  ConfigurazioneAdattatoreStatisticheApiFootball,
  "chiaveApi"
>;

/**
 * Unico punto che legge la chiave API-Football dall'ambiente. Il pacchetto
 * adapters resta configurabile e non accede mai alle variabili del processo.
 */
export function creaAdattatoreStatisticheApiFootballDaAmbiente(
  ambiente: NodeJS.ProcessEnv = process.env,
  configurazione: ConfigurazioneSenzaChiave = {},
): AdattatoreStatisticheApiFootball {
  const chiaveApi = ambiente[VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL]?.trim();
  if (!chiaveApi) {
    throw new Error(
      `La variabile ${VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL} e' obbligatoria nel processo worker`,
    );
  }

  return new AdattatoreStatisticheApiFootball({
    ...configurazione,
    chiaveApi,
  });
}
