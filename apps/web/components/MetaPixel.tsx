import { getMetaPixelIds, requiresMetaPixelConsent } from "@/lib/meta-pixel";

const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1009533758712390";
const pixelIds = getMetaPixelIds().length ? getMetaPixelIds() : [pixelId];
const requireConsent = requiresMetaPixelConsent();
const pixelScript = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
${requireConsent ? "fbq('consent', 'revoke');" : ""}
${pixelIds.map((id) => `fbq('init', '${id}');`).join("\n")}
${requireConsent ? "" : "fbq('track', 'PageView');"}
`;

export function MetaPixelScript() {
  if (!pixelIds.length) return null;

  return (
    <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: pixelScript }} />
  );
}

export function MetaPixelNoScript() {
  if (!pixelIds.length || requireConsent) return null;

  return (
    <>
      {pixelIds.map((id) => (
        <noscript key={id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            height="1"
            src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
            style={{ display: "none" }}
            width="1"
          />
        </noscript>
      ))}
    </>
  );
}
