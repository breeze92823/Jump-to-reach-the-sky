// Lucky Blocks (north-west corner of the lane gap): a heap of "?" blocks, a
// big rainbow block floating and spinning on top, fanned rainbow rays turning
// behind it, rising sparkles and magic chimes. Walking up makes the heap
// jiggle and pop a confetti burst.
import { AdditiveBlending, BoxGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight } from 'three'
import { HUB } from '../config.js'
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
    },
  })

  ctx.onUpdate((t, dt) => {
    jiggle = Math.max(0, jiggle - dt * 1.3)
    top.position.set(0, 4.4 + Math.sin(t * 1.7) * 0.3, 0)
    top.rotation.set(Math.sin(t * 0.7) * 0.3, t * 0.9, Math.cos(t * 0.6) * 0.25)
    rays.rotation.z = t * 0.25
    rays.position.y = top.position.y + 0.2
    light.intensity = 22 + Math.sin(t * 3) * 6
    for (const b of blocks) {
      const k = jiggle * Math.sin(t * 22 + b.phase)
      b.m.position.y = b.base.y + Math.abs(k) * 0.35
      b.m.rotation.z = b.rot.z + k * 0.2
    }
    tag.position.y = 7.6 + Math.sin(t * 2) * 0.15
  })
  return root
}

