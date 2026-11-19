// MACHINES (east wall): the purple sign and the Fusion Machine under it, a dark
// spiked crystal star hovering over a metal plinth inside spinning energy
// rings, crackling with electric sparks (and a hum + zaps you can hear).
// Walking up opens the Fusion Machine window (locked until FUSION.unlock):
// three brainrots fly in from your hands / base and orbit the star, faster and
// tighter as the build runs, then merge into the next variant, which floats in
// the cage under a golden beam until you claim it. Nearby, the JOIN EVENT
// billboard on red legs plays a little animated scene with an 8-bit tune.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import { FUSION, HUB } from '../config.js'
import { clockText, currentEvent, nextEvent } from '../game/events.js'
import { fusionMinutes, fusionPrice, fusionSources, fusionState, fusionUnlocked, nextVariant } from '../game/fusion.js'
import { bus, game, save, spend } from '../game/state.js'
import { fontReady, neon } from '../propkit.js'
import { makeAura } from './aura.js'
import { buildCreature, VARIANT_COLORS } from './creatures.js'
import { lego, solid, solidCylinder, wbox } from './kit.js'
import { outlined, signTexture } from './paint.js'
import { signPanel, wallSign } from './signs.js'

function machine(ctx, root, x, z) {
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = -Math.PI / 2 // faces west, into the hub
  const S = 1.35
  g.scale.setScalar(S)
  root.add(g)
  const metal = new MeshStandardMaterial({ color: '#3a4152', metalness: 0.8, roughness: 0.35 })
  const trimMat = new MeshStandardMaterial({ color: '#8b93a8', metalness: 0.9, roughness: 0.25 })
  const base = new Mesh(new CylinderGeometry(3.2, 3.6, 0.6, 8), metal)
  base.position.y = 0.3
  base.receiveShadow = true
  base.castShadow = true
  const step = new Mesh(new CylinderGeometry(2.4, 2.6, 0.5, 8), trimMat)
  step.position.y = 0.85
  step.castShadow = true
  g.add(base, step)
  const glowRing = new Mesh(new TorusGeometry(2.9, 0.08, 6, 48), neon('#5a6bff', 3))
  glowRing.rotation.x = Math.PI / 2
  glowRing.position.y = 0.62
  g.add(glowRing)
  // Four legs with glowing tips holding the energy cage.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const leg = new Mesh(new BoxGeometry(0.35, 5.2, 0.35), metal)
    leg.position.set(Math.cos(a) * 2.3, 3.2, Math.sin(a) * 2.3)
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12)
    leg.castShadow = true
    g.add(leg)
    const tip = new Mesh(new IcosahedronGeometry(0.25, 0), neon('#7a8cff', 3.5))
    tip.position.set(Math.cos(a) * 2.0, 5.85, Math.sin(a) * 2.0)
    g.add(tip)
  }
  // The spiked star: a dark crystal core with cones on every vertex.
  const star = new Group()
  star.userData.dynamic = true
  star.position.y = 4.2
  g.add(star)
  const core = new Mesh(new IcosahedronGeometry(1.25, 0), new MeshStandardMaterial({ color: '#1c2a6b', metalness: 0.4, roughness: 0.2, emissive: '#2a3cff', emissiveIntensity: 0.35, flatShading: true }))
  core.castShadow = true
  star.add(core)
  const spikeMat = new MeshStandardMaterial({ color: '#22306e', metalness: 0.5, roughness: 0.25, emissive: '#1d2aa8', emissiveIntensity: 0.25, flatShading: true })
  const ico = new IcosahedronGeometry(1, 0)
  const pos = ico.attributes.position
  const seen = new Set()
  const up = new Vector3(0, 1, 0)
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i).normalize()
    const key = v.toArray().map((n) => n.toFixed(2)).join()
    if (seen.has(key)) continue
    seen.add(key)
    const spike = new Mesh(new ConeGeometry(0.42, 1.4, 5), spikeMat)
    spike.position.copy(v).multiplyScalar(1.6)
    spike.quaternion.setFromUnitVectors(up, v)
    spike.castShadow = true
    star.add(spike)
  }
  const inner = new Mesh(new IcosahedronGeometry(0.7, 1), neon('#6f7bff', 3.4, { transparent: true, opacity: 0.6 }))
  star.add(inner)
  // Energy rings.
  const rings = []
  for (let i = 0; i < 3; i++) {
    const r = new Mesh(new TorusGeometry(2.4 + i * 0.25, 0.04, 6, 64), new MeshBasicMaterial({ color: new Color(['#7a8cff', '#b47aff', '#5ad0ff'][i]).multiplyScalar(2.2), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }))
    r.position.y = 4.2
    r.userData.dynamic = true
    g.add(r)
    rings.push(r)
  }
  const light = new PointLight('#6070ff', 20, 16, 2)
  light.position.set(0, 4.2, 0)
  g.add(light)
  solidCylinder(3.4 * S, 1.1 * S, x, 0.55 * S, z)

  // Status sign over the cage: "Fusion Machine" / locked / the countdown / READY.
  const status = statusSign()
  status.sprite.position.set(0, 7.5, 0)
  g.add(status.sprite)
  // Golden beam over a finished fusion.
  const beam = new Mesh(new CylinderGeometry(0.9, 1.4, 22, 16, 1, true), new MeshBasicMaterial({ color: new Color('#ffd23a').multiplyScalar(1.6), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }))
  beam.position.y = 4.2 + 11
  beam.userData.dynamic = true
  g.add(beam)
  // The brainrots being fused orbit the star; the result floats in its place when done.
  const orbit = new Group()
  orbit.position.y = 4.2
  orbit.userData.dynamic = true
  g.add(orbit)

  ctx.emitter({ boxes: [{ x, y: 4.2 * S, z, sx: 2 * S, sy: 2 * S, sz: 2 * S }], count: 26, life: 0.9, velocity: [0, 0.4, 0], spread: [1.5, 1.5, 1.5], size: 0.22, grow: 0.2, color: '#9fb0ff', intensity: 4, twinkle: 18, sprite: 'sparkle', seed: 61 })
  ctx.emitter({ boxes: [{ x, y: 0.7 * S, z, sx: 2.8 * S, sy: 0, sz: 2.8 * S }], count: 20, life: 2.2, velocity: [0, 1.2, 0], spread: [0.1, 0.3, 0.1], size: 0.3, grow: 0.2, color: '#5a6bff', intensity: 2.6, seed: 62 })
  const hum = ctx.addEmitter('machine', x, 3, z, 1)
  const W = (lx, ly, lz) => g.localToWorld(new Vector3(lx, ly, lz)) // machine-local -> world
  g.updateMatrixWorld(true)

  // --- Fusion ----------------------------------------------------------------------------------
  const ORBIT_R = 2.7
  const SIZE = 1.15 // local height of an orbiting brainrot
  let fusers = [] // creatures in orbit
  let result = null // the finished brainrot, floating in the cage
  let pop = 0 // 0..1 the result popping in
  let wasDone = false
  let charge = 0
  let spinA = 0
  let zap = 0
  const clearFusers = () => {
    for (const c of fusers) c.group.removeFromParent()
    fusers = []
  }
  const clearResult = () => {
    result?.c.group.removeFromParent()
    result = null
  }
  const orbitSlot = (k) => new Vector3(Math.cos((k / FUSION.need) * Math.PI * 2) * ORBIT_R, 0, Math.sin((k / FUSION.need) * Math.PI * 2) * ORBIT_R)
  function addFuser(c, k) {
    c.group.userData.dynamic = true
    c.group.scale.setScalar(SIZE / c.height)
    c.group.position.copy(orbitSlot(k))
    orbit.add(c.group)
    fusers.push(c)
  }
  function showResult(f, animate) {
    clearResult()
    const c = buildCreature(f.species, f.to, 99)
    c.group.userData.dynamic = true
    c.group.scale.setScalar(2.2 / c.height)
    c.group.position.set(0, -1.1, 0)
    orbit.add(c.group)
    result = { c, aura: makeAura(ctx.fx, c), base: 2.2 / c.height }
    pop = animate ? 0 : 1
  }
  // The job in the save (also after a reload): its brainrots orbiting, or the result waiting.
  function syncView() {
    const f = fusionState()
    clearFusers()
    clearResult()
    if (!f) return
    if (f.done) showResult(f, false)
    else for (let k = 0; k < FUSION.need; k++) addFuser(buildCreature(f.species, f.from, k * 13 + 1), k)
    wasDone = f.done
  }
  syncView()

  // Start a fusion of 3 `species` `variant`: pay, then the brainrots fly in from your hands
  // and your base. false if it cannot start (locked, busy, not enough, money).
  function start(species, variant) {
    if (!fusionUnlocked() || game.fusion) return false
    const to = nextVariant(variant)
    const src = to && fusionSources(species, variant)
    if (!src || src.some((s) => s.from === 'slot' && !ctx.baseCanTake(s.i))) return false
    if (!spend(fusionPrice(species, to))) return false
    const ms = fusionMinutes(to) * 60_000
    game.fusion = { species, from: variant, to, at: Date.now() + ms, ms }
    const center = W(0, 4.2, 0)
    src.forEach((s, k) => {
      const c = s.from === 'hand' ? ctx.carry.release(s.i)?.c : ctx.takeFromBase(s.i)
      if (!c) return
      const local = orbitSlot(k)
      setTimeout(() => {
        ctx.carry.fly(c, W(local.x, 4.2, local.z), {
          d: 0.9,
          arc: 6,
          scale: (SIZE / c.height) * S,
          parent: orbit,
          local,
          onLand() {
            c.group.scale.setScalar(SIZE / c.height)
            fusers.push(c)
            ctx.fx.burst(center.x, center.y, center.z, { sprite: 'sparkle', count: 24, colors: ['#c79aff', '#7ff0ff', '#ffffff'], speed: [3, 7], life: [0.4, 0.8], size: [0.35, 0.6], drag: 2 })
            ctx.sfx.pop({ x: center.x, y: center.y, z: center.z }, 600 + k * 150)
          },
        })
      }, k * 160)
    })
    clearResult()
    clearFusers()
    charge = 1.5
    ctx.sfx.fuseStart({ x, y: 4, z })
    ctx.fx.ring(x, 0.7 * S, z, { color: '#b47aff', r0: 2, r1: 10, life: 0.8 })
    setTimeout(() => {
      ctx.fx.burst(center.x, center.y, center.z, { sprite: 'sparkle', count: 60, colors: ['#b47aff', '#7ff0ff', '#ffffff', VARIANT_COLORS[to] ?? '#fff'], speed: [5, 12], life: [0.6, 1.2], size: [0.4, 0.7], drag: 1.5 })
      ctx.fx.ring(x, 0.7 * S, z, { color: VARIANT_COLORS[to] ?? '#ffffff', r0: 1, r1: 12, life: 0.9 })
      charge = 2
    }, 1300)
    wasDone = false
    save(true)
    return true
  }
  // Take the finished brainrot: it shoots out of the cage at you. Returns { species, variant } or null.
  function claim() {
    const f = fusionState()
    if (!f || !f.done) return null
    game.fusion = null
    const out = { species: f.species, variant: f.to, from: f.from }
    const p = W(0, 4.2, 0)
    if (result) {
      const c = result.c
      result = null
      const pl = ctx.player.position
      ctx.carry.fly(c, new Vector3(pl.x, pl.y + 2, pl.z), { d: 0.6, arc: 3, scale: 0.05, onLand: () => c.group.removeFromParent() })
    }
    ctx.fx.burst(p.x, p.y, p.z, { sprite: 'sparkle', count: 70, colors: ['#ffd23a', '#ffffff', VARIANT_COLORS[f.to] ?? '#fff', '#b47aff'], speed: [6, 13], life: [0.7, 1.3], size: [0.4, 0.75], drag: 1.2 })
    ctx.fx.ring(x, 0.7 * S, z, { color: '#ffd23a', r0: 1, r1: 12, life: 0.9 })
    charge = 2
    save(true)
    return out
  }

  ctx.zone({
    x0: x - 9,
    x1: x + 1,
    z0: z - 6,
    z1: z + 6,
    onEnter() {
      charge = Math.max(charge, 1)
      ctx.sfx.whoosh({ x, z })
      ctx.fx.burst(x, 4.2 * S, z, { sprite: 'sparkle', count: 30, colors: ['#9fb0ff', '#ffffff', '#c9a2ff'], speed: [4, 9], life: [0.3, 0.7], size: [0.3, 0.55], drag: 2 })
      ctx.fx.ring(x, 0.7 * S, z, { color: '#7a8cff', r0: 2, r1: 8, life: 0.6 })
      if (!fusionUnlocked()) {
        ctx.sfx.locked({ x, z })
        const p = ctx.player.position
        ctx.fx.floatText(`Need ${FUSION.unlock.rebirths} Rebirths`, p.x, p.y + 3, p.z, { color: '#c79aff', stroke: '#1a1040', size: 0.8, wobble: 0.12 })
        return
      }
      bus.emit('window', 'fusion')
    },
  })

  const tmpV = new Vector3()
  let lastMood = -1
  let signIn = 0
  ctx.onUpdate((t, dt) => {
    const f = fusionState()
    const progress = f ? f.progress : 0
    const busy = f && !f.done
    // Just finished: the three spiral in and merge into the result.
    if (f && f.done && !wasDone) {
      wasDone = true
      clearFusers()
      showResult(f, true)
      const p = W(0, 4.2, 0)
      ctx.fx.burst(p.x, p.y, p.z, { sprite: 'sparkle', count: 80, colors: ['#ffd23a', '#ffffff', VARIANT_COLORS[f.to] ?? '#fff'], speed: [5, 12], life: [0.7, 1.4], size: [0.4, 0.8], drag: 1.2 })
      ctx.fx.ring(x, 0.7 * S, z, { color: VARIANT_COLORS[f.to] ?? '#ffd23a', r0: 1, r1: 14, life: 1 })
      charge = 2.5
      ctx.sfx.fuseDone()
      bus.emit('toast', { text: 'Fusion complete! Claim it at the Fusion Machine.', kind: 'good' })
    }
    if (!f && (fusers.length || result)) syncView() // the job vanished (save wiped)
    charge = Math.max(0, charge - dt * 0.4)
    // Busy: faster and faster, the orbit tightening as it nears the end; crackling zaps.
    const drive = busy ? 0.6 + progress * 3.5 : 0
    spinA += dt * (0.35 + charge * 3 + drive)
    star.rotation.y = spinA
    star.rotation.x = Math.sin(t * 0.5) * 0.3
    star.position.y = 4.2 + Math.sin(t * 1.3) * 0.18
    const starScale = result ? Math.max(0.2, 1 - pop * 0.8) : 1
    star.scale.setScalar(starScale)
    inner.scale.setScalar(1 + Math.sin(t * (6 + drive * 4)) * (0.1 + drive * 0.05) + charge * 0.4)
    rings.forEach((r, i) => {
      const sp = 1 + drive * 1.5 + charge
      r.rotation.set(t * (0.6 + i * 0.3) * sp * (i % 2 ? -1 : 1) + i, t * 0.4 * sp + i * 2, 0)
      r.position.y = star.position.y
    })
    orbit.rotation.y += dt * (0.8 + progress * 5)
    const rad = ORBIT_R * (1 - progress * 0.45)
    fusers.forEach((c, k) => {
      const a = (k / FUSION.need) * Math.PI * 2
      c.group.position.set(Math.cos(a) * rad, Math.sin(t * 3 + k * 2) * 0.25, Math.sin(a) * rad)
      c.group.rotation.y = -orbit.rotation.y - a + Math.PI / 2
      c.update(t, dt)
    })
    if (result) {
      pop = Math.min(1, pop + dt * 1.6)
      const e = 1 - (1 - pop) ** 3
      const s = result.base * (e + Math.sin(pop * Math.PI) * 0.35)
      result.c.group.scale.setScalar(Math.max(0.001, s))
      result.c.group.position.y = -1.1 + Math.sin(t * 1.6) * 0.2
      result.c.group.rotation.y = -orbit.rotation.y + t * 0.6
      result.c.update(t, dt)
      result.aura(dt, true)
    }
    if (busy) {
      zap -= dt
      if (zap <= 0) {
        zap = 0.7 - progress * 0.45
        const p = W(0, 4.2, 0)
        tmpV.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3)
        ctx.fx.burst(p.x + tmpV.x, p.y + tmpV.y, p.z + tmpV.z, { sprite: 'sparkle', count: 8 + Math.round(progress * 10), colors: ['#9fb0ff', '#ffffff', VARIANT_COLORS[f.to] ?? '#c9a2ff'], speed: [2, 5], life: [0.25, 0.5], size: [0.25, 0.45], drag: 3 })
      }
    }
    // Done: a golden beam and a sparkle fountain call you over.
    beam.material.opacity = result ? 0.18 + Math.sin(t * 3) * 0.06 : 0
    beam.rotation.y = t * 0.5
    if (result) {
      zap -= dt
      if (zap <= 0) {
        zap = 0.9
        const p = W(0, 4.2, 0)
        ctx.fx.burst(p.x, p.y + 1, p.z, { sprite: 'sparkle', spread: 'up', cone: 0.7, count: 14, colors: ['#ffd23a', '#ffffff', VARIANT_COLORS[f?.to] ?? '#ffd23a'], speed: [3, 7], gravity: 5, life: [0.6, 1.1], size: [0.3, 0.55] })
      }
    }
    hum.level = 1 + (busy ? 0.6 + progress : 0) + (result ? 0.4 : 0)
    light.intensity = 18 + Math.sin(t * 9) * 4 + charge * 30 + drive * 8 + (Math.random() < 0.03 + drive * 0.03 ? 25 : 0) + (result ? 15 + Math.sin(t * 4) * 10 : 0)
    const mood = result ? 2 : busy ? 1 : 0
    if (mood !== lastMood) light.color.set(['#6070ff', '#a080ff', '#ffd27a'][(lastMood = mood)])
    signIn -= dt
    if (signIn <= 0) {
      signIn = 0.25
      status.set(statusLines(f))
    }
    status.sprite.position.y = 7.5 + Math.sin(t * 1.4) * 0.12
  })
  return { start, claim, syncView }
}

// The sign's lines for the machine's state (repainted only when the text changes).
function statusLines(f) {
  if (!fusionUnlocked()) return [['Fusion Machine', '#d9c8ff'], [`Locked: ${FUSION.unlock.rebirths} Rebirths`, '#ff5a5a']]
  if (!f) return [['Fusion Machine', '#d9c8ff'], ['Fuse 3 into 1!', '#7ff0ff']]
  if (!f.done) return [['Fusing...', '#d9c8ff'], [clockText(f.left), '#ffe14a']]
  return [['READY!', '#ffe14a'], ['Claim it', '#7dff4a']]
}
function statusSign() {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 240
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(5.6, 2.1, 1)
  sprite.renderOrder = 5
  sprite.userData.dynamic = true
  let key = ''
  let lines = []
  const paint = () => {
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    lines.forEach(([text, fill], i) => outlined(g, text, c.width / 2, 64 + i * 110, { size: i ? 84 : 92, fill, stroke: '#1a1040', line: 0.2, maxW: c.width - 30 }))
    tex.needsUpdate = true
  }
  fontReady.then(() => paint())
  return {
    sprite,
    set(next) {
      const k = next.map((l) => l.join()).join('|')
      if (k === key) return
      key = k
      lines = next
      paint()
    },
  }
}

// The JOIN EVENT billboard: a tiny animated scene of blocky jumpers on a hill with the next hub
// event and its countdown; during an event, that event's own scene, name and time left.
function eventScreen() {
  const c = document.createElement('canvas')
  c.width = 320
  c.height = 200
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const ctx = c.getContext('2d')
  const jumpers = [['#ff5a5a', 0], ['#3aa8ff', 1.3], ['#ffd23a', 2.1], ['#7dff6a', 0.6], ['#c46bff', 1.8]]
  const draw = (t) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 200)
    sky.addColorStop(0, '#46b6ff')
    sky.addColorStop(1, '#bfe9ff')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, 320, 200)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 12 + i * 120) % 400) - 40
      ctx.beginPath()
      ctx.ellipse(cx, 50 + i * 12, 26, 10, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Terraced hill.
    const cols = ['#5ad52f', '#3fabf7', '#b85bec', '#f0614f']
    cols.forEach((col, i) => {
      ctx.fillStyle = col
      ctx.fillRect(170 + i * 36, 150 - i * 26, 320, 200)
    })
    ctx.fillStyle = '#5ad52f'
    ctx.fillRect(0, 150, 320, 50)
    jumpers.forEach(([col, ph], i) => {
      const k = (t * 0.9 + ph) % 2.4
      const y = 150 - Math.max(0, Math.sin((k / 2.4) * Math.PI)) * (40 + i * 14)
      const x = 30 + i * 30
      ctx.fillStyle = col
      ctx.fillRect(x - 6, y - 22, 12, 14)
      ctx.fillStyle = '#ffd9b0'
      ctx.fillRect(x - 5, y - 32, 10, 10)
      ctx.fillStyle = '#333'
      ctx.fillRect(x - 6, y - 8, 5, 8)
      ctx.fillRect(x + 1, y - 8, 5, 8)
    })
    ctx.save()
    ctx.translate(160, 30)
    ctx.scale(1 + Math.sin(t * 4) * 0.04, 1 + Math.sin(t * 4) * 0.04)
    outlined(ctx, 'JOIN EVENT', 0, 0, { size: 38, fill: '#ffe14a', stroke: '#5a1a00', line: 0.2, italic: true })
    ctx.restore()
    // Which event is next, and when.
    const nx = nextEvent()
    ctx.fillStyle = 'rgba(13,26,58,0.78)'
    ctx.fillRect(0, 168, 320, 32)
    outlined(ctx, `NEXT: ${nx.def.name}  ${clockText(nx.in)}`, 160, 184, { size: 20, fill: nx.def.color, stroke: '#0d1a3a', line: 0.2, maxW: 300 })
    tex.needsUpdate = true
  }
  // A live event: its own scene, name and countdown.
  const scenes = {
    rain(t) {
      const g = ctx.createLinearGradient(0, 0, 0, 200)
      g.addColorStop(0, '#1f4a8a')
      g.addColorStop(1, '#5ab0f0')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 320, 200)
      for (let i = 0; i < 14; i++) {
        const x = (i * 53) % 300 + 10
        const y = ((t * (50 + (i % 4) * 15) + i * 37) % 230) - 20
        ctx.fillStyle = ['#ff5a5a', '#ffd23a', '#7dff6a', '#c46bff', '#5ad0ff'][i % 5]
        ctx.fillRect(x - 7, y - 7, 14, 14)
        ctx.fillStyle = '#fff'
        ctx.fillRect(x - 4, y - 3, 3, 3)
        ctx.fillRect(x + 1, y - 3, 3, 3)
      }
    },
    crystal(t) {
      ctx.fillStyle = '#2a0f4a'
      ctx.fillRect(0, 0, 320, 200)
      for (let i = 0; i < 16; i++) {
        const x = (i * 41) % 310 + 5
        const y = ((t * (40 + (i % 3) * 20) + i * 29) % 230) - 20
        ctx.fillStyle = i % 2 ? '#e07bff' : '#c23bff'
        ctx.beginPath()
        ctx.moveTo(x, y - 9)
        ctx.lineTo(x + 6, y)
        ctx.lineTo(x, y + 9)
        ctx.lineTo(x - 6, y)
        ctx.fill()
      }
    },
    lava(t) {
      const g = ctx.createLinearGradient(0, 0, 0, 200)
      g.addColorStop(0, '#3a0800')
      g.addColorStop(1, '#a82a00')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 320, 200)
      ctx.fillStyle = '#ff7a1a'
      ctx.beginPath()
      ctx.moveTo(0, 200)
      for (let x = 0; x <= 320; x += 10) ctx.lineTo(x, 160 + Math.sin(x * 0.05 + t * 3) * 8)
      ctx.lineTo(320, 200)
      ctx.fill()
      for (let i = 0; i < 18; i++) {
        const x = (i * 37 + Math.sin(t + i) * 10) % 320
        const y = 200 - ((t * (30 + (i % 4) * 12) + i * 23) % 200)
        ctx.fillStyle = i % 2 ? '#ffd23a' : '#ff3a1a'
        ctx.fillRect(x, y, 3, 3)
      }
    },
    golden(t) {
      const g = ctx.createLinearGradient(0, 0, 320, 200)
      g.addColorStop(0, '#8a5a00')
      g.addColorStop(0.5, '#ffb11f')
      g.addColorStop(1, '#8a5a00')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 320, 200)
      for (let i = 0; i < 10; i++) {
        const x = (i * 67) % 300 + 10
        const y = ((t * 45 + i * 41) % 230) - 20
        const w = Math.abs(Math.cos(t * 4 + i)) * 9 + 1
        ctx.fillStyle = '#ffe14a'
        ctx.beginPath()
        ctx.ellipse(x, y, w, 9, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#b8860b'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    },
  }
  const drawLive = (t, ev) => {
    scenes[ev.def.id]?.(t)
    const k = 1 + Math.sin(t * 6) * 0.06
    ctx.save()
    ctx.translate(160, 34)
    ctx.scale(k, k)
    outlined(ctx, 'EVENT NOW!', 0, 0, { size: 30, fill: '#ffffff', stroke: '#0d1a3a', line: 0.22, italic: true })
    ctx.restore()
    outlined(ctx, ev.def.name, 160, 92, { size: 40, fill: ev.def.color, stroke: '#0d1a3a', line: 0.2, maxW: 300 })
    outlined(ctx, `${clockText(ev.left)} left`, 160, 150, { size: 34, fill: ev.left <= 10 ? '#ff4a4a' : '#ffe14a', stroke: '#0d1a3a', line: 0.2 })
    tex.needsUpdate = true
  }
  const plain = draw
  const drawAny = (t) => {
    const ev = currentEvent()
    if (ev) drawLive(t, ev)
    else plain(t)
  }
  drawAny(0)
  return { tex, draw: drawAny }
}

function billboard(ctx, root, x, z, yaw) {
  const g = new Group()
  g.position.set(x, 0, z)
  g.rotation.y = yaw
  root.add(g)
  const red = lego('red')
  for (const s of [-1, 1]) wbox(g, 0.6, 3.2, 0.6, s * 2.6, 1.6, 0, red)
  wbox(g, 7.0, 4.4, 0.6, 0, 5.1, 0, lego('woodDark'))
  const screen = eventScreen()
  const panel = signPanel(screen.tex, 6.4, 3.9, { depth: 0.1, back: '#1a1a1a', glow: 0.6 })
  panel.position.set(0, 5.1, 0.32)
  g.add(panel)
  g.updateMatrixWorld(true)
  solid(3.5, 3.6, 0.5, x, 3.6, z, yaw)
  ctx.addEmitter('arcade', x, 5, z, 0.8)
  // Walking up in front of the screen: what the event (running or next) does.
  const fx = x + Math.sin(yaw) * 3
  const fz = z + Math.cos(yaw) * 3
  ctx.zone({
    x0: fx - 3.5,
    x1: fx + 3.5,
    z0: fz - 3.5,
    z1: fz + 3.5,
    onEnter() {
      const ev = currentEvent()
      const def = ev?.def ?? nextEvent().def
      ctx.sfx.magic({ x, z })
      ctx.fx.burst(x, 5.1, z, { sprite: 'sparkle', count: 24, colors: [def.color, '#ffffff', '#ffe14a'], speed: [3, 7], life: [0.4, 0.9], size: [0.3, 0.55], drag: 2 })
      bus.emit('toast', { text: ev ? `${def.name} is on! ${def.text}` : `Next event: ${def.name} in ${clockText(nextEvent().in)}. ${def.text}`, kind: ev ? 'good' : 'info' })
    },
  })
  let acc = 0
  ctx.onUpdate((t, dt) => {
    acc += dt
    if (acc < 1 / 20) return // 20 fps is plenty for the screen
    acc = 0
    screen.draw(t)
  })
}

export function buildMachines(ctx) {
  const X = HUB.halfX
  const root = new Group()
  ctx.scene.add(root)
  const sign = signTexture({
    w: 1024,
    h: 300,
    colors: ['#b85bec', '#a347db'],
    lines: [{ text: 'MACHINES', size: 190, fill: '#d9c8ff' }],
    stroke: '#2a0f4a',
  })
  wallSign(root, sign, 15, 4.4, X - 0.2, 14, -6, -Math.PI / 2, 0)
  const fusion = machine(ctx, root, X - 6, -6)
  billboard(ctx, root, X - 16, HUB.north + 20, -Math.PI / 4)
  return { fusion }
}
