import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — Gahundiq',
  description: 'How Gahundiq collects, uses, and protects your personal data.',
};

const SECTIONS = [
  {
    h: '1. Data we collect',
    body: 'When you use Gahundiq we collect the data you give us: your name and email when you sign in, the events you create, and the information you enter about guests, vendors, budgets, tasks, and gifts. Guests who respond to an invitation or send a gift provide their own name, email, and gift details, which are shown only to the event host.',
  },
  {
    h: '2. How we use your data',
    body: 'We use your data to run the service: to keep your events accurate and in sync, to send invitations and notifications you trigger, to enforce plan limits, and to show you the reports and dashboards you ask for. We do not sell your personal data to anyone.',
  },
  {
    h: '3. Authentication & storage',
    body: 'Accounts are authenticated through Firebase Authentication. Event data, guest lists, budgets, and gifts are stored in Google Cloud Firestore, which encrypts data at rest and in transit. Your browser region is read to suggest a default currency; it is not stored.',
  },
  {
    h: '4. Payments',
    body: 'Online payments are not currently processed. When billing goes live, payments will be handled by a third-party processor (Flutterwave) under their privacy terms, and we will only store the transaction reference and outcome, never your card details.',
  },
  {
    h: '5. Cookies & analytics',
    body: 'We keep a preference cookie for your theme (light/dark) and use privacy-respecting analytics to understand aggregate usage, such as which pages are visited and how many users we have. We do not use cross-site advertising trackers.',
  },
  {
    h: '6. Sharing',
    body: 'Event data is shared only with people you choose: collaborators you add, and guests or vendors to whom you send an invitation or vendor pass. Public gift pages are readable by anyone who has the link, but guests cannot see other guests unless you send them an invitation.',
  },
  {
    h: '7. Data retention & deletion',
    body: 'You can delete an event at any time, which removes its guests, tasks, budget, vendors, and gifts. You can ask us to delete your account and all associated data by emailing the address below, and we will do so within 30 days.',
  },
  {
    h: '8. Your rights',
    body: 'Depending on where you live (including under the GDPR and similar laws), you may have rights to access, correct, export, or delete your personal data. Email us and we will help.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="aurora relative overflow-hidden border-b border-border/50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: September 2026</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This policy explains what Gahundiq collects, why, and the choices you have. If you have questions, email{' '}
          <a href="mailto:support@gahundiq.com" className="font-medium text-primary hover:underline">support@gahundiq.com</a>.
        </p>
        <div className="mt-8 space-y-7">
          {SECTIONS.map((s) => (
            <div key={s.h}>
              <h2 className="font-display text-lg font-bold tracking-tight">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}