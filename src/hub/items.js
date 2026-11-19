// Back items (config ITEMS, Items Shop): small toy models worn on the
// player's back, each adding flat Jump Power to every jump / hop. buildItem(id)
// returns { group, update(t) } centred on its own origin, about 1 m tall, with
// its straps side facing -Z (against the back). mountBackItem(playerGroup)
// keeps the equipped one on the avatar's back (hidden in first person with the
// avatar) and swaps it with a pop when the equipped item changes.
import { BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Curve, Vector3 } from 'three'
import { game } from '../game/state.js'

const box = new BoxGeometry(1, 1, 1)
const sphere = new SphereGeometry(1, 20, 14)
const cyl = new CylinderGeometry(1, 1, 1, 20)
const cone = new ConeGeometry(1, 1, 18)
const ring = new TorusGeometry(1, 0.18, 8, 24)

const mats = new Map()
function mat(color, extra = {}) {
  const k = color + JSON.stringify(extra)
  if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color, roughness: 0.6, ...extra }))
  return mats.get(k)
}
function p(parent, geo, material, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new Mesh(geo, typeof material === 'string' ? mat(material) : material)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  parent.add(m)
  return m
}

// Cardboard with a printed "this side up" label.
let labelTex = null
function label() {
  if (labelTex) return labelTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 96
  const x = c.getContext('2d')
  x.fillStyle = '#f4ecd8'
  x.fillRect(0, 0, 128, 96)
  x.strokeStyle = '#3a2a1a'
  x.lineWidth = 5
  x.strokeRect(4, 4, 120, 88)
  x.fillStyle = '#3a2a1a'
  for (const ax of [30, 58]) {
    x.beginPath()
    x.moveTo(ax, 20)
    x.lineTo(ax + 12, 38)
    x.lineTo(ax - 12, 38)
    x.fill()
    x.fillRect(ax - 4, 36, 8, 22)
  }
  for (let i = 0; i < 4; i++) x.fillRect(80, 22 + i * 12, 34, 5)
  labelTex = new CanvasTexture(c)
  labelTex.colorSpace = SRGBColorSpace
  return labelTex
}

// A coil spring along +Y.
class Helix extends Curve {
  constructor(r, h, turns) {
    super()
    this.r = r
    this.h = h
    this.turns = turns
  }
  getPoint(t, out = new Vector3()) {
    const a = t * Math.PI * 2 * this.turns
    return out.set(Math.cos(a) * this.r, t * this.h - this.h / 2, Math.sin(a) * this.r)
  }
}
const springGeo = new TubeGeometry(new Helix(0.16, 0.7, 6), 160, 0.035, 8, false)

// Two shoulder straps on the -Z side.
function straps(g, color, w = 0.5, h = 0.8) {
  for (const s of [-1, 1]) p(g, box, color, 0.1, h, 0.05, s * w * 0.35, 0, -0.29)
}

const BUILDERS = {
  box(g) {
    p(g, box, '#c98f52', 0.8, 0.72, 0.56, 0, 0, 0)
    p(g, box, '#b47a40', 0.82, 0.05, 0.58, 0, 0.33, 0) // flap seam
    p(g, box, '#e8c48a', 0.14, 0.74, 0.58, 0, 0, 0) // tape
    p(g, box, '#e8c48a', 0.82, 0.1, 0.14, 0, 0.36, 0)
    const l = p(g, box, new MeshStandardMaterial({ map: label(), roughness: 0.8 }), 0.3, 0.22, 0.01, 0.2, -0.12, 0.285)
    l.castShadow = false
    for (const [x, y] of [[-0.28, -0.24], [-0.32, 0.18]]) p(g, box, '#8a5a2a', 0.05, 0.05, 0.01, x, y, 0.285) // dents
    straps(g, '#6b4a2a', 0.8, 0.66)
  },
  backpack(g) {
    p(g, box, '#c8323a', 0.66, 0.72, 0.42, 0, -0.02, 0)
    p(g, cyl, '#c8323a', 0.33, 0.42, 0.33, 0, 0.34, 0, Math.PI / 2, 0, 0) // rounded top
    p(g, box, '#a8262e', 0.5, 0.36, 0.14, 0, -0.16, 0.26) // front pocket
    p(g, box, '#e2e2e2', 0.5, 0.04, 0.15, 0, -0.0, 0.26) // zip
    p(g, box, '#ffcf3a', 0.08, 0.1, 0.03, 0.18, -0.02, 0.34) // zip pull
    for (const s of [-1, 1]) {
      p(g, box, '#a8262e', 0.12, 0.34, 0.3, s * 0.38, -0.18, 0) // side pockets
      p(g, box, '#2a2a2a', 0.06, 0.12, 0.05, s * 0.16, -0.32, 0.34) // buckles
    }
    p(g, ring, '#2a2a2a', 0.13, 0.1, 0.13, 0, 0.56, 0) // handle
    p(g, box, '#ffcf3a', 0.16, 0.1, 0.02, -0.14, 0.14, 0.215) // name tag
    straps(g, '#3a3a3a', 0.66)
  },
  sack(g) {
    p(g, sphere, '#b98a4a', 0.42, 0.44, 0.36, 0, -0.06, 0)
    p(g, cyl, '#b98a4a', 0.18, 0.2, 0.18, 0, 0.38, 0)
    p(g, ring, '#7a4a1a', 0.2, 0.2, 0.2, 0, 0.32, 0, Math.PI / 2, 0, 0) // rope
    p(g, box, '#e8263a', 0.09, 0.22, 0.03, 0.12, 0.2, 0.16, 0, 0, 0.4) // ribbon tails
    p(g, box, '#e8263a', 0.09, 0.22, 0.03, -0.1, 0.2, 0.16, 0, 0, -0.4)
    // Presents poking out of the top.
    p(g, box, '#3a8aff', 0.22, 0.22, 0.22, -0.1, 0.56, 0, 0, 0.3, 0.2)
    p(g, box, '#ffe14a', 0.24, 0.05, 0.23, -0.1, 0.56, 0, 0, 0.3, 0.2)
    p(g, box, '#4ad66a', 0.18, 0.2, 0.18, 0.12, 0.54, 0.02, 0, -0.4, -0.25)
    p(g, sphere, '#e8263a', 0.06, 0.06, 0.06, -0.12, 0.7, 0)
    for (const [x, y] of [[-0.2, -0.2], [0.18, 0.05], [0.05, -0.3]]) p(g, box, '#8a6030', 0.1, 0.1, 0.02, x, y, 0.35) // patches
    straps(g, '#6b4a2a', 0.6)
  },
  jetpack(g, rig) {
    p(g, box, '#5a6070', 0.36, 0.7, 0.2, 0, 0, -0.12) // back plate
    for (const s of [-1, 1]) {
      p(g, cyl, '#d8dde8', 0.17, 0.7, 0.17, s * 0.2, 0, 0.06)
      p(g, sphere, '#d8dde8', 0.17, 0.12, 0.17, s * 0.2, 0.35, 0.06)
      p(g, cyl, '#e8263a', 0.175, 0.08, 0.175, s * 0.2, 0.12, 0.06) // stripe
      p(g, cyl, '#e8263a', 0.175, 0.08, 0.175, s * 0.2, -0.16, 0.06)
      p(g, cone, '#3a3f4a', 0.12, 0.16, 0.12, s * 0.2, -0.43, 0.06)
      const f = p(g, cone, mat('#ffb21f', { emissive: '#ff7a10', emissiveIntensity: 2.2, transparent: true, opacity: 0.9 }), 0.09, 0.32, 0.09, s * 0.2, -0.66, 0.06, Math.PI, 0, 0)
      f.castShadow = false
      rig.flames.push(f)
    }
    p(g, box, '#ffcf3a', 0.1, 0.1, 0.04, 0, 0.18, 0.0) // gauge
    p(g, cyl, '#2a2a2a', 0.04, 0.05, 0.04, 0, 0.18, 0.03, Math.PI / 2, 0, 0)
    straps(g, '#2a2a2a', 0.6)
  },
  spring(g, rig) {
    p(g, box, '#2f86ff', 0.6, 0.18, 0.36, 0, -0.38, 0) // base
    p(g, box, '#ffcf3a', 0.62, 0.05, 0.38, 0, -0.29, 0)
    rig.coils = []
    for (const s of [-1, 1]) {
      const c = p(g, springGeo, mat('#c8ccd8', { metalness: 0.8, roughness: 0.25 }), 1, 1, 1, s * 0.16, 0.06, 0)
      rig.coils.push(c)
    }
    rig.top = new Group()
    p(rig.top, box, '#e8263a', 0.62, 0.14, 0.38, 0, 0, 0)
    p(rig.top, sphere, '#ffffff', 0.08, 0.08, 0.08, 0.2, 0.08, 0.14)
    rig.top.position.y = 0.48
    g.add(rig.top)
    straps(g, '#1a3a8a', 0.6)
  },
  crimson(g, rig) {
    // A crimson glider: a lacquered deck with wing fins and a glowing keel.
    p(g, box, '#9a0f1f', 0.14, 0.95, 0.3, 0, 0, 0) // spine
    for (const s of [-1, 1]) {
      p(g, box, '#c8142a', 0.55, 0.08, 0.3, s * 0.3, 0.28, 0, 0, 0, -s * 0.35) // upper wing
      p(g, box, '#c8142a', 0.42, 0.07, 0.26, s * 0.24, -0.06, 0, 0, 0, -s * 0.15)
      p(g, box, '#5a0812', 0.04, 0.12, 0.31, s * 0.53, 0.47, 0, 0, 0, -s * 0.35) // tips
      p(g, box, '#ffcf3a', 0.36, 0.02, 0.31, s * 0.3, 0.33, 0.0, 0, 0, -s * 0.35) // gold trim
    }
    const keel = p(g, box, mat('#ff3a4a', { emissive: '#ff1a2a', emissiveIntensity: 1.6 }), 0.06, 0.8, 0.06, 0, 0, 0.17)
    keel.castShadow = false
    rig.glows.push(keel)
    p(g, cone, '#5a0812', 0.1, 0.22, 0.1, 0, 0.58, 0)
    p(g, cone, '#5a0812', 0.08, 0.18, 0.08, 0, -0.56, 0, Math.PI, 0, 0)
    straps(g, '#3a0610', 0.4)
  },
  rocket(g, rig) {
    p(g, cyl, '#f4f6fa', 0.22, 0.75, 0.22, 0, 0, 0.04)
    p(g, cone, '#e8263a', 0.22, 0.32, 0.22, 0, 0.53, 0.04)
    p(g, cyl, '#e8263a', 0.225, 0.07, 0.225, 0, -0.25, 0.04)
    p(g, cyl, '#2f86ff', 0.1, 0.03, 0.1, 0, 0.12, 0.25, Math.PI / 2, 0, 0) // porthole
    p(g, cyl, '#bfe8ff', 0.075, 0.035, 0.075, 0, 0.12, 0.255, Math.PI / 2, 0, 0)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6
      const f = new Group()
      f.position.set(Math.sin(a) * 0.2, -0.3, 0.04 + Math.cos(a) * 0.2)
      f.rotation.y = a
      p(f, box, '#e8263a', 0.04, 0.3, 0.18, 0, 0, 0.06)
      g.add(f)
    }
    p(g, cone, '#3a3f4a', 0.14, 0.12, 0.14, 0, -0.44, 0.04, Math.PI, 0, 0)
    const fl = p(g, cone, mat('#ffd23a', { emissive: '#ff7a10', emissiveIntensity: 2.4, transparent: true, opacity: 0.9 }), 0.12, 0.42, 0.12, 0, -0.7, 0.04, Math.PI, 0, 0)
    fl.castShadow = false
    rig.flames.push(fl)
    straps(g, '#2a2a2a', 0.5)
  },
  wings(g, rig) {
    // Feathered angel wings in three layers and a golden halo over them.
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(s * 0.08, 0.1, 0)
      for (let row = 0; row < 3; row++) {
        const n = 5 - row
        for (let i = 0; i < n; i++) {
          const a = 0.25 + i * 0.28
          const len = 0.55 - row * 0.12 + i * 0.03
          const f = p(w, sphere, row === 0 ? '#ffffff' : row === 1 ? '#f2f6ff' : '#e4ecff', len, 0.09, 0.05, s * Math.cos(a) * (0.32 - row * 0.06), Math.sin(a) * 0.32 - row * 0.12, -row * 0.03)
          f.rotation.z = s * (a - Math.PI / 2 + 0.3)
        }
      }
      g.add(w)
      rig.wings.push(w)
    }
    const halo = p(g, ring, mat('#ffe14a', { emissive: '#ffb21f', emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.3 }), 0.18, 0.18, 0.18, 0, 0.62, 0.05, Math.PI / 2, 0, 0)
    rig.glows.push(halo)
    p(g, box, '#ffe14a', 0.18, 0.18, 0.08, 0, 0.12, -0.02)
    straps(g, '#ffe14a', 0.4)
  },
}

export function buildItem(id) {
  const group = new Group()
  const rig = { flames: [], glows: [], wings: [], coils: [], top: null }
  ;(BUILDERS[id] ?? BUILDERS.box)(group, rig)
  return {
    group,
    update(t) {
      for (const f of rig.flames) {
        const k = 0.8 + Math.sin(t * 40 + f.position.x * 10) * 0.12 + Math.random() * 0.15
        f.userData.h ??= f.scale.y
        f.scale.y = f.userData.h * k
      }
      for (const w of rig.wings) w.rotation.y = Math.sign(w.position.x) * (Math.sin(t * 2.4) * 0.25 - 0.1)
      if (rig.top) {
        const k = Math.abs(Math.sin(t * 3))
        rig.top.position.y = 0.36 + k * 0.16
        for (const c of rig.coils) c.scale.y = 0.82 + k * 0.32
      }
      for (const gl of rig.glows) gl.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.4
    },
  }
}

// Keeps the equipped item on the avatar's back.
// `getId` says which item to wear (default: the local player's equipped one); remote players pass
// their synced one.
export function mountBackItem(playerGroup, getId = () => game.equipped) {
  const holder = new Group()
  holder.position.set(0, 1.12, -0.36) // between the shoulder blades (the avatar faces +Z)
  holder.rotation.y = Math.PI // the item's straps (-Z) against the back, its front facing out
  playerGroup.add(holder)
  let shown = null
  let item = null
  let pop = 0
  return {
    update(t, dt) {
      const want = getId() || ''
      if (want !== shown) {
        shown = want
        if (item) holder.remove(item.group)
        item = shown ? buildItem(shown) : null
        if (item) {
          item.group.scale.setScalar(0.62)
          holder.add(item.group)
          pop = 1
        }
      }
      if (!item) return
      pop = Math.max(0, pop - dt * 3)
      item.group.scale.setScalar(0.62 * (1 + Math.sin(pop * Math.PI) * 0.35))
      item.update(t)
    },
  }
}
