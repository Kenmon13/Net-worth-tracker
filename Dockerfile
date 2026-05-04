# -- Build frontend --
FROM oven/bun:1 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN bun install
COPY frontend/ ./
RUN bun run build

# -- Build backend --
FROM python:3.14-slim
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies
COPY backend/pyproject.toml ./
RUN uv sync --no-dev

# Copy backend source
COPY backend/*.py ./

# Copy built frontend into backend/static
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000

CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
