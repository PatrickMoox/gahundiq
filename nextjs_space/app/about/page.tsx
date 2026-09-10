import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { CheckCircle2, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About — Gahundiq',
  description: 'Gahundiq is the all-in-one command center for planning, coordinating, and celebrating weddings, birthdays, and corporate events.',
};

const PILLARS = [
  { title: 'Everything in one place', desc: 'Invitations, RSVPs, guest lists, seating, vendors, tasks, and a live day-of run-sheet — no more juggling spreadsheets, papers, and apps.' },
  { title: 'Event currency, not viewer currency', desc: 'Set your ceremony in its own currency (USD, RWF, KES, NGN and more) so every guest and collaborator sees the same figures.' },
  { title: 'Built for the whole team', desc: 'Hosts, wedding planners, and vendors each get the right view — including a vendor pass that shares just the schedule they need.' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="aurora relative overflow-hidden border-b border-border/50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Planning events should feel <span className="text-gradient">calm</span>, not chaotic
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Gahundiq is a ceremony planning &amp; coordination hub. We help hosts turn a mountain of details — guests, vendors, budgets, gifts — into one clear plan.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Who uses Gahundiq</h2>
            <ul className="mt-4 space-y-3">
              {[
                'Hosts planning a wedding, birthday, corporate event, or memorial.',
                'Wedding planners and coordinators who need a live run-sheet on the day.',
                'Vendors (caterers, DJs, photographers) who receive a focused pass instead of a full event dump.',
                'Guests who RSVP online and can send a gift straight from a beautiful gift page.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">What makes us different</h2>
            <div className="mt-4 space-y-4">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-2xl border border-border/60 bg-card/60 p-5">
                  <h3 className="font-display font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="contact" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold tracking-tight">Contact us</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Questions about plans, billing, or an event? Email us at{' '}
              <a href="mailto:support@gahundiq.com" className="font-medium text-primary hover:underline">support@gahundiq.com</a>{' '}
              and a real person will reply. For quick answers, browse the{' '}
              <Link href="/help" className="font-medium text-primary hover:underline">help center</Link> first.
            </p>
            <a
              href="mailto:support@gahundiq.com"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Mail className="h-4 w-4" /> Email us
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}