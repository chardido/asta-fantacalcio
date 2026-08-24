-- CreateEnum
CREATE TYPE "TipoAsta" AS ENUM ('chiamata', 'random', 'busta_chiusa', 'asta_live_ordine_listone', 'riparazione');
CREATE TYPE "ModalitaGioco" AS ENUM ('classic', 'mantra');
CREATE TYPE "StatoSessioneAsta" AS ENUM ('in_corso', 'completata');
CREATE TYPE "TipoAssegnatario" AS ENUM ('utente', 'avversario');
CREATE TYPE "StatoSnapshot" AS ENUM ('in_costruzione', 'consultabile', 'superato');
CREATE TYPE "EsitoIngestione" AS ENUM ('successo', 'errore', 'limite_frequenza', 'timeout', 'dati_non_validi');

-- CreateTable
CREATE TABLE "utente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_normalizzata" VARCHAR(254) NOT NULL,
    "email_visualizzata" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "utente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessione_auth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utente_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_attivita_il" TIMESTAMPTZ(3) NOT NULL,
    "scade_il_assoluto" TIMESTAMPTZ(3) NOT NULL,
    "revocata_il" TIMESTAMPTZ(3),
    CONSTRAINT "sessione_auth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessione_asta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utente_id" UUID NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "stagione_listone" VARCHAR(20) NOT NULL,
    "stato" "StatoSessioneAsta" NOT NULL DEFAULT 'in_corso',
    "tipo_asta" "TipoAsta" NOT NULL,
    "modalita_gioco" "ModalitaGioco" NOT NULL,
    "numero_partecipanti" INTEGER NOT NULL,
    "crediti_iniziali" INTEGER NOT NULL,
    "modificatore_difesa" BOOLEAN NOT NULL DEFAULT false,
    "composizione_rosa" JSONB NOT NULL,
    "quote_reparto" JSONB NOT NULL,
    "pesi_valutazione" JSONB NOT NULL,
    "avvisi_informativi_attivi" BOOLEAN NOT NULL DEFAULT true,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessione_asta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "avversario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessione_asta_id" UUID NOT NULL,
    "nome" VARCHAR(30) NOT NULL,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "avversario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voce_registro_acquisti" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessione_asta_id" UUID NOT NULL,
    "ordinale" INTEGER NOT NULL,
    "identificativo_giocatore" VARCHAR(128) NOT NULL,
    "nome_giocatore" VARCHAR(100) NOT NULL,
    "ruolo" VARCHAR(10) NOT NULL,
    "squadra" VARCHAR(100) NOT NULL,
    "reparto_assegnato" VARCHAR(10) NOT NULL,
    "macro_reparto" VARCHAR(3) NOT NULL,
    "prezzo_acquisto" INTEGER,
    "assegnatario_tipo" "TipoAssegnatario" NOT NULL,
    "avversario_id" UUID,
    "annullata_il" TIMESTAMPTZ(3),
    "chiave_idempotenza" UUID NOT NULL,
    "giocatore_assente_dati_correnti" BOOLEAN NOT NULL DEFAULT false,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voce_registro_acquisti_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voce_obiettivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessione_asta_id" UUID NOT NULL,
    "identificativo_giocatore" VARCHAR(128) NOT NULL,
    "nome_giocatore" VARCHAR(100) NOT NULL,
    "reparto" VARCHAR(10) NOT NULL,
    "prezzo_massimo_personale" INTEGER,
    "priorita" INTEGER NOT NULL DEFAULT 99,
    "non_raggiungibile" BOOLEAN NOT NULL DEFAULT false,
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voce_obiettivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consultazione_scheda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessione_asta_id" UUID NOT NULL,
    "identificativo_giocatore" VARCHAR(128) NOT NULL,
    "istante" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consultazione_scheda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "snapshot_dati" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stagione_listone" VARCHAR(20) NOT NULL,
    "stagione_statistiche" VARCHAR(20) NOT NULL,
    "stato" "StatoSnapshot" NOT NULL DEFAULT 'in_costruzione',
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "num_giocatori" INTEGER NOT NULL,
    "nome_sorgente_listone" VARCHAR(100) NOT NULL,
    "nome_sorgente_statistiche" VARCHAR(100) NOT NULL,
    "hash_contenuto" CHAR(64) NOT NULL,
    CONSTRAINT "snapshot_dati_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "giocatore_snapshot" (
    "snapshot_id" UUID NOT NULL,
    "identificativo_giocatore" VARCHAR(128) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "nome_ricerca" VARCHAR(100) NOT NULL,
    "squadra" VARCHAR(100) NOT NULL,
    "ruolo_classic" VARCHAR(1),
    "ruoli_mantra" TEXT[] NOT NULL,
    "quotazione" INTEGER NOT NULL,
    "stat_fantacalcio" JSONB NOT NULL,
    "stat_tattiche" JSONB NOT NULL,
    CONSTRAINT "pk_giocatore_snapshot" PRIMARY KEY ("snapshot_id", "identificativo_giocatore")
);

CREATE TABLE "pubblicazione_snapshot" (
    "stagione_listone" VARCHAR(20) NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "pubblicato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pubblicazione_snapshot_pkey" PRIMARY KEY ("stagione_listone")
);

CREATE TABLE "stato_freschezza" (
    "nome_sorgente" VARCHAR(100) NOT NULL,
    "stagione" VARCHAR(20) NOT NULL,
    "ultimo_successo_il" TIMESTAMPTZ(3),
    "ultimo_tentativo_il" TIMESTAMPTZ(3) NOT NULL,
    "ultimo_esito" "EsitoIngestione" NOT NULL,
    "dettaglio_errore" TEXT,
    "num_giocatori_acquisiti" INTEGER,
    "budget_token" INTEGER NOT NULL DEFAULT 0,
    "prossimo_tentativo_non_prima_di" TIMESTAMPTZ(3),
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_stato_freschezza" PRIMARY KEY ("nome_sorgente", "stagione")
);

CREATE TABLE "esecuzione_ingestione" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome_sorgente" VARCHAR(100) NOT NULL,
    "stagione" VARCHAR(20) NOT NULL,
    "iniziata_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminata_il" TIMESTAMPTZ(3),
    "esito" "EsitoIngestione" NOT NULL,
    "num_giocatori_acquisiti" INTEGER,
    "dettaglio_errore" TEXT,
    CONSTRAINT "esecuzione_ingestione_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alias_giocatore" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome_sorgente" VARCHAR(100) NOT NULL,
    "identificativo_sorgente" VARCHAR(128) NOT NULL,
    "nome_normalizzato" VARCHAR(100) NOT NULL,
    "squadra_normalizzata" VARCHAR(100) NOT NULL,
    "identificativo_giocatore" VARCHAR(128),
    "creato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornato_il" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alias_giocatore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ux_utente_email_normalizzata" ON "utente"("email_normalizzata");
CREATE UNIQUE INDEX "ux_sessione_auth_token_hash" ON "sessione_auth"("token_hash");
CREATE INDEX "ix_sessione_auth_utente" ON "sessione_auth"("utente_id");
CREATE UNIQUE INDEX "ux_sessione_asta_utente_nome" ON "sessione_asta"("utente_id", "nome");
CREATE INDEX "ix_sessione_asta_utente_aggiornato" ON "sessione_asta"("utente_id", "aggiornato_il");
CREATE UNIQUE INDEX "ux_avversario_sessione_nome" ON "avversario"("sessione_asta_id", "nome");
CREATE UNIQUE INDEX "ux_registro_sessione_ordinale" ON "voce_registro_acquisti"("sessione_asta_id", "ordinale");
CREATE INDEX "ix_registro_sessione_giocatore" ON "voce_registro_acquisti"("sessione_asta_id", "identificativo_giocatore");
CREATE INDEX "ix_registro_avversario" ON "voce_registro_acquisti"("avversario_id");
CREATE UNIQUE INDEX "ux_obiettivo_sessione_giocatore" ON "voce_obiettivo"("sessione_asta_id", "identificativo_giocatore");
CREATE INDEX "ix_consultazione_sessione_giocatore" ON "consultazione_scheda"("sessione_asta_id", "identificativo_giocatore", "istante");
CREATE INDEX "ix_snapshot_stagione_stato" ON "snapshot_dati"("stagione_listone", "stato");
CREATE INDEX "ix_giocatore_snapshot_ricerca" ON "giocatore_snapshot"("snapshot_id", "nome_ricerca");
CREATE UNIQUE INDEX "ux_pubblicazione_snapshot_id" ON "pubblicazione_snapshot"("snapshot_id");
CREATE INDEX "ix_esecuzione_sorgente_stagione" ON "esecuzione_ingestione"("nome_sorgente", "stagione", "iniziata_il");
CREATE UNIQUE INDEX "ux_alias_sorgente_identificativo" ON "alias_giocatore"("nome_sorgente", "identificativo_sorgente");
CREATE INDEX "ix_alias_nome_squadra" ON "alias_giocatore"("nome_normalizzato", "squadra_normalizzata");

-- AddForeignKey
ALTER TABLE "sessione_auth" ADD CONSTRAINT "sessione_auth_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessione_asta" ADD CONSTRAINT "sessione_asta_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "utente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avversario" ADD CONSTRAINT "avversario_sessione_asta_id_fkey" FOREIGN KEY ("sessione_asta_id") REFERENCES "sessione_asta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voce_registro_acquisti" ADD CONSTRAINT "voce_registro_acquisti_sessione_asta_id_fkey" FOREIGN KEY ("sessione_asta_id") REFERENCES "sessione_asta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voce_registro_acquisti" ADD CONSTRAINT "voce_registro_acquisti_avversario_id_fkey" FOREIGN KEY ("avversario_id") REFERENCES "avversario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voce_obiettivo" ADD CONSTRAINT "voce_obiettivo_sessione_asta_id_fkey" FOREIGN KEY ("sessione_asta_id") REFERENCES "sessione_asta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consultazione_scheda" ADD CONSTRAINT "consultazione_scheda_sessione_asta_id_fkey" FOREIGN KEY ("sessione_asta_id") REFERENCES "sessione_asta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "giocatore_snapshot" ADD CONSTRAINT "giocatore_snapshot_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshot_dati"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pubblicazione_snapshot" ADD CONSTRAINT "pubblicazione_snapshot_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "snapshot_dati"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
