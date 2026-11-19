// SHOPS / UPGRADES (north wall, east of the lane): a row of market stalls
// under the big green sign. Each stall has a striped awning with a scalloped
// valance, a counter with its wares, a back wall with shelves and a keeper who
// turns to look at you, waves and chatters when you walk up. Two creature
// showcases on glowing red pads sit among them. Walking up to Upgrades /
// Items / Effects opens their windows (money prices only); the Sell stall opens
// Sell Brainrots. The locked stall opens after 4 Rebirths.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, SphereGeometry, SRGBColorSpace, TorusGeometry } from 'three'
import { HUB } from '../config.js'
import { neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { lego, solid, wbox } from './kit.js'
import { signTexture } from './paint.js'
import { wallSign } from './signs.js'
import { keeper, placeCreature } from './display.js'
import { bus, game } from '../game/state.js'

const box = new BoxGeometry(1, 1, 1)
const cyl = new CylinderGeometry(1, 1, 1, 16)
const ball = new SphereGeometry(1, 24, 16)
const matCache = new Map()
const mat = (c, extra) => {
  const k = c + JSON.stringify(extra ?? {})
  if (!matCache.has(k)) matCache.set(k, new MeshStandardMaterial({ color: c, roughness: 0.55, ...extra }))
  return matCache.get(k)
}
function b(parent, material, w, h, d, x, y, z, geo = box) {
  const m = new Mesh(geo, typeof material === 'string' ? mat(material) : material)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

const W = 5.6 // stall width

// The stall shell; returns { group, counterTop (y), keeperSpot }.
function stallShell(root, x, z, { stripes, wood = 'plank', back = 'woodDark', front }) {
  const g = new Group()
  g.position.set(x, 0, z)
  root.add(g)
  wbox(g, W + 0.4, 0.2, 4.6, 0, 0.1, -0.2, lego('woodDark'))
  // Counter.
  wbox(g, W - 0.4, 1.15, 1.1, 0, 0.7, 1.0, lego(wood))
  b(g, '#f0d8a8', W - 0.2, 0.12, 1.35, 0, 1.33, 1.0)
  if (front) b(g, front, W - 0.5, 0.35, 0.05, 0, 0.85, 1.57)
  // Back wall with two shelves.
  wbox(g, W, 3.2, 0.3, 0, 1.8, -2.1, lego(back))
  for (const y of [1.7, 2.6]) b(g, '#c08a52', W - 0.6, 0.1, 0.5, 0, y, -1.8)
  // Posts.
  for (const sx of [-1, 1]) for (const pz of [1.65, -2.1]) b(g, '#6b3d1f', 0.3, 3.7, 0.3, sx * (W / 2 - 0.1), 1.95, pz)
  // Awning: slanted stripes + a scalloped valance hanging off the front.
  const aw = new Group()
  aw.position.set(0, 4.05, -0.2)
  aw.rotation.x = 0.28
  g.add(aw)
  const n = 8
  for (let i = 0; i < n; i++) b(aw, stripes[i % 2], W / n + 0.01, 0.14, 4.6, -W / 2 + (i + 0.5) * (W / n), 0, 0)
  for (let i = 0; i < n; i++) {
    const s = b(aw, stripes[i % 2], W / n - 0.06, 0.5, 0.08, -W / 2 + (i + 0.5) * (W / n), -0.3, 2.3)
    s.scale.y = 0.42 + (i % 2) * 0.08
  }
  b(aw, '#6b3d1f', W + 0.2, 0.18, 0.18, 0, 0.1, -2.3)
  // Small shelf goods.
  const rand = mulberry32(Math.round(x * 13))
  for (let i = 0; i < 9; i++) {
    const c = ['#ff6b6b', '#4fc3ff', '#ffd23a', '#8b5cf6', '#5dff7a'][Math.floor(rand() * 5)]
    b(g, c, 0.28, 0.35 + rand() * 0.2, 0.28, -W / 2 + 0.6 + (i % 5) * 1.1 + rand() * 0.2, i < 5 ? 1.95 : 2.85, -1.8)
  }
  solid(W / 2 - 0.2, 0.7, 0.55, x, 0.7, z + 1.0)
  solid(W / 2, 1.8, 0.3, x, 1.8, z - 2.1)
  return g
}

// action: what the stall does when you walk up (open the store, sell...).
function addKeeper(ctx, g, x, z, look, pitch = 1, action = null) {
  const k = keeper(look)
  k.group.position.set(0, 0.2, -0.6)
  g.add(k.group)
  ctx.onUpdate((t, dt) => k.update(t, dt, ctx.player.position))
  ctx.zone({
    x0: x - W / 2,
    x1: x + W / 2,
    z0: z + 1.5,
    z1: z + 6,
    onEnter() {
      k.greet()
      ctx.sfx.greet({ x, z }, pitch)
      action?.()
    },
  })
  return k
}

function stallLabel(ctx, g, text, color, outline) {
  const s = ctx.label(text, 2.1, { color, outline, outlineWidth: 18 }, { near: 45, far: 100 })
  s.position.set(0, 6.3, 0)
  g.add(s)
  ctx.onUpdate((t) => (s.position.y = 6.3 + Math.sin(t * 1.6 + g.position.x) * 0.1))
  return s
}

function screenTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 96
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const draw = (t) => {
    const x = c.getContext('2d')
    x.fillStyle = '#0d2a5c'
    x.fillRect(0, 0, 128, 96)
    for (let i = 0; i < 3; i++) {
      const y = 70 - ((t * 30 + i * 26) % 78)
      x.strokeStyle = `rgba(80,200,255,${0.4 + i * 0.2})`
      x.lineWidth = 9
      x.beginPath()
      x.moveTo(34, y + 18)
      x.lineTo(64, y)
      x.lineTo(94, y + 18)
      x.stroke()
    }
    tex.needsUpdate = true
  }
  draw(0)
  return { tex, draw }
}

function smileyTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const x = c.getContext('2d')
  x.fillStyle = '#ffd83a'
  x.fillRect(0, 0, 256, 128)
  x.fillStyle = '#3a2a00'
  x.beginPath()
  x.ellipse(112, 52, 7, 12, 0, 0, Math.PI * 2)
  x.ellipse(144, 52, 7, 12, 0, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = '#3a2a00'
  x.lineWidth = 6
  x.beginPath()
  x.arc(128, 66, 22, 0.2, Math.PI - 0.2)
  x.stroke()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function redPad(ctx, root, x, z) {
  const g = new Group()
  g.position.set(x, 0, z)
  root.add(g)
  wbox(g, 4.4, 0.35, 4.4, 0, 0.175, 0, lego('redPad'))
  const edge = neon('#ffffff', 2.4)
  for (const [w, d, ox, oz] of [[4.6, 0.16, 0, 2.22], [4.6, 0.16, 0, -2.22], [0.16, 4.6, 2.22, 0], [0.16, 4.6, -2.22, 0]]) b(g, edge, w, 0.1, d, ox, 0.36, oz)
  solid(2.2, 0.175, 2.2, x, 0.175, z)
  return g
}

export function buildShops(ctx) {
  const N = HUB.north
  const z = N + 4.6
  const root = new Group()
  ctx.scene.add(root)

  const sign = signTexture({
    w: 1024,
    h: 600,
    colors: ['#3ccf4c', '#2fb83f'],
    lines: [
      { text: 'SHOPS', size: 170 },
      { text: 'UPGRADES', size: 170 },
    ],
    stroke: '#0f3a16',
    rotate: -9,
  })
  wallSign(root, sign, 16, 9.4, 43, 16, N + 0.2, 0, 0)

  // 1. Showcase: a rainbow creature on a red pad, beside the lane.
  const s1 = redPad(ctx, root, 21, z + 0.6)
  placeCreature(ctx, s1, { species: 'bananaut', variant: 'rainbow', x: 0, y: 0.35, z: 0, scale: 1.35, labelFar: 60, labelLine: 0.75, seed: 3 })

  // 2. Upgrades: blue + white awning, a monitor with chevrons streaming up, a floating hologram arrow.
  {
    const x = 28.5
    const g = stallShell(root, x, z, { stripes: ['#2b8ff0', '#ffffff'], front: '#2b8ff0' })
    addKeeper(ctx, g, x, z, { skin: '#f2c79a', shirt: '#2b8ff0', pants: '#26324a', hat: 'cap', hatColor: '#ffffff' }, 1.1, () => bus.emit('window', 'upgrades'))
    b(g, '#2a2f3a', 1.3, 0.95, 0.15, -1.3, 1.95, 0.95)
    const scr = screenTexture()
    const screen = b(g, new MeshBasicMaterial({ map: scr.tex }), 1.15, 0.8, 0.02, -1.3, 1.95, 1.04)
    screen.castShadow = false
    b(g, '#2a2f3a', 0.2, 0.3, 0.2, -1.3, 1.45, 0.95)
    for (const [cx, s] of [[0.9, 0.55], [1.7, 0.45]]) b(g, '#2f9bf5', s, s, s, cx, 1.39 + s / 2, 0.9)
    const holo = new Group()
    holo.userData.dynamic = true
    holo.position.set(0.4, 2.6, 0.9)
    g.add(holo)
    const hm = neon('#3ad0ff', 3, { transparent: true, opacity: 0.85 })
    for (const yy of [0, 0.38]) for (const s of [-1, 1]) {
      const bar = b(holo, hm, 0.55, 0.13, 0.1, s * 0.2, yy, 0)
      bar.rotation.z = s * -0.75
      bar.castShadow = false
    }
    ctx.onUpdate((t) => {
      holo.position.y = 2.6 + Math.sin(t * 2) * 0.12
      holo.rotation.y = t * 1.5
      scr.draw(t)
    })
    stallLabel(ctx, g, 'Upgrades', '#33d6ff', '#0b2a5a')
  }

  // 3. Items: warm brown awning, a bouncing smiley ball, a coin sack and potions.
  {
    const x = 35.5
    const g = stallShell(root, x, z, { stripes: ['#a3612f', '#e7c08a'], front: '#ffd23a' })
    addKeeper(ctx, g, x, z, { skin: '#c98a5a', shirt: '#e85a3a', pants: '#3a2a1a', hat: 'hood', hatColor: '#6b3d1f', beard: '#4a2a14' }, 0.85, () => bus.emit('window', 'items'))
    const smile = b(g, new MeshStandardMaterial({ map: smileyTexture(), roughness: 0.35 }), 0.45, 0.45, 0.45, -1.2, 1.85, 0.95, ball)
    const sack = b(g, '#b07a44', 0.45, 0.4, 0.45, 0.3, 1.78, 0.9, ball)
    smile.userData.dynamic = true
    sack.userData.dynamic = true
    b(g, '#7a4a1a', 0.2, 0.15, 0.2, 0.3, 2.2, 0.9, cyl)
    b(g, '#ffd23a', 0.12, 0.04, 0.12, 0.3, 1.9, 1.3, cyl)
    for (const [px, c] of [[1.3, '#ff4fa0'], [1.7, '#4fe0ff'], [2.1, '#7dff4a']]) {
      b(g, new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.15, transparent: true, opacity: 0.85 }), 0.17, 0.35, 0.17, px, 1.57, 0.95, cyl)
      b(g, '#f0f0f0', 0.08, 0.1, 0.08, px, 1.8, 0.95, cyl)
    }
    ctx.onUpdate((t) => {
      smile.position.y = 1.85 + Math.abs(Math.sin(t * 3)) * 0.35
      smile.rotation.y = Math.sin(t) * 0.6
      sack.scale.y = 0.4 + Math.sin(t * 2) * 0.015
    })
    stallLabel(ctx, g, 'Items', '#ffd84a', '#4a2a00')
  }

  // 4. Locked stall: covered with a tarp until 4 Rebirths.
  {
    const x = 42.5
    const g = stallShell(root, x, z, { stripes: ['#7a2f2f', '#4a3a3a'], front: '#555555' })
    const tarp = b(g, '#5e6672', W - 0.2, 0.9, 1.5, 0, 1.8, 0.95)
    tarp.rotation.x = 0.04
    for (const s of [-1, 1]) b(g, '#e0b030', 0.12, 1.0, 1.55, s * 1.4, 1.75, 0.95)
    const lock = new Group()
    lock.userData.dynamic = true
    lock.position.set(0, 2.9, 1.3)
    g.add(lock)
    b(lock, '#ffcc33', 0.7, 0.6, 0.25, 0, 0, 0)
    const shackle = b(lock, '#cfd5dd', 0.42, 0.42, 0.42, 0, 0.36, 0, new TorusGeometry(1, 0.22, 8, 16, Math.PI))
    shackle.scale.set(0.27, 0.32, 0.27)
    const s = ctx.label('Locked\n4 Rebirths', 2.4, { colors: ['#ff3b3b', '#ff7ad9'], outline: '#2a0a0a', outlineWidth: 16 }, { near: 30, far: 70 })
    s.position.set(0, 6.3, 0)
    g.add(s)
    let shake = 0
    ctx.zone({
      x0: x - W / 2,
      x1: x + W / 2,
      z0: z + 1.5,
      z1: z + 5,
      onEnter() {
        if (game.rebirths >= 4) {
          bus.emit('store', 'boosts')
          return
        }
        shake = 0.6
        ctx.sfx.locked({ x, z })
        const p = ctx.player.position
        ctx.fx.floatText('Need 4 Rebirths', p.x, p.y + 3, p.z, { color: '#ff7ad9', stroke: '#3a0030', size: 0.8, wobble: 0.12 })
      },
    })
    ctx.onUpdate((t, dt) => {
      shake = Math.max(0, shake - dt)
      lock.rotation.z = shake > 0 ? Math.sin(t * 50) * shake * 0.6 : Math.sin(t * 2) * 0.05
      s.position.y = 6.3 + Math.sin(t * 1.6) * 0.1
    })
  }

  // 5. Effects: a dark stall with torches and a swirling blue orb.
  {
    const x = 49.5
    const g = stallShell(root, x, z, { stripes: ['#1c1f2b', '#2f3448'], wood: 'woodDark', back: 'woodDark', front: '#6b4cff' })
    addKeeper(ctx, g, x, z, { skin: '#d9b08c', shirt: '#2a2240', pants: '#15121f', hat: 'top', hatColor: '#15121f' }, 0.7, () => bus.emit('store', 'boosts'))
    const orb = b(g, neon('#3aa8ff', 3.2), 0.42, 0.42, 0.42, 0, 2.05, 1.0, ball)
    orb.castShadow = false
    orb.userData.dynamic = true
    b(g, '#2a2f3a', 0.4, 0.3, 0.4, 0, 1.55, 1.0, cyl)
    const ring = b(g, new MeshBasicMaterial({ color: new Color('#7ad8ff').multiplyScalar(2), transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }), 0.65, 0.65, 0.65, 0, 2.05, 1.0, new TorusGeometry(1, 0.05, 6, 32))
    ring.castShadow = false
    ring.userData.dynamic = true
    const light = new PointLight('#4ab0ff', 14, 10, 2)
    light.position.set(0, 2.4, 1.6)
    g.add(light)
    root.updateMatrixWorld(true)
    const fires = []
    for (const s of [-1, 1]) {
      b(g, '#3a2a1a', 0.16, 0.6, 0.16, s * (W / 2 - 0.1), 3.95, 1.85, cyl)
      b(g, '#222222', 0.3, 0.2, 0.3, s * (W / 2 - 0.1), 4.3, 1.85, cyl)
      fires.push({ x: x + s * (W / 2 - 0.1), y: 4.45, z: z + 1.85, sx: 0.08, sy: 0.02, sz: 0.08 })
    }
    ctx.emitter({ boxes: fires, count: 50, life: 0.6, velocity: [0, 1.8, 0], spread: [0.25, 0.4, 0.25], size: 0.5, grow: 0.15, color: '#ff8a20', intensity: 3.2, seed: 91 })
    ctx.emitter({ boxes: fires, count: 14, life: 1.4, velocity: [0, 2, 0], spread: [0.5, 0.5, 0.5], size: 0.1, grow: 0.5, color: '#ffc060', intensity: 4, twinkle: 10, sprite: 'sparkle', seed: 92 })
    ctx.emitter({ boxes: [{ x, y: 2.05, z: z + 1.0, sx: 0.5, sy: 0.5, sz: 0.5 }], count: 18, life: 1.2, velocity: [0, 0.6, 0], spread: [0.4, 0.3, 0.4], size: 0.22, color: '#8fdcff', intensity: 3, twinkle: 9, sprite: 'sparkle', seed: 93 })
    ctx.addEmitter('fire', x, 4.4, z + 1.85, 0.6)
    ctx.onUpdate((t) => {
      orb.scale.setScalar(0.42 + Math.sin(t * 4) * 0.03)
      ring.rotation.set(t * 1.3, t * 0.9, 0)
      light.intensity = 12 + Math.sin(t * 7) * 2 + Math.sin(t * 13) * 1.5
    })
    stallLabel(ctx, g, 'Effects', '#c08bff', '#2a0f4a')
  }

  // 6. Showcase: an Epic creature on a red pad.
  const s2 = redPad(ctx, root, 56.5, z + 0.6)
  placeCreature(ctx, s2, { species: 'dragoncino', variant: 'golden', x: 0, y: 0.35, z: 0, scale: 1.1, labelFar: 60, labelLine: 0.7, seed: 6 })

  // 7. Sell: sunny yellow awning, a till, a heap of gold, a keeper in an apron.
  {
    const x = 63.8
    const g = stallShell(root, x, z, { stripes: ['#ffd21f', '#fff6d0'], front: '#ffd21f' })
    addKeeper(ctx, g, x, z, { skin: '#f2c79a', shirt: '#4a8a3a', pants: '#3a2a1a', hat: 'bandana', hatColor: '#d63a3a', apron: '#f0ead8', beard: '#8a5a2a' }, 0.95, () => bus.emit('window', 'sell'))
    b(g, '#3a3f4a', 0.9, 0.5, 0.6, -1.4, 1.65, 0.95)
    b(g, '#5a606c', 0.8, 0.25, 0.35, -1.4, 2.0, 0.85)
    b(g, '#7dff6a', 0.5, 0.12, 0.02, -1.4, 2.02, 1.03)
    const gold = mat('#ffcf33', { metalness: 0.85, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.5 })
    const rand = mulberry32(17)
    for (let i = 0; i < 16; i++) {
      const c = b(g, gold, 0.22, 0.05, 0.22, 0.9 + (rand() - 0.5) * 1.1, 1.42 + (i % 6) * 0.055, 0.95 + (rand() - 0.5) * 0.6, cyl)
      c.rotation.set((rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.4)
    }
    root.updateMatrixWorld(true)
    ctx.emitter({ boxes: [{ x: x + 0.9, y: 1.7, z: z + 0.95, sx: 0.6, sy: 0.2, sz: 0.3 }], count: 10, life: 1.3, velocity: [0, 0.4, 0], spread: [0.2, 0.2, 0.2], size: 0.3, color: '#fff0a0', intensity: 3, twinkle: 10, sprite: 'sparkle', seed: 95 })
    stallLabel(ctx, g, 'Sell', '#ffe14a', '#4a3000')
  }
  return root
}

