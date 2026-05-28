# opsagents-studio-console

Standalone image-generation app for the OpsAgents Studio brand. Allowlisted Google sign-in, single-purpose prompt → image surface, admin panel for managing access. Backs onto the existing `opsagent-core` `/api/generate-image` bridge (Nano Banana Pro / `gemini-3-pro-image-preview` on Vertex AI).

- Trello epic: https://trello.com/c/FtPfGk45
- Storefront (separate): https://studio.opsagents.agency
- Training console (separate): https://opsagent-training.web.app
- This app (Phase 1 staging): `opsagents-studio-console.web.app`
- This app (Phase 2 prod): `console.studio.opsagents.agency`

## Stack

| Layer | Tech | Where it runs |
|---|---|---|
| SPA | Vite + vanilla TS + Firebase Web SDK | Firebase Hosting on `opsagent-prod` |
| Auth | Firebase Auth, Google provider only | Firebase Auth on `opsagent-prod` |
| Allowlist | Firestore `users/{email}` doc with `role: 'admin' \| 'user'` | Firestore on `opsagent-prod` |
| Server proxy | Hono on Node 22 | Cloud Run `opsagents-studio-console-proxy` in `me-west1` |
| Image bridge | Existing `opsagent-core` `/api/generate-image` | Already deployed |

## Layout

```
/app                    Vite SPA
/proxy                  Cloud Run service
/firestore              security rules + indexes
/scripts                seed-allowlist.ts
/.github/workflows      deploy.yml (Hosting + Cloud Run via WIF)
firebase.json           Firebase Hosting config
.firebaserc             Firebase project alias
```

## Local dev

```
# SPA
cd app && npm install && npm run dev      # http://localhost:5173

# Proxy
cd proxy && npm install && npm run dev    # http://localhost:8080
```

The SPA reads the proxy URL from `VITE_PROXY_URL` (defaults to `http://localhost:8080` in dev).

## Deploy

GitHub Actions on push to `main` (see `.github/workflows/deploy.yml`):
1. Build SPA → deploy to Firebase Hosting target `console`
2. Build proxy Docker image → push to Artifact Registry → deploy to Cloud Run

## Seeding the allowlist

```
cd scripts && npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npm run seed
```

Adds the 3 initial users from `scripts/seed-allowlist.ts`.

## Acceptance (Phase 1)

See Trello card [FtPfGk45](https://trello.com/c/FtPfGk45).
