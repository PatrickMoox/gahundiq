'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVendors } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Vendor, VendorCategory, EventData, TimelineItem } from '@/types/firestore';
import { Plus, Camera, Music, UtensilsCrossed, Flower2, UserCheck, Phone, Mail, Globe, Trash2, Link2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';

const CATEGORY_ICONS: Record<string, any> = {
  Photographer: Camera, Videographer: Camera, DJ: Music, Caterer: UtensilsCrossed,
  Florist: Flower2, Officiant: UserCheck, Venue: UserCheck, 'Hair & Makeup': UserCheck,
  Transportation: UserCheck, Other: UserCheck,
};

const CATEGORIES: VendorCategory[] = ['Photographer', 'Videographer', 'DJ', 'Caterer', 'Florist', 'Officiant', 'Venue', 'Hair & Makeup', 'Transportation', 'Other'];

const emptyVendor: Omit<Vendor, 'id' | 'createdAt'> = {
  eventId: '', category: 'Photographer', name: '', contactName: '', phone: '', email: '',
  website: '', arrivalTime: '', totalAmount: 0, depositPaid: 0, notes: '',
};

export function VendorsTab({ eventId, event, timeline }: { eventId: string; event: EventData | null; timeline: TimelineItem[] }) {
  const { vendors, addVendor, updateVendor, deleteVendor } = useVendors(eventId);
  const [showSheet, setShowSheet] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Vendor, 'id' | 'createdAt'>>({ ...emptyVendor, eventId });

  const openAdd = () => { setEditingId(null); setForm({ ...emptyVendor, eventId }); setShowSheet(true); };
  const openEdit = (v: Vendor) => {
    setEditingId(v?.id);
    setForm({ eventId: v?.eventId, category: v?.category, name: v?.name, contactName: v?.contactName, phone: v?.phone, email: v?.email, website: v?.website, arrivalTime: v?.arrivalTime, totalAmount: v?.totalAmount, depositPaid: v?.depositPaid, notes: v?.notes });
    setShowSheet(true);
  };

  const handleSave = () => {
    if (!form?.name?.trim()) return;
    if (editingId) { updateVendor?.(editingId, form); }
    else { addVendor?.(form); }
    setShowSheet(false);
  };

  const generatePass = async (vendor: Vendor) => {
    const token = vendor?.accessPassToken ?? uuidv4();
    const db = getFirestoreClient();
    if (db && !vendor?.accessPassToken) {
      await updateVendor?.(vendor?.id, { accessPassToken: token });
    }
    // Build the public vendor pass document: vendor info + event info + relevant timeline
    if (db && event) {
      const vendorName = vendor?.name?.toLowerCase()?.split(' ')?.[0] ?? '';
      const contactName = vendor?.contactName?.toLowerCase()?.split(' ')?.[0] ?? '';
      const relevantTimeline = (timeline ?? []).filter((t: TimelineItem) =>
        t?.assignedTo?.toLowerCase()?.includes(vendorName) ||
        t?.assignedTo?.toLowerCase()?.includes(contactName)
      );
      try {
        await setDoc(doc(db, 'publicVendorPasses', token), {
          vendor: {
            name: vendor?.name ?? '',
            category: vendor?.category ?? '',
            contactName: vendor?.contactName ?? '',
            phone: vendor?.phone ?? '',
            email: vendor?.email ?? '',
            arrivalTime: vendor?.arrivalTime ?? '',
            notes: vendor?.notes ?? '',
          },
          event: {
            title: event?.title ?? '',
            date: event?.date ?? null,
            venue: event?.venue ?? '',
          },
          timeline: relevantTimeline.map((t: TimelineItem) => ({
            title: t?.title ?? '',
            description: t?.description ?? '',
            startTime: t?.startTime ?? '',
            endTime: t?.endTime ?? '',
            color: t?.color ?? '',
            assignedTo: t?.assignedTo ?? '',
          })),
          eventId,
          updatedAt: new Date(),
        });
      } catch (err) {
        toast.error('Could not create access pass. Check permissions.');
        return;
      }
    }
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/vendor-pass/${token}`;
    try { navigator.clipboard?.writeText?.(url); } catch { /* noop */ }
    toast.success('Access pass link copied!');
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Vendors ({vendors?.length ?? 0})</h3>
        <Button onClick={openAdd} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Vendor</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <AnimatePresence>
          {(vendors ?? []).map((v: Vendor) => {
            const Icon = CATEGORY_ICONS[v?.category] ?? UserCheck;
            const paidPct = (v?.totalAmount ?? 0) > 0 ? Math.round(((v?.depositPaid ?? 0) / (v?.totalAmount ?? 1)) * 100) : 0;
            const balance = (v?.totalAmount ?? 0) - (v?.depositPaid ?? 0);
            return (
              <motion.div
                key={v?.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group rounded-xl border border-border/50 bg-card p-4 transition-all hover:border-primary/30"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{v?.name}</p>
                      <Badge variant="outline" className="text-xs">{v?.category}</Badge>
                    </div>
                  </div>
                  <Badge variant={balance > 0 ? 'destructive' : 'default'} className="text-xs">
                    {balance > 0 ? `$${balance.toLocaleString('en-US')} due` : 'Paid'}
                  </Badge>
                </div>

                <div className="mb-3 space-y-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {v?.contactName} · {v?.phone}</p>
                  <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {v?.email}</p>
                  {v?.website && <p className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> {v?.website}</p>}
                </div>

                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Payment: ${v?.depositPaid?.toLocaleString('en-US')} / ${v?.totalAmount?.toLocaleString('en-US')}</span>
                    <span>{paidPct}%</span>
                  </div>
                  <Progress value={paidPct} className="h-1.5" />
                </div>

                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(v)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => generatePass(v)}><Link2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteVendor?.(v?.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Slide-over Form */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>{editingId ? 'Edit Vendor' : 'Add Vendor'}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div><Label>Category</Label>
              <Select value={form?.category ?? 'Photographer'} onValueChange={(v: string) => setForm({ ...form, category: v as VendorCategory })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Business Name</Label><Input value={form?.name ?? ''} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Contact Name</Label><Input value={form?.contactName ?? ''} onChange={(e: any) => setForm({ ...form, contactName: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={form?.phone ?? ''} onChange={(e: any) => setForm({ ...form, phone: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Email</Label><Input value={form?.email ?? ''} onChange={(e: any) => setForm({ ...form, email: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Website</Label><Input value={form?.website ?? ''} onChange={(e: any) => setForm({ ...form, website: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Arrival Time</Label><Input type="time" value={form?.arrivalTime ?? ''} onChange={(e: any) => setForm({ ...form, arrivalTime: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total Amount</Label><Input type="number" value={form?.totalAmount ?? 0} onChange={(e: any) => setForm({ ...form, totalAmount: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
              <div><Label>Deposit Paid</Label><Input type="number" value={form?.depositPaid ?? 0} onChange={(e: any) => setForm({ ...form, depositPaid: Number(e?.target?.value ?? 0) })} className="mt-1" /></div>
            </div>
            <div><Label>Notes</Label><Input value={form?.notes ?? ''} onChange={(e: any) => setForm({ ...form, notes: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSheet(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave}>Save</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
