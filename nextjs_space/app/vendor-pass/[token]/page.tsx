import { VendorPassClient } from './_components/vendor-pass-client';

export default function VendorPassPage({ params }: { params: { token: string } }) {
  return <VendorPassClient token={params?.token ?? ''} />;
}
