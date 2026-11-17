import { syncUserMailboxes } from '@/lib/mail/service';
import { mailHandler } from '../http';

export const dynamic = 'force-dynamic';

export async function POST() {
  return mailHandler(async ({ workspaceId, userId }) => ({ errors: await syncUserMailboxes(workspaceId, userId) }));
}
