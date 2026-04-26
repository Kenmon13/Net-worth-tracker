import { fmt } from '../utils';

interface Props {
  stocksTotal: number;
  bondsTotal: number;
  cashTotal: number;
  cpfTotal: number;
  otherTotal: number;
  liabTotal: number;
}

export default function Summary({ stocksTotal, bondsTotal, cashTotal, cpfTotal, otherTotal, liabTotal }: Props) {
  const net = stocksTotal + bondsTotal + cashTotal + cpfTotal + otherTotal - liabTotal;

  return (
    <div className="bg-gradient-to-br from-blue-800 to-violet-600 p-6 rounded-xl mb-6">
      <div className="text-slate-300 text-sm">Total Net Worth</div>
      <div className="text-[42px] font-bold mt-1">{fmt(net)}</div>
      <div className="flex gap-3 mt-4 flex-wrap">
        {[
          ['Stocks', stocksTotal],
          ['Bonds', bondsTotal],
          ['Cash', cashTotal],
          ['CPF', cpfTotal],
          ['Other', otherTotal],
          ['Liabilities', -liabTotal],
        ].map(([label, val]) => (
          <div key={label as string} className="bg-black/25 px-3.5 py-2.5 rounded-lg text-sm">
            {label as string}: <b>{fmt(val as number)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
