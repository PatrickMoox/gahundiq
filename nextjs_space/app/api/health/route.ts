/** Liveness endpoint for uptime monitors and deployment checks. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'gahundiq',
      revision: process.env.K_REVISION ?? null,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
