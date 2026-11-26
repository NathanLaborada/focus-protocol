'use strict';

const $ = (sel) => document.querySelector(sel);

// Dev only: open index.html?speed=60 in a browser to make every timer run 60x faster.
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
  title: '', goal: '', mode: 'pomodoro', preload: 10, work: 25, rest: 5, longRest: 20,
  sound: 'off', beat: 15, volume: 30, sink: '',
  ownTrigger: '', hypeUrl: '', exits: EXITS, stretches: STRETCHES,
  parked: [], nextStep: '', lastReflection: null,
  history: [], // one entry per finished session: { at (ms), title, minutes, rounds, rating }
};
const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') };
const save = () => localStorage.setItem('settings', JSON.stringify(settings));
const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- timers (all cleared when the phase changes) ----------
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const every = (fn, ms) => timers.push(setInterval(fn, ms));
const stopTimers = () => { timers.forEach(clearTimeout); timers = []; }; // clearTimeout also clears intervals

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Both clocks measure against the system clock (not tick counting), so they never drift.
// Both return the same controls: pause(), resume(), elapsed() in ms.
// `bar`, if given, is stretched from 0 to full width as the countdown runs.
function countdown(seconds, el, onDone, bar) {
  const total = seconds * 1000;
  let left = total; // ms left while paused
  let end = 0;
  let id = null;
  const remaining = () => (id ? Math.max(0, (end - Date.now()) * SPEED) : left);
  function tick() {
    const ms = remaining();
    el.textContent = fmt(Math.ceil(ms / 1000));
    if (bar) bar.style.transform = `scaleX(${1 - ms / total})`;
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

function countup(el) {
  let banked = 0; // ms counted before the last pause
  let start = 0;
  let id = null;
  const elapsed = () => banked + (id ? (Date.now() - start) * SPEED : 0);
  const tick = () => { el.textContent = fmt(Math.floor(elapsed() / 1000)); };
  function resume() {
    start = Date.now();
    id = setInterval(tick, 200);
    timers.push(id);
    tick();
  }
  function pause() {
    banked = elapsed();
    clearInterval(id);
    id = null;
  }
  resume();
  return { pause, resume, elapsed };
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

// ---------- shared bits ----------
// A checklist item: <li><label><input type=checkbox><span>text</span></label></li>
function checkItem(text) {
  const li = document.createElement('li');
  const label = document.createElement('label');
  label.append(
    Object.assign(document.createElement('input'), { type: 'checkbox' }),
    Object.assign(document.createElement('span'), { textContent: text }),
  );
  li.append(label);
  return li;
}
// Shows `text` in `el`, or hides `el` when there is nothing to show.
function showText(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

// ---------- phase navigation ----------
const PHASES = ['preload', 'activation', 'immersion', 'exit'];
let phase;
let leaving = false; // true while the old screen fades out

function go(name) {
  if (leaving) return; // already switching, e.g. a double click on Skip
  if (phase === 'immersion' && mode === 'work') focusMs += clock.elapsed(); // count the unfinished round
  if (mini) setMini(false);
  stopTimers();
  stopSound();
  stopBox();
  keepAwake(false);
  const old = phase && $(`#${phase}`);
  phase = name;
  delete document.body.dataset.glow;
  document.querySelectorAll('#steps span').forEach((s) => {
    const i = PHASES.indexOf(s.dataset.phase);
    s.classList.toggle('on', i === PHASES.indexOf(name));
    s.classList.toggle('done', i < PHASES.indexOf(name));
  });
  $('#skip').hidden = name === 'exit';
  if (!old) return showPhase(name);
  // Fade the old screen out (.leaving in style.css), then the new one fades in.
  leaving = true;
  old.classList.add('leaving');
  setTimeout(() => {
    leaving = false;
    showPhase(name);
    old.classList.remove('leaving'); // after hiding it, so it doesn't flash back in
  }, 200);
}
function showPhase(name) {
  document.querySelectorAll('section').forEach((s) => { s.hidden = s.id !== name; });
  enter[name]();
}
$('#skip').onclick = () => go(PHASES[PHASES.indexOf(phase) + 1]);

const show = (...ids) => ids.forEach((id, i) => { $(id).hidden = i > 0; }); // first id shown, rest hidden

const enter = {
  preload() {
    show('#setup', '#stare');
    $('#title').value = settings.title;
    $('#goal').value = settings.goal;
    $('#timer-mode').value = settings.mode;
    $('#preload-min').value = String(settings.preload);
    $('#work').value = settings.work;
    $('#rest').value = settings.rest;
    $('#long-rest').value = settings.longRest;
    document.querySelectorAll('.checklist input').forEach((b) => { b.checked = false; });
    showModeFields();
    showRecap();
  },

  activation() {
    show('#act-choice', '#act-own', '#act-song', '#act-builtin');
  },

  immersion() {
    $('#session-title').textContent = settings.title || 'Untitled session';
    showText($('#session-goal'), settings.goal && `Goal: ${settings.goal}`);
    showText($('#start-with'), settings.nextStep && `Start with: ${settings.nextStep}`);
    $('#sound').value = settings.sound;
    $('#beat').value = String(settings.beat);
    $('#volume').value = settings.volume;
    showSoundHints();
    showParkCount();
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
    const worked = minutes > 0 || roundsDone > 0;
    $('#summary').hidden = !worked;
    $('#summary').textContent = `You focused for ${plural(minutes, 'minute')} and finished ${plural(roundsDone, 'work round')}.`;
    // Log it for History; the shutdown ritual adds the focus rating to this same entry.
    thisSession = worked ? { at: Date.now(), title: settings.title, minutes, rounds: roundsDone } : null;
    if (thisSession) { settings.history = [...settings.history, thisSession]; save(); }
    $('#ritual').hidden = false;
    $('#shutdown-done').hidden = true;
    $('#parked-block').hidden = settings.parked.length === 0;
    $('#parked-list').replaceChildren(...settings.parked.map(checkItem));
    $('#next-step').value = settings.nextStep;
    document.querySelectorAll('input[name=rating]').forEach((r) => { r.checked = false; });
    $('#distraction').value = '';
    $('#search').value = '';
    renderExits();
  },
};

// ---------- 1. pre-loading ----------
function showModeFields() {
  const flow = settings.mode === 'flow';
  $('#pomo-fields').hidden = flow;
  $('#flow-hint').hidden = !flow;
  $('#timer-summary').textContent = flow
    ? `Flowtime · ${settings.preload} min pre-load`
    : `${settings.work} / ${settings.rest} min, long break ${settings.longRest} · ${settings.preload} min pre-load`;
  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.preset === `${settings.work},${settings.rest}`);
  });
}

// What last session's shutdown ritual left behind.
function showRecap() {
  const r = settings.lastReflection;
  const parts = [];
  if (r?.rating) parts.push(`focus ${r.rating}/5`);
  if (r?.distraction) parts.push(`biggest distraction: ${r.distraction}`);
  showText($('#recap-reflection'), parts.length ? `Last session: ${parts.join(' · ')}` : '');
  showText($('#recap-step'), settings.nextStep && `Start with: ${settings.nextStep}`);
  $('#recap').hidden = !parts.length && !settings.nextStep;
}

$('#setup').oninput = () => {
  settings.title = $('#title').value.trim();
  settings.goal = $('#goal').value.trim();
  settings.mode = $('#timer-mode').value === 'flow' ? 'flow' : 'pomodoro';
  settings.preload = [5, 10, 15].includes(Number($('#preload-min').value)) ? Number($('#preload-min').value) : 10;
  settings.work = clamp(parseFloat($('#work').value), 1, 180, settings.work);
  settings.rest = clamp(parseFloat($('#rest').value), 1, 60, settings.rest);
  settings.longRest = clamp(parseFloat($('#long-rest').value), 1, 60, settings.longRest);
  save();
  showModeFields();
};
document.querySelectorAll('[data-preset]').forEach((b) => {
  b.onclick = () => {
    [$('#work').value, $('#rest').value] = b.dataset.preset.split(',');
    $('#setup').dispatchEvent(new Event('input'));
  };
});
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

$('#act-song-btn').onclick = () => {
  show('#act-song', '#act-choice');
  $('#song-url').value = settings.hypeUrl;
  $('#song-error').hidden = true;
};
$('#song-url').oninput = (e) => { settings.hypeUrl = e.target.value.trim(); save(); };
$('#song-play').onclick = () => {
  const ok = /^https?:\/\/\S+$/i.test(settings.hypeUrl);
  $('#song-error').hidden = ok;
  if (ok) window.open(settings.hypeUrl, '_blank', 'noopener'); // the desktop app opens it in your browser
};

$('#act-builtin-btn').onclick = () => {
  audio();
  show('#act-builtin', '#act-choice');
  $('#splash-done').hidden = true;
  sighs();
};

$('#act-burst-btn').onclick = () => {
  audio();
  show('#act-builtin', '#act-choice');
  $('#splash-done').hidden = true;
  $('#circle').hidden = true;
  document.body.dataset.glow = '2';
  $('#act-label').textContent = 'Go all out: burpees, high knees or sprint on the spot';
  every(drum, 400); // 150 bpm
  countdown(60, $('#act-sub'), () => {
    stopTimers(); // stops the drum
    document.body.dataset.glow = '3';
    chime();
    $('#act-label').textContent = 'Done. Catch your breath.';
    $('#act-sub').textContent = 'Press Done when you’re ready to work.';
    $('#splash-done').hidden = false;
  });
};

// Built-in step 1: five physiological sighs (double inhale, long exhale), paced by the circle.
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

// Built-in step 2: 30 jumping jacks to a 100 bpm drum.
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

// Built-in step 3: cold water.
function splash() {
  document.body.dataset.glow = '3';
  chime();
  $('#act-label').textContent = 'Splash cold water on your face';
  $('#act-sub').textContent = 'Then come back and press Done.';
  $('#splash-done').hidden = false;
}

// ---------- 3. immersion (pomodoro or flowtime) ----------
let round = 1;
let mode = 'work';
let longBreak = false;
let clock = null;
let paused = false;
let focusMs = 0;
let roundsDone = 0;

const setModeLabel = () => {
  const name = mode === 'work' ? (settings.mode === 'flow' ? 'Flow' : 'Work') : (longBreak ? 'Long break' : 'Rest');
  $('#mode').textContent = `${name} · Round ${round}${paused ? ' · Paused' : ''}`;
};

function work() {
  mode = 'work';
  stopBox();
  $('#immersion').classList.remove('resting');
  setModeLabel();
  $('#rest-panel').hidden = true;
  $('#take-break').hidden = settings.mode !== 'flow';
  $('#progress').hidden = settings.mode === 'flow'; // count-up has no end to measure against
  startSound(settings.sound, settings.beat);
  if (settings.mode === 'flow') {
    clock = countup($('#pomo-timer'));
  } else {
    clock = countdown(settings.work * 60, $('#pomo-timer'), () => { alarm(); endWork(settings.work * 60000); }, $('#progress-fill'));
  }
}

function endWork(workedMs) {
  focusMs += workedMs;
  roundsDone++;
  let minutes;
  if (settings.mode === 'flow') {
    longBreak = false;
    minutes = Math.max(1, Math.round(workedMs / 60000 / 5)); // Flowtime: a fifth of the time worked
  } else {
    longBreak = roundsDone % 4 === 0; // classic Pomodoro: every 4th break is long
    minutes = longBreak ? settings.longRest : settings.rest;
  }
  notify(`Round ${round} done. ${plural(minutes, 'minute')} break: put your phone away and stretch.`);
  rest(minutes);
}

function rest(minutes) {
  mode = 'rest';
  stopSound();
  $('#immersion').classList.add('resting');
  setModeLabel();
  renderStretches();
  $('#take-break').hidden = true;
  $('#rest-panel').hidden = false;
  $('#progress').hidden = false;
  clock = countdown(minutes * 60, $('#pomo-timer'), () => {
    alarm();
    round++;
    notify(`Break over. Round ${round} is starting.`);
    work();
  }, $('#progress-fill'));
}

$('#take-break').onclick = () => {
  clock.pause();
  paused = false; // a break ends any pause; the next round starts running
  $('#pause').textContent = 'Pause';
  endWork(clock.elapsed());
};

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

// Box breathing in rest mode: 4 s in, 4 s hold, 4 s out, 4 s hold, on the same circle as Activation.
let boxTimer = null;
function startBox() {
  show('#box-view', '#stretch-view');
  const steps = [['Breathe in', 1.5], ['Hold', 1.5], ['Breathe out', 0.8], ['Hold', 0.8]];
  const circle = $('#box-circle');
  let i = 0;
  (function next() {
    const [text, scale] = steps[i++ % steps.length];
    $('#box-label').textContent = text;
    circle.style.transition = 'transform 4000ms linear';
    circle.style.transform = `scale(${scale})`;
    boxTimer = setTimeout(next, 4000);
  })();
}
function stopBox() {
  clearTimeout(boxTimer);
  show('#stretch-view', '#box-view');
}
$('#box-btn').onclick = startBox;
$('#stretch-btn').onclick = stopBox;

// Distraction parking lot: jot it down, get back to work, deal with it at Exit.
const showParkCount = () => { $('#park-count').textContent = settings.parked.length ? `${settings.parked.length} parked` : ''; };
$('#park-form').onsubmit = (e) => {
  e.preventDefault();
  const thought = $('#park').value.trim();
  if (!thought) return;
  settings.parked = [...settings.parked, thought];
  save();
  $('#park').value = '';
  showParkCount();
};

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

// Mini timer (desktop app only): a small window with just the clock that stays above other apps.
let mini = false;
function setMini(on) {
  mini = on;
  document.body.classList.toggle('mini', on);
  $('#mini').textContent = on ? 'Expand' : 'Mini';
  window.desktop.mini(on);
}
$('#mini').hidden = !window.desktop; // set by preload.js in the desktop app only
$('#mini').onclick = () => setMini(!mini);

// Space pauses or resumes, unless you're typing or a control has focus (Space already presses it).
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || phase !== 'immersion' || leaving || document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea, select, button, summary')) return;
  e.preventDefault();
  $('#pause').click();
});

// ---------- 4. exit protocol ----------
const renderExits = () => $('#exit-list').replaceChildren(...settings.exits.map(checkItem));
let thisSession = null; // the History entry for the session that just ended

$('#next-step').oninput = (e) => { settings.nextStep = e.target.value.trim(); save(); };
$('#shutdown').onclick = () => {
  const rating = document.querySelector('input[name=rating]:checked');
  settings.lastReflection = { rating: rating ? Number(rating.value) : null, distraction: $('#distraction').value.trim() };
  if (thisSession) thisSession.rating = settings.lastReflection.rating; // same object as in settings.history
  settings.parked = []; // reviewed: clear the parking lot for next time
  save();
  $('#ritual').hidden = true;
  $('#shutdown-done').hidden = false;
};

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

// ---------- history ----------
const hm = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
function renderHistory() {
  const h = settings.history;
  const perDay = new Map(); // local calendar day → minutes
  h.forEach((s) => { const k = new Date(s.at).toDateString(); perDay.set(k, (perDay.get(k) || 0) + s.minutes); });
  const days = [6, 5, 4, 3, 2, 1, 0].map((back) => { const d = new Date(); d.setDate(d.getDate() - back); return d; });
  const mins = days.map((d) => perDay.get(d.toDateString()) || 0);
  // Streak: days in a row with a session, counted back from today (or from yesterday if today has none yet).
  let streak = 0;
  const d = new Date();
  if (!perDay.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (perDay.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const rated = h.filter((s) => s.rating).slice(-10);

  $('#stat-today').textContent = hm(mins[6]);
  $('#stat-week').textContent = hm(mins.reduce((a, b) => a + b, 0));
  $('#stat-streak').textContent = plural(streak, 'day');
  $('#stat-rating').textContent = rated.length ? `${(rated.reduce((a, s) => a + s.rating, 0) / rated.length).toFixed(1)} / 5` : '–';

  const max = Math.max(...mins, 1);
  const label = (day) => day.toLocaleDateString(undefined, { weekday: 'short' });
  $('#week-chart').replaceChildren(...days.map((day, i) => {
    const col = document.createElement('div');
    col.title = `${label(day)}: ${hm(mins[i])}`;
    const bar = document.createElement('i');
    bar.style.height = `${Math.round((mins[i] / max) * 90)}px`;
    col.append(bar, Object.assign(document.createElement('span'), { textContent: label(day) }));
    return col;
  }));
  $('#week-chart').setAttribute('aria-label', `Focus time, last 7 days: ${days.map((day, i) => `${label(day)} ${hm(mins[i])}`).join(', ')}`);

  $('#recent').replaceChildren(...h.slice(-10).reverse().map((s) => {
    const when = new Date(s.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const parts = [when, s.title || 'Untitled session', hm(s.minutes), plural(s.rounds, 'round')];
    if (s.rating) parts.push(`focus ${s.rating}/5`);
    return Object.assign(document.createElement('li'), { textContent: parts.join(' · ') });
  }));
  $('#no-history').hidden = h.length > 0;
}
$('#open-history').onclick = () => { renderHistory(); $('#history').showModal(); };

// Web version: cache the app so it opens offline and can be installed. Not in the desktop app (file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');

go('preload');
