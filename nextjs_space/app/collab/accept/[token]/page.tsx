import { AcceptClient } from './_components/accept-client';

export default async function CollabAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptClient token={token ?? ''} />;
}