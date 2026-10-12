'use client';

import React, { useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useBudget } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { BudgetItem, EventData, Vendor } from '@/types/firestore';
import { formatMoney } from '@/lib/currency';
import { csvEscape } from '@/lib/utils';
import { Plus, DollarSign, TrendingUp, TrendingDown, PieChart, Download, Trash2, Pencil, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { FREE_LIMITS, getPlanningItemLimit } from '@/lib/plan-entitlements';

const BudgetCharts = dynamic(() => import('./budget-charts'), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" /> });

const BUDGET_CSV_HEADERS = ['Category', 'Item', 'Estimated', 'Actual', 'Deposit', 'Payment Status', 'Due Date', 'Notes'];
const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 1000;

type CsvBudgetRow = {
  rowNumber: number;
  category: string;
  name: string;
  estimatedCost: number;
  actualCost: number;
  depositPaid: number;
  isPaid: boolean;
  dueDate: Date | null;
  notes: string;
  error?: string;
  retryable?: boolean;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char === '"') {
      throw new Error('CSV contains a quote in an unquoted field.');
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error('CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function parseBudgetCsv(text: string): CsvBudgetRow[] {
  const [headerRow, ...dataRows] = parseCsv(text);
  if (!headerRow) throw new Error('The CSV file is empty.');
  const headers = headerRow.map((header) => header.trim().replace(/^\uFEFF/, '').toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  const itemColumn = headers.indexOf('item');
  if (itemColumn < 0) throw new Error('CSV must include an "Item" column. Download the template for the supported format.');
  if (dataRows.length > MAX_CSV_ROWS) throw new Error(`CSV can contain at most ${MAX_CSV_ROWS} budget rows at a time.`);

  const column = (name: string) => headers.indexOf(name.toLowerCase());
  const valueAt = (row: string[], name: string) => {
    const index = column(name);
    return index < 0 ? '' : (row[index] ?? '').trim();
  };
  const parseAmount = (raw: string, label: string) => {
    if (!raw) return 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number.`);
    return value;
  };

  return dataRows.map((row, index) => {
    const rowNumber = index + 2;
    try {
      if (row.length > headers.length) throw new Error('Row has more values than the header.');
      const name = valueAt(row, 'Item');
      if (!name) throw new Error('Item name is required.');

      const estimatedCost = parseAmount(valueAt(row, 'Estimated'), 'Estimated');
      const actualCost = parseAmount(valueAt(row, 'Actual'), 'Actual');
      const depositPaid = parseAmount(valueAt(row, 'Deposit'), 'Deposit');
      if (depositPaid > actualCost) throw new Error('Deposit cannot exceed actual cost.');

      const paymentStatus = valueAt(row, 'Payment Status').toLowerCase();
      if (paymentStatus && paymentStatus !== 'paid' && paymentStatus !== 'unpaid') {
        throw new Error('Payment Status must be Paid or Unpaid.');
      }

      const rawDueDate = valueAt(row, 'Due Date');
      let dueDate: Date | null = null;
      if (rawDueDate) {
        const parsedDate = new Date(`${rawDueDate}T12:00:00`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDueDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== rawDueDate) {
          throw new Error('Due Date must use YYYY-MM-DD format.');
        }
        dueDate = parsedDate;
      }

      return {
        rowNumber,
        category: valueAt(row, 'Category') || 'Other',
        name,
        estimatedCost,
        actualCost,
        depositPaid,
        isPaid: paymentStatus === 'paid',
        dueDate,
        notes: valueAt(row, 'Notes'),
      };
    } catch (error) {
      return {
        rowNumber,
        category: '',
        name: row[itemColumn]?.trim() ?? '',
        estimatedCost: 0,
        actualCost: 0,
        depositPaid: 0,
        isPaid: false,
        dueDate: null,
        notes: '',
        error: error instanceof Error ? error.message : 'Invalid row.',
      };
    }
  });
}

export function BudgetTab({ eventId, event, vendors, canLinkVendors }: { eventId: string; event: EventData | null; vendors: Vendor[]; canLinkVendors: boolean }) {
  const currency = event?.currency;
  const { items, loading, addItem, updateItem, deleteItem } = useBudget(eventId);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvBudgetRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false, vendorId: '' });
  const itemLimit = event ? getPlanningItemLimit(event, 'budget') : FREE_LIMITS.budgetItems;
  const limitReached = itemLimit !== null && (items?.length ?? 0) >= itemLimit;

  const totals = useMemo(() => {
    const est = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.estimatedCost ?? 0), 0);
    const act = (items ?? []).reduce((s: number, i: BudgetItem) => s + (i?.actualCost ?? 0), 0);
    return { estimated: est, actual: act, remaining: est - act };
  }, [items]);

  const resetForm = () => {
    setForm({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false, vendorId: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const openAddForm = () => {
    if (loading || limitReached) return;
    setForm({ category: '', name: '', estimatedCost: 0, actualCost: 0, depositPaid: 0, isPaid: false, vendorId: '' });
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
      vendorId: item.vendorId ?? '',
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
      vendorId: form.vendorId || null,
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

  const downloadCsvTemplate = () => {
    const blob = new Blob([`${BUDGET_CSV_HEADERS.join(',')}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'budget-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFile = async (file?: File) => {
    if (!file) return;
    if (event?.tier !== 'premium') {
      toast.error('CSV import is available on paid plans.');
      return;
    }
    setCsvRows([]);
    setCsvFileName('');
    if (file.size > MAX_CSV_FILE_SIZE) {
      toast.error('CSV file must be 5 MB or smaller.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please choose a .csv file.');
      return;
    }
    try {
      const rows = parseBudgetCsv(await file.text());
      if (rows.length === 0) {
        toast.error('The CSV has a header but no budget rows.');
        return;
      }
      setCsvRows(rows);
      setCsvFileName(file.name);
      setShowImport(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the CSV file.');
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const importCsvRows = async () => {
    if (event?.tier !== 'premium') {
      toast.error('CSV import is available on paid plans.');
      return;
    }
    const validRows = csvRows.filter((row) => !row.error || row.retryable);
    if (validRows.length === 0 || importing) return;
    setImporting(true);
    const failedRowNumbers = new Set<number>();
    let importedCount = 0;

    for (const row of validRows) {
      try {
        await addItem({
          eventId,
          category: row.category,
          name: row.name,
          estimatedCost: row.estimatedCost,
          actualCost: row.actualCost,
          depositPaid: row.depositPaid,
          balanceDue: row.isPaid ? 0 : row.actualCost - row.depositPaid,
          isPaid: row.isPaid,
          dueDate: row.dueDate,
          notes: row.notes,
        });
        importedCount += 1;
      } catch {
        failedRowNumbers.add(row.rowNumber);
      }
    }

    setImporting(false);
    if (failedRowNumbers.size > 0) {
      setCsvRows((rows) => rows.flatMap((row) => {
        if (failedRowNumbers.has(row.rowNumber)) {
          return [{ ...row, error: 'Could not save this row. Check your connection and retry.', retryable: true }];
        }
        if (validRows.some((validRow) => validRow.rowNumber === row.rowNumber)) return [];
        return row.error ? [row] : [];
      }));
      toast.error(`${importedCount} item${importedCount === 1 ? '' : 's'} imported; ${failedRowNumbers.size} could not be saved. Only the failed rows remain for retry.`);
      return;
    }

    const invalidRows = csvRows.filter((row) => row.error && !row.retryable);
    setCsvRows(invalidRows);
    if (invalidRows.length > 0) {
      toast.success(`${importedCount} budget item${importedCount === 1 ? '' : 's'} imported. ${invalidRows.length} invalid row${invalidRows.length === 1 ? ' was' : 's were'} skipped; review the validation messages.`);
      return;
    }
    setCsvFileName('');
    setShowImport(false);
    toast.success(`${importedCount} budget item${importedCount === 1 ? '' : 's'} imported.`);
  };

  const exportCSV = () => {
    const header = `${BUDGET_CSV_HEADERS.join(',')}\n`;
    // csvEscape keeps names with commas/quotes intact and neutralizes
    // spreadsheet formula injection — see lib/utils.ts.
    const rows = (items ?? []).map((i: BudgetItem) =>
      [
        i?.category,
        i?.name,
        i?.estimatedCost,
        i?.actualCost,
        i?.depositPaid,
        i?.isPaid ? 'Paid' : 'Unpaid',
        csvDate(i?.dueDate),
        i?.notes ?? '',
      ].map(csvEscape).join(',')
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
  const importableRowCount = csvRows.filter((row) => !row.error || row.retryable).length;

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
      <div className="mb-3 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Budget Items</h3>
          {itemLimit !== null && <p className="text-xs text-muted-foreground">{items?.length ?? 0} of {itemLimit} free-plan items used</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1"><Download className="h-3.5 w-3.5" /> CSV</Button>
          {event?.tier === 'premium' ? (
            <Button variant="outline" size="sm" onClick={() => { setCsvRows([]); setCsvFileName(''); setShowImport(true); }} className="gap-1"><Upload className="h-3.5 w-3.5" /> Import CSV</Button>
          ) : (
            <Button asChild variant="outline" size="sm"><Link href="/pricing">Upgrade for CSV import</Link></Button>
          )}
          <Button size="sm" disabled={loading || limitReached} onClick={openAddForm} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
          {limitReached && <Button asChild size="sm" variant="outline"><Link href="/pricing">Upgrade for more</Link></Button>}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {/* min-w keeps seven money columns readable: on a phone they used to be
            squeezed into unreadable slivers instead of scrolling. */}
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2">Category</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Vendor</th><th className="px-3 py-2 text-right">Estimated</th>
            <th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Deposit</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {(items ?? []).map((item: BudgetItem, idx: number) => {
              const balance = item?.isPaid ? 0 : (item?.actualCost ?? 0) - (item?.depositPaid ?? 0);
              return (
                <tr key={item?.id} className={`border-b border-border/30 ${idx % 2 === 0 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{item?.category}</Badge></td>
                  <td className="px-3 py-2 font-medium">{item?.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{vendors.find((vendor) => vendor.id === item.vendorId)?.name ?? (item.vendorId ? 'Linked vendor unavailable' : '—')}</td>
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

      <Dialog open={showImport && event?.tier === 'premium'} onOpenChange={(open) => {
        if (!importing) {
          setShowImport(open);
          if (!open) {
            setCsvRows([]);
            setCsvFileName('');
          }
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Budget Items from CSV</DialogTitle>
            <DialogDescription>Import adds new items; it will not replace your existing budget. Review the rows before confirming.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>Download CSV template</Button>
              <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>Choose CSV file</Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose a budget CSV file"
                onChange={(e) => { void handleCsvFile(e.target.files?.[0]); }}
              />
              {csvFileName && <span className="text-sm text-muted-foreground">{csvFileName}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Columns: Category, Item, Estimated, Actual, Deposit, Payment Status, Due Date, Notes. Amounts must be non-negative numbers; due dates use YYYY-MM-DD.
            </p>
            {csvRows.length > 0 && (
              <>
                <div className="flex gap-2 text-sm">
                  <Badge variant="outline">{csvRows.filter((row) => !row.error).length} ready</Badge>
                  {csvRows.some((row) => row.retryable) && <Badge variant="destructive">{csvRows.filter((row) => row.retryable).length} retry</Badge>}
                  {csvRows.some((row) => row.error && !row.retryable) && <Badge variant="destructive">{csvRows.filter((row) => row.error && !row.retryable).length} invalid</Badge>}
                </div>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2">Row</th><th className="p-2">Category</th><th className="p-2">Item</th>
                        <th className="p-2 text-right">Estimated</th><th className="p-2 text-right">Actual</th><th className="p-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((row) => (
                        <tr key={row.rowNumber} className="border-t">
                          <td className="p-2">{row.rowNumber}</td>
                          <td className="p-2">{row.category || '—'}</td>
                          <td className="p-2">{row.name || '—'}</td>
                          <td className="p-2 text-right">{row.error ? '—' : formatMoney(row.estimatedCost, currency)}</td>
                          <td className="p-2 text-right">{row.error ? '—' : formatMoney(row.actualCost, currency)}</td>
                          <td className={`p-2 ${row.error ? 'text-destructive' : 'text-emerald-600'}`}>{row.error ?? 'Ready'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={importing} onClick={() => setShowImport(false)}>Cancel</Button>
              <Button disabled={importing || importableRowCount === 0} onClick={() => { void importCsvRows(); }}>
                {importing ? 'Importing…' : `Import ${importableRowCount} items`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => open ? setShowForm(true) : resetForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Budget Item' : 'Add Budget Item'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Category</Label><Input value={form?.category ?? ''} onChange={(e: any) => setForm({ ...form, category: e?.target?.value ?? '' })} className="mt-1" placeholder="Venue, Catering..." /></div>
            <div><Label>Item Name</Label><Input value={form?.name ?? ''} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} className="mt-1" /></div>
            {canLinkVendors && (
              <div>
                <Label htmlFor="budget-vendor">Related vendor</Label>
                <select id="budget-vendor" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No vendor linked</option>
                  {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.category}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">Links this budget line to the vendor record without copying their contract totals.</p>
              </div>
            )}
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

function csvDate(value: BudgetItem['dueDate']): string {
  const date = value instanceof Date ? value : value?.toDate?.();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
