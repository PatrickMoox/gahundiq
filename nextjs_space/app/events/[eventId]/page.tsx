import { EventHubClient } from './_components/event-hub-client';

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <EventHubClient eventId={eventId ?? ''} />;
}
