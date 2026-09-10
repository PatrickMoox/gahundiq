import { InviteClient } from './_components/invite-client';

export default async function InvitePage({ params }: { params: Promise<{ eventId: string; token: string }> }) {
  const { eventId, token } = await params;
  return <InviteClient eventId={eventId ?? ''} token={token ?? ''} />;
}
