'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSeatingChart, useGuests } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TableData, Seat, GuestData, TableType } from '@/types/firestore';
import { Plus, Trash2, Search, Download, Armchair, Star, Leaf } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

const DIETARY_BADGE: Record<string, { icon: string; label: string }> = {
  vegetarian: { icon: '🌱', label: 'V' },
  vegan: { icon: '🌿', label: 'Vg' },
  'gluten-free': { icon: '🌾', label: 'GF' },
  halal: { icon: '☆', label: 'H' },
  kosher: { icon: '☆', label: 'K' },
};

export function SeatingTab({ eventId }: { eventId: string }) {
  const { chart, setChart } = useSeatingChart(eventId);
  const { guests } = useGuests(eventId);
  const [search, setSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableType, setNewTableType] = useState<TableType>('round');
  const [newTableName, setNewTableName] = useState('');
  const [newTableCap, setNewTableCap] = useState(8);
  const [assignSeat, setAssignSeat] = useState<{ tableId: string; seatId: string } | null>(null);
  const [dragging, setDragging] = useState<{ tableId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Which guests are already assigned
  const assignedGuestIds = useMemo(() => {
    const ids = new Set<string>();
    (chart?.tables ?? []).forEach((t: TableData) => {
      (t?.seats ?? []).forEach((s: Seat) => { if (s?.guestId) ids.add(s.guestId); });
    });
    return ids;
  }, [chart?.tables]);

  const unassigned = useMemo(() => {
    return (guests ?? []).filter((g: GuestData) => !assignedGuestIds.has(g?.id ?? '') && (g?.name?.toLowerCase()?.includes(search?.toLowerCase() ?? '') ?? true));
  }, [guests, assignedGuestIds, search]);

  const addTable = useCallback(() => {
    const name = newTableName?.trim() || `Table ${(chart?.tables?.length ?? 0) + 1}`;
    const cap = newTableCap || 8;
    const seats: Seat[] = Array.from({ length: cap }, (_: any, i: number) => ({
      id: uuidv4(), tableId: uuidv4(), position: i + 1,
    }));
    const tbl: TableData = {
      id: uuidv4(), name, type: newTableType, capacity: cap,
      x: 100 + Math.random() * 400, y: 100 + Math.random() * 200,
      seats,
    };
    tbl.seats = tbl.seats.map((s: Seat) => ({ ...s, tableId: tbl.id }));
    setChart({ ...chart, tables: [...(chart?.tables ?? []), tbl], updatedAt: new Date() });
    setShowAddTable(false);
    setNewTableName('');
  }, [chart, setChart, newTableType, newTableName, newTableCap]);

  const assignGuestToSeat = useCallback((guestId: string) => {
    if (!assignSeat) return;
    const guest = (guests ?? []).find((g: GuestData) => g?.id === guestId);
    if (!guest) return;
    const tables = (chart?.tables ?? []).map((t: TableData) => {
      if (t?.id !== assignSeat.tableId) return t;
      return {
        ...t,
        seats: (t?.seats ?? []).map((s: Seat) =>
          s?.id === assignSeat.seatId
            ? { ...s, guestId: guest.id, guestName: guest.name, dietary: guest.dietary, isVIP: guest.isVIP }
            : s
        ),
      };
    });
    setChart({ ...chart, tables, updatedAt: new Date() });
    setAssignSeat(null);
    toast.success(`${guest.name} assigned!`);
  }, [assignSeat, chart, setChart, guests]);

  const removeSeatGuest = useCallback((tableId: string, seatId: string) => {
    const tables = (chart?.tables ?? []).map((t: TableData) => {
      if (t?.id !== tableId) return t;
      return {
        ...t,
        seats: (t?.seats ?? []).map((s: Seat) =>
          s?.id === seatId ? { ...s, guestId: undefined, guestName: undefined, dietary: undefined, isVIP: false } : s
        ),
      };
    });
    setChart({ ...chart, tables, updatedAt: new Date() });
  }, [chart, setChart]);

  const removeTable = useCallback((tableId: string) => {
    setChart({ ...chart, tables: (chart?.tables ?? []).filter((t: TableData) => t?.id !== tableId), updatedAt: new Date() });
    if (selectedTable === tableId) setSelectedTable(null);
  }, [chart, setChart, selectedTable]);

  // Simple pointer-based table dragging
  const handlePointerDown = useCallback((e: React.PointerEvent, tableId: string) => {
    const tbl = (chart?.tables ?? []).find((t: TableData) => t?.id === tableId);
    if (!tbl) return;
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    setDragging({ tableId, startX: e.clientX, startY: e.clientY, origX: tbl.x, origY: tbl.y });
  }, [chart?.tables]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const tables = (chart?.tables ?? []).map((t: TableData) =>
      t?.id === dragging.tableId ? { ...t, x: dragging.origX + dx, y: dragging.origY + dy } : t
    );
    setChart({ ...chart, tables, updatedAt: new Date() });
  }, [dragging, chart, setChart]);

  const handlePointerUp = useCallback(() => { setDragging(null); }, []);

  const selTable = selectedTable ? (chart?.tables ?? []).find((t: TableData) => t?.id === selectedTable) : null;

  const exportPNG = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = document.getElementById('seating-canvas');
      if (!el) return;
      const canvas = await html2canvas(el);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'seating-chart.png';
      a.click();
      toast.success('Exported!');
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Canvas (70%) */}
      <div className="flex-[7]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Floor Plan</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddTable(true)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add Table</Button>
            <Button variant="outline" size="sm" onClick={exportPNG} className="gap-1"><Download className="h-3.5 w-3.5" /> PNG</Button>
          </div>
        </div>
        <div
          id="seating-canvas"
          className="relative min-h-[500px] overflow-hidden rounded-xl border border-border/50 bg-muted/30"
          style={{ boxShadow: 'var(--shadow-sm)' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Grid dots */}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

          {(chart?.tables ?? []).map((tbl: TableData) => {
            const assigned = (tbl?.seats ?? []).filter((s: Seat) => !!s?.guestId)?.length ?? 0;
            const isSelected = selectedTable === tbl?.id;
            const w = tbl?.type === 'head' || tbl?.type === 'rectangular' ? 180 : tbl?.type === 'cocktail' ? 70 : 120;
            const h = tbl?.type === 'head' ? 60 : tbl?.type === 'rectangular' ? 100 : tbl?.type === 'cocktail' ? 70 : 120;

            return (
              <div
                key={tbl?.id}
                className={`absolute cursor-grab select-none active:cursor-grabbing`}
                style={{ left: tbl?.x ?? 0, top: tbl?.y ?? 0, width: w, zIndex: isSelected ? 10 : 1 }}
                onPointerDown={(e: React.PointerEvent) => handlePointerDown(e, tbl?.id)}
                onClick={() => setSelectedTable(isSelected ? null : tbl?.id)}
              >
                <div
                  className={`flex flex-col items-center justify-center border-2 transition-all ${
                    isSelected ? 'border-primary shadow-lg' : 'border-border/60 hover:border-primary/40'
                  } ${tbl?.type === 'round' || tbl?.type === 'cocktail' ? 'rounded-full' : 'rounded-lg'} bg-card`}
                  style={{ width: w, height: h, boxShadow: 'var(--shadow-md)' }}
                >
                  <p className="text-xs font-semibold">{tbl?.name}</p>
                  <p className="text-[10px] text-muted-foreground">{assigned}/{tbl?.capacity}</p>
                </div>
                {/* Seat indicators around table */}
                <div className="absolute inset-0 pointer-events-none">
                  {(tbl?.seats ?? []).slice(0, 8).map((seat: Seat, si: number) => {
                    const angle = (si / Math.min((tbl?.seats?.length ?? 8), 8)) * Math.PI * 2 - Math.PI / 2;
                    const rx = (w / 2) + 12;
                    const ry = (h / 2) + 12;
                    const cx = w / 2 + rx * Math.cos(angle) - 6;
                    const cy = h / 2 + ry * Math.sin(angle) - 6;
                    return (
                      <div key={seat?.id} className={`absolute h-3 w-3 rounded-full border ${seat?.guestId ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                        style={{ left: cx, top: cy }}
                        title={seat?.guestName ?? `Seat ${seat?.position}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected table details */}
        {selTable && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold">{selTable?.name} — Seats</h4>
              <Button variant="ghost" size="sm" onClick={() => removeTable(selTable?.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {(selTable?.seats ?? []).map((seat: Seat) => (
                <div key={seat?.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-background p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Armchair className="h-4 w-4 text-muted-foreground" />
                    {seat?.guestName ? (
                      <span className="font-medium">
                        {seat?.guestName}
                        {seat?.isVIP && <Star className="ml-1 inline h-3 w-3 text-amber-500" />}
                        {seat?.dietary && seat.dietary !== 'none' && (
                          <span className="ml-1 text-xs">{DIETARY_BADGE[seat.dietary]?.icon ?? ''}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Seat {seat?.position}</span>
                    )}
                  </div>
                  {seat?.guestId ? (
                    <button onClick={() => removeSeatGuest(selTable?.id, seat?.id)} className="text-xs text-destructive hover:underline">Remove</button>
                  ) : (
                    <button onClick={() => setAssignSeat({ tableId: selTable?.id, seatId: seat?.id })} className="text-xs text-primary hover:underline">Assign</button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Guest Panel (30%) */}
      <div className="flex-[3]">
        <div className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <h3 className="mb-3 font-display text-sm font-semibold">Unassigned Guests ({unassigned?.length ?? 0})</h3>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search guests..." value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} className="pl-10" />
          </div>
          <div className="max-h-[400px] space-y-1 overflow-y-auto">
            {(unassigned ?? []).map((g: GuestData) => (
              <div key={g?.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-background p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span>{g?.name}</span>
                  {g?.isVIP && <Badge variant="secondary" className="text-[10px]"><Star className="mr-0.5 h-2.5 w-2.5" />VIP</Badge>}
                  {g?.dietary && g.dietary !== 'none' && (
                    <span className="text-xs">{DIETARY_BADGE[g.dietary]?.icon ?? ''}</span>
                  )}
                </div>
              </div>
            ))}
            {(unassigned?.length ?? 0) === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">All guests assigned!</p>
            )}
          </div>
        </div>
      </div>

      {/* Add Table Dialog */}
      <Dialog open={showAddTable} onOpenChange={setShowAddTable}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Table</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Table Name</label>
              <Input value={newTableName} onChange={(e: any) => setNewTableName(e?.target?.value ?? '')} className="mt-1" placeholder={`Table ${(chart?.tables?.length ?? 0) + 1}`} />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={newTableType} onValueChange={(v: string) => setNewTableType(v as TableType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round">Round</SelectItem>
                  <SelectItem value="rectangular">Rectangular</SelectItem>
                  <SelectItem value="head">Head Table</SelectItem>
                  <SelectItem value="cocktail">Cocktail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Capacity</label>
              <Input type="number" min={2} max={20} value={newTableCap} onChange={(e: any) => setNewTableCap(Number(e?.target?.value ?? 8))} className="mt-1" />
            </div>
            <Button className="w-full" onClick={addTable}>Add Table</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Seat Dialog */}
      <Dialog open={!!assignSeat} onOpenChange={() => setAssignSeat(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign Guest to Seat</DialogTitle></DialogHeader>
          <div className="max-h-[300px] space-y-1 overflow-y-auto py-2">
            {(unassigned ?? []).map((g: GuestData) => (
              <button key={g?.id} onClick={() => assignGuestToSeat(g?.id)}
                className="flex w-full items-center justify-between rounded-lg border border-border/30 bg-background p-2.5 text-sm hover:bg-muted">
                <div className="flex items-center gap-2">
                  <span>{g?.name}</span>
                  {g?.isVIP && <Badge variant="secondary" className="text-[10px]">VIP</Badge>}
                  {g?.dietary && g.dietary !== 'none' && <span className="text-xs">{DIETARY_BADGE[g.dietary]?.icon}</span>}
                </div>
                <span className="text-xs text-primary">Assign</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
