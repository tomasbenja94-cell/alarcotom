-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "disabled_payment_methods" TEXT,
    "iuc" TEXT,
    "intentos_invalidos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_intento" DATETIME,
    "baneado_hasta" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_customers" ("created_at", "disabled_payment_methods", "id", "is_blocked", "name", "notes", "phone", "updated_at") SELECT "created_at", "disabled_payment_methods", "id", "is_blocked", "name", "notes", "phone", "updated_at" FROM "customers";
DROP TABLE "customers";
ALTER TABLE "new_customers" RENAME TO "customers";
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE UNIQUE INDEX "customers_iuc_key" ON "customers"("iuc");
CREATE INDEX "customers_iuc_idx" ON "customers"("iuc");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
