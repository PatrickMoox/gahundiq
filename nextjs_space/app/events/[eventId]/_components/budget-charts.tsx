'use client';

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { BudgetItem } from '@/types/firestore';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#80D8C3', '#A19AD3', '#72BF78', '#FF6363'];

export default function BudgetCharts({ items }: { items: BudgetItem[] }) {
  const donutData = useMemo(() => {
    const map: Record<string, number> = {};
    (items ?? []).forEach((i: BudgetItem) => {
      const cat = i?.category ?? 'Other';
      map[cat] = (map[cat] ?? 0) + (i?.actualCost ?? 0);
    });
    return Object.entries(map).map(([name, value]: [string, number]) => ({ name, value }));
  }, [items]);

  const barData = useMemo(() => {
    const map: Record<string, { estimated: number; actual: number }> = {};
    (items ?? []).forEach((i: BudgetItem) => {
      const cat = i?.category ?? 'Other';
      if (!map[cat]) map[cat] = { estimated: 0, actual: 0 };
      map[cat].estimated += i?.estimatedCost ?? 0;
      map[cat].actual += i?.actualCost ?? 0;
    });
    return Object.entries(map).map(([name, v]: [string, any]) => ({ name, Estimated: v?.estimated ?? 0, Actual: v?.actual ?? 0 }));
  }, [items]);

  if ((items?.length ?? 0) === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <p className="mb-2 text-sm font-semibold">Spending by Category</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" paddingAngle={2}>
                {(donutData ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <p className="mb-2 text-sm font-semibold">Estimated vs Actual</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
              <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" angle={-45} textAnchor="end" height={50} />
              <YAxis tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Estimated" fill="#60B5FF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Actual" fill="#FF9149" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
