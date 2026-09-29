import { requireCurrentUser } from '@/lib/auth';
import { DEV_DEMO_USER } from '@/lib/dev-demo';
import { getPreference } from '@/lib/preferences';
import { shouldShowTutorial, TUTORIALS, type TutorialKey } from '@/lib/tutorials';
import { TutorialHintCard } from './tutorial-hint-card';

/**
 * Consejo de primera visita (P0-E). Se decide en el servidor con la
 * preferencia de ESTA persona en ESTE workspace.
 */
export async function TutorialHint({ tutorialKey, className }: { tutorialKey: TutorialKey; className?: string }) {
  const user = await requireCurrentUser();
  if (user.id === DEV_DEMO_USER.id) return null;
  const preference = await getPreference({ userId: user.id, workspaceId: user.workspace.id });
  if (!shouldShowTutorial(preference, tutorialKey)) return null;
  return <TutorialHintCard tutorialKey={tutorialKey} {...TUTORIALS[tutorialKey]} className={className} />;
}
