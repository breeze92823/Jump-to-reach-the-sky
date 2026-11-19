// Lucky Blocks (north-west corner of the lane gap): a heap of "?" blocks, a
// big rainbow block floating and spinning on top, fanned rainbow rays turning
// behind it, rising sparkles and magic chimes. Walking up makes the heap
// jiggle and pop a confetti burst, and opens the Lucky Blocks window (ui/panels.js).
// The heap spins faster and sparkles while you own unopened blocks, and erupts
// (fireworks for rare prizes) when you collect a prize.
import { AdditiveBlending, BoxGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight } from 'three'
import { HUB } from '../config.js'
import { bus, luckyOwned } from '../game/state.js'
import { mulberry32 } from '../textures.js'
import { solid } from './kit.js'
import { outlined, paintedTexture, paintStuds } from './paint.js'

function blockTexture(colors, mark = '?', rainbow = false) {
  const studs = paintStuds({ colors, cells: 1, studs: 4, size: 256, seed: 8 })
  return paintedTexture(256, 256, (ctx, W, H) => {
    if (rainbow) {
      const g = ctx.createLinearGradient(0, 0, W, H)
      ;['#ff4d4d', '#ffb02e', '#ffe83a', '#4dff6a', '#3ad0ff', '#7a5cff', '#ff4de0'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 0.35
      ctx.drawImage(studs.color, 0, 0)
      ctx.globalAlpha = 1
    } else ctx.drawImage(studs.color, 0, 0)
    ctx.lineWidth = 14
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.strokeRect(7, 7, W - 14, H - 14)
    outlined(ctx, mark, W / 2, H / 2 + 6, { size: 190, fill: '#ffffff', stroke: '#1b2a4a', line: 0.14 })
  })
}

export function buildLucky(ctx) {
  const x = -HUB.laneHalf - 5.2
  const z = HUB.north + 9.5
  const root = new Group()
  root.position.set(x, 0, z)
  ctx.scene.add(root)
  const rand = mulberry32(55)
  const box = new BoxGeometry(1, 1, 1)
  const kinds = [
    new MeshStandardMaterial({ map: blockTexture(['#ffd21f']), roughness: 0.4 }),
    new MeshStandardMaterial({ map: blockTexture(['#2fd6ff']), roughness: 0.4 }),
  ]
  // The heap: two layers of blocks at jaunty angles.
  const blocks = []
  const layout = [
    [-1.6, 0.6, 0.8, 1.2], [0, 0.6, 1.3, 1.25], [1.6, 0.6, 0.6, 1.2], [-0.8, 0.6, -0.7, 1.2], [0.9, 0.6, -0.9, 1.2], [2.5, 0.5, -0.3, 1], [-2.6, 0.5, -0.2, 1],
    [-0.8, 1.7, 0.3, 1.1], [0.8, 1.75, 0.2, 1.1], [0, 1.7, -0.6, 1.05], [0.1, 2.75, 0.1, 1],
  ]
  layout.forEach(([bx, by, bz, s], i) => {
    const m = new Mesh(box, kinds[i % 3 === 1 ? 1 : 0])
    m.scale.setScalar(s)
    m.position.set(bx, by * s, bz)
    m.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3)
    m.castShadow = true
    m.receiveShadow = true
    m.userData.dynamic = true
    root.add(m)
    blocks.push({ m, base: m.position.clone(), rot: m.rotation.clone(), phase: rand() * 6 })
  })
  solid(2.8, 1.3, 1.8, x, 1.3, z)

  // The rainbow block: floats, spins and shines.
  const top = new Mesh(box, new MeshStandardMaterial({ map: blockTexture(['#ffffff'], '?', true), roughness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.25 }))
  top.material.emissiveMap = top.material.map
  top.scale.setScalar(1.7)
  top.castShadow = true
  top.userData.dynamic = true
  root.add(top)

  // Rays: thin rainbow blades fanning out behind the top block, turning slowly.
  const rays = new Group()
  rays.userData.dynamic = true
  const rayGeo = new PlaneGeometry(0.5, 4.2)
  rayGeo.translate(0, 2.1, 0)
  const rayColors = ['#ff4d4d', '#ffb02e', '#ffe83a', '#4dff6a', '#3ad0ff', '#7a5cff', '#ff4de0', '#ffffff']
  for (let i = 0; i < 16; i++) {
    const c = new Color(rayColors[i % rayColors.length]).multiplyScalar(1.6)
    const r = new Mesh(rayGeo, new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    r.rotation.z = (i / 16) * Math.PI * 2
    r.scale.set(1, 0.7 + (i % 3) * 0.25, 1)
    rays.add(r)
  }
  rays.position.set(0, 4.6, -0.6)
  root.add(rays)

  const light = new PointLight('#ffe9a8', 25, 14, 2)
  light.position.set(0, 4, 1.5)
  root.add(light)

  const tag = ctx.label('Lucky Blocks', 1.8, { color: '#ffd84a', outline: '#5a2a00', outlineWidth: 16 }, { near: 35, far: 80 })
  tag.position.set(0, 7.6, 0)
  root.add(tag)

  ctx.emitter({ boxes: [{ x, y: 1.5, z, sx: 3, sy: 1.5, sz: 2 }], count: 36, life: 2.6, velocity: [0, 1.2, 0], spread: [0.4, 0.4, 0.4], size: 0.35, grow: 0.2, intensity: 2.6, twinkle: 9, sprite: 'sparkle', seed: 77, color: '#fff2a8' })
  ctx.addEmitter('chimes', x, 3, z, 0.7)

  let jiggle = 0
  let hype = 0 // 0..~2 after a prize is collected: faster spin, brighter light, bigger rays
  let spin = 0
  let rayTurn = 0
  let sparkleIn = 0
  ctx.zone({
    x0: x - 6.5,
    x1: x + 6.5,
    z0: z - 5,
    z1: z + 6,
    y0: -1,
    y1: 6,
    onEnter() {
      jiggle = 1
      ctx.sfx.magic({ x, z })
      ctx.fx.burst(x, 4.5, z, { count: 40, colors: rayColors, speed: [4, 9], up: 4, gravity: 12, life: [0.8, 1.5], size: [0.25, 0.45], drag: 1.2 })
      ctx.fx.ring(x, 0.1, z, { color: '#ffd84a', r0: 1, r1: 6, life: 0.7 })
      bus.emit('window', 'lucky')
    },
  })

  // A prize collected from a block (ui/rewards.js): the heap erupts, more for rarer prizes.
  bus.on('luckyCollect', ({ rank = 0 }) => {
    jiggle = 1.6
    hype = Math.min(2.5, hype + 1 + rank * 0.35)
    const y = top.position.y
    ctx.fx.burst(x, y, z, { sprite: 'sparkle', count: 50 + rank * 25, colors: rayColors, speed: [5, 11 + rank * 2], up: 3, gravity: 9, life: [0.9, 1.7], size: [0.35, 0.7], drag: 1 })
    ctx.fx.burst(x, y, z, { count: 30 + rank * 12, colors: ['#ffffff', '#ffe83a', '#ff4de0'], speed: [2, 5], life: [0.5, 0.9], size: [0.6, 1], drag: 3, grow: 1.8 })
    ctx.fx.ring(x, 0.12, z, { color: '#ffd84a', r0: 1, r1: 8 + rank * 2, life: 0.8 })
    ctx.fx.ring(x, 0.12, z, { color: '#ff4de0', r0: 0.5, r1: 5 + rank, life: 0.6 })
    // Rarer prizes: fireworks popping over the heap.
    for (let k = 0; k < rank; k++) {
      setTimeout(() => {
        const fx = x + (Math.random() - 0.5) * 8
        const fz = z + (Math.random() - 0.5) * 6
        const fy = 9 + Math.random() * 5
        ctx.fx.burst(fx, fy, fz, { sprite: 'sparkle', count: 45, colors: [rayColors[(k * 3) % rayColors.length], '#ffffff', rayColors[(k * 3 + 2) % rayColors.length]], speed: [5, 9], gravity: 5, life: [0.8, 1.4], size: [0.35, 0.6], drag: 1.4 })
        ctx.sfx.pop({ x: fx, y: fy, z: fz }, 500 + k * 120)
      }, 250 + k * 260)
    }
  })

  ctx.onUpdate((t, dt) => {
    jiggle = Math.max(0, jiggle - dt * 1.3)
    hype = Math.max(0, hype - dt * 0.45)
    // Unopened blocks waiting: the heap calls you over (faster spin, pulsing light, sparkles).
    const waiting = luckyOwned() > 0 ? 1 : 0
    spin += dt * (0.9 + waiting * 1.2 + hype * 4)
    rayTurn += dt * (0.25 + waiting * 0.35 + hype * 1.5)
    top.position.set(0, 4.4 + Math.sin(t * 1.7) * 0.3 + hype * 0.5, 0)
    top.rotation.set(Math.sin(t * 0.7) * 0.3, spin, Math.cos(t * 0.6) * 0.25)
    top.scale.setScalar(1.7 * (1 + hype * 0.12 + waiting * Math.max(0, Math.sin(t * 4)) * 0.06))
    rays.rotation.z = rayTurn
    rays.position.y = top.position.y + 0.2
    rays.scale.setScalar(1 + hype * 0.35 + waiting * 0.1)
    light.intensity = 22 + Math.sin(t * 3) * 6 + waiting * (8 + Math.sin(t * 6) * 8) + hype * 30
    if (waiting) {
      sparkleIn -= dt
      if (sparkleIn <= 0) {
        sparkleIn = 1.3
        ctx.fx.burst(x, top.position.y, z, { sprite: 'sparkle', count: 12, colors: rayColors, speed: [2, 4], up: 1.5, gravity: 3, life: [0.6, 1.1], size: [0.3, 0.5], drag: 1 })
      }
    }
    for (const b of blocks) {
      const k = jiggle * Math.sin(t * 22 + b.phase)
      b.m.position.y = b.base.y + Math.abs(k) * 0.35
      b.m.rotation.z = b.rot.z + k * 0.2
    }
    tag.position.y = 7.6 + Math.sin(t * 2) * 0.15
  })
  return root
}

