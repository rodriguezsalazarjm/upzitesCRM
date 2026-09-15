/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.LOCAL_VISUAL_TEST === '1' ? {
    async headers() {
      return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:3101 ws://127.0.0.1:3101; form-action 'self'; frame-ancestors 'self'" }] }];
    },
  } : {}),
};

export default nextConfig;
