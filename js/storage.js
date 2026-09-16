/**
 * ذخیره زنده مشترک — همه گوشی‌ها یک داده می‌بینند
 * Backend: crudcrud.com (CORS باز، بدون ثبت‌نام)
 */
(function (global) {
  const LS_KEY = 'golbahar_volleyball_state';
  const CLOUD_BASE = 'https://crudcrud.com/api/31ee9f3211594237b3da1bdfebd4167d';
  const CLOUD_RESOURCE = 'tournament';
  const CLOUD_DOC_ID = '6aaa8a46e24e7c03e81a1a82';
  let memoryState = null;
  let listeners = [];
  let syncing = false;
  function notify() { listeners.forEach((fn) => { try { fn(memoryState); } catch (e) {} }); }
  function loadLocal() { try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {} return null; }
  function saveLocal(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {
      try {
        const light = JSON.parse(JSON.stringify(state));
        if (light.teams) light.teams.forEach((t) => { if (t.logo && String(t.logo).length > 30000) t.logo = null; if (t.teamPhoto && String(t.teamPhoto).length > 40000) t.teamPhoto = null; });
        if (light.organizerLogo && String(light.organizerLogo).length > 40000) light.organizerLogo = null;
        localStorage.setItem(LS_KEY, JSON.stringify(light));
      } catch (e2) {}
    }
  }
  function cloudUrl() { return CLOUD_BASE + '/' + CLOUD_RESOURCE + '/' + CLOUD_DOC_ID; }
  function stripForCloud(state) {
    const payload = JSON.parse(JSON.stringify(state));
    delete payload._id;
    if (payload.teams) payload.teams.forEach((t) => { if (t.teamPhoto && String(t.teamPhoto).length > 80000) t.teamPhoto = null; if (t.logo && String(t.logo).length > 60000) t.logo = null; });
    if (payload.organizerLogo && String(payload.organizerLogo).length > 80000) payload.organizerLogo = null;
    return payload;
  }
  async function fetchCloud() {
    const res = await fetch(cloudUrl() + '?t=' + Date.now(), { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('cloud get ' + res.status);
    const data = await res.json();
    delete data._id;
    return data;
  }
  async function putCloud(state) {
    const payload = stripForCloud(state);
    const res = await fetch(cloudUrl(), { method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('cloud put ' + res.status);
    return true;
  }
  const Storage = {
    isCloudEnabled() { return true; },
    getBinId() { return CLOUD_DOC_ID; },
    setBinId() {},
    getState() { return memoryState; },
    onChange(fn) { listeners.push(fn); return () => { listeners = listeners.filter((f) => f !== fn); }; },
    async init(defaultState) {
      let state = loadLocal() || defaultState;
      memoryState = state;
      try {
        const remote = await fetchCloud();
        if (remote && typeof remote === 'object') {
          const rTime = remote.lastUpdated || 0;
          const lTime = state.lastUpdated || 0;
          if (rTime >= lTime || !state.teams || state.teams.length === 0) {
            memoryState = Object.assign({}, defaultState, remote);
            if (!Array.isArray(memoryState.teams)) memoryState.teams = [];
            if (!Array.isArray(memoryState.matches)) memoryState.matches = [];
            if (!Array.isArray(memoryState.news)) memoryState.news = [];
            saveLocal(memoryState);
          } else if (lTime > rTime) { await putCloud(state); }
        }
      } catch (e) { console.warn('cloud init', e); }
      notify();
      setInterval(() => this.pull(), 8000);
      return memoryState;
    },
    async save(state) {
      if (syncing) { memoryState = state; saveLocal(state); notify(); return { ok: true, queued: true }; }
      state.lastUpdated = Date.now();
      memoryState = state;
      saveLocal(state);
      notify();
      try { syncing = true; await putCloud(state); return { ok: true, cloud: true }; }
      catch (e) { console.warn('cloud save', e); return { ok: false, error: String(e), localOnly: true }; }
      finally { syncing = false; }
    },
    async pull() {
      if (syncing) return;
      try {
        const remote = await fetchCloud();
        if (remote && remote.lastUpdated && remote.lastUpdated > (memoryState?.lastUpdated || 0)) {
          memoryState = remote;
          if (!Array.isArray(memoryState.teams)) memoryState.teams = [];
          if (!Array.isArray(memoryState.matches)) memoryState.matches = [];
          if (!Array.isArray(memoryState.news)) memoryState.news = [];
          saveLocal(remote);
          notify();
        }
      } catch (e) {}
    },
    async enableCloud(state) {
      try { await putCloud(state || memoryState); return { ok: true, binId: CLOUD_DOC_ID }; }
      catch (e) { return { ok: false, error: String(e.message || e) }; }
    }
  };
  global.GolbaharStorage = Storage;
})(window);
