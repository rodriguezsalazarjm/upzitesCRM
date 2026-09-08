-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROCESS_WEBHOOK_EVENT', 'PROCESS_OUTBOX', 'EVALUATE_TRIGGER', 'RUN_AUTOMATION_RULE', 'RUN_SCHEDULED_ACTION', 'SCAN_SCHEDULED_ACTIONS', 'SCAN_SILENCE', 'RECALCULATE_SCORE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('MATCHED', 'SKIPPED', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationAction" ADD VALUE 'SEND_MESSAGE';
ALTER TYPE "AutomationAction" ADD VALUE 'SCHEDULE_ACTION';
ALTER TYPE "AutomationAction" ADD VALUE 'CANCEL_ACTIONS';
ALTER TYPE "AutomationAction" ADD VALUE 'ADD_TAG';
ALTER TYPE "AutomationAction" ADD VALUE 'REMOVE_TAG';
ALTER TYPE "AutomationAction" ADD VALUE 'ASSIGN_CONVERSATION';
ALTER TYPE "AutomationAction" ADD VALUE 'SET_LIFECYCLE';
ALTER TYPE "AutomationAction" ADD VALUE 'RECALCULATE_SCORE';
ALTER TYPE "AutomationAction" ADD VALUE 'RUN_AGENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'MESSAGE_RECEIVED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'MESSAGE_FAILED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CONVERSATION_ASSIGNED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CONTACT_SCORE_CHANGED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CONSENT_REVOKED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CHECKOUT_STARTED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'QUOTE_CREATED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'QUOTE_ACCEPTED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'ORDER_FULFILLED';

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "actions" JSONB,
ADD COLUMN     "dedupe_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "run_count" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "action" DROP NOT NULL;

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "dedupe_key" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "contact_id" TEXT,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'MATCHED',
    "actions_run" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_key_key" ON "jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "jobs_status_run_at_priority_idx" ON "jobs"("status", "run_at", "priority");

-- CreateIndex
CREATE INDEX "jobs_workspace_id_status_idx" ON "jobs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "automation_executions_workspace_id_created_at_idx" ON "automation_executions"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_rule_id_dedupe_key_key" ON "automation_executions"("rule_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "automation_rules_workspace_id_trigger_is_active_idx" ON "automation_rules"("workspace_id", "trigger", "is_active");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

