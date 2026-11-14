/* =========================================================
   home.js — ChordBook song editor
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- Keys & transposition ---------------- */
  const MAJOR = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const MINOR = ['Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m','Am','Bbm','Bm'];
  const NOTE_INDEX = { C:0,'B#':0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,Fb:4,'E#':5,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,Cb:11 };

  const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const MIXED  = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const FLAT_KEYS  = ['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm'];
  const SHARP_KEYS = ['D','A','E','B','F#','Em','Am','Bm','F#m','C#m','G#m'];

  const isMinor  = k => /m$/.test(k);
  const keyIndex = k => k ? NOTE_INDEX[k.replace(/m$/, '')] : undefined;
  const keyAt    = (idx, minor) => (minor ? MINOR : MAJOR)[((idx % 12) + 12) % 12];
  const normalizeKey = k => {
    if (!k) return '';
    const i = keyIndex(String(k).trim());
    return i === undefined ? '' : keyAt(i, isMinor(String(k).trim()));
  };
  const spelling = key =>
    FLAT_KEYS.includes(key) ? FLATS : SHARP_KEYS.includes(key) ? SHARPS : MIXED;

  const CHORD_RE  = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;
  const SUFFIX_RE = /^(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø)?(?:\d|maj|sus|add|dim|aug|no|b|#|\(|\)|\+|-|,)*$/;

  function transposeToken(tok, semis, names) {
    const m = tok.match(CHORD_RE);
    if (!m || !SUFFIX_RE.test(m[3])) return tok; // not a chord (e.g. "x2", "Bridge")
    const shift = (root, acc) => names[(NOTE_INDEX[root + acc] + semis + 120) % 12];
    let out = shift(m[1], m[2]) + m[3];
    if (m[4]) out += '/' + shift(m[4], m[5]);
    return out;
  }

  function transposeText(text, semis, targetKey) {
    if (!text || semis % 12 === 0 && !targetKey) return text;
    const names = spelling(targetKey);
    return text.replace(/[^\s|]+/g, tok => transposeToken(tok, semis, names));
  }

  const semisBetween = (from, to) =>
    ((keyIndex(to) - keyIndex(from)) % 12 + 12) % 12;

  const isChord = tok => { const m = tok.match(CHORD_RE); return !!m && SUFFIX_RE.test(m[3]); };

  /* ---------------- Chord suggestions (common worship progressions) ---------------- */
  const PROGRESSIONS = {
    major: {
      intro:   ['I V vi IV', 'I IV I V', 'IV I V vi', 'I I/3 IV V', 'vi IV I V'],
      verse:   ['I V vi IV', 'I IV vi V', 'vi IV I V', 'I V/7 vi IV', 'I iii IV V'],
      pre:     ['IV V vi V', 'ii IV V V', 'IV vi V V', 'vi V IV IV', 'IV I/3 ii V'],
      chorus:  ['IV I V vi', 'I V vi IV', 'IV V vi I', 'vi IV I V', 'I V IV IV'],
      bridge:  ['IV V vi I/3', 'vi V IV IV', 'IV I/3 V vi', 'ii I/3 IV V', 'IV vi V I'],
      outro:   ['IV V I I', 'IV I IV I', 'vi IV I I', 'IV V vi IV I'],
      inst:    ['I V vi IV', 'IV I V V', 'vi IV I V', 'I IV vi V'],
    },
    minor: {
      intro:   ['i VI III VII', 'i VII VI VII', 'VI VII i i'],
      verse:   ['i VI III VII', 'i iv VI v', 'i VII VI VII', 'i VI iv VII'],
      pre:     ['iv VI VII VII', 'VI VII i i', 'iv v VI VII'],
      chorus:  ['VI VII i i', 'i VI III VII', 'VI III VII i', 'VI VII III i'],
      bridge:  ['iv i VI VII', 'VI VII III i', 'iv VI III VII'],
      outro:   ['VI VII i i', 'iv VII i i'],
      inst:    ['i VI III VII', 'VI VII i i'],
    },
  };

  function sectionType(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('pre')) return 'pre';
    if (n.includes('chorus')) return 'chorus';
    if (n.includes('verse')) return 'verse';
    if (n.includes('bridge')) return 'bridge';
    if (n.includes('intro')) return 'intro';
    if (/outro|ending|tag|end/.test(n)) return 'outro';
    return 'inst';
  }

  const ROMAN_RE = /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)(?:\/(b|#)?(\d))?$/;
  const MAJOR_SCALE = [0,2,4,5,7,9,11];
  // majorScale=true: numerals are measured from the major scale of the tonic (used for your saved progressions)
  function romanToChord(rn, key, majorScale) {
    const m = rn.match(ROMAN_RE);
    if (!m) return rn;
    const scale = !majorScale && isMinor(key) ? [0,2,3,5,7,8,10] : MAJOR_SCALE;
    const names = spelling(key);
    const k = keyIndex(key);
    const deg = ['I','II','III','IV','V','VI','VII'].indexOf(m[2].toUpperCase());
    const semi = scale[deg] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    const lower = m[2] === m[2].toLowerCase();
    let chord = names[(k + semi + 12) % 12] + (lower ? 'm' : '') + m[3];
    if (m[5]) chord += '/' + names[(k + scale[(+m[5] - 1) % 7] + (m[4] === 'b' ? -1 : m[4] === '#' ? 1 : 0) + 12) % 12];
    return chord;
  }

  /* Your own chords → key-independent numerals (so they work in any key) */
  const NUMERALS = ['I','II','III','IV','V','VI','VII'];
  function degreeOf(semi) {
    let d = MAJOR_SCALE.indexOf(semi);
    if (d >= 0) return ['', d];
    d = MAJOR_SCALE.indexOf((semi + 1) % 12);
    return ['b', d];
  }
  function chordToRoman(tok, key) {
    const m = tok.match(CHORD_RE);
    if (!m || !SUFFIX_RE.test(m[3])) return tok;
    const k = keyIndex(key);
    const [acc, d] = degreeOf((NOTE_INDEX[m[1] + m[2]] - k + 12) % 12);
    let suffix = m[3];
    const minor = /^m(?!aj)/.test(suffix);
    if (minor) suffix = suffix.slice(1);
    let rn = acc + (minor ? NUMERALS[d].toLowerCase() : NUMERALS[d]) + suffix;
    if (m[4]) {
      const [bAcc, bd] = degreeOf((NOTE_INDEX[m[4] + m[5]] - k + 12) % 12);
      rn += '/' + bAcc + (bd + 1);
    }
    return rn;
  }
  const chordsToPattern = (text, key) => text.split('\n')
    .map(line => line.trim().split(/\s+/).filter(Boolean).map(t => chordToRoman(t, key)).join(' '))
    .filter(Boolean).join('\n');
  const patternToChords = (pattern, key) => pattern.split('\n')
    .map(line => formatChords(line.split(/\s+/).filter(Boolean).map(t => ROMAN_RE.test(t) ? romanToChord(t, key, true) : t)))
    .join('\n');
  const patternLabel = p => p.split('\n').map(l => l.split(/\s+/).join(' – ')).join(' / ');

  const formatChords = list => list.map(c => c.padEnd(7)).join('').trimEnd();

  function suggestionsFor(name, key) {
    const set = PROGRESSIONS[isMinor(key) ? 'minor' : 'major'][sectionType(name)];
    return set.map(roman => ({ roman: roman.split(' ').join(' – '), chords: formatChords(roman.split(' ').map(r => romanToChord(r, key))) }));
  }

  /* ---------------- State ---------------- */
  const DEFAULT_SECTIONS = () => [
    sec('Intro'), sec('Verse'), sec('Pre-Chorus'), sec('Chorus'), sec('Bridge'),
    { type: 'keychange', key: '' },
    sec('Verse'), sec('Pre-Chorus'), sec('Chorus'), sec('Bridge'), sec('Intro'),
  ];
  function sec(name, chords = '') { return { type: 'section', name, chords }; }

  let song = blankSong();
  let songs = (window.CHORDBOOK && window.CHORDBOOK.songs) || [];
  const library = (window.CHORDBOOK && window.CHORDBOOK.library) || [];
  let dirty = false;
  let originalManual = false;
  let openSuggest = -1;
  let myProgs = (window.CHORDBOOK && window.CHORDBOOK.progressions) || [];

  function blankSong() {
    return { id: null, title: '', artist: '', original_key: '', song_key: '', sections: DEFAULT_SECTIONS(), timing: blankTiming() };
  }
  function blankTiming() {
    return { bpm: null, beats: 4, marks: [], count: 0, audioName: '' };
  }

  /* ---------------- DOM ---------------- */
  const $ = id => document.getElementById(id);
  const els = {
    title: $('title'), artist: $('artist'),
    originalKey: $('originalKey'), songKey: $('songKey'),
    originalHint: $('originalHint'), keyDiff: $('keyDiff'),
    keyUp: $('keyUp'), keyDown: $('keyDown'), resetKey: $('resetKeyBtn'),
    transpose: $('transposeToggle'),
    sections: $('sections'),
    addSection: $('addSectionBtn'), addKeyChange: $('addKeyChangeBtn'),
    save: $('saveBtn'), del: $('deleteBtn'), status: $('saveStatus'),
    list: $('songList'), search: $('songSearch'), count: $('songCount'),
    newSong: $('newSongBtn'), libraryList: $('libraryList'), toast: $('toast'),
  };
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrf = csrfMeta ? csrfMeta.content : '';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function keyOptions(selected, emptyLabel) {
    let h = `<option value="">${emptyLabel}</option><optgroup label="Major">`;
    MAJOR.forEach(k => h += `<option${k === selected ? ' selected' : ''}>${k}</option>`);
    h += '</optgroup><optgroup label="Minor">';
    MINOR.forEach(k => h += `<option${k === selected ? ' selected' : ''}>${k}</option>`);
    return h + '</optgroup>';
  }

  /* ---------------- Rendering ---------------- */
  function renderHead() {
    els.title.value = song.title;
    els.artist.value = song.artist;
    els.originalKey.innerHTML = keyOptions(song.original_key, '— Unknown —');
    els.songKey.innerHTML = keyOptions(song.song_key, '— Select key —');
    els.del.hidden = !song.id;
    renderKeyInfo();
  }

  function renderKeyInfo() {
    const o = song.original_key, k = song.song_key;
    if (o && k) {
      const up = semisBetween(o, k);
      if (up === 0) {
        els.keyDiff.textContent = 'Same as original key';
      } else {
        const down = 12 - up;
        const label = up <= 6 ? `+${up} half step${up > 1 ? 's' : ''}` : `−${down} half step${down > 1 ? 's' : ''}`;
        els.keyDiff.innerHTML = `${label} from original` +
          (up <= 7 ? ` · or <b>Capo ${up}</b> with ${esc(o)} shapes` : '');
      }
    } else {
      els.keyDiff.textContent = k ? '' : 'Pick the key you will play in';
    }
  }

  /* Key in effect at each position (changes after every Key Change block) */
  function runningKeys() {
    let cur = song.song_key || song.original_key || '';
    return song.sections.map(s => {
      const before = cur;
      if (s.type === 'keychange' && s.key) cur = s.key;
      return { before, after: cur };
    });
  }

  function renderSections() {
    const keys = runningKeys();
    els.sections.innerHTML = song.sections.map((s, i) => {
      const tools = `
        <div class="tools">
          <button type="button" data-act="up" title="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" data-act="down" title="Move down"${i === song.sections.length - 1 ? ' disabled' : ''}>↓</button>
          ${s.type === 'section' ? '<button type="button" data-act="suggest" title="Suggest chords" class="bulb">💡</button><button type="button" data-act="dup" title="Duplicate">⧉</button>' : ''}
          <button type="button" data-act="del" title="Remove" class="del">✕</button>
        </div>`;

      if (s.type === 'keychange') {
        const prev = keys[i].before;
        let diff = '';
        if (prev && s.key) {
          const up = semisBetween(prev, s.key);
          diff = up === 0 ? 'Same key' : `+${up} half step${up > 1 ? 's' : ''} (${prev} → ${s.key})`;
        }
        return `
          <div class="keychange" data-i="${i}">
            <span class="kc-label">⬆ KEY CHANGE</span>
            <select class="key-select kc-key" data-field="key">${keyOptions(s.key, '— New key —')}</select>
            <span class="kc-diff">${esc(diff)}</span>
            <button type="button" class="btn-ghost small" data-act="copy" title="Fill empty sections after this with the same chords from before, transposed to the new key">Copy chords from before ↓</button>
            ${tools}
          </div>`;
      }

      const k = keys[i].after;
      return `
        <div class="section" data-i="${i}">
          <div class="sec-head">
            <span class="note">♪</span>
            <input class="sec-name" data-field="name" list="sectionNames" value="${esc(s.name)}" maxlength="40">
            ${k ? `<span class="sec-key">Key of ${esc(k)}</span>` : ''}
            ${tools}
          </div>
          <textarea class="sec-chords" data-field="chords" rows="2" spellcheck="false"
            placeholder="e.g.  G   D/F#   Em   C">${esc(s.chords)}</textarea>
          ${i === openSuggest ? suggestPanel(s, k) : ''}
        </div>`;
    }).join('');

    els.sections.querySelectorAll('textarea').forEach(autosize);
  }

  function suggestPanel(s, key) {
    if (!key) return `<div class="suggest"><span class="hint">Set the song key first to get chord suggestions.</span></div>`;
    const opts = suggestionsFor(s.name, key);
    const type = sectionType(s.name);
    const mine = myProgs.filter(p => p.section_type === type);
    const typeLabel = { intro:'Intro', verse:'Verse', pre:'Pre-Chorus', chorus:'Chorus', bridge:'Bridge', outro:'Outro / Ending', inst:'Instrumental' }[type];
    return `<div class="suggest">
      <div class="suggest-head">⭐ <b>My ${esc(typeLabel)} progressions</b> — shown in ${esc(key)}
        <button type="button" class="btn-ghost small save-prog" data-act="saveprog"${s.chords.trim() ? '' : ' disabled title="Type some chords in this section first"'}>⭐ Save this section's chords to 💡</button>
      </div>
      ${mine.length ? `<div class="suggest-list">${mine.map(p => `
        <div class="suggest-opt mine" data-act="pickmine" data-id="${p.id}" role="button" tabindex="0">
          <span class="sg-chords">${esc(patternToChords(p.pattern, key))}</span><span class="sg-roman">${esc(patternLabel(p.pattern))}</span>
          <button type="button" class="sg-del" data-act="delprog" data-id="${p.id}" title="Remove from 💡">✕</button>
        </div>`).join('')}</div>`
        : `<div class="hint">None yet. Type your own ${esc(typeLabel.toLowerCase())} chords above, then press “⭐ Save” — it will work in any key.</div>`}
      <div class="suggest-head" style="margin-top:14px">💡 Common progressions for <b>${esc(s.name)}</b> — click one, then edit it however you like</div>
      <div class="suggest-list">${opts.map((o, n) => `
        <button type="button" class="suggest-opt" data-act="pick" data-p="${n}">
          <span class="sg-chords">${esc(o.chords)}</span><span class="sg-roman">${esc(o.roman)}</span>
        </button>`).join('')}
      </div></div>`;
  }

  function autosize(t) {
    t.style.height = 'auto';
    t.style.height = Math.max(54, t.scrollHeight + 2) + 'px';
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const shown = songs.filter(s =>
      !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q));
    els.count.textContent = songs.length ? `(${songs.length})` : '';
    els.list.innerHTML = shown.length
      ? shown.map(s => `
          <li data-id="${s.id}" class="${+s.id === +song.id ? 'active' : ''}">
            <div class="li-title">${esc(s.title)}</div>
            <div class="li-meta">${esc(s.artist || '—')}${s.song_key ? `<span class="badge">${esc(s.song_key)}</span>` : ''}</div>
          </li>`).join('')
      : `<li class="empty">${songs.length ? 'No match.' : 'No songs yet. Start writing!'}</li>`;
  }

  function renderLibraryList() {
    const seen = new Set();
    const opts = [];
    songs.concat(library).forEach(s => {
      const t = s.title.trim();
      if (!t || seen.has(t.toLowerCase())) return;
      seen.add(t.toLowerCase());
      const meta = [s.artist, s.original_key && 'Key: ' + normalizeKey(s.original_key)].filter(Boolean).join(' · ');
      opts.push(`<option value="${esc(t)}">${esc(meta)}</option>`);
    });
    els.libraryList.innerHTML = opts.join('');
  }

  function renderAll() { renderHead(); renderSections(); renderList(); }

  /* ---------------- Dirty / status ---------------- */
  function markDirty() {
    dirty = true;
    els.status.textContent = song.id ? 'Unsaved changes' : 'New song — not saved yet';
    els.status.classList.add('unsaved');
  }
  function markClean(msg) {
    dirty = false;
    els.status.textContent = msg;
    els.status.classList.remove('unsaved');
  }

  function toast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => els.toast.className = 'toast', 2600);
  }

  /* ---------------- Original key lookup ---------------- */
  const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const normFull = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function findOriginalKey(title) {
    const n = norm(title), nf = normFull(title);
    if (!n) return null;
    const match = s => (norm(s.title) === n || normFull(s.title) === nf);
    const mine = songs.find(s => s.original_key && +s.id !== +song.id && match(s));
    if (mine) return { key: normalizeKey(mine.original_key), artist: mine.artist, source: 'your songs' };
    const lib = library.find(match);
    if (lib) return { key: normalizeKey(lib.original_key), artist: lib.artist, source: 'library' };
    return null;
  }

  function lookupOriginal() {
    const found = findOriginalKey(song.title);
    if (found && found.key) {
      if (!originalManual) {
        song.original_key = found.key;
        els.originalKey.value = found.key;
        if (!song.song_key) {
          song.song_key = found.key;
          els.songKey.value = found.key;
          renderSections();
        }
      }
      if (!song.artist && found.artist) { song.artist = found.artist; els.artist.value = found.artist; }
      els.originalHint.textContent = `✓ Found in ${found.source}${found.artist ? ' · ' + found.artist : ''}`;
      els.originalHint.className = 'hint ok';
    } else {
      if (!originalManual && song.original_key) {   // title changed to a song we don't know
        song.original_key = '';
        els.originalKey.value = '';
      }
      els.originalHint.textContent = song.title.trim() && !song.original_key
        ? 'Not in library yet — pick it manually (it will be remembered)'
        : '';
      els.originalHint.className = 'hint';
    }
    renderKeyInfo();
  }

  /* ---------------- Change key (with transposition) ---------------- */
  function changeKey(newKey) {
    const oldKey = song.song_key;
    if (newKey === oldKey) return;

    if (els.transpose.checked && oldKey && newKey) {
      const d = semisBetween(oldKey, newKey);
      // shift key change blocks
      song.sections.forEach(s => {
        if (s.type === 'keychange' && s.key) s.key = keyAt(keyIndex(s.key) + d, isMinor(s.key));
      });
      song.song_key = newKey;
      const keys = runningKeys();
      song.sections.forEach((s, i) => {
        if (s.type === 'section') s.chords = transposeText(s.chords, d, keys[i].after);
      });
    } else {
      song.song_key = newKey;
    }
    els.songKey.value = newKey;
    renderKeyInfo();
    renderSections();
    markDirty();
  }

  function stepKey(dir) {
    const cur = song.song_key || song.original_key;
    if (!cur) { toast('Pick a key first.', true); return; }
    if (!song.song_key) song.song_key = cur;
    changeKey(keyAt(keyIndex(cur) + dir, isMinor(cur)));
  }

  /* ---------------- Section events ---------------- */
  els.sections.addEventListener('input', e => {
    const box = e.target.closest('[data-i]');
    const field = e.target.dataset.field;
    if (!box || !field) return;
    const s = song.sections[+box.dataset.i];
    if (field === 'key') return; // handled on change
    s[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autosize(e.target);
    markDirty();
  });

  els.sections.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.suggest-opt.mine')) { e.preventDefault(); e.target.click(); }
  });

  els.sections.addEventListener('change', e => {
    if (e.target.dataset.field !== 'key') return;
    const i = +e.target.closest('[data-i]').dataset.i;
    song.sections[i].key = e.target.value;
    renderSections();
    markDirty();
  });

  els.sections.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const i = +btn.closest('[data-i]').dataset.i;
    const list = song.sections;

    if (!['suggest', 'pick', 'pickmine', 'saveprog', 'delprog'].includes(btn.dataset.act)) openSuggest = -1;
    switch (btn.dataset.act) {
      case 'up':   if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
      case 'down': if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
      case 'dup':  list.splice(i + 1, 0, { ...list[i] }); break;
      case 'del':
        if (list[i].type === 'section' && list[i].chords.trim() && !confirm(`Remove "${list[i].name}"?`)) return;
        list.splice(i, 1);
        break;
      case 'copy': copyChordsAfter(i); break;
      case 'suggest': openSuggest = openSuggest === i ? -1 : i; break;
      case 'saveprog': saveProgression(i); return;
      case 'delprog': deleteProgression(+btn.dataset.id); return;
      case 'pickmine': {
        const p = myProgs.find(x => +x.id === +btn.dataset.id);
        if (!p) return;
        if (list[i].chords.trim() && !confirm(`Replace the chords in "${list[i].name}"?`)) return;
        list[i].chords = patternToChords(p.pattern, runningKeys()[i].after);
        openSuggest = -1;
        break;
      }
      case 'pick': {
        const key = runningKeys()[i].after;
        const opt = suggestionsFor(list[i].name, key)[+btn.dataset.p];
        if (list[i].chords.trim() && !confirm(`Replace the chords in "${list[i].name}"?`)) return;
        list[i].chords = opt.chords;
        openSuggest = -1;
        break;
      }
    }
    renderSections();
    markDirty();
  });

  /* Fill empty sections after a key change with the matching sections from before, transposed */
  function copyChordsAfter(k) {
    const kc = song.sections[k];
    const prevKey = runningKeys()[k].before;
    if (!kc.key || !prevKey) { toast('Set both the song key and the new key first.', true); return; }
    const semis = semisBetween(prevKey, kc.key);
    const base = n => n.toLowerCase().replace(/\d+/g, '').trim();
    let filled = 0;

    for (let j = k + 1; j < song.sections.length; j++) {
      const s = song.sections[j];
      if (s.type === 'keychange') break;
      if (s.chords.trim()) continue;
      for (let b = k - 1; b >= 0; b--) {
        const src = song.sections[b];
        if (src.type === 'section' && src.chords.trim() && base(src.name) === base(s.name)) {
          s.chords = transposeText(src.chords, semis, kc.key);
          filled++;
          break;
        }
      }
    }
    toast(filled ? `Copied ${filled} section${filled > 1 ? 's' : ''} in ${kc.key}` : 'Nothing to copy (sections after are already filled or have no match).', !filled);
  }

  document.getElementById('suggestAllBtn').addEventListener('click', () => {
    const keys = runningKeys();
    if (!song.song_key && !song.original_key) { toast('Set the song key first.', true); return; }
    let filled = 0;
    song.sections.forEach((s, i) => {
      if (s.type !== 'section' || s.chords.trim() || !keys[i].after) return;
      s.chords = suggestionsFor(s.name, keys[i].after)[0].chords; // same section name → same progression
      filled++;
    });
    openSuggest = -1;
    renderSections();
    if (filled) markDirty();
    toast(filled ? `💡 Filled ${filled} empty section${filled > 1 ? 's' : ''} — edit them to match your song` : 'No empty sections to fill.', !filled);
  });

  async function saveProgression(i) {
    const s = song.sections[i];
    const key = runningKeys()[i].after;
    if (!key) { toast('Set the song key first.', true); return; }
    const pattern = chordsToPattern(s.chords, key);
    if (!pattern) { toast('Type some chords first.', true); return; }
    const type = sectionType(s.name);
    if (myProgs.some(p => p.section_type === type && p.pattern === pattern)) { toast('That progression is already in your 💡 list.'); return; }
    try {
      const data = await api('prog_save', { method: 'POST', body: { section_type: type, pattern } });
      myProgs.push({ id: data.id, section_type: type, pattern });
      renderSections();
      toast('⭐ Saved to your 💡 suggestions');
    } catch (e) { toast(e.message, true); }
  }

  async function deleteProgression(id) {
    if (!confirm('Remove this progression from your 💡 suggestions?')) return;
    try {
      await api('prog_delete', { method: 'POST', body: { id } });
      myProgs = myProgs.filter(p => +p.id !== id);
      renderSections();
    } catch (e) { toast(e.message, true); }
  }

  els.addSection.addEventListener('click', () => {
    song.sections.push(sec('Verse'));
    renderSections();
    markDirty();
    const last = els.sections.querySelector('.section:last-child .sec-name');
    if (last) { last.focus(); last.select(); }
  });

  els.addKeyChange.addEventListener('click', () => {
    const keys = runningKeys();
    const cur = keys.length ? keys[keys.length - 1].after : (song.song_key || song.original_key);
    song.sections.push({ type: 'keychange', key: cur ? keyAt(keyIndex(cur) + 1, isMinor(cur)) : '' });
    renderSections();
    markDirty();
  });

  /* ---------------- Head events ---------------- */
  let lookupTimer;
  els.title.addEventListener('input', () => {
    song.title = els.title.value;
    markDirty();
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookupOriginal, 250);
  });
  els.title.addEventListener('change', lookupOriginal);
  els.artist.addEventListener('input', () => { song.artist = els.artist.value; markDirty(); });

  els.originalKey.addEventListener('change', () => {
    song.original_key = els.originalKey.value;
    originalManual = true;
    els.originalHint.textContent = '';
    if (!song.song_key && song.original_key) {
      song.song_key = song.original_key;
      els.songKey.value = song.song_key;
      renderSections();
    }
    renderKeyInfo();
    markDirty();
  });

  els.songKey.addEventListener('change', () => {
    const newKey = els.songKey.value;
    if (!song.song_key) { song.song_key = newKey; renderKeyInfo(); renderSections(); markDirty(); return; }
    changeKey(newKey);
  });
  els.keyUp.addEventListener('click', () => stepKey(1));
  els.keyDown.addEventListener('click', () => stepKey(-1));
  els.resetKey.addEventListener('click', () => {
    if (!song.original_key) { toast('Set the original key first.', true); return; }
    if (!song.song_key) { song.song_key = song.original_key; renderHead(); renderSections(); return; }
    changeKey(song.original_key);
  });

  /* ---------------- API ---------------- */
  async function api(action, { method = 'GET', body, id } = {}) {
    // Offline phone app: data lives on the device (js/local-store.js)
    if (window.CHORDBOOK_LOCAL) return window.CHORDBOOK_LOCAL(action, { method, body, id });
    const url = `song_api.php?action=${action}${id ? '&id=' + id : ''}`;
    const res = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data;
    try { data = await res.json(); } catch { throw new Error('Server error. Check song_api.php.'); }
    if (res.status === 401) { location.href = 'login.php'; throw new Error(data.error); }
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function refreshList() {
    try {
      songs = (await api('list')).songs; renderList(); renderLibraryList();
      document.dispatchEvent(new CustomEvent('chordbook:songs'));
    } catch (e) { /* ignore */ }
  }

  async function saveSong() {
    if (!song.title.trim()) { toast('Please enter a song title.', true); els.title.focus(); return; }
    els.save.disabled = true;
    try {
      const data = await api('save', { method: 'POST', body: song });
      song.id = data.id;
      els.del.hidden = false;
      markClean('Saved at ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      toast('🎵 Song saved!');
      await refreshList();
    } catch (e) {
      toast(e.message, true);
    } finally {
      els.save.disabled = false;
    }
  }

  async function loadSong(id) {
    if (+id === +song.id && song.id) return true;
    if (dirty && !confirm('You have unsaved changes. Open another song anyway?')) return false;
    try {
      const { song: s } = await api('get', { id });
      song = {
        id: s.id, title: s.title, artist: s.artist,
        original_key: s.original_key, song_key: s.song_key,
        sections: Array.isArray(s.sections) ? s.sections : [],
        timing: Object.assign(blankTiming(), s.timing || {}),
      };
      openSuggest = -1;
      originalManual = !!s.original_key;
      els.originalHint.textContent = '';
      renderAll();
      markClean('Saved');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    }
  }

  async function deleteSong() {
    if (!song.id || !confirm(`Delete "${song.title}"? This cannot be undone.`)) return;
    try {
      await api('delete', { method: 'POST', body: { id: song.id } });
      toast('Song deleted.');
      dirty = false;
      newSong(true);
      await refreshList();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function newSong(force) {
    if (!force && dirty && !confirm('You have unsaved changes. Start a new song anyway?')) return;
    song = blankSong();
    originalManual = false;
    openSuggest = -1;
    els.originalHint.textContent = '';
    renderAll();
    markClean('New song — not saved yet');
    els.title.focus();
  }

  /* ---------------- Export / Import (move songs between PC and phone) ---------------- */
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');

  if (exportBtn) exportBtn.addEventListener('click', async () => {
    try {
      const data = await api('export');
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chordbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`⬇ Exported ${data.songs.length} song${data.songs.length === 1 ? '' : 's'}`);
    } catch (e) { toast(e.message, true); }
  });

  if (importFile) importFile.addEventListener('change', async () => {
    const f = importFile.files[0];
    importFile.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('That file is not a ChordBook backup (.json).', true); return; }
    if (!data || !Array.isArray(data.songs)) { toast('That file is not a ChordBook backup (.json).', true); return; }
    if (dirty && !confirm('You have unsaved changes in the editor. Import anyway?')) return;

    try {
      const existing = (await api('list')).songs;
      const keyOf = s => (s.title || '').trim().toLowerCase() + '|' + (s.artist || '').trim().toLowerCase();
      const byKey = new Map(existing.map(s => [keyOf(s), s.id]));
      const dupes = data.songs.filter(s => byKey.has(keyOf(s))).length;
      const replace = dupes ? confirm(`${dupes} song(s) in the backup already exist here.\n\nOK = replace them with the backup\nCancel = keep yours and skip them`) : false;

      let added = 0, replaced = 0, skipped = 0;
      for (const s of data.songs) {
        const exists = byKey.get(keyOf(s));
        if (exists && !replace) { skipped++; continue; }
        await api('save', { method: 'POST', body: {
          id: exists || null, title: s.title, artist: s.artist || '',
          original_key: s.original_key || '', song_key: s.song_key || '',
          sections: s.sections || [], timing: s.timing || blankTiming(),
        } });
        exists ? replaced++ : added++;
      }
      let progs = 0;
      for (const p of (data.progressions || [])) {
        if (myProgs.some(m => m.section_type === p.section_type && m.pattern === p.pattern)) continue;
        try {
          const r = await api('prog_save', { method: 'POST', body: { section_type: p.section_type, pattern: p.pattern } });
          myProgs.push({ id: r.id, section_type: p.section_type, pattern: p.pattern });
          progs++;
        } catch (e) { /* skip invalid */ }
      }
      await refreshList();
      let sets = 0;
      if (Array.isArray(data.setlists) && data.setlists.length) {
        try {
          const have = (await api('setlists')).setlists.map(x => x.name.trim().toLowerCase());
          const idByKey = new Map(songs.map(x => [keyOf(x), x.id]));
          for (const sl of data.setlists) {
            if (!sl.name || have.includes(sl.name.trim().toLowerCase())) continue;
            const ids = (sl.songs || []).map(x => idByKey.get(keyOf(x))).filter(Boolean).slice(0, 10);
            await api('setlist_save', { method: 'POST', body: { name: sl.name, song_ids: ids } });
            sets++;
          }
          document.dispatchEvent(new CustomEvent('chordbook:setlists'));
        } catch (e) { /* setlists table missing */ }
      }
      renderSections();
      toast(`⬆ Imported: ${added} new, ${replaced} replaced, ${skipped} skipped${progs ? `, ${progs} 💡 progression(s)` : ''}${sets ? `, ${sets} setlist(s)` : ''}`);
    } catch (e) { toast(e.message, true); }
  });

  els.save.addEventListener('click', saveSong);
  els.del.addEventListener('click', deleteSong);
  els.newSong.addEventListener('click', () => newSong(false));
  els.search.addEventListener('input', renderList);
  els.list.addEventListener('click', e => {
    const li = e.target.closest('li[data-id]');
    if (li) loadSong(li.dataset.id);
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveSong(); }
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- Start ---------------- */
  renderAll();
  renderLibraryList();
  markClean('New song — not saved yet');

  // shared with js/player.js
  window.ChordBook = {
    getSong: () => song,
    getSongs: () => songs,
    isDirty: () => dirty,
    api, loadSong, refreshList, saveSong, isChord, keyIndex, normalizeKey,
    markDirty,
    toast,
    runningKeys,
    /* Put imported chords into the editor (they stay editable) */
    applyImport({ title, artist, key, sections }, { asNew } = {}) {
      if (asNew) { song = blankSong(); originalManual = false; }
      if (title && (!song.title.trim() || asNew)) song.title = title;
      if (artist && !song.artist.trim()) song.artist = artist;
      if (key) song.song_key = key;
      song.sections = sections;
      openSuggest = -1;
      renderAll();
      els.originalHint.textContent = '';
      if (!song.original_key) lookupOriginal();
      markDirty();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    chordTokens() {
      const out = [];
      song.sections.forEach((s, i) => {
        if (s.type !== 'section') return;
        (s.chords || '').split(/\s+/).forEach(tok => { if (tok && isChord(tok)) out.push({ chord: tok, sec: i }); });
      });
      return out;
    },
  };
  window.ChordBookTranspose = transposeText;
  window.ChordBookSuggest = suggestionsFor;
  window.ChordBookPattern = { chordsToPattern, patternToChords };
})();
