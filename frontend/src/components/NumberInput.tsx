import { useState, useRef, useEffect } from 'react';

interface Props {
  defaultValue?: number;
  value?: number;
  onChange: (value: string) => void;
  step?: string;
  decimals?: number;
  className?: string;
}

function formatDisplay(n: number, decimals: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function NumberInput({ defaultValue, value, onChange, step = '0.01', decimals = 2, className }: Props) {
  const isControlled = value !== undefined;
  const initial = isControlled ? value : (defaultValue ?? 0);

  const [focused, setFocused] = useState(false);
  const [display, setDisplay] = useState(formatDisplay(initial, decimals));
  const rawRef = useRef(String(initial));

  // Sync display when controlled value changes externally (and not focused)
  useEffect(() => {
    if (isControlled && !focused) {
      rawRef.current = String(value);
      setDisplay(formatDisplay(value, decimals));
    }
  }, [value, isControlled, focused]);

  function handleFocus() {
    setFocused(true);
    const num = parseFloat(rawRef.current) || 0;
    setDisplay(num === 0 ? '' : rawRef.current);
  }

  function handleBlur() {
    setFocused(false);
    const num = parseFloat(rawRef.current) || 0;
    setDisplay(formatDisplay(num, decimals));
  }

  function handleChange(val: string) {
    rawRef.current = val;
    setDisplay(val);
    onChange(val);
  }

  const inputClass = className || 'bg-slate-950 border border-slate-600 text-slate-200 px-2.5 py-2 rounded-md text-sm w-full focus:outline-none focus:border-indigo-500';

  return (
    <input
      type={focused ? 'number' : 'text'}
      step={step}
      className={inputClass}
      value={display}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}
