// The game's state and rules: money, jump power, rebirths, the base's slots,
// unlocked training pads, bought wall skips, perks and timed boosts, the index
// of brainrots found. Everything is saved (autosave + on leave) to localStorage and, for a
// signed-in player, the game server (net.js), and restored with the money the base earned while away.
// Prices are money only (no premium currency anywhere in the game).
import { ASCENDED, BASE_LEVELS, CREATURES, DAILY, ECONOMY, INDEX_BONUS, ITEMS, JUMP, LANE, LUCKY_BLOCKS, REBIRTH, SAVE, STORE, TRAINING, UPGRADES, VARIANTS, ZONES, jumpHeight } from '../config.js'

export const game = {
  money: ECONOMY.startMoney,
  totalEarned: 0,
  jumpPower: ECONOMY.startJump,
  rebirths: 0,
  slotsUnlocked: ECONOMY.slots.start,
  slots: new Array(ECONOMY.slots.total).fill(null), // { species, variant, bank } | null
  pads: TRAINING.pads.map((p) => p.price === 0), // unlocked training pads
  skips: [], // skips[i]: the Skip Wall up to zone i is owned
  bestZone: 0,
  index: {}, // species -> { variant: true }
  perks: { vip: false, jump15: false, starter: false },
  boosts: {}, // id -> seconds left (ticks only while playing)
  smartJump: false,
  dailyAt: 0, // ms timestamp of the last daily claim
  dailyDay: 0, // days claimed in the current streak (the week cycle is dailyDay % 7)
  dailyPass: false, // Claim All Pass
  dailyMilestones: {}, // streak day -> claimed
  carried: [], // [{ species, variant, income? }] held over the head, bottom first
  speed: UPGRADES.speed.start, // Speed upgrade level
  carryMax: UPGRADES.carry.start, // brainrots you can carry at once
  luckyJumps: false, // Lucky Jumps unlocked
  items: { box: true }, // owned back items
  equipped: 'box',
  luckyBlocks: { lucky: 0, super: 0, rainbow: 0 }, // unopened Lucky Blocks by tier
  crystals: 0, // Jump Crystals picked up (every LUCKY_BLOCKS.freeEvery gives a free block)
  fusion: null, // Fusion Machine job { species, from, to, at (ms it is done), ms (its length) } | null
  ascended: {}, // Ascended Shop perk id -> level bought (0 / missing = none)
  baseLevel: 0, // Base Level built (opens the lane walls up to ZONES[baseLevel])
  baseBuild: null, // the level being built { level, at (ms done), ms } | null
  // Session only (not saved):
  zone: 0, // zone the player is standing in
  level: -1, // lane terrace index under the player (-1 = in the hub)
  playtime: 0, // s played this session
  playtimeClaimed: [],
  onPad: false,
}

// --- Tiny event bus: the world asks the HUD for things (confirm, toast, banner) ---
const listeners = new Map()
export const bus = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, [])
    listeners.get(evt).push(fn)
  },
  emit(evt, data) {
    for (const fn of listeners.get(evt) ?? []) fn(data)
  },
}
export const toast = (text, kind = 'info') => bus.emit('toast', { text, kind })

// --- Interaction prompts ("E  Pick Up") -----------------------------------------------
// World code offers prompts every frame while the player is in range; the HUD
// shows the closest one and runs its action on E / a tap. Cleared each frame.
const offers = []
export function offerPrompt(p) {
  offers.push(p) // { key: 'E', text, sub, x, y, z, action, d (distance, smaller wins) }
}
export function takePrompts() {
  let best = null
  for (const p of offers) if (!best || (p.d ?? 0) < (best.d ?? 0)) best = p
  offers.length = 0
  return best
}

// --- Brainrot values ---------------------------------------------------------------------
// Reward brainrots (Absolute) carry their own fixed base income (a share of your best).
export const creatureInfo = (species) => CREATURES[species]
export function baseIncome(item) {
  if (item.income) return item.income
  return (CREATURES[item.species]?.income ?? 0) * (VARIANTS[item.variant]?.mult ?? 1)
}
// Best base income among the brainrots you own (base + hands); the "of BEST" rewards scale from it.
export function bestIncome() {
  let best = 0
  for (const s of game.slots) if (s) best = Math.max(best, baseIncome(s))
  for (const c of game.carried) best = Math.max(best, baseIncome(c))
  return Math.max(best, CREATURES.cactuzzo.income)
}
// A reward brainrot worth `share` of your best (plus its variant on top).
export function rewardBrainrot(species, variant, share) {
  const income = Math.max(10, Math.round(bestIncome() * share * (VARIANTS[variant]?.mult ?? 1)))
  return { species, variant, income }
}
export function incomeOf(item) {
  return baseIncome(item) * moneyMult()
}
export const sellValue = (item) => Math.round(incomeOf(item) * ECONOMY.sellSeconds)
export function totalIncome() {
  let sum = 0
  for (let i = 0; i < game.slots.length; i++) if (game.slots[i] && i < game.slotsUnlocked) sum += incomeOf(game.slots[i])
  return sum
}

// --- Base Level (config BASE_LEVELS; the core in front of your base runs the show) -------------------
export const BASE_MAX = BASE_LEVELS.levels.length
// The wall into zone i is open once Base Level i is built.
export const wallOpen = (i) => i <= game.baseLevel
// The next level's { level, cost, minutes }, or null at the top.
export function nextBaseLevel() {
  const l = BASE_LEVELS.levels[game.baseLevel]
  return l ? { level: game.baseLevel + 1, ...l } : null
}
// The build in progress: { level, left (s), progress 0..1, done } or null.
export function baseBuildState(now = Date.now()) {
  const b = game.baseBuild
  if (!b) return null
  const left = Math.max(0, (b.at - now) / 1000)
  return { level: b.level, left, progress: b.ms > 0 ? Math.min(1, 1 - (left * 1000) / b.ms) : 1, done: left <= 0 }
}
// Pay and start building the next level; false if busy, maxed or too poor.
export function startBaseBuild() {
  const n = nextBaseLevel()
  if (!n || game.baseBuild || !spend(n.cost)) return false
  const ms = n.minutes * 60_000
  game.baseBuild = { level: n.level, at: Date.now() + ms, ms }
  save(true)
  return true
}
// A finished build becomes the Base Level (the core calls this when the timer is up).
export function finishBaseBuild() {
  const b = baseBuildState()
  if (!b || !b.done) return 0
  game.baseLevel = b.level
  game.baseBuild = null
  save(true)
  return game.baseLevel
}

// --- Hub event effects (hub/events.js sets these while an event runs, config EVENTS) -----------------
export const eventFx = { luck: 1, crystalGain: 1, crystalRespawn: 1, fuseFee: 1, fuseTime: 1, luckyPrice: 1 }

// --- Ascended Shop perks (config ASCENDED) ---------------------------------------------------
export const ascendedUnlocked = () => game.rebirths >= ASCENDED.unlock.rebirths
export const ascPerk = (id) => ASCENDED.perks.find((p) => p.id === id)
export const ascLevel = (id) => game.ascended[id] || 0
// Price of the next level, or null when maxed.
export function ascPrice(id) {
  const p = ascPerk(id)
  const lv = ascLevel(id)
  return lv >= p.max ? null : Math.round(p.base * p.growth ** lv)
}
// Buys the next level (unlocked, affordable, not maxed); returns the new level or 0.
export function buyAscended(id) {
  const price = ascPrice(id)
  if (!ascendedUnlocked() || price === null || !spend(price)) return 0
  game.ascended[id] = ascLevel(id) + 1
  save()
  return game.ascended[id]
}
// The effect of `levels` of a perk (default: what you own), for the effect lines.
export const ascEffect = (id, levels = ascLevel(id)) => levels * (ascPerk(id).per ?? 1)

// --- Multipliers ---------------------------------------------------------------------------
const boostOn = (id) => (game.boosts[id] ?? 0) > 0
// Rebirth n's multipliers (past the table they keep growing).
export function rebirthMults(n = game.rebirths) {
  const last = REBIRTH.money.length - 1
  if (n <= last) return { money: REBIRTH.money[n], jump: REBIRTH.jump[n] }
  return { money: Math.round(REBIRTH.money[last] * 1.25 ** (n - last)), jump: Math.round(REBIRTH.jump[last] * 1.7 ** (n - last)) }
}
// Index: brainrot + variant entries found, and the money bonus they unlock.
export function indexFound() {
  let n = 0
  for (const s in game.index) if (CREATURES[s]) n += Object.keys(game.index[s]).filter((v) => VARIANTS[v]).length
  return n
}
export const indexBonus = () => Math.floor(indexFound() / INDEX_BONUS.every) * INDEX_BONUS.pct
export function moneyMult() {
  let m = rebirthMults().money * (1 + indexBonus()) * (1 + game.baseLevel * BASE_LEVELS.income)
  if (game.perks.vip) m *= STORE.vip.money
  if (boostOn('money2')) m *= STORE.boosts.money2.money
  return m
}
export function trainMult() {
  let m = rebirthMults().jump
  if (game.perks.jump15) m *= STORE.jump15.jump
  if (game.perks.vip) m *= STORE.vip.jump
  if (boostOn('train2')) m *= STORE.boosts.train2.jump
  if (boostOn('jump30')) m *= STORE.boosts.jump30.jump
  return m * (1 + ascEffect('mastery'))
}
export const luckMult = () => (boostOn('lucky') ? STORE.boosts.lucky.luck : 1) * (1 + ascEffect('golden')) * eventFx.luck

// Every jump / training hop: base + the equipped item's bonus, times the
// multipliers; Lucky Jumps sometimes multiply it (the HUD celebrates via the bus).
export const itemBonus = () => ITEMS.find((i) => i.id === game.equipped)?.jump ?? 0
export function addJump(base) {
  let gain = Math.max(1, Math.round((base + itemBonus()) * trainMult()))
  if (game.luckyJumps && Math.random() < UPGRADES.lucky.chance) {
    gain *= UPGRADES.lucky.mult
    bus.emit('lucky', gain)
  }
  game.jumpPower += gain
  return gain
}

// --- Upgrades ------------------------------------------------------------------------------
// Walk / sprint speed factor from the Speed level.
export const speedFactor = () => 1 + (game.speed - UPGRADES.speed.start) * UPGRADES.speed.perLevel
// Price of `n` more Speed levels from the current one (premium = the replaced-premium bundle).
export function speedPrice(n, premium = false) {
  const u = UPGRADES.speed
  let sum = 0
  for (let i = 0; i < n; i++) sum += u.base * u.growth ** (game.speed + i - u.start)
  return Math.round(sum * (premium ? u.premium : 1))
}
export function carryPrice(n, premium = false) {
  const u = UPGRADES.carry
  let sum = 0
  for (let i = 0; i < n; i++) sum += u.base * u.growth ** (game.carryMax + i - u.start)
  return Math.round(sum * (premium ? u.premium : 1))
}
export function earn(amount) {
  game.money += amount
  game.totalEarned += amount
}
export function canAfford(price) {
  return game.money >= price
}
export function spend(price) {
  if (game.money < price) return false
  game.money -= price
  return true
}

// Jump height the player gets now, before any Smart Jump cap.
export const currentJumpHeight = () => jumpHeight(game.jumpPower)
export { jumpHeight, JUMP }

// --- Prices ---------------------------------------------------------------------------------
export const rebirthReq = (n = game.rebirths) => Math.round(REBIRTH.req.base * REBIRTH.req.growth ** n)
export const rebirthSkipPrice = (n = game.rebirths) => Math.round(REBIRTH.skip.base * REBIRTH.skip.growth ** n)
export const skipPrice = (i) => Math.round(ECONOMY.skipWall.base * ECONOMY.skipWall.growth ** (i - 1))
export function slotPrice() {
  const k = game.slotsUnlocked - ECONOMY.slots.start
  return k < ECONOMY.slots.prices.length ? ECONOMY.slots.prices[k] : null
}

// Rebirth: needs the Jump Power requirement and resets Jump Power. skip = pay
// money instead and keep your Jump Power.
export function doRebirth(skip = false) {
  if (skip) {
    if (!spend(rebirthSkipPrice())) return false
  } else {
    if (game.jumpPower < rebirthReq()) return false
    game.jumpPower = 0
    game.money = 0
  }
  game.rebirths++
  save(true)
  return true
}

// --- Variants ----------------------------------------------------------------------------------
export function rollVariant(luck = 1) {
  const l = luck * luckMult()
  let total = 0
  for (const [name, v] of Object.entries(VARIANTS)) total += name === 'normal' ? v.weight : v.weight * l
  let r = Math.random() * total
  for (const [name, v] of Object.entries(VARIANTS)) {
    r -= name === 'normal' ? v.weight : v.weight * l
    if (r <= 0) return name
  }
  return 'normal'
}

// Marks a brainrot as found; true the first time this species + variant is seen.
export function discover(species, variant) {
  game.index[species] ??= {}
  if (game.index[species][variant]) return false
  game.index[species][variant] = true
  return true
}

// Jump power gift from crystals / daily: a share of the next zone's requirement.
export function nextZoneReq(from = game.bestZone) {
  return ZONES[Math.min(ZONES.length - 1, from + 1)].req
}
// --- Lucky Blocks ------------------------------------------------------------------------------
// Price: seconds of your base income (a 2x Money boost does not raise it), at least the tier's min.
export function luckyPrice(tier) {
  const t = LUCKY_BLOCKS.tiers[tier]
  const income = totalIncome() / ((game.boosts.money2 ?? 0) > 0 ? STORE.boosts.money2.money : 1)
  return Math.round(Math.max(t.min, income * t.seconds) * eventFx.luckyPrice)
}
export const luckyOwned = () => Object.values(game.luckyBlocks).reduce((a, n) => a + (n || 0), 0)
// A Jump Crystal was picked up: true when it completed a free Lucky Block.
export function countCrystal() {
  game.crystals++
  if (game.crystals % LUCKY_BLOCKS.freeEvery) return false
  game.luckyBlocks.lucky = (game.luckyBlocks.lucky || 0) + 1
  return true
}

export const crystalGain = (zoneIndex) => Math.max(3, Math.round(ZONES[Math.min(ZONES.length - 1, zoneIndex + 1)].req * LANE.crystalGain))

// --- Boost clock --------------------------------------------------------------------------------
export function addBoost(id, minutes) {
  game.boosts[id] = (game.boosts[id] ?? 0) + minutes * 60
}
export function tickBoosts(dt) {
  for (const id in game.boosts) {
    game.boosts[id] -= dt
    if (game.boosts[id] <= 0) delete game.boosts[id]
  }
}

// --- Save / load ------------------------------------------------------------------------------------
// The save lives in localStorage (guests, offline, a cache) and, for a signed-in player, on the game
// server too (net.js: the server's copy is loaded at boot and wins). `saveHooks` are how net.js sees
// every save; `owner` tags the local copy with the account it belongs to.
const SAVED = ['money', 'totalEarned', 'jumpPower', 'rebirths', 'slotsUnlocked', 'slots', 'pads', 'skips', 'bestZone', 'index', 'perks', 'boosts', 'smartJump', 'dailyAt', 'dailyDay', 'dailyPass', 'dailyMilestones', 'carried', 'speed', 'carryMax', 'luckyJumps', 'items', 'equipped', 'luckyBlocks', 'crystals', 'fusion', 'ascended', 'baseLevel', 'baseBuild']
const pick = () => {
  const out = {}
  for (const k of SAVED) out[k] = game[k]
  return out
}
const FRESH = JSON.parse(JSON.stringify(pick())) // a new player's state, for wipe()
export const saveHooks = [] // fn(snapshot, urgent): called after every save
export const wipeHooks = [] // fn(freshSnapshot): called by resetSave()
let owner = ''
export const setSaveOwner = (id) => (owner = id || '')

// What is saved: the SAVED fields plus `t` (when) and `uid` (whose, see ownsLocal).
export function snapshot() {
  return { t: Date.now(), uid: owner, ...pick() }
}
// A local save belongs to whoever played last: it is used unless it is clearly another real account's.
const isGuestId = (id) => id.startsWith('guest-')
const ownsLocal = (saved, now) => !saved || !now || saved === now || isGuestId(saved) || isGuestId(now)

// `urgent` skips the server's save throttle (tab hidden / closing, rebirth).
export function save(urgent = false) {
  if (wiped) return
  const out = snapshot()
  try {
    localStorage.setItem(SAVE.key, JSON.stringify(out))
  } catch {
    // Storage blocked or full: this session only.
  }
  for (const fn of saveHooks) {
    try {
      fn(out, urgent)
    } catch (err) {
      console.warn('[save] hook failed', err)
    }
  }
}

// Restores the save; returns the money the base earned while away (already banked on the pads).
// `serverDoc` = the account's saved progress from the server (net.js; wins over the local copy),
// `now` = the server's clock when it gave one, `uid` = this session's account id.
export function load(serverDoc = null, now = Date.now(), uid = '') {
  let data = null
  if (serverDoc) data = { ...serverDoc, t: serverDoc.lastSeen }
  else {
    try {
      data = JSON.parse(localStorage.getItem(SAVE.key) || 'null')
    } catch {
      data = null
    }
    if (data && !ownsLocal(data.uid, uid)) data = null
  }
  if (!data) return 0
  for (const k of SAVED) {
    if (data[k] === undefined) continue
    if (Array.isArray(game[k])) {
      const src = data[k]
      for (let i = 0; i < game[k].length; i++) if (src[i] !== undefined) game[k][i] = src[i]
      if (k === 'skips' || k === 'carried') game[k] = [...src]
    } else if (game[k] && typeof game[k] === 'object') Object.assign(game[k], data[k])
    else game[k] = data[k]
  }
  // Drop anything that no longer exists (renamed species, removed variants).
  game.slots = game.slots.map((s) => (s && CREATURES[s.species] && VARIANTS[s.variant] ? { bank: 0, ...s } : null))
  if (data.carrying && !data.carried) game.carried = [data.carrying] // old saves held one
  game.carried = game.carried.filter((c) => c && CREATURES[c.species] && VARIANTS[c.variant]).slice(0, game.carryMax)
  if (!ITEMS.some((i) => i.id === game.equipped && game.items[i.id])) game.equipped = 'box'
  game.items.box = true
  for (const t in LUCKY_BLOCKS.tiers) game.luckyBlocks[t] = Math.max(0, Math.floor(Number(game.luckyBlocks[t]) || 0))
  for (const t in game.luckyBlocks) if (!LUCKY_BLOCKS.tiers[t]) delete game.luckyBlocks[t]
  game.crystals = Math.max(0, Math.floor(Number(game.crystals) || 0))
  // Base Level: saves from before it existed keep every wall they had already passed open.
  if (data.baseLevel === undefined) game.baseLevel = game.bestZone
  game.baseLevel = Math.max(0, Math.min(BASE_LEVELS.levels.length, Math.floor(Number(game.baseLevel) || 0)))
  const bb = game.baseBuild
  if (!bb || bb.level !== game.baseLevel + 1 || !Number.isFinite(bb.at) || !Number.isFinite(bb.ms)) game.baseBuild = null
  for (const id in game.ascended) {
    const p = ASCENDED.perks.find((q) => q.id === id)
    if (!p) delete game.ascended[id]
    else game.ascended[id] = Math.max(0, Math.min(p.max, Math.floor(Number(game.ascended[id]) || 0)))
  }
  const f = game.fusion
  if (!f || !CREATURES[f.species] || !VARIANTS[f.from] || !VARIANTS[f.to] || !Number.isFinite(f.at) || !Number.isFinite(f.ms)) game.fusion = null
  game.pads = game.pads.map((v, i) => v || TRAINING.pads[i].price === 0)
  // Offline income, banked onto each slot's collect pad.
  const away = Math.min(ECONOMY.offlineCap + ascEffect('vault') * 3600, Math.max(0, (now - (data.t ?? now)) / 1000))
  let earned = 0
  if (away > 30) {
    for (let i = 0; i < game.slots.length; i++) {
      const s = game.slots[i]
      if (!s || i >= game.slotsUnlocked) continue
      const add = incomeOf(s) * away * ECONOMY.offlineRate
      s.bank += add
      earned += add
    }
  }
  return earned
}

let saveIn = SAVE.every
export function autosave(dt) {
  saveIn -= dt
  if (saveIn > 0) return
  saveIn = SAVE.every
  save()
}
window.addEventListener('beforeunload', () => save(true))
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(true)
})

// Dev: wipe the save (console: __game.reset()); nothing is saved again until reload.
let wiped = false
export function resetSave() {
  wiped = true
  try {
    localStorage.removeItem(SAVE.key)
  } catch {
    // Ignore.
  }
  for (const fn of wipeHooks) fn({ t: Date.now(), ...FRESH }) // the server's copy too
}
