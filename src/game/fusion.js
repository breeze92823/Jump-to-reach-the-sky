// Fusion Machine rules (config FUSION): FUSION.need brainrots of the same species
// and variant (from your base and your hands) make one of the next variant after a
// real-time build. The 3D machine (hub/machines.js) runs the job and its show; this
// file only answers what can be fused, for how much and how long.
import { CREATURES, FUSION, VARIANTS } from '../config.js'
import { ascEffect, eventFx, game, incomeOf } from './state.js'

export const VARIANT_ORDER = Object.keys(VARIANTS)
export const nextVariant = (v) => VARIANT_ORDER[VARIANT_ORDER.indexOf(v) + 1] ?? null
export const fusionUnlocked = () => game.rebirths >= FUSION.unlock.rebirths

// Only plain lane brainrots fuse (reward ones carry their own income).
const fusable = (b) => b && !b.income && CREATURES[b.species] && !CREATURES[b.species].reward && nextVariant(b.variant)

// Every species + variant you own at least `min` of: [{ species, variant, to, count }],
// the ones you can fuse first, then by what the result earns.
export function fusionGroups(min = 2) {
  const tally = new Map()
  const add = (b) => {
    if (!fusable(b)) return
    const key = `${b.species}|${b.variant}`
    const g = tally.get(key) ?? { species: b.species, variant: b.variant, to: nextVariant(b.variant), count: 0 }
    g.count++
    tally.set(key, g)
  }
  for (let i = 0; i < game.slotsUnlocked; i++) add(game.slots[i])
  for (const c of game.carried) add(c)
  return [...tally.values()]
    .filter((g) => g.count >= min)
    .sort((a, b) => (b.count >= FUSION.need) - (a.count >= FUSION.need) || incomeOf({ species: b.species, variant: b.to }) - incomeOf({ species: a.species, variant: a.to }))
}

export function fusionPrice(species, to) {
  const s = FUSION.steps[to]
  return Math.round(Math.max(s.min, incomeOf({ species, variant: to }) * s.seconds) * eventFx.fuseFee)
}
// Build time; the Ascended Shop's Fast Fusion and the Golden Machine event shorten it.
export const fusionMinutes = (to) => Math.round(FUSION.steps[to].minutes * Math.max(0.2, 1 - ascEffect('fastFusion')) * eventFx.fuseTime * 10) / 10

// Where the inputs come from: hands first (top of the stack down), then base pedestals.
// [{ from: 'hand' | 'slot', i }], or null when there are not enough.
export function fusionSources(species, variant) {
  const out = []
  for (let i = game.carried.length - 1; i >= 0 && out.length < FUSION.need; i--) {
    const c = game.carried[i]
    if (fusable(c) && c.species === species && c.variant === variant) out.push({ from: 'hand', i })
  }
  for (let i = game.slotsUnlocked - 1; i >= 0 && out.length < FUSION.need; i--) {
    const s = game.slots[i]
    if (fusable(s) && s.species === species && s.variant === variant) out.push({ from: 'slot', i })
  }
  return out.length >= FUSION.need ? out : null
}

// The running job: 0..1 progress, seconds left, done.
export function fusionState(now = Date.now()) {
  const f = game.fusion
  if (!f) return null
  const left = Math.max(0, (f.at - now) / 1000)
  return { ...f, left, progress: f.ms > 0 ? Math.min(1, 1 - (left * 1000) / f.ms) : 1, done: left <= 0 }
}
