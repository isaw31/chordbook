/* =========================================================
   setlist.js — ChordBook setlists / lineups
   Up to 10 songs per setlist, drag (or ↑↓) to reorder, play in order.
   ========================================================= */
(function () {
  'use strict';
  const CB = window.ChordBook;
  if (!CB) return;
  const MAX = 10;
  const $ = id => document.getElementById(id);
  const el = {
    list: $('setlistList'), count: $('setlistCount'), newBtn: $('newSetlistBtn'), addBtn: $('addToSetlistBtn'),
    modal: $('setlistModal'), close: $('slClose'), name: $('slName'), songs: $('slSongs'), counter: $('slCount'),
    addSelect: $('slAddSelect'), addSong: $('slAddBtn'), del: $('slDelete'), play: $('slPlay'), save: $('slSave'),
    pick: $('pickSetlistModal'), pickList: $('pickList'), pickClose: $('pickClose'), pickNew: $('pickNew'),
  };
  if (!el.modal) return;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let setlists = [];
  let editing = null;      // { id, name, song_ids: [] }
  let editDirty = false;
  let available = true;

  const songById = id => CB.getSongs().find(s => +s.id === +id);

  /* ---------------- Load & sidebar ---------------- */
  async function load() {
    try {
      setlists = (await CB.api('setlists')).setlists;
      available = true;
    } catch (e) {
      available = false;
      setlists = [];
    }
    renderSidebar();
  }

  function renderSidebar() {
    el.count.textContent = setlists.length ? `(${setlists.length})` : '';
    if (!available) {
      el.list.innerHTML = '<li class="empty">Import the latest songs.sql to use setlists.</li>';
      return;
    }
    el.list.innerHTML = setlists.length
      ? setlists.map(sl => {
          const n = sl.song_ids.filter(songById).length;
          return `<li data-sl="${sl.id}"><div class="li-title">📋 ${esc(sl.name)}</div>
                  <div class="li-meta">${n} song${n === 1 ? '' : 's'}<span class="sl-play-mini" data-play="${sl.id}" title="Play this setlist">▶</span></div></li>`;
        }).join('')
      : '<li class="empty">No setlists yet. Make one for your next service!</li>';
  }

  el.list.addEventListener('click', e => {
    const play = e.target.closest('[data-play]');
    if (play) { const sl = setlists.find(x => +x.id === +play.dataset.play); if (sl) startPlay(sl, 0); return; }
    const li = e.target.closest('li[data-sl]');
    if (li) openEditor(setlists.find(x => +x.id === +li.dataset.sl));
  });

  /* ---------------- Editor modal ---------------- */
  function openEditor(sl) {
    editing = sl
      ? { id: sl.id, name: sl.name, song_ids: sl.song_ids.filter(songById) }
      : { id: null, name: '', song_ids: [] };
    editDirty = false;
    el.name.value = editing.name;
    el.del.hidden = !editing.id;
    renderEditor();
    showModal(el.modal);
    if (!editing.id) el.name.focus();
  }

  function renderEditor() {
    const ids = editing.song_ids;
    el.counter.textContent = `${ids.length} / ${MAX} songs`;
    el.counter.classList.toggle('full', ids.length >= MAX);
    el.songs.innerHTML = ids.length
      ? ids.map((id, i) => {
          const s = songById(id);
          return `<li data-id="${id}">
            <span class="sl-handle" title="Drag to reorder">⠿</span>
            <span class="sl-num">${i + 1}</span>
            <button type="button" class="sl-title" data-open="${id}" title="Open in editor">
              <b>${esc(s.title)}</b><small>${esc(s.artist || '')}</small>
            </button>
            ${s.song_key ? `<span class="badge">${esc(s.song_key)}</span>` : ''}
            <span class="sl-tools">
              <button type="button" data-mv="-1" title="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
              <button type="button" data-mv="1" title="Move down"${i === ids.length - 1 ? ' disabled' : ''}>↓</button>
              <button type="button" data-rm title="Remove from setlist" class="del">✕</button>
            </span>
          </li>`;
        }).join('')
      : '<li class="empty">No songs yet — add some below.</li>';

    const left = CB.getSongs().filter(s => !ids.includes(+s.id));
    el.addSelect.innerHTML = left.length
      ? '<option value="">— Choose a song —</option>' + left.map(s => `<option value="${s.id}">${esc(s.title)}${s.song_key ? ' (' + esc(s.song_key) + ')' : ''}</option>`).join('')
      : '<option value="">No more songs to add</option>';
    el.addSelect.disabled = el.addSong.disabled = !left.length || ids.length >= MAX;
    el.play.disabled = !ids.length;
  }

  el.songs.addEventListener('click', async e => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const i = [...el.songs.children].indexOf(li);
    const ids = editing.song_ids;
    const mv = e.target.closest('[data-mv]');
    if (mv) {
      const j = i + +mv.dataset.mv;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      editDirty = true; renderEditor(); return;
    }
    if (e.target.closest('[data-rm]')) { ids.splice(i, 1); editDirty = true; renderEditor(); return; }
    const open = e.target.closest('[data-open]');
    if (open) {
      if (editDirty && !confirm('Leave without saving the setlist changes?')) return;
      if (await CB.loadSong(+open.dataset.open)) hideModal(el.modal);
    }
  });

  el.addSong.addEventListener('click', () => {
    const id = +el.addSelect.value;
    if (!id) { el.addSelect.focus(); return; }
    if (editing.song_ids.length >= MAX) { CB.toast(`A setlist can have up to ${MAX} songs.`, true); return; }
    editing.song_ids.push(id);
    editDirty = true;
    renderEditor();
  });
  el.name.addEventListener('input', () => { editing.name = el.name.value; editDirty = true; });

  /* Drag to reorder (works with mouse and touch) */
  let drag = null;
  el.songs.addEventListener('pointerdown', e => {
    const h = e.target.closest('.sl-handle');
    if (!h) return;
    e.preventDefault();
    const li = h.closest('li');
    drag = { li, startY: e.clientY };
    li.classList.add('dragging');
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', endDrag, { once: true });
    document.addEventListener('pointercancel', endDrag, { once: true });
  });
  function onDrag(e) {
    if (!drag) return;
    const items = [...el.songs.querySelectorAll('li[data-id]')].filter(x => x !== drag.li);
    const after = items.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) { if (drag.li.nextElementSibling !== after) el.songs.insertBefore(drag.li, after); }
    else if (el.songs.lastElementChild !== drag.li) el.songs.appendChild(drag.li);
  }
  function endDrag() {
    if (!drag) return;
    document.removeEventListener('pointermove', onDrag);
    drag.li.classList.remove('dragging');
    const order = [...el.songs.querySelectorAll('li[data-id]')].map(x => +x.dataset.id);
    if (order.join() !== editing.song_ids.join()) { editing.song_ids = order; editDirty = true; }
    drag = null;
    renderEditor();
  }

  async function saveEditor() {
    const name = el.name.value.trim();
    if (!name) { CB.toast('Please give the setlist a name.', true); el.name.focus(); return null; }
    el.save.disabled = true;
    try {
      const r = await CB.api('setlist_save', { method: 'POST', body: { id: editing.id, name, song_ids: editing.song_ids } });
      editing.id = r.id; editing.name = name; editing.song_ids = r.song_ids;
      editDirty = false;
      await load();
      el.del.hidden = false;
      CB.toast('📋 Setlist saved');
      return setlists.find(x => +x.id === +r.id);
    } catch (e) {
      CB.toast(e.message, true);
      return null;
    } finally {
      el.save.disabled = false;
    }
  }

  el.save.addEventListener('click', saveEditor);
  el.del.addEventListener('click', async () => {
    if (!editing.id || !confirm(`Delete the setlist "${editing.name}"? (The songs stay in My Songs.)`)) return;
    try {
      await CB.api('setlist_delete', { method: 'POST', body: { id: editing.id } });
      hideModal(el.modal);
      await load();
      CB.toast('Setlist deleted.');
    } catch (e) { CB.toast(e.message, true); }
  });
  el.play.addEventListener('click', async () => {
    let sl = editing;
    if (editDirty || !editing.id) { sl = await saveEditor(); if (!sl) return; }
    hideModal(el.modal);
    startPlay(sl, 0);
  });
  el.close.addEventListener('click', () => {
    if (editDirty && !confirm('Close without saving the setlist changes?')) return;
    hideModal(el.modal);
  });
  el.newBtn.addEventListener('click', () => {
    if (!available) { CB.toast('Import the latest songs.sql in phpMyAdmin to use setlists.', true); return; }
    openEditor(null);
  });

  /* ---------------- "Add to setlist" from the editor ---------------- */
  el.addBtn.addEventListener('click', async () => {
    if (!available) { CB.toast('Import the latest songs.sql in phpMyAdmin to use setlists.', true); return; }
    let song = CB.getSong();
    if (!song.id || CB.isDirty()) {
      if (!song.title.trim()) { CB.toast('Give the song a title and save it first.', true); return; }
      await CB.saveSong();
      song = CB.getSong();
      if (!song.id) return;
    }
    el.pickList.innerHTML = setlists.length
      ? setlists.map(sl => {
          const ids = sl.song_ids.filter(songById);
          const inIt = ids.includes(+song.id);
          const full = ids.length >= MAX;
          return `<li><div><b>📋 ${esc(sl.name)}</b><small>${ids.length}/${MAX} songs</small></div>
            <button type="button" class="btn-ghost small" data-add="${sl.id}"${inIt || full ? ' disabled' : ''}>${inIt ? '✓ Added' : full ? 'Full' : '＋ Add'}</button></li>`;
        }).join('')
      : '<li class="empty">No setlists yet.</li>';
    showModal(el.pick);
  });

  el.pickList.addEventListener('click', async e => {
    const b = e.target.closest('[data-add]');
    if (!b || b.disabled) return;
    const sl = setlists.find(x => +x.id === +b.dataset.add);
    const ids = sl.song_ids.filter(songById);
    const song = CB.getSong();
    if (ids.length >= MAX) { CB.toast(`That setlist already has ${MAX} songs.`, true); return; }
    try {
      await CB.api('setlist_save', { method: 'POST', body: { id: sl.id, name: sl.name, song_ids: ids.concat(+song.id) } });
      await load();
      hideModal(el.pick);
      CB.toast(`Added to "${sl.name}" (${ids.length + 1}/${MAX})`);
    } catch (err) { CB.toast(err.message, true); }
  });
  el.pickNew.addEventListener('click', () => {
    hideModal(el.pick);
    openEditor(null);
    editing.song_ids = [+CB.getSong().id];
    editDirty = true;
    renderEditor();
  });
  el.pickClose.addEventListener('click', () => hideModal(el.pick));

  /* ---------------- Play a setlist (uses the Play / Sync screen) ---------------- */
  const S = window.ChordBookSetlist = {
    active: null,
    async go(delta) {
      if (!S.active) return;
      const j = S.active.idx + delta;
      if (j < 0 || j >= S.active.ids.length) return;
      if (await CB.loadSong(S.active.ids[j])) {
        S.active.idx = j;
        window.ChordBookPlayer && window.ChordBookPlayer.open();
      }
    },
    stop() { S.active = null; },
    nextTitle() {
      if (!S.active) return '';
      const s = songById(S.active.ids[S.active.idx + 1]);
      return s ? s.title : '';
    },
  };

  async function startPlay(sl, idx) {
    const ids = sl.song_ids.filter(songById);
    if (!ids.length) { CB.toast('This setlist has no songs yet.', true); return; }
    if (!(await CB.loadSong(ids[idx]))) return;
    S.active = { name: sl.name, ids, idx };
    window.ChordBookPlayer && window.ChordBookPlayer.open();
  }

  /* ---------------- Modal helpers ---------------- */
  function showModal(m) { m.hidden = false; document.body.classList.add('no-scroll'); }
  function hideModal(m) {
    m.hidden = true;
    if (document.querySelectorAll('.modal:not([hidden])').length === 0 && document.getElementById('player').hidden) document.body.classList.remove('no-scroll');
  }
  [el.modal, el.pick].forEach(m => m.addEventListener('click', e => {
    if (e.target !== m) return;
    if (m === el.modal) el.close.click(); else hideModal(m);
  }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!el.pick.hidden) hideModal(el.pick);
    else if (!el.modal.hidden) el.close.click();
  });

  document.addEventListener('chordbook:songs', () => { renderSidebar(); if (!el.modal.hidden) renderEditor(); });
  document.addEventListener('chordbook:setlists', load);
  load();
})();
