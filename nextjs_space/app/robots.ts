import type { MetadataRoute } from 'next';

/**
 * Capability/private routes. `/invite`, `/gift` and `/vendor-pass` are token or
 * event-keyed links shared with specific people, and the app routes need auth —
 * none of them should ever end up in a search index.
 */
const DISALLOW = [
  '/dashboard',
  '/events/',
  '/reports',
  '/admin',
  '/auth',
  '/invite/',
  '/gift/',
  '/vendor-pass/',
  '/collab/accept/',
  '/api/',
];

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: DISALLOW }],
    // Emitted only when the deploy knows its public URL (see Dockerfile /
    // cloudbuild.yaml — NEXT_PUBLIC_SITE_URL is baked in at build time).
    ...(base ? { host: base, sitemap: `${base}/sitemap.xml` } : {}),
  };
}
