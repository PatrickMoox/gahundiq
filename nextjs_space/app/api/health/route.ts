/**
 * Liveness/readiness probe for Google Cloud Run (and any uptime monitor).
 *
 * Cloud Run's default startup probe is TCP-only: it passes the moment anything
 * binds :8080, even while the Next.js server is still warming up. Pointing a
 * startup/health probe at this route (`gcloud run deploy --startup-probe
 * httpGet.path=/api/health`) makes a revision serve traffic only once a real
 * 200 comes back.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'gahundiq',
      // Injected automatically by Cloud Run — handy for spot-checking which
      // revision is live from the outside.
      revision: process.env.K_REVISION ?? null,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
