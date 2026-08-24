const SOGLIA_DATI_NON_AGGIORNATI_MS = 7 * 24 * 60 * 60 * 1000;

/** Indica se l'ultima acquisizione riuscita precede l'istante corrente di più di sette giorni. */
export function acquisizionePotenzialmenteNonAggiornata(
  ultimoSuccessoIl: string | null,
  istanteCorrente = Date.now(),
): boolean {
  if (ultimoSuccessoIl === null) return false;

  const istanteUltimoSuccesso = Date.parse(ultimoSuccessoIl);
  return (
    Number.isFinite(istanteUltimoSuccesso) &&
    istanteCorrente - istanteUltimoSuccesso > SOGLIA_DATI_NON_AGGIORNATI_MS
  );
}
