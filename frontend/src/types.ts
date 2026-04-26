export interface Broker {
  id: number;
  name: string;
  position: number;
}

export interface Stock {
  id: number;
  broker_id: number;
  symbol: string;
  shares: number;
  cost: number;
  price: number;
}

export interface SimpleItem {
  id: number;
  name: string;
  value: number;
}

export interface CPF {
  oa: number;
  sa: number;
  ma: number;
}

export interface Portfolio {
  brokers: Broker[];
  stocks: Stock[];
  bonds: SimpleItem[];
  cash: SimpleItem[];
  other: SimpleItem[];
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
