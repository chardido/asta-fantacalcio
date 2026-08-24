-- Lock a lease per impedire esecuzioni concorrenti della stessa ingestione.
CREATE TABLE "lock_ingestione" (
    "chiave" VARCHAR(100) NOT NULL,
    "proprietario" UUID NOT NULL,
    "acquisito_il" TIMESTAMPTZ(3) NOT NULL,
    "scade_il" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "lock_ingestione_pkey" PRIMARY KEY ("chiave")
);

CREATE INDEX "ix_lock_ingestione_scadenza" ON "lock_ingestione"("scade_il");
