import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Position } from '../types';
import * as api from '../api';
import { fmt } from '../utils';
import NumberInput from '../components/NumberInput';
import SymbolInput from '../components/SymbolInput';

const BROKERS_LIST = [
  'Fidelity', 'Schwab', 'Vanguard', 'Robinhood', 'E*TRADE',
  'Interactive Brokers', 'TD Ameritrade', 'Merrill', 'Webull',
  'Moomoo', 'Tiger Brokers', 'SGX', 'EndowUs', 'CDP', 'Vesting Stocks', 'Other',
];

export default function StocksPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [brokerInput, setBrokerInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refresh = useCallback(async () => {
    const data = await api.getPositions();
    setPositions(data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Group positions by broker
  const brokerGroups = useMemo(() => {
    const groups: Record<string, Position[]> = {};
    for (const pos of positions) {
      const broker = pos.broker_name || 'Ungrouped';
      if (!groups[broker]) groups[broker] = [];
      groups[broker].push(pos);
    }
    return groups;
  }, [positions]);

  const brokerNames = Object.keys(brokerGroups);

  const existingBrokers = useMemo(() => [...new Set(positions.map(p => p.broker_name).filter(Boolean))], [positions]);
  const availableBrokers = BROKERS_LIST.filter(b => !existingBrokers.includes(b));
  const filteredSuggestions = brokerInput
    ? availableBrokers.filter(b => b.toLowerCase().includes(brokerInput.toLowerCase()))
    : availableBrokers;

  async function handleAddBroker(name?: string) {
    const brokerName = (name || brokerInput).trim();
    if (!brokerName) return;
    await api.createPosition({ broker_name: brokerName, buy_date: new Date().toISOString().slice(0, 10) });
    setBrokerInput('');
    setShowSuggestions(false);
    refresh();
  }

  async function handleAddPosition(brokerName: string) {
    await api.createPosition({ broker_name: brokerName, buy_date: new Date().toISOString().slice(0, 10) });
    refresh();
  }

  async function handleDelete(id: number) {
    await api.deletePosition(id);
    refresh();
  }

  async function handleDeleteBroker(brokerName: string) {
    if (!confirm(`Remove ${brokerName} and all its positions?`)) return;
    const toDelete = brokerGroups[brokerName] || [];
    await Promise.all(toDelete.map(p => api.deletePosition(p.id)));
    refresh();
  }

  function handleChange(id: number, field: string, value: string) {
    const key = `${id}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const numericFields = ['shares', 'buy_price', 'sell_price'];
      const parsed = numericFields.includes(field) ? parseFloat(value) || 0 : value;
      await api.updatePosition(id, { [field]: parsed });
      refresh();
    }, 500);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const data = await api.refreshPositions();
      setPositions(data);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExportToAssets() {
    setExporting(true);
    try {
      const result = await api.exportPositionsToAssets();
      alert(`Exported ${result.synced} stock(s) to Assets tab.`);
    } finally {
      setExporting(false);
    }
  }

  // Totals
  const totalInvested = positions.reduce((t, p) => t + p.shares * p.buy_price, 0);
  const totalCurrent = positions.reduce((t, p) => {
    const exit = (p.sell_price > 0 && p.sell_date) ? p.sell_price : p.current_price;
    return t + p.shares * exit;
  }, 0);
  const totalDividends = positions.reduce((t, p) => t + p.total_dividends, 0);
  const capitalGain = totalCurrent - totalInvested;
  const totalPL = capitalGain + totalDividends;
  const totalPLPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Stocks</h1>
      <p className="text-slate-400 mb-6">Track stock positions, dividends, and P&L</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase mb-1">Invested</div>
          <div className="text-xl font-bold">{fmt(totalInvested)}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase mb-1">Current Value</div>
          <div className="text-xl font-bold">{fmt(totalCurrent)}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase mb-1">Capital Gain</div>
          <div className={`text-xl font-bold ${capitalGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {capitalGain >= 0 ? '+' : ''}{fmt(capitalGain)}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase mb-1">Total Dividends</div>
          <div className="text-xl font-bold text-green-500">{fmt(totalDividends)}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase mb-1">Total P&L</div>
          <div className={`text-xl font-bold ${totalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalPL >= 0 ? '+' : ''}{fmt(totalPL)} ({totalPL >= 0 ? '+' : ''}{totalPLPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-sm font-semibold"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Prices & Dividends'}
        </button>
        <button
          onClick={handleExportToAssets}
          disabled={exporting || positions.length === 0}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-sm font-semibold"
        >
          {exporting ? 'Exporting...' : 'Export to Assets'}
        </button>
      </div>

      {/* Broker groups */}
      {brokerNames.map((brokerName) => {
        const brokerPositions = brokerGroups[brokerName];
        const brokerInvested = brokerPositions.reduce((t, p) => t + p.shares * p.buy_price, 0);
        const brokerCurrent = brokerPositions.reduce((t, p) => t + p.shares * p.current_price, 0);
        const brokerDivs = brokerPositions.reduce((t, p) => t + p.total_dividends, 0);
        const brokerPL = brokerCurrent - brokerInvested + brokerDivs;

        return (
          <div key={brokerName} className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
              <div className="font-semibold text-base text-indigo-300">{brokerName}</div>
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${brokerPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {fmt(brokerCurrent)}
                </span>
                <button
                  onClick={() => handleDeleteBroker(brokerName)}
                  className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Symbol</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Shares</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Buy Price</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Buy Date</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Sell Price</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-center">Sell Date</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-right">Current</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-right">Value</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-right">Capital P/L</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-right">Dividends</th>
                    <th className="py-2 px-2 border-b border-slate-700 text-slate-400 text-[11px] uppercase text-right">Total P/L</th>
                    <th className="py-2 px-2 border-b border-slate-700"></th>
                  </tr>
                </thead>
                <tbody>
                  {brokerPositions.map((pos) => {
                    const invested = pos.shares * pos.buy_price;
                    const isSold = pos.sell_price > 0 && pos.sell_date;
                    const exitPrice = isSold ? pos.sell_price : pos.current_price;
                    const currentVal = pos.shares * exitPrice;
                    const capPL = currentVal - invested;
                    const posTotalPL = capPL + pos.total_dividends;
                    const plPct = invested > 0 ? (posTotalPL / invested) * 100 : 0;

                    return (
                      <tr key={pos.id} className="hover:bg-slate-950">
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <SymbolInput
                            defaultSymbol={pos.symbol}
                            onChange={(v) => handleChange(pos.id, 'symbol', v)}
                            onSelect={(sym) => handleChange(pos.id, 'symbol', sym)}
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[110px] text-center focus:outline-none focus:border-indigo-500 uppercase"
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <NumberInput
                            defaultValue={pos.shares}
                            step="1"
                            decimals={0}
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[80px] text-center focus:outline-none focus:border-indigo-500"
                            onChange={(v) => handleChange(pos.id, 'shares', v)}
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <NumberInput
                            defaultValue={pos.buy_price}
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[90px] text-center focus:outline-none focus:border-indigo-500"
                            onChange={(v) => handleChange(pos.id, 'buy_price', v)}
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <input
                            type="date"
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[130px] focus:outline-none focus:border-indigo-500"
                            defaultValue={pos.buy_date}
                            onChange={(e) => handleChange(pos.id, 'buy_date', e.target.value)}
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <NumberInput
                            defaultValue={pos.sell_price}
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[90px] text-center focus:outline-none focus:border-indigo-500"
                            onChange={(v) => handleChange(pos.id, 'sell_price', v)}
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-center align-middle">
                          <input
                            type="date"
                            className="bg-slate-950 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-[130px] focus:outline-none focus:border-indigo-500"
                            defaultValue={pos.sell_date}
                            onChange={(e) => handleChange(pos.id, 'sell_date', e.target.value)}
                          />
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-right text-slate-200">
                          {isSold ? fmt(pos.sell_price) : pos.current_price ? fmt(pos.current_price) : '—'}
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-right font-semibold">
                          {exitPrice ? fmt(currentVal) : '—'}
                        </td>
                        <td className={`py-2 px-2 border-b border-slate-800 text-right font-semibold ${capPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {exitPrice ? `${capPL >= 0 ? '+' : ''}${fmt(capPL)}` : '—'}
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-right font-semibold text-green-500">
                          {pos.total_dividends > 0 ? fmt(pos.total_dividends) : '—'}
                        </td>
                        <td className={`py-2 px-2 border-b border-slate-800 text-right font-semibold ${posTotalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {exitPrice ? (
                            <>
                              {posTotalPL >= 0 ? '+' : ''}{fmt(posTotalPL)}
                              <br />
                              <span className="text-xs text-slate-400">({posTotalPL >= 0 ? '+' : ''}{plPct.toFixed(2)}%)</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-2 border-b border-slate-800 text-right">
                          <button
                            onClick={() => handleDelete(pos.id)}
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

            <button
              onClick={() => handleAddPosition(brokerName)}
              className="mt-3 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
            >
              + Add Position
            </button>
          </div>
        );
      })}

      {/* Add broker */}
      <div className="flex gap-2 items-center relative mb-8">
        <div className="relative">
          <input
            className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-[220px] focus:outline-none focus:border-indigo-500"
            autoComplete="off"
            placeholder="Type broker name..."
            value={brokerInput}
            onChange={(e) => {
              setBrokerInput(e.target.value);
              setShowSuggestions(true);
              setHighlightedIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => {
              if (showSuggestions && filteredSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedIndex((i) => (i < filteredSuggestions.length - 1 ? i + 1 : 0));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex((i) => (i > 0 ? i - 1 : filteredSuggestions.length - 1));
                  return;
                }
                if (e.key === 'Enter' && highlightedIndex >= 0) {
                  e.preventDefault();
                  handleAddBroker(filteredSuggestions[highlightedIndex]);
                  return;
                }
              }
              if (e.key === 'Enter') handleAddBroker();
            }}
          />
          {showSuggestions && brokerInput && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 mt-1 w-[220px] bg-slate-900 border border-slate-600 rounded-md overflow-hidden shadow-lg max-h-[200px] overflow-y-auto">
              {filteredSuggestions.map((b, i) => (
                <button
                  key={b}
                  className={`w-full text-left px-2.5 py-2 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer ${i === highlightedIndex ? 'bg-slate-700' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAddBroker(b);
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleAddBroker()}
          disabled={!brokerInput.trim()}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-md text-sm"
        >
          + Add Broker
        </button>
      </div>
    </>
  );
}
