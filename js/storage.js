/**
 * ذخیره مشترک — همه گوشی‌ها یک داده می‌بینند
 * از JSONBlob (رایگان، بدون ثبت‌نام) + localStorage
 */
(function (global) {
  const LS_KEY = 'golbahar_volleyball_state';
  const LS_BIN_KEY = 'golbahar_cloud_bin_id';
  const HARDCODED_BIN_ID = '';
  const JSONBLOB_BASE = 'https://jsonblob.com/api/jsonBlob';
  let memoryState = null;
  let binId = HARDCODED_BIN_ID || localStorage.getItem(LS_BIN_KEY) || '';
  let listeners = [];
  let syncing = false;
  function notify() { listeners.forEach((fn) => { try { fn(memoryState); } catch (e) {} }); }
  function loadLocal() { try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {} return null; }
  function saveLocal(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {
      try {
        const light = JSON.parse(JSON.stringify(state));
        if (light.teams) light.teams.forEach((t) => { if (t.logo && t.logo.length > 40000) t.logo = null; if (t.teamPhoto && t.teamPhoto.length > 50000) t.teamPhoto = null; });
        if (light.organizerLogo && light.organizerLogo.length > 50000) light.organizerLogo = null;
        localStorage.setItem(LS_KEY, JSON.stringify(light));
      } catch (e2) {}
    }
  }
  async function fetchCloud(id) {
    if (!id) return null;
    const res = await fetch(JSONBLOB_BASE + '/' + id, { method: 'GET', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }
  async function createCloud(state) {
    const res = await fetch(JSONBLOB_BASE, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    if (!res.ok) throw new Error('create failed ' + res.status);
    const loc = res.headers.get('Location') || res.headers.get('location') || '';
    const parts = loc.split('/');
    const id = parts[parts.length - 1] || '';
    if (!id) throw new Error('no bin id in response');
    return id;
  }
  async function updateCloud(id, state) {
    const res = await fetch(JSONBLOB_BASE + '/' + id, { method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    if (!res.ok) throw new Error('update failed ' + res.status);
    return true;
  }
  const Storage = {
    getBinId() { return binId || HARDCODED_BIN_ID || localStorage.getItem(LS_BIN_KEY) || ''; },
    setBinId(id) { binId = id || ''; if (binId) localStorage.setItem(LS_BIN_KEY, binId); else localStorage.removeItem(LS_BIN_KEY); },
    getState() { return memoryState; },
    onChange(fn) { listeners.push(fn); return () => { listeners = listeners.filter((f) => f !== fn); }; },
    async init(defaultState) {
      let state = loadLocal() || defaultState;
      memoryState = state;
      const id = this.getBinId();
      if (id) {
        try {
          const remote = await fetchCloud(id);
          if (remote && typeof remote === 'object') {
            if (!remote.lastUpdated || !state.lastUpdated || remote.lastUpdated >= state.lastUpdated) {
              memoryState = remote; saveLocal(memoryState);
            }
          }
        } catch (e) { console.warn('cloud read failed', e); }
      }
      notify();
      setInterval(() => this.pull(), 15000);
      return memoryState;
    },
    async save(state) {
      if (syncing) return;
      state.lastUpdated = Date.now();
      memoryState = state;
      saveLocal(state);
      notify();
      const id = this.getBinId();
      if (!id) return { ok: true, localOnly: true };
      try { syncing = true; await updateCloud(id, state); return { ok: true, cloud: true }; }
      catch (e) { console.warn('cloud write failed', e); return { ok: false, error: String(e) }; }
      finally { syncing = false; }
    },
    async enableCloud(state) {
      const payload = state || memoryState;
      payload.lastUpdated = Date.now();
      try {
        const id = await createCloud(payload);
        this.setBinId(id);
        memoryState = payload; saveLocal(payload); notify();
        return { ok: true, binId: id };
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
    async pull() {
      const id = this.getBinId();
      if (!id || syncing) return;
      try {
        const remote = await fetchCloud(id);
        if (remote && remote.lastUpdated && remote.lastUpdated > (memoryState?.lastUpdated || 0)) {
          memoryState = remote; saveLocal(remote); notify();
        }
      } catch (e) {}
    },
    isCloudEnabled() { return !!this.getBinId(); }
  };
  global.GolbaharStorage = Storage;
})(window);
