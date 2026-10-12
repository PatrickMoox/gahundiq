'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { CheckCircle2, X, Sparkles, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const PLANS = [
  { name: 'Free', price: '$0', period: 'forever', desc: 'Explore the workspace before you commit', features: { events: '1 active ceremony', guests: 'Up to 25 guests', collaborators: '1 collaborator', timeline: 'Up to 5 entries', vendors: 'Up to 5 vendors', seating: false, tasks: 'Up to 10 tasks', budget: 'Up to 5 items', gifts: false, coordinator: false, support: 'Community' } },
  { name: 'Ceremony Pass', price: '$29', period: 'one-time', desc: 'Everything needed for one ceremony', popular: true, features: { events: '1 active ceremony', guests: 'Up to 250 guests', collaborators: '3 collaborators', timeline: true, vendors: true, seating: true, tasks: true, budget: true, gifts: true, coordinator: true, support: 'Priority' } },
  { name: 'Planner', price: '$39', period: '/month', desc: 'For professionals managing ceremonies year-round', features: { events: 'Up to 10 active ceremonies', guests: 'Up to 2,500 guests', collaborators: '5 collaborators', timeline: true, vendors: true, seating: true, tasks: true, budget: true, gifts: true, coordinator: true, support: 'Priority' } },
];

const FEATURE_ROWS = [
  { key: 'events', label: 'Active ceremonies' },
  { key: 'guests', label: 'Guest capacity' },
  { key: 'collaborators', label: 'Collaborators per ceremony' },
  { key: 'timeline', label: 'Timeline Builder' },
  { key: 'vendors', label: 'Vendor Management' },
  { key: 'seating', label: 'Seating Chart Builder' },
  { key: 'tasks', label: 'Task Kanban Board' },
  { key: 'budget', label: 'Budget Tracker' },
  { key: 'gifts', label: 'Digital Gifts' },
  { key: 'coordinator', label: 'Day-of Coordinator' },
  { key: 'support', label: 'Support' },
];

const ADD_ONS = [
  { id: 'ceremonies', name: 'Extra ceremonies', amount: '+5 ceremonies', price: '$5', period: 'one-time bundle', benefit: 'Manage more active events at the same time. The added slots are available across your account after payment.' },
  { id: 'guests', name: 'Guest capacity', amount: '+250 guests', price: '$5', period: 'one-time per event', benefit: 'Keep larger guest lists in one ceremony without splitting them across multiple events.' },
  { id: 'invites', name: 'Invitation broadcasts', amount: '+50 recipients', price: '$5', period: 'per bundle', benefit: 'Record invitation broadcasts for more guest recipients in the selected ceremony.' },
];

export function PricingClient() {
  const router = useRouter();
  const { user } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [selectedAddon, setSelectedAddon] = useState<(typeof ADD_ONS)[number] | null>(null);

  const activePlan = PLANS.find((plan) => plan.name === selectedPlan);
  const basePrice = activePlan?.price === '$0' ? 0 : Number(activePlan?.price?.replace('$', '') ?? 0);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-[1200px] px-4 py-16">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
          <motion.div variants={fadeUp} className="mx-auto mb-12 max-w-2xl text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Simple, Transparent Pricing</h1>
            <p className="mt-3 text-lg text-muted-foreground">A fair price for one ceremony, with room to grow for professional planners.</p>
          </motion.div>

          {/* Pricing Cards */}
          <div className="mb-16 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan: any, i: number) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`rounded-xl border bg-card p-6 ${plan?.popular ? 'border-primary ring-2 ring-primary/20' : 'border-border/50'}`}
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                {plan?.popular && (
                  <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3 w-3" /> Most Popular
                  </span>
                )}
                <h3 className="font-display text-xl font-bold">{plan?.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan?.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">{plan?.price}</span>
                  <span className="text-sm text-muted-foreground">{plan?.period}</span>
                </div>
                <Button
                  className="mt-6 w-full gap-2"
                  variant={plan?.popular ? 'default' : 'outline'}
                  onClick={() => { setSelectedPlan(plan?.name ?? ''); setShowUpgrade(true); }}
                >
                  {plan?.name === 'Free' ? 'Get Started' : 'Upgrade'} <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </div>

          <motion.p variants={fadeUp} className="mx-auto -mt-8 mb-16 max-w-2xl text-center text-sm text-muted-foreground">
            Ceremony Pass is best for one event. Planner is best when you manage two or more ceremonies at the same time. Print orders, payment processing, and optional SMS usage are charged separately so your plan stays predictable.
          </motion.p>

          <motion.div variants={fadeUp} className="mb-16">
            <div className="mb-6 text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight">Add only what you need</h2>
              <p className="mt-2 text-sm text-muted-foreground">Add-ons activate only after confirmed payment. Checkout is not available yet, so selecting one will not change your plan or capacity.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {ADD_ONS.map((addOn) => (
                <div key={addOn.name} className="flex flex-col rounded-xl border border-border/50 bg-card p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <p className="text-sm font-semibold">{addOn.name}</p>
                  <p className="mt-2 font-display text-2xl font-bold">{addOn.amount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{addOn.price} {addOn.period}</p>
                  <p className="mt-3 text-sm text-muted-foreground">{addOn.benefit}</p>
                  <div className="flex-1" />
                  <Button
                    className="mt-2 w-full"
                    variant={addOn.id === 'ceremonies' ? 'default' : 'outline'}
                    onClick={() => {
                      if (!user) {
                        router.push('/auth');
                      } else {
                        setSelectedAddon(addOn);
                      }
                    }}
                  >
                    {addOn.id === 'ceremonies' ? 'Add ceremonies' : addOn.id === 'guests' ? 'Add guest capacity' : 'Add broadcast capacity'}
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Feature Comparison */}
          <motion.div variants={fadeUp}>
            <h2 className="mb-6 text-center font-display text-2xl font-bold tracking-tight">Feature Comparison</h2>
            <div className="overflow-x-auto rounded-xl border border-border/50 bg-card" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Feature</th>
                    {PLANS.map((p: any, i: number) => (
                      <th key={i} className="px-4 py-3 text-center font-medium">{p?.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_ROWS.map((row: any, ri: number) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-muted/20' : ''}>
                      <td className="px-4 py-2.5 text-muted-foreground">{row?.label}</td>
                      {PLANS.map((p: any, pi: number) => {
                        const val = (p?.features as any)?.[row?.key];
                        return (
                          <td key={pi} className="px-4 py-2.5 text-center">
                            {typeof val === 'boolean' ? (
                              val ? <CheckCircle2 className="mx-auto h-4 w-4 text-primary" /> : <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                            ) : (
                              <span className="text-sm">{val}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Collaborator limits are per ceremony; the host does not count toward the limit. Only accepted collaborators count, and joining another host&apos;s ceremony does not use your own ceremony allowance.
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* Upgrade Modal (Stripe placeholder) */}
      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade to {selectedPlan}</DialogTitle>
            <DialogDescription>Review your ceremony options — payments are not connected yet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedPlan !== 'Free' && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span>{selectedPlan} base price</span><span>${basePrice.toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-bold"><span>Payment due today</span><span>$0.00</span></div>
              </div>
            )}
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              {selectedPlan === 'Free' ? (
                <>
                  <p className="text-sm font-medium text-foreground">The Free plan is ready to use</p>
                  <p className="mt-2 text-xs text-muted-foreground">No payment required — start planning right away.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Payments are not connected yet</p>
                  <p className="mt-2 text-xs text-muted-foreground">Upgrading and add-ons will be purchasable here once Stripe is set up. No charge is made today.</p>
                </>
              )}
            </div>
            <Button className="w-full" onClick={() => setShowUpgrade(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={selectedAddon !== null} onOpenChange={(open) => { if (!open) setSelectedAddon(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAddon?.name}</DialogTitle>
            <DialogDescription>{selectedAddon?.benefit}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <p className="font-medium">Payment gateway not connected</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This add-on will not be activated and no payment or entitlement will be recorded. Once secure checkout is available, it will take effect only after payment is confirmed.
              </p>
            </div>
            <Button className="w-full" onClick={() => setSelectedAddon(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}
