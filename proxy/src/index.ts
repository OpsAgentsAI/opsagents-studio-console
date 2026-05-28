import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? 'opsagent-prod';
const BRIDGE_URL = process.env.BRIDGE_URL ?? 'https://opsagent-core-523955774086.me-west1.run.app/api/generate-image';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY ?? '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,https://opsagents-studio-console.web.app,https://console.studio.opsagents.agency').split(',');

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)), projectId: PROJECT_ID });
} else {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}
const auth = getAuth();
const db = getFirestore();

type Role = 'admin' | 'user';
interface Caller { uid: string; email: string; role: Role; }

const app = new Hono();
app.use('*', cors({ origin: ALLOWED_ORIGINS, allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }));

app.get('/healthz', (c) => c.json({ ok: true, ts: Date.now() }));

async function verifyCaller(authHeader: string | undefined): Promise<Caller> {
  if (!authHeader?.startsWith('Bearer ')) throw new Response('Missing Bearer token', { status: 401 });
  const idToken = authHeader.slice(7);
  let decoded;
  try { decoded = await auth.verifyIdToken(idToken); }
  catch { throw new Response('Invalid ID token', { status: 401 }); }
  const email = decoded.email?.toLowerCase();
  if (!email) throw new Response('Token missing email', { status: 401 });
  const snap = await db.collection('users').doc(email).get();
  if (!snap.exists) throw new Response('Not on allowlist', { status: 403 });
  const role = (snap.data() as { role?: Role }).role;
  if (role !== 'admin' && role !== 'user') throw new Response('Allowlist entry missing role', { status: 403 });
  return { uid: decoded.uid, email, role };
}

async function requireCaller(c: { req: { header(name: string): string | undefined } }): Promise<Caller> {
  return verifyCaller(c.req.header('authorization'));
}

app.post('/generate', async (c) => {
  let caller: Caller;
  try { caller = await requireCaller(c); }
  catch (e) { if (e instanceof Response) return e; throw e; }

  if (!BRIDGE_API_KEY) return c.json({ error: 'BRIDGE_API_KEY not configured' }, 500);

  const body = await c.req.json().catch(() => null) as { prompt?: string; resolution?: string; aspect_ratio?: string; num_images?: number } | null;
  if (!body?.prompt || typeof body.prompt !== 'string') return c.json({ error: 'prompt required' }, 400);
  const prompt = body.prompt.trim().slice(0, 4000);
  if (!prompt) return c.json({ error: 'prompt empty' }, 400);

  const t0 = Date.now();
  const requestId = randomUUID();
  const upstream = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': BRIDGE_API_KEY },
    body: JSON.stringify({
      prompt,
      resolution: body.resolution ?? '1K',
      aspect_ratio: body.aspect_ratio ?? '1:1',
      num_images: 1,
    }),
  });
  const latencyMs = Date.now() - t0;

  if (!upstream.ok) {
    const text = await upstream.text();
    console.error(`[generate] bridge ${upstream.status}`, text.slice(0, 500));
    return c.json({ error: `Bridge ${upstream.status}`, detail: text.slice(0, 500) }, 502);
  }

  const data = await upstream.json() as { image_base64?: string; imageBase64?: string; mime_type?: string; mimeType?: string; cost?: number; cost_usd?: number; images?: Array<{ b64?: string; image_base64?: string; mime_type?: string }> };
  const imageBase64 = data.image_base64 ?? data.imageBase64 ?? data.images?.[0]?.b64 ?? data.images?.[0]?.image_base64 ?? '';
  const mimeType = data.mime_type ?? data.mimeType ?? data.images?.[0]?.mime_type ?? 'image/png';
  const cost = data.cost ?? data.cost_usd ?? 0.18;

  if (!imageBase64) {
    console.error('[generate] bridge returned no image bytes', JSON.stringify(data).slice(0, 500));
    return c.json({ error: 'Bridge returned no image' }, 502);
  }

  const thumbBase64 = imageBase64.length > 200_000 ? imageBase64.slice(0, 200_000) : imageBase64;
  const genDoc = db.collection('generations').doc(caller.uid).collection('items').doc(requestId);
  const usageDoc = db.collection('usage').doc(caller.uid);
  await db.runTransaction(async (tx) => {
    tx.set(genDoc, {
      prompt,
      mimeType,
      thumbBase64,
      cost,
      latencyMs,
      createdAt: Date.now(),
      requestId,
    });
    tx.set(usageDoc, {
      email: caller.email,
      totalGenerations: FieldValue.increment(1),
      totalCost: FieldValue.increment(cost),
      lastAt: Date.now(),
    }, { merge: true });
  });

  return c.json({ imageBase64, mimeType, cost, latencyMs, requestId });
});

app.get('/history', async (c) => {
  let caller: Caller;
  try { caller = await requireCaller(c); }
  catch (e) { if (e instanceof Response) return e; throw e; }

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 50);
  const snap = await db.collection('generations').doc(caller.uid).collection('items')
    .orderBy('createdAt', 'desc').limit(limit).get();
  const items = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, prompt: x.prompt, thumbBase64: x.thumbBase64, mimeType: x.mimeType, cost: x.cost, createdAt: x.createdAt };
  });
  return c.json({ items });
});

async function requireAdmin(c: { req: { header(name: string): string | undefined } }): Promise<Caller> {
  const caller = await requireCaller(c);
  if (caller.role !== 'admin') throw new Response('Admin only', { status: 403 });
  return caller;
}

app.get('/admin/users', async (c) => {
  try { await requireAdmin(c); } catch (e) { if (e instanceof Response) return e; throw e; }
  const snap = await db.collection('users').get();
  const users = snap.docs.map((d) => ({ email: d.id, role: d.data().role, addedAt: d.data().addedAt ?? 0 }));
  users.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return c.json({ users });
});

app.get('/admin/usage', async (c) => {
  try { await requireAdmin(c); } catch (e) { if (e instanceof Response) return e; throw e; }
  const snap = await db.collection('usage').get();
  const usage = snap.docs.map((d) => ({ email: d.data().email ?? d.id, totalGenerations: d.data().totalGenerations ?? 0, totalCost: d.data().totalCost ?? 0 }));
  return c.json({ usage });
});

app.post('/admin/users', async (c) => {
  let admin: Caller;
  try { admin = await requireAdmin(c); } catch (e) { if (e instanceof Response) return e; throw e; }
  const body = await c.req.json().catch(() => null) as { email?: string; role?: Role } | null;
  if (!body?.email || !body.email.includes('@')) return c.json({ error: 'valid email required' }, 400);
  const role = body.role === 'admin' ? 'admin' : 'user';
  const email = body.email.trim().toLowerCase();
  await db.collection('users').doc(email).set({
    role,
    addedAt: Date.now(),
    addedBy: admin.email,
  }, { merge: true });
  return c.json({ ok: true });
});

app.delete('/admin/users/:email', async (c) => {
  let admin: Caller;
  try { admin = await requireAdmin(c); } catch (e) { if (e instanceof Response) return e; throw e; }
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  if (email === admin.email) return c.json({ error: 'cannot remove yourself' }, 400);
  await db.collection('users').doc(email).delete();
  return c.json({ ok: true });
});

const port = parseInt(process.env.PORT ?? '8080');
serve({ fetch: app.fetch, port }, () => {
  console.log(`[proxy] listening on :${port}, bridge=${BRIDGE_URL}, project=${PROJECT_ID}`);
});
