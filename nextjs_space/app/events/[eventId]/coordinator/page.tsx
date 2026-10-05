import { CoordinatorClient } from './_components/coordinator-client';

export default async function CoordinatorPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <CoordinatorClient eventId={eventId ?? ''} />;
}
