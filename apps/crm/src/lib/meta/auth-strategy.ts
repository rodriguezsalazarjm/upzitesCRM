import { z } from 'zod';

/** OAuth mechanism is independent of provider/channel and of fake transport. */
export const metaAuthorizationSchema = z.discriminatedUnion('mechanism', [
  z.object({ mechanism: z.literal('INSTAGRAM_LOGIN'), channel: z.literal('INSTAGRAM'), tokenType: z.literal('INSTAGRAM_USER'), instagramAccountId: z.string().min(1) }).strict(),
  z.object({ mechanism: z.literal('FACEBOOK_LOGIN'), channel: z.enum(['INSTAGRAM', 'MESSENGER']), tokenType: z.literal('PAGE'), pageId: z.string().min(1), instagramAccountId: z.string().min(1).optional() }).strict(),
]).superRefine((value, ctx) => {
  if (value.mechanism === 'FACEBOOK_LOGIN' && value.channel === 'INSTAGRAM' && !value.instagramAccountId) ctx.addIssue({ code: 'custom', message: 'Falta la cuenta Instagram vinculada a la Página.' });
});
export type MetaAuthorization = z.infer<typeof metaAuthorizationSchema>;

export function metaAuthRequirements(channel: 'INSTAGRAM' | 'MESSENGER', mechanism = channel === 'INSTAGRAM' ? 'INSTAGRAM_LOGIN' : 'FACEBOOK_LOGIN') {
  if (mechanism === 'INSTAGRAM_LOGIN') {
    if (channel !== 'INSTAGRAM') throw new Error('Messenger requiere Facebook Login y una Página.');
    return { mechanism, pageRequired: false, tokenType: 'INSTAGRAM_USER', host: 'graph.instagram.com', scopes: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'] };
  }
  if (mechanism !== 'FACEBOOK_LOGIN') throw new Error('Mecanismo desconocido.');
  return { mechanism, pageRequired: true, tokenType: 'PAGE', host: 'graph.facebook.com', scopes: channel === 'MESSENGER' ? ['pages_show_list', 'pages_manage_metadata', 'pages_messaging'] : ['pages_show_list', 'pages_manage_metadata', 'instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments'] };
}
