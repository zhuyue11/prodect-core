-- CreateTable
CREATE TABLE "MigrationMarker" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationMarker_pkey" PRIMARY KEY ("id")
);
