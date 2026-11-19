// Hub sound, all synthesised (no files):
//  - ambience: a soft stereo breeze that swells and settles, songbirds by day,
//    crickets at night
//  - positional sources: the training pads' warm chord hum, the lucky blocks'
//    magic chimes, the machine's electric drone and zaps, crackling fire on lava
//    creatures, the event screen's tiny arcade tune. Each one is quieter with
//    distance from the player and panned to where it is seen from the camera.
//  - one-shots: footsteps per surface, jump / land, pad chimes, training ticks
//    that climb a scale, coin tinks that rise in pitch as they stream in, the
//    cash-in "ka-ching", locked buzzers and the stall keepers' gibberish hellos.
import { AUDIO } from '../config.js'
import { A, now, onStart, ready, voice } from './core.js'
import { bubble, burst, modal, pick, rnd, route, tone, vary } from './synth.js'

const listener = { x: 0, y: 0, z: 0, yaw: 0, px: 0, py: 0, pz: 0 }
let night = false

// Distance gain + pan for a point, as heard by the player through the camera.
function spatial(x, y, z) {
  const d = Math.hypot(x - listener.px, (y - listener.py) * 0.5, z - listener.pz)
  if (d > AUDIO.far) return null
  const g = 1 / (1 + (d / AUDIO.near) ** 2)
  const dx = x - listener.x
  const dz = z - listener.z
  const len = Math.hypot(dx, dz) || 1
  const pan = ((dx / len) * Math.cos(listener.yaw) - (dz / len) * Math.sin(listener.yaw)) * Math.min(1, d / 4) * 0.85
  return { g: g * Math.min(1, (AUDIO.far - d) / 15), pan }
}
// Options for a one-shot at an optional world position (null = not audible). With no position
// (UI sounds, e.g. sfx.whoosh(null) when a window opens) it plays centred at full level: `k` must
// be a number, or `0.06 * Math.min(1, o.k * 2)` is NaN and Web Audio throws on the gain ramp.
function at(pos, base = {}) {
  if (!pos) return { k: 1, pan: 0, ...base }
  const s = spatial(pos.x, pos.y ?? 0, pos.z)
  if (!s) return null
  return { ...base, pan: s.pan, k: s.g }
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] // major pentatonic, semitones
const note = (base, i) => base * 2 ** (SCALE[Math.min(SCALE.length - 1, i)] / 12)

// --- One-shots -------------------------------------------------------------------------
export const sfx = {
  step(surface, speed = 8) {
    if (!voice(0.15, 0.5)) return
    const t = now()
    const k = Math.min(1, speed / 10)
    if (surface === 'wood') {
      modal({ t, f: vary(190, 0.08), modes: [[1, 0.5, 0.05], [2.3, 0.3, 0.035], [4.1, 0.12, 0.02]], gain: 0.1 * (0.6 + k * 0.4), strike: 0.08 })
      burst({ t, noise: 'pink', f: 700, q: 0.8, d: 0.05, gain: 0.06 })
    } else if (surface === 'path') {
      burst({ t, noise: 'white', f: vary(3200, 0.2), q: 0.7, a: 0.003, d: 0.07, gain: 0.07 * (0.6 + k * 0.4), pan: rnd(-0.1, 0.1) })
      burst({ t, noise: 'pink', type: 'lowpass', f: 500, d: 0.05, gain: 0.08 })
    } else if (surface === 'pad') {
      tone({ t, type: 'sine', f: vary(140, 0.05), f2: 90, d: 0.07, gain: 0.08 })
      burst({ t, noise: 'white', f: 5200, q: 2, d: 0.04, gain: 0.03 })
    } else {
      // Grass on plastic studs: a soft swish plus a tiny clicky tick of the studs.
      burst({ t, noise: 'pink', f: vary(1300, 0.25), q: 0.9, a: 0.004, d: 0.08, gain: 0.08 * (0.6 + k * 0.4), pan: rnd(-0.1, 0.1) })
      burst({ t, noise: 'white', f: vary(4800, 0.2), q: 3, a: 0.001, d: 0.012, gain: 0.025 })
      tone({ t, type: 'sine', f: vary(95, 0.1), f2: 60, d: 0.05, gain: 0.07 })
    }
  },
  jump() {
    if (!voice(0.3)) return
    const t = now()
    burst({ t, noise: 'pink', f: 500, f2: 1900, q: 1.2, a: 0.01, d: 0.2, gain: 0.08 })
    tone({ t, type: 'triangle', f: 310, f2: 620, glide: 0.12, d: 0.14, gain: 0.05, lp: 2500 })
  },
  land(impact) {
    if (!voice(0.3)) return
    const t = now()
    const k = Math.min(1, impact / 14)
    tone({ t, type: 'sine', f: 130, f2: 55, d: 0.16, gain: 0.12 + k * 0.18 })
    burst({ t, noise: 'pink', type: 'lowpass', f: 900, d: 0.12, gain: 0.08 + k * 0.12 })
    burst({ t, noise: 'white', f: 3500, q: 1, d: 0.05, gain: 0.03 + k * 0.03 })
  },
  // Stepping onto an unlocked training pad: a rising bell run, brighter for bigger multipliers.
  padEnter(mult = 1, pos) {
    const o = at(pos)
    if (!o || !voice(0.9)) return
    const t = now()
    const base = 523 * (1 + Math.min(4, Math.log2(mult + 1)) * 0.06)
    for (let i = 0; i < 4; i++) {
      modal({ t: t + i * 0.06, f: note(base, i * 2), modes: [[1, 0.6, 0.5], [2.76, 0.2, 0.25], [5.4, 0.08, 0.12]], gain: 0.07, verb: 0.4, pan: o.pan })
    }
    burst({ t, noise: 'pink', f: 600, f2: 4000, q: 1.5, a: 0.05, d: 0.25, gain: 0.04, pan: o.pan, verb: 0.3 })
  },
  // One training tick: a pluck that climbs the scale with the streak (wraps every two octaves).
  trainTick(streak) {
    if (!voice(0.4)) return
    const t = now()
    const f = note(660, streak % 10)
    tone({ t, type: 'triangle', f, d: 0.22, gain: 0.07, lp: 4000, verb: 0.25 })
    tone({ t, type: 'sine', f: f * 2, d: 0.12, gain: 0.03 })
    bubble({ t: t + 0.01, f: 900, d: 0.04, gain: 0.05, rise: 0.8 })
  },
  // A locked pad / stall: a soft two-tone "nuh-uh".
  locked(pos) {
    const o = at(pos)
    if (!o || !voice(0.4)) return
    const t = now()
    tone({ t, type: 'square', f: 330, d: 0.1, hold: 0.03, gain: 0.04, lp: 1400, pan: o.pan })
    tone({ t: t + 0.14, type: 'square', f: 247, d: 0.16, hold: 0.04, gain: 0.04, lp: 1200, pan: o.pan })
    tone({ t, type: 'sine', f: 110, f2: 70, d: 0.12, gain: 0.08 })
  },
  // A coin landing in the player's pocket; i = how many arrived so far in this shower.
  coin(i = 0) {
    if (!voice(0.3, 0.6)) return
    const t = now()
    const f = 2100 * 2 ** (Math.min(i, 14) / 24)
    modal({ t, f, modes: [[1, 0.6, 0.18], [2.76, 0.3, 0.1], [5.4, 0.15, 0.05]], gain: 0.07, beat: 6, strike: 0.04, pan: rnd(-0.2, 0.2), verb: 0.15 })
  },
  // Collecting money: the classic register ka-ching with a shimmer on top.
  cashIn(pos) {
    const o = at(pos)
    if (!o || !voice(1)) return
    const t = now()
    burst({ t, noise: 'white', f: 2500, q: 0.8, a: 0.001, d: 0.04, gain: 0.08, pan: o.pan })
    burst({ t: t + 0.02, noise: 'pink', f: 1200, f2: 300, q: 1, d: 0.12, gain: 0.05, pan: o.pan })
    modal({ t: t + 0.08, f: 1318, modes: [[1, 0.6, 0.7], [2.76, 0.25, 0.4], [5.4, 0.1, 0.2]], gain: 0.1, beat: 4, verb: 0.35, pan: o.pan })
    modal({ t: t + 0.2, f: 1976, modes: [[1, 0.6, 0.9], [2.76, 0.25, 0.5], [5.4, 0.1, 0.25]], gain: 0.1, beat: 4, verb: 0.4, pan: o.pan })
    for (let i = 0; i < 6; i++) tone({ t: t + 0.25 + i * 0.04, type: 'sine', f: note(1568, i), d: 0.12, gain: 0.025, verb: 0.4 })
  },
  // A stall keeper's gibberish hello: three formant-filtered syllables with a happy lilt.
  greet(pos, pitch = 1) {
    const o = at(pos)
    if (!o || o.k < 0.05 || !voice(0.8)) return
    const ctx = A.ctx
    let t = now()
    const vowels = [[700, 1200], [400, 2000], [300, 900], [600, 1700], [500, 1500]]
    const n = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) {
      const d = rnd(0.08, 0.14)
      const f0 = vary(210 * pitch, 0.08) * (i === n - 1 ? 1.25 : 1)
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f0, t)
      osc.frequency.linearRampToValueAtTime(f0 * (i === n - 1 ? 1.3 : 0.92), t + d)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.09 * Math.min(1, o.k * 2), t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      const [fa, fb] = pick(vowels)
      const out = ctx.createGain()
      out.gain.value = 1
      for (const [f, q, lvl] of [[fa, 6, 1], [fb, 8, 0.5]]) {
        const b = ctx.createBiquadFilter()
        b.type = 'bandpass'
        b.frequency.value = f
        b.Q.value = q
        const l = ctx.createGain()
        l.gain.value = lvl
        osc.connect(b).connect(l).connect(g)
      }
      g.connect(out)
      route(out, { pan: o.pan, verb: 0.15 })
      osc.start(t)
      osc.stop(t + d + 0.05)
      t += d + rnd(0.02, 0.05)
    }
  },
  // A light pop when something reacts to you (labels bouncing, gifts).
  pop(pos, f = 700) {
    const o = at(pos)
    if (!o || !voice(0.2, 0.6)) return
    bubble({ t: now(), f: vary(f, 0.1), d: 0.05, gain: 0.08 * Math.min(1, o.k * 2 + 0.2), rise: 1.2, pan: o.pan })
  },
  // A magic sparkle (the gift and hourglass).
  magic(pos) {
    const o = at(pos)
    if (!o || !voice(1)) return
    const t = now()
    for (let i = 0; i < 7; i++) tone({ t: t + i * 0.05, type: 'sine', f: note(1046, (i * 3) % 10), d: 0.3, gain: 0.03 * Math.min(1, o.k * 2 + 0.3), pan: o.pan + rnd(-0.2, 0.2), verb: 0.5 })
  },
  // Locked crate rattle on a stall / board.
  whoosh(pos) {
    const o = at(pos)
    if (!o || !voice(0.4)) return
    burst({ t: now(), noise: 'pink', f: 400, f2: 2400, q: 1.4, a: 0.06, d: 0.25, gain: 0.06 * Math.min(1, o.k * 2 + 0.2), pan: o.pan })
  },
  // A big jump: the air tearing past, longer and brighter the higher the jump goes.
  bigJump(speed) {
    if (!voice(0.8)) return
    const t = now()
    const k = Math.min(1, (speed - 9) / 35)
    burst({ t, noise: 'pink', f: 260, f2: 1800 + k * 2200, q: 0.9, a: 0.03, d: 0.3 + k * 0.5, gain: 0.07 + k * 0.08 })
    tone({ t, type: 'sine', f: 140, f2: 420 + k * 300, glide: 0.25, d: 0.3, gain: 0.08 })
    tone({ t, type: 'triangle', f: 330, f2: 990, glide: 0.18, d: 0.2, gain: 0.03, lp: 3000 })
  },
  // Lifting a brainrot overhead: a rising whoosh, a cartoon bloop and two sparkle notes.
  pickup(pos) {
    const o = at(pos)
    if (!o || !voice(0.6)) return
    const t = now()
    burst({ t, noise: 'pink', f: 500, f2: 2600, q: 1.3, a: 0.02, d: 0.18, gain: 0.07, pan: o.pan })
    tone({ t, type: 'sine', f: 360, f2: 880, glide: 0.12, d: 0.16, gain: 0.12 })
    bubble({ t: t + 0.05, f: 700, d: 0.06, gain: 0.08, rise: 1.5 })
    modal({ t: t + 0.1, f: note(1046, 4), modes: [[1, 0.6, 0.4], [2.76, 0.2, 0.2]], gain: 0.05, verb: 0.3 })
    modal({ t: t + 0.17, f: note(1046, 7), modes: [[1, 0.6, 0.5], [2.76, 0.2, 0.25]], gain: 0.05, verb: 0.35 })
  },
  // Setting a brainrot down on a pedestal: a solid thunk, then a warm rising major chord.
  place(pos) {
    const o = at(pos)
    if (!o || !voice(1)) return
    const t = now()
    tone({ t, type: 'sine', f: 160, f2: 70, d: 0.18, gain: 0.2 })
    modal({ t, f: vary(240, 0.05), modes: [[1, 0.5, 0.08], [2.3, 0.3, 0.05], [4.1, 0.12, 0.03]], gain: 0.12, strike: 0.06, pan: o.pan })
    burst({ t, noise: 'pink', type: 'lowpass', f: 900, d: 0.1, gain: 0.08, pan: o.pan })
    ;[0, 4, 7, 12].forEach((st, i) => modal({ t: t + 0.08 + i * 0.045, f: 523.25 * 2 ** (st / 12), modes: [[1, 0.6, 0.7], [2, 0.15, 0.4], [3, 0.08, 0.25]], gain: 0.05, verb: 0.35, pan: o.pan }))
  },
  // Dropping what you carry: a falling swish and a soft bump.
  drop() {
    if (!voice(0.4)) return
    const t = now()
    burst({ t, noise: 'pink', f: 1800, f2: 400, q: 1.2, a: 0.01, d: 0.18, gain: 0.06 })
    tone({ t: t + 0.22, type: 'sine', f: 120, f2: 60, d: 0.14, gain: 0.14 })
  },
  // A brainrot popping in: a puff of cloud and a twinkle; rarer ones add a magic run.
  spawn(pos, variant = 'normal') {
    const o = at(pos)
    if (!o || o.k < 0.02 || !voice(0.5, 0.6)) return
    const t = now()
    burst({ t, noise: 'pink', type: 'lowpass', f: 2400, f2: 500, a: 0.004, d: 0.22, gain: 0.12 * o.k, pan: o.pan })
    bubble({ t: t + 0.02, f: vary(600, 0.1), d: 0.05, gain: 0.08 * o.k, rise: 1.4, pan: o.pan })
    tone({ t: t + 0.06, type: 'sine', f: note(1568, Math.floor(Math.random() * 5)), d: 0.25, gain: 0.04 * o.k, pan: o.pan, verb: 0.4 })
    if (variant !== 'normal' && variant !== 'golden') {
      for (let i = 0; i < 6; i++) tone({ t: t + 0.1 + i * 0.06, type: 'sine', f: note(1046, i * 2), d: 0.4, gain: 0.04 * Math.min(1, o.k * 3), pan: o.pan, verb: 0.6 })
    }
  },
  // Time ran out: a little poof sucking away.
  despawn(pos) {
    const o = at(pos)
    if (!o || o.k < 0.02 || !voice(0.4, 0.5)) return
    const t = now()
    burst({ t, noise: 'pink', f: 700, f2: 2600, q: 1, a: 0.06, d: 0.12, gain: 0.08 * o.k, pan: o.pan })
    tone({ t, type: 'sine', f: 700, f2: 260, d: 0.22, gain: 0.05 * o.k, pan: o.pan })
  },
  // A Jump Crystal: a glassy ascending run with a shimmer tail.
  crystal(pos) {
    const o = at(pos)
    if (!o || !voice(1)) return
    const t = now()
    for (let i = 0; i < 5; i++) modal({ t: t + i * 0.05, f: note(1318, i * 2), modes: [[1, 0.6, 0.6], [2.76, 0.25, 0.3], [5.4, 0.1, 0.15]], gain: 0.06, beat: 5, verb: 0.5, pan: o.pan })
    burst({ t, noise: 'white', f: 6000, f2: 9000, q: 2, a: 0.02, d: 0.5, gain: 0.03, verb: 0.4 })
    tone({ t, type: 'sine', f: 220, f2: 440, glide: 0.3, d: 0.4, gain: 0.06 })
  },
  // A trampoline launch: the springy boing and a big upward rush of air.
  boing(pos) {
    const o = at(pos) ?? { pan: 0 }
    if (!voice(1)) return
    const t = now()
    for (let i = 0; i < 4; i++) tone({ t: t + i * 0.035, type: 'sine', f: 150 + i * 20, f2: 520 + i * 60, glide: 0.2, d: 0.22, gain: 0.08 / (i + 1), pan: o.pan })
    tone({ t, type: 'triangle', f: 90, f2: 60, d: 0.2, gain: 0.12 })
    burst({ t: t + 0.05, noise: 'pink', f: 300, f2: 3500, q: 0.9, a: 0.05, d: 0.6, gain: 0.12 })
  },
  // First landing on a new terrace: a little brass fanfare and a crash of shimmer.
  zoneUp() {
    if (!voice(2)) return
    const t = now()
    const seq = [[0, 0], [0.11, 4], [0.22, 7], [0.36, 12]]
    for (const [dt, st] of seq) {
      const f = 523.25 * 2 ** (st / 12)
      tone({ t: t + dt, type: 'sawtooth', f, d: 0.25, hold: 0.04, gain: 0.05, lp: 2400, verb: 0.3 })
      tone({ t: t + dt, type: 'square', f: f / 2, d: 0.2, gain: 0.025, lp: 1200 })
    }
    for (const st of [0, 4, 7, 12, 16]) tone({ t: t + 0.48, type: 'sawtooth', f: 523.25 * 2 ** (st / 12), a: 0.02, d: 0.9, hold: 0.2, gain: 0.03, lp: 2800, verb: 0.5 })
    burst({ t: t + 0.48, noise: 'white', f: 7000, q: 0.6, a: 0.005, d: 1.2, gain: 0.05, hp: 4000, verb: 0.4 })
    tone({ t: t + 0.48, type: 'sine', f: 65, f2: 45, d: 0.6, gain: 0.18 })
  },
  // A purchase: register drawer, ka-ching and a sparkle.
  buy() {
    if (!voice(1.2)) return
    const t = now()
    burst({ t, noise: 'white', f: 2400, q: 0.7, a: 0.001, d: 0.05, gain: 0.08 })
    modal({ t: t + 0.06, f: 1568, modes: [[1, 0.6, 0.8], [2.76, 0.25, 0.4], [5.4, 0.1, 0.2]], gain: 0.1, beat: 4, verb: 0.4 })
    modal({ t: t + 0.16, f: 2093, modes: [[1, 0.6, 0.9], [2.76, 0.25, 0.5]], gain: 0.09, beat: 4, verb: 0.45 })
    for (let i = 0; i < 6; i++) tone({ t: t + 0.22 + i * 0.04, type: 'sine', f: note(1568, i + 2), d: 0.18, gain: 0.025, verb: 0.4 })
  },
  // Unlocking a pad / slot: a bright rising arpeggio into a bell chord.
  unlock(pos) {
    const o = at(pos) ?? { pan: 0 }
    if (!voice(1.2)) return
    const t = now()
    for (let i = 0; i < 6; i++) tone({ t: t + i * 0.055, type: 'triangle', f: note(523, i * 2), d: 0.3, gain: 0.05, lp: 5000, verb: 0.3, pan: o.pan })
    ;[0, 4, 7].forEach((st) => modal({ t: t + 0.36, f: 1046 * 2 ** (st / 12), modes: [[1, 0.6, 1.2], [2.76, 0.2, 0.6], [5.4, 0.08, 0.3]], gain: 0.05, beat: 3, verb: 0.5 }))
  },
  // Rebirth: a long rising sweep that blooms into a big chord.
  rebirth() {
    if (!voice(3)) return
    const t = now()
    burst({ t, noise: 'pink', f: 200, f2: 6000, q: 1.5, a: 0.8, d: 0.6, gain: 0.08, verb: 0.5 })
    tone({ t, type: 'sawtooth', f: 110, f2: 880, glide: 1.2, a: 0.2, d: 1, gain: 0.04, lp: 2000 })
    for (const st of [0, 7, 12, 16, 19, 24]) tone({ t: t + 1.2, type: 'triangle', f: 261.6 * 2 ** (st / 12), a: 0.03, hold: 0.5, d: 1.4, gain: 0.04, verb: 0.6 })
    burst({ t: t + 1.2, noise: 'white', hp: 5000, f: 8000, q: 0.5, d: 1.6, gain: 0.05, verb: 0.5 })
  },
  // Buying an upgrade level: a springy "bwip" whose pitch climbs with the level, plus a twinkle.
  upgrade(level = 0) {
    if (!voice(0.8)) return
    const t = now()
    const k = Math.min(1, level / 40)
    tone({ t, type: 'square', f: 300 + k * 300, f2: 900 + k * 900, glide: 0.09, d: 0.12, gain: 0.04, lp: 3200, bus: A.ui })
    bubble({ t: t + 0.03, f: 620 + k * 400, d: 0.06, gain: 0.08, rise: 1.6, bus: A.ui })
    for (let i = 0; i < 3; i++) modal({ t: t + 0.08 + i * 0.05, f: note(1046 + k * 500, i * 2 + 2), modes: [[1, 0.6, 0.35], [2.76, 0.2, 0.15]], gain: 0.04, verb: 0.35, bus: A.ui })
  },
  // Equipping a back item: a buckle clack, a strap swish and a bright chime.
  equip() {
    if (!voice(0.8)) return
    const t = now()
    modal({ t, f: 900, modes: [[1, 0.5, 0.05], [2.3, 0.3, 0.03], [4.1, 0.15, 0.02]], gain: 0.12, strike: 0.05, bus: A.ui })
    modal({ t: t + 0.07, f: 1250, modes: [[1, 0.5, 0.05], [2.3, 0.3, 0.03]], gain: 0.1, strike: 0.05, bus: A.ui })
    burst({ t: t + 0.02, noise: 'pink', f: 700, f2: 2600, q: 1.2, a: 0.02, d: 0.14, gain: 0.05, bus: A.ui })
    ;[0, 7, 12].forEach((st, i) => tone({ t: t + 0.14 + i * 0.05, type: 'triangle', f: 784 * 2 ** (st / 12), d: 0.3, gain: 0.04, verb: 0.35, bus: A.ui }))
  },
  // A chest rattling before it opens; i = which shake (each a little more excited).
  chestShake(i = 0) {
    if (!voice(0.5)) return
    const t = now()
    modal({ t, f: vary(220 + i * 30, 0.05), modes: [[1, 0.5, 0.06], [2.3, 0.3, 0.04], [3.9, 0.15, 0.02]], gain: 0.16, strike: 0.08, bus: A.ui })
    modal({ t: t + 0.07, f: vary(260 + i * 30, 0.05), modes: [[1, 0.5, 0.05], [2.3, 0.3, 0.03]], gain: 0.12, strike: 0.08, bus: A.ui })
    burst({ t, noise: 'brown', type: 'lowpass', f: 900, d: 0.12, gain: 0.08, bus: A.ui })
    for (let k = 0; k < 3; k++) modal({ t: t + 0.03 + k * 0.03, f: vary(2600, 0.1), modes: [[1, 0.6, 0.06]], gain: 0.03, bus: A.ui }) // coins jingling inside
  },
  // The lid bursting open: a creak, a pop of light, then a rising sparkle whose size grows with the tier.
  chestOpen(tier = 0) {
    if (!voice(2.5)) return
    const t = now()
    tone({ t, type: 'sawtooth', f: 180, f2: 120, d: 0.18, gain: 0.03, lp: 900, bus: A.ui })
    burst({ t: t + 0.12, noise: 'white', f: 3000, q: 0.6, a: 0.002, d: 0.3, gain: 0.1, verb: 0.3, bus: A.ui })
    tone({ t: t + 0.12, type: 'sine', f: 90, f2: 50, d: 0.35, gain: 0.25, bus: A.ui })
    const n = 6 + tier * 3
    for (let i = 0; i < n; i++) tone({ t: t + 0.15 + i * 0.04, type: 'sine', f: note(784, i), d: 0.35, gain: 0.035, pan: rnd(-0.4, 0.4), verb: 0.5, bus: A.ui })
    for (const st of [0, 4, 7, 12]) tone({ t: t + 0.2 + n * 0.04, type: 'triangle', f: 523.25 * 2 ** ((st + tier * 2) / 12), a: 0.02, hold: 0.2, d: 0.9, gain: 0.035, verb: 0.55, bus: A.ui })
  },
  // A reward card flipping in: a whoosh and a chord, grander for rarer things (rank 0..4).
  reveal(rank = 0) {
    if (!voice(2)) return
    const t = now()
    burst({ t, noise: 'pink', f: 500, f2: 3200, q: 1.1, a: 0.04, d: 0.25, gain: 0.07, bus: A.ui })
    const chord = rank >= 3 ? [0, 4, 7, 11, 14, 19] : rank >= 1 ? [0, 4, 7, 12] : [0, 7, 12]
    chord.forEach((st, i) => modal({ t: t + 0.1 + i * 0.035, f: 659 * 2 ** (st / 12), modes: [[1, 0.6, 1], [2.76, 0.2, 0.5], [5.4, 0.08, 0.25]], gain: 0.045, beat: 3, verb: 0.55, bus: A.ui }))
    if (rank >= 3) burst({ t: t + 0.12, noise: 'white', hp: 5000, f: 8000, q: 0.5, d: 1.4, gain: 0.05, verb: 0.5, bus: A.ui })
  },
  // Claiming a reward: a quick glittery arpeggio up into a bell.
  claim() {
    if (!voice(1.2)) return
    const t = now()
    for (let i = 0; i < 5; i++) tone({ t: t + i * 0.045, type: 'triangle', f: note(659, i * 2), d: 0.22, gain: 0.045, verb: 0.35, bus: A.ui })
    modal({ t: t + 0.24, f: 1568, modes: [[1, 0.6, 1], [2.76, 0.25, 0.5], [5.4, 0.1, 0.3]], gain: 0.08, beat: 4, verb: 0.5, bus: A.ui })
    burst({ t: t + 0.24, noise: 'white', hp: 6000, f: 9000, q: 0.5, d: 0.6, gain: 0.03, bus: A.ui })
  },
  // A Lucky Jump: a magic glissando up and a big shimmering bell.
  lucky() {
    if (!voice(1.5)) return
    const t = now()
    for (let i = 0; i < 9; i++) tone({ t: t + i * 0.03, type: 'sine', f: note(880, i), d: 0.25, gain: 0.04, pan: rnd(-0.5, 0.5), verb: 0.5 })
    modal({ t: t + 0.27, f: 2093, modes: [[1, 0.6, 1.2], [2.76, 0.25, 0.6], [5.4, 0.1, 0.3]], gain: 0.09, beat: 5, verb: 0.6 })
    tone({ t, type: 'sine', f: 220, f2: 880, glide: 0.3, d: 0.35, gain: 0.07 })
  },
  // A Lucky Block charging up before it breaks; i = 0..3, each hit heavier and higher (a drum roll
  // into a riser), with a sparkle that climbs the scale.
  luckyCharge(i = 0) {
    if (!voice(0.6)) return
    const t = now()
    tone({ t, type: 'sine', f: 70 + i * 18, f2: 45, d: 0.22, gain: 0.16 + i * 0.03, bus: A.ui })
    modal({ t, f: vary(330 + i * 60, 0.03), modes: [[1, 0.5, 0.08], [2.4, 0.3, 0.05], [4.1, 0.15, 0.03]], gain: 0.1, strike: 0.08, bus: A.ui })
    burst({ t, noise: 'pink', f: 600 + i * 400, f2: 2400 + i * 1200, q: 1.1, a: 0.08, d: 0.22, gain: 0.04 + i * 0.015, bus: A.ui })
    for (let k = 0; k <= i; k++) tone({ t: t + 0.04 + k * 0.035, type: 'sine', f: note(784, i * 2 + k), d: 0.2, gain: 0.03, pan: rnd(-0.4, 0.4), verb: 0.45, bus: A.ui })
  },
  // The block cracking open: a brick crack, a deep boom, shattering sparkle; bigger for rarer prizes.
  luckyBreak(rank = 0) {
    if (!voice(2.5)) return
    const t = now()
    burst({ t, noise: 'white', f: 2600, q: 0.7, a: 0.001, d: 0.09, gain: 0.16, bus: A.ui })
    modal({ t, f: vary(180, 0.05), modes: [[1, 0.6, 0.12], [2.7, 0.35, 0.08], [5.1, 0.2, 0.05]], gain: 0.18, strike: 0.1, bus: A.ui })
    tone({ t: t + 0.01, type: 'sine', f: 110, f2: 38, d: 0.55, gain: 0.3, bus: A.ui })
    burst({ t: t + 0.03, noise: 'white', hp: 4000, f: 9000, q: 0.4, d: 0.5 + rank * 0.25, gain: 0.05, verb: 0.5, bus: A.ui })
    const n = 8 + rank * 4
    for (let i = 0; i < n; i++) modal({ t: t + 0.05 + i * 0.028, f: note(1318, (i * 3) % 11), modes: [[1, 0.6, 0.3], [2.76, 0.2, 0.15]], gain: 0.025, pan: rnd(-0.6, 0.6), verb: 0.5, bus: A.ui })
  },
  // A jackpot (next-zone brainrots, rare variants): a brassy fanfare that lands on a shimmering chord.
  jackpot() {
    if (!voice(3)) return
    const t = now()
    const seq = [0, 4, 7, 12, 7, 12, 16]
    seq.forEach((st, i) => {
      tone({ t: t + i * 0.09, type: 'sawtooth', f: 392 * 2 ** (st / 12), d: 0.16, hold: 0.04, gain: 0.03, lp: 2600, verb: 0.3, bus: A.ui })
      tone({ t: t + i * 0.09, type: 'triangle', f: 784 * 2 ** (st / 12), d: 0.18, gain: 0.025, verb: 0.3, bus: A.ui })
    })
    const end = t + seq.length * 0.09
    for (const st of [0, 4, 7, 12, 16]) tone({ t: end, type: 'sawtooth', f: 392 * 2 ** (st / 12), a: 0.02, hold: 0.5, d: 1.2, gain: 0.022, lp: 3000, verb: 0.6, bus: A.ui })
    modal({ t: end, f: 2093, modes: [[1, 0.6, 1.4], [2.76, 0.25, 0.7], [5.4, 0.1, 0.4]], gain: 0.08, beat: 6, verb: 0.6, bus: A.ui })
    burst({ t: end, noise: 'white', hp: 6000, f: 10000, q: 0.4, d: 1.6, gain: 0.04, verb: 0.6, bus: A.ui })
  },
  // A free Lucky Block earned from Jump Crystals: a quick magic run up into a bell.
  luckyFree() {
    if (!voice(1.5)) return
    const t = now()
    for (let i = 0; i < 8; i++) tone({ t: t + i * 0.04, type: 'triangle', f: note(659, i), d: 0.22, gain: 0.04, pan: rnd(-0.4, 0.4), verb: 0.45, bus: A.ui })
    modal({ t: t + 0.32, f: 1760, modes: [[1, 0.6, 1], [2.76, 0.25, 0.5], [5.4, 0.1, 0.3]], gain: 0.08, beat: 4, verb: 0.5, bus: A.ui })
  },
  // Fusion Machine: brainrots sucked in and the machine powering up (a rising electric whine,
  // a vacuum whoosh and a heavy clunk), at the machine.
  fuseStart(pos) {
    const o = at(pos, { k: 1, pan: 0 })
    if (!o || !voice(2)) return
    const t = now()
    const k = Math.min(1, o.k * 2 + 0.35)
    burst({ t, noise: 'pink', f: 300, f2: 3600, q: 1.2, a: 0.3, d: 0.5, gain: 0.09 * k, pan: o.pan })
    tone({ t: t + 0.1, type: 'sawtooth', f: 90, f2: 720, glide: 1.1, d: 1.3, hold: 0.6, gain: 0.035 * k, lp: 1800, pan: o.pan, verb: 0.3 })
    tone({ t: t + 0.1, type: 'square', f: 180, f2: 1440, glide: 1.1, d: 1.2, gain: 0.012 * k, lp: 2600, pan: o.pan })
    modal({ t: t + 0.85, f: 140, modes: [[1, 0.6, 0.2], [2.4, 0.4, 0.12], [4.6, 0.2, 0.08]], gain: 0.2 * k, strike: 0.1, pan: o.pan, verb: 0.3 })
    for (let i = 0; i < 6; i++) burst({ t: t + 0.9 + i * 0.07, noise: 'white', hp: 3000, f: 6000, q: 2, a: 0.001, d: 0.03, gain: 0.04 * k, pan: o.pan + rnd(-0.3, 0.3) })
  },
  // A fusion finished (heard anywhere): a power-down chime and a triumphant ding-ding.
  fuseDone() {
    if (!voice(1.5)) return
    const t = now()
    tone({ t, type: 'sine', f: 880, f2: 440, d: 0.3, gain: 0.04, bus: A.ui })
    ;[0, 7, 12, 16].forEach((st, i) => modal({ t: t + 0.12 + i * 0.09, f: 1046 * 2 ** (st / 12), modes: [[1, 0.6, 0.8], [2.76, 0.25, 0.4], [5.4, 0.1, 0.2]], gain: 0.05, beat: 3, verb: 0.5, bus: A.ui }))
  },
  // The fusion show: one swirl per orbit lap, climbing (i = 0..3).
  fuseSwirl(i = 0) {
    if (!voice(0.6)) return
    const t = now()
    burst({ t, noise: 'pink', f: 500 + i * 300, f2: 2600 + i * 900, q: 1.4, a: 0.12, d: 0.3, gain: 0.05 + i * 0.012, bus: A.ui })
    tone({ t, type: 'sine', f: 220 * 2 ** (i / 4), f2: 440 * 2 ** (i / 4), d: 0.35, gain: 0.05, verb: 0.3, bus: A.ui })
    for (let k = 0; k < 3; k++) tone({ t: t + k * 0.06, type: 'triangle', f: note(659, i * 2 + k), d: 0.18, gain: 0.025, pan: rnd(-0.5, 0.5), verb: 0.4, bus: A.ui })
  },
  // The three merging into one: a sucking implosion, then a bright boom with a shimmer.
  fuseMerge(rank = 0) {
    if (!voice(2.5)) return
    const t = now()
    tone({ t, type: 'sine', f: 1200, f2: 120, glide: 0.25, d: 0.28, gain: 0.06, bus: A.ui })
    burst({ t, noise: 'white', f: 4000, f2: 400, q: 1, a: 0.2, d: 0.08, gain: 0.07, bus: A.ui })
    tone({ t: t + 0.26, type: 'sine', f: 100, f2: 40, d: 0.6, gain: 0.3, bus: A.ui })
    burst({ t: t + 0.26, noise: 'white', hp: 4000, f: 9000, q: 0.4, d: 0.7 + rank * 0.2, gain: 0.06, verb: 0.5, bus: A.ui })
    for (let i = 0; i < 6 + rank * 2; i++) tone({ t: t + 0.3 + i * 0.035, type: 'sine', f: note(1046, i), d: 0.3, gain: 0.03, pan: rnd(-0.5, 0.5), verb: 0.5, bus: A.ui })
  },
  // Ascended Shop: buying a perk level. A regal brass chord that climbs with the level, a bell on
  // top, and a shimmer; `max` (the last level) adds a final flourish.
  ascendBuy(level = 1, max = false) {
    if (!voice(1.6)) return
    const t = now()
    const root = 262 * 2 ** (Math.min(12, level - 1) / 12)
    ;[0, 4, 7, 12].forEach((st, i) => {
      tone({ t: t + i * 0.06, type: 'sawtooth', f: root * 2 ** (st / 12), a: 0.02, hold: 0.18, d: 0.6, gain: 0.022, lp: 2400, verb: 0.45, bus: A.ui })
      tone({ t: t + i * 0.06, type: 'triangle', f: root * 2 * 2 ** (st / 12), d: 0.4, gain: 0.025, verb: 0.4, bus: A.ui })
    })
    modal({ t: t + 0.26, f: root * 4, modes: [[1, 0.6, 1], [2.76, 0.25, 0.5], [5.4, 0.1, 0.3]], gain: 0.07, beat: 4, verb: 0.55, bus: A.ui })
    burst({ t: t + 0.26, noise: 'white', hp: 6000, f: 9000, q: 0.5, d: 0.8, gain: 0.03, verb: 0.5, bus: A.ui })
    if (max) for (let i = 0; i < 10; i++) tone({ t: t + 0.5 + i * 0.04, type: 'sine', f: note(1046, i), d: 0.3, gain: 0.03, pan: rnd(-0.5, 0.5), verb: 0.5, bus: A.ui })
  },
  // The Ascended Shop unveiling: a rising "aah" pad (detuned saws through a soft filter), a boom,
  // bells cascading down and a long shimmer.
  ascendUnlock() {
    if (!voice(4)) return
    const t = now()
    for (const st of [0, 7, 12, 16, 19]) {
      tone({ t, type: 'sawtooth', f: 196 * 2 ** (st / 12), a: 0.6, hold: 0.8, d: 1.6, gain: 0.014, lp: 1600, verb: 0.7, bus: A.ui })
      tone({ t, type: 'sawtooth', f: 196 * 2 ** (st / 12) * 1.004, a: 0.6, hold: 0.8, d: 1.6, gain: 0.012, lp: 1600, verb: 0.7, bus: A.ui })
    }
    tone({ t: t + 0.6, type: 'sine', f: 90, f2: 40, d: 0.8, gain: 0.3, bus: A.ui })
    burst({ t: t + 0.6, noise: 'white', hp: 4000, f: 9000, q: 0.4, d: 2, gain: 0.05, verb: 0.7, bus: A.ui })
    for (let i = 0; i < 9; i++) modal({ t: t + 0.65 + i * 0.09, f: note(2093, 9 - i), modes: [[1, 0.6, 0.8], [2.76, 0.25, 0.4]], gain: 0.04, pan: rnd(-0.6, 0.6), verb: 0.6, bus: A.ui })
  },
  // Base Level: a hammer on metal while a level builds (at the core).
  hammer(pos) {
    const o = at(pos)
    if (!o || !voice(0.3, 0.5)) return
    const k = Math.min(1, o.k * 2 + 0.2)
    const t = now()
    modal({ t, f: vary(1200, 0.08), modes: [[1, 0.6, 0.12], [2.7, 0.35, 0.08], [5.2, 0.2, 0.05]], gain: 0.06 * k, strike: 0.06, pan: o.pan })
    burst({ t, noise: 'white', f: 5000, q: 1.5, a: 0.001, d: 0.03, gain: 0.04 * k, pan: o.pan })
  },
  // A Base Level finished: a rising brass fanfare, a deep boom and cascading bells.
  baseUp(level = 1) {
    if (!voice(3)) return
    const t = now()
    const root = 262 * 2 ** (Math.min(9, level) / 12)
    ;[0, 4, 7, 12, 16].forEach((st, i) => {
      tone({ t: t + i * 0.08, type: 'sawtooth', f: root * 2 ** (st / 12), a: 0.01, hold: 0.12, d: 0.4, gain: 0.024, lp: 2600, verb: 0.4, bus: A.ui })
      tone({ t: t + i * 0.08, type: 'triangle', f: root * 2 * 2 ** (st / 12), d: 0.35, gain: 0.025, verb: 0.4, bus: A.ui })
    })
    for (const st of [0, 4, 7, 12]) tone({ t: t + 0.45, type: 'sawtooth', f: root * 2 ** (st / 12), a: 0.02, hold: 0.5, d: 1.2, gain: 0.02, lp: 2800, verb: 0.6, bus: A.ui })
    tone({ t: t + 0.45, type: 'sine', f: 90, f2: 45, d: 0.6, gain: 0.28, bus: A.ui })
    for (let i = 0; i < 8; i++) modal({ t: t + 0.5 + i * 0.07, f: note(1568, 8 - i), modes: [[1, 0.6, 0.6], [2.76, 0.25, 0.3]], gain: 0.035, pan: rnd(-0.6, 0.6), verb: 0.6, bus: A.ui })
  },
  // Hub events -------------------------------------------------------------------------------------
  // A brainrot dropping out of the sky: a falling whistle.
  rainFall(pos) {
    const o = at(pos)
    if (!o || !voice(0.9, 0.5)) return
    const k = Math.min(1, o.k * 2 + 0.25)
    tone({ t: now(), type: 'sine', f: vary(1900, 0.06), f2: 500, glide: 0.85, d: 0.9, hold: 0.5, gain: 0.03 * k, pan: o.pan })
  },
  // ...and landing: a soft thump, a pop and a sparkle (brighter for rare variants).
  rainLand(pos, variant = 'normal') {
    const o = at(pos)
    if (!o || !voice(0.5)) return
    const k = Math.min(1, o.k * 2 + 0.25)
    const t = now()
    tone({ t, type: 'sine', f: 120, f2: 55, d: 0.25, gain: 0.2 * k, pan: o.pan })
    burst({ t, noise: 'brown', type: 'lowpass', f: 700, d: 0.15, gain: 0.12 * k, pan: o.pan })
    bubble({ t: t + 0.03, f: 650, d: 0.06, gain: 0.08 * k, rise: 1.2, pan: o.pan })
    const n = variant === 'normal' ? 3 : 7
    for (let i = 0; i < n; i++) tone({ t: t + 0.05 + i * 0.04, type: 'sine', f: note(1046, i * 2), d: 0.2, gain: 0.025 * k, pan: o.pan, verb: 0.4 })
  },
  // An event starting: a snare roll into a bright brass "ta-daa!" and a bell.
  eventStart() {
    if (!voice(3)) return
    const t = now()
    for (let i = 0; i < 12; i++) burst({ t: t + i * 0.045, noise: 'white', type: 'bandpass', f: 2200, q: 0.8, a: 0.002, d: 0.06, gain: 0.025 + i * 0.006, bus: A.ui })
    const hit = t + 0.58
    ;[[0, 0.12], [7, 0.12], [12, 0.7]].forEach(([st, d], i) => {
      for (const o of [0, 4, 7]) tone({ t: hit + i * 0.13, type: 'sawtooth', f: 392 * 2 ** ((st + o) / 12), a: 0.01, hold: d * 0.6, d, gain: 0.02, lp: 2800, verb: 0.4, bus: A.ui })
    })
    tone({ t: hit, type: 'sine', f: 98, f2: 60, d: 0.4, gain: 0.25, bus: A.ui })
    modal({ t: hit + 0.26, f: 1568, modes: [[1, 0.6, 1.2], [2.76, 0.25, 0.6], [5.4, 0.1, 0.3]], gain: 0.07, beat: 5, verb: 0.6, bus: A.ui })
  },
  // An event ending: a gentle descending chime.
  eventEnd() {
    if (!voice(1.2)) return
    const t = now()
    for (let i = 0; i < 4; i++) modal({ t: t + i * 0.12, f: note(1318, 6 - i * 2), modes: [[1, 0.6, 0.6], [2.76, 0.25, 0.3]], gain: 0.04, verb: 0.5, bus: A.ui })
  },
  // The last seconds of an event: a tick, higher on the final one.
  eventTick(last = false) {
    if (!voice(0.2, 2)) return
    tone({ t: now(), type: 'square', f: last ? 1320 : 880, d: 0.06, gain: 0.025, lp: 3000, bus: A.ui })
  },
  // A page flip (Index tier jumps, tab switches).
  page() {
    if (!voice(0.3, 2)) return
    burst({ t: now(), noise: 'pink', f: 1800, f2: 4200, q: 0.9, a: 0.01, d: 0.09, gain: 0.05, bus: A.ui })
  },
  // HUD: soft click / window open / error buzz.
  ui(kind = 'click') {
    if (!voice(0.3, 2)) return
    const t = now()
    if (kind === 'open') {
      bubble({ t, f: 520, d: 0.06, gain: 0.08, rise: 1.2, bus: A.ui })
      burst({ t, noise: 'pink', f: 800, f2: 2400, q: 1, a: 0.01, d: 0.1, gain: 0.04, bus: A.ui })
    } else if (kind === 'close') {
      bubble({ t, f: 700, d: 0.05, gain: 0.06, rise: -0.4, bus: A.ui })
    } else if (kind === 'error') {
      tone({ t, type: 'square', f: 196, d: 0.1, hold: 0.04, gain: 0.04, lp: 1200, bus: A.ui })
      tone({ t: t + 0.13, type: 'square', f: 165, d: 0.14, hold: 0.04, gain: 0.04, lp: 1100, bus: A.ui })
    } else {
      tone({ t, type: 'sine', f: 1200, f2: 900, d: 0.04, gain: 0.05, bus: A.ui })
      burst({ t, noise: 'white', f: 4000, q: 2, a: 0.001, d: 0.012, gain: 0.03, bus: A.ui })
    }
  },
}
// A sound is never worth breaking the game for: HUD buttons play `sfx.ui('click')` before running
// their action and windows play `sfx.ui('open')` / `sfx.whoosh` while they build, so one throwing
// recipe (bad parameter, suspended context) used to leave a button dead or a window empty.
for (const name of Object.keys(sfx)) {
  const fn = sfx[name]
  sfx[name] = (...args) => {
    try {
      return fn.apply(sfx, args)
    } catch (err) {
      console.warn(`[audio] sfx.${name} failed`, err)
    }
  }
}

// --- Air rushing past while flying high and fast (a continuous filtered noise) ---------------------
const air = { gain: null, filter: null }
export function setAirflow(speed) {
  if (!air.gain || !ready()) return
  const t = A.ctx.currentTime
  const k = Math.max(0, Math.min(1, (speed - 10) / 40))
  air.gain.gain.setTargetAtTime(k * k * 0.22, t, 0.12)
  air.filter.frequency.setTargetAtTime(350 + speed * 30, t, 0.15)
}
onStart((ctx) => {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  air.filter = ctx.createBiquadFilter()
  air.filter.type = 'bandpass'
  air.filter.Q.value = 0.6
  air.filter.frequency.value = 600
  air.gain = ctx.createGain()
  air.gain.gain.value = 0
  src.connect(air.filter).connect(air.gain).connect(A.sfx)
  src.start()
})

// --- Positional sources ---------------------------------------------------------------------
// kind: 'hum' | 'machine' | 'fire' | 'chimes' | 'arcade'
const emitters = []
export function addEmitter(kind, x, y, z, level = 1) {
  const e = { kind, x, y, z, level, gain: null, pan: null, next: 0, step: 0 }
  emitters.push(e)
  if (A.master) wire(e)
  return e
}

function wire(e) {
  const ctx = A.ctx
  e.pan = ctx.createStereoPanner()
  e.gain = ctx.createGain()
  e.gain.gain.value = 0
  e.gain.connect(e.pan).connect(A.amb)
  if (e.kind === 'hum') {
    // A warm detuned major chord breathing slowly.
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    lp.connect(e.gain)
    for (const [f, det] of [[220, -4], [277.2, 3], [329.6, -2], [440, 5]]) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      o.detune.value = det
      const g = ctx.createGain()
      g.gain.value = 0.05
      const lfo = ctx.createOscillator()
      lfo.frequency.value = rnd(0.15, 0.35)
      const depth = ctx.createGain()
      depth.gain.value = 0.03
      lfo.connect(depth).connect(g.gain)
      o.connect(g).connect(lp)
      o.start()
      lfo.start()
    }
  } else if (e.kind === 'machine') {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 4
    const wob = ctx.createOscillator()
    wob.frequency.value = 0.6
    const wd = ctx.createGain()
    wd.gain.value = 120
    wob.connect(wd).connect(lp.frequency)
    wob.start()
    for (const [type, f, g0] of [['sawtooth', 55, 0.25], ['square', 110.4, 0.08], ['sine', 82.4, 0.3]]) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = g0
      o.connect(g).connect(lp)
      o.start()
    }
    lp.connect(e.gain)
  } else if (e.kind === 'fire') {
    // Continuous low roar under the crackles (scheduled in tick()).
    const src = ctx.createBufferSource()
    src.buffer = A.noise.brown
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const g = ctx.createGain()
    g.gain.value = 0.5
    src.connect(lp).connect(g).connect(e.gain)
    src.start(0, Math.random() * 3)
  }
}

// Scheduled events for the sources that are made of discrete sounds.
function tick(e, s) {
  const t = now()
  if (t < e.next) return
  if (e.kind === 'fire') {
    e.next = t + rnd(0.03, 0.16)
    burst({ t, noise: 'white', f: rnd(1500, 5000), q: rnd(2, 6), a: 0.0005, d: rnd(0.004, 0.02), gain: 0.25 * s.g * e.level, pan: s.pan })
    if (Math.random() < 0.15) burst({ t, noise: 'pink', f: 300, q: 1, a: 0.001, d: 0.05, gain: 0.25 * s.g * e.level, pan: s.pan })
  } else if (e.kind === 'chimes') {
    e.next = t + rnd(0.18, 0.5)
    const f = note(1046, Math.floor(Math.random() * 9))
    modal({ t, f, modes: [[1, 0.5, 0.9], [2.76, 0.15, 0.4]], gain: 0.09 * s.g * e.level, pan: s.pan + rnd(-0.15, 0.15), verb: 0.6, beat: 3 })
  } else if (e.kind === 'machine') {
    e.next = t + rnd(1.5, 4)
    // Electric zap: a bright noise crackle with a falling whine.
    burst({ t, noise: 'white', f: 3000, f2: 800, q: 3, a: 0.002, d: 0.18, gain: 0.12 * s.g * e.level, pan: s.pan })
    tone({ t, type: 'sawtooth', f: 1400, f2: 300, d: 0.2, gain: 0.03 * s.g * e.level, lp: 3000, pan: s.pan })
  } else if (e.kind === 'arcade') {
    // A tiny looping 8-bit tune on the event screen.
    const tune = [0, 4, 7, 12, 7, 4, 9, 7, 5, 9, 12, 16, 12, 7, 4, -1]
    const step = 0.16
    e.next = t + step
    const n = tune[e.step % tune.length]
    e.step++
    if (n >= 0) tone({ t, type: 'square', f: 523 * 2 ** (n / 12), d: 0.11, gain: 0.03 * s.g * e.level, lp: 3500, pan: s.pan })
    if (e.step % 4 === 1) tone({ t, type: 'triangle', f: 131 * 2 ** (tune[(e.step >> 2) % 4 * 4] / 12), d: 0.25, gain: 0.04 * s.g * e.level, pan: s.pan })
  }
}

// --- Ambience ------------------------------------------------------------------------------
const amb = { wind: null, windLp: null, nextBird: 0, nextGust: 0, crickets: null }
onStart((ctx) => {
  for (const e of emitters) wire(e)
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo
  src.loop = true
  amb.windLp = ctx.createBiquadFilter()
  amb.windLp.type = 'lowpass'
  amb.windLp.frequency.value = 450
  amb.wind = ctx.createGain()
  amb.wind.gain.value = AUDIO.ambience.wind
  src.connect(amb.windLp).connect(amb.wind).connect(A.amb)
  src.start()
  // Crickets: a pulsed high sine, silent by day.
  const c = ctx.createOscillator()
  c.frequency.value = 4600
  const pulse = ctx.createOscillator()
  pulse.type = 'square'
  pulse.frequency.value = 18
  const pg = ctx.createGain()
  pg.gain.value = 0.5
  const cg = ctx.createGain()
  cg.gain.value = 0
  pulse.connect(pg).connect(cg.gain)
  amb.crickets = ctx.createGain()
  amb.crickets.gain.value = 0
  c.connect(cg).connect(amb.crickets)
  route(amb.crickets, { bus: A.amb, pan: 0.3 })
  c.start()
  pulse.start()
})

function birdSong(t) {
  const pan = rnd(-0.8, 0.8)
  const n = 2 + Math.floor(Math.random() * 5)
  const base = rnd(2400, 3600)
  const kind = Math.random()
  for (let i = 0; i < n; i++) {
    const tt = t + i * rnd(0.09, 0.16)
    if (kind < 0.5) tone({ t: tt, type: 'sine', f: base, f2: base * rnd(1.3, 1.6), glide: 0.06, a: 0.005, d: 0.07, gain: AUDIO.ambience.bird, pan, verb: 0.5 })
    else tone({ t: tt, type: 'sine', f: base * 1.4, f2: base * 0.9, glide: 0.08, a: 0.005, d: 0.09, gain: AUDIO.ambience.bird * 0.8, pan, verb: 0.5 })
  }
}

// Every frame: where the listener is, whether it is night, and the source levels.
export function updateAudio(dt, playerPos, camera, yaw, isNight) {
  listener.x = camera.position.x
  listener.y = camera.position.y
  listener.z = camera.position.z
  listener.px = playerPos.x
  listener.py = playerPos.y
  listener.pz = playerPos.z
  listener.yaw = yaw
  night = isNight
  if (!ready()) return
  const t = A.ctx.currentTime
  for (const e of emitters) {
    const s = spatial(e.x, e.y, e.z)
    const g = s ? s.g * e.level : 0
    if (e.gain) {
      const base = e.kind === 'hum' ? 0.5 : e.kind === 'machine' ? 0.35 : e.kind === 'fire' ? 0.25 : 0
      e.gain.gain.setTargetAtTime(g * base, t, 0.1)
      e.pan.pan.setTargetAtTime(s ? s.pan : 0, t, 0.1)
    }
    if (s && s.g > 0.01 && (e.kind === 'fire' || e.kind === 'chimes' || e.kind === 'machine' || e.kind === 'arcade')) tick(e, s)
  }
  // Breeze gusts, birds by day, crickets by night.
  if (t > amb.nextGust) {
    amb.nextGust = t + rnd(3, 7)
    const w = AUDIO.ambience.wind * rnd(0.6, 1.6)
    amb.wind.gain.setTargetAtTime(w, t, 1.2)
    amb.windLp.frequency.setTargetAtTime(rnd(320, 800), t, 1.5)
  }
  if (!night && t > amb.nextBird) {
    const [lo, hi] = AUDIO.ambience.birdEvery
    amb.nextBird = t + rnd(lo, hi)
    if (voice(1, 0.5)) birdSong(now())
  }
  amb.crickets.gain.setTargetAtTime(night ? AUDIO.ambience.cricket : 0, t, 1)
}
