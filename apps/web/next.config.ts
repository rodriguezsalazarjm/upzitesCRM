import type { NextConfig } from "next";

// Content-Security-Policy.
// - 'unsafe-inline'/'unsafe-eval' on script-src are kept for now because Next's
//   hydration/runtime and some tooling rely on them; can be tightened later
//   with nonces + Trusted Types as a separate hardening pass.
// - frame-src allows Cal.com (loaded only on user interaction).
// - frame-ancestors allows Meta's Event Setup Tool to open and inspect the site.
// - ws:/wss: in connect-src keep dev HMR working.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: https://www.facebook.com https://*.facebook.com",
  "font-src 'self' data:",
  "connect-src 'self' https: https://www.facebook.com https://*.facebook.com ws: wss:",
  "frame-src 'self' https://cal.com https://app.cal.com",
  "frame-ancestors 'self' https://www.facebook.com https://business.facebook.com https://*.facebook.com",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
