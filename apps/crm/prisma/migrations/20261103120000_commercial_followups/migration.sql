-- Punto 7: seguimiento comercial configurable.
--
-- Extiende el motor de journeys existente (no crea otro): producto por
-- estrategia, disparadores comerciales nuevos, mensajes fijos o IA, limites de
-- insistencia por inscripcion, modo prueba, dias de envio y el registro de cada
-- paso ejecutado (que ademas es la idempotencia del envio).
--
-- Prisma no envuelve las migraciones en una transaccion: un fallo a mitad
-- dejaria tipos y columnas sueltos. Se envuelve a mano. Los valores nuevos de
-- los enums no se usan dentro de esta misma transaccion (PostgreSQL 12+).
BEGIN;

CREATE TYPE "FollowUpMessageMode" AS ENUM ('FIXED', 'AI');
CREATE TYPE "OutOfHoursBehavior" AS ENUM ('POSTPONE', 'SKIP');
CREATE TYPE "JourneyStepRunStatus" AS ENUM ('SENDING', 'SENT', 'SIMULATED', 'DONE', 'SKIPPED', 'BLOCKED', 'FAILED');

ALTER TYPE "JourneyStepAction" ADD VALUE 'SEND_INSTAGRAM';
ALTER TYPE "JourneyTrigger" ADD VALUE 'NO_REPLY';
ALTER TYPE "JourneyTrigger" ADD VALUE 'INQUIRY_NO_PURCHASE';
ALTER TYPE "JourneyTrigger" ADD VALUE 'OPPORTUNITY_STALLED';

ALTER TABLE "journeys" ADD COLUMN     "max_messages" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "min_gap_hours" DOUBLE PRECISION NOT NULL DEFAULT 12,
ADD COLUMN     "product_id" TEXT,
ADD COLUMN     "simulate" BOOLEAN NOT NULL DEFAULT false;

-- Los limites se validan tambien en el servidor; la base es la ultima red.
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_max_messages_check" CHECK ("max_messages" BETWEEN 1 AND 10);
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_min_gap_hours_check" CHECK ("min_gap_hours" >= 0 AND "min_gap_hours" <= 720);

ALTER TABLE "journey_steps" ADD COLUMN     "ai_goal" TEXT,
ADD COLUMN     "message_mode" "FollowUpMessageMode" NOT NULL DEFAULT 'FIXED';

ALTER TABLE "journey_enrollments" ADD COLUMN     "conversation_id" TEXT,
ADD COLUMN     "last_message_at" TIMESTAMP(3),
ADD COLUMN     "messages_sent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opportunity_id" TEXT,
ADD COLUMN     "order_id" TEXT,
ADD COLUMN     "purchase_order_id" TEXT,
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggered_at" TIMESTAMP(3);

-- Por defecto todos los dias: ningun workspace existente cambia de comportamiento.
ALTER TABLE "messaging_policies" ADD COLUMN     "out_of_hours_behavior" "OutOfHoursBehavior" NOT NULL DEFAULT 'POSTPONE',
ADD COLUMN     "send_days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];

CREATE TABLE "journey_step_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "journey_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "step_id" TEXT,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "JourneyStepRunStatus" NOT NULL,
    "channel" TEXT,
    "message_id" TEXT,
    "text" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_step_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "journey_step_runs_workspace_id_journey_id_status_idx" ON "journey_step_runs"("workspace_id", "journey_id", "status");
-- Un paso se ejecuta una sola vez por inscripcion: es la barrera contra el envio duplicado.
CREATE UNIQUE INDEX "journey_step_runs_enrollment_id_position_key" ON "journey_step_runs"("enrollment_id", "position");
CREATE INDEX "journeys_product_id_workspace_id_idx" ON "journeys"("product_id", "workspace_id");

-- FK compuesta: una estrategia no puede apuntar al producto de otro workspace.
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journey_enrollments" ADD CONSTRAINT "journey_enrollments_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journey_step_runs" ADD CONSTRAINT "journey_step_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journey_step_runs" ADD CONSTRAINT "journey_step_runs_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journey_step_runs" ADD CONSTRAINT "journey_step_runs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "journey_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
