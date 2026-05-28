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
| Allowlist | Firestore `studioConsoleAllowlist/{email}` doc with `role: 'admin' \| 'user'` | Firestore on `opsagent-prod` |
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

## Cloud prereqs (one-time, before first GHA deploy works)

Run from a workstation with `gcloud` authed to `opsagent-prod`:

```bash
PROJECT=opsagent-prod
REGION=me-west1
PROXY_SA=studio-console-proxy@${PROJECT}.iam.gserviceaccount.com

# ⚠️ Firestore rules are SHARED across opsagent-prod (lead-pipeline + trainer + this app).
# DO NOT `firebase deploy --only firestore:rules` — it stomps the canonical ruleset.
# Update `firestore/firestore.rules` to be the SUPERSET (see file header for current apps)
# and apply via API only after diffing against the live ruleset. Phase 2 = move this
# app to a named Firestore database (`gcloud firestore databases create --database=studio-console`)
# to remove the shared-rules trap entirely.

# 1. Firebase Hosting site
firebase hosting:sites:create opsagents-studio-console --project=$PROJECT

# 2. Artifact Registry repo for the proxy image
gcloud artifacts repositories create opsagents-studio-console \
  --location=$REGION --project=$PROJECT --repository-format=docker \
  --description="opsagents-studio-console proxy images"

# 3. Proxy service account
gcloud iam service-accounts create studio-console-proxy --project=$PROJECT \
  --display-name="opsagents-studio-console proxy runtime"

# 4. Grant Firestore + secret access to the proxy SA
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:${PROXY_SA}" --role=roles/datastore.user
gcloud secrets add-iam-policy-binding OPSAGENT_AI_RUNTIME_API_KEY \
  --project=$PROJECT --member="serviceAccount:${PROXY_SA}" \
  --role=roles/secretmanager.secretAccessor

# 5. Let the gha-deployer deploy this Cloud Run service + impersonate the proxy SA
gcloud iam service-accounts add-iam-policy-binding ${PROXY_SA} \
  --project=$PROJECT \
  --member="serviceAccount:gha-deployer@${PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

# 6. WIF binding for this repo (replace WIF_POOL/PROVIDER with the existing org pool)
# Already exists if you've deployed any OpsAgentsAI repo before. Verify with:
gcloud iam workload-identity-pools providers describe github-provider \
  --workload-identity-pool=github --location=global --project=$PROJECT

# Add this repo to the gha-deployer trust:
gcloud iam service-accounts add-iam-policy-binding \
  gha-deployer@${PROJECT}.iam.gserviceaccount.com --project=$PROJECT \
  --member="principalSet://iam.googleapis.com/projects/523955774086/locations/global/workloadIdentityPools/github/attribute.repository/OpsAgentsAI/opsagents-studio-console" \
  --role=roles/iam.workloadIdentityUser

# 7. Enable Firebase Auth Google provider (Firebase Console — no clean CLI path)
#    Firebase Console → opsagent-prod → Authentication → Sign-in method → Google → Enable
#    Authorize the Hosting domain: opsagents-studio-console.web.app
#
# 8. GitHub repo secrets (Settings → Secrets and variables → Actions)
#    - VITE_FIREBASE_API_KEY            (from Firebase console Project settings)
#    - VITE_FIREBASE_AUTH_DOMAIN        (opsagent-prod.firebaseapp.com)
#    - VITE_FIREBASE_APP_ID             (Firebase Web app → register app)
#    - FIREBASE_SERVICE_ACCOUNT         (firebase-hosting-deploy SA JSON, base64)
```

## Seeding the allowlist

```
cd scripts && npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npm run seed
```

Adds the 3 initial users from `scripts/seed-allowlist.ts`.

## Acceptance (Phase 1)

See Trello card [FtPfGk45](https://trello.com/c/FtPfGk45).
