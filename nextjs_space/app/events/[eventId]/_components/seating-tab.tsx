'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSeatingChart, useGuests } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { TableData, Seat, GuestData, TableType } from '@/types/firestore';
import { Plus, Trash2, Search, Download, Armchair, Star, Leaf, Minus, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

const DIETARY_BADGE: Record<string, { icon: string; label: string }> = {
  vegetarian: { icon: '🌱', label: 'V' },
  vegan: { icon: '🌿', label: 'Vg' },
  'gluten-free': { icon: '🌾', label: 'GF' },
  halal: { icon: '☆', label: 'H' },
  kosher: { icon: '☆', label: 'K' },
};

/** Gap kept between a table and the floor-plan edge. */
const CANVAS_PAD = 12;
/** Space around tables for visible seat markers and between neighboring tables. */
const TABLE_GAP = 24;
const PLACEMENT_STEP = 24;
const SNAP_GRID_SIZE = 30;
const MIN_CANVAS_ZOOM = 0.6;
const MAX_CANVAS_ZOOM = 1.5;

/**
 * Rendered size (css px) of each table type. Shared by the placement/clamping
 * logic AND the renderer so the two can never drift apart.
 */
function tableSize(type: TableType | undefined): { w: number; h: number } {
  if (type === 'head') return { w: 180, h: 60 };
  if (type === 'rectangular') return { w: 180, h: 100 };
  if (type === 'cocktail') return { w: 70, h: 70 };
  return { w: 120, h: 120 };
}

/** Keep a table fully inside the visible floor plan (css px). */
function clampToCanvas(value: number, size: number, extent: number): number {
  const max = Math.max(TABLE_GAP, extent - size - TABLE_GAP);
  return Math.min(Math.max(TABLE_GAP, value), max);
}

function snapToGrid(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / SNAP_GRID_SIZE) * SNAP_GRID_SIZE : value;
}

/** Find the next grid position with enough clearance for the table and seats. */
function findTablePosition(
  tables: TableData[],
  type: TableType,
  canvasWidth: number,
): { x: number; y: number } {
  const { w, h } = tableSize(type);
  const min = TABLE_GAP;
  const maxX = Math.max(min, canvasWidth - w - TABLE_GAP);

  for (let y = min; ; y += PLACEMENT_STEP) {
    for (let x = min; x <= maxX; x += PLACEMENT_STEP) {
      const overlaps = tables.some((table) => {
        const size = tableSize(table.type);
        return x < table.x + size.w + TABLE_GAP
          && x + w + TABLE_GAP > table.x
          && y < table.y + size.h + TABLE_GAP
          && y + h + TABLE_GAP > table.y;
      });
      if (!overlaps) return { x, y };
    }
  }
}

export function SeatingTab({ eventId }: { eventId: string }) {
  const { chart, setChart, updateChart } = useSeatingChart(eventId);
  const { guests } = useGuests(eventId);
  const [search, setSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableType, setNewTableType] = useState<TableType>('round');
  const [newTableName, setNewTableName] = useState('');
  const [newTableCap, setNewTableCap] = useState(8);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [assignSeat, setAssignSeat] = useState<{ tableId: string; seatId: string } | null>(null);
  const [dragging, setDragging] = useState<{ tableId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // The floor plan clips its overflow, so table coordinates must stay inside the
  // element's real pixel size — which is only ~340px wide on a phone, not the
  // ~900px the old hardcoded spawn range assumed.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const floorStageRef = useRef<HTMLDivElement | null>(null);
  const canvasBounds = useCallback((): { width: number; height: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 900, height: rect?.height ?? 500 };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setCanvasWidth(canvas.clientWidth));
    observer.observe(canvas);
    setCanvasWidth(canvas.clientWidth);
    return () => observer.disconnect();
  }, []);
  const floorPlanHeight = useMemo(() => Math.max(
    500,
    ...(chart?.tables ?? []).map((table) => table.y + tableSize(table.type).h + TABLE_GAP),
  ), [chart?.tables]);

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

  // Persist the chart to Firestore. Local state updates immediately so the UI
  // stays responsive, and the write is best-effort with a toast on failure.
  // Without this the seating chart lived in local state only, so EVERY edit
  // (tables, seats, drags) was silently lost on reload — the persisted
  // `updateChart` writer in useSeatingChart was never called.
  const persistTables = useCallback((tables: TableData[]) => {
    setChart((prev) => ({ ...prev, tables, updatedAt: new Date() }));
    updateChart({ tables }).catch(() => toast.error('Could not save the seating chart — check your connection.'));
  }, [setChart, updateChart]);

  const addTable = useCallback(() => {
    const name = newTableName?.trim() || `Table ${(chart?.tables?.length ?? 0) + 1}`;
    const cap = Math.min(20, Math.max(2, Math.floor(newTableCap) || 8));
    const seats: Seat[] = Array.from({ length: cap }, (_: any, i: number) => ({
      id: uuidv4(), tableId: uuidv4(), position: i + 1,
    }));
    const { w, h } = tableSize(newTableType);
    const bounds = canvasBounds();
    const { x, y } = findTablePosition(chart?.tables ?? [], newTableType, bounds.width);
    const tbl: TableData = {
      id: uuidv4(), name, type: newTableType, capacity: cap,
      x: clampToCanvas(x, w, bounds.width),
      y,
      seats,
    };
    tbl.seats = tbl.seats.map((s: Seat) => ({ ...s, tableId: tbl.id }));
    persistTables([...(chart?.tables ?? []), tbl]);
    setShowAddTable(false);
    setNewTableName('');
  }, [chart, persistTables, newTableType, newTableName, newTableCap, canvasBounds]);

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
    persistTables(tables);
    setAssignSeat(null);
    toast.success(`${guest.name} assigned!`);
  }, [assignSeat, chart, guests, persistTables]);

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
    persistTables(tables);
  }, [chart, persistTables]);

  const removeTable = useCallback((tableId: string) => {
    persistTables((chart?.tables ?? []).filter((t: TableData) => t?.id !== tableId));
    if (selectedTable === tableId) setSelectedTable(null);
  }, [chart, persistTables, selectedTable]);

  // Simple pointer-based table dragging
  const handlePointerDown = useCallback((e: React.PointerEvent, tableId: string) => {
    const tbl = (chart?.tables ?? []).find((t: TableData) => t?.id === tableId);
    if (!tbl) return;
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    setDragging({ tableId, startX: e.clientX, startY: e.clientY, origX: tbl.x, origY: tbl.y });
  }, [chart?.tables]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = (e.clientX - dragging.startX) / canvasZoom;
    const dy = (e.clientY - dragging.startY) / canvasZoom;
    const bounds = canvasBounds();
    const tables = (chart?.tables ?? []).map((t: TableData) => {
      if (t?.id !== dragging.tableId) return t;
      const { w, h } = tableSize(t?.type);
      const rawX = snapToGrid(dragging.origX + dx, snapToGridEnabled);
      const rawY = snapToGrid(dragging.origY + dy, snapToGridEnabled);
      return {
        ...t,
        x: clampToCanvas(rawX, w, canvasWidth || bounds.width),
        y: clampToCanvas(rawY, h, Math.max(floorPlanHeight, rawY + h + TABLE_GAP)),
      };
    });
    setChart({ ...chart, tables, updatedAt: new Date() });
  }, [dragging, chart, setChart, canvasBounds, canvasZoom, canvasWidth, snapToGridEnabled, floorPlanHeight]);

  const handlePointerUp = useCallback(() => {
    // Drag moves update local state for smoothness; persist the final positions
    // once the pointer is released so the chart survives a reload. Only write
    // when a table actually moved — a plain click (select) must not hit Firestore.
    const moved = dragging
      ? (chart?.tables ?? []).find((t: TableData) => t?.id === dragging.tableId)
      : undefined;
    if (dragging && moved && (moved.x !== dragging.origX || moved.y !== dragging.origY)) {
      updateChart({ tables: chart?.tables ?? [] }).catch(() => toast.error('Could not save the seating chart — check your connection.'));
    }
    setDragging(null);
  }, [dragging, chart, updateChart]);

  const selTable = selectedTable ? (chart?.tables ?? []).find((t: TableData) => t?.id === selectedTable) : null;

  const exportPNG = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const stage = floorStageRef.current;
      if (!stage) return;
      const canvas = await html2canvas(stage, {
        width: canvasWidth,
        height: floorPlanHeight,
        windowWidth: canvasWidth,
        windowHeight: floorPlanHeight,
        scale: 1 / canvasZoom,
      });
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label="Zoom out"
              disabled={canvasZoom <= MIN_CANVAS_ZOOM}
              onClick={() => setCanvasZoom((zoom) => Math.max(MIN_CANVAS_ZOOM, Math.round((zoom - 0.1) * 10) / 10))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(canvasZoom * 100)}%</span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Zoom in"
              disabled={canvasZoom >= MAX_CANVAS_ZOOM}
              onClick={() => setCanvasZoom((zoom) => Math.min(MAX_CANVAS_ZOOM, Math.round((zoom + 0.1) * 10) / 10))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset floor plan zoom and position"
              onClick={() => {
                setCanvasZoom(1);
                canvasRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
              }}
            >
              <Maximize2 className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            Snap to grid
            <Switch checked={snapToGridEnabled} onCheckedChange={setSnapToGridEnabled} aria-label="Snap dragged tables to the grid" />
          </label>
        </div>
        <div
          id="seating-canvas"
          ref={canvasRef}
          className="relative h-[min(70vh,700px)] min-h-[500px] overflow-auto rounded-xl border border-border/50 bg-muted/30"
          style={{ boxShadow: 'var(--shadow-sm)' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="relative"
            style={{
              width: canvasWidth ? canvasWidth * canvasZoom : '100%',
              height: floorPlanHeight * canvasZoom,
            }}
          >
            <div
              ref={floorStageRef}
              className="absolute left-0 top-0"
              style={{
                width: canvasWidth || '100%',
                height: floorPlanHeight,
                transform: `scale(${canvasZoom})`,
                transformOrigin: 'top left',
              }}
            >
          {/* Grid dots */}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: `${SNAP_GRID_SIZE}px ${SNAP_GRID_SIZE}px` }} />

          {(chart?.tables ?? []).map((tbl: TableData) => {
            const assigned = (tbl?.seats ?? []).filter((s: Seat) => !!s?.guestId)?.length ?? 0;
            const isSelected = selectedTable === tbl?.id;
            // Sizing + clamping share one helper so placement and render agree.
            const { w, h } = tableSize(tbl?.type);
            // `touch-none` is applied to the draggable wrapper below: without it a
            // finger drag scrolls the page instead of moving the table
            // (touch-action defaults to auto on touch devices).

            return (
              <div
                key={tbl?.id}
                className={`absolute cursor-grab touch-none select-none active:cursor-grabbing`}
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
                  {(tbl?.seats ?? []).map((seat: Seat, si: number) => {
                    const angle = (si / Math.max((tbl?.seats?.length ?? 0), 1)) * Math.PI * 2 - Math.PI / 2;
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
          </div>
        </div>

        {/* Selected table details */}
        {selTable && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold">{selTable?.name} — Seats</h4>
              <Button variant="ghost" size="sm" aria-label={`Remove ${selTable?.name ?? 'table'}`} onClick={() => removeTable(selTable?.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
