'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, MailCheck, Lock, User, Heart, Calendar, Gift, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ReviewBadge } from '@/components/review-badge';
import { toast } from 'sonner';

const friendlyAuthError = (err: any): string => {
  const code = String(err?.code ?? '').replace('auth/', '');
  const messages: Record<string, string> = {
    'invalid-email': 'That email address looks invalid.',
    'user-not-found': 'No account found with that email.',
    'too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'network-request-failed': 'Network error — check your connection and try again.',
    'invalid-credential': 'Incorrect email or password.',
    'wrong-password': 'Incorrect email or password.',
    'email-already-in-use': 'An account with that email already exists.',
    'weak-password': 'Password must be at least 6 characters.',
    // Google OAuth failure modes
    'account-exists-with-different-credential': 'That email already has a password account. Sign in with your password instead, or use that account to log in.',
    'popup-closed-by-user': 'Google sign-in was cancelled — the popup was closed before finishing.',
    'cancelled-popup-request': 'Google sign-in was cancelled. Please allow popups for this site and try again.',
    'operation-not-allowed': 'Google sign-in is not enabled for this environment yet.',
  };
  return messages[code] ?? err?.message ?? 'Something went wrong. Please try again.';
};

export function AuthClient() {
  const {
    signIn, signUp, signInWithGoogle, signOut, resetPassword,
    resendVerificationEmail, checkVerification,
    user, verificationEmail,
  } = useAuth();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  // Single source of navigation: whenever an activated (verified) identity
  // exists, the app takes over. Unverified users stay here on the gate panel.
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn?.(email, password);
        // Verified accounts activate asynchronously and the effect above
        // navigates. Unverified ones land on the verification panel.
      } else {
        await signUp?.(email, password, name);
        toast.success('Account created! Check your inbox to verify your email.');
      }
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle?.();
      toast.success('Signed in with Google!');
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword?.(email);
      setResetSent(true);
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail?.();
      toast.success('Verification email sent again.');
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    setChecking(true);
    try {
      const verified = await checkVerification?.();
      if (verified) {
        toast.success('Email verified — welcome!');
      } else {
        toast.info('Not verified yet — click the link in your email first.');
      }
    } catch (err: any) {
      toast.error(friendlyAuthError(err));
    } finally {
      setChecking(false);
    }
  };

  const handleUseDifferentAccount = async () => {
    await signOut?.();
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand panel (desktop) ───────────────────────────────── */}
      <div className="aurora relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary/15 via-transparent to-secondary/15 p-12 lg:flex">
        <div className="aurora-orb orb-a -left-20 top-1/4 h-96 w-96 bg-primary/25" />
        <div className="aurora-orb orb-b bottom-0 right-0 h-80 w-80 bg-secondary/25" />

        <Link href="/" className="relative z-10 flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">Gahundiq<span className="text-primary">.</span></span>
        </Link>

        <div className="relative z-10 max-w-md">
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="font-display text-4xl font-bold leading-tight tracking-tight">
            Every detail, <span className="text-gradient">beautifully</span> orchestrated.
          </motion.h2>
          <p className="mt-4 text-muted-foreground">
            Invitations, RSVPs, seating, vendors, and the day-of run-sheet — one hub for your most important celebration.
          </p>

          <div className="mt-10 space-y-3">
            {[
              { icon: Heart, text: 'Live RSVP tracking as guests respond' },
              { icon: Calendar, text: 'Seating, vendors & timeline in sync' },
              { icon: Gift, text: 'Digital gifts & honeymoon funds built in' },
            ].map((item: any, i: number) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm">{item?.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex justify-center">
          <ReviewBadge />
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <div className="relative flex flex-col">
        <Link href="/" className="absolute left-6 top-6 z-10 flex items-center gap-2 lg:hidden">
          <Logo className="h-7 w-7" />
          <span className="font-display font-bold tracking-tight">Gahundiq<span className="text-primary">.</span></span>
        </Link>

        <div className="flex flex-1 items-center justify-center px-4 py-16">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="glass-strong w-full max-w-md rounded-3xl p-8 shadow-[var(--shadow-lg)]">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-[var(--shadow-glow)]">
                <Logo className="h-8 w-8" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {verificationEmail ? 'Verify your email' : forgotMode ? 'Reset your password' : isLogin ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {verificationEmail
                  ? 'One quick step before you continue'
                  : forgotMode
                    ? "We'll email you a secure reset link"
                    : isLogin ? 'Sign in to your ceremony workspace' : 'Start planning your perfect event'}
              </p>
            </div>

            {verificationEmail ? (
              /* ── Email verification gate (password accounts) ─────────── */
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-[var(--shadow-glow)]">
                  <MailCheck className="h-7 w-7 text-white" />
                </div>
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to{' '}
                  <span className="font-medium text-foreground">{verificationEmail}</span>.
                  Click it to activate your account — this page updates automatically once you do.
                </p>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  The link expires in 1 hour. Didn&apos;t get it? Check your spam folder or resend it below.
                </div>
                <div className="grid gap-2">
                  <Button className="rounded-full" onClick={handleCheckVerification} disabled={checking}>
                    {checking ? 'Checking…' : "I've verified — Continue"}
                  </Button>
                  <Button variant="outline" className="rounded-full" onClick={handleResend} disabled={resending}>
                    {resending ? 'Sending…' : 'Resend verification email'}
                  </Button>
                  <Button variant="ghost" className="rounded-full" onClick={handleUseDifferentAccount}>
                    Use a different account
                  </Button>
                </div>
              </div>
            ) : forgotMode ? (
              /* ── Self-service password reset ─────────────────────────── */
              resetSent ? (
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <MailCheck className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We sent a password-reset link to{' '}
                    <span className="font-medium text-foreground">{email}</span>. Follow it to set a
                    new password.
                  </p>
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                    Security: resetting your password signs you out on every device —{' '}
                    all other sessions are ended the moment you set the new password.
                    You&apos;ll sign back in with it here.
                  </div>
                  <Button variant="outline" className="w-full rounded-full" onClick={() => { setForgotMode(false); setResetSent(false); }}>
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter the email on your account and we&apos;ll send you a secure link to choose a new password.
                  </p>
                  <div>
                    <Label htmlFor="reset-email">Email</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} className="rounded-full pl-10" required />
                    </div>
                  </div>
                  <Button type="submit" className="btn-shimmer w-full rounded-full" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </Button>
                  <button type="button" onClick={() => { setForgotMode(false); setResetSent(false); }} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-3 w-3" /> Back to sign in
                  </button>
                </form>
              )
            ) : (
              <>
                <Button variant="outline" className="mb-4 w-full gap-2 rounded-full" onClick={handleGoogle} disabled={loading}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg> Continue with Google
                </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-2 text-muted-foreground">Or</span></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="name" placeholder="Sarah Mitchell" value={name} onChange={(e: any) => setName(e?.target?.value ?? '')} className="rounded-full pl-10" required />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} className="rounded-full pl-10" required />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {isLogin && (
                    <button type="button" onClick={() => { setForgotMode(true); setResetSent(false); }} className="text-xs font-medium text-primary hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} className="rounded-full pl-10" required />
                </div>
              </div>
              <Button type="submit" className="btn-shimmer w-full rounded-full" disabled={loading}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

                <p className="mt-5 text-center text-sm text-muted-foreground">
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-primary hover:underline">
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}