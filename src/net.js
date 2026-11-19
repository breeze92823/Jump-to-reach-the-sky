// Colyseus link to the game server (Jump-to-reach-the-sky-backend, room "world").
//
// What the server does for this client:
//  - A base: every player in the room gets a different one of the hub's HUB.plots.count bases (the
//    room holds exactly that many players). Its `seat` arrives with the first answer, before the hub
//    is built, and config.js setLocalBase() makes it the player's own.
//  - The save: a signed-in player's progress lives on the server (Mongo). It is read once at boot
//    (`startNet`, main.js waits for it): `progress` is loaded over the local copy, `noProgress`
//    (new account) keeps the local state and uploads it, `serverError` (the save could not be read)
//    plays on the local copy with server saving OFF so the stored save is never overwritten. From
//    then on state.js's saves are forwarded (`saveHooks`), at most every NET.saveEvery s. Guests
//    (not signed in to Bloxity) are never saved by the server: they keep the localStorage copy.
//  - The Daily Reward clock (game/daily.js), on the server's clock for signed-in players.
//  - The two hub leaderboards (hub/leaders.js).
// Never throws and never blocks play for long: with no server (or an unreachable one) the game runs
// on the local save and keeps trying to connect.
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import { authState, canResolveServer, getPfp, launchRoomId, locateRoom, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { game, saveHooks, setSaveOwner, snapshot, toast, wipeHooks } from './game/state.js'

export const net = {
  room: null,
  connected: false,
  hydrated: false, // the server's answer for this identity arrived: saving is allowed
  seat: null, // this player's base (backend PlayerState.seat), null until the server said
  offset: 0, // ms: the server's clock minus this device's
  dailyKnown: false, // the server sent this signed-in player's Daily Reward clock
  dailyCooldownMs: 0,
  boards: null, // { totalEarned: [{ name, value }], jumpPower: [...] }
  ranks: null, // { totalEarned: n | null, jumpPower: n | null }
  boardsRev: 0, // bumped whenever boards/ranks change
  get userId() {
    return sentId
  },
}

export const hasServer = () => !!(SERVER_URL || canResolveServer())
// The server's clock, which the Daily Reward countdown follows.
export const serverNow = () => Date.now() + net.offset

// --- Identity ----------------------------------------------------------------
// Signed-in players use their Bloxity id; everyone else a per-browser guest id (never saved on the
// server). Dev mode (no SDK) plays as a per-browser signed-in dev id, so a local server with Mongo
// keeps its progress across reloads. Only these ids are stored in the browser (progress aside).
function storedId(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const rand = () => Math.random().toString(36).slice(2, 8)
const GUEST = storedId('jump-sky.guest', () => `guest-${rand()}`)
const DEV = DEV_MODE ? storedId('jump-sky.dev', () => `dev-${rand()}`) : ''

function identity() {
  if (DEV) return { userId: DEV, username: `Dev ${DEV.slice(4)}` }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player') }
}

let sentId = '' // identity the server currently attributes saves to
let loadedId = '' // identity whose progress this tab has loaded (or adopted)
const isGuest = () => sentId.startsWith('guest-')
// True once the server runs this player's Daily Reward clock (signed in and the clock arrived).
export const accountDaily = () => net.dailyKnown && !isGuest()

// --- Saving ------------------------------------------------------------------
let lastSaved = ''
let savedAt = 0

// The wire shape of a snapshot (backend sanitize.ts): `t` is `lastSeen`; the Daily Reward clock and
// the local-only tag stay out (the server owns the clock).
function wire(snap) {
  const { t, uid, dailyDay, dailyAt, ...rest } = snap
  return { ...rest, lastSeen: t }
}

function pushSave(snap, urgent = false) {
  if (!net.connected || !net.hydrated || isGuest()) return
  const body = wire(snap)
  const { lastSeen, ...rest } = body // `lastSeen` changes every save; it alone is not a change
  const key = JSON.stringify(rest)
  if (key === lastSaved) return
  if (!urgent && performance.now() - savedAt < NET.saveEvery * 1000) return
  lastSaved = key
  savedAt = performance.now()
  send('saveProgress', body)
}
saveHooks.push((snap, urgent) => pushSave(snap, urgent))
// Dev wipe (__game.reset()): the server's copy goes back to a new player's too.
wipeHooks.push((fresh) => {
  lastSaved = ''
  pushSave(fresh, true)
})

function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

// --- Server answers ----------------------------------------------------------
let boot = null // { resolve }: startNet()'s promise, until the first answer (or the timeout)
let consumed = false // the first answer was handed to main.js (its progress is in the game state)
let evicted = false // the same account joined from another tab: stay out, don't fight for it

function finishBoot(result) {
  if (!boot) return
  const b = boot
  boot = null
  b.resolve(result)
}

function onAnswer(kind, m) {
  if (typeof m?.seat === 'number') net.seat = m.seat
  if (typeof m?.serverTime === 'number') net.offset = m.serverTime - Date.now()
  if (kind === 'serverError') {
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving to the server is off for this session')
    // Not `consumed`: the stored save was never loaded, so a later answer must never push this
    // tab's state over it (see the !consumed branch below).
    finishBoot({ kind, doc: null, seat: m?.seat, now: serverNow() })
    return
  }
  const doc = kind === 'progress' ? m : null

  // The boot answer: main.js loads it into the game state.
  if (boot) {
    consumed = true
    loadedId = sentId
    net.hydrated = true
    lastSaved = ''
    finishBoot({ kind, doc, seat: m?.seat, now: serverNow() })
    return
  }

  lastSaved = ''
  if (!consumed) {
    // The answer came after the game started without it (slow server): the hub and the state are
    // already built, so a saved progress cannot be loaded now.
    if (kind === 'noProgress') {
      consumed = true
      loadedId = sentId
      net.hydrated = true
      pushSave(snapshot(), true)
    } else {
      net.hydrated = false
      toast('Your saved progress was found but arrived late. Reload the game to continue it (saving to your account is paused until then).', 'info')
    }
    return
  }
  if (loadedId === sentId) {
    // A reconnect under the same identity: this tab is newer than the save, so push it.
    net.hydrated = true
    pushSave(snapshot(), true)
    return
  }
  // Signed in / out after the game started.
  if (kind === 'progress') {
    // That account has a save: start over from it (main.js loads it at boot).
    toast('Loading your account...', 'info')
    setTimeout(() => location.reload(), 600)
    return
  }
  // A new account (or a guest): it adopts what this tab has.
  loadedId = sentId
  setSaveOwner(sentId)
  net.hydrated = true
  pushSave(snapshot(), true)
}

// --- Daily Rewards (game/daily.js) -----------------------------------------------
function applyDaily(v) {
  if (isGuest() || typeof v?.day !== 'number') return // guests keep their clock on this device
  net.dailyKnown = true
  net.dailyCooldownMs = v.cooldownMs ?? net.dailyCooldownMs
  if (typeof v.serverTime === 'number') net.offset = v.serverTime - Date.now()
  game.dailyDay = v.day
  game.dailyAt = v.at
  if (v.reset) game.dailyMilestones = {} // a lapsed streak starts over
}
let dailyWaiter = null
// Asks the server to claim the next Daily Reward day (all: the rest of the week, needs the pass).
// Resolves { ok, count, reason? }; the reward is only granted on ok.
export function requestDailyClaim(all) {
  return new Promise((resolve) => {
    if (!net.connected || !net.hydrated) return resolve({ ok: false, reason: 'offline' })
    if (dailyWaiter) return resolve({ ok: false, reason: 'busy' })
    const timer = setTimeout(() => dailyWaiter?.({ ok: false, reason: 'timeout' }), NET.claimWait * 1000)
    dailyWaiter = (r) => {
      clearTimeout(timer)
      dailyWaiter = null
      resolve(r)
    }
    send('claimDaily', { all: !!all })
  })
}

function onBoards(m) {
  if (!m?.boards) return
  net.boards = m.boards
  net.ranks = m.ranks ?? null
  net.boardsRev++
}

// --- Connection --------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  room.onMessage('progress', (m) => onAnswer('progress', m))
  room.onMessage('noProgress', (m) => onAnswer('noProgress', m))
  room.onMessage('serverError', (m) => onAnswer('serverError', m))
  room.onMessage('daily', applyDaily)
  room.onMessage('dailyResult', (r) => {
    applyDaily(r)
    dailyWaiter?.(r)
  })
  room.onMessage('leaderboard', onBoards)
  room.onLeave((code) => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    updateRoom('')
    dailyWaiter?.({ ok: false, reason: 'offline' })
    if (code === 4000 && !evicted) {
      // Closed by the server on purpose: this account joined from another tab. Don't take it back.
      evicted = true
      toast('Your account is open in another tab. Reload this one to play here.', 'info')
      return
    }
    // Resolve again rather than rejoin the old endpoint: that is how players move off a pod being
    // replaced. Keep trying; play is unaffected meanwhile.
    setTimeout(connect, NET.rejoin * 1000)
  })
  // The server answers (base, progress, daily, leaderboards) once it knows we are listening.
  send('sync')
}

// The ?roomId= this page was opened with (Open Rooms Join / friend invite): tried on the first
// connect only, then normal matchmaking.
let launchRoom = launchRoomId()
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}

// Deployed builds ask the matchmaker on every connect (a new Client per endpoint, each is pinned to
// one pod; hosting.bloxity.io/docs). userId lets it reuse this player's seat on retries; guest/dev
// ids are not Bloxity ids. A room that is full (every base taken) makes the matchmaker's pod fill
// up and a new one start, so a rejected join just resolves again.
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate('world', options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(/^(guest|dev)-/.test(options.userId) ? undefined : options.userId)
  return { room: await new Client(endpoint).joinOrCreate('world', options), relay: relayRoomId }
}

let connecting = false
let retryIn = NET.retry // s: backoff while the matchmaker / server can't be reached
async function connect() {
  if (!hasServer() || connecting || net.connected || evicted) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    setSaveOwner(sentId)
    const options = { ...id, pfp: getPfp() }
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options))
    retryIn = NET.retry
    attach(room)
    // relay~room lets an invited friend join this exact room through its pod's relay (bloxity.js locateRoom).
    updateRoom(relay ? `${relay}~${room.roomId}` : room.roomId)
  } catch (err) {
    console.info(`[net] could not reach the server (retrying in ${retryIn}s); progress is not being saved to it`, err?.message ?? err)
    // A local dev server that is simply not running: don't hold the loading screen for it.
    if (SERVER_URL) finishBoot(null)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

// Signed in / out while connected: save under the old id, then tell the server who we are now.
function onAuth(s) {
  if (!s.ready) return
  if (!net.connected) return void connect()
  const id = identity()
  if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
  pushSave(snapshot(), true) // under the old id, before switching
  net.hydrated = false
  net.dailyKnown = false
  sentId = id.userId
  send('identify', { ...id, pfp: getPfp() })
}

// Starts the connection and resolves with the server's first answer, which main.js loads before it
// builds the hub: { kind: 'progress' | 'noProgress' | 'serverError', doc, seat, now }, or null when
// there is no server, it is unreachable or it took longer than NET.bootWait (the game then plays on
// the local save; a `noProgress` that arrives later still starts saving).
export function startNet() {
  if (!hasServer()) {
    console.info('[net] no server configured; progress is saved in this browser only')
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    boot = { resolve }
    setTimeout(() => finishBoot(null), NET.bootWait * 1000)
    // The first ready call connects; later ones are sign-in / sign-out.
    subscribeAuth(onAuth)
    // No Bloxity answer in time: connect as a guest.
    setTimeout(() => {
      if (!authState.ready && !net.connected) connect()
    }, NET.authWait * 1000)
  })
}
