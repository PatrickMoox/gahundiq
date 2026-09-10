import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { BookOpen, CircleDollarSign, LifeBuoy, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Help & FAQ — Gahundiq',
  description: 'Getting started with Gahundiq: plans and billing, budgets, multi-currency support, gifts, and common questions.',
};

const FAQS = [
  {
    q: 'Is Gahundiq really free to start?',
    a: 'Yes. The Free plan includes one active ceremony with up to 25 guests, timelines and tasks, at no cost. Right now payment processing is not enabled, so the paid plans (Ceremony Pass and Planner) are not charged — they are shown for when billing goes live.',
  },
  {
    q: 'Can guests RSVP without creating an account?',
    a: 'Yes. You send each guest an invitation link and they respond right from the link — no account needed.',
  },
  {
    q: 'Can someone else help me plan?',
    a: 'Yes. Add collaborators to an event and they get their own access. Vendors can also get a focused pass with just their schedule and contact details.',
  },
  {
    q: 'How do gift pledges work?',
    a: 'Share your event gift page. Guests pick a gift type and amount and their pledge is recorded as pending. Once payment processing is enabled, pledges will be confirmed through a payment provider.',
  },
  {
    q: 'What happens to my data if I delete an event?',
    a: 'Deleting an event removes its guests, tasks, budget, vendors, and gift records. This cannot be undone, so we ask you to confirm before deleting.',
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="aurora relative overflow-hidden border-b border-border/50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Help &amp; FAQ</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Quick answers about plans, budgets, currencies, and gifts. Can&apos;t find what you need?{' '}
            <a href="mailto:support@gahundiq.com" className="font-medium text-primary hover:underline">Email us</a>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: LifeBuoy, label: 'Getting started' },
            { icon: BookOpen, label: 'Budget guide' },
            { icon: CircleDollarSign, label: 'Plans & billing' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm font-medium">
              <item.icon className="h-4 w-4 text-primary" />
              {item.label}
            </div>
          ))}
        </div>

        <div className="mt-10 space-y-10">
          <section id="getting-started" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Getting started</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Sign in or create a free account.</li>
              <li>Press <span className="font-medium text-foreground">Create event</span> in the top menu and enter the title, date, venue, and guest count.</li>
              <li>Add guests and their emails — each receives an invitation link.</li>
              <li>Build your timeline, vendors, budget, and seating in the event hub.</li>
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              Full dashboard tours and event-management details are in the{' '}
              <Link href="/about" className="font-medium text-primary hover:underline">feature overview</Link>.
            </p>
          </section>

          <section id="budget-guide" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Budget guide</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The budget tab tracks every cost of your ceremony. Each item has an <span className="font-medium text-foreground">estimated</span> cost,
              an <span className="font-medium text-foreground">actual</span> cost, and a <span className="font-medium text-foreground">deposit</span> paid.
              Gahundiq totals these into your budget, spend, and remaining balance, and you can export everything to CSV.
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Add one line per expense (venue, catering, photographer) and update actuals as bills arrive.</li>
              <li className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Record deposits so you always know what remains to be paid.</li>
              <li className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Use the charts to see which category is consuming the most of your budget.</li>
            </ul>
          </section>
          <section id="currency" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Multi-currency support</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Gahundiq supports 16 currencies including USD, EUR, GBP, and the major African currencies (RWF, KES, UGX, TZS, NGN, GHS, ZAR, XOF, XAF, ETB).
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> When you create an event, we auto-detect a sensible default from your browser region — you can change it in the wizard.</li>
              <li className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> The currency is stored on the <span className="font-medium text-foreground">event</span>, so every collaborator and guest sees the same amounts.</li>
              <li className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Budgets, vendors, and gifts all render in the event currency automatically.</li>
              <li className="flex items-start gap-2"><CircleDollarSign className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Subscription prices stay in USD for now; multi-currency checkout via Flutterwave is planned.</li>
            </ul>
          </section>

          <section id="gifts" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Gifts &amp; pledges</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every ceremony gets its own public gift page. Guests choose a gift type (cash, honeymoon fund, charity, or experience),
              pick an amount in the event currency, and their pledge is recorded. Guest pledges currently stay pending until online payment
              processing is enabled — the host sees every pledge instantly in the event hub.
            </p>
          </section>

          <section id="faq" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Common questions</h2>
            <div className="mt-4 space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="group rounded-xl border border-border/60 bg-card/60 p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold leading-snug">
                    <span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90">›</span>
                    {f.q}
                  </summary>
                  <p className="mt-2 pl-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}