import { useRef } from 'react';
import type { CPF } from '../types';
import { fmt } from '../utils';
import * as api from '../api';
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
  const total = cpf.oa + cpf.sa + cpf.ma;

  function handleChange(key: keyof CPF, value: string) {
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      await api.updateCPF({ [key]: parseFloat(value) || 0 });
      onRefresh();
    }, 500);
  }

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h2 className="text-lg font-semibold mb-3 flex justify-between items-center">
        CPF
        <span className="text-base font-semibold text-green-500">{fmt(total)}</span>
      </h2>

      {ACCOUNTS.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-[2fr_1fr_auto] gap-2 mb-2.5">
          <div className="self-center font-medium">{label}</div>
          <NumberInput
            defaultValue={cpf[key]}
            onChange={(v) => handleChange(key, v)}
          />
          <div></div>
        </div>
      ))}
    </div>
  );
}
