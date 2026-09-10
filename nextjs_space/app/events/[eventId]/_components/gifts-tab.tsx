'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useCashGifts } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CashGift, EventData } from '@/types/firestore';
import { formatMoney } from '@/lib/currency';
import { Gift, DollarSign, Heart, Share2, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then((m: any) => ({ default: m?.QRCodeCanvas ?? m?.QRCodeSVG ?? m?.default })) as any,
  { ssr: false, loading: () => <div className="h-[200px] w-[200px] animate-pulse rounded bg-muted" /> }
) as any;

const GIFT_ICONS: Record<string, string> = { cash: '💝', honeymoon_fund: '🌴', charity: '🤝', experience: '🎭' };

export function GiftsTab({ eventId, event }: { eventId: string; event: EventData | null }) {
  const { gifts } = useCashGifts(eventId);
  const currency = event?.currency;
  const [showQR, setShowQR] = useState(false);

  const total = useMemo(() => (gifts ?? []).reduce((s: number, g: CashGift) => s + (g?.amount ?? 0), 0), [gifts]);
  const fees = useMemo(() => (gifts ?? []).reduce((s: number, g: CashGift) => s + (g?.platformFee ?? 0), 0), [gifts]);
  const giftUrl = typeof window !== 'undefined' ? `${window.location.origin}/gift/${eventId}` : '';

  const shareLink = async () => {
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'Send a Gift', url: giftUrl });
      } else {
        await navigator?.clipboard?.writeText?.(giftUrl);
        toast.success('Gift link copied!');
      }
    } catch { toast.error('Could not share link'); }
  };

  return (
    <div>
      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Received', value: formatMoney(total, currency), icon: DollarSign },
          { label: 'Gifts', value: String(gifts?.length ?? 0), icon: Gift },
          { label: 'Platform Fees', value: formatMoney(fees, currency), icon: Heart },
        ].map((s: any, i: number) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-3">
              <s.icon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{s?.label}</p>
                <p className="font-display text-xl font-bold">{s?.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="mb-4 flex gap-2">
        <Button onClick={shareLink} className="gap-2"><Share2 className="h-4 w-4" /> Share Gift Link</Button>
        <Button variant="outline" onClick={() => setShowQR(true)} className="gap-2"><QrCode className="h-4 w-4" /> QR Code</Button>
      </div>

      {/* Gift list */}
      <div className="space-y-3">
        {(gifts ?? []).map((gift: CashGift) => (
          <motion.div key={gift?.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{GIFT_ICONS[gift?.giftType ?? 'cash']}</span>
                  <p className="font-semibold">{gift?.guestName}</p>
                  <Badge variant="outline" className="capitalize text-xs">{(gift?.giftType ?? 'cash').replace('_', ' ')}</Badge>
                </div>
                {gift?.message && <p className="mt-1 text-sm text-muted-foreground">"{gift?.message}"</p>}
                {gift?.guestEmail && <p className="mt-0.5 text-xs text-muted-foreground">{gift?.guestEmail}</p>}
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-bold text-primary">{formatMoney(gift?.amount, currency)}</p>
                <Badge variant={gift?.status === 'completed' ? 'default' : 'secondary'} className="text-xs capitalize">{gift?.status}</Badge>
              </div>
            </div>
          </motion.div>
        ))}
        {(gifts?.length ?? 0) === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            <Gift className="mx-auto mb-2 h-8 w-8" />
            <p>No gifts received yet. Share your gift link!</p>
          </div>
        )}
      </div>

      {/* QR Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Gift Page QR Code</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {giftUrl && <QRCodeCanvas value={giftUrl} size={200} />}
            <p className="break-all text-center text-xs text-muted-foreground">{giftUrl}</p>
            <Button onClick={() => { try { navigator?.clipboard?.writeText?.(giftUrl); toast.success('Copied!'); } catch {} }}>Copy Link</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
