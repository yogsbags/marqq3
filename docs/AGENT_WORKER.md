# Marqq background worker

The HTTP API and background schedulers now run as separate processes.

```bash
npm start          # API + frontend only
npm run worker     # deployment/outreach/digest/self-review schedulers
```

In production, deploy `npm run worker` as a single worker service with the
same environment variables and Supabase credentials as the API. Run one
worker initially; Supabase leases make multiple workers safe, but one worker
is the simplest operating baseline.

The API process still starts schedulers when imported by tests or embedded
callers unless `MARQQ_START_SCHEDULERS=0` is set.
