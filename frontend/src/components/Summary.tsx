import { fmt } from '../utils';

interface Props {
  stocksTotal: number;
  bondsTotal: number;
  cashTotal: number;
  otherLiquidTotal: number;
  cpfTotal: number;
  insuranceTotal: number;
  otherTotal: number;
  liabTotal: number;
}

export default function Summary({ stocksTotal, bondsTotal, cashTotal, otherLiquidTotal, cpfTotal, insuranceTotal, otherTotal, liabTotal }: Props) {
  const liquidTotal = stocksTotal + bondsTotal + cashTotal + otherLiquidTotal;
  const illiquidTotal = cpfTotal + insuranceTotal + otherTotal;
  const net = liquidTotal + illiquidTotal - liabTotal;

  return (
    <div className="bg-gradient-to-br from-blue-800 to-violet-600 p-4 sm:p-6 rounded-xl mb-6">
      <div className="text-slate-300 text-sm">Total Net Worth</div>
      <div className="text-3xl sm:text-[42px] font-bold mt-1 leading-tight">{fmt(net)}</div>
      <div className="flex flex-col gap-4 mt-4">
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">Liquid ({fmt(liquidTotal)})</div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {[
              ['Equities', stocksTotal],
              ['Bonds', bondsTotal],
              ['Cash', cashTotal],
              ['Other', otherLiquidTotal],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-black/25 px-3 py-2 rounded-lg text-xs sm:text-sm">
                {label as string}: <b>{fmt(val as number)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">Illiquid ({fmt(illiquidTotal)})</div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {[
              ['CPF', cpfTotal],
              ['Insurance', insuranceTotal],
              ['Other', otherTotal],
            ].map(([label, val]) => (
              <div key={label as string} className="bg-black/25 px-3 py-2 rounded-lg text-xs sm:text-sm">
                {label as string}: <b>{fmt(val as number)}</b>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-300 uppercase mb-1.5">Liabilities ({fmt(-liabTotal)})</div>
          <div className="bg-black/25 px-3 py-2 rounded-lg text-xs sm:text-sm inline-block">
            Liabilities: <b className="text-red-400">{fmt(-liabTotal)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
