import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, ReferenceLine,
} from 'recharts';
import type { Snapshot } from '../types';
import * as api from '../api';
import { fmt } from '../utils';
import NumberInput from '../components/NumberInput';

export default function HistoryPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [form, setForm] = useState({ stocks: 0, bonds: 0, cash: 0, other_liquid: 0, cpf: 0, insurance: 0, other: 0, liab: 0 });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pieView, setPieView] = useState<'total' | 'liquid'>('total');

  const refresh = useCallback(async () => {
    const data = await api.getSnapshots();
    setSnapshots(data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const previewTotal = form.stocks + form.bonds + form.cash + form.other_liquid + form.cpf + form.insurance + form.other - form.liab;

  async function loadFromTracker() {
    const [portfolio, forexRates] = await Promise.all([api.getPortfolio(), api.getForexRates()]);
    const toSGD = (amount: number, currency: string) => amount * (forexRates[currency] || 1);
    const brokerCashTotal = portfolio.broker_cash.reduce((t, c) => t + toSGD(c.amount, c.currency), 0);
    const stocksTotal = portfolio.stocks.reduce((t, s) => t + toSGD(s.shares * s.price, s.currency), 0) + brokerCashTotal;
    const bondsTotal = portfolio.bonds.reduce((t, i) => t + i.value, 0);
    const cashTotal = portfolio.cash.reduce((t, i) => t + i.value, 0);
    const otherLiquidTotal = portfolio.other_liquid.reduce((t, i) => t + toSGD(i.value, i.currency), 0);
    const cpfTotal = portfolio.cpf.oa + portfolio.cpf.sa + portfolio.cpf.ma + portfolio.cpf.ra;
    const insuranceTotal = portfolio.insurance.reduce((t, i) => t + i.value, 0);
    const otherTotal = portfolio.other.reduce((t, i) => t + toSGD(i.value, i.currency), 0);
    const liabTotal = portfolio.liabilities.reduce((t, i) => t + i.value, 0);
    setForm({
      stocks: parseFloat(stocksTotal.toFixed(2)),
      bonds: parseFloat(bondsTotal.toFixed(2)),
      cash: parseFloat(cashTotal.toFixed(2)),
      other_liquid: parseFloat(otherLiquidTotal.toFixed(2)),
      cpf: parseFloat(cpfTotal.toFixed(2)),
      insurance: parseFloat(insuranceTotal.toFixed(2)),
      other: parseFloat(otherTotal.toFixed(2)),
      liab: parseFloat(liabTotal.toFixed(2)),
    });
  }

  async function saveSnapshot() {
    if (!date) { alert('Please select a date.'); return; }
    await api.createSnapshot({ date, ...form });
    refresh();
  }

  async function handleDelete(id: number, snapshotDate: string) {
    if (!confirm(`Delete snapshot for ${snapshotDate}?`)) return;
    await api.deleteSnapshot(id);
    refresh();
  }

  async function handleClearAll() {
    if (!confirm(`Delete all ${snapshots.length} snapshots? This cannot be undone.`)) return;
    await api.deleteAllSnapshots();
    refresh();
  }

  // Stats
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const first = snapshots.length > 0 ? snapshots[0] : null;
  const allTimeChange = latest && first ? latest.total - first.total : 0;
  const allTimePct = first && first.total !== 0 ? (allTimeChange / Math.abs(first.total)) * 100 : 0;

  let lastChange: number | null = null;
  let lastPct: number | null = null;
  if (snapshots.length >= 2) {
    const prev = snapshots[snapshots.length - 2];
    lastChange = latest!.total - prev.total;
    lastPct = prev.total !== 0 ? (lastChange / Math.abs(prev.total)) * 100 : 0;
  }

  const sign = (v: number) => (v >= 0 ? '+' : '');
  const cls = (v: number) => (v >= 0 ? 'text-green-500' : 'text-red-500');

  const LIQUID_CATEGORIES = [
    { key: 'stocks', label: 'Stocks', color: '#6366f1' },
    { key: 'bonds', label: 'Bonds', color: '#22d3ee' },
    { key: 'cash', label: 'Cash', color: '#22c55e' },
    { key: 'other_liquid', label: 'Other Liquid', color: '#34d399' },
  ] as const;

  const ILLIQUID_CATEGORIES = [
    { key: 'cpf', label: 'CPF', color: '#f59e0b' },
    { key: 'insurance', label: 'Insurance', color: '#fb923c' },
    { key: 'other', label: 'Other Illiquid', color: '#a78bfa' },
  ] as const;

  const ALL_CATEGORIES = [
    ...LIQUID_CATEGORIES,
    ...ILLIQUID_CATEGORIES,
    { key: 'liab' as const, label: 'Liabilities', color: '#ef4444' },
  ];

  const breakdownData = latest
    ? ALL_CATEGORIES.filter((c) => c.key !== 'liab').map((c) => ({
        name: c.label,
        value: latest[c.key],
        color: c.color,
      })).filter((d) => d.value > 0)
    : [];

  const liquidBreakdownData = latest
    ? LIQUID_CATEGORIES.map((c) => ({
        name: c.label,
        value: latest[c.key],
        color: c.color,
      })).filter((d) => d.value > 0)
    : [];

  const activePieData = pieView === 'liquid' ? liquidBreakdownData : breakdownData;

  const breakdownBarData = latest
    ? ALL_CATEGORIES.map((c) => ({
        name: c.label,
        value: c.key === 'liab' ? -latest[c.key] : latest[c.key],
        color: c.color,
      })).filter((d) => d.value !== 0)
    : [];

  const liquidTotal = latest ? LIQUID_CATEGORIES.reduce((t, c) => t + latest[c.key], 0) : 0;
  const illiquidTotal = latest ? ILLIQUID_CATEGORIES.reduce((t, c) => t + latest[c.key], 0) : 0;

  const CHART_LINES = [
    { key: 'total', label: 'Net Worth', color: '#6366f1' },
    { key: 'liquid', label: 'Liquid', color: '#22c55e' },
    { key: 'illiquid', label: 'Illiquid', color: '#f59e0b' },
    ...LIQUID_CATEGORIES.map((c) => ({ key: c.key, label: c.label, color: c.color })),
    ...ILLIQUID_CATEGORIES.map((c) => ({ key: c.key, label: c.label, color: c.color })),
    { key: 'liab', label: 'Liabilities', color: '#ef4444' },
  ] as const;

  const [activeLines, setActiveLines] = useState<Set<string>>(() => new Set(['total']));

  const toggleLine = (key: string) => {
    setActiveLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  };

  const chartData = useMemo(() =>
    snapshots.map((snap) => ({
      date: snap.date,
      total: snap.total,
      liquid: snap.stocks + snap.bonds + snap.cash + snap.other_liquid,
      illiquid: snap.cpf + snap.insurance + snap.other,
      stocks: snap.stocks,
      bonds: snap.bonds,
      cash: snap.cash,
      other_liquid: snap.other_liquid,
      cpf: snap.cpf,
      insurance: snap.insurance,
      other: snap.other,
      liab: snap.liab,
    })),
    [snapshots],
  );

  const reversed = [...snapshots].reverse();

  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Net Worth History</h1>
      <p className="text-slate-400 mb-6">Track your net worth over time with full breakdown</p>

      {/* Snapshot form */}
      <div className="bg-gradient-to-br from-blue-800 to-violet-600 p-6 rounded-xl mb-6">
        <div className="flex gap-4 items-end flex-wrap mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-300 uppercase">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-black/30 border border-white/20 text-slate-200 px-3.5 py-2.5 rounded-md text-sm w-[160px] focus:outline-none focus:border-indigo-300"
            />
          </div>
          <button onClick={loadFromTracker} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-md text-sm font-semibold">
            Load from Tracker
          </button>
          <button onClick={saveSnapshot} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-md text-sm font-semibold">
            Save Snapshot
          </button>
          <div className="text-[22px] font-bold self-center px-2 min-w-[140px]">
            {fmt(previewTotal)}
          </div>
        </div>

        <div className="mb-2">
          <div className="text-xs text-green-400 uppercase font-semibold mb-1">Liquid</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([['stocks', 'Stocks'], ['bonds', 'Bonds'], ['cash', 'Cash'], ['other_liquid', 'Other Liquid']] as const).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-slate-300 uppercase">{label}</label>
                <NumberInput
                  value={form[key]}
                  onChange={(v) => setForm({ ...form, [key]: parseFloat(v) || 0 })}
                  className="bg-black/30 border border-white/20 text-slate-200 px-3.5 py-2.5 rounded-md text-sm w-full focus:outline-none focus:border-indigo-300"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mb-2">
          <div className="text-xs text-amber-400 uppercase font-semibold mb-1">Illiquid</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([['cpf', 'CPF'], ['insurance', 'Insurance'], ['other', 'Other Illiquid']] as const).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-slate-300 uppercase">{label}</label>
                <NumberInput
                  value={form[key]}
                  onChange={(v) => setForm({ ...form, [key]: parseFloat(v) || 0 })}
                  className="bg-black/30 border border-white/20 text-slate-200 px-3.5 py-2.5 rounded-md text-sm w-full focus:outline-none focus:border-indigo-300"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-red-400 uppercase font-semibold mb-1">Liabilities</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300 uppercase">Liabilities</label>
              <NumberInput
                value={form.liab}
                onChange={(v) => setForm({ ...form, liab: parseFloat(v) || 0 })}
                className="bg-black/30 border border-white/20 text-slate-200 px-3.5 py-2.5 rounded-md text-sm w-full focus:outline-none focus:border-indigo-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {snapshots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 uppercase mb-1">Latest Net Worth</div>
            <div className="text-2xl font-bold">{fmt(latest!.total)}</div>
            <div className="text-xs text-slate-400 mt-1">{latest!.date}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 uppercase mb-1">All-Time Change</div>
            <div className={`text-2xl font-bold ${cls(allTimeChange)}`}>{sign(allTimeChange)}{fmt(Math.abs(allTimeChange))}</div>
            <div className={`text-xs mt-1 ${cls(allTimeChange)}`}>{sign(allTimeChange)}{Math.abs(allTimePct).toFixed(2)}% since {first!.date}</div>
          </div>
          {lastChange !== null && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase mb-1">Last Change</div>
              <div className={`text-2xl font-bold ${cls(lastChange)}`}>{sign(lastChange)}{fmt(Math.abs(lastChange))}</div>
              <div className={`text-xs mt-1 ${cls(lastChange)}`}>{sign(lastChange)}{Math.abs(lastPct!).toFixed(2)}%</div>
            </div>
          )}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 uppercase mb-1">Snapshots</div>
            <div className="text-2xl font-bold">{snapshots.length}</div>
            <div className="text-xs text-slate-400 mt-1">{first!.date} — {latest!.date}</div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {latest && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
          <h2 className="text-lg font-semibold mb-4">Net Worth Breakdown — {latest.date}</h2>

          {/* Liquid */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-green-400 uppercase font-semibold">Liquid</span>
            <span className="text-sm font-bold text-green-400">{fmt(liquidTotal)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {LIQUID_CATEGORIES.map((c) => {
              const val = latest[c.key];
              const grossAssets = latest.total + latest.liab;
              const pct = grossAssets !== 0 ? ((val / grossAssets) * 100).toFixed(1) : null;
              return (
                <div key={c.key} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-slate-400 uppercase">{c.label}</span>
                  </div>
                  <div className="text-lg font-bold">{fmt(val)}</div>
                  {pct && <div className="text-xs text-slate-400">{pct}% of assets</div>}
                </div>
              );
            })}
          </div>

          {/* Illiquid */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-amber-400 uppercase font-semibold">Illiquid</span>
            <span className="text-sm font-bold text-amber-400">{fmt(illiquidTotal)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {ILLIQUID_CATEGORIES.map((c) => {
              const val = latest[c.key];
              const grossAssets = latest.total + latest.liab;
              const pct = grossAssets !== 0 ? ((val / grossAssets) * 100).toFixed(1) : null;
              return (
                <div key={c.key} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-slate-400 uppercase">{c.label}</span>
                  </div>
                  <div className="text-lg font-bold">{fmt(val)}</div>
                  {pct && <div className="text-xs text-slate-400">{pct}% of assets</div>}
                </div>
              );
            })}
          </div>

          {/* Liabilities */}
          {latest.liab > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  <span className="text-xs text-slate-400 uppercase">Liabilities</span>
                </div>
                <div className="text-lg font-bold text-red-500">-{fmt(latest.liab)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bar & Pie charts */}
      {latest && breakdownData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h2 className="text-lg font-semibold mb-4">Breakdown by Category</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={breakdownBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(v: number) => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US')}
                  width={80}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value: unknown) => {
                    const v = Number(value);
                    return [(v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'), 'Amount'];
                  }}
                />
                <Bar dataKey="value">
                  {breakdownBarData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} radius={entry.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 overflow-visible">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Asset Allocation</h2>
              <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-700">
                <button
                  onClick={() => setPieView('total')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${pieView === 'total' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Total
                </button>
                <button
                  onClick={() => setPieView('liquid')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${pieView === 'liquid' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Liquid
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={activePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  innerRadius={45}
                  paddingAngle={2}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`}
                  labelLine={{ stroke: '#94a3b8' }}
                >
                  {activePieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                  formatter={(value: unknown) => [fmt(Number(value)), 'Amount']}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value: string) => <span style={{ color: '#e2e8f0', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
        <h2 className="text-lg font-semibold mb-3">Net Worth Over Time</h2>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {CHART_LINES.map((line) => (
            <button
              key={line.key}
              onClick={() => toggleLine(line.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeLines.has(line.key)
                  ? 'text-white border-transparent'
                  : 'text-slate-400 border-slate-600 hover:text-slate-200 hover:border-slate-500'
              }`}
              style={activeLines.has(line.key) ? { backgroundColor: line.color } : undefined}
            >
              {line.label}
            </button>
          ))}
        </div>
        {snapshots.length === 0 ? (
          <div className="text-slate-400 text-center py-16">No snapshots yet. Save your first snapshot above.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                {CHART_LINES.filter((l) => activeLines.has(l.key)).map((line) => (
                  <linearGradient key={line.key} id={`color-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={line.color} stopOpacity={activeLines.size === 1 ? 0.3 : 0.1} />
                    <stop offset="95%" stopColor={line.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v: number) => '$' + Math.round(v).toLocaleString('en-US')}
                width={90}
              />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }}
                formatter={(value: unknown, name: unknown) => {
                  const line = CHART_LINES.find((l) => l.key === name);
                  return ['$' + Math.round(Number(value)).toLocaleString('en-US'), line?.label ?? name];
                }}
                labelFormatter={(label: unknown) => `Date: ${label}`}
              />
              {CHART_LINES.filter((l) => activeLines.has(l.key)).map((line) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  fill={`url(#color-${line.key})`}
                  dot={{ r: 3, fill: line.color, stroke: '#e2e8f0', strokeWidth: 1 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Snapshot History</h2>
          {snapshots.length > 0 && (
            <button
              onClick={handleClearAll}
              className="bg-red-950 hover:bg-red-900 text-white px-3 py-1.5 rounded-md text-sm"
            >
              Clear All
            </button>
          )}
        </div>
        {snapshots.length === 0 ? (
          <div className="text-slate-400 text-center py-10">No snapshots yet. Use the form above to save your first net worth snapshot.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] whitespace-nowrap">
              <thead>
                <tr>
                  <th rowSpan={2} className="py-2.5 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-left align-bottom">Date</th>
                  <th colSpan={4} className="py-1 px-2.5 border-b border-slate-600 text-green-400 text-[10px] uppercase text-center">Liquid</th>
                  <th colSpan={3} className="py-1 px-2.5 border-b border-slate-600 text-amber-400 text-[10px] uppercase text-center">Illiquid</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-right align-bottom">Liabilities</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-right align-bottom">Net Worth</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-right align-bottom">Change</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 border-b-2 border-slate-700 align-bottom"></th>
                </tr>
                <tr>
                  {['Stocks', 'Bonds', 'Cash', 'Other'].map((h) => (
                    <th key={h} className="py-1 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-right">{h}</th>
                  ))}
                  {['CPF', 'Insurance', 'Other'].map((h) => (
                    <th key={`il-${h}`} className="py-1 px-2.5 border-b-2 border-slate-700 text-slate-400 text-[11px] uppercase text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reversed.map((snap, ri) => {
                  const origIdx = snapshots.length - 1 - ri;
                  const prev = origIdx > 0 ? snapshots[origIdx - 1] : null;
                  let changeEl = <span>—</span>;

                  if (prev) {
                    const change = snap.total - prev.total;
                    const pct = prev.total !== 0 ? (change / Math.abs(prev.total)) * 100 : 0;
                    changeEl = (
                      <span className={cls(change)}>
                        {sign(change)}{fmt(Math.abs(change))}
                        <br />
                        <small>{sign(change)}{Math.abs(pct).toFixed(2)}%</small>
                      </span>
                    );
                  }

                  return (
                    <tr key={snap.id} className="hover:bg-slate-950">
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-left">{snap.date}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.stocks)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.bonds)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.cash)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.other_liquid)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.cpf)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.insurance)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{fmt(snap.other)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right text-red-500">{snap.liab ? `-${fmt(snap.liab)}` : fmt(0)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right font-bold">{fmt(snap.total)}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">{changeEl}</td>
                      <td className="py-2.5 px-2.5 border-b border-slate-800 text-right">
                        <button
                          onClick={() => handleDelete(snap.id, snap.date)}
                          className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1 rounded-md text-xs"
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
