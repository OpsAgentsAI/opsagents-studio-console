import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'opsagent-prod';
const FIRESTORE_DB = process.env.FIRESTORE_DB ?? 'studio-console';

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId: PROJECT_ID });
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

const db = getFirestore(FIRESTORE_DB);

interface SeedEntry { email: string; role: 'admin' | 'user'; }
const seed: SeedEntry[] = [
  { email: 'michal@opsagents.agency', role: 'admin' },
  { email: 'adir.dabush@msapps.mobi', role: 'user' },
  { email: 'mrilashvilistudent@gmail.com', role: 'user' },
];

async function main() {
  console.log(`[seed] project=${PROJECT_ID}, seeding ${seed.length} users`);
  for (const { email, role } of seed) {
    const ref = db.collection('studioConsoleAllowlist').doc(email);
    const snap = await ref.get();
    if (snap.exists) {
      const existing = snap.data() as { role?: string };
      if (existing.role === role) {
        console.log(`[seed] keep ${email} (${role})`);
        continue;
      }
      console.log(`[seed] update ${email}: ${existing.role} → ${role}`);
      await ref.update({ role });
    } else {
      console.log(`[seed] create ${email} (${role})`);
      await ref.set({
        role,
        addedAt: Date.now(),
        addedBy: 'seed-script',
      });
    }
  }
  console.log('[seed] done');
}

main().catch((e) => { console.error('[seed] failed', e); process.exit(1); });
