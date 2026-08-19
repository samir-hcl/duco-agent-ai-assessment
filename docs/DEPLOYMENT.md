# Deployment & Operations Guide

## Local Development

```bash
npm install && npm run dev          # Next.js on :3000
cd backend && pip install -r requirements.txt && python server.py  # ADK on :8000
```

## Docker Deployment

```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```dockerfile
FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/ ./
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8000
CMD ["python", "server.py"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: { context: ., dockerfile: Dockerfile.frontend }
    ports: ["3000:3000"]
    env_file: .env.local
    depends_on: [backend]
  backend:
    build: { context: ., dockerfile: Dockerfile.backend }
    ports: ["8000:8000"]
    env_file: .env.local
```

## Monitoring & Health Checks

- **Structured Logs**: Every agent action logged as `AgentLogEntry` (timestamp, agent, action, detail, status)
- **Health Check**: `GET /api/codes/cpt/97161` — returns 200 if app is healthy
- **Error Tracking**: All errors logged via `console.error()` with stack traces; `AgentContext.errors[]` tracks pipeline failures

## Rollback Strategy

1. **Git-based**: `git revert <sha>` + redeploy
2. **Feature flags**: `DUCO_API_KEY` controls auth; remove to open access. `GOOGLE_GEMINI_API_KEY` absent = full mock mode
3. **Zero-downtime**: Stateless API — no database migrations required

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_GEMINI_API_KEY` | No | Gemini Vision OCR + LLM-as-Judge. Falls back to mock data if absent |
| `DUCO_API_KEY` | Production only | API key auth for mutation routes. Dev mode allows all requests |
