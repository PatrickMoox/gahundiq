'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/navbar';
import { ReviewBadge } from '@/components/review-badge';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import {
  Calendar, Users, Layout, ClipboardList, DollarSign, Gift,
  Clock, Sparkles, ArrowRight, CheckCircle2, Zap, Heart, Mail
} from 'lucide-react';

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

const FEATURES = [
  { icon: Clock, title: 'Day-of Coordinator', desc: 'A live, mobile-first run-sheet with crew contacts, countdown timers, and real-time progress — so the day flows without a printed binder.', span: 'md:col-span-2', tint: 'bg-primary/10 text-primary' },
  { icon: Layout, title: 'Seating Chart Builder', desc: 'Drag-and-drop tables, dietary badges, and VIP tags on an interactive canvas.', span: '', tint: 'bg-secondary/15 text-secondary' },
  { icon: Users, title: 'Guest Manager', desc: 'RSVPs, dietary needs, and invite delivery — tracked live as guests respond.', span: '', tint: 'bg-violet-500/10 text-violet-500' },
  { icon: Mail, title: 'Invitation Broadcast', desc: 'Upload your own designed invitation and deliver it to every guest with one tap.', span: 'md:col-span-2', tint: 'bg-emerald-500/10 text-emerald-500' },
  { icon: ClipboardList, title: 'Task Kanban', desc: 'Milestone columns from 12 months out to the after-party.', span: '', tint: 'bg-amber-500/10 text-amber-500' },
  { icon: DollarSign, title: 'Budget Tracker', desc: 'Visual spend charts, payment alerts, and CSV exports.', span: '', tint: 'bg-sky-500/10 text-sky-500' },
  { icon: Gift, title: 'Digital Gifts', desc: 'Cash gifts, honeymoon funds, and charity donations from your gift page.', span: '', tint: 'bg-rose-500/10 text-rose-500' },
];

const MARQUEE = ['Digital Invitations', 'RSVP Tracking', 'Seating Charts', 'Day-of Coordination', 'Vendor Passes', 'Budget Analytics', 'Task Kanban', 'Cash Gifts', 'Guest Manager', 'Live Timeline'];

const STEPS = [
  { num: '01', title: 'Create Your Event', desc: 'Set up your wedding, birthday, or corporate event in under a minute — tier, guest count, and style included.' },
  { num: '02', title: 'Plan Every Detail', desc: 'Build the timeline, assign vendors, arrange seating, and watch RSVPs land in real time.' },
  { num: '03', title: 'Execute Flawlessly', desc: 'Open the live coordinator on event day: run-sheet, crew contacts, and countdown on one screen.' },
];

const PLANS = [
  { name: 'Free', price: '$0', period: 'forever', features: ['1 active ceremony', '25 guests', 'Timeline & tasks'], popular: false },
  { name: 'Ceremony Pass', price: '$29', period: 'one-time', features: ['250 guests', '500 invites', 'Every planning tool'], popular: true },
  { name: 'Planner', price: '$39', period: '/month', features: ['10 active ceremonies', '2,500 guests', 'Priority support'], popular: false },
];

export function LandingClient() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="aurora relative overflow-hidden">
        <div className="aurora-orb orb-a -top-32 left-[8%] h-[420px] w-[420px] bg-primary/25" />
        <div className="aurora-orb orb-b top-10 right-[5%] h-[360px] w-[360px] bg-secondary/25" />
        <div className="aurora-orb orb-c bottom-0 left-[40%] h-[300px] w-[300px] bg-violet-500/20" />

        <div className="relative mx-auto max-w-[1200px] px-4 pb-28 pt-24 md:pb-36 md:pt-32">
          <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.12 } } }} className="mx-auto max-w-3xl text-center">
            <motion.div variants={fadeUp} className="glass mb-6 inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-sm text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
              </span>
              Ceremony Planning &amp; Coordination Hub
            </motion.div>

            <motion.h1 variants={fadeUp} className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
              Your ceremony,
              <br />
              <span className="text-gradient">beautifully</span> under control.
            </motion.h1>

            <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              From digital invitations to day-of coordination — one command center for hosts, planners, and vendors.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/auth">
                <Button size="lg" className="btn-shimmer gap-2 rounded-full px-8 text-base shadow-[var(--shadow-glow)]">
                  Start Planning Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="ghost" className="glass rounded-full px-8 text-base">See Pricing</Button>
              </Link>
            </motion.div>

            <ReviewBadge className="mt-8" />
          </motion.div>

          {/* Floating glass mockups (desktop) */}
          <div className="pointer-events-none absolute inset-x-0 top-24 hidden lg:block">
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} style={{ '--tilt': '-6deg' } as React.CSSProperties} className="float-a glass-strong absolute left-[3%] top-10 w-56 rounded-2xl p-4 shadow-[var(--shadow-lg)]">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Heart className="h-3.5 w-3.5 text-secondary" /> RSVP · Aisha &amp; Sam</div>
              <p className="mt-2 text-sm font-medium">Confirmed attendance</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-4/5 rounded-full bg-gradient-to-r from-primary to-secondary" /></div>
              <p className="mt-1.5 text-xs text-muted-foreground">186 of 250 guests</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8 }} style={{ '--tilt': '5deg' } as React.CSSProperties} className="float-b glass-strong absolute right-[4%] top-24 w-52 rounded-2xl p-4 shadow-[var(--shadow-lg)]">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gift className="h-3.5 w-3.5 text-rose-500" /> Gift received</div>
              <p className="mt-2 font-display text-2xl font-bold text-gradient">$250.00</p>
              <p className="mt-1 text-xs text-muted-foreground">“Congratulations!”</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8 }} style={{ '--tilt': '-3deg' } as React.CSSProperties} className="float-c glass-strong absolute bottom-[-40px] right-[22%] w-60 rounded-2xl p-4 shadow-[var(--shadow-lg)]">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5 text-primary" /> Next up · Ceremony day</div>
              <p className="mt-2 text-sm font-medium">Vendor arrival · 14:00</p>
              <p className="text-xs text-muted-foreground">Photography crew × 4 · en route</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Marquee ribbon ────────────────────────────────────────── */}
      <section className="glass border-x-0 border-y py-4">
        <div className="marquee">
          <div className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={i} aria-hidden={i >= MARQUEE.length} className="flex items-center gap-3 whitespace-nowrap text-sm font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary/70" /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bento features ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-4 py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="mx-auto mb-14 max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Everything included</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">
            One hub for the <span className="text-gradient">whole ceremony</span>
          </h2>
          <p className="mt-4 text-muted-foreground">Every tool you need, from the save-the-date to the last dance.</p>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={{ visible: { transition: { staggerChildren: 0.08 } } }} className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f: any) => (
            <motion.div key={f?.title} variants={fadeUp} className={`spotlight group rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${f?.span}`}>
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${f?.tint}`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold tracking-tight">{f?.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f?.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[900px] px-4 py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="mb-14 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">How it works</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">Three steps to <span className="text-gradient">flawless</span></h2>
        </motion.div>

        <div className="relative">
          <div className="absolute bottom-8 left-[27px] top-2 w-px bg-gradient-to-b from-primary via-secondary to-transparent md:left-1/2" />
          {STEPS.map((step: any, i: number) => (
            <motion.div key={step?.num} initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }} className={`relative mb-10 flex gap-6 md:w-1/2 ${i % 2 === 0 ? 'md:pr-12' : 'md:ml-auto md:flex-row-reverse md:pl-12 md:text-right'}`}>
              <div className="glass-strong relative z-10 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold shadow-[var(--shadow-md)]">
                <span className="text-gradient">{step?.num}</span>
              </div>
              <div className="pt-1">
                <h3 className="font-display text-xl font-semibold tracking-tight">{step?.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step?.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Pricing teaser ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 py-24">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="mb-12 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">Simple, <span className="text-gradient">honest</span> plans</h2>
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Compare every feature <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="grid gap-5 md:grid-cols-3">
          {PLANS.map((plan: any) => (
            <motion.div key={plan?.name} variants={fadeUp} className={`border-glow relative rounded-2xl border bg-card/70 p-6 backdrop-blur-sm transition-transform hover:-translate-y-1 ${plan?.popular ? 'border-primary/50 shadow-[var(--shadow-glow)] md:-translate-y-2' : 'border-border/60'}`}>
              {plan?.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-secondary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  Most Popular
                </span>
              )}
              <h3 className="font-display text-lg font-bold">{plan?.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight">{plan?.price}</span>
                <span className="text-sm text-muted-foreground">{plan?.period}</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                {(plan?.features ?? []).map((f: string, j: number) => (
                  <li key={j} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" /> {f}</li>
                ))}
              </ul>
              <Link href="/auth">
                <Button className={`mt-6 w-full rounded-full ${plan?.popular ? 'btn-shimmer' : ''}`} variant={plan?.popular ? 'default' : 'outline'}>
                  {plan?.popular ? 'Get Started' : 'Start Free'}
                </Button>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-4 pb-24">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }} className="aurora relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-600 to-secondary p-12 text-center text-white shadow-[var(--shadow-glow)] md:p-16">
          <div className="aurora-orb orb-a -left-10 -top-10 h-64 w-64 bg-white/15" />
          <div className="aurora-orb orb-b -bottom-16 -right-10 h-72 w-72 bg-white/10" />
          <div className="relative z-10">
            <Zap className="mx-auto mb-4 h-10 w-10" />
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Ready to plan your perfect event?</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/85">Create your first ceremony free — timelines, guest lists, seating, and more.</p>
            <Link href="/auth">
              <Button size="lg" className="btn-shimmer mt-8 gap-2 rounded-full bg-white px-8 text-primary hover:bg-white/90">
                Start Planning <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="text-sm font-semibold">Gahundiq<span className="text-primary">.</span></span>
          </div>
          <div className="flex gap-6">
            <Link href="/pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
            <Link href="/auth" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Sign In</Link>
            <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Gahundiq. Crafted with care.</p>
        </div>
      </footer>
    </div>
  );
}