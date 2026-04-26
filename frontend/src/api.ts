import type { Broker, CPF, Portfolio, SimpleItem, Snapshot, Stock } from './types';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Portfolio
export const getPortfolio = () => fetch(`${BASE}/portfolio`).then(r => json<Portfolio>(r));

// Brokers
export const createBroker = (name: string) =>
  fetch(`${BASE}/brokers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(r => json<Broker>(r));

export const deleteBroker = (id: number) =>
  fetch(`${BASE}/brokers/${id}`, { method: 'DELETE' });

// Stocks
export const createStock = (broker_id: number) =>
  fetch(`${BASE}/stocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ broker_id }),
  }).then(r => json<Stock>(r));

export const updateStock = (id: number, data: Partial<Stock>) =>
  fetch(`${BASE}/stocks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => json<Stock>(r));

export const deleteStock = (id: number) =>
  fetch(`${BASE}/stocks/${id}`, { method: 'DELETE' });

// Simple items (bonds, cash, other, liabilities)
export const createSimpleItem = (category: string, name = '', value = 0) =>
  fetch(`${BASE}/${category}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  }).then(r => json<SimpleItem>(r));

export const updateSimpleItem = (category: string, id: number, data: Partial<SimpleItem>) =>
  fetch(`${BASE}/${category}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => json<SimpleItem>(r));

export const deleteSimpleItem = (category: string, id: number) =>
  fetch(`${BASE}/${category}/${id}`, { method: 'DELETE' });

// CPF
export const updateCPF = (data: Partial<CPF>) =>
  fetch(`${BASE}/cpf`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => json<CPF>(r));

// Snapshots
export const getSnapshots = () => fetch(`${BASE}/snapshots`).then(r => json<Snapshot[]>(r));

export const createSnapshot = (data: Omit<Snapshot, 'id' | 'total'>) =>
  fetch(`${BASE}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => json<Snapshot>(r));

export const deleteSnapshot = (id: number) =>
  fetch(`${BASE}/snapshots/${id}`, { method: 'DELETE' });

// Export
export const exportData = () => fetch(`${BASE}/export`).then(r => r.json());
