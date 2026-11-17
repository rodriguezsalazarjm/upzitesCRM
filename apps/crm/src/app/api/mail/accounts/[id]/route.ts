import { disconnectMailbox } from '@/lib/mail/service';
import { mailHandler } from '../../http';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return mailHandler(({ workspaceId, userId }) => disconnectMailbox(workspaceId, userId, id));
}
