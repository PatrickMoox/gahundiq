import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Terms of Service — Gahundiq',
  description: 'The terms that govern your use of Gahundiq.',
};

const SECTIONS = [
  {
    h: '1. Your agreement',
    body: 'By creating an account or using Gahundiq, you agree to these terms. If you use Gahundiq on behalf of an organization, you confirm you have authority to accept these terms for it.',
  },
  {
    h: '2. The service',
    body: 'Gahundiq helps you plan, coordinate, and share events: invitations and RSVPs, guest lists, seating, vendors, tasks, budgets, and gift pages. We provide the service as-is and may change or remove features over time, with notice where practical.',
  },
  {
    h: '3. Your account',
    body: 'You are responsible for keeping your login secure and for everything done from your account. You must provide accurate information and must not create accounts to misuse the service. You may delete an event or ask to delete your account at any time.',
  },
  {
    h: '4. Plans and payments',
    body: 'The Free plan is free. Paid plans and add-ons are described on the pricing page. Payment processing is not yet enabled; when it launches, purchases will be fulfilled through a third-party processor, prices will be charged in the currency shown at checkout, and you will receive a receipt. Cancellation or refund policies, where any apply, will be published before billing goes live.',
  },
  {
    h: '5. Acceptable use',
    body: 'Do not use Gahundiq to break the law, send spam, harass people, collect personal data without consent, disrupt the service, or misrepresent who you are. We may suspend accounts that violate these rules.',
  },
  {
    h: '6. Your content',
    body: 'You keep ownership of the content you enter into your events. You grant us a limited license to store and process that content to provide the service, and to share it with the collaborators, guests, and vendors you choose.',
  },
  {
    h: '7. Intellectual property',
    body: 'The Gahundiq name, logo (the Gahundiq Q mark), and software are our property or our licensors\u2019. Nothing in these terms gives you ownership of them.',
  },
  {
    h: '8. Our responsibilities',
    body: 'We use reasonable care to keep the service available and your data safe. We do not guarantee uninterrupted service and are not liable for indirect or consequential losses arising from your use of Gahundiq, to the fullest extent permitted by law.',
  },
  {
    h: '9. Changes to these terms',
    body: 'We may update these terms as the service evolves. Material changes will be highlighted on this page and by email where we have your address. Continued use after changes take effect means you accept the new terms.',
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="aurora relative overflow-hidden border-b border-border/50">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: September 2026</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm leading-relaxed text-muted-foreground">
          These terms cover your use of Gahundiq. Questions? Email{' '}
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