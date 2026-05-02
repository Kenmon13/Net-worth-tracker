import { useCallback, useEffect, useRef, useState } from 'react';
import type { ForexRates, Portfolio } from '../types';
import * as api from '../api';
import Summary from '../components/Summary';
import BrokerGroup from '../components/BrokerGroup';
import SimpleList from '../components/SimpleList';
import CPFSection from '../components/CPFSection';

const BROKERS_LIST = [
  'Fidelity', 'Schwab', 'Vanguard', 'Robinhood', 'E*TRADE',
  'Interactive Brokers', 'TD Ameritrade', 'Merrill', 'Webull',
  'moomoo', 'Tiger Brokers', 'SGX', 'EndowUs', 'CDP', 'Vesting Stocks', 'Other',
];

export default function TrackerPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [forexRates, setForexRates] = useState<ForexRates>({ SGD: 1 });
  const [brokerInput, setBrokerInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [data, rates] = await Promise.all([api.getPortfolio(), api.getForexRates()]);
    setPortfolio(data);
    setForexRates(rates);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!portfolio) return <div className="text-slate-400 py-10 text-center">Loading...</div>;

  const toSGD = (amount: number, currency: string) => amount * (forexRates[currency] || 1);
  const brokerCashTotal = portfolio.broker_cash.reduce((t, c) => t + toSGD(c.amount, c.currency), 0);
  const stocksTotal = portfolio.stocks.reduce((t, s) => t + toSGD(s.shares * s.price, s.currency), 0) + brokerCashTotal;
  const bondsTotal = portfolio.bonds.reduce((t, i) => t + i.value, 0);
  const cashTotal = portfolio.cash.reduce((t, i) => t + i.value, 0);
  const otherTotal = portfolio.other.reduce((t, i) => t + i.value, 0);
  const insuranceTotal = portfolio.insurance.reduce((t, i) => t + i.value, 0);
  const liabTotal = portfolio.liabilities.reduce((t, i) => t + i.value, 0);
  const cpfTotal = portfolio.cpf.oa + portfolio.cpf.sa + portfolio.cpf.ma;

  const existingBrokerNames = portfolio.brokers.map((b) => b.name);
  const availableBrokers = BROKERS_LIST.filter((b) => !existingBrokerNames.includes(b));
  const filteredSuggestions = availableBrokers.filter((b) =>
    b.toLowerCase().includes(brokerInput.toLowerCase())
  );

  async function handleAddBroker(name?: string) {
    const brokerName = (name || brokerInput).trim();
    if (!brokerName) return;
    await api.createBroker(brokerName);
    setBrokerInput('');
    setShowSuggestions(false);
    refresh();
  }

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      await api.refreshStockPrices();
      const [data, rates] = await Promise.all([api.getPortfolio(), api.getForexRates()]);
      setPortfolio(data);
      setForexRates(rates);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExport() {
    const data = await api.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `networth-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="text-3xl font-bold mb-1">Net Worth Tracker</h1>
      <p className="text-slate-400 mb-6">Track stocks across brokers, bonds, cash, and other assets</p>

      <Summary
        stocksTotal={stocksTotal}
        bondsTotal={bondsTotal}
        cashTotal={cashTotal}
        cpfTotal={cpfTotal}
        insuranceTotal={insuranceTotal}
        otherTotal={otherTotal}
        liabTotal={liabTotal}
      />

      {/* Liquid */}
      <h2 className="text-xl font-bold mb-3 text-slate-300">Liquid</h2>

      {/* Equities section */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5" style={{ gridColumn: '1 / -1' }}>
        <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
          Equities
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-sm font-semibold"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Prices'}
            </button>
            <span className="text-base font-semibold text-green-500">
              ${stocksTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </h2>

        {portfolio.brokers.length === 0 && (
          <div className="text-slate-400 py-2 text-sm">No brokers added yet. Pick one below and click "Add Broker".</div>
        )}

        {portfolio.brokers.map((broker) => (
          <BrokerGroup
            key={broker.id}
            broker={broker}
            stocks={portfolio.stocks.filter((s) => s.broker_id === broker.id)}
            brokerCash={portfolio.broker_cash.filter((c) => c.broker_id === broker.id)}
            forexRates={forexRates}
            onRefresh={refresh}
          />
        ))}

        <div className="flex gap-2 mt-2.5 items-center relative">
          <div className="relative">
            <input
              className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-[220px] focus:outline-none focus:border-indigo-500"
              placeholder="Type broker name..."
              value={brokerInput}
              onChange={(e) => {
                setBrokerInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddBroker();
              }}
            />
            {showSuggestions && brokerInput && filteredSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 top-full left-0 mt-1 w-[220px] bg-slate-900 border border-slate-600 rounded-md overflow-hidden shadow-lg"
              >
                {filteredSuggestions.map((b) => (
                  <button
                    key={b}
                    className="w-full text-left px-2.5 py-2 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer"
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <SimpleList
          title="Bonds"
          category="bonds"
          items={portfolio.bonds}
          placeholder="e.g. 10yr Treasury"
          onRefresh={refresh}
        />
        <SimpleList
          title="Cash"
          category="cash"
          items={portfolio.cash}
          placeholder="e.g. Chase Checking"
          onRefresh={refresh}
        />
      </div>

      {/* Illiquid */}
      <h2 className="text-xl font-bold mb-3 text-slate-300">Illiquid</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <CPFSection cpf={portfolio.cpf} onRefresh={refresh} />
        <SimpleList
          title="Insurance"
          category="insurance"
          items={portfolio.insurance}
          placeholder="e.g. Whole Life, ILP"
          onRefresh={refresh}
        />
        <SimpleList
          title="Other Assets"
          category="other"
          items={portfolio.other}
          placeholder="e.g. Crypto, Real Estate"
          onRefresh={refresh}
        />
      </div>

      {/* Liabilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <SimpleList
          title="Liabilities"
          category="liabilities"
          items={portfolio.liabilities}
          placeholder="e.g. Mortgage, Credit Card"
          sumColor="text-red-500"
          sumPrefix="-"
          onRefresh={refresh}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 mb-8">
        <button
          onClick={handleExport}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-3.5 py-2 rounded-md text-sm font-semibold"
        >
          Export JSON
        </button>
      </div>
    </>
  );
}
