'use strict';

const $ = (sel) => document.querySelector(sel);

// Dev only: open index.html?speed=60 in a browser to make every countdown run 60x faster.
const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

const STRETCHES = [
  'Neck rolls: 5 each direction',
  'Shoulder rolls: 10 backwards, 10 forwards',
  'Chest opener: clasp hands behind your back, hold 20 s',
  'Overhead side bend: 15 s each side',
  'Standing forward fold: hang for 20 s',
  'Hip flexor lunge stretch: 20 s each side',
  'Wrist and finger stretches: 15 s each hand',
  'Standing spinal twist: 15 s each side',
  'Calf raises: 15 reps',
  'Eye rest: look at something 20+ feet away for 20 s',
];

const EXITS = [
  'Go for a 10–20 minute walk outside',
  'Meditate for 10 minutes',
  'Do 20 pushups',
  'Take a cold shower',
  'Journal what you got done and what is next',
  'Write tomorrow’s top 3 tasks',
  'Stretch or do light yoga',
  'Drink a full glass of water',
  'Tidy your desk for tomorrow',
  'Box breathing: 4 rounds of 4-4-4-4',
  'Do 30 bodyweight squats',
  'Hold a plank for 60 seconds',
  'Get 10 minutes of sunlight',
  'Cook or prep a simple meal',
  'Read a physical book for 15 minutes',
  'Talk to a friend face to face',
  'Play an instrument',
  'Doodle or sketch for 10 minutes',
  'Do a 10-minute body scan',
  'Non-sleep deep rest (NSDR) for 10–20 minutes',
  'Walk up and down the stairs for 5 minutes',
  'Water plants or do light gardening',
  'Take a power nap (20 minutes max)',
  'Fold laundry or do a light chore',
  'Sit in silence with no input for 5 minutes',
  'Go for a short bike ride',
];

// ---------- settings (saved on this computer) ----------
const DEFAULTS = {
  title: '', preload: 10, work: 25, rest: 5,
  sound: 'off', beat: 15, volume: 30, sink: '',
  ownTrigger: '', exits: EXITS, stretches: STRETCHES,
};
const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
const save = () => localStorage.setItem('settings', JSON.stringify(settings));
const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);

// ---------- timers (all cleared when the phase changes) ----------
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const every = (fn, ms) => timers.push(setInterval(fn, ms));
const stopTimers = () => { timers.forEach(clearTimeout); timers = []; }; // clearTimeout also clears intervals

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Counts down against the clock (not tick counting), so it never drifts. Returns pause/resume controls.
function countdown(seconds, el, onDone) {
  const total = seconds * 1000;
  let left = total; // ms left while paused
  let end = 0;
  let id = null;
  const remaining = () => (id ? Math.max(0, (end - Date.now()) * SPEED) : left);
  function tick() {
    const ms = remaining();
    el.textContent = fmt(Math.ceil(ms / 1000));
    if (ms === 0) { pause(); onDone(); }
  }
  function resume() {
    end = Date.now() + left / SPEED;
    id = setInterval(tick, 200);
    timers.push(id);
    tick();
  }
  function pause() {
    left = remaining();
    clearInterval(id);
    id = null;
  }
  resume();
  return { pause, resume, elapsed: () => total - remaining() };
}

// ---------- notifications and keep-awake ----------
function notify(body) {
  // Only when the app isn't in front; the alarm sound covers the in-app case.
  if (document.hasFocus() || !('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Focus Protocol', { body, silent: true });
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.onrelease = () => { wakeLock = null; };
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch { /* unsupported or refused: the screen may sleep, nothing else breaks */ }
}
// Windows drops the lock when the window is minimised; take it again on return.
document.addEventListener('visibilitychange', () => { if (phase === 'immersion' && !document.hidden) keepAwake(true); });

// ---------- audio (all generated live, no files) ----------
let ctx, master, sources = [];
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    setVolume(settings.volume);
    applySink();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const setVolume = (v) => { if (master) master.gain.value = (v / 100) ** 2 * 0.6; }; // squared = feels linear to the ear

async function applySink() {
  if (!ctx?.setSinkId) return;
  try {
    await ctx.setSinkId(settings.sink);
  } catch { // device unplugged or gone: fall back to the system default
    settings.sink = '';
    save();
    await ctx.setSinkId('').catch(() => {});
  }
}

let brownBuffer;
function brownNoise(c) {
  if (!brownBuffer) {
    const len = c.sampleRate * 10;
    brownBuffer = c.createBuffer(1, len, c.sampleRate);
    const d = brownBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const drift = d[len - 1] - d[0];
    for (let i = 0; i < len; i++) d[i] -= (drift * i) / (len - 1); // end meets start: no click at the loop point
  }
  const src = c.createBufferSource();
  src.buffer = brownBuffer;
  src.loop = true;
  return src;
}

const CARRIER = 200; // Hz, the audible base tone
function startSound(kind, beat) {
  stopSound();
  if (kind === 'off') return;
  const c = audio();
  if (kind === 'binaural') {
    // Left ear hears 200 Hz, right ear 200+beat Hz; the brain perceives the difference as the beat.
    for (const [freq, pan] of [[CARRIER, -1], [CARRIER + beat, 1]]) {
      const osc = c.createOscillator();
      const panner = c.createStereoPanner();
      osc.frequency.value = freq;
      panner.pan.value = pan;
      osc.connect(panner).connect(master);
      osc.start();
      sources.push(osc);
    }
  } else if (kind === 'isochronic') {
    // One tone switched fully on and off `beat` times per second by a square wave.
    const tone = c.createOscillator();
    const lfo = c.createOscillator();
    const depth = c.createGain();
    const amp = c.createGain();
    tone.frequency.value = CARRIER;
    lfo.type = 'square';
    lfo.frequency.value = beat;
    amp.gain.value = 0.5;
    depth.gain.value = 0.5; // gain swings 0 ↔ 1
    lfo.connect(depth).connect(amp.gain);
    tone.connect(amp).connect(master);
    tone.start();
    lfo.start();
    sources.push(tone, lfo);
  } else {
    const noise = brownNoise(c);
    noise.connect(master);
    noise.start();
    sources.push(noise);
  }
}
function stopSound() { sources.forEach((s) => s.stop()); sources = []; }

function beep(freq, at, dur, vol, type = 'sine') {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + at;
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
const chime = () => [523, 659, 784].forEach((f, i) => beep(f, i * 0.3, 1.5, 0.2));
const alarm = () => { for (let i = 0; i < 8; i++) beep(i % 2 ? 660 : 880, i * 0.25, 0.2, 0.3, 'triangle'); };
function drum() {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}

// ---------- phase navigation ----------
const PHASES = ['preload', 'activation', 'immersion', 'exit'];
let phase;

function go(name) {
  if (phase === 'immersion' && mode === 'work') focusMs += clock.elapsed(); // count the unfinished round
  stopTimers();
  stopSound();
  keepAwake(false);
  phase = name;
  delete document.body.dataset.glow;
  document.querySelectorAll('section').forEach((s) => { s.hidden = s.id !== name; });
  document.querySelectorAll('#steps span').forEach((s) => s.classList.toggle('on', s.dataset.phase === name));
  $('#skip').hidden = name === 'exit';
  enter[name]();
}
$('#skip').onclick = () => go(PHASES[PHASES.indexOf(phase) + 1]);

const show = (...ids) => ids.forEach((id, i) => { $(id).hidden = i > 0; }); // first id shown, rest hidden

const enter = {
  preload() {
    show('#setup', '#stare');
    $('#title').value = settings.title;
    $('#preload-min').value = String(settings.preload);
    $('#work').value = settings.work;
    $('#rest').value = settings.rest;
  },

  activation() {
    show('#act-choice', '#act-own', '#act-builtin');
  },

  immersion() {
    $('#session-title').textContent = settings.title || 'Untitled session';
    $('#sound').value = settings.sound;
    $('#beat').value = String(settings.beat);
    $('#volume').value = settings.volume;
    showSoundHints();
    round = 1;
    focusMs = 0;
    roundsDone = 0;
    paused = false;
    $('#pause').textContent = 'Pause';
    keepAwake(true);
    work();
  },

  exit() {
    const minutes = Math.round(focusMs / 60000);
    $('#summary').hidden = minutes === 0 && roundsDone === 0;
    $('#summary').textContent = `You focused for ${minutes} minute${minutes === 1 ? '' : 's'}`
      + ` and finished ${roundsDone} work round${roundsDone === 1 ? '' : 's'}.`;
    $('#search').value = '';
    renderExits();
  },
};

// ---------- 1. pre-loading ----------
$('#setup').oninput = () => {
  settings.title = $('#title').value.trim();
  settings.preload = [5, 10, 15].includes(Number($('#preload-min').value)) ? Number($('#preload-min').value) : 10;
  settings.work = clamp(parseFloat($('#work').value), 1, 180, settings.work);
  settings.rest = clamp(parseFloat($('#rest').value), 1, 60, settings.rest);
  save();
};
$('#setup').onsubmit = (e) => {
  e.preventDefault();
  audio(); // unlock audio on a click so the end chime can play
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  show('#stare', '#setup');
  $('#preload-len').textContent = settings.preload;
  countdown(settings.preload * 60, $('#preload-timer'), () => {
    chime();
    notify('Pre-loading done. Time to activate.');
    go('activation');
  });
};

// ---------- 2. activation ----------
$('#act-own-btn').onclick = () => {
  show('#act-own', '#act-choice');
  $('#own-trigger').value = settings.ownTrigger;
  $('#own-trigger').focus();
};
$('#own-trigger').oninput = (e) => { settings.ownTrigger = e.target.value; save(); };
document.querySelectorAll('.act-done').forEach((b) => { b.onclick = () => go('immersion'); });

$('#act-builtin-btn').onclick = () => {
  audio();
  show('#act-builtin', '#act-choice');
  $('#splash-done').hidden = true;
  sighs();
};

// Step 1: five physiological sighs (double inhale, long exhale), paced by the circle.
function sighs() {
  document.body.dataset.glow = '1';
  const circle = $('#circle');
  circle.hidden = false;
  const breath = [['Inhale through your nose', 1.4, 2000], ['Inhale again, top it up', 1.65, 1000], ['Long, slow exhale', 0.7, 6000]];
  let cycle = 0;
  let i = 0;
  (function next() {
    if (i === breath.length) { i = 0; cycle++; }
    if (cycle === 5) return jacks();
    const [text, scale, ms] = breath[i++];
    $('#act-label').textContent = text;
    $('#act-sub').textContent = `Sigh ${cycle + 1} of 5`;
    circle.style.transition = `transform ${ms}ms ease-in-out`;
    circle.style.transform = `scale(${scale})`;
    later(next, ms);
  })();
}

// Step 2: 30 jumping jacks to a 100 bpm drum.
function jacks() {
  document.body.dataset.glow = '2';
  $('#circle').hidden = true;
  $('#act-label').textContent = 'Jumping jacks, one per beat';
  $('#act-sub').textContent = 'Get ready…';
  let n = 0;
  later(() => every(() => {
    drum();
    $('#act-sub').textContent = `${++n} / 30`;
    if (n === 30) { stopTimers(); later(splash, 800); }
  }, 600), 2000);
}

// Step 3: cold water.
function splash() {
  document.body.dataset.glow = '3';
  chime();
  $('#act-label').textContent = 'Splash cold water on your face';
  $('#act-sub').textContent = 'Then come back and press Done.';
  $('#splash-done').hidden = false;
}

// ---------- 3. immersion (pomodoro) ----------
let round = 1;
let mode = 'work';
let clock = null;
let paused = false;
let focusMs = 0;
let roundsDone = 0;

const setModeLabel = () => {
  $('#mode').textContent = `${mode === 'work' ? 'Work' : 'Rest'} · Round ${round}${paused ? ' · Paused' : ''}`;
};

function work() {
  mode = 'work';
  setModeLabel();
  $('#rest-panel').hidden = true;
  startSound(settings.sound, settings.beat);
  clock = countdown(settings.work * 60, $('#pomo-timer'), () => {
    focusMs += settings.work * 60000;
    roundsDone++;
    alarm();
    notify(`Work round ${round} done. Time to rest: put your phone away and stretch.`);
    rest();
  });
}

function rest() {
  mode = 'rest';
  stopSound();
  setModeLabel();
  renderStretches();
  $('#rest-panel').hidden = false;
  clock = countdown(settings.rest * 60, $('#pomo-timer'), () => {
    alarm();
    round++;
    notify(`Break over. Round ${round} is starting.`);
    work();
  });
}

$('#pause').onclick = () => {
  paused = !paused;
  if (paused) {
    clock.pause();
    stopSound();
  } else {
    clock.resume();
    if (mode === 'work') startSound(settings.sound, settings.beat);
  }
  $('#pause').textContent = paused ? 'Resume' : 'Pause';
  setModeLabel();
};

const renderStretches = () => $('#stretches').replaceChildren(
  ...settings.stretches.map((s) => Object.assign(document.createElement('li'), { textContent: s })),
);

function showSoundHints() {
  $('#headphones').hidden = settings.sound !== 'binaural';
  $('#beat').hidden = settings.sound === 'off' || settings.sound === 'brown';
}
function soundChanged() {
  settings.sound = $('#sound').value;
  settings.beat = Number($('#beat').value);
  save();
  showSoundHints();
  if (mode === 'work' && !paused) startSound(settings.sound, settings.beat);
}
$('#sound').onchange = soundChanged;
$('#beat').onchange = soundChanged;
$('#volume').oninput = (e) => {
  settings.volume = Number(e.target.value);
  setVolume(settings.volume);
  save();
};
$('#done').onclick = () => go('exit');

// ---------- 4. exit protocol ----------
function renderExits() {
  $('#exit-list').replaceChildren(...settings.exits.map((text) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const span = Object.assign(document.createElement('span'), { textContent: text });
    label.append(box, span);
    li.append(label);
    return li;
  }));
}
$('#search').oninput = (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#exit-list li').forEach((li) => { li.hidden = !li.textContent.toLowerCase().includes(q); });
};
$('#restart').onclick = () => go('preload');

// ---------- settings panel ----------
async function listOutputs() {
  const sel = $('#sink');
  let outputs = [];
  try {
    outputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  } catch { /* no device access: only "System default" is offered */ }
  sel.replaceChildren(new Option('System default', ''), ...outputs.map((d, i) => new Option(d.label || `Output ${i + 1}`, d.deviceId)));
  sel.value = settings.sink;
  if (sel.value !== settings.sink) sel.value = ''; // saved device is not plugged in
}

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);
function fillListEditors() {
  $('#edit-exits').value = settings.exits.join('\n');
  $('#edit-stretches').value = settings.stretches.join('\n');
}
function listsChanged() {
  if (phase === 'exit') renderExits();
  if (phase === 'immersion' && mode === 'rest') renderStretches();
  save();
}

$('#sink-row').hidden = !('setSinkId' in AudioContext.prototype);
$('#open-settings').onclick = () => {
  fillListEditors();
  listOutputs();
  $('#settings').showModal();
};
$('#sink').onchange = async (e) => {
  settings.sink = e.target.value;
  save();
  audio();
  await applySink();
  beep(660, 0, 0.4, 0.25); // a test tone, so you hear where the sound now goes
};
$('#edit-exits').oninput = (e) => { settings.exits = lines(e.target.value); listsChanged(); };
$('#edit-stretches').oninput = (e) => { settings.stretches = lines(e.target.value); listsChanged(); };
$('#reset-lists').onclick = () => {
  settings.exits = EXITS;
  settings.stretches = STRETCHES;
  fillListEditors();
  listsChanged();
};

go('preload');
