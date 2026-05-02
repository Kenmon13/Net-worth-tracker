import { fmt } from '../utils';

interface Props {
  stocksTotal: number;
  bondsTotal: number;
  cashTotal: number;
  cpfTotal: number;
  insuranceTotal: number;
  otherTotal: number;
  liabTotal: number;
}

export default function Summary({ stocksTotal, bondsTotal, cashTotal, cpfTotal, insuranceTotal, otherTotal, liabTotal }: Props) {
  const liquidTotal = stocksTotal + bondsTotal + cashTotal;
  const illiquidTotal = cpfTotal + insuranceTotal + otherTotal;
  const net = liquidTotal + illiquidTotal - liabTotal;

  return (
    <div className="bg-gradient-to-br from-blue-800 to-violet-600 p-6 rounded-xl mb-6">
      <div className="text-slate-300 text-sm">Total Net Worth</div>
      <div className="text-[42px] font-bold mt-1 leading-tight">{fmt(net)}</div>
      <div className="flex gap-6 mt-4 flex-wrap">
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">Liquid ({fmt(liquidTotal)})</div>
          <div className="flex gap-2 flex-wrap">
            {[
              ['Equities', stocksTotal],
              ['Bonds', bondsTotal],
              ['Cash', cashTotal],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-black/25 px-3 py-2 rounded-lg text-sm">
                {label as string}: <b>{fmt(val as number)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">Illiquid ({fmt(illiquidTotal)})</div>
          <div className="flex gap-2 flex-wrap">
            {[
              ['CPF', cpfTotal],
              ['Insurance', insuranceTotal],
              ['Other', otherTotal],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-black/25 px-3 py-2 rounded-lg text-sm">
                {label as string}: <b>{fmt(val as number)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">&nbsp;</div>
          <div className="bg-black/25 px-3 py-2 rounded-lg text-sm">
            Liabilities: <b className="text-red-400">{fmt(-liabTotal)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
