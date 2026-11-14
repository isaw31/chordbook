/* =========================================================
   local-store.js — ChordBook offline app
   Saves songs on the phone itself (no server, no internet).
   Replaces song_api.php for the offline version.
   ========================================================= */
(function () {
  'use strict';
  const STORE = 'chordbook.v1';

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE));
      if (d && Array.isArray(d.songs)) return d;
    } catch (e) { /* ignore */ }
    return { nextId: 1, nextProgId: 1, nextSetId: 1, songs: [], progs: [], setlists: [] };
  }
  function save(d) {
    try {
      localStorage.setItem(STORE, JSON.stringify(d));
    } catch (e) {
      throw new Error('Phone storage is full. Export a backup and delete some songs.');
    }
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const summary = s => ({ id: s.id, title: s.title, artist: s.artist, original_key: s.original_key, song_key: s.song_key, updated_at: s.updated_at });
  const fail = msg => { throw new Error(msg); };

  const TYPES = ['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro', 'inst'];

  window.CHORDBOOK_LOCAL = async function (action, { body = {}, id } = {}) {
    const d = load();
    d.setlists = d.setlists || [];
    d.nextSetId = d.nextSetId || 1;

    switch (action) {
      case 'list':
        return { songs: d.songs.slice().sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1)).map(summary) };

      case 'get': {
        const s = d.songs.find(x => +x.id === +id);
        if (!s) fail('Song not found.');
        return { song: clone(s) };
      }

      case 'save': {
        const title = String(body.title || '').trim();
        if (!title) fail('Please enter a song title.');
        const song = {
          title: title.slice(0, 150),
          artist: String(body.artist || '').trim().slice(0, 150),
          original_key: body.original_key || '',
          song_key: body.song_key || '',
          sections: Array.isArray(body.sections) ? clone(body.sections).slice(0, 80) : [],
          timing: body.timing ? clone(body.timing) : null,
          updated_at: new Date().toISOString(),
        };
        let existing = body.id ? d.songs.find(x => +x.id === +body.id) : null;
        if (existing) {
          Object.assign(existing, song);
        } else {
          existing = Object.assign({ id: d.nextId++ }, song);
          d.songs.push(existing);
        }
        save(d);
        return { ok: true, id: existing.id };
      }

      case 'delete':
        d.songs = d.songs.filter(x => +x.id !== +body.id);
        save(d);
        return { ok: true };

      case 'prog_save': {
        if (!TYPES.includes(body.section_type)) fail('Invalid section.');
        const pattern = String(body.pattern || '').trim().slice(0, 1000);
        if (!pattern) fail('Type some chords first.');
        const p = { id: d.nextProgId++, section_type: body.section_type, pattern };
        d.progs.push(p);
        save(d);
        return { ok: true, id: p.id };
      }

      case 'prog_delete':
        d.progs = d.progs.filter(p => +p.id !== +body.id);
        save(d);
        return { ok: true };

      case 'setlists':
        return { setlists: d.setlists.slice().sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1)).map(clone) };

      case 'setlist_save': {
        const name = String(body.name || '').trim().slice(0, 100);
        if (!name) fail('Please give the setlist a name.');
        const ids = [...new Set((body.song_ids || []).map(Number))].filter(i => d.songs.some(s => +s.id === i));
        if (ids.length > 10) fail('A setlist can have up to 10 songs.');
        let sl = body.id ? d.setlists.find(x => +x.id === +body.id) : null;
        if (sl) Object.assign(sl, { name, song_ids: ids, updated_at: new Date().toISOString() });
        else { sl = { id: d.nextSetId++, name, song_ids: ids, updated_at: new Date().toISOString() }; d.setlists.push(sl); }
        save(d);
        return { ok: true, id: sl.id, song_ids: ids };
      }

      case 'setlist_delete':
        d.setlists = d.setlists.filter(x => +x.id !== +body.id);
        save(d);
        return { ok: true };

      case 'fetch_url':
        fail('On the phone app, links can’t be read directly. Open the link in Chrome, copy the chords, and paste them in the box below.');

      case 'export':
        return {
          app: 'ChordBook', version: 1, exported_at: new Date().toISOString(),
          songs: d.songs.map(s => ({ title: s.title, artist: s.artist, original_key: s.original_key, song_key: s.song_key, sections: s.sections, timing: s.timing })),
          progressions: d.progs.map(p => ({ section_type: p.section_type, pattern: p.pattern })),
          setlists: d.setlists.map(sl => ({
            name: sl.name,
            songs: sl.song_ids.map(id => d.songs.find(s => +s.id === +id)).filter(Boolean).map(s => ({ title: s.title, artist: s.artist })),
          })),
        };
    }
    fail('Unknown action.');
  };

  /* Initial data for home.js */
  const d = load();
  window.CHORDBOOK = {
    songs: d.songs.slice().sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1)).map(summary),
    library: window.CHORDBOOK_LIBRARY || [],
    progressions: d.progs,
  };

  /* Ask the browser not to auto-clear this app's storage */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
