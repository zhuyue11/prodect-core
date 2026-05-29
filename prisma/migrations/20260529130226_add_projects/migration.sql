-- AlterTable
ALTER TABLE "workspace_membership" ADD COLUMN     "activeProjectId" TEXT;

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "lastWorkItemNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_workspaceId_idx" ON "project"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "project_workspaceId_slug_key" ON "project"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_workspaceId_identifier_key" ON "project"("workspaceId", "identifier");

-- CreateIndex
CREATE INDEX "workspace_membership_activeProjectId_idx" ON "workspace_membership"("activeProjectId");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_activeProjectId_fkey" FOREIGN KEY ("activeProjectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
