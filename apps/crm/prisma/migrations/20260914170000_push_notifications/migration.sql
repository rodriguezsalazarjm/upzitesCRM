ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'SEND_PUSH';

CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "device_label" TEXT,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "notify_human_attention" BOOLEAN NOT NULL DEFAULT true,
  "notify_assigned" BOOLEAN NOT NULL DEFAULT true,
  "notify_quote_approval" BOOLEAN NOT NULL DEFAULT true,
  "notify_operational_issue" BOOLEAN NOT NULL DEFAULT true,
  "notify_incoming_message" BOOLEAN NOT NULL DEFAULT true,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "last_success_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_workspace_id_user_id_enabled_idx"
  ON "push_subscriptions"("workspace_id", "user_id", "enabled");
