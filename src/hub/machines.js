// MACHINES (east wall): the purple sign and the machine under it, a dark
// spiked crystal star hovering over a metal plinth inside spinning energy
// rings, crackling with electric sparks (and a hum + zaps you can hear).
// Walking up makes it spin up and discharge. Nearby, the JOIN EVENT billboard
// on red legs plays a little animated scene with an 8-bit tune.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import { HUB } from '../config.js'
import { neon } from '../propkit.js'
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

  const tag = ctx.label('Machine\nLocked', 2.0, { colors: ['#c9b2ff', '#ff3b3b'], outline: '#1a1040', outlineWidth: 16 }, { near: 35, far: 80 })
  tag.position.set(0, 8.4, 0)
  g.add(tag)

  ctx.emitter({ boxes: [{ x, y: 4.2 * S, z, sx: 2 * S, sy: 2 * S, sz: 2 * S }], count: 26, life: 0.9, velocity: [0, 0.4, 0], spread: [1.5, 1.5, 1.5], size: 0.22, grow: 0.2, color: '#9fb0ff', intensity: 4, twinkle: 18, sprite: 'sparkle', seed: 61 })
  ctx.emitter({ boxes: [{ x, y: 0.7 * S, z, sx: 2.8 * S, sy: 0, sz: 2.8 * S }], count: 20, life: 2.2, velocity: [0, 1.2, 0], spread: [0.1, 0.3, 0.1], size: 0.3, grow: 0.2, color: '#5a6bff', intensity: 2.6, seed: 62 })
  ctx.addEmitter('machine', x, 3, z, 1)

  let charge = 0
  ctx.zone({
    x0: x - 9,
    x1: x + 1,
    z0: z - 6,
    z1: z + 6,
    onEnter() {
      charge = 1
      ctx.sfx.whoosh({ x, z })
      ctx.fx.burst(x, 4.2 * S, z, { sprite: 'sparkle', count: 30, colors: ['#9fb0ff', '#ffffff', '#c9a2ff'], speed: [4, 9], life: [0.3, 0.7], size: [0.3, 0.55], drag: 2 })
      ctx.fx.ring(x, 0.7 * S, z, { color: '#7a8cff', r0: 2, r1: 8, life: 0.6 })
    },
  })
  ctx.onUpdate((t, dt) => {
    charge = Math.max(0, charge - dt * 0.4)
    const spin = 0.35 + charge * 3
    star.rotation.y += dt * spin
    star.rotation.x = Math.sin(t * 0.5) * 0.3
    star.position.y = 4.2 + Math.sin(t * 1.3) * 0.18
    inner.scale.setScalar(1 + Math.sin(t * 6) * 0.1 + charge * 0.4)
    rings.forEach((r, i) => {
      r.rotation.set(t * (0.6 + i * 0.3) * (i % 2 ? -1 : 1) + i, t * 0.4 + i * 2, 0)
      r.position.y = star.position.y
    })
    light.intensity = 18 + Math.sin(t * 9) * 4 + charge * 30 + (Math.random() < 0.03 ? 25 : 0)
    tag.position.y = 8.4 + Math.sin(t * 1.4) * 0.12
  })
}

// The JOIN EVENT billboard: a tiny animated scene of blocky jumpers on a hill.
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
    tex.needsUpdate = true
  }
  draw(0)
  return { tex, draw }
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
  machine(ctx, root, X - 6, -6)
  billboard(ctx, root, X - 16, HUB.north + 20, -Math.PI / 4)
}
