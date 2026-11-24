<img src="icon.png" alt="" width="88" align="right">

# Focus Protocol

A desktop app that walks you through a full deep-work session in four phases: reset, activate, work, wind down.

![Focus Protocol during a work round](docs/screenshot.jpg)

## Why

Most focus apps are just a timer. But how you *start* and *stop* working matters as much as the work block itself. Focus Protocol strings together a set of well-known productivity habits into one routine. You reset with a period of low stimulation, get your body going with a sensory kick, work in Pomodoro rounds with optional focus audio, then come down with something healthy instead of reaching for your phone.

Every time you open the app, it starts again at phase 1.

## The four phases

| Phase | What happens | The idea behind it |
|---|---|---|
| **1. Pre-loading** | A 5, 10 or 15-minute timer (10 by default): *stare at a wall*. You also set the session title and your Pomodoro work and rest lengths here. | Lower your baseline stimulation, so the work ahead feels rewarding by comparison. |
| **2. Activation** | Use your own trigger (cold shower, loud song, espresso…), or the built-in 3-minute sequence: 5 physiological sighs paced by a breathing circle, 30 jumping jacks to a drum beat, and a cold-water splash. | A strong physical or sensory signal that it's time to work. |
| **3. Immersion** | A minimal Pomodoro timer you can pause. An alarm sounds when work ends, and rest mode tells you to put your phone away and shows a stretch list. Optional binaural beats, isochronic tones or brown noise, with a volume slider. **Done** moves you on. | Distraction-free work in fixed rounds, with breaks that actually rest you. |
| **4. Exit protocol** | A summary of your session (focus minutes and finished rounds), then a searchable checklist of wind-down activities: walk, meditate, 20 pushups, journal, NSDR, and more. | Come down gradually rather than jumping straight to cheap stimulation. |

Every phase except the last has a **Skip →** button. The **⚙ settings** button is always in the top right.

> These are popular productivity practices, not medical advice. The research on binaural beats in particular is mixed, so treat them as optional.

## Features

- Four-phase flow that restarts at phase 1 on every launch
- Pomodoro timer with your own work and rest lengths (1–180 and 1–60 minutes), pause and resume, and automatic rounds
- Binaural beats or isochronic tones at 10 Hz (alpha), 15 Hz (beta) or 40 Hz (gamma), plus brown noise, all generated live in the app with no audio files
- A desktop notification when a timer ends while the app is in the background
- Keeps your screen awake during work rounds
- A built-in activation sequence with a breathing guide, a drum beat and a colour shift (deliberately no strobing)
- A session summary and a searchable exit-protocol checklist
- Settings: choose which speakers or headphones the sound plays through, and edit the exit-protocol and stretch lists to make them your own
- Your title, timings, sound, volume and lists are remembered between launches

## Quick start

### Use the app (Windows)

1. Download the latest `Focus.Protocol.<version>.exe` from the [Releases](../../releases) page.
2. Double-click it. There's no installer, so the .exe runs as-is.
3. Windows SmartScreen may say *"Windows protected your PC"*, because the app isn't code-signed. Click **More info → Run anyway**.

### Run from source

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/NathanLaborada/focus-protocol.git
cd focus-protocol
npm install
npm start
```

### Build the .exe yourself

```bash
npm run dist
```

This writes a portable `dist/Focus Protocol <version>.exe`, using the version from `package.json`.

## How it works

The whole app is three plain files (`index.html`, `style.css`, `app.js`) with no framework, wrapped in Electron by `main.js`.

- **Timers** count down to a fixed end time rather than counting ticks, so they stay accurate. Electron's background throttling is turned off, so timers keep running while the window is minimised.
- **Audio** comes from the browser's built-in audio engine (the Web Audio API):
  - *Binaural:* a 200 Hz tone in the left ear and a 215 Hz (or 240 Hz) tone in the right. Your brain hears the 15 Hz (or 40 Hz) difference as a beat. This needs headphones.
  - *Isochronic:* one 200 Hz tone switched on and off 10, 15 or 40 times per second by a square wave. It works on speakers.
  - *Brown noise:* 10 seconds of random noise made when you first pick it, then looped. Its end is matched to its start so there's no click at the loop point.
  - Alarms, the chime and the activation drum are short tones made the same way.
  - The output device is switched with `AudioContext.setSinkId`, so alarms and beats both follow your choice.
- **Notifications** use the standard web Notification API. They only appear when the app isn't the active window, since the alarm already covers that case.
- **Keeping the screen awake** uses the Screen Wake Lock API during Immersion, and the lock is taken again if you minimise and come back.
- **Settings** are saved in the app's local storage, on your computer only. Nothing is sent anywhere.

### Developing

Because the app is plain HTML, you can run it in a browser with any static server. Adding `?speed=60` to the URL makes every countdown 60× faster for testing:

```bash
python -m http.server 8765
# then open http://localhost:8765/?speed=60
```

## Tech stack

HTML, CSS, vanilla JavaScript, the Web Audio API, Electron, and electron-builder.

## Known limitations

- The .exe is Windows-only. On macOS or Linux, run from source with `npm start`.
- The .exe isn't code-signed, so SmartScreen warns on first launch.
- In a regular browser, the output-device list may only show "System default" until the site is given microphone access. The desktop app lists every device.

## License

MIT. See [LICENSE](LICENSE).
