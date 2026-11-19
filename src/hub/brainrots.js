// Brainrots on the lane: each terrace keeps a few of its zone's species alive
// at random spots. Each one stands there idling under a floating tag (a red
// countdown, its variant, name, rarity and income) until the countdown runs
// out and it vanishes in a puff; a new one pops in elsewhere a moment later.
// Rare variants arrive with a beam of light and a chime.
// Walking into one with empty hands lifts it over your head; with full hands
// "E Swap" trades. Q (or the HUD) drops what you hold back onto the ground.
// Jump Crystals: purple gems on every terrace give a burst of jump power.
import { AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { HUB, LANE, VARIANTS } from '../config.js'
import { LEVELS } from '../game/levels.js'
import { ascLevel, ascPerk, bus, countCrystal, crystalGain, eventFx, creatureInfo, game, incomeOf, offerPrompt, rollVariant, toast } from '../game/state.js'
import { player } from '../player.js'
import { paintFade } from '../textures.js'
import { buildCreature, RARITY_COLORS, SPECIES_NAMES, VARIANT_COLORS, VARIANT_NAMES } from './creatures.js'
import { makeAura } from './aura.js'
import { outlined, short } from './paint.js'

const tmp = new Vector3()
const rand = (a, b) => a + Math.random() * (b - a)

// --- The floating tag: countdown, variant, name, rarity, $/s ------------------------------
export function tagLines(data, timer = null) {
  const info = creatureInfo(data.species)
  const lines = []
  if (timer !== null) lines.push({ text: String(Math.max(0, Math.ceil(timer))), color: '#ff3b3b', size: 1.35 })
  if (data.variant !== 'normal') lines.push({ text: VARIANT_NAMES[data.variant], color: VARIANT_COLORS[data.variant], size: 0.9 })
  lines.push({ text: SPECIES_NAMES[data.species], color: '#ffffff', size: 1 })
  lines.push({ text: info.rarity, color: RARITY_COLORS[info.rarity], size: 0.85 })
  lines.push({ text: `$${short(incomeOf(data))}/s`, color: '#5dff4a', size: 1 })
  return lines
}
export function makeTag(lines, height = 2.1) {
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 300
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.renderOrder = 5
  sprite.scale.set((height * c.width) / c.height, height, 1)
  const paint = (ls) => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    const unit = 52
    const total = ls.reduce((s, l) => s + l.size * unit, 0)
    let y = (c.height - total) / 2
    for (const l of ls) {
      const h = l.size * unit
      outlined(ctx, l.text, c.width / 2, y + h / 2, { size: h * 0.92, fill: l.color, stroke: '#10162a', line: 0.2, maxW: c.width - 16, shadow: false })
      y += h
    }
    tex.needsUpdate = true
  }
  paint(lines)
  return {
    sprite,
    paint,
    dispose() {
      sprite.removeFromParent()
      tex.dispose()
      sprite.material.dispose()
    },
  }
}

// --- Light beams over rare spawns and crystals --------------------------------------------------
const beamGeo = new CylinderGeometry(0.55, 0.9, 1, 16, 1, true).translate(0, 0.5, 0)
let beamTex = null
function beamMaterial(color) {
  beamTex ??= new CanvasTexture(paintFade('#ffffff'))
  return new MeshBasicMaterial({ color, map: beamTex, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, opacity: 0.8 })
}

export function buildBrainrots(ctx, carry) {
  const items = []
  const crystals = []
  const respawns = [] // { level, at }
  const camPos = new Vector3()
  let clock = 0
  const L = HUB.laneHalf

  // A free spot on a terrace: inside the walls, clear of the skip pads and other brainrots.
  function spot(lv) {
    const zMax = lv.i === 0 ? lv.south - 9 : lv.south - 4
    const zMin = lv.north + 7
    for (let tries = 0; tries < 20; tries++) {
      const x = rand(-L + 2.5, L - 2.5)
      const z = rand(zMin, zMax)
      let ok = true
      for (const it of items) if (it.state === 'idle' && Math.hypot(it.x - x, it.z - z) < 4.5) ok = false
      for (const c of crystals) if (Math.hypot(c.x - x, c.z - z) < 3) ok = false
      if (ok) return { x, z }
    }
    return { x: rand(-L + 2.5, L - 2.5), z: rand(zMin, zMax) }
  }

  function addItem(data, c, x, y, z, level, timer, { quiet = false } = {}) {
    c.group.position.set(x, y, z)
    c.group.rotation.y = rand(-0.6, 0.6) // mostly facing the start line
    if (!c.group.parent) ctx.scene.add(c.group)
    const it = { data, c, x, y, z, level, timer, shown: -1, state: 'idle', armed: !quiet, scale: c.group.scale.x, tag: makeTag(tagLines(data, timer)), aura: makeAura(ctx.fx, c), beam: null, beamT: 0, pop: quiet ? 1 : 0 }
    it.tag.sprite.position.set(x, y + c.height * it.scale + 1.35, z)
    ctx.scene.add(it.tag.sprite)
    items.push(it)
    return it
  }

  function spawn(lv, initial = false) {
    const zone = lv.zone
    const species = zone.species[Math.floor(Math.random() * zone.species.length)]
    const variant = rollVariant(zone.luck)
    const data = { species, variant }
    const { x, z } = spot(lv)
    const c = buildCreature(species, variant, Math.floor(Math.random() * 9999))
    const timer = initial ? rand(LANE.despawn[0] * 0.3, LANE.despawn[1]) : rand(LANE.despawn[0], LANE.despawn[1])
    const it = addItem(data, c, x, lv.y, z, lv.i, timer, { quiet: initial })
    it.armed = true
    if (initial) return
    // Pop-in: a puff of cloud, sparkles, a ring and a soft pop.
    c.group.scale.setScalar(0.01)
    ctx.fx.burst(x, lv.y + 0.6, z, { count: 18, colors: ['#ffffff', '#eef6ff'], speed: [1.5, 3.5], up: 1, life: [0.4, 0.8], size: [0.6, 1.0], drag: 3, grow: 1.8 })
    ctx.fx.burst(x, lv.y + 1, z, { sprite: 'sparkle', count: 10, colors: [RARITY_COLORS[creatureInfo(species).rarity], '#ffffff'], speed: [2, 4], life: [0.4, 0.8], size: [0.35, 0.55] })
    ctx.fx.ring(x, lv.y + 0.08, z, { color: '#ffffff', r0: 0.4, r1: 2.6, life: 0.45 })
    ctx.sfx.spawn({ x, y: lv.y, z }, variant)
    if (VARIANTS[variant].mult >= VARIANTS.diamond.mult) {
      it.beam = new Mesh(beamGeo, beamMaterial(VARIANT_COLORS[variant]))
      it.beam.position.set(x, lv.y, z)
      it.beam.scale.set(1, 30, 1)
      ctx.scene.add(it.beam)
      it.beamT = 6
      if (variant === 'rainbow' || variant === 'lava') bus.emit('toast', { text: `A ${VARIANT_NAMES[variant]} ${SPECIES_NAMES[species]} appeared in ${zone.name}!`, kind: 'rare' })
    }
  }

  function removeItem(it) {
    const i = items.indexOf(it)
    if (i >= 0) items.splice(i, 1)
    it.tag.dispose()
    if (it.beam) {
      it.beam.removeFromParent()
      it.beam.material.dispose()
    }
  }

  function vanish(it) {
    const { x, y, z } = it
    ctx.fx.burst(x, y + 0.8, z, { count: 22, colors: ['#ffffff', '#dfe8ff'], speed: [1.5, 3.5], up: 0.8, life: [0.4, 0.8], size: [0.7, 1.1], drag: 3, grow: 1.8 })
    ctx.sfx.despawn({ x, y, z })
    it.state = 'leaving'
    it.leave = 0.3
  }

  // Picking up: the creature flies into the player's hands.
  function pickUp(it) {
    if (!carry.pick(it.data, it.c)) return
    const { x, y, z } = it
    removeItem(it)
    ctx.sfx.pickup({ x, y, z })
    ctx.fx.burst(x, y + 0.6, z, { sprite: 'sparkle', count: 14, colors: ['#ffffff', '#ffe680', RARITY_COLORS[creatureInfo(it.data.species).rarity]], speed: [2, 5], up: 2, life: [0.4, 0.8], size: [0.35, 0.6], gravity: 4 })
    ctx.fx.ring(x, y + 0.08, z, { color: '#ffffff', r0: 0.3, r1: 2.2, life: 0.4 })
    if (it.level >= 0) queueRespawn(it.level, rand(2, 5))
  }

  function queueRespawn(level, delay) {
    respawns.push({ level, at: clock + delay })
  }

  // Put the held creature down at the player's feet (a little in front).
  function drop() {
    const h = carry.release()
    if (!h) return
    const p = player.position
    const x = p.x + Math.sin(player.facing) * 1.6
    const z = p.z + Math.cos(player.facing) * 1.6
    const y = p.y
    const level = game.level
    h.c.group.userData.dropped = true
    carry.fly(h.c, tmp.set(x, y, z), {
      d: 0.3,
      arc: 0.8,
      scale: 1,
      onLand() {
        const it = addItem(h.data, h.c, x, y, z, level, Math.max(30, LANE.despawn[0]), { quiet: true })
        it.armed = false // walk away first, then it can be picked up again
        it.c.group.rotation.y = player.facing
        ctx.sfx.place({ x, y, z })
        ctx.fx.ring(x, y + 0.08, z, { color: '#ffffff', r0: 0.3, r1: 2, life: 0.35 })
      },
    })
    ctx.sfx.drop()
  }

  // Swap: drop the held one where the other stood, take the other.
  function swap(it) {
    const h = carry.release()
    if (!h) return
    const { x, y, z, level, timer } = it
    removeItem(it)
    carry.pick(it.data, it.c)
    ctx.sfx.pickup({ x, y, z })
    carry.fly(h.c, tmp.set(x, y, z), {
      d: 0.32,
      arc: 1,
      scale: 1,
      onLand() {
        const n = addItem(h.data, h.c, x, y, z, level, Math.max(timer, 30), { quiet: true })
        n.armed = false
        ctx.sfx.place({ x, y, z })
      },
    })
  }

  // --- Brainrot Rain (hub/events.js): one falls from the sky onto (x, ground, z) ----------------
  // A light beam marks where it will land; it tumbles down trailing sparkles, lands with a thump
  // and a dust ring, then waits `life` s to be picked up like a lane one (it never respawns).
  const falling = []
  function rainDrop(data, x, z, ground, life) {
    const c = buildCreature(data.species, data.variant, Math.floor(Math.random() * 9999))
    c.group.position.set(x, ground + 30, z)
    c.group.rotation.y = rand(0, Math.PI * 2)
    ctx.scene.add(c.group)
    const color = data.variant !== 'normal' ? VARIANT_COLORS[data.variant] : RARITY_COLORS[creatureInfo(data.species).rarity]
    const beam = new Mesh(beamGeo, beamMaterial(color))
    beam.position.set(x, ground, z)
    beam.scale.set(0.7, 30, 0.7)
    ctx.scene.add(beam)
    falling.push({ data, c, x, z, ground, life, vy: -8, spin: rand(-6, 6), beam, color })
    ctx.sfx.rainFall({ x, y: ground + 8, z })
  }
  function updateFalling(t, dt) {
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i]
      f.vy -= 32 * dt
      const g = f.c.group
      g.position.y += f.vy * dt
      g.rotation.y += f.spin * dt
      g.rotation.z = Math.sin(t * 9 + i) * 0.25
      f.beam.material.opacity = 0.35 + Math.sin(t * 12) * 0.15
      if (Math.random() < 0.6) ctx.fx.burst(f.x, g.position.y + 0.5, f.z, { sprite: 'sparkle', count: 2, colors: [f.color, '#ffffff'], speed: [0.5, 1.5], life: [0.3, 0.6], size: [0.3, 0.5] })
      if (g.position.y > f.ground) continue
      falling.splice(i, 1)
      f.beam.removeFromParent()
      f.beam.material.dispose()
      g.rotation.set(0, g.rotation.y, 0)
      const it = addItem(f.data, f.c, f.x, f.ground, f.z, -1, f.life)
      it.armed = true
      ctx.sfx.rainLand({ x: f.x, y: f.ground, z: f.z }, f.data.variant)
      ctx.fx.burst(f.x, f.ground + 0.3, f.z, { count: 22, colors: ['#ffffff', '#f3e8cf'], speed: [3, 6], life: [0.4, 0.8], size: [0.6, 1], drag: 3, grow: 1.8, spread: 'ring' })
      ctx.fx.burst(f.x, f.ground + 1, f.z, { sprite: 'sparkle', count: 20, colors: [f.color, '#ffffff', '#ffe680'], speed: [3, 7], up: 3, gravity: 8, life: [0.5, 0.9], size: [0.35, 0.6] })
      ctx.fx.ring(f.x, f.ground + 0.08, f.z, { color: f.color, r0: 0.4, r1: 3.4, life: 0.5 })
      if (f.data.variant === 'rainbow' || f.data.variant === 'lava') bus.emit('toast', { text: `A ${VARIANT_NAMES[f.data.variant]} ${SPECIES_NAMES[f.data.species]} fell from the sky!`, kind: 'rare' })
    }
  }

  // --- Jump Crystals ---------------------------------------------------------------------------
  const crystalGeo = new OctahedronGeometry(0.55, 0)
  const crystalMat = new MeshStandardMaterial({ color: '#c23bff', emissive: '#9a1fe0', emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15 })
  function placeCrystal(cr) {
    const lv = LEVELS[cr.level]
    const s = spot(lv)
    cr.x = s.x
    cr.z = s.z
    cr.y = lv.y
    cr.mesh.position.set(cr.x, cr.y + 1, cr.z)
    cr.beam.position.set(cr.x, cr.y, cr.z)
    cr.mesh.visible = cr.beam.visible = true
    cr.live = true
  }
  for (const lv of LEVELS) {
    for (let k = 0; k < LANE.crystalsPerZone; k++) {
      const mesh = new Mesh(crystalGeo, crystalMat)
      mesh.scale.set(1, 1.5, 1)
      mesh.castShadow = true
      const beam = new Mesh(beamGeo, beamMaterial('#d06bff'))
      beam.scale.set(0.5, 9, 0.5)
      beam.material.opacity = 0.45
      ctx.scene.add(mesh, beam)
      const cr = { level: lv.i, mesh, beam, live: false, back: 0, x: 0, y: 0, z: 0, phase: Math.random() * 6 }
      crystals.push(cr)
      placeCrystal(cr)
    }
  }
  function grabCrystal(cr) {
    cr.live = false
    cr.mesh.visible = cr.beam.visible = false
    cr.back = clock + LANE.crystalRespawn * eventFx.crystalRespawn
    const gain = Math.round(crystalGain(cr.level) * eventFx.crystalGain)
    game.jumpPower += gain
    const { x, y, z } = cr
    ctx.sfx.crystal({ x, y, z })
    ctx.fx.burst(x, y + 1, z, { sprite: 'sparkle', count: 26, colors: ['#e07bff', '#ffffff', '#b05aff'], speed: [3, 7], life: [0.5, 1], size: [0.35, 0.65], gravity: 5 })
    ctx.fx.burst(x, y + 1, z, { count: 14, colors: ['#c23bff', '#ff9cf5'], speed: [1, 3], life: [0.4, 0.7], size: [0.6, 0.9], drag: 3, grow: 1.6 })
    ctx.fx.ring(x, y + 0.08, z, { color: '#d06bff', r0: 0.4, r1: 3, life: 0.5 })
    const p = player.position
    ctx.fx.floatText(`+${short(gain)} Jump Power`, p.x, p.y + 2.8, p.z, { color: '#e07bff', stroke: '#2a0a3a', size: 0.85, rise: 2.4, icon: 'jump' })
    // Every LUCKY_BLOCKS.freeEvery crystals: a free Lucky Block, with a golden fountain.
    if (countCrystal()) {
      ctx.sfx.luckyFree()
      ctx.fx.floatText('FREE Lucky Block!', p.x, p.y + 4, p.z, { color: '#ffe14a', stroke: '#5a2a00', size: 1.1, rise: 3, wobble: 0.12 })
      ctx.fx.burst(p.x, p.y + 1, p.z, { sprite: 'sparkle', spread: 'up', cone: 0.8, count: 50, colors: ['#ffe14a', '#ffffff', '#ffb02e', '#ff4de0'], speed: [5, 10], gravity: 9, life: [0.8, 1.4], size: [0.35, 0.65] })
      ctx.fx.ring(p.x, p.y + 0.08, p.z, { color: '#ffe14a', r0: 0.5, r1: 5, life: 0.7 })
      toast('Free Lucky Block! Open it at the Lucky Blocks.', 'good')
    }
  }

  // --- Start: fill every terrace ------------------------------------------------------------------
  for (const lv of LEVELS) for (let k = 0; k < LANE.perZone; k++) spawn(lv, true)

  function update(t, dt) {
    clock += dt
    updateFalling(t, dt)
    ctx.camera.getWorldPosition(camPos)
    const p = player.position
    const hands = carry.full() // room left on the stack: walk-in pick-up; full: E swaps
    const [fadeNear, fadeFar] = LANE.labelDistance
    let swapCandidate = null
    let swapD = 2.6
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.state === 'leaving') {
        it.leave -= dt
        const k = Math.max(0, it.leave / 0.3)
        it.c.group.scale.setScalar(it.scale * k)
        it.c.group.position.y = it.y + (1 - k) * 0.6
        it.tag.sprite.material.opacity = k
        if (it.leave <= 0) {
          it.c.group.removeFromParent()
          removeItem(it)
          if (it.level >= 0 && !it.c.group.userData.dropped) queueRespawn(it.level, rand(1, 4))
        }
        continue
      }
      // Countdown.
      it.timer -= dt
      if (it.timer <= 0) {
        vanish(it)
        continue
      }
      const d = Math.hypot(it.x - camPos.x, it.y - camPos.y, it.z - camPos.z)
      const visible = d < LANE.viewDistance
      it.c.group.visible = visible
      // Only brainrots near you cast shadows (each caster is another draw call).
      const shadow = visible && d < LANE.shadowDistance
      if (shadow !== it.shadow) {
        it.shadow = shadow
        it.c.group.traverse((o) => {
          if (o.isMesh) o.castShadow = shadow
        })
      }
      if (visible) {
        if (it.pop < 1) {
          it.pop = Math.min(1, it.pop + dt * 3.5)
          const k = it.pop
          it.c.group.scale.setScalar(it.scale * (k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15))
        }
        if (d < 70) it.c.update(t, dt)
        it.aura(dt, d < 45)
      }
      // Tag: fade with distance, repaint the countdown once a second.
      const a = 1 - Math.min(1, Math.max(0, (d - fadeNear) / (fadeFar - fadeNear)))
      it.tag.sprite.visible = a > 0.02
      it.tag.sprite.material.opacity = a
      if (a > 0.02) {
        const sec = Math.ceil(it.timer)
        if (sec !== it.shown) {
          it.shown = sec
          it.tag.paint(tagLines(it.data, it.timer))
        }
        it.tag.sprite.position.y = it.y + it.c.height * it.scale + 1.35 + Math.sin(t * 1.5 + i) * 0.08
      }
      if (it.beam) {
        it.beamT -= dt
        it.beam.material.opacity = Math.max(0, Math.min(0.8, it.beamT * 0.4))
        it.beam.scale.x = it.beam.scale.z = 1 + Math.sin(t * 6) * 0.08
        if (it.beamT <= 0) {
          it.beam.removeFromParent()
          it.beam.material.dispose()
          it.beam = null
        }
      }
      // Pick-up / swap range (feet).
      const fd = Math.hypot(it.x - p.x, it.z - p.z)
      const dy = p.y - it.y
      const near = dy > -1 && dy < 2.5
      if (!it.armed) {
        if (fd > LANE.pickupRadius + 0.8 || !near) it.armed = true
        continue
      }
      if (!near) continue
      if (!hands && fd < LANE.pickupRadius) {
        pickUp(it)
        continue
      }
      if (hands && fd < swapD) {
        swapD = fd
        swapCandidate = it
      }
    }
    if (swapCandidate) {
      const it = swapCandidate
      offerPrompt({ key: 'E', text: 'Swap', sub: `${SPECIES_NAMES[it.data.species]}`, x: it.x, y: it.y + 1.2, z: it.z, d: swapD, action: () => items.includes(it) && carry.has() && swap(it) })
    }
    // Respawns.
    for (let i = respawns.length - 1; i >= 0; i--) {
      const r = respawns[i]
      if (clock < r.at) continue
      respawns.splice(i, 1)
      const alive = items.filter((it) => it.level === r.level && it.state === 'idle').length
      if (alive < LANE.perZone) spawn(LEVELS[r.level])
    }
    // Crystals: spin, bob, glint; touch to collect.
    const magnet = ascLevel('magnet') ? ascPerk('magnet') : null
    for (const cr of crystals) {
      if (!cr.live) {
        if (clock >= cr.back) placeCrystal(cr)
        continue
      }
      const d = Math.hypot(cr.x - camPos.x, cr.y - camPos.y, cr.z - camPos.z)
      cr.mesh.visible = cr.beam.visible = d < LANE.viewDistance
      if (!cr.mesh.visible) continue
      // Ascended Crystal Magnet: crystals in range streak to you with a sparkle trail.
      if (magnet) {
        const dx = p.x - cr.x
        const dy = p.y - cr.y
        const dz = p.z - cr.z
        const dd = Math.hypot(dx, dy, dz)
        if (dd < magnet.radius && dd > 0.01 && Math.abs(dy) < 6) {
          const k = Math.min(1, (dt * (10 + (magnet.radius - dd) * 3)) / dd)
          cr.x += dx * k
          cr.y += dy * k
          cr.z += dz * k
          cr.mesh.position.x = cr.beam.position.x = cr.x
          cr.mesh.position.z = cr.beam.position.z = cr.z
          cr.beam.position.y = cr.y
          if (Math.random() < 0.5) ctx.fx.burst(cr.x, cr.y + 1, cr.z, { sprite: 'sparkle', count: 2, colors: ['#e07bff', '#ffffff'], speed: [0.5, 1.5], life: [0.25, 0.45], size: [0.25, 0.4] })
        }
      }
      cr.mesh.rotation.y = t * 1.8 + cr.phase
      cr.mesh.position.y = cr.y + 1 + Math.sin(t * 2 + cr.phase) * 0.18
      crystalMat.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.25
      if (Math.hypot(cr.x - p.x, cr.z - p.z) < 1.5 && p.y - cr.y > -0.5 && p.y - cr.y < 2.5) grabCrystal(cr)
    }
  }

  return { update, drop, items, rainDrop }
}
