import { EventHubClient } from './_components/event-hub-client';

export default function EventPage({ params }: { params: { eventId: string } }) {
  return <EventHubClient eventId={params?.eventId ?? ''} />;
}
