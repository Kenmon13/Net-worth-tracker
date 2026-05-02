import { useRef } from 'react';
import type { SimpleItem } from '../types';
import * as api from '../api';
import NumberInput from './NumberInput';

interface Props {
  title: string;
  category: string; // API path segment: bonds, cash, other, liabilities
  items: SimpleItem[];
  placeholder: string;
  sumColor?: string;
  sumPrefix?: string;
  onRefresh: () => void;
}

export default function SimpleList({ title, category, items, placeholder, sumColor = 'text-green-500', sumPrefix = '', onRefresh }: Props) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const total = items.reduce((t, i) => t + i.value, 0);
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function handleAdd() {
    await api.createSimpleItem(category);
    onRefresh();
  }

  function handleChange(item: SimpleItem, field: 'name' | 'value', value: string) {
    const key = `${item.id}-${field}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      const parsed = field === 'value' ? parseFloat(value) || 0 : value;
      await api.updateSimpleItem(category, item.id, { [field]: parsed });
      onRefresh();
    }, 500);
  }

  async function handleDelete(id: number) {
    await api.deleteSimpleItem(category, id);
    onRefresh();
  }

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
        {title}
        <span className={`text-base font-semibold ${sumColor}`}>{sumPrefix}{fmt(total)}</span>
      </h2>

      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[2fr_1fr_auto] gap-2 mb-2.5">
          <input
            className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
            placeholder={placeholder}
            defaultValue={item.name}
            onChange={(e) => handleChange(item, 'name', e.target.value)}
          />
          <NumberInput
            defaultValue={item.value}
            onChange={(v) => handleChange(item, 'value', v)}
          />
          <button
            onClick={() => handleDelete(item.id)}
            className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
          >
            x
          </button>
        </div>
      ))}

      <button
        onClick={handleAdd}
        className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
      >
        + Add {title.replace(/s$/, '')}
      </button>
    </div>
  );
}
