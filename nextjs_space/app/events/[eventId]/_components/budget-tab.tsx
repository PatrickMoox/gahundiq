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
import { formatMoney } from '@/lib/currency';
import { csvEscape } from '@/lib/utils';
import { Plus, DollarSign, TrendingUp, TrendingDown, PieChart, Download, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const BudgetCharts = dynamic(() => import('./budget-charts'), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" /> });

export function BudgetTab({ eventId, event }: { eventId: string; event: EventData | null }) {
  const currency = event?.currency;
  const { items, addItem, updateItem, deleteItem } = useBudget(eventId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false });

  const totals = useMemo(() => {
    const est = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.estimatedCost ?? 0), 0);
    const act = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.actualCost ?? 0), 0);
    return { estimated: est, actual: act, remaining: est - act };
  }, [items]);

  const resetForm = () => {
    setForm({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false });
    setEditingId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    setForm({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (item: BudgetItem) => {
    setForm({
      category: item.category ?? '',
      name: item.name ?? '',
      estimatedCost: Number(item.estimatedCost) || 0,
      actualCost: Number(item.actualCost) || 0,
      depositPaid: Number(item.depositPaid) || 0,
      isPaid: Boolean(item.isPaid),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    const amounts = [form.estimatedCost, form.actualCost, form.depositPaid];
    if (!form.name.trim() || amounts.some((amount) => !Number.isFinite(amount) || amount < 0) || form.depositPaid > form.actualCost) {
      toast.error('Enter an item name and valid non-negative amounts. Deposit cannot exceed actual cost.');
      return;
    }
    const data = {
      ...form,
      balanceDue: form.isPaid ? 0 : form.actualCost - form.depositPaid,
    };
    try {
      if (editingId) {
        await updateItem?.(editingId, data);
      } else {
        await addItem?.({ ...data, eventId, notes: '' });
      }
      resetForm();
    } catch (error: any) {
      toast.error(error?.message ?? `Could not ${editingId ? 'update' : 'add'} the budget item.`);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    try {
      await deleteItem?.(id);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not delete the budget item.');
    }
  };

  const exportCSV = () => {
    const header = 'Category,Item,Estimated,Actual,Deposit,Balance Due,Payment Status\n';
    // csvEscape keeps names with commas/quotes intact and neutralizes
    // spreadsheet formula injection — see lib/utils.ts.
    const rows = (items ?? []).map((i: BudgetItem) =>
      [i?.category, i?.name, i?.estimatedCost, i?.actualCost, i?.depositPaid, i?.isPaid ? 0 : (i?.actualCost ?? 0) - (i?.depositPaid ?? 0), i?.isPaid ? 'Paid' : 'Unpaid'].map(csvEscape).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budget.csv';
    a.click();
    URL.revokeObjectURL(url);
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
          <Button size="sm" onClick={openAddForm} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {/* min-w keeps seven money columns readable: on a phone they used to be
            squeezed into unreadable slivers instead of scrolling. */}
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Category</th><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Estimated</th>
            <th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Deposit</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {(items ?? []).map((item: BudgetItem, idx: number) => {
              const balance = item?.isPaid ? 0 : (item?.actualCost ?? 0) - (item?.depositPaid ?? 0);
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
                  <td className="px-3 py-2"><Badge variant={item?.isPaid ? 'default' : 'outline'}>{item?.isPaid ? 'Paid' : 'Unpaid'}</Badge></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button aria-label={`Edit ${item?.name ?? 'budget item'}`} onClick={() => openEditForm(item)} className="p-1"><Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                    <button aria-label={`Delete ${item?.name ?? 'budget item'}`} onClick={() => handleDelete(item?.id)} className="p-1"><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => open ? setShowForm(true) : resetForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Budget Item' : 'Add Budget Item'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Category</Label><Input value={form?.category ?? ''} onChange={(e: any) => setForm({ ...form, category: e?.target?.value ?? '' })} className="mt-1" placeholder="Venue, Catering..." /></div>
            <div><Label>Item Name</Label><Input value={form?.name ?? ''} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label>Estimated</Label><Input type="number" min="0" step="0.01" value={form?.estimatedCost ?? 0} onChange={(e: any) => setForm({ ...form, estimatedCost: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
              <div><Label>Actual</Label><Input type="number" min="0" step="0.01" value={form?.actualCost ?? 0} onChange={(e: any) => setForm({ ...form, actualCost: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
              <div><Label>Deposit</Label><Input type="number" min="0" step="0.01" value={form?.depositPaid ?? 0} onChange={(e: any) => setForm({ ...form, depositPaid: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} className="h-4 w-4 accent-primary" />
              Mark as fully paid
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSave}>{editingId ? 'Save Changes' : 'Add Item'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
