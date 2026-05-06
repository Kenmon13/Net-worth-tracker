import { useEffect, useRef, useState } from 'react';
import type { CPF } from '../types';
import { fmt } from '../utils';
import * as api from '../api';
import type { CPFLimits } from '../api';
import NumberInput from './NumberInput';

interface Props {
  cpf: CPF;
  onRefresh: () => void;
}

const ACCOUNTS: { key: keyof CPF; label: string }[] = [
  { key: 'oa', label: 'Ordinary' },
  { key: 'sa', label: 'Special' },
  { key: 'ma', label: 'Medisave' },
];

export default function CPFSection({ cpf, onRefresh }: Props) {
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [limits, setLimits] = useState<CPFLimits | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [frsInput, setFrsInput] = useState('');
  const [bhsInput, setBhsInput] = useState('');
  const [updateError, setUpdateError] = useState('');
  const total = cpf.oa + cpf.sa + cpf.ma;

  useEffect(() => {
    api.getCPFLimits().then((data) => {
      setLimits(data);
      setFrsInput(String(data.frs));
      setBhsInput(String(data.bhs));
    });
  }, []);

  function handleChange(key: keyof CPF, value: string) {
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      await api.updateCPF({ [key]: parseFloat(value) || 0 });
      onRefresh();
    }, 500);
  }

  async function handleUpdateLimits() {
    const frs = parseFloat(frsInput);
    const bhs = parseFloat(bhsInput);
    if (!frs || !bhs || frs <= 0 || bhs <= 0) return;
    setUpdateError('');
    try {
      const updated = await api.updateCPFLimits(frs, bhs);
      setLimits(updated);
      setShowUpdate(false);
    } catch {
      setUpdateError('Only admin can update CPF limits.');
    }
  }

  function getWarning(key: keyof CPF): string | null {
    if (!limits) return null;
    if (key === 'sa' && cpf.sa >= limits.frs) {
      return `Reached Full Retirement Sum (FRS ${fmt(limits.frs)} for ${limits.year})`;
    }
    if (key === 'ma' && cpf.ma >= limits.bhs) {
      return `Reached Basic Healthcare Sum (BHS ${fmt(limits.bhs)} for ${limits.year})`;
    }
    return null;
  }

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
        CPF
        <span className="text-base font-semibold text-green-500">{fmt(total)}</span>
      </h2>

      {ACCOUNTS.map(({ key, label }) => {
        const warning = getWarning(key);
        return (
          <div key={key} className="mb-2.5">
            <div className="grid grid-cols-[2fr_1fr_auto] gap-2">
              <div className="self-center font-medium">{label}</div>
              <NumberInput
                defaultValue={cpf[key]}
                onChange={(v) => handleChange(key, v)}
              />
              <div></div>
            </div>
            {warning && (
              <div className="text-amber-400 text-xs mt-1 flex items-center gap-1">
                <span>&#9888;</span> {warning}
              </div>
            )}
          </div>
        );
      })}

      {limits?.outdated && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <div className="text-amber-400 text-xs flex items-center gap-1 mb-2">
            <span>&#9888;</span> CPF limits may be outdated (last updated: {limits.year}). Please verify on the CPF website.
          </div>
          {!showUpdate ? (
            <button
              onClick={() => setShowUpdate(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-md text-xs"
            >
              Update Limits
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-[40px]">FRS</label>
                <input
                  className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded-md text-sm w-[140px] focus:outline-none focus:border-indigo-500"
                  type="number"
                  value={frsInput}
                  onChange={(e) => setFrsInput(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-[40px]">BHS</label>
                <input
                  className="bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded-md text-sm w-[140px] focus:outline-none focus:border-indigo-500"
                  type="number"
                  value={bhsInput}
                  onChange={(e) => setBhsInput(e.target.value)}
                />
              </div>
              {updateError && (
                <div className="text-red-400 text-xs">{updateError}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateLimits}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs"
                >
                  Save
                </button>
                <button
                  onClick={() => { setShowUpdate(false); setUpdateError(''); }}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-md text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
