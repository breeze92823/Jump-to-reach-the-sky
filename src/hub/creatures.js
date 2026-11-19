// Collectible creatures: chunky voxel critters with personality. Each species
// is built from boxes (plus a few spheres/cones), has blinking eyes and an idle
// animation, and can come in a variant that restyles every body part:
//   normal, golden (polished metal), diamond (glassy, sparkling), rainbow
//   (hue cycling, glowing) and lava (dark rock with glowing cracks + fire).
// buildCreature(species, variant, seed) -> { group, update(t, dt), height, fire: [local points] }
// Materials are shared per species + variant, and each model is compacted to
// one mesh per material per animated group (a lane full of them stays cheap).
import { BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, OctahedronGeometry, RepeatWrapping, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry } from 'three'
import { mulberry32 } from '../textures.js'
import { compact } from '../bake.js'
import { CREATURES } from '../config.js'

const box = new BoxGeometry(1, 1, 1)
const sphere = new SphereGeometry(1, 20, 14)
const cone = new ConeGeometry(1, 1, 16)
const cyl = new CylinderGeometry(1, 1, 1, 18)
const cylZ = new CylinderGeometry(1, 1, 1, 20).rotateX(Math.PI / 2) // axis along +Z (discs facing forward)
const tri = new CylinderGeometry(1, 1, 1, 3) // triangular prism (pizza slice)
const octa = new OctahedronGeometry(1, 0)
const handleGeo = new TorusGeometry(0.3, 0.075, 8, 18, Math.PI)
const haloGeo = new TorusGeometry(0.42, 0.06, 8, 28)
const skirtGeo = new CylinderGeometry(1, 1.12, 1, 18)
const starGeo = (() => {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 0.46 : 1.05
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 })
  g.translate(0, 0, -0.17)
  return g
})()

// Waffle cone: a criss-cross grid of darker grooves on biscuit.
let waffleTex = null
function waffle() {
  if (waffleTex) return waffleTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#e2a35a'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = '#a8692c'
  ctx.lineWidth = 7
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + 128, 128)
    ctx.moveTo(i + 128, 0)
    ctx.lineTo(i, 128)
    ctx.stroke()
  }
  waffleTex = new CanvasTexture(c)
  waffleTex.colorSpace = SRGBColorSpace
  waffleTex.wrapS = waffleTex.wrapT = RepeatWrapping
  waffleTex.repeat.set(3, 2)
  return waffleTex
}

function part(parent, geo, material, w, h, d, x, y, z) {
  const m = new Mesh(geo, material)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

// Lava rock: near-black stone with branching glowing cracks (emissive map).
let lavaTex = null
function lavaTextures() {
  if (lavaTex) return lavaTex
  const rand = mulberry32(77)
  const size = 256
  const col = document.createElement('canvas')
  col.width = col.height = size
  const emi = document.createElement('canvas')
  emi.width = emi.height = size
  const c = col.getContext('2d')
  const e = emi.getContext('2d')
  c.fillStyle = '#231816'
  c.fillRect(0, 0, size, size)
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(${40 + rand() * 30},${25 + rand() * 15},${20},0.5)`
    c.fillRect(rand() * size, rand() * size, 10 + rand() * 40, 10 + rand() * 40)
  }
  e.fillStyle = '#000'
  e.fillRect(0, 0, size, size)
  for (const ctx of [c, e]) {
    const r2 = mulberry32(5)
    for (let k = 0; k < 14; k++) {
      let x = r2() * size
      let y = r2() * size
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += (r2() - 0.5) * 70
        y += (r2() - 0.5) * 70
        ctx.lineTo(x, y)
      }
      ctx.strokeStyle = ctx === c ? '#ff7a1a' : '#ffffff'
      ctx.lineWidth = 3 + r2() * 3
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
  }
  const map = new CanvasTexture(col)
  map.colorSpace = SRGBColorSpace
  const emissiveMap = new CanvasTexture(emi)
  lavaTex = { map, emissiveMap }
  return lavaTex
}

// Materials for one species + variant: role -> material, restyled by the variant.
// Roles that keep their look in every variant: eyes, pupils, glass, steam and
// 'glow' (self-lit lights). spec.glow lists roles that glow in the normal variant.
// Face details (mouths, tongues, teeth, eye shines) keep their look too, so a
// golden or diamond brainrot still reads as a face.
const KEEP = new Set(['eye', 'pupil', 'glass', 'steam', 'glow', 'mouth', 'tongue', 'tooth', 'shine'])
// Shared detail roles any species may use without listing them.
const DEFAULT_COLORS = { mouth: '#3a0d14', tongue: '#ff6b8a', tooth: '#ffffff', shine: '#ffffff', cheek: '#ff9db0', shoe: '#d63a3a', sole: '#f4f4f4', glove: '#ffffff', brow: '#2a1a10', lace: '#ffffff' }
const palettes = new Map()
function palette(species, spec, variant) {
  const key = species + '|' + variant
  if (palettes.has(key)) return palettes.get(key)
  const colors = spec.colors
  const cache = new Map()
  let rainbow = null
  const get = (role) => {
    if (cache.has(role)) return cache.get(role)
    const base = colors[role] ?? DEFAULT_COLORS[role] ?? '#ff00ff'
    let m
    if (KEEP.has(role)) {
      if (role === 'glass') m = new MeshPhysicalMaterial({ color: '#cfefff', roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.45, thickness: 0.2 })
      else if (role === 'steam') m = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.6, depthWrite: false })
      else if (role === 'glow') m = new MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 1.6, roughness: 0.4 })
      else m = new MeshStandardMaterial({ color: base, roughness: role === 'pupil' ? 0.2 : 0.4 })
    } else if (variant === 'golden') {
      const c = new Color(base).lerp(new Color('#ffc53a'), 0.75)
      m = new MeshStandardMaterial({ color: c, metalness: 0.95, roughness: 0.22, emissive: '#3a2400', emissiveIntensity: 0.4 })
    } else if (variant === 'diamond') {
      const c = new Color(base).lerp(new Color('#8eefff'), 0.7)
      m = new MeshPhysicalMaterial({ color: c, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, emissive: '#1a6f8a', emissiveIntensity: 0.35, sheen: 1, sheenColor: '#ffffff' })
    } else if (variant === 'rainbow') {
      rainbow ??= new MeshStandardMaterial({ color: '#ff3b3b', roughness: 0.35, emissive: '#ff3b3b', emissiveIntensity: 0.45 })
      m = rainbow
    } else if (variant === 'lava') {
      const t = lavaTextures()
      m = new MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: '#ff6a10', emissiveIntensity: 2.2, roughness: 0.85 })
    } else {
      const glow = spec.glow?.[role]
      const extra = role === 'ghost' ? { transparent: true, opacity: 0.86, emissive: '#bcd6ff', emissiveIntensity: 0.35 } : {}
      m = new MeshStandardMaterial({ color: base, roughness: 0.55, ...(glow ? { emissive: base, emissiveIntensity: glow } : {}), ...extra })
      if (spec.maps?.[role]) m.map = spec.maps[role]()
    }
    cache.set(role, m)
    return m
  }
  const out = { get, rainbow: () => rainbow }
  palettes.set(key, out)
  return out
}

// Two eyes (white box + black pupil + a tiny shine) on a head front; returns blinkers.
function eyes(parent, M, x, y, z, s = 0.22, gap = 0.2) {
  const out = []
  for (const side of [-1, 1]) {
    const e = new Group()
    e.position.set(x + side * gap, y, z)
    part(e, box, M('eye'), s, s * 1.1, 0.06, 0, 0, 0)
    part(e, box, M('pupil'), s * 0.5, s * 0.6, 0.07, side * 0.02, -0.02, 0.01)
    part(e, box, M('shine'), s * 0.16, s * 0.18, 0.075, side * 0.02 + s * 0.1, s * 0.12, 0.02)
    parent.add(e)
    out.push(e)
  }
  return out
}
// A smiling mouth: dark slot, tongue, optional teeth.
function mouth(parent, M, x, y, z, w = 0.34, { teeth = 0, tongue = true } = {}) {
  part(parent, box, M('mouth'), w, w * 0.28, 0.05, x, y, z)
  if (tongue) part(parent, box, M('tongue'), w * 0.5, w * 0.12, 0.055, x, y - w * 0.07, z + 0.003)
  for (let i = 0; i < teeth; i++) part(parent, box, M('tooth'), w * 0.14, w * 0.1, 0.06, x + (i - (teeth - 1) / 2) * w * 0.24, y + w * 0.09, z + 0.004)
}
// Chunky cartoon sneakers (sole + upper + lace stripe).
function shoes(parent, M, gap, y = 0, len = 0.42, w = 0.3) {
  for (const s of [-1, 1]) {
    part(parent, box, M('sole'), w + 0.04, 0.08, len + 0.04, s * gap, y + 0.04, 0.06)
    part(parent, box, M('shoe'), w, 0.2, len, s * gap, y + 0.18, 0.05)
    part(parent, box, M('lace'), w * 0.6, 0.04, 0.12, s * gap, y + 0.29, 0.12)
  }
}
// Rosy cheeks on a face front.
function cheeks(parent, M, x, y, z, gap, s = 0.14) {
  for (const side of [-1, 1]) part(parent, box, M('cheek'), s, s * 0.5, 0.04, x + side * gap, y, z)
}

const SPECIES = {
  toastino: {
    colors: { body: '#c9ccd4', trim: '#8c919e', bread: '#e7b46a', crust: '#9a5a22', eye: '#ffffff', pupil: '#111111', leg: '#5a5f6b', slot: '#2a2d35', butter: '#fff1a0', dial: '#e8394a', shoe: '#3a6fe0' },
    build(g, M, rig) {
      part(g, box, M('body'), 1.5, 1.0, 1.0, 0, 0.9, 0)
      part(g, box, M('body'), 1.38, 0.1, 0.88, 0, 1.44, 0) // rounded top lip
      part(g, box, M('trim'), 1.56, 0.12, 1.06, 0, 0.42, 0)
      part(g, box, M('trim'), 1.56, 0.06, 1.06, 0, 1.38, 0)
      for (const s of [-1, 1]) part(g, box, M('slot'), 0.56, 0.04, 0.24, s * 0.32, 1.5, 0) // bread slots
      part(g, box, M('trim'), 0.1, 0.35, 0.3, 0.8, 1.0, 0) // lever
      part(g, box, M('dial'), 0.14, 0.1, 0.34, 0.83, 1.2, 0) // lever knob
      part(g, cylZ, M('dial'), 0.13, 0.13, 0.06, 0.55, 0.62, 0.51) // browning dial
      part(g, box, M('shine'), 0.06, 0.62, 0.02, -0.62, 0.95, 0.51) // chrome glint
      for (const s of [-1, 1]) {
        part(g, box, M('leg'), 0.22, 0.4, 0.22, s * 0.5, 0.2, 0)
        const arm = new Group()
        arm.position.set(s * 0.78, 0.85, 0)
        part(arm, box, M('leg'), 0.12, 0.42, 0.12, s * 0.06, -0.18, 0)
        part(arm, sphere, M('glove'), 0.12, 0.12, 0.12, s * 0.08, -0.42, 0.02)
        g.add(arm)
        rig.arms.push(arm)
        const slice = new Group()
        slice.position.set(s * 0.32, 1.35, 0)
        part(slice, box, M('bread'), 0.5, 0.6, 0.16, 0, 0.1, 0)
        part(slice, box, M('crust'), 0.56, 0.12, 0.18, 0, 0.42, 0)
        part(slice, box, M('crust'), 0.06, 0.6, 0.18, -0.27, 0.1, 0)
        part(slice, box, M('crust'), 0.06, 0.6, 0.18, 0.27, 0.1, 0)
        part(slice, box, M('butter'), 0.18, 0.06, 0.1, 0.05, 0.5, 0.02)
        g.add(slice)
        rig.slices.push(slice)
      }
      shoes(g, M, 0.5, -0.02, 0.38, 0.28)
      rig.eyes = eyes(g, M, 0, 0.98, 0.51, 0.24, 0.32)
      mouth(g, M, 0, 0.7, 0.51, 0.34, { teeth: 2 })
      cheeks(g, M, 0, 0.8, 0.51, 0.5)
      return 1.9
    },
    animate(rig, t, g) {
      rig.slices.forEach((s, i) => (s.position.y = 1.35 + Math.max(0, Math.sin(t * 2.4 + i * 1.6)) * 0.25))
      rig.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.15 + Math.max(0, Math.sin(t * 2.4 + i * 1.6)) * 0.35)))
      g.rotation.z = Math.sin(t * 2) * 0.04
    },
  },
  cactuzzo: {
    colors: { body: '#3fae49', dark: '#2d8a38', spike: '#f5f0d8', flower: '#ff5fa8', heart: '#ffd23a', eye: '#ffffff', pupil: '#111111', stache: '#4a2a14', pot: '#d8743c', band: '#2f9ad6', soil: '#5a3a22' },
    build(g, M, rig) {
      part(g, box, M('pot'), 1.1, 0.6, 1.1, 0, 0.3, 0)
      part(g, box, M('pot'), 1.25, 0.16, 1.25, 0, 0.62, 0)
      part(g, box, M('body'), 0.8, 1.9, 0.8, 0, 1.6, 0)
      part(g, box, M('dark'), 0.82, 0.12, 0.82, 0, 1.0, 0)
      for (const s of [-1, 1]) {
        const arm = new Group()
        arm.position.set(s * 0.4, 1.5 + (s > 0 ? 0.2 : 0), 0)
        part(arm, box, M('body'), 0.5, 0.3, 0.32, s * 0.25, 0, 0)
        part(arm, box, M('body'), 0.32, 0.65, 0.32, s * 0.45, 0.3, 0)
        g.add(arm)
        rig.arms.push(arm)
      }
      const rand = mulberry32(9)
      for (let i = 0; i < 14; i++) part(g, box, M('spike'), 0.05, 0.05, 0.16, (rand() - 0.5) * 0.7, 0.9 + rand() * 1.5, 0.42)
      for (let i = 0; i < 16; i++) {
        const s = rand() > 0.5 ? 1 : -1
        part(g, box, M('spike'), 0.16, 0.05, 0.05, s * 0.44, 0.9 + rand() * 1.5, (rand() - 0.5) * 0.6)
      }
      // Ribs down the stem.
      for (const x of [-0.2, 0.2]) part(g, box, M('dark'), 0.06, 1.7, 0.04, x, 1.6, 0.41)
      // Flower: four petals round a yellow heart.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        part(g, box, M('flower'), 0.3, 0.12, 0.2, Math.cos(a) * 0.2, 2.62, Math.sin(a) * 0.2).rotation.y = -a
      }
      part(g, box, M('heart'), 0.18, 0.14, 0.18, 0, 2.68, 0)
      // Pot: painted band and soil.
      part(g, box, M('band'), 1.12, 0.12, 1.12, 0, 0.32, 0)
      part(g, box, M('soil'), 1.0, 0.06, 1.0, 0, 0.71, 0)
      rig.eyes = eyes(g, M, 0, 2.15, 0.41, 0.2, 0.18)
      part(g, box, M('stache'), 0.5, 0.1, 0.06, 0, 1.92, 0.43)
      for (const s of [-1, 1]) part(g, box, M('stache'), 0.14, 0.08, 0.06, s * 0.3, 1.95, 0.43).rotation.z = s * 0.5
      part(g, box, M('brow'), 0.18, 0.05, 0.04, -0.18, 2.32, 0.42).rotation.z = 0.2
      part(g, box, M('brow'), 0.18, 0.05, 0.04, 0.18, 2.32, 0.42).rotation.z = -0.2
      mouth(g, M, 0, 1.78, 0.41, 0.22)
      return 2.8
    },
    animate(rig, t, g) {
      rig.arms.forEach((a, i) => (a.rotation.z = Math.sin(t * 3 + i * Math.PI) * 0.18))
      g.rotation.y = Math.sin(t * 0.8) * 0.15
    },
  },
  pengwaddle: {
    colors: { body: '#1f2533', belly: '#f4f4f0', beak: '#ff9a1f', eye: '#ffffff', pupil: '#111111', scarf: '#e8394a', stripe: '#ffffff', brow: '#0d1018' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('body'), 1.1, 1.4, 0.95, 0, 0.95, 0)
      part(b, box, M('belly'), 0.75, 1.0, 0.1, 0, 0.85, 0.48)
      part(b, box, M('body'), 0.95, 0.8, 0.85, 0, 2.0, 0)
      part(b, box, M('belly'), 0.7, 0.45, 0.08, 0, 1.9, 0.43)
      part(b, box, M('beak'), 0.3, 0.16, 0.3, 0, 1.92, 0.55)
      part(b, box, M('beak'), 0.22, 0.08, 0.22, 0, 1.8, 0.52) // lower beak
      part(b, box, M('scarf'), 1.0, 0.18, 0.9, 0, 1.6, 0)
      for (const x of [-0.3, 0, 0.3]) part(b, box, M('stripe'), 0.08, 0.19, 0.92, x, 1.6, 0)
      part(b, box, M('scarf'), 0.22, 0.5, 0.1, 0.3, 1.35, 0.46)
      part(b, box, M('stripe'), 0.24, 0.07, 0.11, 0.3, 1.2, 0.46)
      part(b, box, M('body'), 0.5, 0.18, 0.4, 0, 2.48, -0.05) // tuft
      part(b, box, M('body'), 0.18, 0.2, 0.18, 0.1, 2.62, -0.05)
      cheeks(b, M, 0, 1.97, 0.44, 0.33, 0.12)
      for (const s of [-1, 1]) {
        part(b, box, M('brow'), 0.18, 0.05, 0.04, s * 0.2, 2.33, 0.44).rotation.z = -s * 0.25
        part(g, box, M('beak'), 0.32, 0.12, 0.45, s * 0.28, 0.06, 0.12)
        for (const t of [-0.1, 0.1]) part(g, box, M('beak'), 0.08, 0.1, 0.12, s * 0.28 + t, 0.06, 0.38)
        const fl = new Group()
        fl.position.set(s * 0.58, 1.4, 0)
        part(fl, box, M('body'), 0.14, 0.8, 0.45, 0, -0.35, 0)
        part(fl, box, M('belly'), 0.15, 0.3, 0.3, 0, -0.62, 0.02)
        b.add(fl)
        rig.arms.push(fl)
      }
      rig.eyes = eyes(b, M, 0, 2.15, 0.44, 0.18, 0.2)
      return 2.7
    },
    animate(rig, t) {
      rig.body.rotation.z = Math.sin(t * 3.2) * 0.08
      rig.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * (0.2 + Math.max(0, Math.sin(t * 6)) * 0.5)))
    },
  },
  lavalump: {
    colors: { body: '#3a2a26', dark: '#24191a', eye: '#ffd23a', pupil: '#ff3a00', magma: '#ff6a10', mouth: '#1a0606', tooth: '#ffe0b0' },
    glow: { magma: 1.8 },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      for (const s of [-1, 1]) {
        part(g, box, M('dark'), 0.5, 0.7, 0.55, s * 0.4, 0.35, 0)
        for (const t of [-0.15, 0, 0.15]) part(g, box, M('dark'), 0.12, 0.12, 0.14, s * 0.4 + t, 0.06, 0.32) // toes
      }
      part(b, box, M('body'), 1.7, 1.3, 1.1, 0, 1.35, 0)
      part(b, box, M('body'), 0.9, 0.7, 0.8, 0, 2.3, 0.05)
      part(b, box, M('dark'), 1.0, 0.15, 0.85, 0, 2.62, 0.05)
      // Glowing magma cracks across the chest and a molten belly.
      for (const [x, y, w, r] of [[-0.45, 1.6, 0.5, 0.6], [0.4, 1.25, 0.6, -0.4], [-0.1, 0.95, 0.4, 0.2], [0.55, 1.75, 0.3, 1.1]]) part(b, box, M('magma'), w, 0.06, 0.04, x, y, 0.56).rotation.z = r
      part(b, box, M('magma'), 0.7, 0.4, 0.04, 0, 1.2, 0.555)
      // Craggy rocks on the shoulders and head.
      const rand = mulberry32(31)
      for (let i = 0; i < 7; i++) {
        const r = 0.18 + rand() * 0.14
        part(b, octa, M('dark'), r, r * 1.3, r, (rand() - 0.5) * 1.5, 2.05 + rand() * 0.2, (rand() - 0.5) * 0.8)
      }
      for (const s of [-1, 1]) part(b, cone, M('dark'), 0.14, 0.38, 0.14, s * 0.32, 2.85, 0.05).rotation.z = -s * 0.35
      for (const s of [-1, 1]) {
        const arm = new Group()
        arm.position.set(s * 1.05, 1.75, 0)
        part(arm, box, M('dark'), 0.55, 0.55, 0.6, 0, 0, 0)
        part(arm, box, M('body'), 0.5, 1.2, 0.5, s * 0.05, -0.75, 0.05)
        part(arm, box, M('magma'), 0.06, 0.6, 0.04, s * 0.05, -0.7, 0.31)
        part(arm, box, M('dark'), 0.62, 0.45, 0.62, s * 0.05, -1.45, 0.05)
        for (const t of [-0.18, 0, 0.18]) part(arm, box, M('dark'), 0.14, 0.14, 0.14, s * 0.05 + t, -1.72, 0.2) // knuckles
        b.add(arm)
        rig.arms.push(arm)
        part(b, box, M('brow'), 0.26, 0.08, 0.06, s * 0.2, 2.52, 0.46).rotation.z = s * 0.3
      }
      rig.eyes = eyes(b, M, 0, 2.35, 0.46, 0.18, 0.2)
      mouth(b, M, 0, 2.1, 0.46, 0.45, { teeth: 4, tongue: false })
      rig.fire = [[-1.05, 2.15, 0], [1.05, 2.15, 0], [0, 2.75, 0.05]]
      return 2.8
    },
    animate(rig, t) {
      rig.body.position.y = Math.sin(t * 1.6) * 0.05
      rig.arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 1.6 + i * Math.PI) * 0.15))
    },
  },
  glimmerfin: {
    colors: { body: '#3b9cf2', belly: '#cfeaff', fin: '#2375c8', eye: '#ffffff', pupil: '#111111', scale: '#5fb6ff', spot: '#ffe066', bubble: '#dff4ff' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      // Standing on its tail, curving up and forward.
      part(g, box, M('fin'), 0.9, 0.18, 0.5, 0, 0.09, 0)
      for (const s of [-1, 1]) part(g, box, M('fin'), 0.4, 0.14, 0.36, s * 0.55, 0.12, 0.05).rotation.y = s * 0.4 // tail flukes
      const segs = [[0.45, 0.6, 0.45, 0, 0.5, 0], [0.6, 0.6, 0.6, 0, 1.05, 0.05], [0.75, 0.7, 0.7, 0, 1.65, 0.12], [0.7, 0.6, 0.75, 0, 2.25, 0.25]]
      for (const s of segs) part(b, box, M('body'), ...s)
      // Overlapping scale rows on the sides and back.
      for (const [w, h, d, x, y, z] of segs.slice(1)) {
        for (const s of [-1, 1]) {
          part(b, box, M('scale'), 0.04, h * 0.5, d * 0.7, s * (w / 2 + 0.01), y + 0.05, z - 0.02)
          part(b, box, M('spot'), 0.045, 0.1, 0.1, s * (w / 2 + 0.015), y - 0.12, z + 0.1)
        }
      }
      part(b, box, M('belly'), 0.5, 1.4, 0.1, 0, 1.6, 0.48)
      for (let i = 0; i < 4; i++) part(b, box, M('scale'), 0.4, 0.04, 0.11, 0, 1.1 + i * 0.3, 0.49) // belly bands
      part(b, box, M('body'), 0.45, 0.3, 0.6, 0, 2.3, 0.85) // snout
      mouth(b, M, 0, 2.2, 1.155, 0.3, { tongue: false })
      part(b, box, M('fin'), 0.12, 0.6, 0.5, 0, 2.65, -0.1) // dorsal
      part(b, box, M('fin'), 0.1, 0.4, 0.4, 0, 2.0, -0.4)
      part(b, box, M('fin'), 0.1, 0.3, 0.3, 0, 1.4, -0.35)
      for (const s of [-1, 1]) {
        const f = new Group()
        f.position.set(s * 0.4, 1.7, 0.2)
        part(f, box, M('fin'), 0.5, 0.12, 0.35, s * 0.25, 0, 0)
        part(f, box, M('scale'), 0.3, 0.13, 0.06, s * 0.3, 0, 0.1)
        b.add(f)
        rig.arms.push(f)
        part(b, box, M('fin'), 0.04, 0.32, 0.12, s * 0.38, 2.15, 0.45) // gills
      }
      rig.eyes = eyes(b, M, 0, 2.4, 0.62, 0.14, 0.3)
      rig.bubbles = []
      for (let i = 0; i < 3; i++) {
        const s = part(g, sphere, M('bubble'), 0.08, 0.08, 0.08, 0, 0, 0)
        s.castShadow = false
        s.userData.dynamic = true
        rig.bubbles.push(s)
      }
      return 3
    },
    animate(rig, t) {
      rig.body.rotation.x = Math.sin(t * 2) * 0.08
      rig.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * Math.sin(t * 5) * 0.4))
      rig.bubbles.forEach((s, i) => {
        const k = (t * 0.5 + i / 3) % 1
        s.position.set(Math.sin(k * 9 + i) * 0.1, 2.35 + k * 1.3, 1.2 + k * 0.2)
        s.scale.setScalar(0.04 + k * 0.08)
      })
    },
  },
  bananaut: {
    colors: { body: '#ffd83a', tip: '#5a3a1a', glass: '#cfefff', ring: '#e9eef5', eye: '#ffffff', pupil: '#111111', boot: '#e9eef5' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      for (let i = 0; i < 6; i++) {
        const a = -0.5 + i * 0.2
        part(b, box, M('body'), 0.7 - Math.abs(i - 2.5) * 0.06, 0.48, 0.66, Math.sin(a) * 0.5, 0.4 + i * 0.42, 0)
      }
      part(b, box, M('tip'), 0.2, 0.2, 0.2, 0.2, 2.95, 0)
      part(b, sphere, M('glass'), 0.62, 0.62, 0.62, 0.12, 2.25, 0.05)
      part(b, box, M('ring'), 0.95, 0.16, 0.9, 0.08, 1.7, 0)
      for (const s of [-1, 1]) {
        part(g, box, M('boot'), 0.3, 0.3, 0.42, s * 0.22, 0.15, 0.05)
        const arm = new Group()
        arm.position.set(s * 0.45, 1.45, 0)
        part(arm, box, M('body'), 0.18, 0.6, 0.18, s * 0.06, -0.25, 0)
        part(arm, box, M('ring'), 0.24, 0.2, 0.24, s * 0.08, -0.58, 0)
        b.add(arm)
        rig.arms.push(arm)
      }
      rig.eyes = eyes(b, M, 0.12, 2.3, 0.5, 0.14, 0.15)
      return 3.1
    },
    animate(rig, t, g) {
      g.position.y = Math.abs(Math.sin(t * 2.2)) * 0.2
      rig.arms[1].rotation.z = -0.6 - Math.sin(t * 6) * 0.5 // waving
      rig.arms[0].rotation.z = 0.15
    },
  },
  mushmallow: {
    colors: { cap: '#ef3b3b', dot: '#fff7ee', stem: '#f6e7cf', eye: '#ffffff', pupil: '#111111', cheek: '#ff9db0', gill: '#e8cfb0', ring: '#fff7ee', shoe: '#8a4ae0' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('stem'), 0.95, 1.1, 0.95, 0, 0.55, 0)
      part(b, box, M('cap'), 1.8, 0.5, 1.8, 0, 1.3, 0)
      part(b, box, M('cap'), 1.3, 0.35, 1.3, 0, 1.7, 0)
      for (const [x, z] of [[0.55, 0.6], [-0.6, 0.3], [0.2, -0.65], [-0.3, 0.75], [0.7, -0.2]]) part(b, box, M('dot'), 0.3, 0.06, 0.3, x, 1.56, z)
      part(b, box, M('dot'), 0.35, 0.06, 0.35, 0, 1.9, 0)
      // Gills under the cap rim and a stubby little stalk ring.
      part(b, box, M('gill'), 1.6, 0.06, 1.6, 0, 1.03, 0)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        part(b, box, M('gill'), 0.04, 0.05, 0.3, Math.sin(a) * 0.65, 1.0, Math.cos(a) * 0.65).rotation.y = a
      }
      part(b, box, M('ring'), 1.05, 0.12, 1.05, 0, 0.98, 0)
      for (const [x, z] of [[0.55, 0.6], [-0.6, 0.3], [-0.3, 0.75]]) part(b, box, M('dot'), 0.22, 0.2, 0.06, x, 1.3, 0.91 * Math.sign(z))
      rig.eyes = eyes(b, M, 0, 0.75, 0.48, 0.16, 0.18)
      mouth(b, M, 0, 0.5, 0.48, 0.22)
      for (const s of [-1, 1]) {
        part(b, box, M('cheek'), 0.16, 0.08, 0.04, s * 0.32, 0.55, 0.48)
        const arm = new Group()
        arm.position.set(s * 0.5, 0.6, 0)
        part(arm, box, M('stem'), 0.14, 0.36, 0.14, s * 0.06, -0.14, 0)
        part(arm, sphere, M('glove'), 0.1, 0.1, 0.1, s * 0.08, -0.34, 0.02)
        b.add(arm)
        rig.arms.push(arm)
      }
      shoes(g, M, 0.24, -0.02, 0.34, 0.24)
      return 2.4
    },
    animate(rig, t) {
      const k = Math.abs(Math.sin(t * 2.6))
      rig.body.scale.set(1 + (1 - k) * 0.08, 0.92 + k * 0.1, 1 + (1 - k) * 0.08)
      rig.body.position.y = 0.3 + k * 0.25
      rig.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.2 + k * 0.6)))
    },
  },
  // A porcelain teapot on little legs: the lid rattles and the spout puffs steam.
  teapotto: {
    colors: { body: '#f4f6fa', trim: '#3d7be0', knob: '#ffcf3a', eye: '#ffffff', pupil: '#111111', leg: '#3d7be0', cheek: '#ff9db0' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, sphere, M('body'), 0.85, 0.7, 0.85, 0, 1.15, 0)
      part(b, cyl, M('trim'), 0.87, 0.12, 0.87, 0, 1.0, 0)
      part(b, cyl, M('trim'), 0.62, 0.06, 0.62, 0, 1.72, 0)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        part(b, box, M('trim'), 0.12, 0.12, 0.05, Math.sin(a) * 0.74, 1.32, Math.cos(a) * 0.74).rotation.y = a
      }
      rig.lid = new Group()
      rig.lid.position.set(0, 1.8, 0)
      part(rig.lid, cyl, M('body'), 0.5, 0.14, 0.5, 0, 0, 0)
      part(rig.lid, sphere, M('knob'), 0.14, 0.12, 0.14, 0, 0.14, 0)
      b.add(rig.lid)
      const spout = new Group()
      spout.position.set(0.72, 1.05, 0)
      spout.rotation.z = -0.75
      part(spout, cyl, M('body'), 0.13, 0.8, 0.13, 0, 0.35, 0)
      part(spout, cyl, M('trim'), 0.15, 0.08, 0.15, 0, 0.74, 0)
      b.add(spout)
      part(b, handleGeo, M('trim'), 1, 1.2, 1, -0.8, 1.15, 0).rotation.z = Math.PI / 2
      rig.eyes = eyes(b, M, 0, 1.28, 0.78, 0.2, 0.22)
      for (const s of [-1, 1]) {
        part(b, box, M('cheek'), 0.14, 0.07, 0.04, s * 0.38, 1.05, 0.76)
        part(g, box, M('leg'), 0.2, 0.5, 0.2, s * 0.35, 0.28, 0)
        part(g, box, M('leg'), 0.26, 0.12, 0.36, s * 0.35, 0.06, 0.06)
      }
      part(b, box, M('pupil'), 0.2, 0.05, 0.04, 0, 1.06, 0.83)
      rig.steam = []
      for (let i = 0; i < 3; i++) {
        const s = part(g, sphere, M('steam'), 0.12, 0.12, 0.12, 0, 0, 0)
        s.castShadow = false
        s.userData.dynamic = true
        rig.steam.push(s)
      }
      return 2.1
    },
    animate(rig, t) {
      const rattle = Math.sin(t * 0.9) > 0.4 ? Math.abs(Math.sin(t * 22)) : 0
      rig.lid.position.y = 1.8 + rattle * 0.06
      rig.lid.rotation.z = rattle * 0.08
      rig.body.rotation.z = Math.sin(t * 2.2) * 0.05
      rig.steam.forEach((s, i) => {
        const k = (t * 0.6 + i / 3) % 1
        s.position.set(1.25 + k * 0.35, 1.72 + k * 1.1, Math.sin(k * 6 + i) * 0.12)
        s.scale.setScalar(0.08 + k * 0.22)
      })
    },
  },
  // A squat frog with periscope eyes, a lily-pad hat and a croaking throat.
  froggolino: {
    colors: { body: '#4cc94a', belly: '#dff7a8', dark: '#2f9a36', eye: '#ffffff', pupil: '#111111', mouth: '#7a1f28', pad: '#39b54a', flower: '#ff7ac4' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('body'), 1.4, 0.9, 1.2, 0, 0.75, 0)
      part(b, box, M('body'), 1.3, 0.5, 1.0, 0, 1.38, 0.08)
      part(b, box, M('belly'), 1.0, 0.6, 0.08, 0, 0.72, 0.62)
      part(b, box, M('mouth'), 0.95, 0.06, 0.04, 0, 1.17, 0.6)
      for (const [x, z, s] of [[-0.4, -0.3, 0.26], [0.35, -0.45, 0.2], [0.1, 0.1, 0.18], [-0.1, -0.55, 0.15]]) part(b, box, M('dark'), s, 0.05, s, x, 1.64, z)
      rig.throat = part(b, sphere, M('belly'), 0.36, 0.2, 0.22, 0, 1.0, 0.56)
      rig.throat.userData.dynamic = true
      rig.eyes = []
      for (const s of [-1, 1]) {
        const e = new Group()
        e.position.set(s * 0.4, 1.78, 0.32)
        part(e, sphere, M('body'), 0.3, 0.3, 0.3, 0, -0.05, 0)
        part(e, sphere, M('eye'), 0.24, 0.24, 0.18, 0, 0, 0.14)
        part(e, sphere, M('pupil'), 0.11, 0.13, 0.08, 0, 0, 0.29)
        b.add(e)
        rig.eyes.push(e)
        part(g, box, M('dark'), 0.45, 0.36, 0.72, s * 0.72, 0.32, -0.15)
        part(g, box, M('dark'), 0.52, 0.08, 0.5, s * 0.78, 0.04, 0.22)
        part(g, box, M('body'), 0.2, 0.5, 0.2, s * 0.45, 0.32, 0.5)
      }
      const hat = new Group()
      hat.position.set(0, 1.66, -0.22)
      hat.rotation.x = -0.25
      part(hat, cyl, M('pad'), 0.55, 0.05, 0.55, 0, 0, 0)
      part(hat, sphere, M('flower'), 0.15, 0.12, 0.15, 0.2, 0.08, 0.1)
      b.add(hat)
      return 2.1
    },
    animate(rig, t) {
      const hop = Math.max(0, Math.sin(t * 1.4)) ** 6
      rig.body.position.y = hop * 0.45
      rig.body.rotation.x = -hop * 0.15
      const croak = Math.max(0, Math.sin(t * 3.1)) ** 3
      rig.throat.scale.set(0.36 + croak * 0.18, 0.2 + croak * 0.14, 0.22 + croak * 0.14)
    },
  },
  // A purple octopus wearing a slice of pizza as a hat, every tentacle wiggling.
  pizzapus: {
    colors: { body: '#9b4be0', light: '#c48cff', suck: '#f2c6ff', eye: '#ffffff', pupil: '#111111', mouth: '#4a1a6a', cheese: '#ffd84a', crust: '#e0963a', pep: '#d6332a', basil: '#3aa63a' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, sphere, M('body'), 0.88, 0.92, 0.82, 0, 1.7, 0)
      part(b, sphere, M('light'), 0.6, 0.4, 0.5, 0, 1.05, 0.15)
      rig.eyes = eyes(b, M, 0, 1.82, 0.78, 0.26, 0.3)
      part(b, box, M('mouth'), 0.26, 0.1, 0.05, 0, 1.45, 0.78)
      rig.tent = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3
        const root = new Group()
        root.position.set(Math.cos(a) * 0.5, 0.95, Math.sin(a) * 0.5)
        root.rotation.y = Math.atan2(Math.cos(a), Math.sin(a))
        const s1 = new Group()
        part(s1, box, M('body'), 0.3, 0.26, 0.55, 0, -0.1, 0.25)
        part(s1, box, M('suck'), 0.14, 0.05, 0.14, 0, -0.24, 0.3)
        const s2 = new Group()
        s2.position.set(0, -0.12, 0.5)
        part(s2, box, M('light'), 0.24, 0.22, 0.5, 0, -0.08, 0.22)
        const s3 = new Group()
        s3.position.set(0, -0.12, 0.45)
        part(s3, box, M('body'), 0.17, 0.17, 0.4, 0, -0.05, 0.18)
        s2.add(s3)
        s1.add(s2)
        root.add(s1)
        b.add(root)
        rig.tent.push([s1, s2, s3])
      }
      const hat = new Group()
      hat.position.set(0.05, 2.58, 0)
      hat.rotation.z = 0.22
      part(hat, tri, M('cheese'), 0.78, 0.12, 0.78, 0, 0, 0)
      part(hat, box, M('crust'), 1.38, 0.18, 0.2, 0, 0.03, -0.4)
      for (const [x, z] of [[0, 0.3], [-0.2, -0.08], [0.22, -0.12]]) part(hat, cyl, M('pep'), 0.12, 0.04, 0.12, x, 0.08, z)
      part(hat, box, M('basil'), 0.14, 0.03, 0.08, 0.05, 0.08, 0.05)
      b.add(hat)
      rig.hat = hat
      return 2.95
    },
    animate(rig, t) {
      rig.body.position.y = Math.sin(t * 1.8) * 0.08
      rig.hat.rotation.z = 0.22 + Math.sin(t * 1.8 + 0.5) * 0.06
      rig.tent.forEach(([a, b2, c], i) => {
        const w = t * 3 + i * 1.1
        a.rotation.x = 0.35 + Math.sin(w) * 0.2
        b2.rotation.x = 0.3 + Math.sin(w - 0.8) * 0.3
        c.rotation.x = -0.4 + Math.sin(w - 1.6) * 0.45
      })
    },
  },
  // A wise owl in a starry cape with goggle eyes and a brass telescope.
  owlstronomo: {
    colors: { body: '#8a5a32', belly: '#f2dfb5', dark: '#5e3a1e', eye: '#ffffff', pupil: '#111111', ring: '#ffcf3a', beak: '#ffa21f', scope: '#c9a04a', scopeDark: '#3a3f4a', cape: '#2a3d8f', star: '#ffe680' },
    build(g, M, rig) {
      part(g, box, M('body'), 1.2, 1.3, 1.0, 0, 1.0, 0)
      part(g, box, M('belly'), 0.8, 0.95, 0.06, 0, 0.95, 0.51)
      for (let i = 0; i < 3; i++) part(g, box, M('dark'), 0.5 - i * 0.08, 0.04, 0.03, 0, 1.25 - i * 0.25, 0.545)
      part(g, box, M('cape'), 1.15, 1.25, 0.08, 0, 1.05, -0.54)
      for (const [x, y] of [[-0.3, 1.4], [0.25, 0.9], [-0.1, 0.65], [0.35, 1.45]]) part(g, octa, M('star'), 0.07, 0.07, 0.03, x, y, -0.6)
      rig.head = new Group()
      rig.head.position.set(0, 1.62, 0)
      g.add(rig.head)
      const h = rig.head
      part(h, box, M('body'), 1.25, 0.95, 1.0, 0, 0.48, 0)
      for (const s of [-1, 1]) {
        const tuft = part(h, box, M('dark'), 0.22, 0.42, 0.2, s * 0.45, 1.02, 0)
        tuft.rotation.z = -s * 0.35
        part(h, cylZ, M('ring'), 0.34, 0.34, 0.08, s * 0.29, 0.52, 0.5)
      }
      rig.eyes = []
      for (const s of [-1, 1]) {
        const e = new Group()
        e.position.set(s * 0.29, 0.52, 0.55)
        part(e, cylZ, M('eye'), 0.26, 0.26, 0.04, 0, 0, 0)
        part(e, cylZ, M('pupil'), 0.12, 0.12, 0.05, s * -0.03, 0, 0.01)
        h.add(e)
        rig.eyes.push(e)
      }
      part(h, box, M('beak'), 0.16, 0.24, 0.2, 0, 0.26, 0.56)
      for (const s of [-1, 1]) {
        const w = new Group()
        w.position.set(s * 0.65, 1.55, 0)
        part(w, box, M('dark'), 0.18, 0.95, 0.7, s * 0.05, -0.42, 0)
        g.add(w)
        rig.arms.push(w)
        part(g, box, M('beak'), 0.3, 0.1, 0.36, s * 0.3, 0.06, 0.2)
        part(g, box, M('dark'), 0.22, 0.3, 0.22, s * 0.3, 0.25, 0)
      }
      const scope = new Group()
      scope.position.set(0.82, 1.15, 0.4)
      scope.rotation.x = -0.9
      part(scope, cyl, M('scope'), 0.12, 1.05, 0.12, 0, 0.3, 0)
      part(scope, cyl, M('scopeDark'), 0.16, 0.22, 0.16, 0, 0.82, 0)
      part(scope, cyl, M('scopeDark'), 0.08, 0.2, 0.08, 0, -0.28, 0)
      part(scope, cyl, M('ring'), 0.14, 0.06, 0.14, 0, 0.5, 0)
      g.add(scope)
      rig.scope = scope
      return 3.2
    },
    animate(rig, t) {
      const look = Math.sin(t * 0.5)
      rig.head.rotation.y = Math.sign(look) * Math.min(1, Math.abs(look) * 3) * 0.5
      rig.head.rotation.z = Math.sin(t * 1.3) * 0.05
      rig.arms.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.05 + Math.max(0, Math.sin(t * 2.2)) * 0.25)))
      rig.scope.rotation.x = -0.9 + Math.sin(t * 0.8) * 0.15
    },
  },
  // A little red dragon: flapping wings, horns, belly plates and a swishing spade tail.
  dragoncino: {
    colors: { body: '#e8402f', belly: '#ffd27a', dark: '#a8231c', horn: '#fff2d8', wing: '#ff8a3a', eye: '#ffffff', pupil: '#111111', tooth: '#ffffff' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('body'), 1.1, 1.1, 1.3, 0, 1.0, 0)
      for (let i = 0; i < 3; i++) part(b, box, M('belly'), 0.7 - i * 0.06, 0.26, 0.08, 0, 0.62 + i * 0.3, 0.66)
      for (let i = 0; i < 4; i++) part(b, cone, M('dark'), 0.12, 0.3, 0.12, 0, 1.62, 0.35 - i * 0.32)
      rig.head = new Group()
      rig.head.position.set(0, 1.75, 0.45)
      b.add(rig.head)
      const h = rig.head
      part(h, box, M('body'), 0.9, 0.75, 0.85, 0, 0.25, 0)
      part(h, box, M('body'), 0.62, 0.4, 0.55, 0, 0.08, 0.6)
      for (const s of [-1, 1]) {
        part(h, box, M('dark'), 0.08, 0.06, 0.04, s * 0.14, 0.2, 0.88)
        part(h, box, M('tooth'), 0.07, 0.1, 0.05, s * 0.18, -0.16, 0.86)
        const horn = part(h, cone, M('horn'), 0.12, 0.42, 0.12, s * 0.28, 0.78, -0.12)
        horn.rotation.x = -0.45
        horn.rotation.z = -s * 0.2
      }
      rig.eyes = eyes(h, M, 0, 0.38, 0.43, 0.18, 0.22)
      rig.wings = []
      for (const s of [-1, 1]) {
        const w = new Group()
        w.position.set(s * 0.5, 1.45, -0.3)
        part(w, box, M('dark'), 1.15, 0.08, 0.1, s * 0.55, 0.05, -0.3)
        part(w, box, M('wing'), 1.1, 0.05, 0.75, s * 0.55, 0, 0.05)
        part(w, box, M('wing'), 0.6, 0.05, 0.4, s * 1.0, 0, 0.45)
        b.add(w)
        rig.wings.push(w)
        part(g, box, M('body'), 0.32, 0.5, 0.36, s * 0.35, 0.25, 0.35)
        part(g, box, M('body'), 0.32, 0.5, 0.36, s * 0.35, 0.25, -0.4)
        part(g, box, M('horn'), 0.3, 0.08, 0.12, s * 0.35, 0.04, 0.58)
      }
      rig.tail = new Group()
      rig.tail.position.set(0, 0.75, -0.65)
      let parent = rig.tail
      for (let i = 0; i < 3; i++) {
        const seg = new Group()
        seg.position.z = i === 0 ? 0 : -0.42
        part(seg, box, M('body'), 0.4 - i * 0.1, 0.36 - i * 0.08, 0.5, 0, 0, -0.2)
        parent.add(seg)
        parent = seg
        rig.slices.push(seg)
      }
      const spade = part(parent, cone, M('dark'), 0.3, 0.35, 0.08, 0, 0, -0.55)
      spade.rotation.x = -Math.PI / 2
      b.add(rig.tail)
      return 2.9
    },
    animate(rig, t) {
      const flap = Math.sin(t * 7)
      rig.wings.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * (0.25 + flap * 0.45)))
      rig.body.position.y = Math.max(0, flap) * 0.08
      rig.slices.forEach((s, i) => (s.rotation.y = Math.sin(t * 2.5 - i * 0.7) * 0.35))
      rig.head.rotation.x = Math.sin(t * 1.2) * 0.08
    },
  },
  // An ice-cream cone with a strawberry scoop head, a golden horn and a rainbow mane.
  unicornetto: {
    colors: { cone: '#ffffff', scoop: '#ff9ccf', drip: '#ffb8dc', horn: '#ffd84a', horn2: '#fff1a8', m1: '#ff5f7a', m2: '#ffd84a', m3: '#5fd0ff', m4: '#a46bff', eye: '#ffffff', pupil: '#111111', cheek: '#ff6fae', shoe: '#a46bff' },
    maps: { cone: waffle },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      const c = part(b, cone, M('cone'), 0.72, 1.4, 0.72, 0, 0.95, 0)
      c.rotation.x = Math.PI
      part(b, sphere, M('scoop'), 0.82, 0.62, 0.82, 0, 1.78, 0)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        part(b, sphere, M('drip'), 0.2, 0.26, 0.2, Math.sin(a) * 0.7, 1.45, Math.cos(a) * 0.7)
      }
      rig.eyes = eyes(b, M, 0, 1.86, 0.76, 0.18, 0.22)
      for (const s of [-1, 1]) {
        part(b, box, M('cheek'), 0.14, 0.07, 0.04, s * 0.38, 1.68, 0.74)
        const ear = part(b, cone, M('scoop'), 0.14, 0.3, 0.1, s * 0.38, 2.35, -0.05)
        ear.rotation.z = -s * 0.3
        part(g, box, M('shoe'), 0.22, 0.14, 0.3, s * 0.16, 0.07, 0.04)
      }
      part(b, box, M('pupil'), 0.18, 0.05, 0.04, 0, 1.64, 0.8)
      const horn = new Group()
      horn.position.set(0, 2.4, 0.28)
      horn.rotation.x = 0.3
      part(horn, cone, M('horn'), 0.16, 0.6, 0.16, 0, 0.25, 0)
      part(horn, cyl, M('horn2'), 0.13, 0.05, 0.13, 0, 0.12, 0)
      part(horn, cyl, M('horn2'), 0.09, 0.05, 0.09, 0, 0.3, 0)
      b.add(horn)
      rig.mane = []
      ;['m1', 'm2', 'm3', 'm4'].forEach((role, i) => {
        const m = part(b, box, M(role), 0.5 - i * 0.04, 0.22, 0.24, 0, 2.28 - i * 0.24, -0.55 - i * 0.08)
        m.userData.dynamic = true
        rig.mane.push(m)
      })
      const rand = mulberry32(31)
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2
        const r = 0.2 + rand() * 0.4
        part(b, box, M(['m1', 'm2', 'm3', 'm4'][i % 4]), 0.1, 0.04, 0.04, Math.sin(a) * r, 2.3 - r * 0.3, Math.cos(a) * r).rotation.y = a
      }
      return 2.95
    },
    animate(rig, t) {
      rig.body.rotation.z = Math.sin(t * 1.9) * 0.07
      rig.body.position.y = Math.abs(Math.sin(t * 1.9)) * 0.12
      rig.mane.forEach((m, i) => (m.position.x = Math.sin(t * 3 - i * 0.8) * 0.08))
    },
  },
  // A tidy robot on treads: glowing visor eyes, a blinking antenna and a chest display.
  robottino: {
    colors: { metal: '#c3ccd8', dark: '#5a6474', screen: '#0d1b2a', glow: '#38f2ff', light: '#ff3b3b', joint: '#2b313c', accent: '#ffb11f' },
    glow: { light: 2.2 },
    build(g, M, rig) {
      for (const s of [-1, 1]) {
        part(g, box, M('joint'), 0.4, 0.45, 1.15, s * 0.45, 0.24, 0)
        for (const z of [-0.4, 0, 0.4]) part(g, cyl, M('dark'), 0.17, 0.42, 0.17, s * 0.45, 0.24, z).rotation.z = Math.PI / 2
      }
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('metal'), 1.2, 1.05, 0.9, 0, 1.03, 0)
      part(b, box, M('screen'), 0.72, 0.44, 0.05, 0, 1.12, 0.46)
      for (let i = 0; i < 3; i++) part(b, box, M('glow'), 0.12, 0.05 + i * 0.07, 0.03, -0.2 + i * 0.2, 1.0 + i * 0.035, 0.49)
      part(b, box, M('accent'), 1.22, 0.1, 0.92, 0, 0.58, 0)
      part(b, cyl, M('joint'), 0.25, 0.2, 0.25, 0, 1.63, 0)
      rig.head = new Group()
      rig.head.position.set(0, 2.05, 0)
      b.add(rig.head)
      const h = rig.head
      part(h, box, M('metal'), 1.0, 0.72, 0.8, 0, 0, 0)
      part(h, box, M('screen'), 0.84, 0.42, 0.05, 0, 0.02, 0.41)
      rig.eyes = []
      for (const s of [-1, 1]) {
        const e = new Group()
        e.position.set(s * 0.2, 0.04, 0.44)
        part(e, box, M('glow'), 0.2, 0.13, 0.03, 0, 0, 0)
        h.add(e)
        rig.eyes.push(e)
        part(h, cylZ, M('accent'), 0.12, 0.12, 0.1, s * 0.52, 0, 0).rotation.y = Math.PI / 2
      }
      part(h, cyl, M('dark'), 0.03, 0.4, 0.03, 0, 0.55, 0)
      part(h, sphere, M('light'), 0.09, 0.09, 0.09, 0, 0.78, 0)
      for (const s of [-1, 1]) {
        const a = new Group()
        a.position.set(s * 0.72, 1.4, 0)
        part(a, sphere, M('joint'), 0.15, 0.15, 0.15, 0, 0, 0)
        part(a, box, M('metal'), 0.24, 0.6, 0.24, 0, -0.35, 0)
        part(a, box, M('dark'), 0.3, 0.22, 0.3, 0, -0.75, 0.04)
        b.add(a)
        rig.arms.push(a)
      }
      return 2.95
    },
    animate(rig, t) {
      rig.head.rotation.y = Math.sin(t * 0.7) * 0.45
      rig.head.rotation.z = Math.sin(t * 1.4) * 0.06
      rig.arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 2.4 + i * Math.PI) * 0.35))
      rig.body.position.y = Math.abs(Math.sin(t * 4.8)) * 0.03
    },
  },
  // A floating ghost in a top hat with a wavy hem, waving its little arms.
  ghostello: {
    colors: { ghost: '#eef3ff', hat: '#1d1d26', band: '#8a3bd8', eye: '#151520', pupil: '#151520', cheek: '#ffb0d0' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, sphere, M('ghost'), 0.86, 0.86, 0.8, 0, 1.9, 0)
      part(b, skirtGeo, M('ghost'), 0.82, 1.2, 0.78, 0, 1.3, 0)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const c = part(b, cone, M('ghost'), 0.26, 0.4, 0.26, Math.sin(a) * 0.68, 0.55, Math.cos(a) * 0.66)
        c.rotation.x = Math.PI
      }
      rig.eyes = []
      for (const s of [-1, 1]) {
        const e = new Group()
        e.position.set(s * 0.26, 2.0, 0.76)
        part(e, sphere, M('eye'), 0.1, 0.17, 0.05, 0, 0, 0)
        b.add(e)
        rig.eyes.push(e)
        part(b, box, M('cheek'), 0.14, 0.06, 0.03, s * 0.42, 1.8, 0.74)
        const arm = new Group()
        arm.position.set(s * 0.82, 1.55, 0.1)
        part(arm, sphere, M('ghost'), 0.2, 0.32, 0.2, s * 0.05, -0.1, 0)
        b.add(arm)
        rig.arms.push(arm)
      }
      part(b, sphere, M('eye'), 0.1, 0.13, 0.05, 0, 1.68, 0.78)
      part(b, cyl, M('hat'), 0.5, 0.08, 0.5, 0, 2.66, 0)
      part(b, cyl, M('hat'), 0.33, 0.55, 0.33, 0, 2.96, 0)
      part(b, cyl, M('band'), 0.34, 0.1, 0.34, 0, 2.76, 0)
      return 3.3
    },
    animate(rig, t) {
      rig.body.position.y = 0.25 + Math.sin(t * 1.5) * 0.15
      rig.body.rotation.z = Math.sin(t * 1.1) * 0.08
      rig.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * (0.3 + Math.sin(t * 4 + i * 2) * 0.35)))
    },
  },
  // A cloud-wool sheep with tiny wings and a golden halo.
  cloudrillo: {
    colors: { wool: '#ffffff', face: '#2e2e3e', glow: '#ffe066', eye: '#ffffff', pupil: '#111111', cheek: '#ffb0d0', wing: '#dff3ff' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, sphere, M('wool'), 1.0, 0.72, 0.85, 0, 1.2, 0)
      const rand = mulberry32(12)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const r = 0.4 + rand() * 0.12
        part(b, sphere, M('wool'), r, r, r, Math.cos(a) * 0.72, 1.25 + rand() * 0.35, Math.sin(a) * 0.55)
      }
      part(b, sphere, M('wool'), 0.5, 0.45, 0.5, 0, 1.75, -0.05)
      rig.head = new Group()
      rig.head.position.set(0, 1.3, 0.88)
      b.add(rig.head)
      const h = rig.head
      part(h, box, M('face'), 0.62, 0.62, 0.45, 0, 0, 0)
      part(h, sphere, M('wool'), 0.34, 0.26, 0.3, 0, 0.36, -0.02)
      rig.eyes = eyes(h, M, 0, 0.08, 0.23, 0.15, 0.15)
      for (const s of [-1, 1]) {
        part(h, box, M('cheek'), 0.1, 0.05, 0.03, s * 0.2, -0.12, 0.23)
        const ear = part(h, box, M('face'), 0.32, 0.12, 0.16, s * 0.4, 0.12, 0)
        ear.rotation.z = -s * 0.4
        for (const z of [0.35, -0.35]) part(g, cyl, M('face'), 0.11, 0.7, 0.11, s * 0.4, 0.35, z)
        const w = new Group()
        w.position.set(s * 0.8, 1.55, -0.3)
        part(w, box, M('wing'), 0.7, 0.08, 0.4, s * 0.35, 0, 0)
        part(w, box, M('wing'), 0.45, 0.08, 0.3, s * 0.65, 0.05, -0.15)
        b.add(w)
        rig.arms.push(w)
      }
      rig.halo = part(b, haloGeo, M('glow'), 1, 1, 1, 0, 2.35, -0.05)
      rig.halo.rotation.x = Math.PI / 2
      rig.halo.userData.dynamic = true
      return 2.5
    },
    animate(rig, t) {
      rig.body.position.y = 0.15 + Math.sin(t * 2) * 0.12
      rig.arms.forEach((w, i) => (w.rotation.z = (i ? 1 : -1) * Math.sin(t * 9) * 0.5))
      rig.halo.position.y = 2.35 + Math.sin(t * 2 + 1) * 0.05
      rig.halo.rotation.z = t
    },
  },
  // A chubby golden star on little boots with tiny stars orbiting it.
  starfello: {
    colors: { star: '#ffd84a', eye: '#ffffff', pupil: '#111111', cheek: '#ff8fb0', mouth: '#7a2a10', boot: '#5a7cff', glow: '#fff4a8' },
    glow: { star: 0.35 },
    build(g, M, rig) {
      rig.body = new Group()
      rig.body.position.y = 1.5
      g.add(rig.body)
      const b = rig.body
      part(b, starGeo, M('star'), 1, 1, 1, 0, 0, 0)
      rig.eyes = eyes(b, M, 0, 0.15, 0.27, 0.2, 0.22)
      for (const s of [-1, 1]) {
        part(b, box, M('cheek'), 0.14, 0.07, 0.03, s * 0.36, -0.08, 0.27)
        part(g, box, M('boot'), 0.26, 0.2, 0.36, s * 0.36, 0.1, 0.05)
        part(g, cyl, M('star'), 0.08, 0.5, 0.08, s * 0.36, 0.42, 0)
      }
      part(b, box, M('mouth'), 0.2, 0.06, 0.03, 0, -0.14, 0.28)
      rig.orbit = new Group()
      rig.orbit.position.y = 1.5
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        part(rig.orbit, octa, M('glow'), 0.13, 0.13, 0.13, Math.cos(a) * 1.35, Math.sin(a * 2) * 0.2, Math.sin(a) * 1.35)
      }
      g.add(rig.orbit)
      return 2.7
    },
    animate(rig, t) {
      rig.body.rotation.z = Math.sin(t * 2) * 0.15
      rig.body.position.y = 1.5 + Math.abs(Math.sin(t * 2)) * 0.15
      rig.orbit.rotation.y = t * 1.6
    },
  },
  // The sun king: a glowing sun with spinning rays, a crown, a cape and a sceptre.
  solaro: {
    colors: { sun: '#ffb627', ray: '#ff8a1f', crown: '#ffd700', glow: '#ff3b6b', eye: '#ffffff', pupil: '#111111', cheek: '#ff5a3a', cape: '#c4182f', fur: '#ffffff', mouth: '#7a2a10' },
    glow: { sun: 0.55, ray: 0.7 },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      part(b, box, M('cape'), 1.5, 1.5, 0.1, 0, 1.15, -0.55)
      part(b, box, M('fur'), 1.6, 0.18, 0.2, 0, 1.85, -0.5)
      part(b, sphere, M('sun'), 1.0, 1.0, 0.92, 0, 1.75, 0)
      rig.rays = new Group()
      rig.rays.position.set(0, 1.75, -0.1)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const r = part(rig.rays, cone, M('ray'), 0.2, 0.5, 0.12, Math.cos(a) * 1.22, Math.sin(a) * 1.22, 0)
        r.rotation.z = a - Math.PI / 2
      }
      b.add(rig.rays)
      rig.eyes = eyes(b, M, 0, 1.88, 0.9, 0.22, 0.28)
      for (const s of [-1, 1]) {
        part(b, box, M('cheek'), 0.16, 0.08, 0.04, s * 0.48, 1.62, 0.84)
        part(g, box, M('crown'), 0.3, 0.45, 0.3, s * 0.32, 0.25, 0)
        const arm = new Group()
        arm.position.set(s * 0.95, 1.45, 0.2)
        part(arm, box, M('sun'), 0.2, 0.55, 0.2, 0, -0.25, 0)
        b.add(arm)
        rig.arms.push(arm)
      }
      part(b, box, M('mouth'), 0.3, 0.07, 0.04, 0, 1.5, 0.93)
      part(b, cyl, M('crown'), 0.55, 0.22, 0.55, 0, 2.78, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        part(b, cone, M('crown'), 0.12, 0.3, 0.12, Math.sin(a) * 0.48, 3.0, Math.cos(a) * 0.48)
      }
      part(b, octa, M('glow'), 0.13, 0.16, 0.08, 0, 2.8, 0.56)
      const sceptre = new Group()
      sceptre.position.set(0, -0.55, 0.1)
      part(sceptre, cyl, M('crown'), 0.05, 1.3, 0.05, 0, 0.35, 0)
      part(sceptre, sphere, M('glow'), 0.13, 0.13, 0.13, 0, 1.05, 0)
      rig.arms[1].add(sceptre)
      return 3.45
    },
    animate(rig, t) {
      rig.rays.rotation.z = t * 0.6
      const pulse = 1 + Math.sin(t * 3) * 0.04
      rig.body.scale.set(pulse, pulse, pulse)
      rig.arms[1].rotation.x = -0.4 + Math.sin(t * 1.5) * 0.25
      rig.arms[0].rotation.z = 0.2 + Math.sin(t * 2) * 0.1
    },
  },
  grumbolt: {
    colors: { body: '#e8322f', dark: '#a91c1c', eye: '#ffffff', pupil: '#111111', mouth: '#5a0d0d', belly: '#ff8a5a', bolt: '#ffe23a', claw: '#f4ead2' },
    glow: { bolt: 1.2 },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      for (const s of [-1, 1]) {
        part(g, box, M('dark'), 0.5, 1.0, 0.5, s * 0.35, 0.5, 0)
        for (const t of [-0.14, 0.14]) part(g, cone, M('claw'), 0.07, 0.16, 0.07, s * 0.35 + t, 0.06, 0.3).rotation.x = Math.PI / 2
      }
      part(b, box, M('body'), 1.3, 1.2, 0.8, 0, 1.6, 0)
      part(b, box, M('belly'), 0.8, 0.8, 0.06, 0, 1.55, 0.41)
      for (let i = 0; i < 3; i++) part(b, box, M('dark'), 0.7, 0.04, 0.065, 0, 1.3 + i * 0.25, 0.415)
      // Lightning bolt emblem on the chest and spikes down the back.
      part(b, box, M('bolt'), 0.12, 0.32, 0.05, -0.04, 1.75, 0.44).rotation.z = 0.4
      part(b, box, M('bolt'), 0.12, 0.32, 0.05, 0.04, 1.5, 0.44).rotation.z = 0.4
      for (let i = 0; i < 4; i++) part(b, cone, M('dark'), 0.13, 0.3, 0.13, 0, 1.3 + i * 0.45, -0.48).rotation.x = -Math.PI / 2
      part(b, box, M('body'), 0.9, 0.85, 0.8, 0, 2.62, 0)
      mouth(b, M, 0, 2.38, 0.41, 0.5, { teeth: 4, tongue: false })
      for (const s of [-1, 1]) part(b, cone, M('claw'), 0.06, 0.14, 0.06, s * 0.2, 2.3, 0.42).rotation.x = Math.PI // fangs
      for (const s of [-1, 1]) {
        part(b, box, M('dark'), 0.18, 0.35, 0.18, s * 0.3, 3.15, 0) // horns
        part(b, cone, M('claw'), 0.1, 0.22, 0.1, s * 0.33, 3.42, 0).rotation.z = -s * 0.3
        part(b, box, M('pupil'), 0.26, 0.07, 0.05, s * 0.2, 2.95, 0.42).rotation.z = s * 0.35 // angry brows
        const arm = new Group()
        arm.position.set(s * 0.82, 2.0, 0)
        part(arm, box, M('dark'), 0.44, 0.36, 0.48, 0, 0, 0)
        part(arm, box, M('body'), 0.36, 1.3, 0.4, 0, -0.55, 0)
        for (const t of [-0.12, 0, 0.12]) part(arm, cone, M('claw'), 0.06, 0.18, 0.06, t, -1.28, 0.1).rotation.x = Math.PI
        b.add(arm)
        rig.arms.push(arm)
      }
      rig.eyes = eyes(b, M, 0, 2.75, 0.41, 0.2, 0.2)
      return 3.6
    },
    animate(rig, t) {
      rig.body.rotation.y = Math.sin(t * 0.9) * 0.2
      rig.arms.forEach((a, i) => (a.rotation.x = Math.sin(t * 1.8 + i * Math.PI) * 0.25))
    },
  },

  // --- Absolute (reward-only) ---------------------------------------------------------------
  // A grandfather clock on sneakers: the face is its face, the hands sweep
  // round, the brass pendulum swings behind a glass door and it tick-tocks.
  tickytocko: {
    colors: { wood: '#9a5226', dark: '#5e2c10', face: '#fff6dc', hand: '#1a1a1a', brass: '#ffcf3a', glass: '#cfefff', eye: '#ffffff', pupil: '#111111', num: '#3a2a1a', shoe: '#2f86ff', key: '#ffcf3a' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      shoes(g, M, 0.32, 0, 0.44, 0.3)
      for (const s of [-1, 1]) part(g, box, M('dark'), 0.18, 0.35, 0.18, s * 0.32, 0.45, 0)
      // Cabinet: plinth, trunk with a glass door, waist moulding.
      part(b, box, M('dark'), 1.2, 0.22, 0.82, 0, 0.66, 0)
      part(b, box, M('wood'), 1.0, 1.3, 0.7, 0, 1.42, 0)
      for (const s of [-1, 1]) part(b, box, M('dark'), 0.1, 1.3, 0.74, s * 0.48, 1.42, 0) // corner posts
      part(b, box, M('dark'), 0.62, 0.92, 0.04, 0, 1.4, 0.36) // door frame
      part(b, box, M('brass'), 0.06, 0.12, 0.05, 0.24, 1.4, 0.39) // door knob
      rig.pendulum = new Group()
      rig.pendulum.position.set(0, 1.82, 0.31)
      part(rig.pendulum, box, M('brass'), 0.04, 0.6, 0.03, 0, -0.3, 0)
      part(rig.pendulum, cylZ, M('brass'), 0.17, 0.17, 0.05, 0, -0.66, 0)
      b.add(rig.pendulum)
      part(b, box, M('glass'), 0.54, 0.84, 0.03, 0, 1.4, 0.4)
      part(b, box, M('dark'), 1.16, 0.14, 0.8, 0, 2.12, 0)
      // Head: a hood with the clock face, an arched crest and a brass finial.
      part(b, box, M('wood'), 1.16, 1.1, 0.8, 0, 2.74, 0)
      part(b, cylZ, M('dark'), 0.5, 0.5, 0.08, 0, 2.74, 0.4)
      part(b, cylZ, M('face'), 0.44, 0.44, 0.09, 0, 2.74, 0.41)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const big = i % 3 === 0
        part(b, box, M('num'), big ? 0.05 : 0.03, big ? 0.1 : 0.06, 0.02, Math.sin(a) * 0.36, 2.74 + Math.cos(a) * 0.36, 0.465).rotation.z = -a
      }
      rig.hands = []
      for (const [len, w] of [[0.3, 0.05], [0.2, 0.06]]) {
        const h = new Group()
        h.position.set(0, 2.74, 0.47)
        part(h, box, M('hand'), w, len, 0.02, 0, len / 2, 0)
        b.add(h)
        rig.hands.push(h)
      }
      part(b, cylZ, M('brass'), 0.05, 0.05, 0.03, 0, 2.74, 0.49)
      part(b, box, M('dark'), 1.24, 0.14, 0.86, 0, 3.32, 0)
      part(b, cylZ, M('wood'), 0.5, 0.36, 0.7, 0, 3.4, 0) // arched crest
      part(b, sphere, M('brass'), 0.12, 0.12, 0.12, 0, 3.85, 0)
      part(b, cone, M('brass'), 0.06, 0.2, 0.06, 0, 4.0, 0)
      for (const s of [-1, 1]) part(b, sphere, M('brass'), 0.08, 0.08, 0.08, s * 0.55, 3.45, 0)
      // The face sits on the clock face: eyes above the hands, a grin below.
      rig.eyes = eyes(b, M, 0, 2.86, 0.5, 0.13, 0.15)
      mouth(b, M, 0, 2.56, 0.5, 0.22)
      cheeks(b, M, 0, 2.66, 0.5, 0.26, 0.09)
      // Arms: one waves, one holds a brass winding key.
      for (const s of [-1, 1]) {
        const arm = new Group()
        arm.position.set(s * 0.6, 1.9, 0)
        part(arm, box, M('dark'), 0.14, 0.6, 0.14, s * 0.04, -0.28, 0)
        part(arm, sphere, M('glove'), 0.14, 0.14, 0.14, s * 0.05, -0.62, 0.02)
        b.add(arm)
        rig.arms.push(arm)
      }
      const key = new Group()
      key.position.set(0.05, -0.68, 0.12)
      part(key, box, M('key'), 0.05, 0.05, 0.4, 0, 0, 0.12)
      part(key, haloGeo, M('key'), 0.35, 0.35, 0.6, 0, 0, 0.42)
      rig.arms[1].add(key)
      return 4.1
    },
    animate(rig, t) {
      const tick = Math.floor(t * 2)
      rig.pendulum.rotation.z = Math.sin(t * Math.PI) * 0.32
      rig.hands[0].rotation.z = -tick * ((Math.PI * 2) / 60) * 4
      rig.hands[1].rotation.z = -t * 0.12
      rig.body.rotation.z = (tick % 2 ? 1 : -1) * 0.025
      rig.body.position.y = Math.abs(Math.sin(t * Math.PI)) * 0.05
      rig.arms[0].rotation.z = -0.4 - Math.max(0, Math.sin(t * 4)) * 0.9 // waving
      rig.arms[1].rotation.x = -0.6 + Math.sin(t * 2) * 0.1
    },
  },
  // A sitting crystal cat: amethyst fur, gem shards growing out of its back,
  // a gold collar with a bell, a curling crystal-tipped tail.
  prismeowza: {
    colors: { body: '#b98cff', light: '#efe2ff', gem: '#6ff3ff', ear: '#ff8fd6', eye: '#ffffff', pupil: '#2a0a4a', nose: '#ff5fa8', collar: '#ff3a7a', bell: '#ffcf3a', whisker: '#3a2a5a' },
    glow: { gem: 0.9 },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      // Haunches + paws.
      part(b, box, M('body'), 1.1, 0.75, 1.15, 0, 0.42, -0.1)
      for (const s of [-1, 1]) {
        part(b, box, M('body'), 0.36, 0.6, 0.7, s * 0.52, 0.34, -0.15) // thighs
        part(b, box, M('light'), 0.3, 0.14, 0.34, s * 0.5, 0.07, 0.3) // back paws
        part(b, box, M('body'), 0.22, 0.75, 0.24, s * 0.24, 0.45, 0.42) // front legs
        part(b, box, M('light'), 0.26, 0.14, 0.32, s * 0.24, 0.07, 0.5) // front paws
        for (const t of [-0.07, 0.07]) part(b, box, M('ear'), 0.05, 0.03, 0.04, s * 0.24 + t, 0.15, 0.66) // toe beans
      }
      part(b, box, M('body'), 0.85, 0.75, 0.75, 0, 1.05, 0.12) // chest
      part(b, box, M('light'), 0.55, 0.55, 0.06, 0, 1.0, 0.5) // chest fluff
      part(b, box, M('collar'), 0.9, 0.12, 0.8, 0, 1.38, 0.12)
      part(b, sphere, M('bell'), 0.11, 0.11, 0.11, 0, 1.28, 0.55)
      // Head.
      rig.head = new Group()
      rig.head.position.set(0, 1.85, 0.2)
      b.add(rig.head)
      const h = rig.head
      part(h, box, M('body'), 1.05, 0.82, 0.85, 0, 0, 0)
      part(h, box, M('body'), 1.15, 0.4, 0.7, 0, -0.18, 0) // cheek fluff
      part(h, box, M('light'), 0.5, 0.28, 0.08, 0, -0.2, 0.44) // muzzle
      part(h, box, M('nose'), 0.12, 0.08, 0.06, 0, -0.08, 0.49)
      mouth(h, M, 0, -0.26, 0.485, 0.16, { tongue: true })
      for (const s of [-1, 1]) {
        for (const k of [-1, 1]) part(h, box, M('whisker'), 0.36, 0.02, 0.02, s * 0.42, -0.16 + k * 0.05, 0.45).rotation.z = s * k * 0.12
        const ear = new Group()
        ear.position.set(s * 0.32, 0.42, 0)
        ear.rotation.z = -s * 0.25
        part(ear, cone, M('body'), 0.26, 0.42, 0.18, 0, 0.18, 0).rotation.y = Math.PI / 4
        part(ear, cone, M('ear'), 0.16, 0.3, 0.06, 0, 0.14, 0.08).rotation.y = Math.PI / 4
        h.add(ear)
      }
      rig.eyes = []
      for (const s of [-1, 1]) {
        const e = new Group()
        e.position.set(s * 0.24, 0.1, 0.43)
        part(e, box, M('eye'), 0.24, 0.28, 0.04, 0, 0, 0)
        part(e, box, M('gem'), 0.18, 0.24, 0.045, 0, -0.01, 0.003)
        part(e, box, M('pupil'), 0.07, 0.2, 0.05, 0, -0.01, 0.006)
        part(e, box, M('shine'), 0.06, 0.07, 0.055, 0.05, 0.07, 0.008)
        h.add(e)
        rig.eyes.push(e)
      }
      part(h, octa, M('gem'), 0.12, 0.18, 0.08, 0, 0.3, 0.43) // forehead gem
      // Crystal shards on the back.
      rig.gems = new Group()
      rig.gems.position.set(0, 1.1, -0.35)
      for (const [x, y, z, s, r] of [[0, 0.3, -0.1, 0.22, 0], [-0.28, 0.1, -0.05, 0.16, 0.5], [0.3, 0.05, -0.08, 0.17, -0.5], [0.1, -0.35, -0.25, 0.14, -0.3], [-0.15, -0.4, -0.3, 0.12, 0.4]]) {
        const c = part(rig.gems, octa, M('gem'), s, s * 2.2, s, x, y, z)
        c.rotation.set(-0.5, 0, r)
      }
      b.add(rig.gems)
      // Tail: segments curling up, crystal on the tip.
      rig.tail = []
      let parent = b
      let at = [0, 0.35, -0.7]
      for (let i = 0; i < 5; i++) {
        const seg = new Group()
        seg.position.set(...at)
        part(seg, box, M(i === 4 ? 'light' : 'body'), 0.2, 0.36, 0.2, 0, 0.16, 0)
        parent.add(seg)
        rig.tail.push(seg)
        parent = seg
        at = [0, 0.32, 0]
      }
      part(parent, octa, M('gem'), 0.15, 0.3, 0.15, 0, 0.48, 0)
      return 2.6
    },
    animate(rig, t) {
      rig.tail.forEach((s, i) => {
        s.rotation.x = -0.35 + Math.sin(t * 2 - i * 0.6) * 0.12
        s.rotation.z = Math.sin(t * 1.6 - i * 0.5) * 0.18
      })
      rig.head.rotation.z = Math.sin(t * 1.1) * 0.12
      rig.head.rotation.y = Math.sin(t * 0.7) * 0.15
      rig.gems.position.y = 1.1 + Math.sin(t * 2.4) * 0.03
      rig.body.scale.y = 1 + Math.sin(t * 2.4) * 0.015 // breathing
    },
  },
  // A lucky die on sneakers with pips on every side, juggling a little die
  // and wearing a tiny top hat.
  dadoodle: {
    colors: { die: '#fbfbf7', edge: '#d9dce6', pip: '#e8263a', mini: '#ffcf3a', minipip: '#1a1a2a', hat: '#1f1f2e', band: '#e8263a', eye: '#ffffff', pupil: '#111111', shoe: '#ff3ab0', limb: '#1f1f2e' },
    build(g, M, rig) {
      rig.body = new Group()
      g.add(rig.body)
      const b = rig.body
      shoes(g, M, 0.36, 0, 0.46, 0.32)
      for (const s of [-1, 1]) part(g, box, M('limb'), 0.14, 0.42, 0.14, s * 0.36, 0.48, 0)
      // The die: a cube with bevelled edges (edge strips) and pips.
      const S = 1.4
      const cy = 0.68 + S / 2
      part(b, box, M('die'), S, S, S, 0, cy, 0)
      for (const [w, h, d] of [[S + 0.04, 0.08, 0.08], [0.08, S + 0.04, 0.08], [0.08, 0.08, S + 0.04]]) {
        for (const a of [-1, 1]) for (const c of [-1, 1]) {
          if (w > 1) part(b, box, M('edge'), w, h, d, 0, cy + a * S / 2, c * S / 2)
          else if (h > 1) part(b, box, M('edge'), w, h, d, a * S / 2, cy, c * S / 2)
          else part(b, box, M('edge'), w, h, d, a * S / 2, cy + c * S / 2, 0)
        }
      }
      const pip = (x, y, z, axis) => {
        const p = part(b, cylZ, M('pip'), 0.12, 0.12, 0.04, x, y, z)
        if (axis === 'x') p.rotation.y = Math.PI / 2
        if (axis === 'y') p.rotation.x = Math.PI / 2
      }
      const o = S * 0.27
      // Right side: five. Left side: three. Top: one big. Back: four.
      for (const [a, c] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]]) pip(S / 2 + 0.01, cy + a * o, c * o, 'x')
      for (const k of [-1, 0, 1]) pip(-S / 2 - 0.01, cy + k * o, -k * o, 'x')
      pip(0, cy + S / 2 + 0.01, 0.35, 'y')
      for (const [a, c] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) pip(a * o, cy + c * o, -S / 2 - 0.01)
      // Face on the front.
      rig.eyes = eyes(b, M, 0, cy + 0.22, S / 2 + 0.01, 0.26, 0.28)
      mouth(b, M, 0, cy - 0.28, S / 2 + 0.01, 0.42, { teeth: 2 })
      cheeks(b, M, 0, cy - 0.1, S / 2 + 0.01, 0.48, 0.16)
      for (const s of [-1, 1]) part(b, box, M('limb'), 0.24, 0.06, 0.04, s * 0.28, cy + 0.5, S / 2 + 0.02).rotation.z = -s * 0.15
      // Tiny top hat, tilted.
      const hat = new Group()
      hat.position.set(-0.25, cy + S / 2, -0.1)
      hat.rotation.z = 0.18
      part(hat, cyl, M('hat'), 0.42, 0.06, 0.42, 0, 0.03, 0)
      part(hat, cyl, M('hat'), 0.27, 0.5, 0.27, 0, 0.3, 0)
      part(hat, cyl, M('band'), 0.28, 0.1, 0.28, 0, 0.12, 0)
      b.add(hat)
      // Arms: the right one tosses a little golden die.
      for (const s of [-1, 1]) {
        const arm = new Group()
        arm.position.set(s * (S / 2 + 0.05), cy, 0)
        part(arm, box, M('limb'), 0.12, 0.6, 0.12, s * 0.08, -0.26, 0)
        part(arm, sphere, M('glove'), 0.16, 0.16, 0.16, s * 0.1, -0.6, 0.02)
        b.add(arm)
        rig.arms.push(arm)
      }
      rig.mini = new Group()
      part(rig.mini, box, M('mini'), 0.36, 0.36, 0.36, 0, 0, 0)
      for (const [x, y] of [[-0.09, 0.09], [0.09, -0.09], [0, 0]]) part(rig.mini, cylZ, M('minipip'), 0.04, 0.04, 0.02, x, y, 0.185)
      for (const [x, y] of [[-0.09, 0.09], [0.09, -0.09]]) {
        const p = part(rig.mini, cylZ, M('minipip'), 0.04, 0.04, 0.02, 0.185, y, x)
        p.rotation.y = Math.PI / 2
      }
      rig.mini.userData.dynamic = true
      b.add(rig.mini)
      rig.cy = cy
      return 3.2
    },
    animate(rig, t) {
      const k = (t * 0.9) % 1
      const up = Math.sin(k * Math.PI)
      rig.mini.position.set(0.95, rig.cy - 0.3 + up * 1.6, 0.25)
      rig.mini.rotation.set(k * Math.PI * 4, k * Math.PI * 2, 0)
      rig.arms[1].rotation.z = 0.2 + (k < 0.12 || k > 0.9 ? 0.5 : 0)
      rig.arms[0].rotation.z = -0.25 + Math.sin(t * 3) * 0.1
      rig.body.rotation.y = Math.sin(t * 1.3) * 0.12
      rig.body.position.y = Math.abs(Math.sin(t * 2.6)) * 0.06
    },
  },
}
export const SPECIES_NAMES = Object.fromEntries(Object.entries(CREATURES).map(([k, v]) => [k, v.name]))
export const SPECIES_LIST = Object.keys(SPECIES)

// Lava creatures that are not lava monsters get their flame on top.
export function buildCreature(species, variant = 'normal', seed = 1) {
  const spec = SPECIES[species] ?? SPECIES.toastino
  const group = new Group()
  const pal = palette(species, spec, variant)
  const rig = { eyes: [], arms: [], slices: [], body: null, fire: variant === 'lava' ? [[0, 0, 0]] : [] }
  const height = spec.build(group, pal.get, rig)
  if (variant === 'lava' && species !== 'lavalump') rig.fire = [[0, height + 0.1, 0]]
  compact(group)
  group.userData.dynamic = true // animated: never baked into the static hub
  const phase = mulberry32(seed)() * 10
  let blinkAt = 1 + (phase % 3)
  return {
    group,
    height,
    fire: rig.fire,
    variant,
    species,
    update(time, dt) {
      const t = time + phase
      spec.animate(rig, t, group)
      // Blink: eyes squash shut for a moment every few seconds.
      blinkAt -= dt
      const shut = blinkAt < 0.12 && blinkAt > 0
      for (const e of rig.eyes) e.scale.y = shut ? 0.1 : 1
      if (blinkAt <= 0) blinkAt = 2 + ((t * 7.3) % 3)
      // Rainbow materials are shared per species: every copy cycles the same hue.
      const rb = pal.rainbow()
      if (rb) {
        const h = (time * 0.25) % 1
        rb.color.setHSL(h, 0.9, 0.55)
        rb.emissive.setHSL(h, 0.9, 0.35)
      }
    },
  }
}

export const RARITY_COLORS = { Common: '#e6e6e6', Uncommon: '#58ff6a', Rare: '#48a8ff', Epic: '#c46bff', Legendary: '#ffcc33', Mythic: '#ff4f6a', Secret: '#ffffff', Celestial: '#8ff3ff', Divine: '#ffe066', Absolute: '#4f9dff', Exclusive: '#ff4f4f' }
export const VARIANT_COLORS = { golden: '#ffd23a', diamond: '#7ff0ff', rainbow: '#ff7af2', lava: '#ff7a1a' }
export const VARIANT_NAMES = { golden: 'Golden', diamond: 'Diamond', rainbow: 'Rainbow', lava: 'Lava' }
