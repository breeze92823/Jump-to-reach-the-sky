// SHOPS / UPGRADES (north wall, east of the lane): a row of market stalls
// under the big green sign. Each stall has a striped awning with a scalloped
// valance, a counter with its wares, a back wall with shelves and a keeper who
// turns to look at you, waves and chatters when you walk up. Two creature
// showcases on glowing red pads sit among them. Walking up to Upgrades /
// Items / Effects opens their windows (money prices only); the Sell stall opens
// Sell Brainrots. The Ascended Shop stall unveils at ASCENDED.unlock.rebirths.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, SphereGeometry, SRGBColorSpace, TorusGeometry } from 'three'
import { ASCENDED, HUB } from '../config.js'
import { neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { lego, solid, wbox } from './kit.js'
import { signTexture } from './paint.js'
import { wallSign } from './signs.js'
import { keeper, placeCreature } from './display.js'
import { ascendedUnlocked, bus, game } from '../game/state.js'

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

  // 4. Ascended Shop: a royal stall covered with a tarp until ASCENDED.unlock.rebirths. Walking up
  // always opens the shop (a locked preview before that). When the rebirth lands, the stall unveils:
  // the lock rattles and bursts, the tarp flies off and a golden crown rises over a velvet cushion.
  {
    const x = 42.5
    const need = ASCENDED.unlock.rebirths
    const g = stallShell(root, x, z, { stripes: ['#7a2fd8', '#ffc21f'], front: '#ffb11f' })
    b(g, '#7a2fd8', 1.1, 0.22, 1.1, 0, 1.5, 1.0) // velvet cushion
    b(g, '#ffd23a', 1.16, 0.06, 1.16, 0, 1.4, 1.0)
    // The cover: a tarp with straps and a padlock (dynamic: it flies off).
    const cover = new Group()
    cover.userData.dynamic = true
    g.add(cover)
    const tarp = b(cover, '#5e6672', W - 0.2, 0.9, 1.5, 0, 1.8, 0.95)
    tarp.rotation.x = 0.04
    for (const sx of [-1, 1]) b(cover, '#e0b030', 0.12, 1.0, 1.55, sx * 1.4, 1.75, 0.95)
    const lock = new Group()
    lock.position.set(0, 2.9, 1.3)
    cover.add(lock)
    b(lock, '#ffcc33', 0.7, 0.6, 0.25, 0, 0, 0)
    const shackle = b(lock, '#cfd5dd', 0.42, 0.42, 0.42, 0, 0.36, 0, new TorusGeometry(1, 0.22, 8, 16, Math.PI))
    shackle.scale.set(0.27, 0.32, 0.27)
    // The crown over the cushion, inside a slowly turning golden halo.
    const crown = new Group()
    crown.userData.dynamic = true
    crown.position.set(0, 2.25, 1.0)
    g.add(crown)
    const gold = new MeshStandardMaterial({ color: '#ffc21f', metalness: 0.85, roughness: 0.22, emissive: '#ff9a1f', emissiveIntensity: 0.35 })
    b(crown, gold, 0.62, 0.32, 0.62, 0, 0, 0, cyl)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      b(crown, gold, 0.16, 0.42, 0.16, Math.cos(a) * 0.5, 0.36, Math.sin(a) * 0.5, new ConeGeometry(1, 1, 6))
      b(crown, neon(['#ff4de0', '#3ad0ff', '#5dff4a', '#ff7a1a', '#ffe83a'][i], 3), 0.09, 0.09, 0.09, Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62, ball)
    }
    const halo = b(crown, new MeshBasicMaterial({ color: new Color('#ffd23a').multiplyScalar(2.2), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }), 0.95, 0.95, 0.95, 0, 0.15, 0, new TorusGeometry(1, 0.04, 6, 40))
    halo.castShadow = false
    halo.userData.dynamic = true
    const light = new PointLight('#c47aff', 0, 11, 2)
    light.position.set(0, 2.8, 1.8)
    g.add(light)
    const lockedTag = ctx.label(`Locked\n${need} Rebirths`, 2.4, { colors: ['#ff3b3b', '#ff7ad9'], outline: '#2a0a0a', outlineWidth: 16 }, { near: 30, far: 70 })
    lockedTag.position.set(0, 6.3, 0)
    g.add(lockedTag)
    const openTag = ctx.label('Ascended', 2.3, { color: '#ffd23a', outline: '#3a0f6a', outlineWidth: 18 }, { near: 45, far: 100 })
    openTag.position.set(0, 6.3, 0)
    g.add(openTag)

    // State: 'locked' -> 'unveil' (u seconds into the show) -> 'open'.
    let phase = ascendedUnlocked() ? 'open' : 'locked'
    let u = 0
    let shake = 0
    let hype = 0 // after a purchase: faster spin, brighter light
    let sparkIn = 0
    const W0 = () => g.localToWorld(crown.position.clone())
    // (Labels are detached rather than hidden: the hub's distance fade drives their `visible`.)
    const setOpenLook = (k) => {
      cover.visible = k < 1
      crown.visible = k > 0
      if (k >= 1) {
        lockedTag.removeFromParent()
        g.add(openTag)
      } else {
        openTag.removeFromParent()
        g.add(lockedTag)
      }
    }
    setOpenLook(phase === 'open' ? 1 : 0)
    crown.scale.setScalar(phase === 'open' ? 1 : 0.001)
    ctx.zone({
      x0: x - W / 2,
      x1: x + W / 2,
      z0: z + 1.5,
      z1: z + 5,
      onEnter() {
        if (phase === 'locked') {
          shake = 0.6
          ctx.sfx.locked({ x, z })
          const p = ctx.player.position
          ctx.fx.floatText(`Need ${need} Rebirths`, p.x, p.y + 3, p.z, { color: '#ff7ad9', stroke: '#3a0030', size: 0.8, wobble: 0.12 })
        } else {
          hype = Math.max(hype, 0.6)
          ctx.sfx.magic({ x, z })
          const c = W0()
          ctx.fx.burst(c.x, c.y + 0.5, c.z, { sprite: 'sparkle', count: 30, colors: ['#ffd23a', '#c47aff', '#ffffff'], speed: [3, 7], up: 2, gravity: 6, life: [0.5, 1], size: [0.3, 0.55] })
        }
        bus.emit('window', 'ascended')
      },
    })
    // A perk bought: the crown spins up and showers the perk's colour.
    bus.on('ascendedBuy', ({ id }) => {
      if (phase !== 'open') return
      hype = 1.5
      const col = ASCENDED.perks.find((p) => p.id === id)?.color ?? '#ffd23a'
      const c = W0()
      ctx.fx.burst(c.x, c.y + 0.4, c.z, { sprite: 'sparkle', count: 45, colors: [col, '#ffffff', '#ffd23a'], speed: [4, 9], up: 3, gravity: 7, life: [0.7, 1.3], size: [0.35, 0.65], drag: 1 })
      ctx.fx.ring(x, 0.25, z + 2.5, { color: col, r0: 0.5, r1: 6, life: 0.7 })
    })
    ctx.onUpdate((t, dt) => {
      if (phase === 'locked' && ascendedUnlocked()) {
        phase = 'unveil'
        u = 0
        ctx.sfx.ascendUnlock()
      }
      if (phase === 'unveil') {
        u += dt
        const c = W0()
        // 0..0.9 s: the lock rattles harder and harder, sparks spitting.
        if (u < 0.9) {
          lock.rotation.z = Math.sin(t * 60) * (0.2 + u * 0.6)
          lock.scale.setScalar(1 + u * 0.4)
          if (Math.random() < 0.3) ctx.fx.burst(c.x, c.y + 1.2, c.z + 0.3, { sprite: 'sparkle', count: 4, colors: ['#ffd23a', '#ffffff'], speed: [2, 4], life: [0.2, 0.4], size: [0.25, 0.4] })
        } else if (u < 2.2) {
          // 0.9 s: the lock bursts; the tarp flies up and away while the crown rises.
          if (lock.visible) {
            lock.visible = false
            ctx.sfx.unlock({ x, z })
            ctx.fx.burst(c.x, c.y + 0.7, c.z + 0.3, { sprite: 'sparkle', count: 50, colors: ['#ffcc33', '#ffffff', '#c47aff'], speed: [4, 10], gravity: 6, life: [0.5, 1], size: [0.35, 0.6] })
            ctx.fx.ring(x, 0.25, z + 1.5, { color: '#ffd23a', r0: 0.5, r1: 9, life: 0.9 })
          }
          const k = Math.min(1, (u - 0.9) / 0.9)
          cover.position.set(0, k * k * 7, -k * 2)
          cover.rotation.set(-k * 1.4, k * 0.6, k * 0.3)
          cover.scale.setScalar(Math.max(0.001, 1 - k))
          crown.visible = true
          const e = 1 - (1 - k) ** 3
          crown.scale.setScalar(Math.max(0.001, e + Math.sin(k * Math.PI) * 0.4))
          light.intensity = 40 * k
        } else {
          phase = 'open'
          setOpenLook(1)
          crown.scale.setScalar(1)
          hype = 2
          ctx.fx.burst(c.x, c.y + 0.5, c.z, { sprite: 'sparkle', count: 90, colors: ['#ffd23a', '#c47aff', '#ffffff', '#ff4de0'], speed: [5, 12], up: 4, gravity: 7, life: [0.8, 1.6], size: [0.4, 0.75], drag: 0.8 })
          ctx.fx.burst(c.x, c.y + 0.5, c.z, { count: 40, colors: ['#ffd23a', '#7a2fd8', '#ffffff'], speed: [2, 5], life: [0.5, 0.9], size: [0.6, 1], drag: 3, grow: 1.8 })
          for (let i = 0; i < 4; i++) setTimeout(() => ctx.fx.burst(x + (Math.random() - 0.5) * 6, 9 + Math.random() * 3, z + (Math.random() - 0.5) * 3, { sprite: 'sparkle', count: 40, colors: ['#ffd23a', '#ffffff', i % 2 ? '#c47aff' : '#ff4de0'], speed: [4, 8], gravity: 5, life: [0.8, 1.3], size: [0.35, 0.6], drag: 1.3 }), 200 + i * 230)
          bus.emit('banner', { title: 'ASCENDED SHOP OPEN!', sub: 'Permanent perks at the SHOPS row', color: '#ffd23a' })
        }
      }
      if (phase === 'locked') {
        shake = Math.max(0, shake - dt)
        lock.rotation.z = shake > 0 ? Math.sin(t * 50) * shake * 0.6 : Math.sin(t * 2) * 0.05
      }
      if (phase === 'open') {
        hype = Math.max(0, hype - dt * 0.7)
        crown.rotation.y += dt * (0.8 + hype * 6)
        crown.position.y = 2.25 + Math.sin(t * 1.8) * 0.12 + hype * 0.25
        halo.rotation.set(Math.PI / 2 + Math.sin(t * 0.9) * 0.3, t * 0.7, 0)
        light.intensity = 16 + Math.sin(t * 3) * 4 + hype * 20
        sparkIn -= dt
        if (sparkIn <= 0) {
          sparkIn = 0.7
          const c = W0()
          ctx.fx.burst(c.x, c.y + 0.3, c.z, { sprite: 'sparkle', count: 6, colors: ['#ffd23a', '#c47aff', '#ffffff'], speed: [1, 2.5], up: 1, gravity: 1, life: [0.6, 1.1], size: [0.25, 0.45] })
        }
      }
      lockedTag.position.y = openTag.position.y = 6.3 + Math.sin(t * 1.6) * 0.1
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

