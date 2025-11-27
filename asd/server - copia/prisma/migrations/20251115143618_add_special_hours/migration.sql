-- CreateTable
CREATE TABLE "special_hours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
