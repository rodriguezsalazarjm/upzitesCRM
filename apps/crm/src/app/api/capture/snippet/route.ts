import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const publicKey = searchParams.get('key') ?? '';
  const endpoint = `${origin}/api/capture/events`;

  const script = `
(function () {
  var publicKey = ${JSON.stringify(publicKey)};
  var endpoint = ${JSON.stringify(endpoint)};
  if (!publicKey || window.__upzitesCrmLoaded) return;
  window.__upzitesCrmLoaded = true;

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getOrSet(name) {
    try {
      var value = localStorage.getItem(name);
      if (!value) {
        value = uuid();
        localStorage.setItem(name, value);
      }
      return value;
    } catch (error) {
      return uuid();
    }
  }

  var visitorId = getOrSet('upzites_crm_visitor_id');
  var sessionId = getOrSet('upzites_crm_session_id');

  function utm(name) {
    return new URLSearchParams(window.location.search).get(name) || undefined;
  }

  function track(type, extra) {
    var payload = Object.assign({
      publicKey: publicKey,
      type: type,
      pageUrl: window.location.href,
      referrer: document.referrer || undefined,
      visitorId: visitorId,
      sessionId: sessionId,
      utmSource: utm('utm_source'),
      utmMedium: utm('utm_medium'),
      utmCampaign: utm('utm_campaign')
    }, extra || {});

    try {
      navigator.sendBeacon(
        endpoint,
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    } catch (error) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    }
  }

  track('page_view');

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('a,button,[data-upzites-event]') : null;
    if (!target) return;

    var href = target.getAttribute('href') || '';
    if (href.indexOf('wa.me') >= 0 || href.indexOf('api.whatsapp.com') >= 0) {
      track('whatsapp_click', { element: href });
      return;
    }

    var eventName = target.getAttribute('data-upzites-event');
    if (eventName) {
      track('cta_click', { element: eventName });
    }
  });
})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
