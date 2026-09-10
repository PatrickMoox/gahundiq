'use client';

/**
 * Report charts — recharts is heavy, so this module is dynamically imported
 * with `ssr: false` from reports-client (same pattern as BudgetCharts).
 * Colors are fixed mid-tone hex values chosen to read well on the glass
 * surfaces in BOTH light and dark themes.
 */
import React, { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const PALETTE = ['#818CF8', '#F472B6', '#FBBF24', '#34D399', '#60A5FA', '#C084FC', '#FB7185', '#2DD4BF'];
const GRID = '#94A3B833';
const AXIS = '#94A3B8';

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};

export default function ReportCharts({
  rsvp,
  tasks,
  budget,
  gifts,
}: {
  rsvp: { name: string; value: number }[];
  tasks: { name: string; value: number }[];
  budget: { name: string; Estimated: number; Actual: number }[];
  gifts: { name: string; total: number }[];
}) {
  const rsvpTotal = useMemo(() => rsvp.reduce((s, r) => s + r.value, 0), [rsvp]);
  const budgetTotal = useMemo(() => budget.reduce((s, b) => s + b.Actual, 0), [budget]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* RSVP breakdown */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">RSVP breakdown</h3>
        {rsvpTotal === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No guests yet — add guests to see RSVP analytics.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={rsvp} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} strokeWidth={0}>
                {rsvp.map((entry, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: AXIS }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Task completion */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tasks by status</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={tasks} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip cursor={{ fill: 'hsl(var(--foreground) / 0.05)' }} contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {tasks.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Budget: estimated vs actual */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Budget by category {budgetTotal > 0 && <span className="normal-case text-primary">· ${budgetTotal.toLocaleString('en-US')} spent</span>}
        </h3>
        {budget.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No budget items yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={budget} barCategoryGap="24%">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-14} dy={8} height={44} />
              <YAxis tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip cursor={{ fill: 'hsl(var(--foreground) / 0.05)' }} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: AXIS }} />
              <Bar dataKey="Estimated" fill={PALETTE[0]} radius={[6, 6, 0, 0]} />
              <Bar dataKey="Actual" fill={PALETTE[1]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gifts by event (aggregate) or by type (single) */}
      <div className="rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gifts</h3>
        {gifts.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No gifts recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={gifts} layout="vertical" barCategoryGap="26%">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'hsl(var(--foreground) / 0.05)' }} contentStyle={tooltipStyle} />
              <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                {gifts.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}