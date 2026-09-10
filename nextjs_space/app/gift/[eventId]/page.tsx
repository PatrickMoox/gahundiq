import { GiftPageClient } from './_components/gift-page-client';

export default function GiftPage({ params }: { params: { eventId: string } }) {
  return <GiftPageClient eventId={params?.eventId ?? ''} />;
}
