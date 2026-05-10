import { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { Broker, BrokerCash, ForexRates, Stock } from '../types';
import { currencySymbol, fmt } from '../utils';
import * as api from '../api';
import type { SymbolResult } from '../api';
import NumberInput from './NumberInput';
import { POPULAR_STOCKS } from '../popularStocks';

const CASH_CURRENCIES = ['SGD', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'MYR', 'CNY'];

const ENDOWUS_FUNDS = [
  'Capital Group New Perspective Fund',
  'GMO Quality Investment Fund',
  'PIMCO GIS Income Fund SGD-Hedged',
  'AB American Income Portfolio Fund SGD-Hedged',
  'Allianz Income and Growth Fund SGD-Hedged (Dist.)',
  'AllianzGI Global Artificial Intelligence Fund',
  'Franklin Templeton Technology Fund',
  'Fidelity Global Technology Fund',
  'Thematics AM AI and Robotics Fund',
  'iShares US Index Fund (IE) S&P 500',
  'Amundi Singapore Straits Times (STI) Fund',
  'Amundi Prime USA Fund',
  'Amundi Core MSCI Emerging Markets Fund',
  'iShares Developed World Index Fund (IE)',
  'Amundi Index MSCI World Fund',
  'BlackRock BGF Next Generation Technology Fund',
  'Allianz Europe Equity Growth Fund',
  'Janus Henderson Horizon Biotechnology Fund',
  'Ashoka WhiteOak India Opportunities Fund',
  'T. Rowe Price Funds SICAV - Global Value Equity Fund SGD-Hedged',
  'M&G Emerging Markets Bond Fund SGD-Hedged',
  'BNY Mellon U.S. Municipal Infrastructure Debt Fund SGD-Hedged (Dist.)',
  'Franklin Shariah Technology Fund',
  'GMO Climate Change Investment Fund',
  'Allspring Climate Transition Global Investment Grade Credit Fund',
  'Franklin Global Sukuk Fund (Dist.)',
  'Schroder ISF Asian Opportunities Fund',
  'BlackRock BGF European Equity Income Fund SGD-Hedged (Dist.)',
  'PIMCO GIS Income Fund SGD-Hedged (Dist.)',
];

function FundNameInput({ defaultValue, onChange }: { defaultValue: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(defaultValue);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = query
    ? ENDOWUS_FUNDS.filter((f) => f.toLowerCase().includes(query.toLowerCase()))
    : ENDOWUS_FUNDS;

  function updateDropdownPos() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }

  function handleInput(value: string) {
    setQuery(value);
    onChange(value);
    setShow(true);
    updateDropdownPos();
  }

  function selectFund(name: string) {
    setQuery(name);
    onChange(name);
    setShow(false);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
        placeholder="e.g. Global Technology Fund"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { updateDropdownPos(); setShow(true); }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
      />
      {show && filtered.length > 0 && ReactDOM.createPortal(
        <div
          className="fixed z-50 bg-slate-900 border border-slate-600 rounded-md overflow-hidden shadow-lg max-h-[200px] overflow-y-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {filtered.map((f) => (
            <button
              key={f}
              className="w-full text-left px-2.5 py-2 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault();
                selectFund(f);
              }}
            >
              {f}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function searchLocal(q: string): SymbolResult[] {
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();
  // Exact symbol prefix matches first, then name matches
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

function SymbolInput({ stock, onChange, onSelect }: { stock: Stock; onChange: (value: string) => void; onSelect?: (symbol: string) => void }) {
  const [query, setQuery] = useState(stock.symbol);
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
      // Show local results instantly
      const local = searchLocal(value);
      setSuggestions(local);
      setShow(true);
      updateDropdownPos();

      // Fetch from Yahoo in background and merge new results
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
        className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500"
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

interface Props {
  broker: Broker;
  stocks: Stock[];
  brokerCash: BrokerCash[];
  forexRates: ForexRates;
  onRefresh: () => void;
}

export default function BrokerGroup({ broker, stocks, brokerCash, forexRates, onRefresh }: Props) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  function toSGD(amount: number, currency: string): number {
    return amount * (forexRates[currency] || 1);
  }

  const brokerStocksSGD = stocks.reduce((t, s) => t + toSGD(s.shares * s.price, s.currency), 0);
  const brokerCashSGD = brokerCash.reduce((t, c) => t + toSGD(c.amount, c.currency), 0);
  const brokerTotal = brokerStocksSGD + brokerCashSGD;

  const existingCurrencies = brokerCash.map((c) => c.currency);
  const availableCurrencies = CASH_CURRENCIES.filter((c) => !existingCurrencies.includes(c));

  const isSimpleBroker = broker.name === 'EndowUs';
  const isVesting = broker.name === 'Vesting Stocks';

  async function handleAddStock() {
    if (isSimpleBroker) {
      await api.createStock(broker.id, { shares: 1 });
    } else {
      await api.createStock(broker.id);
    }
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
      const numericFields = ['shares', 'cost'];
      const parsed = numericFields.includes(field) ? parseFloat(value) || 0 : value;
      await api.updateStock(stock.id, { [field]: parsed });
      onRefresh();
    }, 500);
  }

  async function handleSymbolSelect(stockId: number, symbol: string) {
    const data = await api.getStockPrice(symbol);
    if (data.price != null) {
      const updates: Record<string, unknown> = { price: data.price };
      if (data.currency) updates.currency = data.currency;
      await api.updateStock(stockId, updates);
      onRefresh();
    }
  }

  function handleCashChange(cashId: number, value: string) {
    const key = `broker-cash-${cashId}`;
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      await api.updateBrokerCash(cashId, parseFloat(value) || 0);
      onRefresh();
    }, 500);
  }

  async function handleAddCash(currency: string) {
    await api.createBrokerCash(broker.id, currency);
    setShowCurrencyPicker(false);
    onRefresh();
  }

  async function handleDeleteCash(id: number) {
    await api.deleteBrokerCash(id);
    onRefresh();
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
          <span className="text-green-500 font-semibold">{fmt(brokerTotal, 'SGD')}</span>
          <button
            onClick={handleRemoveBroker}
            className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
          >
            Remove
          </button>
        </div>
      </div>

      {isSimpleBroker ? (
        <>
          {stocks.length > 0 && (
            <div className="grid grid-cols-[2fr_1fr_auto] gap-2 mb-1 text-[11px] text-slate-400 uppercase">
              <div>Fund Name</div>
              <div>Value</div>
              <div></div>
            </div>
          )}
          {stocks.map((s) => (
            <div key={s.id} className="grid grid-cols-[2fr_1fr_auto] gap-2 mb-2.5">
              <FundNameInput
                defaultValue={s.symbol}
                onChange={(v) => handleStockChange(s, 'symbol', v)}
              />
              <NumberInput
                defaultValue={s.price}
                onChange={(v) => {
                  const key = `${s.id}-price`;
                  clearTimeout(debounceTimers.current[key]);
                  debounceTimers.current[key] = setTimeout(async () => {
                    await api.updateStock(s.id, { price: parseFloat(v) || 0 });
                    onRefresh();
                  }, 500);
                }}
              />
              <button
                onClick={() => handleDeleteStock(s.id)}
                className="bg-red-950 hover:bg-red-900 text-white px-2.5 py-1.5 rounded-md text-sm"
              >
                x
              </button>
            </div>
          ))}
          <button
            onClick={handleAddStock}
            className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
          >
            + Add Index
          </button>
        </>
      ) : isVesting ? (
        <>
          <div className="overflow-x-auto -mx-3.5 px-3.5">
            <div className="min-w-[450px]">
              {stocks.length > 0 && (
                <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto] gap-2 mb-1 text-[11px] text-slate-400 uppercase">
                  <div>Symbol</div>
                  <div>Shares</div>
                  <div>Current</div>
                  <div>SGD Value</div>
                  <div></div>
                </div>
              )}
              {stocks.map((s) => {
                const cur = s.currency || 'SGD';
                const value = s.shares * s.price;
                const sgdValue = toSGD(value, cur);

                return (
                  <div key={s.id} className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto] gap-2 mb-2.5">
                    <SymbolInput
                      stock={s}
                      onChange={(v) => handleStockChange(s, 'symbol', v)}
                      onSelect={(sym) => handleSymbolSelect(s.id, sym)}
                    />
                    <NumberInput
                      defaultValue={s.shares}
                      step="1"
                      decimals={0}
                      onChange={(v) => handleStockChange(s, 'shares', v)}
                    />
                    <div className="self-center text-slate-200 text-sm px-2.5">{s.price ? fmt(s.price, cur) : '—'}</div>
                    <div className="self-center text-green-500 font-semibold text-sm">
                      {s.price ? fmt(Math.abs(sgdValue), 'SGD') : '—'}
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
            </div>
          </div>
          <button
            onClick={handleAddStock}
            className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
          >
            + Add Stock
          </button>
        </>
      ) : (
        <>
          <div className="overflow-x-auto -mx-3.5 px-3.5">
            <div className="min-w-[500px]">
              {stocks.length > 0 && (
                <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_0.8fr_auto] gap-2 mb-1 text-[11px] text-slate-400 uppercase">
                  <div>Symbol</div>
                  <div>Shares</div>
                  <div>Current</div>
                  <div>Value</div>
                  <div>SGD Value</div>
                  <div></div>
                </div>
              )}

              {stocks.map((s) => {
                const isShort = s.shares < 0;
                const value = s.shares * s.price;
                const cur = s.currency || 'SGD';
                const sgdValue = toSGD(value, cur);

                return (
                  <div key={s.id} className="grid grid-cols-[1.2fr_0.7fr_0.9fr_1fr_0.8fr_auto] gap-2 mb-2.5">
                    <SymbolInput
                      stock={s}
                      onChange={(value) => handleStockChange(s, 'symbol', value)}
                      onSelect={(sym) => handleSymbolSelect(s.id, sym)}
                    />
                    <NumberInput
                      defaultValue={s.shares}
                      step="1"
                      decimals={0}
                      onChange={(v) => handleStockChange(s, 'shares', v)}
                    />
                    <div className="self-center text-slate-200 text-sm px-2.5">{s.price ? fmt(s.price, cur) : '—'}</div>
                    <div className={`self-center font-semibold text-sm ${isShort ? 'text-orange-400' : 'text-green-500'}`}>
                      {fmt(Math.abs(value), cur)}{isShort ? ' (S)' : ''}
                    </div>
                    <div className="self-center text-slate-300 text-sm font-semibold">
                      {s.price ? fmt(Math.abs(sgdValue), 'SGD') : '—'}
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
            </div>
          </div>

          <button
            onClick={handleAddStock}
            className="mt-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
          >
            + Add Stock
          </button>
        </>
      )}

      {/* Cash entries */}
      {brokerCash.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          {brokerCash.map((c) => (
            <div key={c.id} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 uppercase w-[60px]">Cash ({c.currency})</span>
              <NumberInput
                defaultValue={c.amount}
                className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-[150px] focus:outline-none focus:border-indigo-500"
                onChange={(v) => handleCashChange(c.id, v)}
              />
              <span className="text-xs text-slate-500">{c.currency !== 'SGD' ? `= ${fmt(toSGD(c.amount, c.currency), 'SGD')}` : ''}</span>
              <button
                onClick={() => handleDeleteCash(c.id)}
                className="bg-red-950 hover:bg-red-900 text-white px-2 py-1 rounded-md text-xs ml-auto"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add cash currency */}
      <div className="mt-2 relative">
        {availableCurrencies.length > 0 && (
          <>
            <button
              onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
              onBlur={() => setTimeout(() => setShowCurrencyPicker(false), 150)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-md text-sm"
            >
              + Add Cash
            </button>
            {showCurrencyPicker && (
              <div className="absolute z-10 bottom-full left-0 mb-1 bg-slate-900 border border-slate-600 rounded-md overflow-hidden shadow-lg">
                {availableCurrencies.map((cur) => (
                  <button
                    key={cur}
                    className="block w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddCash(cur);
                    }}
                  >
                    {cur} ({currencySymbol(cur).trim()})
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
