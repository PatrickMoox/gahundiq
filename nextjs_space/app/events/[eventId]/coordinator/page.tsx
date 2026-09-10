import { CoordinatorClient } from './_components/coordinator-client';

export default function CoordinatorPage({ params }: { params: { eventId: string } }) {
  return <CoordinatorClient eventId={params?.eventId ?? ''} />;
}
