'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, CreditCard, Crown, Layers, PartyPopper } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useSubscription } from '@/lib/hooks/use-subscription';
import { isSubscriptionActive, PAID_LIMITS } from '@/lib/plan-entitlements';
import { toast } from 'sonner';

const BUNDLES = [
  { quantity: 5, price: 5, tag: 'Starter' },
  { quantity: 10, price: 9, tag: 'Best value' },
  { quantity: 25, price: 20, tag: 'Agency' },
];

// Single source of truth: no real payment provider is wired yet, so purchases
// must NOT simulate success or mutate quota. Flip to true when Stripe is
// connected and real charges create the reference below.
const PAYMENTS_ENABLED = false;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Self-serve purchase of extra active-ceremony capacity. Gated behind
 * PAYMENTS_ENABLED: until a real payment provider is wired, purchases are NOT
 * simulated and the subscription is NOT mutated. When enabled, the flow grows
 * subscriptions/{uid}.maxEvents — allowed by the rules only for these quota
 * fields, only growing, and bounded (see the /subscriptions match block).
 */
export function CeremonyAddonModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { subscription } = useSubscription(user?.uid);
  const [step, setStep] = useState(1);
  const [bundle, setBundle] = useState(BUNDLES[0]);
  const [processing, setProcessing] = useState(false);
  const [purchased, setPurchased] = useState(0);

  useEffect(() => {
    if (open) { setStep(1); setProcessing(false); setPurchased(0); setBundle(BUNDLES[0]); }
  }, [open]);

  const currentMax = subscription?.maxEvents ?? PAID_LIMITS.activeCeremonies;
  const eligible = Boolean(subscription && isSubscriptionActive(subscription));

  const handlePurchase = async () => {
    if (!user) return;
    if (!PAYMENTS_ENABLED) {
      toast.info('Payments are not connected yet — no charge was made.');
      return;
    }
    const db = getFirestoreClient();
    if (!db || !subscription) { toast.error('Subscription not found. Please contact support.'); return; }
    setProcessing(true);
    try {
      // Real payment flow (Stripe) goes here — collect the charge reference
      // first, then record the purchase and grow the quota. Never simulate.
      const history = [
        { type: 'ceremonies', quantity: bundle.quantity, amount: bundle.price, currency: 'USD', at: new Date() },
        ...(subscription.addonHistory ?? []),
      ].slice(0, 50);
      await setDoc(doc(db, 'subscriptions', user.uid), {
        maxEvents: currentMax + bundle.quantity,
        extraCeremonies: (subscription.extraCeremonies ?? 0) + bundle.quantity,
        addonHistory: history,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setPurchased(bundle.quantity);
      setStep(3);
      import('canvas-confetti').then((mod: any) => {
        mod?.default?.({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }).catch(() => {});
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not complete the purchase.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="flex gap-1 px-6 pt-5">
          {[1, 2, 3].map((s: number) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Bundle selection */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="font-display text-xl font-bold">More Ceremonies</h2>
                <p className="mb-4 text-sm text-muted-foreground">Top up your active ceremony limit. Current capacity: {currentMax}.</p>
                {!eligible ? (
                  <div className="mb-4 rounded-lg border border-dashed border-border p-6 text-center">
                    <Crown className="mx-auto mb-2 h-8 w-8 text-primary" />
                    <p className="text-sm font-medium">Available on the Premium (Planner) plan</p>
                    <p className="mt-1 text-xs text-muted-foreground">Upgrade to Premium first, then come back to stack extra ceremonies.</p>
                  </div>
                ) : (
                  <div className="mb-4 space-y-2">
                    {BUNDLES.map((b) => (
                      <button key={b.quantity} type="button" onClick={() => setBundle(b)}
                        className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${bundle.quantity === b.quantity ? 'border-primary bg-primary/10' : 'border-border/50'}`}>
                        <span className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          <span>
                            <span className="block text-sm font-medium">+{b.quantity} ceremonies</span>
                            <span className="block text-xs text-muted-foreground">{b.tag}</span>
                          </span>
                        </span>
                        <span className="text-sm font-semibold">${b.price}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!eligible} className="gap-2">Checkout <ArrowRight className="h-4 w-4" /></Button>
                </div>
              </motion.div>
            )}
            {/* Step 2: Payment */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="font-display text-xl font-bold">Payment</h2>
                <p className="mb-4 text-sm text-muted-foreground">Complete your purchase securely.</p>
                <div className="mb-4 rounded-lg border border-dashed border-border p-8 text-center">
                  <CreditCard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Payments are not connected yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Extra ceremonies will be purchasable here once Stripe is set up. No charge is made today.
                  </p>
                </div>
                <div className="mb-4 rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between"><span>+{bundle.quantity} ceremonies</span><span>${bundle.price.toFixed(2)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>${bundle.price.toFixed(2)}</span></div>
                  <p className="mt-2 text-xs text-muted-foreground">New capacity after purchase: {currentMax + bundle.quantity} active ceremonies.</p>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} disabled={processing} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
                  <Button onClick={handlePurchase} disabled={processing || !PAYMENTS_ENABLED}>
                  {processing ? 'Processing...' : PAYMENTS_ENABLED ? `Pay $${bundle.price}` : 'Payments not connected'}
                </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                  <PartyPopper className="mx-auto mb-3 h-16 w-16 text-primary" />
                </motion.div>
                <h2 className="font-display text-2xl font-bold">Purchase complete!</h2>
                <p className="mt-2 text-muted-foreground">+{purchased} ceremonies added. You can now run up to {currentMax + purchased} active ceremonies.</p>
                <div className="mx-auto mt-4 max-w-xs rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                  Create events as usual — your new limit is applied automatically at checkout.
                </div>
                <div className="mt-6 flex justify-center">
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