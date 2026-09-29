import { z } from 'zod';
import { BusinessType, CommerceSubtype, PrimaryGoal, TeamSize, WorkspaceRole } from '../../../generated/prisma/enums';
import { recordAudit } from '../domain/audit';
import { resetLayoutPreferences } from '../preferences';
import { prisma } from '../prisma';
import { canManageWorkspaceSettings } from '../workspace-roles';
import { PRESETS, recommendedPresetKey, presetId } from '../workspace-presets';
import { normalizeBusinessInput, PREFERRED_CHANNELS } from './business';

/**
 * Operaciones sobre el perfil de negocio (P0-E). Solo OWNER/ADMIN; MEMBER lee.
 * El `workspaceId` y el rol salen SIEMPRE del contexto verificado.
 *
 * Tres operaciones distintas a proposito:
 *  - completeOnboarding: primer setup. Guarda perfil y APLICA el preset.
 *  - updateBusinessProfile (ruta /api/onboarding/profile): cambia el perfil y
 *    NO toca preset ni preferencias de nadie.
 *  - applyRecommendedPreset: accion explicita "Aplicar navegacion recomendada".
 */

export class ProfileError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

export type ProfileActor = { userId: string; workspaceId: string; role: WorkspaceRole };

export function canManageProfile(role: WorkspaceRole) {
  return canManageWorkspaceSettings(role);
}

function assertCanManage(actor: ProfileActor) {
  if (!canManageProfile(actor.role)) throw new ProfileError('FORBIDDEN', 'Solo el owner o un admin puede cambiar el perfil del negocio.');
}

export const onboardingSetupSchema = z
  .object({
    businessType: z.enum([BusinessType.SERVICES, BusinessType.ECOMMERCE, BusinessType.APPOINTMENTS, BusinessType.GENERAL]),
    commerceSubtype: z.nativeEnum(CommerceSubtype).nullable().optional(),
    primaryGoal: z.nativeEnum(PrimaryGoal),
    preferredChannels: z.array(z.enum(PREFERRED_CHANNELS)).max(PREFERRED_CHANNELS.length).default([]),
    teamSize: z.nativeEnum(TeamSize),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.businessType === BusinessType.ECOMMERCE && !value.commerceSubtype) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['commerceSubtype'], message: 'Indica qué vendes.' });
    }
  });
export type OnboardingSetupInput = z.infer<typeof onboardingSetupSchema>;

export async function completeOnboarding(actor: ProfileActor, raw: unknown, now = new Date()) {
  assertCanManage(actor);
  const parsed = onboardingSetupSchema.safeParse(raw);
  if (!parsed.success) throw new ProfileError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  const input = parsed.data;
  const business = normalizeBusinessInput(input);
  const preset = PRESETS[recommendedPresetKey(business)];
  const data = {
    ...business,
    primaryGoal: input.primaryGoal,
    teamSize: input.teamSize,
    preferredChannels: [...new Set(input.preferredChannels)],
    presetKey: preset.key,
    presetVersion: preset.version,
    onboardingCompletedAt: now,
    onboardingCompletedById: actor.userId,
  };
  return prisma.$transaction(async (tx) => {
    const profile = await tx.workspaceProfile.upsert({
      where: { workspaceId: actor.workspaceId },
      create: { workspaceId: actor.workspaceId, ...data },
      update: data,
    });
    await recordAudit(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'workspace.onboarding_completed',
        entity: 'WorkspaceProfile',
        entityId: profile.id,
        metadata: { businessType: business.businessType, commerceSubtype: business.commerceSubtype, preset: presetId(preset) },
      },
      tx,
    );
    return profile;
  });
}

/**
 * "Aplicar navegacion recomendada": fija el preset que corresponde al perfil
 * ACTUAL (y su version vigente). Las preferencias de nav/dashboard de quien
 * lo aplica vuelven a los defaults; las de las demas personas no se tocan.
 */
export async function applyRecommendedPreset(actor: ProfileActor, options: { resetMyLayout?: boolean } = {}) {
  assertCanManage(actor);
  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId: actor.workspaceId } });
  const preset = PRESETS[recommendedPresetKey(profile)];
  return prisma.$transaction(async (tx) => {
    const saved = await tx.workspaceProfile.upsert({
      where: { workspaceId: actor.workspaceId },
      create: { workspaceId: actor.workspaceId, presetKey: preset.key, presetVersion: preset.version },
      update: { presetKey: preset.key, presetVersion: preset.version },
    });
    if (options.resetMyLayout ?? true) await resetLayoutPreferences({ userId: actor.userId, workspaceId: actor.workspaceId }, tx);
    await recordAudit(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'workspace.preset_applied',
        entity: 'WorkspaceProfile',
        entityId: saved.id,
        metadata: { from: profile?.presetKey ? `${profile.presetKey}:v${profile.presetVersion ?? 0}` : null, to: presetId(preset) },
      },
      tx,
    );
    return saved;
  });
}
