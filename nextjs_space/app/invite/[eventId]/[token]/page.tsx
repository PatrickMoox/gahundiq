import { InviteClient } from './_components/invite-client';

export default function InvitePage({ params }: { params: { eventId: string; token: string } }) {
  return <InviteClient eventId={params?.eventId ?? ''} token={params?.token ?? ''} />;
}
