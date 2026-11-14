/* =========================================================
   import.js — ChordBook: import chords from a link or pasted text
   Reads section names (Intro, Verse, Chorus…) and chord lines,
   skips the lyrics, and puts everything in the editor to edit.
   ========================================================= */
(function () {
  'use strict';
  const CB = window.ChordBook;
  if (!CB) return;
  const $ = id => document.getElementById(id);
  const LOCAL = !!window.CHORDBOOK_LOCAL;

  /* ---------------- Parser ---------------- */
  const SECTION_RE = /^[\[\(\{<*#\s]*(intro|verse|pre[\s-]?chorus|prechorus|post[\s-]?chorus|chorus|refrain|bridge|outro|ending|end|interlude|instrumental|inst\.?|solo|tag|coda|hook|vamp|breakdown|turnaround|riff)\b\.?\s*(\d+)?\s*[\]\)\}>*]?\s*[:\-–]?\s*(.*)$/i;
  const DECOR_RE = /^(\|+|:?\|\|?:?|x\d+|\(x?\d+x?\)|\d+x|-+|–|—|\.+|\/+|%|n\.?c\.?|\*+|\(|\)|repeat|rpt)$/i;
  const NAMES = {
    'pre chorus': 'Pre-Chorus', 'pre-chorus': 'Pre-Chorus', prechorus: 'Pre-Chorus',
    'post chorus': 'Post-Chorus', 'post-chorus': 'Post-Chorus', refrain: 'Chorus',
    inst: 'Instrumental', 'inst.': 'Instrumental', end: 'Ending', solo: 'Instrumental', riff: 'Intro',
  };
  const titleCase = w => w.replace(/\b\w/g, c => c.toUpperCase());

  function cleanTok(t) { return t.replace(/^[(\[]+|[)\],.;]+$/g, ''); }

  /* Is this line mostly chords? Returns the chords, or null */
  function chordLine(line) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    const chords = [], extra = [];
    let other = 0;
    toks.forEach(t => {
      const c = cleanTok(t);
      if (c && CB.isChord(c)) chords.push(c);
      else if (DECOR_RE.test(t) || DECOR_RE.test(c)) { if (/x\d+|\d+x/i.test(t)) extra.push(t.replace(/[()]/g, '')); }
      else other++;
    });
    if (!chords.length || other > Math.max(0, Math.floor(chords.length * 0.25))) return null;
    // "A" or "Am" alone could be lyrics ("A new day…") only if the line has words — already filtered above
    return chords.concat(extra);
  }

  /* ChordPro style: [G]Amazing [D]grace → G D */
  function inlineChords(line) {
    const found = [...line.matchAll(/\[([^\]\s]{1,12})\]/g)].map(m => m[1]).filter(c => CB.isChord(c));
    return found.length ? found : null;
  }

  function parseSheet(raw) {
    let text = String(raw || '')
      .replace(/\r/g, '')
      .replace(/\t/g, '    ')
      .replace(/\[\/?(ch|tab)\]/gi, '');           // Ultimate Guitar markup
    const lines = text.split('\n');
    const sections = [];
    let cur = null, key = '', title = '', unnamed = 0;

    const start = (name) => { cur = { type: 'section', name, chords: '' }; sections.push(cur); };
    const add = (chords, inline) => {
      if (!cur) start(sections.length ? 'Section ' + (++unnamed) : (inline ? 'Verse' : 'Intro'));
      cur.chords += (cur.chords ? '\n' : '') + chords.join('  ');
    };

    for (const rawLine of lines) {
      const line = rawLine.replace(/ /g, ' ').trimEnd();
      const t = line.trim();
      if (!t) continue;

      let d = t.match(/^\{\s*(title|t|key|artist|subtitle|st)\s*:\s*(.*?)\s*\}$/i);   // ChordPro {title: …}
      if (d) {
        const k = d[1].toLowerCase();
        if (k === 'title' || k === 't') title = d[2];
        else if (k === 'key') key = CB.normalizeKey(d[2]);
        continue;
      }
      if (/^\{.*\}$/.test(t)) continue;

      let m = t.match(/^(?:key|tono|original key)\s*(?:of)?\s*[:\-=]?\s*([A-G][#b♯♭]?m?)\b/i);
      if (m) { key = CB.normalizeKey(m[1].replace('♯', '#').replace('♭', 'b')); continue; }
      if (/^(capo|tuning|tempo|bpm|time|difficulty|author|chords? by|transcribed)\b/i.test(t)) continue;

      if (/\b(key change|modulat|change key|transpose up|half step up|step up)\b/i.test(t)) {
        const to = t.match(/\bto\s+([A-G][#b]?m?)\b/);
        sections.push({ type: 'keychange', key: to ? CB.normalizeKey(to[1]) : '' });
        cur = null;
        continue;
      }

      m = t.match(SECTION_RE);
      if (m) {
        const rest = m[3].trim();
        const repeatOnly = /^(\(?\s*x\s*\d+\s*\)?|\(?\s*\d+\s*x\s*\)?|x)$/i.test(rest);
        const restChords = rest && !repeatOnly ? chordLine(rest) : null;
        if (rest === '' || repeatOnly || restChords || DECOR_RE.test(rest)) {
          const base = m[1].toLowerCase().replace(/\s+/, ' ');
          const name = NAMES[base] || titleCase(base);
          let label = name;
          if (/^x$/i.test(rest) && m[2]) label = `${name} (x${m[2]})`;          // "Bridge 2x"
          else {
            if (m[2]) label += ' ' + m[2];                                        // "Verse 2"
            const rep = rest.match(/\d+/);
            if (repeatOnly && rep) label += ` (x${rep[0]})`;                      // "Chorus x2"
          }
          start(label);
          if (restChords) add(restChords);
          continue;
        }
      }

      const c = chordLine(t);
      if (c) { add(c); continue; }
      const ic = inlineChords(t);
      if (ic) { add(ic, true); continue; }

      if (!title && !sections.length && t.length < 80 && !/https?:|www\./i.test(t)) title = t;   // first plain line before chords
    }

    const out = sections.filter(s => s.type === 'keychange' || s.chords.trim());
    // drop key changes at the very start/end
    while (out.length && out[0].type === 'keychange') out.shift();
    while (out.length && out[out.length - 1].type === 'keychange') out.pop();

    let guessed = false;
    if (!key) {
      const first = out.find(s => s.type === 'section');
      const tok = first && first.chords.split(/\s+/)[0];
      if (tok) {
        const mm = tok.match(/^([A-G][#b]?)(m(?!aj))?/);
        if (mm) { key = CB.normalizeKey(mm[1] + (mm[2] ? 'm' : '')); guessed = true; }
      }
    }
    return { title, key, guessed, sections: out };
  }

  /* ---------------- Modal ---------------- */
  const el = {
    open: $('importBtn'), modal: $('importModal'), close: $('importClose'),
    url: $('importUrl'), fetch: $('importFetch'), urlNote: $('importUrlNote'),
    text: $('importText'), parse: $('importParse'),
    preview: $('importPreview'), apply: $('importApply'), applyNew: $('importApplyNew'), status: $('importStatus'),
  };
  if (!el.modal) return;

  let parsed = null, meta = { title: '', artist: '' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function openModal() {
    parsed = null; meta = { title: '', artist: '' };
    el.preview.innerHTML = ''; el.status.textContent = '';
    el.apply.disabled = el.applyNew.disabled = true;
    if (LOCAL) {
      el.urlNote.innerHTML = navigator.onLine
        ? 'On the phone app, links can’t be read directly (websites block it). Open the link in Chrome → long-press the chords → <b>Select all</b> → <b>Copy</b> → paste below.'
        : '📴 You’re offline — paste the chords below.';
      el.fetch.disabled = true; el.url.disabled = true;
    }
    el.modal.hidden = false;
    document.body.classList.add('no-scroll');
    (LOCAL ? el.text : el.url).focus();
  }
  function closeModal() { el.modal.hidden = true; document.body.classList.remove('no-scroll'); }

  function showPreview() {
    if (!parsed || !parsed.sections.length) {
      el.preview.innerHTML = '<div class="hint">No chords found. Make sure the text has chord lines like <code>G  D  Em  C</code> or <code>[G]Amazing [D]grace</code>.</div>';
      el.apply.disabled = el.applyNew.disabled = true;
      return;
    }
    const k = parsed.key ? `Key: <b>${esc(parsed.key)}</b>${parsed.guessed ? ' <span class="hint inline">(guessed from the first chord — change it if wrong)</span>' : ''}` : 'Key: not found';
    el.preview.innerHTML = `
      <div class="imp-meta">${meta.title || parsed.title ? `<b>${esc(meta.title || parsed.title)}</b>${meta.artist ? ' · ' + esc(meta.artist) : ''} · ` : ''}${k} · ${parsed.sections.filter(s => s.type === 'section').length} sections</div>
      ${parsed.sections.map(s => s.type === 'keychange'
        ? `<div class="imp-kc">⬆ KEY CHANGE${s.key ? ' → ' + esc(s.key) : ''}</div>`
        : `<div class="imp-sec"><div class="imp-name">${esc(s.name)}</div><pre>${esc(s.chords)}</pre></div>`).join('')}`;
    el.apply.disabled = el.applyNew.disabled = false;
  }

  function doParse() {
    parsed = parseSheet(el.text.value);
    showPreview();
  }

  async function doFetch() {
    const url = el.url.value.trim();
    if (!url) { el.url.focus(); return; }
    el.fetch.disabled = true;
    el.status.textContent = 'Opening the page…';
    try {
      const r = await CB.api('fetch_url', { method: 'POST', body: { url } });
      el.text.value = r.text || '';
      meta = { title: cleanTitle(r.title || ''), artist: r.artist || '' };
      doParse();
      el.status.textContent = parsed.sections.length ? '✓ Chords found — check the preview, then add them.' : '';
    } catch (e) {
      el.status.textContent = '';
      CB.toast(e.message, true);
      el.text.focus();
    } finally {
      el.fetch.disabled = false;
    }
  }

  function cleanTitle(t) {
    return t.replace(/\s*[|–—-]\s*(chords?|tabs?|lyrics|ultimate guitar|ug|worship together|praisecharts).*$/i, '')
            .replace(/\s*(chords?|tabs?)\s*(by .*)?$/i, '').trim();
  }

  function apply(asNew) {
    if (!parsed || !parsed.sections.length) return;
    const song = CB.getSong();
    const hasChords = song.sections.some(s => s.type === 'section' && s.chords.trim());
    if (asNew && CB.isDirty() && !confirm('You have unsaved changes. Start a new song anyway?')) return;
    if (!asNew && hasChords && !confirm('Replace the sections of the song you are editing with the imported chords?')) return;
    CB.applyImport({
      title: meta.title || parsed.title, artist: meta.artist,
      key: parsed.key, sections: parsed.sections.map(s => ({ ...s })),
    }, { asNew });
    closeModal();
    CB.toast('📥 Chords imported — edit anything you like, then Save.');
  }

  el.open.addEventListener('click', openModal);
  el.close.addEventListener('click', closeModal);
  el.modal.addEventListener('click', e => { if (e.target === el.modal) closeModal(); });
  el.fetch.addEventListener('click', doFetch);
  el.url.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doFetch(); } });
  el.parse.addEventListener('click', doParse);
  let t;
  el.text.addEventListener('input', () => { clearTimeout(t); t = setTimeout(doParse, 400); });
  el.apply.addEventListener('click', () => apply(false));
  el.applyNew.addEventListener('click', () => apply(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.modal.hidden) closeModal(); });

  window.ChordBookParse = parseSheet;
})();
