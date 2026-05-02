# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Managers
- **JS/TS**: Always use `bun` instead of npm/yarn/pnpm for all JavaScript/TypeScript operations (install, run, create, etc.).
- **Python**: Always use `uv` instead of pip/pip3/pipx for all Python operations (install, run, add, etc.). Use Python 3.14.

## Development Commands

### Backend (from `backend/`)
```bash
uv run uvicorn main:app --reload --port 8000   # dev server with hot reload
uv add <package>                                 # add dependency
```

### Frontend (from `frontend/`)
```bash
bun dev          # dev server on :5173 (proxies /api to :8000)
bun run build    # production build
bun add <pkg>    # add dependency
```

Both servers must be running simultaneously for the app to work.

## Architecture

**Stack**: React 19 + TypeScript + Vite + Tailwind CSS 4 | Python 3.14 + FastAPI + SQLite

The app is a net worth tracker with two pages:
- **Tracker** (`/`) — manage portfolio: stocks grouped by broker, bonds, cash, CPF (Singapore retirement), other assets, liabilities
- **History** (`/history`) — save dated snapshots of net worth, view area chart (Recharts), see change over time

### Backend (`backend/`)
- `main.py` — FastAPI app with all routes. Uses a factory pattern (`_simple_routes`) to generate CRUD endpoints for bonds/cash/other/liabilities.
- `models.py` — Pydantic request/response models.
- `database.py` — SQLite setup with `init_db()` creating 8 tables. CPF table is a singleton row (id=1).
- Database file: `networth.db` (auto-created on first startup).

### Frontend (`frontend/src/`)
- `api.ts` — fetch wrappers for all backend endpoints.
- `types.ts` — TypeScript interfaces mirroring backend models.
- `pages/TrackerPage.tsx` — main portfolio page, fetches full portfolio via `GET /api/portfolio`.
- `pages/HistoryPage.tsx` — snapshot management with Recharts area chart.
- `components/BrokerGroup.tsx` — broker card with inline-editable stock rows and P/L calculation.
- `components/SimpleList.tsx` — reusable CRUD list used for bonds, cash, other, liabilities.
- `components/CPFSection.tsx` — CPF accounts (Ordinary, Special, Medisave).

### API Design
All endpoints under `/api`. Vite proxies `/api` to the backend in dev.
- `GET /api/portfolio` — aggregated read of entire portfolio
- Broker/stock/item endpoints follow REST conventions (POST create, PATCH update, DELETE)
- `POST /api/snapshots` — upserts by date
- `GET /api/export` — full data dump as JSON

### Key Patterns
- Frontend uses 500ms debounced updates on input changes (via `useRef` timers) — inputs use `defaultValue`, not controlled state.
- All pages share a `refresh()` callback pattern: child components call `onRefresh` after mutations to re-fetch portfolio state.
- Simple item categories (bonds, cash, other, liabilities) share the same `SimpleList` component and `SimpleItem` type — the `category` prop maps to the API path segment.
