# Marqq credits

## Unit
- **1 credit = $0.001 USD**
- Plans allot monthly credits (`workspace` 99,999 · `growth` 5k · `scale` 20k · `agency` unlimited)

## Flow
1. **Estimate** — feature catalog (`FEATURE_ESTIMATES`) or caller override  
2. **Reserve** — hold estimated credits on the workspace wallet  
3. **Call provider** — Groq / Fal / internal  
4. **Settle** — convert **actual** Groq tokens or Fal USD → credits; deduct actual; release hold  

Ledger stores `estimatedCredits`, `actualCredits`, `deltaCredits`, token counts, USD.

## Providers
| Provider | Actual cost source |
|----------|-------------------|
| **Groq** | `usage.prompt_tokens` + `completion_tokens` × model $/MTok |
| **Fal** | Flat USD per image / edit / video (env overrides) |
| **Agents** | Fixed `agent_run` estimate (soft — never blocks drafts) |

## Hard gate
Studios and GTM generation call `assertCanAfford` / `meteredStudioJson` before the provider.
On empty balance the API returns **HTTP 402** `{ error: "insufficient_credits", wallet, estimatedCredits }`.

## APIs
- `GET /api/credits?workspaceId=` (hydrates UUID wallets from Supabase when enabled)
- `GET /api/credits/ledger`
- `POST /api/credits/plan` `{ plan }`
- `POST /api/credits/estimate` `{ feature }`
- `POST /api/ask-marqq/chat/complete` — metered Ask Marqq compound chat

## Code
- `server/services/credits/` — pricing, wallet, groqMeter, falMeter, studioGroq, creditSupabase, errors
- **All server Groq chat completions** go through `meteredGroqChat` / `meteredStudioJson` (STT audio left separate)
- Studios: content, social, landing, lead magnets, paid, creative, outreach
- GTM: auto-sections, full strategy, interview options, control loop, marketing ideas
- UI: Billing wallet + ledger; Header credit balance; Ask Marqq 402 message

## Persistence
- JSON DB (`marqq-db.json`) remains local source of truth
- UUID workspaces dual-write to Supabase `credit_wallets` + `credit_ledger`
- Migration: `database/migrations/credit-wallets.sql`
- Apply on the shared Marqq Supabase project, then restart the API
