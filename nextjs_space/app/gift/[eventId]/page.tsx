import { GiftPageClient } from './_components/gift-page-client';

export default async function GiftPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <GiftPageClient eventId={eventId ?? ''} />;
}
