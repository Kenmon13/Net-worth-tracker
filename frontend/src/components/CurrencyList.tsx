import { useRef } from 'react';
import type { CurrencyItem, ForexRates } from '../types';
import * as api from '../api';
import NumberInput from './NumberInput';

const CURRENCIES = ['SGD', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'MYR', 'CNY'];

interface Props {
  title: string;
  category: string;
  items: CurrencyItem[];
  placeholder: string;
  forexRates: ForexRates;
  onRefresh: () => void;
}

export default function CurrencyList({ title, category, items, placeholder, forexRates, onRefresh }: Props) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function toSGD(amount: number, currency: string): number {
    return amount * (forexRates[currency] || 1);
  }

  const total = items.reduce((t, i) => t + toSGD(i.value, i.currency), 0);
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function handleAdd() {
    await api.createCurrencyItem(category);
    onRefresh();
  }

  function handleChange(item: CurrencyItem, field: 'name' | 'value' | 'currency', value: string) {
    if (field === 'currency') {
      // Currency change is immediate, no debounce
      api.updateCurrencyItem(category, item.id, { currency: value }).then(() => onRefresh());
      return;
    }
    const key = `${item.id}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const parsed = field === 'value' ? parseFloat(value) || 0 : value;
      await api.updateCurrencyItem(category, item.id, { [field]: parsed });
      onRefresh();
    }, 500);
  }

  async function handleDelete(id: number) {
    await api.deleteCurrencyItem(category, id);
    onRefresh();
  }

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
        {title}
        <span className="text-base font-semibold text-green-500">{fmt(total)}</span>
      </h2>

      {items.map((item) => {
        const sgdVal = toSGD(item.value, item.currency);
        return (
          <div key={item.id} className="grid grid-cols-[2fr_auto_1.2fr_1fr_auto] gap-2 mb-2.5">
            <input
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
              placeholder={placeholder}
              defaultValue={item.name}
              onChange={(e) => handleChange(item, 'name', e.target.value)}
            />
            <select
              className="bg-slate-950 border border-slate-600 text-slate-200 px-1.5 py-2 rounded-md text-sm focus:outline-none focus:border-indigo-500"
              value={item.currency}
              onChange={(e) => handleChange(item, 'currency', e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <NumberInput
              defaultValue={item.value}
              onChange={(v) => handleChange(item, 'value', v)}
            />
            <div className="self-center text-sm font-semibold text-green-500 text-right whitespace-nowrap">
              {item.currency !== 'SGD' ? `= ${fmt(sgdVal)} SGD` : ''}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
            >
              x
            </button>
          </div>
        );
      })}

      <button
        onClick={handleAdd}
        className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
      >
        + Add Item
      </button>
    </div>
  );
}
