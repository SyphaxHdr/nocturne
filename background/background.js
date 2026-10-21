/* Nocturne : script d'arrière-plan.
 * Rôles : fenêtre compacte, plein écran de la fenêtre, raccourci clavier, options, lecture d'une discussion
 * (petite fenêtre temporaire, sur demande). Nocturne ne collecte, n'enregistre ni n'envoie aucune donnée. */
const ext = typeof browser !== 'undefined' ? browser : chrome;
const X_URL = /^https:\/\/(x|twitter)\.com\//;

async function toggleOnActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && X_URL.test(tab.url)) {
    try { await ext.tabs.sendMessage(tab.id, { type: 'nct-toggle' }); return; } catch (_) {}
  }
  await ext.tabs.create({ url: 'https://x.com/home#nocturne' });
}

async function openCompact() {
  const w = await ext.windows.create({ url: 'https://x.com/home#nocturne', type: 'popup', width: 430, height: 860 });
  return w && w.id;
}

// Plein écran de la FENÊTRE (comme F11) : la page de X reste affichée en dessous et continue de charger de nouvelles vidéos,
// contrairement au plein écran d'un élément où Firefox peut figer le défilement de X.
const beforeFs = new Map();
async function windowFullscreen(sender, on) {
  const id = sender.tab && sender.tab.windowId;
  if (id == null) return { ok: false };
  const w = await ext.windows.get(id);
  if (on) {
    if (w.state !== 'fullscreen') beforeFs.set(id, w.state);
    await ext.windows.update(id, { state: 'fullscreen' });
  } else {
    const prev = beforeFs.get(id);
    beforeFs.delete(id);
    await ext.windows.update(id, { state: prev && prev !== 'fullscreen' ? prev : 'normal' });
  }
  return { ok: true, fullscreen: on };
}
async function windowIsFullscreen(sender) {
  const id = sender.tab && sender.tab.windowId;
  if (id == null) return { ok: false };
  return { ok: true, fullscreen: (await ext.windows.get(id)).state === 'fullscreen' };
}

/* ---------- Module complémentaire facultatif « Nocturne Analyse » (extension séparée, privée) ---------- */
// Nocturne ne collecte rien lui-même. Si ce module est installé, on lui relaie le tweet affiché quand tu appuies sur « Marquer ».
const COMPANION = 'nocturne-analyse@local';
function companion(msg, sender) {
  const cmd = msg.cmd;
  if (cmd === 'ping') return ext.runtime.sendMessage(COMPANION, { type: 'ping' }).then((r) => r || { ok: false }, () => ({ ok: false }));
  if (cmd === 'open') return ext.runtime.sendMessage(COMPANION, { type: 'open' }).catch(() => ({ ok: false }));
  if (cmd === 'summary') return ext.runtime.sendMessage(COMPANION, { type: 'summary', source: String(msg.source || '') }).then((r) => r || { ok: false, error: 'pas de réponse' }, () => ({ ok: false, error: 'module absent' }));
  if (cmd === 'mark') {
    return ext.runtime.sendMessage(COMPANION, { type: 'mark', id: String(msg.id), handle: String(msg.handle), source: String(msg.source || ''), tabId: sender.tab && sender.tab.id })
      .then((r) => r || { ok: false, error: 'pas de réponse' }, () => ({ ok: false, error: 'module Nocturne Analyse absent' }));
  }
  return Promise.resolve({ ok: false });
}

/* ---------- Discussion : lecture de la page d'un tweet (petite fenêtre temporaire, sur demande uniquement, rien n'est enregistré) ---------- */

let scanChain = Promise.resolve();
const scans = new Map(); // id d'onglet → résolution
function scan(url, kind, timeout = 35000) {
  const run = async () => {
    const opts = { url: url + '#nct-scan=' + kind, type: 'popup', width: 520, height: 900, left: 0, top: 0 };
    let win;
    try { win = await ext.windows.create({ ...opts, focused: false }); } catch (_) { win = await ext.windows.create(opts); }
    const tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
    try {
      return await new Promise((resolve, reject) => {
        const t = setTimeout(() => { scans.delete(tabId); reject(new Error('X met trop de temps à répondre')); }, timeout);
        scans.set(tabId, (data) => { clearTimeout(t); scans.delete(tabId); resolve(data); });
      });
    } finally { ext.windows.remove(win.id).catch(() => {}); }
  };
  const p = scanChain.then(run, run);
  scanChain = p.catch(() => {});
  return p;
}

const RE_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
async function readThread(handle, id) {
  if (!RE_HANDLE.test(handle || '') || !/^\d{1,25}$/.test(String(id))) throw new Error('tweet invalide');
  return scan('https://x.com/' + handle + '/status/' + id, 'thread', 30000);
}

const fail = (e) => ({ ok: false, error: String((e && e.message) || e) });

ext.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'nct-scan-done': { const r = sender.tab && scans.get(sender.tab.id); if (r) r(msg.data); return; }
    case 'nct-companion': return companion(msg, sender);
    case 'nct-thread': return readThread(msg.handle, msg.id).then((data) => ({ ok: true, data }), fail);
    case 'nct-open-compact': return openCompact().then(() => ({ ok: true }));
    case 'nct-toggle-active': return toggleOnActiveTab().then(() => ({ ok: true }));
    case 'nct-fullscreen': return windowFullscreen(sender, !!msg.on).catch(() => ({ ok: false }));
    case 'nct-fullscreen-state': return windowIsFullscreen(sender).catch(() => ({ ok: false }));
    case 'nct-options': return ext.runtime.openOptionsPage().then(() => ({ ok: true }));
  }
});

/* ---------- Mises à jour sans blocage ---------- */
// Firefox attend notre feu vert (runtime.reload) avant d'installer une nouvelle version : on ne la pose que lorsqu'aucun
// onglet X n'est ouvert (sinon on réessaie chaque minute ; au pire elle s'installe au prochain démarrage de Firefox).
const X_TABS = ['https://x.com/*', 'https://twitter.com/*'];
let updateTimer = null;
async function applyUpdateWhenIdle() {
  clearTimeout(updateTimer);
  const tabs = await ext.tabs.query({ url: X_TABS }).catch(() => [{}]);
  if (!tabs.length) return ext.runtime.reload();
  updateTimer = setTimeout(applyUpdateWhenIdle, 60000);
}
if (ext.runtime.onUpdateAvailable) ext.runtime.onUpdateAvailable.addListener(() => applyUpdateWhenIdle());
// Arrivée depuis une version sans ce mécanisme (0.6.0 et avant) : les onglets X ouverts gardent l'ancien Nocturne en mémoire,
// on les recharge une seule fois pour repartir propre.
if (ext.runtime.onInstalled) ext.runtime.onInstalled.addListener(async (d) => {
  if (!d || d.reason !== 'update') return;
  const tabs = await ext.tabs.query({ url: X_TABS }).catch(() => []);
  for (const t of tabs) ext.tabs.reload(t.id).catch(() => {});
});

ext.commands.onCommand.addListener((cmd) => { if (cmd === 'toggle-nocturne') toggleOnActiveTab(); });
