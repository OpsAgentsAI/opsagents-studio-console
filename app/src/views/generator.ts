import { generateImage, listHistory, type HistoryItem } from '../api';

export function renderGenerator(host: HTMLElement) {
  host.innerHTML = `
    <div class="generator">
      <section class="panel">
        <h3>Prompt</h3>
        <textarea id="prompt" placeholder="A 35mm photograph of a vintage Vespa parked on a Tel Aviv rooftop at golden hour, cinematic lighting, shallow depth of field..."></textarea>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn" id="genBtn">Generate</button>
          <span style="flex:1"></span>
          <span class="meta" style="margin:0;">
            <span>Model: <b>Nano Banana Pro</b></span>
            <span>1024×1024</span>
          </span>
        </div>
        <div class="meta" id="meta"></div>
        <div id="err"></div>
      </section>
      <section class="panel result">
        <h3>Result</h3>
        <div id="result"><div class="empty-state">Generated image will appear here.</div></div>
      </section>
    </div>
    <section class="history">
      <h3 style="font-size:13px; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.5px;">Recent generations</h3>
      <div id="history"><div class="empty-state">No history yet.</div></div>
    </section>
  `;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const btn = $<HTMLButtonElement>('genBtn');
  const prompt = $<HTMLTextAreaElement>('prompt');
  const result = $('result');
  const meta = $('meta');
  const err = $('err');
  const history = $('history');

  btn.addEventListener('click', async () => {
    const text = prompt.value.trim();
    if (!text) return;
    btn.disabled = true; btn.textContent = 'Generating…';
    err.innerHTML = ''; meta.innerHTML = '';
    result.innerHTML = '<div class="empty-state">Working…</div>';
    try {
      const t0 = performance.now();
      const r = await generateImage(text);
      const wall = Math.round(performance.now() - t0);
      result.innerHTML = `<img src="data:${r.mimeType};base64,${r.imageBase64}" alt="">`;
      meta.innerHTML = `
        <span>Cost: <b>$${r.cost.toFixed(3)}</b></span>
        <span>Server: <b>${r.latencyMs}ms</b></span>
        <span>Wall: <b>${wall}ms</b></span>
        <span>req: <b>${r.requestId.slice(0, 8)}</b></span>
      `;
      await refreshHistory();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      err.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
      result.innerHTML = '<div class="empty-state">Generation failed.</div>';
    } finally {
      btn.disabled = false; btn.textContent = 'Generate';
    }
  });

  async function refreshHistory() {
    try {
      const items = await listHistory();
      renderHistory(history, items);
    } catch (e) {
      console.warn('[history] refresh failed', e);
    }
  }

  refreshHistory();
}

function renderHistory(host: HTMLElement, items: HistoryItem[]) {
  if (!items.length) {
    host.innerHTML = '<div class="empty-state">No history yet.</div>';
    return;
  }
  host.innerHTML = items.map((it) => `
    <div class="history-item">
      ${it.thumbBase64
        ? `<img src="data:${it.mimeType};base64,${it.thumbBase64}" alt="">`
        : '<div style="width:56px;height:56px;background:var(--panel-2);border-radius:6px"></div>'}
      <div class="prompt">${escapeHtml(it.prompt)}</div>
      <div class="when">${formatWhen(it.createdAt)}</div>
    </div>
  `).join('');
}

function formatWhen(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}
