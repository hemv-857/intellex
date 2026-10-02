import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

// The report export opens a same-origin window and writes HTML into it, so the
// app is one injected string away from script execution without these headers.
const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; 'unsafe-inline' is required for those
  // and is why frame-ancestors/base-uri/object-src are pinned explicitly below.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  // The LLM SDK and favicons are fetched server-side; the browser only talks to /api.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
        ],
      },
    ]
  },
  typescript: {
    // Type errors used to be swallowed at build time, which is how a stale
    // Prisma client and a renamed export shipped. Kept honest.
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
}

export default nextConfig