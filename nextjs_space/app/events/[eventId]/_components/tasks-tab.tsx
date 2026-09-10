'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Task, Milestone, TaskPriority, TaskStatus } from '@/types/firestore';
import { Plus, Trash2, CheckCircle2, Circle, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

const MILESTONES: Milestone[] = ['12_months', '6_months', '3_months', '1_month', 'week_of', 'day_of', 'post_event'];
const MILESTONE_LABELS: Record<string, string> = { '12_months': '12 Months Out', '6_months': '6 Months Out', '3_months': '3 Months Out', '1_month': '1 Month Out', week_of: 'Week Of', day_of: 'Day Of', post_event: 'Post Event' };
const PRIORITY_COLORS: Record<string, string> = { high: 'destructive', medium: 'secondary', low: 'outline' };
const STATUS_ICONS: Record<string, any> = { done: CheckCircle2, in_progress: Clock, todo: Circle };

export function TasksTab({ eventId }: { eventId: string }) {
  const { tasks, addTask, updateTask, deleteTask } = useTasks(eventId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', milestone: '3_months' as Milestone, priority: 'medium' as TaskPriority, category: '', assignedTo: '' });
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const handleAdd = () => {
    if (!form?.title?.trim()) return;
    addTask?.({ ...form, eventId, status: 'todo' as TaskStatus, description: '' });
    setForm({ title: '', milestone: '3_months', priority: 'medium', category: '', assignedTo: '' });
    setShowForm(false);
  };

  const cycleStatus = (task: Task) => {
    const next: Record<string, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
    updateTask?.(task?.id, { status: (next[task?.status ?? 'todo'] ?? 'todo') as TaskStatus });
  };

  const moveTask = (task: Task, direction: 'left' | 'right') => {
    const idx = MILESTONES.indexOf(task?.milestone);
    const newIdx = direction === 'left' ? Math.max(0, idx - 1) : Math.min(MILESTONES.length - 1, idx + 1);
    updateTask?.(task?.id, { milestone: MILESTONES[newIdx] });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {['all', 'high', 'medium', 'low'].map((p: string) => (
            <Button key={p} variant={filterPriority === p ? 'default' : 'outline'} size="sm" onClick={() => setFilterPriority(p)} className="capitalize">
              {p === 'all' ? 'All' : p}
            </Button>
          ))}
        </div>
        <Button onClick={() => setShowForm(true)} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Task</Button>
      </div>

      {/* Kanban Columns */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {MILESTONES.map((ms: Milestone) => {
          const colTasks = (tasks ?? []).filter((t: Task) => t?.milestone === ms && (filterPriority === 'all' || t?.priority === filterPriority));
          const doneCount = colTasks.filter((t: Task) => t?.status === 'done')?.length ?? 0;
          const pct = (colTasks?.length ?? 0) > 0 ? Math.round((doneCount / (colTasks?.length ?? 1)) * 100) : 0;
          return (
            <div key={ms} className="min-w-[220px] flex-shrink-0 rounded-xl border border-border/50 bg-card p-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="mb-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{MILESTONE_LABELS[ms]}</p>
                <Progress value={pct} className="mt-1 h-1" />
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {colTasks.map((task: Task) => {
                    const StatusIcon = STATUS_ICONS[task?.status ?? 'todo'] ?? Circle;
                    return (
                      <motion.div
                        key={task?.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="group rounded-lg border border-border/30 bg-background p-2.5 text-sm"
                      >
                        <div className="mb-1 flex items-start justify-between">
                          <button onClick={() => cycleStatus(task)} className="mt-0.5 shrink-0">
                            <StatusIcon className={`h-4 w-4 ${task?.status === 'done' ? 'text-primary' : task?.status === 'in_progress' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                          </button>
                          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => moveTask(task, 'left')} className="p-0.5"><ChevronLeft className="h-3 w-3" /></button>
                            <button onClick={() => moveTask(task, 'right')} className="p-0.5"><ChevronRight className="h-3 w-3" /></button>
                            <button onClick={() => deleteTask?.(task?.id)} className="p-0.5"><Trash2 className="h-3 w-3 text-destructive" /></button>
                          </div>
                        </div>
                        <p className={`font-medium ${task?.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task?.title}</p>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge variant={(PRIORITY_COLORS[task?.priority ?? 'medium'] ?? 'outline') as any} className="text-[10px]">{task?.priority}</Badge>
                          {task?.assignedTo && <span className="text-[10px] text-muted-foreground">{task?.assignedTo}</span>}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Task Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form?.title ?? ''} onChange={(e: any) => setForm({ ...form, title: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div><Label>Milestone</Label>
              <Select value={form?.milestone} onValueChange={(v: string) => setForm({ ...form, milestone: v as Milestone })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MILESTONES.map((m: string) => <SelectItem key={m} value={m}>{MILESTONE_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={form?.priority} onValueChange={(v: string) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Category</Label><Input value={form?.category ?? ''} onChange={(e: any) => setForm({ ...form, category: e?.target?.value ?? '' })} className="mt-1" placeholder="Venue, Catering, etc." /></div>
            <div><Label>Assigned To</Label><Input value={form?.assignedTo ?? ''} onChange={(e: any) => setForm({ ...form, assignedTo: e?.target?.value ?? '' })} className="mt-1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Add Task</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
