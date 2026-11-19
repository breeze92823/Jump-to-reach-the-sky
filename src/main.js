import { ACESFilmicToneMapping, Clock, NeutralToneMapping, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import * as THREE from 'three' // handed to the portal's chat-bubble helper
import { CAMERA, graphicsPreset, PLAYER_DIMS, RENDER, setLocalBase } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { buildHub } from './hub/index.js'
import { installAudio, setMusicVolume, setSuspended, setVolume } from './audio/core.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { createEmotes } from './avatar/emotes.js'
import { earn, game, load as loadSave, resetSave } from './game/state.js'
import { net, startNet } from './net.js'
import { createHud } from './ui/hud.js'
import { short } from './hub/paint.js'
import { mountBackItem } from './hub/items.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> ground + sky + lighting,
// player body -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let hub = null

// Settings come from the portal's settings menu (or their defaults offline).
let chatEnabled = true
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'music_volume') setMusicVolume(value / 100)
  else if (key === 'enable_chat') chatEnabled = value
  else if (key === 'background_transparency') document.documentElement.style.setProperty('--panel-alpha', String(value))
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    hub?.setDensity(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()
installAudio() // the AudioContext starts on the first tap / key (autoplay rules)
const serverAnswer = startNet() // connects while the scene loads; the save and the base come from it

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = RENDER.toneMapping === 'neutral' ? NeutralToneMapping : ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // clouds + the far plain
// The server's answer (null: no server / too slow) gives this player's base and, for a signed-in
// account, the saved progress. Both are needed before the hub is built: it builds the player's
// own base and shows what they own.
bloxity.loadingStep('Loading your progress')
const boot = await serverAnswer
if (boot) setLocalBase(boot.seat)
const awayEarnings = loadSave(boot?.doc ?? null, boot?.now, net.userId)
bloxity.loadingStep('Building the hub')
hub = buildHub(scene, { camera, isNight: () => lighting.isNight() })
hub.setDensity(preset.particles)
createPlayerBody()
syncYawToPlayer()

// --- HUD ------------------------------------------------------------------------
const teleport = (x, y, z, facing = player.facing) => {
  resetPlayer({ x, y, z }, facing)
  syncYawToPlayer()
}
const hud = createHud({ renderer, camera, hub, teleport })
if (awayEarnings > 1) setTimeout(() => hud.toast(`Welcome back! Your brainrots earned $${short(awayEarnings)} while you were away.`, 'good'), 1500)

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads
const backItem = mountBackItem(playerGroup) // the equipped Items Shop item, worn on the back

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// --- Portal features: ad breaks, chat bubbles, emotes ------------------------------
// Boxity can start an ad break at any moment: the loop freezes (no physics, no clock) and the sound
// is muted until it ends.
let adBreak = false
bloxity.onAdBreak((on) => {
  adBreak = on
  setSuspended(on)
})
// Chat is Boxity's own UI; the game only shows the local player's bubble over their head (the other
// players are not drawn yet). enable_chat switches the bubbles off.
let bubble = null
bloxity.onChatMessage((m) => {
  if (!chatEnabled || !m?.isLocalPlayer) return
  bubble?.remove?.()
  bubble = bloxity.attachChatBubble(THREE, playerGroup, m, PLAYER_DIMS.height + 0.8)
})
// Emotes come from the portal's wheel (a catalogue id); they play on top of the animator and stop
// when the player moves.
const emotes = createEmotes()
bloxity.onEmote(async (id) => emotes.play(await bloxity.loadEmoteClip(id)))

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const elapsed = clock.elapsedTime
  if (adBreak) return // an ad break is playing: nothing moves until it ends

  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  animator?.update(dt, {
    grounded: player.grounded,
    speed: Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: player.velocity.y,
    turn: 0,
    carry: hub.carry.has(),
  })
  emotes.update(avatar, dt, !player.grounded || Math.hypot(player.velocity.x, player.velocity.z) > 0.5)

  backItem.update(elapsed, dt)
  updateCamera(camera, dt)
  world.update(dt, elapsed)
  hub.update(dt, renderer.domElement.height)
  hud.update(dt)
  lighting.update(dt, playerGroup.position)
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  // __game.reset() wipes the save and reloads; __game.earn(1e6) for testing.
  const reset = () => {
    resetSave()
    window.removeEventListener('beforeunload', bloxity.teardown)
    setTimeout(() => location.reload(), 300) // let the server's wipe go out first
  }
  window.__game = { emotes, player, scene, renderer, camera, postfx, hub, hud, game, bodies: bodyCount, toggleMode, teleport, reset, earn }
}
