import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationForEvent, recipientStrategy } from './policy';

test('las notificaciones no exponen contenido de clientes en la pantalla bloqueada', () => {
  const notification = notificationForEvent({
    workspaceId: 'workspace-a',
    kind: 'INCOMING_MESSAGE',
    dedupeKey: 'message-1',
    conversationId: 'conversation-1',
  });
  assert.equal(notification.title, 'Llegó un mensaje nuevo');
  assert.equal(notification.body.includes('message-1'), false);
  assert.equal(notification.url, '/inbox/conversation-1');
});

test('un mensaje entrante solo notifica a la persona asignada', () => {
  assert.equal(
    recipientStrategy({
      workspaceId: 'workspace-a',
      kind: 'INCOMING_MESSAGE',
      dedupeKey: 'message-1',
      userId: 'user-1',
    }),
    'EXPLICIT',
  );
  assert.equal(
    recipientStrategy({
      workspaceId: 'workspace-a',
      kind: 'INCOMING_MESSAGE',
      dedupeKey: 'message-2',
    }),
    'NONE',
  );
});

test('una aprobación abre la cola y un fallo abre operaciones', () => {
  assert.equal(
    notificationForEvent({
      workspaceId: 'workspace-a',
      kind: 'QUOTE_APPROVAL',
      dedupeKey: 'quote-1',
      quoteId: 'quote-1',
    }).url,
    '/cotizaciones',
  );
  assert.equal(
    notificationForEvent({
      workspaceId: 'workspace-a',
      kind: 'OPERATIONAL_ISSUE',
      dedupeKey: 'failure-1',
    }).url,
    '/ops',
  );
});
