import type { Broker, BrokerCash, CPF, CurrencyItem, ForexRates, Portfolio, SimpleItem, Snapshot, Stock } from './types';
import { clearToken, getToken } from './auth';

const BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Auth
export const signup = (username: string, password: string) =>
  fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Signup failed'); });
    return r.json() as Promise<{ access_token: string; token_type: string }>;
  });

export const login = (username: string, password: string) =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Login failed'); });
    return r.json() as Promise<{ access_token: string; token_type: string }>;
  });

export const getPasswordHint = (username: string) =>
  fetch(`${BASE}/auth/password-hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'No hint available'); });
    return r.json() as Promise<{ hint: string }>;
  });

export const getMe = () =>
  fetch(`${BASE}/auth/me`, { headers: authHeaders() }).then(r => json<{ id: number; username: string }>(r));

// Portfolio
export const getPortfolio = () =>
  fetch(`${BASE}/portfolio`, { headers: authHeaders() }).then(r => json<Portfolio>(r));

// Brokers
export const createBroker = (name: string) =>
  fetch(`${BASE}/brokers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  }).then(r => json<Broker>(r));

export const updateBroker = (id: number, data: Partial<Broker>) =>
  fetch(`${BASE}/brokers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<Broker>(r));

export const deleteBroker = (id: number) =>
  fetch(`${BASE}/brokers/${id}`, { method: 'DELETE', headers: authHeaders() });

// Broker Cash
export const createBrokerCash = (broker_id: number, currency: string) =>
  fetch(`${BASE}/broker-cash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ broker_id, currency }),
  }).then(r => json<BrokerCash>(r));

export const updateBrokerCash = (id: number, amount: number) =>
  fetch(`${BASE}/broker-cash/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ amount }),
  }).then(r => json<BrokerCash>(r));

export const deleteBrokerCash = (id: number) =>
  fetch(`${BASE}/broker-cash/${id}`, { method: 'DELETE', headers: authHeaders() });

// Stocks
export const createStock = (broker_id: number, defaults?: Partial<Stock>) =>
  fetch(`${BASE}/stocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ broker_id, ...defaults }),
  }).then(r => json<Stock>(r));

export const updateStock = (id: number, data: Partial<Stock>) =>
  fetch(`${BASE}/stocks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<Stock>(r));

export const deleteStock = (id: number) =>
  fetch(`${BASE}/stocks/${id}`, { method: 'DELETE', headers: authHeaders() });

export const refreshStockPrices = () =>
  fetch(`${BASE}/stocks/refresh-prices`, { method: 'POST', headers: authHeaders() }).then(r => json<Stock[]>(r));

export const getForexRates = () =>
  fetch(`${BASE}/forex`, { headers: authHeaders() }).then(r => json<ForexRates>(r));

export interface SymbolResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export const searchSymbols = (q: string) =>
  fetch(`${BASE}/stocks/search?q=${encodeURIComponent(q)}`).then(r => json<SymbolResult[]>(r));

// Simple items (bonds, cash, other, liabilities)
export const createSimpleItem = (category: string, name = '', value = 0) =>
  fetch(`${BASE}/${category}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, value }),
  }).then(r => json<SimpleItem>(r));

export const updateSimpleItem = (category: string, id: number, data: Partial<SimpleItem>) =>
  fetch(`${BASE}/${category}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<SimpleItem>(r));

export const deleteSimpleItem = (category: string, id: number) =>
  fetch(`${BASE}/${category}/${id}`, { method: 'DELETE', headers: authHeaders() });

// Currency items (other_liquid)
export const createCurrencyItem = (category: string, name = '', value = 0, currency = 'SGD') =>
  fetch(`${BASE}/${category}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, value, currency }),
  }).then(r => json<CurrencyItem>(r));

export const updateCurrencyItem = (category: string, id: number, data: Partial<CurrencyItem>) =>
  fetch(`${BASE}/${category}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<CurrencyItem>(r));

export const deleteCurrencyItem = (category: string, id: number) =>
  fetch(`${BASE}/${category}/${id}`, { method: 'DELETE', headers: authHeaders() });

// CPF
export const updateCPF = (data: Partial<CPF>) =>
  fetch(`${BASE}/cpf`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<CPF>(r));

// Snapshots
export const getSnapshots = () =>
  fetch(`${BASE}/snapshots`, { headers: authHeaders() }).then(r => json<Snapshot[]>(r));

export const createSnapshot = (data: Omit<Snapshot, 'id' | 'total'>) =>
  fetch(`${BASE}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  }).then(r => json<Snapshot>(r));

export const deleteSnapshot = (id: number) =>
  fetch(`${BASE}/snapshots/${id}`, { method: 'DELETE', headers: authHeaders() });

export const deleteAllSnapshots = () =>
  fetch(`${BASE}/snapshots`, { method: 'DELETE', headers: authHeaders() });

// Export
export const exportData = () =>
  fetch(`${BASE}/export`, { headers: authHeaders() }).then(r => {
    if (!r.ok) throw new Error('Export failed');
    return r.blob();
  });
