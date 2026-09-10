'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSessions, type SessionView } from '@/lib/hooks/use-sessions';
import { SESSION_POLICY, fmtDuration } from '@/lib/session-policy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { LogOut, Loader2, Monitor, ShieldCheck, Smartphone, Tablet, Tv } from 'lucide-react';

function deviceIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes('android') || lower.includes('ios') || lower.includes('iphone')) return Smartphone;
  if (lower.includes('ipad') || lower.includes('tablet')) return Tablet;
  if (lower.includes('linux') || lower.includes('windows')) return Tv;
  return Monitor;
}

/**
 * Session governance panel — "where am I signed in?" card with per-device
 * revocation and a sign-out-everywhere-else action. Configuration comes from
 * SESSION_POLICY (lib/session-policy.ts); enforcement lives in AuthProvider.
 */
export function SessionGovernancePanel() {
  const { user } = useAuth();
  const { sessions, loading, revoke, revokeOthers } = useSessions(user?.uid);
  const [now, setNow] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const activeCount = sessions.filter((s) => s.active && !s.revoked).length;

  const relative = (t?: Date | null) => {
    if (!t || now == null) return null;
    const diff = Math.max(0, now - t.getTime());
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    return `${Math.floor(diff / 3_600_000)} hr ago`;
  };

  const handleRevoke = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await revoke(deviceId);
      toast.success('Device signed out.');
    } catch {
      toast.error('Could not revoke that session.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (confirmOthers) {
      setBusyId('all');
      try {
        await revokeOthers();
        toast.success('Signed out all other devices.');
        setConfirmOthers(false);
      } catch {
        toast.error('Could not sign out other devices.');
      } finally {
        setBusyId(null);
      }
      return;
    }
    setConfirmOthers(true);
    setTimeout(() => setConfirmOthers(false), 5000);
    toast.info('This will sign out every other device. Click again to confirm.');
  };

  const otherCount = Math.max(0, sessions.filter((s) => !s.current && s.active && !s.revoked).length);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
      className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" /> Session governance
        </h3>
        {loading
          ? <Badge variant="outline">Loading…</Badge>
          : <Badge variant={activeCount > 1 ? 'secondary' : 'default'}>{activeCount} active</Badge>}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Signed-in devices. Idle for {fmtDuration(SESSION_POLICY.idleTimeoutMs)} signs you out · sessions renew every{' '}
        {fmtDuration(SESSION_POLICY.absoluteLifetimeMs)} · max {SESSION_POLICY.maxActiveSessions} devices.
      </p>

      {!loading && sessions.length === 0 ? (
        <p className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          No session records yet — sign out and back in to start tracking this device.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {sessions.map((s: SessionView) => {
            const Icon = deviceIcon(s.deviceLabel);
            return (
              <li key={s.deviceId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{s.deviceLabel}</span>
                      {s.current && <Badge variant="secondary">This device</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.revoked ? 'Signed out' : s.active ? `Active${relative(s.lastActiveAt) ? ` · ${relative(s.lastActiveAt)}` : ''}` : 'Session ended'}
                    </p>
                  </div>
                </div>
                {!s.current && s.active && (
                  <Button variant="ghost" size="sm" className="gap-1 text-destructive-foreground"
                    onClick={() => handleRevoke(s.deviceId)} disabled={busyId != null}>
                    {busyId === s.deviceId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant={confirmOthers ? 'destructive' : 'outline'} size="sm" loading={busyId === 'all'}
          onClick={handleRevokeOthers} disabled={(busyId != null && busyId !== 'all') || otherCount === 0}>
          <LogOut className="h-3.5 w-3.5" />
          {confirmOthers ? 'Confirm — sign out all others' : 'Sign out other devices'}
        </Button>
        {otherCount === 0 && <span className="text-xs text-muted-foreground">No other active devices.</span>}
      </div>
    </motion.div>
  );
}