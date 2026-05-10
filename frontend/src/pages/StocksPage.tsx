import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  async function handleAddSell(positionId: number) {
    await api.createSell(positionId, { date: new Date().toISOString().slice(0, 10) });
    refresh();
  }

  function handleSellChange(sellId: number, field: string, value: string) {
    const key = `sell-${sellId}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const numericFields = ['shares', 'price'];
      const parsed = numericFields.includes(field) ? parseFloat(value) || 0 : value;
      await api.updateSell(sellId, { [field]: parsed });
      refresh();
    }, 500);
  }

  async function handleDeleteSell(sellId: number) {
    await api.deleteSell(sellId);
    refresh();
  }

  async function handleAddBuyLot(positionId: number) {
    await api.createBuy(positionId, { date: new Date().toISOString().slice(0, 10) });
    refresh();
  }

  function handleBuyChange(buyId: number, field: string, value: string) {
    const key = `buy-${buyId}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const numericFields = ['shares', 'price'];
      const parsed = numericFields.includes(field) ? parseFloat(value) || 0 : value;
      await api.updateBuy(buyId, { [field]: parsed });
      refresh();
    }, 500);
  }

  async function handleDeleteBuy(buyId: number) {
    await api.deleteBuy(buyId);
    refresh();
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
  const totalInvested = positions.reduce((t, p) => {
    const additionalInvested = p.buys.reduce((s, b) => s + b.shares * b.price, 0);
    return t + p.shares * p.buy_price + additionalInvested;
  }, 0);
  const totalCurrent = positions.reduce((t, p) => {
    const additionalShares = p.buys.reduce((s, b) => s + b.shares, 0);
    const soldShares = p.sells.reduce((s, sell) => s + sell.shares, 0);
    const soldValue = p.sells.reduce((s, sell) => s + sell.shares * sell.price, 0);
    const remainingShares = p.shares + additionalShares - soldShares;
    return t + soldValue + remainingShares * p.current_price;
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

      {/* Symbol summary (aggregated across brokers) */}
      {(() => {
        const symbolMap: Record<string, { name: string; totalShares: number; totalInvested: number; totalCurrent: number; totalDividends: number; currentPrice: number; currency: string }> = {};
        for (const pos of positions) {
          if (!pos.symbol) continue;
          const sym = pos.symbol.toUpperCase();
          if (!symbolMap[sym]) symbolMap[sym] = { name: '', totalShares: 0, totalInvested: 0, totalCurrent: 0, totalDividends: 0, currentPrice: pos.current_price, currency: pos.currency };
          if (pos.name && !symbolMap[sym].name) symbolMap[sym].name = pos.name;
          const additionalInvested = pos.buys.reduce((s, b) => s + b.shares * b.price, 0);
          const additionalShares = pos.buys.reduce((s, b) => s + b.shares, 0);
          const soldShares = pos.sells.reduce((s, sell) => s + sell.shares, 0);
          const soldValue = pos.sells.reduce((s, sell) => s + sell.shares * sell.price, 0);
          const remainingShares = pos.shares + additionalShares - soldShares;
          symbolMap[sym].totalShares += remainingShares;
          symbolMap[sym].totalInvested += pos.shares * pos.buy_price + additionalInvested;
          symbolMap[sym].totalCurrent += soldValue + remainingShares * pos.current_price;
          symbolMap[sym].totalDividends += pos.total_dividends;
          symbolMap[sym].currentPrice = pos.current_price;
        }
        const symbols = Object.entries(symbolMap).sort((a, b) => b[1].totalCurrent - a[1].totalCurrent);
        if (symbols.length === 0) return null;
        return (
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
            <div className="font-semibold text-base text-slate-300 mb-3 pb-2 border-b border-slate-700">Summary</div>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 gap-y-2 text-sm">
              <div className="text-[10px] text-slate-500 uppercase">Symbol</div>
              <div className="text-[10px] text-slate-500 uppercase text-right">Shares</div>
              <div className="text-[10px] text-slate-500 uppercase text-right">Dividends</div>
              <div className="text-[10px] text-slate-500 uppercase text-right">Current Value</div>
              <div className="text-[10px] text-slate-500 uppercase text-right">P/L</div>
              {symbols.map(([sym, data]) => {
                const pl = data.totalCurrent - data.totalInvested + data.totalDividends;
                const plPct = data.totalInvested > 0 ? (pl / data.totalInvested) * 100 : 0;
                return (
                  <React.Fragment key={sym}>
                    <div>
                      <span className="font-semibold text-indigo-300">{sym}</span>
                      {data.name && <span className="text-slate-500 text-xs ml-2">{data.name}</span>}
                    </div>
                    <div className="text-right text-slate-300">{data.totalShares}</div>
                    <div className="text-right text-green-500">{data.totalDividends > 0 ? fmt(data.totalDividends) : '—'}</div>
                    <div className="text-right text-slate-300">{fmt(data.totalCurrent)}</div>
                    <div className={`text-right font-semibold ${pl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pl >= 0 ? '+' : ''}{fmt(pl)} <span className="text-xs">({pl >= 0 ? '+' : ''}{plPct.toFixed(1)}%)</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Broker groups */}
      {brokerNames.map((brokerName) => {
        const brokerPositions = brokerGroups[brokerName];
        const brokerCurrent = brokerPositions.reduce((t, p) => {
          const additionalShares = p.buys.reduce((s, b) => s + b.shares, 0);
          const soldShares = p.sells.reduce((s, sell) => s + sell.shares, 0);
          const soldValue = p.sells.reduce((s, sell) => s + sell.shares * sell.price, 0);
          const remainingShares = p.shares + additionalShares - soldShares;
          return t + soldValue + remainingShares * p.current_price;
        }, 0);

        return (
          <div key={brokerName} className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
              <div className="font-semibold text-base text-indigo-300">{brokerName}</div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-green-500">{fmt(brokerCurrent)}</span>
                <button
                  onClick={() => handleDeleteBroker(brokerName)}
                  className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
                >
                  Remove
                </button>
              </div>
            </div>

            {brokerPositions.map((pos) => {
              const additionalInvested = pos.buys.reduce((s, b) => s + b.shares * b.price, 0);
              const additionalShares = pos.buys.reduce((s, b) => s + b.shares, 0);
              const invested = pos.shares * pos.buy_price + additionalInvested;
              const soldShares = pos.sells.reduce((s, sell) => s + sell.shares, 0);
              const soldValue = pos.sells.reduce((s, sell) => s + sell.shares * sell.price, 0);
              const remainingShares = pos.shares + additionalShares - soldShares;
              const currentVal = soldValue + remainingShares * pos.current_price;
              const capPL = currentVal - invested;
              const posTotalPL = capPL + pos.total_dividends;
              const plPct = invested > 0 ? (posTotalPL / invested) * 100 : 0;

              return (
                <div key={pos.id} className="bg-slate-950 border border-slate-700 rounded-lg p-3 mb-3">
                  {/* Position header row */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-[110px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Symbol</div>
                      <SymbolInput
                        defaultSymbol={pos.symbol}
                        onChange={(v) => handleChange(pos.id, 'symbol', v)}
                        onSelect={async (sym, name) => {
                          const updates: Record<string, unknown> = { symbol: sym };
                          if (name) updates.name = name;
                          await api.updatePosition(pos.id, updates);
                          const priceData = await api.getStockPrice(sym);
                          if (priceData.price != null) {
                            await api.updatePosition(pos.id, { current_price: priceData.price, currency: priceData.currency || undefined } as Record<string, unknown>);
                          }
                          refresh();
                        }}
                        className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500 uppercase"
                      />
                    </div>
                    <div className="w-[80px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Shares</div>
                      <NumberInput
                        defaultValue={pos.shares}
                        step="1"
                        decimals={0}
                        className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-full text-center focus:outline-none focus:border-indigo-500"
                        onChange={(v) => handleChange(pos.id, 'shares', v)}
                      />
                    </div>
                    <div className="w-[90px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Buy Price</div>
                      <NumberInput
                        defaultValue={pos.buy_price}
                        className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-full text-center focus:outline-none focus:border-indigo-500"
                        onChange={(v) => handleChange(pos.id, 'buy_price', v)}
                      />
                    </div>
                    <div className="w-[130px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Buy Date</div>
                      <input
                        type="date"
                        className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1.5 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
                        defaultValue={pos.buy_date}
                        onChange={(e) => handleChange(pos.id, 'buy_date', e.target.value)}
                      />
                    </div>
                    <div className="w-[70px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Current</div>
                      <div className="text-sm text-slate-200 py-1.5">{pos.current_price ? fmt(pos.current_price) : '—'}</div>
                    </div>
                    <div className="w-[60px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Remaining</div>
                      <div className="text-sm text-slate-200 py-1.5">{remainingShares}</div>
                    </div>
                    <div className="w-[80px] shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">Dividends</div>
                      <div className="text-sm text-green-500 font-semibold py-1.5">{pos.total_dividends > 0 ? fmt(pos.total_dividends) : '—'}</div>
                    </div>
                    <div className="shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase mb-0.5">P/L</div>
                      <div className={`text-sm font-semibold py-1.5 ${posTotalPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {pos.current_price || pos.sells.length > 0 ? (
                          <>{posTotalPL >= 0 ? '+' : ''}{fmt(posTotalPL)} <span className="text-xs">({posTotalPL >= 0 ? '+' : ''}{plPct.toFixed(1)}%)</span></>
                        ) : '—'}
                      </div>
                    </div>
                    <div className="ml-auto shrink-0">
                      <div className="text-[10px] text-transparent mb-0.5">.</div>
                      <button
                        onClick={() => handleDelete(pos.id)}
                        className="bg-red-950 hover:bg-red-900 text-white px-2 py-1 rounded-md text-xs"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {/* Sell lots */}
                  {pos.sells.length > 0 && (
                    <div className="ml-4 mt-2 border-l-2 border-slate-700 pl-3">
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Sells</div>
                      {pos.sells.map((sell) => (
                        <div key={sell.id} className="flex items-center gap-3 mb-1.5">
                          <div className="w-[80px]">
                            <NumberInput
                              defaultValue={sell.shares}
                              step="1"
                              decimals={0}
                              className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-full text-center focus:outline-none focus:border-indigo-500"
                              onChange={(v) => handleSellChange(sell.id, 'shares', v)}
                            />
                          </div>
                          <span className="text-slate-500 text-xs">shares @</span>
                          <div className="w-[80px]">
                            <NumberInput
                              defaultValue={sell.price}
                              className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-full text-center focus:outline-none focus:border-indigo-500"
                              onChange={(v) => handleSellChange(sell.id, 'price', v)}
                            />
                          </div>
                          <span className="text-slate-500 text-xs">on</span>
                          <input
                            type="date"
                            className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-[120px] focus:outline-none focus:border-indigo-500"
                            defaultValue={sell.date}
                            onChange={(e) => handleSellChange(sell.id, 'date', e.target.value)}
                          />
                          <span className="text-slate-400 text-xs">
                            = {fmt(sell.shares * sell.price)}
                          </span>
                          <button
                            onClick={() => handleDeleteSell(sell.id)}
                            className="bg-red-950 hover:bg-red-900 text-white px-2 py-0.5 rounded text-xs ml-1"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Additional buys */}
                  {pos.buys.length > 0 && (
                    <div className="ml-4 mt-2 border-l-2 border-green-800 pl-3">
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Additional Buys</div>
                      {pos.buys.map((buy) => (
                        <div key={buy.id} className="flex items-center gap-3 mb-1.5">
                          <div className="w-[80px]">
                            <NumberInput
                              defaultValue={buy.shares}
                              step="1"
                              decimals={0}
                              className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-full text-center focus:outline-none focus:border-indigo-500"
                              onChange={(v) => handleBuyChange(buy.id, 'shares', v)}
                            />
                          </div>
                          <span className="text-slate-500 text-xs">shares @</span>
                          <div className="w-[80px]">
                            <NumberInput
                              defaultValue={buy.price}
                              className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-full text-center focus:outline-none focus:border-indigo-500"
                              onChange={(v) => handleBuyChange(buy.id, 'price', v)}
                            />
                          </div>
                          <span className="text-slate-500 text-xs">on</span>
                          <input
                            type="date"
                            className="bg-slate-900 border border-slate-600 text-slate-200 px-2 py-1 rounded-md text-xs w-[120px] focus:outline-none focus:border-indigo-500"
                            defaultValue={buy.date}
                            onChange={(e) => handleBuyChange(buy.id, 'date', e.target.value)}
                          />
                          <span className="text-slate-400 text-xs">
                            = {fmt(buy.shares * buy.price)}
                          </span>
                          <button
                            onClick={() => handleDeleteBuy(buy.id)}
                            className="bg-red-950 hover:bg-red-900 text-white px-2 py-0.5 rounded text-xs ml-1"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 mt-2 ml-4">
                    <button
                      onClick={() => handleAddBuyLot(pos.id)}
                      className="text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      + Add Buy
                    </button>
                    <button
                      onClick={() => handleAddSell(pos.id)}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      + Add Sell
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => handleAddPosition(brokerName)}
              className="mt-2 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
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
