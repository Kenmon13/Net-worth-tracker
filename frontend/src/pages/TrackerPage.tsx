import { useCallback, useEffect, useState } from 'react';
import type { Portfolio } from '../types';
import * as api from '../api';
import Summary from '../components/Summary';
import BrokerGroup from '../components/BrokerGroup';
import SimpleList from '../components/SimpleList';
import CPFSection from '../components/CPFSection';

const BROKERS_LIST = [
  'Fidelity', 'Schwab', 'Vanguard', 'Robinhood', 'E*TRADE',
  'Interactive Brokers', 'TD Ameritrade', 'Merrill', 'Webull',
  'moomoo', 'Tiger Brokers', 'SGX', 'Other',
];

export default function TrackerPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [selectedBroker, setSelectedBroker] = useState('');

  const refresh = useCallback(async () => {
    const data = await api.getPortfolio();
    setPortfolio(data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!portfolio) return <div className="text-slate-400 py-10 text-center">Loading...</div>;

  const stocksTotal = portfolio.stocks.reduce((t, s) => t + s.shares * s.price, 0);
  const bondsTotal = portfolio.bonds.reduce((t, i) => t + i.value, 0);
  const cashTotal = portfolio.cash.reduce((t, i) => t + i.value, 0);
  const otherTotal = portfolio.other.reduce((t, i) => t + i.value, 0);
  const liabTotal = portfolio.liabilities.reduce((t, i) => t + i.value, 0);
  const cpfTotal = portfolio.cpf.oa + portfolio.cpf.sa + portfolio.cpf.ma;

  const existingBrokerNames = portfolio.brokers.map((b) => b.name);
  const availableBrokers = BROKERS_LIST.filter((b) => !existingBrokerNames.includes(b));

  const activeBroker = selectedBroker || availableBrokers[0] || '';

  async function handleAddBroker() {
    if (!activeBroker) return;
    await api.createBroker(activeBroker);
    setSelectedBroker('');
    refresh();
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
        otherTotal={otherTotal}
        liabTotal={liabTotal}
      />

      {/* Stocks section */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-5" style={{ gridColumn: '1 / -1' }}>
        <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
          Stocks
          <span className="text-base font-semibold text-green-500">
            ${stocksTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </h2>

        {portfolio.brokers.length === 0 && (
          <div className="text-slate-400 py-2 text-sm">No brokers added yet. Pick one below and click "Add Broker".</div>
        )}

        {portfolio.brokers.map((broker) => (
          <BrokerGroup
            key={broker.id}
            broker={broker}
            stocks={portfolio.stocks.filter((s) => s.broker_id === broker.id)}
            onRefresh={refresh}
          />
        ))}

        <div className="flex gap-2 mt-2.5 items-center">
          <select
            className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm max-w-[220px] focus:outline-none focus:border-indigo-500"
            value={activeBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            {availableBrokers.length > 0
              ? availableBrokers.map((b) => <option key={b} value={b}>{b}</option>)
              : <option disabled>All brokers added</option>
            }
          </select>
          <button
            onClick={handleAddBroker}
            disabled={availableBrokers.length === 0}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-md text-sm"
          >
            + Add Broker
          </button>
        </div>
      </div>

      {/* Other sections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
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
        <SimpleList
          title="Other Assets"
          category="other"
          items={portfolio.other}
          placeholder="e.g. Crypto, Real Estate"
          onRefresh={refresh}
        />
        <CPFSection cpf={portfolio.cpf} onRefresh={refresh} />
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
