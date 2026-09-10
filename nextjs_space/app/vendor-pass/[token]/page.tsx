import { VendorPassClient } from './_components/vendor-pass-client';

export default async function VendorPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VendorPassClient token={token ?? ''} />;
}
