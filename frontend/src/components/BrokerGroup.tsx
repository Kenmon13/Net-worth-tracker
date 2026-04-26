import { useRef } from 'react';
import type { Broker, Stock } from '../types';
import { fmt } from '../utils';
import * as api from '../api';

interface Props {
  broker: Broker;
  stocks: Stock[];
  onRefresh: () => void;
}

export default function BrokerGroup({ broker, stocks, onRefresh }: Props) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const brokerSum = stocks.reduce((t, s) => t + s.shares * s.price, 0);

  async function handleAddStock() {
    await api.createStock(broker.id);
    onRefresh();
  }

  async function handleRemoveBroker() {
    if (!confirm(`Remove ${broker.name} and all its stocks?`)) return;
    await api.deleteBroker(broker.id);
    onRefresh();
  }

  function handleStockChange(stock: Stock, field: keyof Stock, value: string) {
    const key = `${stock.id}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const numericFields = ['shares', 'price', 'cost'];
      const parsed = numericFields.includes(field) ? parseFloat(value) || 0 : value;
      await api.updateStock(stock.id, { [field]: parsed });
      onRefresh();
    }, 500);
  }

  async function handleDeleteStock(id: number) {
    await api.deleteStock(id);
    onRefresh();
  }

  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3.5 mb-3">
      <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-700">
        <div className="font-semibold text-base text-indigo-300">{broker.name}</div>
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-semibold">{fmt(brokerSum)}</span>
          <button
            onClick={handleRemoveBroker}
            className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
          >
            Remove
          </button>
        </div>
      </div>

      {stocks.length > 0 && (
        <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_0.9fr_1fr_1fr_auto] gap-2 mb-1 text-[11px] text-slate-400 uppercase">
          <div>Symbol</div>
          <div>Shares</div>
          <div>Buy Price</div>
          <div>Current</div>
          <div>Value</div>
          <div>P/L</div>
          <div></div>
        </div>
      )}

      {stocks.map((s) => {
        const value = s.shares * s.price;
        const cost = s.shares * s.cost;
        const pl = value - cost;
        const plPct = cost > 0 ? (pl / cost) * 100 : 0;
        const isPositive = pl >= 0;
        const sign = isPositive ? '+' : '-';
        const plText = cost > 0 ? `${sign}${fmt(Math.abs(pl))} (${sign}${Math.abs(plPct).toFixed(2)}%)` : '\u2014';

        return (
          <div key={s.id} className="grid grid-cols-[1.2fr_0.7fr_0.9fr_0.9fr_1fr_1fr_auto] gap-2 mb-2.5">
            <input
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
              placeholder="AAPL"
              defaultValue={s.symbol}
              onChange={(e) => handleStockChange(s, 'symbol', e.target.value)}
            />
            <input
              type="number"
              step="0.0001"
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
              defaultValue={s.shares}
              onChange={(e) => handleStockChange(s, 'shares', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
              defaultValue={s.cost}
              onChange={(e) => handleStockChange(s, 'cost', e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
              defaultValue={s.price}
              onChange={(e) => handleStockChange(s, 'price', e.target.value)}
            />
            <div className="self-center text-green-500 font-semibold text-sm text-right">{fmt(value)}</div>
            <div className={`self-center font-semibold text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
              {plText}
            </div>
            <button
              onClick={() => handleDeleteStock(s.id)}
              className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
            >
              x
            </button>
          </div>
        );
      })}

      <button
        onClick={handleAddStock}
        className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
      >
        + Add Stock
      </button>
    </div>
  );
}
