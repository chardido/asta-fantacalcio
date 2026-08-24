-- Un giocatore può comparire al massimo in una voce attiva per sessione.
-- Le voci annullate restano nello storico e non partecipano all'unicità.
CREATE UNIQUE INDEX "ux_registro_giocatore_attivo"
ON "voce_registro_acquisti"("sessione_asta_id", "identificativo_giocatore")
WHERE "annullata_il" IS NULL;

-- Una richiesta accodata può essere applicata al massimo una volta per sessione.
CREATE UNIQUE INDEX "ux_registro_idempotenza"
ON "voce_registro_acquisti"("sessione_asta_id", "chiave_idempotenza");
