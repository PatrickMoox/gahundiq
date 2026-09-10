'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTimeline } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TimelineItem } from '@/types/firestore';
import { Plus, Clock, Trash2, Edit2, GripVertical } from 'lucide-react';

const TRACKS = [
  { name: 'Main Stage', color: '#4F46E5' },
  { name: 'Catering & Kitchen', color: '#10B981' },
  { name: 'Photo/Video Crew', color: '#E8A598' },
  { name: 'VIP Party', color: '#F59E0B' },
];

const emptyItem: Omit<TimelineItem, 'id'> = {
  eventId: '', track: 'Main Stage', startTime: '12:00', endTime: '12:30',
  title: '', description: '', assignedTo: '', color: '#4F46E5', status: 'upcoming', order: 0,
};

export function TimelineTab({ eventId }: { eventId: string }) {
  const { items, addItem, updateItem, deleteItem } = useTimeline(eventId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<TimelineItem, 'id'>>({ ...emptyItem, eventId });
  const [filterTrack, setFilterTrack] = useState<string>('all');

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyItem, eventId, order: (items?.length ?? 0) + 1 });
    setShowForm(true);
  };

  const openEdit = (item: TimelineItem) => {
    setEditingId(item?.id);
    setForm({ eventId: item?.eventId, track: item?.track, startTime: item?.startTime, endTime: item?.endTime, title: item?.title, description: item?.description, assignedTo: item?.assignedTo, color: item?.color, status: item?.status, order: item?.order });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form?.title?.trim()) return;
    const track = TRACKS.find((t: any) => t?.name === form?.track);
    const data = { ...form, color: track?.color ?? form?.color };
    if (editingId) {
      updateItem?.(editingId, data);
    } else {
      addItem?.(data);
    }
    setShowForm(false);
  };

  const filtered = filterTrack === 'all' ? items : (items ?? []).filter((i: TimelineItem) => i?.track === filterTrack);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant={filterTrack === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterTrack('all')}>All Tracks</Button>
          {TRACKS.map((t: any) => (
            <Button key={t?.name} variant={filterTrack === t?.name ? 'default' : 'outline'} size="sm" onClick={() => setFilterTrack(t?.name)}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t?.color }} />
              {t?.name}
            </Button>
          ))}
        </div>
        <Button onClick={openAdd} className="gap-2" size="sm"><Plus className="h-4 w-4" /> Add Item</Button>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {(filtered ?? []).map((item: TimelineItem) => (
            <motion.div
              key={item?.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 transition-all hover:border-primary/30"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: item?.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{item?.startTime} – {item?.endTime}</span>
                  <Badge variant="outline" className="text-xs" style={{ borderColor: item?.color, color: item?.color }}>{item?.track}</Badge>
                </div>
                <p className="truncate font-medium">{item?.title}</p>
                {item?.assignedTo && <p className="text-xs text-muted-foreground">Assigned: {item?.assignedTo}</p>}
              </div>
              <div className="flex gap-1 sm:opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => deleteItem?.(item?.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {(filtered?.length ?? 0) === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8" />
            <p>No timeline items yet. Add your first one!</p>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Timeline Item' : 'Add Timeline Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form?.title ?? ''} onChange={(e: any) => setForm({ ...form, title: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div>
              <Label>Track</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TRACKS.map((t: any) => (
                  <button
                    key={t?.name}
                    type="button"
                    onClick={() => setForm({ ...form, track: t?.name, color: t?.color })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      form?.track === t?.name
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'border-border/50 bg-card text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t?.color }} />
                    {t?.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="time" value={form?.startTime ?? ''} onChange={(e: any) => setForm({ ...form, startTime: e?.target?.value ?? '' })} className="mt-1" /></div>
              <div><Label>End</Label><Input type="time" value={form?.endTime ?? ''} onChange={(e: any) => setForm({ ...form, endTime: e?.target?.value ?? '' })} className="mt-1" /></div>
            </div>
            <div><Label>Description</Label><Input value={form?.description ?? ''} onChange={(e: any) => setForm({ ...form, description: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Assigned To</Label><Input value={form?.assignedTo ?? ''} onChange={(e: any) => setForm({ ...form, assignedTo: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingId ? 'Save Changes' : 'Add Item'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
