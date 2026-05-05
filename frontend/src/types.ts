export interface Broker {
  id: number;
  name: string;
  position: number;
  cash: number;
  cash_usd: number;
  cash_hkd: number;
}

export interface BrokerCash {
  id: number;
  broker_id: number;
  currency: string;
  amount: number;
}

export interface Stock {
  id: number;
  broker_id: number;
  symbol: string;
  shares: number;
  cost: number;
  price: number;
  currency: string;
}

export type ForexRates = Record<string, number>;

export interface SimpleItem {
  id: number;
  name: string;
  value: number;
}

export interface CurrencyItem {
  id: number;
  name: string;
  value: number;
  currency: string;
}

export interface CPF {
  oa: number;
  sa: number;
  ma: number;
}

export interface Portfolio {
  brokers: Broker[];
  stocks: Stock[];
  broker_cash: BrokerCash[];
  bonds: SimpleItem[];
  cash: SimpleItem[];
  other: CurrencyItem[];
  other_liquid: CurrencyItem[];
  insurance: SimpleItem[];
  liabilities: SimpleItem[];
  cpf: CPF;
}

export interface Snapshot {
  id: number;
  date: string;
  stocks: number;
  bonds: number;
  cash: number;
  cpf: number;
  other: number;
  liab: number;
  total: number;
}
