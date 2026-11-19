// The hub: builds every area and runs what makes it feel alive.
//  - zones: boxes the player's feet can be in (pads, plots, stalls); enter /
//    stay / exit callbacks drive the reactions
//  - proximity labels: floating names fade in as you walk up to things
//  - movement feel: footsteps per surface, jump whoosh + dust (a roaring rush
//    and speed streaks on big jumps), landing thud + dust ring
//  - the game loop pieces: brainrots on the lane, the one you carry, boosts,
//    play time and autosave
// Layout (config HUB): north wall = leaders + auto training (west of the lane),
// shops (east of it); east wall = machines; south wall = the six bases; the
// lane to the sky runs north from the gap in the north wall.
import { Group, Vector3 } from 'three'
import { HUB, TRAINING } from '../config.js'
import { bake, compact } from '../bake.js'
import { player, playerHooks } from '../player.js'
import { label as makeLabel } from '../propkit.js'
import { createEmitter, setParticleDensity, updateParticles } from '../particles.js'
import { addEmitter, setAirflow, sfx, updateAudio } from '../audio/hub.js'
import { getYaw } from '../camera.js'
import { addJump, autosave, game, speedFactor, takePrompts, tickBoosts } from '../game/state.js'
import { buildArena } from './arena.js'
import { createFx } from './fx.js'
import { buildLeaders } from './leaders.js'
import { buildTraining } from './training.js'
import { buildLucky } from './lucky.js'
import { buildShops } from './shops.js'
import { buildMachines } from './machines.js'
import { buildPlots } from './plots.js'
import { buildLane } from './lane.js'
import { createCarry } from './carry.js'
import { buildBrainrots } from './brainrots.js'
import { short } from './paint.js'

// Merges every mesh that never moves into one mesh per material (shadow casters
// and non-casters apart). Animated parts are flagged userData.dynamic and kept
// as they are, with everything under them. ~1300 draw calls -> a few hundred.
function bakeStatic(root) {
  const cast = new Group()
  const still = new Group()
  const picked = []
  const walk = (o) => {
    if (o.userData.dynamic) {
      compact(o)
      return
    }
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) picked.push(o)
    for (const c of o.children) walk(c)
  }
  for (const c of root.children) walk(c)
  root.updateMatrixWorld(true)
  for (const m of picked) (m.castShadow ? cast : still).attach(m)
  for (const [g, shadow] of [[cast, true], [still, false]]) {
    const baked = bake(g, shadow)
    baked.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true
    })
    root.add(baked)
  }
}

export function buildHub(scene, { camera, isNight = () => false }) {
  const root = new Group()
  scene.add(root)
  const fx = createFx(scene, () => player.renderPosition)
  const updaters = []
  const zones = []
  const labels = []

  const ctx = {
    scene: root,
    fx,
    sfx,
    state: game,
    player,
    camera,
    addEmitter,
    carry: null,
    emitter: (opts) => createEmitter(root, opts),
    onUpdate: (fn) => updaters.push(fn),
    // A box the player's feet can be in: { x0, x1, z0, z1, y0, y1, onEnter, onStay(dt), onExit }
    zone(z) {
      const zone = { y0: -1, y1: 3, inside: false, ...z }
      zones.push(zone)
      return zone
    },
    // A floating label that fades in within `near`..`far` m of the camera (far = 0: always shown).
    label(text, height, opts = {}, { near = 0, far = 0 } = {}) {
      const s = makeLabel(text, height, opts)
      s.renderOrder = 5
      if (far) labels.push({ s, near, far })
      return s
    },
  }

  buildArena(root)
  buildLeaders(ctx)
  buildTraining(ctx)
  buildLucky(ctx)
  buildShops(ctx)
  buildMachines(ctx)
  const carry = createCarry(ctx)
  ctx.carry = carry
  buildPlots(ctx)
  buildLane(ctx)
  bakeStatic(root)
  const brainrots = buildBrainrots(ctx, carry) // after baking: these come and go

  // Every manual jump trains a little jump power too.
  playerHooks.jump = () => {
    const gain = addJump(TRAINING.jumpGain)
    const p = player.position
    fx.floatText(`+${short(gain)}`, p.x + 0.8, p.y + 2.2, p.z, { color: '#5fd0ff', stroke: '#0b2350', size: 0.55, rise: 1.6, life: 0.9, icon: 'jump' })
  }

  // --- Movement feel ---------------------------------------------------------------
  let wasGrounded = true
  let airVy = 0
  let stride = 0
  let trail = 0
  const onPlot = (x, z) => {
    const p = HUB.plots
    const pitch = p.width + p.gap
    const cx = (p.local - (p.count - 1) / 2) * pitch
    if (z < p.front || z > p.front + p.depth || Math.abs(x - cx) > p.width / 2) return null
    return Math.abs(x - cx) < 2 ? 'path' : 'wood'
  }
  function feel(dt) {
    const p = player.position
    const speed = Math.hypot(player.velocity.x, player.velocity.z)
    if (player.grounded) {
      if (!wasGrounded) {
        const impact = -airVy
        if (impact > 3) {
          sfx.land(impact)
          if (impact > 7) {
            const k = Math.min(1, impact / 40)
            fx.burst(p.x, p.y + 0.1, p.z, { spread: 'ring', count: 14 + k * 26, colors: ['#f4ffe8', '#c8f5a8'], speed: [3 + k * 4, 6 + k * 8], life: [0.3, 0.55 + k * 0.4], size: [0.35, 0.6 + k * 0.5], drag: 5, grow: 1.6 })
            fx.ring(p.x, p.y + 0.06, p.z, { color: '#ffffff', r0: 0.3, r1: 2.4 + k * 5, life: 0.4 + k * 0.3 })
          }
        }
        stride = 0
      }
      if (speed > 1) {
        stride += speed * dt
        const step = speed > 11 ? 2.6 : 2.1
        if (stride > step) {
          stride -= step
          const surface = game.level > 0 ? 'grass' : p.y > 4 ? 'wood' : onPlot(p.x, p.z) ?? (game.onPad ? 'pad' : 'grass')
          sfx.step(surface, speed)
          if (speed > 11) fx.burst(p.x, p.y + 0.1, p.z, { count: 3, colors: ['#e8ffd8'], speed: [0.5, 1.5], up: 1, life: [0.3, 0.5], size: [0.25, 0.4], drag: 3, grow: 1.8 })
        }
      }
    } else {
      if (wasGrounded && player.velocity.y > 3 && !player.hopping) {
        const vy = player.velocity.y
        if (vy > 12) sfx.bigJump(vy)
        else sfx.jump()
        const k = Math.min(1, vy / 40)
        fx.burst(p.x, p.y + 0.1, p.z, { spread: 'disc', count: 8 + k * 24, colors: ['#ffffff', '#d8ffd0'], speed: [1.5 + k * 3, 3 + k * 6], life: [0.25, 0.45 + k * 0.3], size: [0.3, 0.5 + k * 0.4], drag: 4, grow: 1.5 })
        if (vy > 12) fx.ring(p.x, p.y + 0.06, p.z, { color: '#bfe6ff', r0: 0.4, r1: 2 + k * 4, life: 0.4 })
      }
      airVy = player.velocity.y
      // Speed streaks while flying fast.
      const v = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z)
      if (v > 16) {
        trail -= dt
        if (trail <= 0) {
          trail = 0.03
          fx.burst(p.x + (Math.random() - 0.5) * 1.2, p.y + 0.4 + Math.random() * 1.4, p.z + (Math.random() - 0.5) * 1.2, { count: 1, colors: ['#ffffff', '#cfefff'], speed: [0.1, 0.3], life: [0.25, 0.45], size: [0.3, 0.55], drag: 6 })
        }
      }
    }
    setAirflow(player.grounded ? 0 : Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z))
    wasGrounded = player.grounded
  }

  function updateZones(dt) {
    const p = player.position
    for (const z of zones) {
      const inside = p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 && p.y <= z.y1
      if (inside && !z.inside) z.onEnter?.()
      else if (!inside && z.inside) z.onExit?.()
      if (inside) z.onStay?.(dt)
      z.inside = inside
    }
  }

  const tmp = new Vector3()
  function updateLabels() {
    const c = camera.position
    for (const l of labels) {
      if (!l.s.parent) continue
      const wp = l.s.getWorldPosition(tmp)
      const d = Math.hypot(wp.x - c.x, wp.y - c.y, wp.z - c.z)
      const a = 1 - Math.min(1, Math.max(0, (d - l.near) / (l.far - l.near)))
      l.s.material.opacity = a
      l.s.visible = a > 0.01
    }
    // Drop labels whose sprite was replaced (relabelled pads, slots, skips).
    for (let i = labels.length - 1; i >= 0; i--) if (!labels[i].s.parent) labels.splice(i, 1)
  }

  let elapsed = 0
  let prompt = null
  return {
    state: game,
    carry,
    // The interaction prompt offered this frame (closest wins), for the HUD.
    get prompt() {
      return prompt
    },
    brainrots,
    drop: () => brainrots.drop(),
    sell: () => carry.sell(),
    setDensity(d) {
      setParticleDensity(d)
      fx.setDensity(d)
    },
    update(dt, viewportHeight) {
      elapsed += dt
      game.playtime += dt
      tickBoosts(dt)
      player.speedMult = speedFactor()
      updateZones(dt)
      feel(dt)
      for (const fn of updaters) fn(elapsed, dt)
      brainrots.update(elapsed, dt)
      carry.update(elapsed, dt)
      updateLabels()
      fx.update(dt, viewportHeight)
      updateParticles(elapsed, viewportHeight)
      updateAudio(dt, player.renderPosition, camera, getYaw(), isNight())
      prompt = takePrompts()
      autosave(dt)
    },
  }
}
