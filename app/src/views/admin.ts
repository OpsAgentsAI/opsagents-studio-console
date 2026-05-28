import { addUser, listUsage, listUsers, removeUser, type UsageRow, type UserRow } from '../api';

export function renderAdmin(host: HTMLElement) {
  host.innerHTML = `
    <section class="panel">
      <h3>Allowlisted users</h3>
      <table class="users" id="usersTable">
        <thead>
          <tr><th>Email</th><th>Role</th><th>Added</th><th>Generations</th><th>Spend</th><th></th></tr>
        </thead>
        <tbody><tr><td colspan="6" style="color:var(--text-dim);padding:14px;">Loading…</td></tr></tbody>
      </table>
      <div class="add-user">
        <input id="newEmail" type="email" placeholder="someone@example.com" />
        <select id="newRole">
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button class="btn" id="addBtn">Add</button>
      </div>
      <div id="adminErr" style="margin-top:10px;"></div>
    </section>
  `;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;
  const tbody = $('usersTable').querySelector('tbody')!;
  const errBox = $('adminErr');

  async function refresh() {
    try {
      const [users, usage] = await Promise.all([listUsers(), listUsage()]);
      const usageMap = new Map(usage.map((u: UsageRow) => [u.email.toLowerCase(), u]));
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);padding:14px;">No users yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = users.map((u: UserRow) => {
        const usg = usageMap.get(u.email.toLowerCase());
        return `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td class="role-${u.role}">${u.role}</td>
            <td style="color:var(--text-dim)">${new Date(u.addedAt).toLocaleDateString()}</td>
            <td>${usg?.totalGenerations ?? 0}</td>
            <td>$${(usg?.totalCost ?? 0).toFixed(2)}</td>
            <td><button class="btn btn-secondary" data-remove="${escapeAttr(u.email)}">Remove</button></td>
          </tr>
        `;
      }).join('');
      tbody.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const email = btn.dataset.remove!;
          if (!confirm(`Remove ${email} from the allowlist?`)) return;
          btn.disabled = true;
          try { await removeUser(email); await refresh(); }
          catch (e) { showError(e); btn.disabled = false; }
        });
      });
    } catch (e) {
      showError(e);
    }
  }

  $<HTMLButtonElement>('addBtn').addEventListener('click', async () => {
    const email = $<HTMLInputElement>('newEmail').value.trim().toLowerCase();
    const role = $<HTMLSelectElement>('newRole').value as 'admin' | 'user';
    if (!email || !email.includes('@')) { showError(new Error('Valid email required')); return; }
    try {
      await addUser(email, role);
      $<HTMLInputElement>('newEmail').value = '';
      errBox.innerHTML = '';
      await refresh();
    } catch (e) { showError(e); }
  });

  function showError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errBox.innerHTML = `<div class="error">${escapeHtml(msg)}</div>`;
  }

  refresh();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }
