# Admin Dashboard (Phase 2 Roadmap)

This directory is designated for the future React + Vite Admin Dashboard.

## Architecture Plan
- **Frontend Stack**: React 18+, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend API**: Cloudflare Workers Hono endpoints under `/api/admin/*`.
- **Authentication**: Cloudflare Access / Admin API Key / Session tokens.
- **Features Planned**:
  - Real-time conversation viewer and history inspection.
  - Whitelisted Telegram user management (allow/block users).
  - OpenAI token consumption metrics, latency, and cost estimates.
  - System prompt management and model selection (e.g. toggle gpt-4o vs gpt-4o-mini).
  - Cloudflare D1 query viewer and audit log explorer.

## Setup Instructions (When Ready to Initialize Phase 2)
```bash
# In this directory or root:
npm create vite@latest dashboard -- --template react-ts
```
