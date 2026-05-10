import { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import * as api from '../api';
import type { SymbolResult } from '../api';
import { POPULAR_STOCKS } from '../popularStocks';

function searchLocal(q: string): SymbolResult[] {
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();
  const symbolMatches: SymbolResult[] = [];
  const nameMatches: SymbolResult[] = [];
  for (const s of POPULAR_STOCKS) {
    if (s.symbol.toUpperCase().startsWith(upper)) {
      symbolMatches.push({ symbol: s.symbol, name: s.name, type: 'EQUITY', exchange: s.exchange });
    } else if (s.name.toLowerCase().includes(lower)) {
      nameMatches.push({ symbol: s.symbol, name: s.name, type: 'EQUITY', exchange: s.exchange });
    }
  }
  return [...symbolMatches, ...nameMatches].slice(0, 8);
}

interface Props {
  defaultSymbol: string;
  onChange: (value: string) => void;
  onSelect?: (symbol: string) => void;
  className?: string;
}

export default function SymbolInput({ defaultSymbol, onChange, onSelect, className }: Props) {
  const [query, setQuery] = useState(defaultSymbol);
  const [suggestions, setSuggestions] = useState<SymbolResult[]>([]);
  const [show, setShow] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  function updateDropdownPos() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }

  function handleInput(value: string) {
    setQuery(value);
    onChange(value);
    setHighlightedIndex(-1);
    clearTimeout(searchTimer.current);
    if (value.length >= 1) {
      const local = searchLocal(value);
      setSuggestions(local);
      setShow(true);
      updateDropdownPos();

      searchTimer.current = setTimeout(async () => {
        const remote = await api.searchSymbols(value);
        setSuggestions((prev) => {
          const seen = new Set(prev.map((s) => s.symbol));
          const merged = [...prev, ...remote.filter((r) => !seen.has(r.symbol))];
          return merged.slice(0, 8);
        });
      }, 150);
    } else {
      setSuggestions([]);
      setShow(false);
    }
  }

  function selectSymbol(symbol: string) {
    setQuery(symbol);
    onChange(symbol);
    setShow(false);
    setSuggestions([]);
    onSelect?.(symbol);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={className || "bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"}
        placeholder="AAPL"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) { updateDropdownPos(); setShow(true); } }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        onKeyDown={(e) => {
          if (!show || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
          } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            selectSymbol(suggestions[highlightedIndex].symbol);
          } else if (e.key === 'Escape') {
            setShow(false);
          }
        }}
      />
      {show && suggestions.length > 0 && ReactDOM.createPortal(
        <div
          className="fixed z-50 w-[280px] bg-slate-900 border border-slate-600 rounded-md overflow-hidden shadow-lg max-h-[240px] overflow-y-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.symbol}
              className={`w-full text-left px-2.5 py-2 text-sm hover:bg-slate-700 cursor-pointer flex justify-between items-center gap-2 ${i === highlightedIndex ? 'bg-slate-700' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSymbol(s.symbol);
              }}
            >
              <div>
                <span className="text-indigo-300 font-semibold">{s.symbol}</span>
                <span className="text-slate-400 ml-2 text-xs">{s.name}</span>
              </div>
              <span className="text-slate-500 text-xs shrink-0">{s.exchange}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
