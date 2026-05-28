import { onSession, signIn, signOutNow, type Session } from './auth';
import { renderGenerator } from './views/generator';
import { renderAdmin } from './views/admin';

const root = document.getElementById('app')!;
let currentTab: 'generate' | 'admin' = 'generate';

onSession((session) => {
  if (!session) { renderSignIn(); return; }
  if (session.role === null) { renderDenied(session); return; }
  renderShell(session);
});

function renderSignIn() {
  root.innerHTML = `
    <div class="gate">
      <h2>OpsAgents Studio Console</h2>
      <p>Sign in with your authorized Google account to generate images.</p>
      <button class="btn-google" id="signInBtn">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.1z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8L6.1 33C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
        Sign in with Google
      </button>
    </div>
  `;
  document.getElementById('signInBtn')!.addEventListener('click', () => {
    signIn().catch((e) => alert(`Sign-in failed: ${e.message ?? e}`));
  });
}

function renderDenied(session: Session) {
  root.innerHTML = `
    <div class="gate denied">
      <h2>Not authorized</h2>
      <p>${session.user.email} is not on the allowlist for this app.</p>
      <p>Contact <a href="mailto:michal@opsagents.agency" style="color:var(--accent)">michal@opsagents.agency</a> if you should have access.</p>
      <button class="btn-google" style="background:var(--panel); color:var(--text); border:1px solid var(--border)" id="signOutBtn">Sign out</button>
    </div>
  `;
  document.getElementById('signOutBtn')!.addEventListener('click', () => signOutNow());
}

function renderShell(session: Session) {
  const isAdmin = session.role === 'admin';
  root.innerHTML = `
    <header class="topbar">
      <h1>🎨 OpsAgents Studio Console</h1>
      <div class="user">
        <span>${session.user.email} · <span class="role-${session.role}">${session.role}</span></span>
        <button id="signOutBtn">Sign out</button>
      </div>
    </header>
    <main>
      ${isAdmin ? `
        <div class="tabs">
          <button class="tab ${currentTab === 'generate' ? 'active' : ''}" data-tab="generate">Generate</button>
          <button class="tab ${currentTab === 'admin' ? 'active' : ''}" data-tab="admin">Admin</button>
        </div>
      ` : ''}
      <div id="view"></div>
    </main>
  `;

  document.getElementById('signOutBtn')!.addEventListener('click', () => signOutNow());
  if (isAdmin) {
    root.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab as 'generate' | 'admin';
        renderShell(session);
      });
    });
  } else if (currentTab === 'admin') {
    currentTab = 'generate';
  }

  const view = document.getElementById('view')!;
  if (currentTab === 'admin' && isAdmin) renderAdmin(view);
  else renderGenerator(view);
}
