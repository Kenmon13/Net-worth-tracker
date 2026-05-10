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
  ra: number;
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

export interface PositionSell {
  id: number;
  position_id: number;
  shares: number;
  price: number;
  date: string;
}

export interface PositionBuy {
  id: number;
  position_id: number;
  shares: number;
  price: number;
  date: string;
}

export interface Position {
  id: number;
  broker_name: string;
  symbol: string;
  name: string;
  shares: number;
  buy_price: number;
  buy_date: string;
  sell_price: number;
  sell_date: string;
  currency: string;
  current_price: number;
  total_dividends: number;
  sells: PositionSell[];
  buys: PositionBuy[];
}

export interface Snapshot {
  id: number;
  date: string;
  stocks: number;
  bonds: number;
  cash: number;
  other_liquid: number;
  cpf: number;
  insurance: number;
  other: number;
  liab: number;
  total: number;
}
