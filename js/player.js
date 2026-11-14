/* =========================================================
   player.js — ChordBook Play / Sync mode (works offline)
   - Sync to a song file on your computer: tap Space at every chord change
   - Metronome mode: BPM + beats per chord
   ========================================================= */
(function () {
  'use strict';
  const CB = window.ChordBook;
  if (!CB) return;

  const $ = id => document.getElementById(id);
  const el = {
    open: $('playBtn'), overlay: $('player'), close: $('plClose'),
    title: $('plTitle'), sub: $('plSub'), warn: $('plWarn'),
    tabs: document.querySelectorAll('#player .tab'),
    panels: document.querySelectorAll('#player .pl-panel'),
    file: $('plFile'), fileName: $('plFileName'), audio: $('plAudio'),
    rec: $('plRec'), undo: $('plUndo'), clear: $('plClear'), recStatus: $('plRecStatus'),
    bpm: $('plBpm'), tapTempo: $('plTapTempo'), beats: $('plBeats'), click: $('plClick'), metro: $('plMetroStart'),
    now: $('plNow'), next: $('plNext'), beatDots: $('plBeat'), nowLabel: $('plNowLabel'),
    tap: $('plTap'), sheet: $('plSheet'),
    setBar: $('plSetlist'), setName: $('plSetName'), setPrev: $('plSetPrev'), setNext: $('plSetNext'),
  };
  let lastSongId = null;

  let song, timing, tokens = [];
  let mode = 'audio';
  let current = -1, selected = 0;
  let recording = false, recIdx = 0;
  let raf = 0;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmt = t => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };

  /* ---------------- Open / close ---------------- */
  function open() {
    const SL = window.ChordBookSetlist;
    stopRec();
    stopMetro();
    song = CB.getSong();
    timing = song.timing;
    tokens = CB.chordTokens();
    if (!tokens.length && !(SL && SL.active)) { CB.toast('Add some chords first.', true); return; }

    // a different song → forget the previous song's audio file
    if (song.id !== lastSongId || !song.id) {
      el.audio.pause();
      if (el.audio.src) { URL.revokeObjectURL(el.audio.src); el.audio.removeAttribute('src'); el.audio.load(); }
      currentFileName = '';
    }
    lastSongId = song.id;
    renderSetlistBar();

    el.title.textContent = song.title || 'Untitled song';
    el.sub.textContent = [song.artist, song.song_key && 'Key of ' + song.song_key].filter(Boolean).join(' · ');
    el.bpm.value = timing.bpm || '';
    el.beats.value = String(timing.beats || 4);
    el.fileName.textContent = el.audio.src
      ? currentFileName
      : (timing.audioName ? `Last used: ${timing.audioName} — load it again` : 'No file loaded');

    const changed = timing.marks.length && timing.count && timing.count !== tokens.length;
    el.warn.hidden = !changed;

    current = -1; selected = 0;
    buildSheet();
    setCurrent(-1, true);
    updateRecStatus();
    setMode(timing.marks.length || !timing.bpm ? 'audio' : 'metro');
    el.overlay.hidden = false;
    document.body.classList.add('no-scroll');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function renderSetlistBar() {
    const SL = window.ChordBookSetlist;
    const a = SL && SL.active;
    el.setBar.hidden = !a;
    if (!a) return;
    el.setName.innerHTML = `📋 <b>${esc(a.name)}</b> · Song ${a.idx + 1} of ${a.ids.length}`;
    el.setPrev.disabled = a.idx === 0;
    const nt = SL.nextTitle();
    el.setNext.disabled = !nt;
    el.setNext.textContent = nt ? `Next: ${nt} ▶` : 'Last song';
  }
  el.setPrev.addEventListener('click', () => window.ChordBookSetlist.go(-1));
  el.setNext.addEventListener('click', () => window.ChordBookSetlist.go(1));

  function close() {
    if (window.ChordBookSetlist) window.ChordBookSetlist.stop();
    stopRec();
    stopMetro();
    el.audio.pause();
    cancelAnimationFrame(raf);
    el.overlay.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function setMode(m) {
    mode = m;
    el.tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    el.panels.forEach(p => p.hidden = p.dataset.panel !== m);
    if (m === 'audio') stopMetro(); else { stopRec(); el.audio.pause(); }
    el.beatDots.innerHTML = '';
  }

  /* ---------------- Sheet ---------------- */
  function buildSheet() {
    const keys = CB.runningKeys();
    let k = 0, html = '';
    song.sections.forEach((s, i) => {
      if (s.type === 'keychange') {
        html += `<div class="pl-kc">⬆ KEY CHANGE${s.key ? ' → ' + esc(s.key) : ''}</div>`;
        return;
      }
      const chips = [];
      while (k < tokens.length && tokens[k].sec === i) {
        const t = timing.marks[k];
        chips.push(`<button type="button" class="chip" data-k="${k}">${esc(tokens[k].chord)}${t != null ? `<small>${fmt(t)}</small>` : ''}</button>`);
        k++;
      }
      if (!chips.length) return;
      html += `<div class="pl-sec"><div class="pl-sec-name">${esc(s.name)} <span>${esc(keys[i].after || '')}</span></div><div class="chips">${chips.join('')}</div></div>`;
    });
    el.sheet.innerHTML = html || '<div class="hint">No chords in this song yet.</div>';
    markSelected();
  }

  function markSelected() {
    el.sheet.querySelectorAll('.chip.sel').forEach(c => c.classList.remove('sel'));
    const c = el.sheet.querySelector(`.chip[data-k="${selected}"]`);
    if (c) c.classList.add('sel');
  }

  function setCurrent(i, force) {
    if (i === current && !force) return;
    current = i;
    el.sheet.querySelectorAll('.chip').forEach(c => {
      const k = +c.dataset.k;
      c.classList.toggle('now', k === i);
      c.classList.toggle('past', i >= 0 && k < i);
    });
    el.now.textContent = i >= 0 && tokens[i] ? tokens[i].chord : '–';
    el.next.textContent = tokens[i + 1] ? tokens[i + 1].chord : (i >= 0 ? 'End' : (tokens[0] ? tokens[0].chord : '–'));
    el.nowLabel.textContent = 'NOW';
    const chip = el.sheet.querySelector(`.chip[data-k="${i}"]`);
    if (chip) {
      const r = chip.getBoundingClientRect(), box = el.sheet.getBoundingClientRect();
      if (r.top < box.top + 20 || r.bottom > box.bottom - 20) chip.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /* ---------------- Main loop (audio sync + metronome display) ---------------- */
  function tick() {
    if (mode === 'audio' && !recording && timing.marks.length) {
      const t = el.audio.currentTime + 0.03;
      let idx = -1;
      for (let k = 0; k < timing.marks.length && k < tokens.length; k++) {
        if (timing.marks[k] != null && timing.marks[k] <= t) idx = k; else if (timing.marks[k] > t) break;
      }
      setCurrent(idx);
    }
    if (metro.running) metroDisplay();
    raf = requestAnimationFrame(tick);
  }

  /* ---------------- Audio file (local, offline) ---------------- */
  let currentFileName = '';
  el.file.addEventListener('change', () => {
    const f = el.file.files[0];
    if (!f) return;
    if (el.audio.src) URL.revokeObjectURL(el.audio.src);
    el.audio.src = URL.createObjectURL(f);
    currentFileName = f.name;
    el.fileName.textContent = f.name;
    if (timing.audioName !== f.name) { timing.audioName = f.name; CB.markDirty(); }
  });

  /* ---------------- Tap-to-record timing ---------------- */
  function startRec() {
    if (!el.audio.src) { CB.toast('Load the song file first (📂).', true); return; }
    const from = Math.min(selected, timing.marks.length); // can't leave gaps
    if (from === 0 && timing.marks.length && !confirm('Re-record the timing from the first chord?')) return;
    timing.marks.length = from;
    recIdx = from;
    recording = true;
    el.audio.currentTime = from > 0 ? Math.max(0, timing.marks[from - 1]) : 0;
    el.audio.play();
    el.rec.textContent = '■ Stop recording';
    el.rec.classList.add('recording');
    el.tap.hidden = false;
    setCurrent(from - 1, true);
    updateRecStatus();
  }

  function stopRec() {
    if (!recording) return;
    recording = false;
    el.rec.textContent = '● Record timing';
    el.rec.classList.remove('recording');
    el.tap.hidden = true;
    buildSheet();
    updateRecStatus();
  }

  function tap() {
    if (!recording) return;
    timing.marks[recIdx] = Math.round(el.audio.currentTime * 100) / 100;
    timing.count = tokens.length;
    CB.markDirty();
    setCurrent(recIdx, true);
    const chip = el.sheet.querySelector(`.chip[data-k="${recIdx}"]`);
    if (chip) chip.insertAdjacentHTML('beforeend', `<small>${fmt(timing.marks[recIdx])}</small>`);
    recIdx++;
    el.tap.classList.remove('flash'); void el.tap.offsetWidth; el.tap.classList.add('flash');
    updateRecStatus();
    if (recIdx >= tokens.length) {
      stopRec();
      el.warn.hidden = true;
      CB.toast('🎉 All chords timed! Press Save Song to keep it.');
    }
  }

  function undo() {
    if (!timing.marks.length) return;
    timing.marks.pop();
    if (recording) { recIdx = timing.marks.length; setCurrent(recIdx - 1, true); }
    CB.markDirty();
    if (!recording) buildSheet();
    else { const c = el.sheet.querySelector(`.chip[data-k="${recIdx}"] small`); if (c) c.remove(); }
    updateRecStatus();
  }

  function updateRecStatus() {
    const n = Math.min(timing.marks.length, tokens.length);
    el.recStatus.innerHTML = recording
      ? `<b>Recording…</b> press <kbd>Space</kbd> (or TAP) when the song reaches <b>${esc(tokens[recIdx] ? tokens[recIdx].chord : '')}</b> · ${n}/${tokens.length}`
      : n ? `${n}/${tokens.length} chords timed. Press <kbd>Space</kbd> to play. Click a chord to jump; “Record” re-records from the selected chord.`
          : `Load your song file, then press Record and tap <kbd>Space</kbd> every time the chord changes.`;
  }

  el.rec.addEventListener('click', () => recording ? stopRec() : startRec());
  el.tap.addEventListener('click', tap);
  el.undo.addEventListener('click', undo);
  el.clear.addEventListener('click', () => {
    if (!timing.marks.length || !confirm('Clear all recorded timing for this song?')) return;
    timing.marks = []; timing.count = 0;
    CB.markDirty(); stopRec(); buildSheet(); setCurrent(-1, true); updateRecStatus();
  });

  /* ---------------- Metronome ---------------- */
  const metro = { running: false, ctx: null, timer: 0, next: 0, beat: 0, start: 0, queue: [], spb: 0.5, per: 4 };

  function playClick(time, accent) {
    const ctx = metro.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(time); o.stop(time + 0.06);
  }

  function schedule() {
    const ctx = metro.ctx;
    while (metro.next < ctx.currentTime + 0.12) {
      const b = metro.beat;
      if (el.click.checked) playClick(metro.next, b < 0 || b % metro.per === 0);
      metro.queue.push({ time: metro.next, beat: b });
      metro.next += metro.spb;
      metro.beat++;
      if (b >= 0 && metro.start + Math.floor(b / metro.per) >= tokens.length + 1) { stopMetro(); return; }
    }
  }

  function metroDisplay() {
    const now = metro.ctx.currentTime;
    while (metro.queue.length && metro.queue[0].time <= now) {
      const { beat } = metro.queue.shift();
      if (beat < 0) {
        el.nowLabel.textContent = 'COUNT-IN';
        el.now.textContent = String(-beat);
        dots(4 + beat, 4);
        continue;
      }
      const ci = metro.start + Math.floor(beat / metro.per);
      if (ci >= tokens.length) { stopMetro(); setCurrent(tokens.length - 1, true); return; }
      setCurrent(ci, el.nowLabel.textContent !== 'NOW');
      dots(beat % metro.per, metro.per);
    }
  }

  function dots(on, total) {
    el.beatDots.innerHTML = Array.from({ length: total }, (_, n) => `<i class="${n === on ? 'on' : ''}${n === 0 ? ' one' : ''}"></i>`).join('');
  }

  function startMetro() {
    const bpm = +el.bpm.value;
    if (!(bpm >= 30 && bpm <= 300)) { CB.toast('Enter a BPM between 30 and 300 (or use Tap tempo).', true); el.bpm.focus(); return; }
    metro.ctx = metro.ctx || new (window.AudioContext || window.webkitAudioContext)();
    metro.ctx.resume();
    metro.spb = 60 / bpm;
    metro.per = +el.beats.value || 4;
    metro.start = selected || 0;
    metro.beat = -4;                       // one bar count-in
    metro.next = metro.ctx.currentTime + 0.15;
    metro.queue = [];
    metro.running = true;
    metro.timer = setInterval(schedule, 25);
    schedule();
    el.metro.textContent = '■ Stop';
    el.metro.classList.add('recording');
  }

  function stopMetro() {
    if (!metro.running) return;
    metro.running = false;
    clearInterval(metro.timer);
    metro.queue = [];
    el.metro.textContent = '▶ Start';
    el.metro.classList.remove('recording');
    el.nowLabel.textContent = 'NOW';
  }

  el.metro.addEventListener('click', () => metro.running ? stopMetro() : startMetro());
  el.bpm.addEventListener('change', () => {
    const v = +el.bpm.value;
    timing.bpm = v >= 30 && v <= 300 ? Math.round(v * 10) / 10 : null;
    CB.markDirty();
  });
  el.beats.addEventListener('change', () => { timing.beats = +el.beats.value; CB.markDirty(); });

  let taps = [];
  el.tapTempo.addEventListener('click', () => {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 3) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      el.bpm.value = Math.round(60000 / avg);
      el.bpm.dispatchEvent(new Event('change'));
    }
    el.tapTempo.textContent = taps.length < 3 ? `Tap tempo (${taps.length})` : 'Tap tempo ✓';
  });

  /* ---------------- Chip clicks / keyboard ---------------- */
  el.sheet.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selected = +chip.dataset.k;
    markSelected();
    if (recording) return;
    if (mode === 'audio' && timing.marks[selected] != null) {
      el.audio.currentTime = timing.marks[selected];
      setCurrent(selected, true);
    } else if (mode === 'metro') {
      setCurrent(selected, true);
      if (metro.running) { stopMetro(); startMetro(); }
    } else {
      setCurrent(selected, true);
    }
    updateRecStatus();
  });

  el.tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
  window.ChordBookPlayer = { open, close };
  el.open.addEventListener('click', open);
  el.close.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if (el.overlay.hidden) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'file';
    if (e.key === 'Escape') { close(); return; }
    if (typing) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (recording) tap();
      else if (mode === 'audio') { if (!el.audio.src) return; el.audio.paused ? el.audio.play() : el.audio.pause(); }
      else metro.running ? stopMetro() : startMetro();
    } else if (e.key === 'Backspace' && recording) {
      e.preventDefault(); undo();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      selected = Math.max(0, Math.min(tokens.length - 1, selected + (e.key === 'ArrowRight' ? 1 : -1)));
      markSelected();
      if (!recording && mode === 'audio' && timing.marks[selected] != null) el.audio.currentTime = timing.marks[selected];
      else if (!recording) setCurrent(selected, true);
    }
  });
})();
