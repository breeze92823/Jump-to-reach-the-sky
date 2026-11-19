// Hub events (config EVENTS): which event is on, on the SERVER's clock (net.js serverNow) so every
// player in a room sees the same one. Every EVENTS.every minutes a new event starts and runs
// EVENTS.length minutes, taking turns through EVENTS.list. hub/events.js applies the effects
// (state.js eventFx) and the show; the HUD chip and the JOIN EVENT billboard read this file.
import { EVENTS } from '../config.js'
import { serverNow } from '../net.js'

const EVERY = EVENTS.every * 60_000
const LENGTH = EVENTS.length * 60_000
let forced = null // dev / tests: { id, until (ms) }

// The event running now: { def, left (s), ends (ms) } or null.
export function currentEvent(now = serverNow()) {
  if (forced && now < forced.until) return { def: EVENTS.list.find((e) => e.id === forced.id), left: (forced.until - now) / 1000, ends: forced.until }
  const slot = Math.floor(now / EVERY)
  const start = slot * EVERY
  if (now - start >= LENGTH) return null
  return { def: EVENTS.list[slot % EVENTS.list.length], left: (start + LENGTH - now) / 1000, ends: start + LENGTH }
}
// The next one to start: { def, in (s) }.
export function nextEvent(now = serverNow()) {
  const slot = Math.floor(now / EVERY) + 1
  return { def: EVENTS.list[slot % EVENTS.list.length], in: (slot * EVERY - now) / 1000 }
}
export const eventOn = (id) => currentEvent()?.def.id === id

// Dev: run event `id` for `seconds` (console / tests), or stop a forced one with null.
export function forceEvent(id, seconds = 60) {
  forced = id ? { id, until: serverNow() + seconds * 1000 } : null
}

export const clockText = (s) => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
