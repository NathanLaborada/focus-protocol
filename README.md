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
| **1. Pre-loading** | Set up the session: a title, what *done* looks like, Pomodoro or Flowtime, your timings (with 25/5, 50/10, 52/17 and 90/20 presets), and a quick checklist (phone away, notifications off, water, tabs closed). Then a 5, 10 or 15-minute timer: *stare at a wall*. | Lower your baseline stimulation, so the work ahead feels rewarding by comparison. A clear goal and fewer interruptions make starting easier. |
| **2. Activation** | Pick one: the built-in 3-minute sequence (5 physiological sighs paced by a breathing circle, 30 jumping jacks to a drum beat, a cold-water splash), a 60-second all-out movement burst, your own hype song, or your own trigger. | A strong physical or sensory signal that it's time to work. |
| **3. Immersion** | A minimal timer you can pause. **Pomodoro** counts down, and every 4th break is a long one. **Flowtime** counts up until you take a break, and the break is a fifth of the time you worked. Rest mode shows a stretch list or guided box breathing. A *parking lot* box lets you jot stray thoughts down without leaving your work. Optional binaural beats, isochronic tones or brown noise. | Distraction-free work in rounds, with breaks that actually rest you. |
| **4. Exit protocol** | A summary of your session, then a short **shutdown ritual**: review your parked thoughts, write where to start next time, rate your focus and name your biggest distraction. After that, a searchable checklist of wind-down activities: walk, meditate, 20 pushups, journal, NSDR, and more. | Close the loop so work stops nagging you, then come down gradually rather than jumping straight to cheap stimulation. |

Every phase except the last has a **Skip →** button. The **⚙ settings** button is always in the top right.

> These are popular productivity practices, not medical advice. The research on binaural beats in particular is mixed, so treat them as optional.

## Features

- Four-phase flow that restarts at phase 1 on every launch
- Pomodoro timer with your own work, rest and long-break lengths, presets, pause and resume, and automatic rounds (every 4th break is long)
- Flowtime mode: the timer counts up, you decide when to break, and the break scales with how long you worked
- Session goal and "start here next time" note: what you write at Exit is shown when your next session starts
- Distraction parking lot during work, reviewed in the shutdown ritual
- Quick reflection (focus 1–5, biggest distraction), shown at the start of your next session
- Four activation options, including a 60-second movement burst and a link to your own hype song
- Guided box breathing (4-4-4-4) as an alternative to stretching during breaks
- Binaural beats or isochronic tones at 10 Hz (alpha), 15 Hz (beta) or 40 Hz (gamma), plus brown noise, all generated live in the app with no audio files
- A desktop notification when a timer ends while the app is in the background
- Keeps your screen awake during work rounds
- A built-in activation sequence with a breathing guide, a drum beat and a colour shift (deliberately no strobing)
- A session summary and a searchable exit-protocol checklist
- Settings: choose which speakers or headphones the sound plays through, and edit the exit-protocol and stretch lists to make them your own
- Your title, goal, timings, sound, volume, lists and notes are remembered between launches

## Quick start

### Use the app

Download the file for your system from the [Releases](../../releases) page.

**Windows**, pick one:

- `Focus-Protocol-Setup-<version>.exe` installs the app, adds a Start menu entry, and starts faster.
- `Focus-Protocol-Portable-<version>.exe` needs no install. Double-click it and it runs as-is.

Windows SmartScreen may say *"Windows protected your PC"*, because the app isn't code-signed. Click **More info → Run anyway**.

**macOS:** open `Focus-Protocol-<version>.dmg` and drag the app into Applications. It isn't signed by Apple, so the first time, right-click the app and choose **Open**. On newer macOS versions, if that doesn't offer an Open button, go to **System Settings → Privacy & Security** and click **Open Anyway**.

**Linux:** download `Focus-Protocol-<version>.AppImage`, make it executable (`chmod +x Focus-Protocol-*.AppImage`), and run it.

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

This writes the Windows installer and portable .exe to `dist/`, using the version from `package.json`. On a Mac or Linux machine, `npx electron-builder` builds for that system instead.

### Releasing

Releases are built automatically by GitHub Actions (`.github/workflows/release.yml`) for Windows, macOS and Linux.

1. Bump `version` in `package.json` and commit.
2. Tag and push: `git tag v1.x.0`, then `git push --tags`.
3. The workflow builds on all three systems and attaches the files to the GitHub Release for that tag.

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

- The app isn't code-signed, so Windows SmartScreen and macOS both warn on first launch.
- In a regular browser, the output-device list may only show "System default" until the site is given microphone access. The desktop app lists every device.

## License

MIT. See [LICENSE](LICENSE).
