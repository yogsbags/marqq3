# Marqq2 smoke playbooks (Nouriva + Elevate)

Copied from `Marqq2/scripts/` for reference and dual-backend runs.

These hit the **Marqq2 content-engine** API (`BASE_URL` default `http://127.0.0.1:3008`), not Marqq-test `:3001`.

## Nouriva

```bash
# Terminal A — Marqq2 content-engine
cd /Users/yogs87/Downloads/Marqq2
node --env-file=.env.marqq-live platform/content-engine/backend-server.js

# Terminal B
BASE_URL=http://127.0.0.1:3008 node scripts/marqq2-playbooks/e2e-nouriva-onboarding-gtm.mjs
BASE_URL=http://127.0.0.1:3008 node scripts/marqq2-playbooks/e2e-nouriva-gtm-strategy.mjs
```

## Elevate (same script, company overrides)

Marqq2’s `e2e-nouriva-gtm-strategy.mjs` switches to the Elevate consulting playbook when the company is not Nouriva:

```bash
BASE_URL=http://127.0.0.1:3008 \
WEBSITE_URL=https://theelevate.co.in \
COMPANY_NAME="The Elevate" \
node scripts/marqq2-playbooks/e2e-nouriva-gtm-strategy.mjs
```

## Marqq-test native equivalents (this app’s `:3001` API)

```bash
# Elevate (dedicated)
node scripts/e2e-elevate-gtm-smoke.mjs

# Nouriva + Elevate (company smoke — Marqq2 playbook profiles)
node scripts/e2e-gtm-company-smoke.mjs nouriva elevate
```

## Apollo (Composio)

Auth config ID must be `ac_39DNjSj25wp4` (not `…S`). Connect as workspace `marqq-ws-1`:

```bash
curl -s -X POST http://localhost:3001/api/integrations/connect \
  -H 'Content-Type: application/json' \
  -d '{"companyId":"marqq-ws-1","connectorId":"apollo"}'
```

Or Integrations screen → Apollo → Connect (API-key popup).

## Gmail (Composio OAuth)

Auth config: `COMPOSIO_GMAIL_AUTH_CONFIG_ID=ac_iyWlwATRMmnN` (OAuth2).

```bash
# Open OAuth popup + verify status
OPEN=1 node scripts/marqq2-playbooks/e2e-gmail-connector-smoke.mjs

# After Google consent, re-check
node scripts/marqq2-playbooks/e2e-gmail-connector-smoke.mjs

# Optional: also hit Marqq2 outreach Gmail playbook (draft / poll replies)
MARQQ2_BASE=http://127.0.0.1:3008 node scripts/marqq2-playbooks/e2e-gmail-connector-smoke.mjs
```

Marqq2 outreach Gmail endpoints this mirrors:

- `POST /api/outreach/runs/:runId/prospects/:prospectId/gmail-draft`
- `POST /api/outreach/poll-gmail-replies`
