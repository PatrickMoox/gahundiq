'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useBudget } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { BudgetItem, EventData } from '@/types/firestore';
import { formatMoney, currencySymbol } from '@/lib/currency';
import { Plus, DollarSign, TrendingUp, TrendingDown, PieChart, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const BudgetCharts = dynamic(() => import('./budget-charts'), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" /> });

export function BudgetTab({ eventId, event }: { eventId: string; event: EventData | null }) {
  const currency = event?.currency;
  const { items, addItem, deleteItem } = useBudget(eventId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0 });

  const totals = useMemo(() => {
    const est = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.estimatedCost ?? 0), 0);
    const act = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.actualCost ?? 0), 0);
    const dep = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.depositPaid ?? 0), 0);
    return { estimated: est, actual: act, deposited: dep, remaining: est - act, balance: act - dep };
  }, [items]);

  const handleAdd = () => {
    if (!form?.name?.trim()) return;
    addItem?.({ ...form, eventId, balanceDue: (form?.actualCost ?? 0) - (form?.depositPaid ?? 0), isPaid: false, notes: '' });
    setForm({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0 });
    setShowForm(false);
  };

  const exportCSV = () => {
    const header = 'Category,Item,Estimated,Actual,Deposit,Balance Due\n';
    const rows = (items ?? []).map((i: BudgetItem) =>
      `${i?.category},${i?.name},${i?.estimatedCost},${i?.actualCost},${i?.depositPaid},${(i?.actualCost ?? 0) - (i?.depositPaid ?? 0)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'budget.csv';
    a.click();
    toast.success('CSV exported!');
  };

  const pctUsed = (totals?.estimated ?? 1) > 0 ? Math.round(((totals?.actual ?? 0) / (totals?.estimated ?? 1)) * 100) : 0;

  return (
    <div>
      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Budget', value: formatMoney(totals?.estimated, currency), icon: DollarSign, color: 'text-primary' },
          { label: 'Total Spent', value: formatMoney(totals?.actual, currency), icon: TrendingDown, color: 'text-destructive' },
          { label: 'Remaining', value: formatMoney(totals?.remaining, currency), icon: TrendingUp, color: 'text-emerald-500' },
          { label: '% Used', value: `${pctUsed}%`, icon: PieChart, color: pctUsed > 90 ? 'text-destructive' : 'text-primary' },
        ].map((s: any, i: number) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s?.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{s?.label}</p>
                <p className="font-display text-xl font-bold">{s?.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <BudgetCharts items={items ?? []} />

      {/* Toolbar */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Budget Items</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1"><Download className="h-3.5 w-3.5" /> CSV</Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Category</th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Estimated</th>
            <th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Deposit</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {(items ?? []).map((item: BudgetItem, idx: number) => {
              const balance = (item?.actualCost ?? 0) - (item?.depositPaid ?? 0);
              return (
                <tr key={item?.id} className={`border-b border-border/30 ${idx % 2 === 0 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{item?.category}</Badge></td>
                  <td className="px-3 py-2 font-medium">{item?.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(item?.estimatedCost, currency)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(item?.actualCost, currency)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatMoney(item?.depositPaid, currency)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${balance > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {formatMoney(balance, currency)}
                  </td>
                  <td className="px-3 py-2"><button onClick={() => deleteItem?.(item?.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Budget Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Category</Label><Input value={form?.category ?? ''} onChange={(e: any) => setForm({ ...form, category: e?.target?.value ?? '' })} className="mt-1" placeholder="Venue, Catering..." /></div>
            <div><Label>Item Name</Label><Input value={form?.name ?? ''} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label>Estimated</Label><Input type="number" value={form?.estimatedCost ?? 0} onChange={(e: any) => setForm({ ...form, estimatedCost: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
              <div><Label>Actual</Label><Input type="number" value={form?.actualCost ?? 0} onChange={(e: any) => setForm({ ...form, actualCost: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
              <div><Label>Deposit</Label><Input type="number" value={form?.depositPaid ?? 0} onChange={(e: any) => setForm({ ...form, depositPaid: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Add Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
