'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Heart, Palmtree, HandHeart, Theater, CreditCard, PartyPopper, Share2, Check } from 'lucide-react';
import type { GiftType } from '@/types/firestore';
import { formatMoney } from '@/lib/currency';

const GIFT_TYPES: { type: GiftType; label: string; icon: any; emoji: string }[] = [
  { type: 'cash', label: 'Cash Gift', icon: Heart, emoji: '💝' },
  { type: 'honeymoon_fund', label: 'Honeymoon Fund', icon: Palmtree, emoji: '🌴' },
  { type: 'charity', label: 'Charity Donation', icon: HandHeart, emoji: '🤝' },
  { type: 'experience', label: 'Experience Gift', icon: Theater, emoji: '🎭' },
];

const PRESETS = [25, 50, 100, 250, 500];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle?: string;
  /** ISO 4217 code of the gift page's event — preset amounts and totals render in this currency. */
  currency?: string;
  onGiftSent?: (data: any) => void;
}

export function CashGiftModal({ open, onOpenChange, eventId, eventTitle, currency, onGiftSent }: Props) {
  const [step, setStep] = useState(1);
  const [giftType, setGiftType] = useState<GiftType>('cash');
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [message, setMessage] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (open) { setStep(1); setShowConfetti(false); }
  }, [open]);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const fee = (effectiveAmount * 0.029 + 0.30);

  const handleSend = () => {
    // A real gift is only confirmed once the host processes the payment. Until
    // payments are wired, this records a PENDING pledge (matches Firestore
    // rules, which only allow guests to create gifts with status 'pending').
    setStep(4);
    setShowConfetti(true);
    onGiftSent?.({
      eventId, guestName, guestEmail, amount: effectiveAmount,
      giftType, message, status: 'pending',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Progress */}
        <div className="flex gap-1 px-6 pt-5">
          {[1, 2, 3, 4].map((s: number) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Gift Type + Amount */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="font-display text-xl font-bold">Choose a Gift</h2>
                <p className="mb-4 text-sm text-muted-foreground">Select a gift type and amount.</p>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {GIFT_TYPES.map((gt: any) => (
                    <button key={gt?.type} onClick={() => setGiftType(gt?.type)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${
                        giftType === gt?.type ? 'border-primary bg-primary/10' : 'border-border/50 bg-card hover:border-primary/30'
                      }`}>
                      <span className="text-lg">{gt?.emoji}</span>
                      <span className="font-medium">{gt?.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-sm font-medium">Amount</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {PRESETS.map((p: number) => (
                    <Button key={p} variant={amount === p && !customAmount ? 'default' : 'outline'} size="sm"
                      onClick={() => { setAmount(p); setCustomAmount(''); }}>{formatMoney(p, currency)}</Button>
                  ))}
                </div>
                <Input placeholder="Custom amount" type="number" min={1} value={customAmount}
                  onChange={(e: any) => setCustomAmount(e?.target?.value ?? '')} />
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={effectiveAmount <= 0} className="gap-2">Next <ArrowRight className="h-4 w-4" /></Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Personal Message */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="font-display text-xl font-bold">Personal Message</h2>
                <p className="mb-4 text-sm text-muted-foreground">Add a heartfelt note for the couple.</p>
                <div className="space-y-3">
                  <div><Label>Your Name</Label><Input value={guestName} onChange={(e: any) => setGuestName(e?.target?.value ?? '')} className="mt-1" /></div>
                  <div><Label>Email (optional)</Label><Input type="email" value={guestEmail} onChange={(e: any) => setGuestEmail(e?.target?.value ?? '')} className="mt-1" /></div>
                  <div>
                    <Label>Message</Label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      rows={3} maxLength={280} value={message}
                      onChange={(e: any) => setMessage(e?.target?.value ?? '')}
                      placeholder="Wishing you a lifetime of love..."
                    />
                    <p className="text-right text-xs text-muted-foreground">{message?.length ?? 0}/280</p>
                  </div>
                  {/* Envelope preview */}
                  <motion.div initial={{ rotateX: -10 }} animate={{ rotateX: 0 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                    <p className="text-xs text-muted-foreground">Digital Envelope</p>
                    <p className="mt-2 font-display text-lg font-bold">{formatMoney(effectiveAmount, currency)}</p>
                    {message && <p className="mt-1 text-sm italic text-muted-foreground">"{message}"</p>}
                    <p className="mt-1 text-xs text-muted-foreground">— {guestName || 'Anonymous'}</p>
                  </motion.div>
                </div>
                <div className="mt-4 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
                  <Button onClick={() => setStep(3)} disabled={!guestName?.trim()} className="gap-2">Next <ArrowRight className="h-4 w-4" /></Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Payment */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="font-display text-xl font-bold">Payment</h2>
                <p className="mb-4 text-sm text-muted-foreground">Your pledge will be recorded for the host.</p>
                <div className="mb-4 rounded-lg border border-dashed border-border p-8 text-center">
                  <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Payments are not connected yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">No payment is processed today — the host sees your pledge as pending.</p>
                </div>
                <div className="mb-4 rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between"><span>Gift Amount</span><span>{formatMoney(effectiveAmount, currency)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Processing Fee (2.9% + 0.30)</span><span>{formatMoney(fee, currency)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                    <span>Total</span><span>{formatMoney(effectiveAmount + fee, currency)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
                  <Button onClick={handleSend} className="gap-2">Record Pledge 💝</Button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Confirmation */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                  <PartyPopper className="mx-auto mb-3 h-16 w-16 text-primary" />
                </motion.div>
                <h2 className="font-display text-2xl font-bold">Gift Pledge Received</h2>
                <p className="mt-2 text-muted-foreground">Your {formatMoney(effectiveAmount, currency)} pledge has been recorded for the host.</p>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="mx-auto mt-4 max-w-xs rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="font-display text-lg font-bold">{formatMoney(effectiveAmount, currency)}</p>
                  {message && <p className="mt-1 text-sm italic text-muted-foreground">"{message}"</p>}
                  <p className="mt-1 text-xs text-muted-foreground">— {guestName}</p>
                </motion.div>
                <div className="mt-6 flex justify-center gap-2">
                  <Button variant="outline" className="gap-2"><Share2 className="h-4 w-4" /> Share</Button>
                  <Button onClick={() => onOpenChange(false)}>Done</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
