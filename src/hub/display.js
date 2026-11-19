// Shared pieces for things on show: a creature placed with its floating
// name / rarity / income tag (and real fire + crackle if it is a lava one),
// and the blocky stall keepers that wave and chatter when you walk up.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { buildCreature, RARITY_COLORS, SPECIES_NAMES, VARIANT_COLORS, VARIANT_NAMES } from './creatures.js'
import { short } from './paint.js'
import { CREATURES } from '../config.js'
import { baseIncome } from '../game/state.js'

const v = new Vector3()

// opts: species, variant, x, y, z (local to parent), rotY, scale, rarity, income ($/s), labelFar, seed
export function placeCreature(ctx, parent, o) {
  const c = buildCreature(o.species, o.variant ?? 'normal', o.seed ?? 1)
  const s = o.scale ?? 1
  c.group.position.set(o.x, o.y, o.z)
  c.group.rotation.y = o.rotY ?? 0
  c.group.scale.setScalar(s)
  c.group.userData.dynamic = true
  parent.add(c.group)
  ctx.onUpdate((t, dt) => c.update(t, dt))

  // Rarity and income default to the species' own (config CREATURES x variant).
  o = { rarity: CREATURES[o.species]?.rarity, income: baseIncome({ species: o.species, variant: o.variant ?? 'normal' }), ...o }
  const lines = []
  const colors = []
  if (o.variant && o.variant !== 'normal') {
    lines.push(VARIANT_NAMES[o.variant])
    colors.push(VARIANT_COLORS[o.variant])
  }
  lines.push(o.name ?? SPECIES_NAMES[o.species])
  colors.push('#ffffff')
  if (o.rarity) {
    lines.push(o.rarity)
    colors.push(RARITY_COLORS[o.rarity])
  }
  if (o.income) {
    lines.push(`$${short(o.income)}/s`)
    colors.push('#5dff4a')
  }
  const lh = o.labelLine ?? 0.42
  const tag = ctx.label(lines.join('\n'), lh * lines.length, { colors, outline: '#10162a', outlineWidth: 16 }, { near: (o.labelFar ?? 30) * 0.55, far: o.labelFar ?? 30 })
  const tagY = o.y + c.height * s + 0.35 + (lh * lines.length) / 2
  tag.position.set(o.x, tagY, o.z)
  parent.add(tag)

  // Lava: flames + embers from each fire point, and a crackle you can hear.
  if (c.fire.length) {
    parent.updateMatrixWorld(true)
    const boxes = c.fire.map(([fx, fy, fz]) => {
      v.set(fx, fy, fz).applyMatrix4(c.group.matrixWorld)
      return { x: v.x, y: v.y, z: v.z, sx: 0.18 * s, sy: 0.05, sz: 0.18 * s }
    })
    const seed = (o.seed ?? 1) * 13
    ctx.emitter({ boxes, count: 28 * boxes.length, life: 0.75, velocity: [0, 2.2 * s, 0], spread: [0.35, 0.5, 0.35], size: 0.55 * s, grow: 0.15, color: '#ff7a1a', intensity: 3.2, seed })
    ctx.emitter({ boxes, count: 14 * boxes.length, life: 0.5, velocity: [0, 1.6 * s, 0], spread: [0.2, 0.3, 0.2], size: 0.35 * s, grow: 0.3, color: '#ffe066', intensity: 3.5, seed: seed + 1 })
    ctx.emitter({ boxes, count: 8 * boxes.length, life: 1.8, velocity: [0, 2.4, 0], spread: [0.8, 0.6, 0.8], size: 0.12, grow: 0.5, color: '#ffb040', intensity: 4, twinkle: 12, sprite: 'sparkle', seed: seed + 2 })
    ctx.addEmitter('fire', boxes[0].x, boxes[0].y, boxes[0].z, 0.8)
  }
  // Diamond / golden / rainbow creatures glitter.
  if (o.variant === 'diamond' || o.variant === 'golden' || o.variant === 'rainbow') {
    parent.updateMatrixWorld(true)
    v.set(0, c.height * 0.5, 0).applyMatrix4(c.group.matrixWorld)
    const color = o.variant === 'diamond' ? '#bff6ff' : o.variant === 'golden' ? '#ffe680' : '#ffb0f0'
    ctx.emitter({ boxes: [{ x: v.x, y: v.y, z: v.z, sx: 0.7 * s, sy: c.height * 0.45 * s, sz: 0.7 * s }], count: 12, life: 1.4, velocity: [0, 0.3, 0], spread: [0.2, 0.2, 0.2], size: 0.32, grow: 0.2, color, intensity: 3, twinkle: 10, sprite: 'sparkle', seed: (o.seed ?? 1) * 7 })
  }
  ctx.onUpdate((t) => {
    tag.position.y = tagY + Math.sin(t * 1.5 + (o.seed ?? 0)) * 0.08
  })
  return { creature: c, tag }
}

// --- Stall keepers ---------------------------------------------------------------------
const box = new BoxGeometry(1, 1, 1)
const mats = new Map()
const m = (c) => {
  if (!mats.has(c)) mats.set(c, new MeshStandardMaterial({ color: c, roughness: 0.6 }))
  return mats.get(c)
}
function b(parent, color, w, h, d, x, y, z) {
  const mesh = new Mesh(box, m(color))
  mesh.scale.set(w, h, d)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

// look: { skin, shirt, pants, hat: 'cap' | 'top' | 'hood' | 'bandana' | null, hatColor, apron, beard }
export function keeper(look) {
  const g = new Group()
  g.userData.dynamic = true
  const body = new Group()
  g.add(body)
  for (const s of [-1, 1]) b(g, look.pants, 0.36, 0.9, 0.4, s * 0.21, 0.45, 0)
  b(body, look.shirt, 0.95, 0.95, 0.5, 0, 1.38, 0)
  if (look.apron) b(body, look.apron, 0.7, 0.9, 0.04, 0, 1.25, 0.27)
  const head = new Group()
  head.position.set(0, 2.18, 0)
  body.add(head)
  b(head, look.skin, 0.62, 0.62, 0.62, 0, 0, 0)
  for (const s of [-1, 1]) {
    b(head, '#ffffff', 0.13, 0.15, 0.04, s * 0.14, 0.06, 0.31)
    b(head, '#1a1a1a', 0.07, 0.09, 0.05, s * 0.14, 0.05, 0.32)
  }
  b(head, '#7a3020', 0.24, 0.06, 0.04, 0, -0.14, 0.31) // smile
  if (look.beard) b(head, look.beard, 0.64, 0.24, 0.1, 0, -0.24, 0.28)
  if (look.hat === 'cap') {
    b(head, look.hatColor, 0.66, 0.2, 0.66, 0, 0.38, 0)
    b(head, look.hatColor, 0.5, 0.06, 0.32, 0, 0.3, 0.42)
  } else if (look.hat === 'top') {
    b(head, look.hatColor, 0.8, 0.06, 0.8, 0, 0.34, 0)
    b(head, look.hatColor, 0.52, 0.55, 0.52, 0, 0.62, 0)
    b(head, '#d63a3a', 0.54, 0.1, 0.54, 0, 0.42, 0)
  } else if (look.hat === 'hood') {
    b(head, look.hatColor, 0.72, 0.72, 0.5, 0, 0.06, -0.12)
    b(head, look.hatColor, 0.72, 0.16, 0.7, 0, 0.36, 0)
  } else if (look.hat === 'bandana') {
    b(head, look.hatColor, 0.66, 0.18, 0.66, 0, 0.28, 0)
    b(head, look.hatColor, 0.12, 0.3, 0.12, 0, 0.18, -0.36)
  }
  const arms = []
  for (const s of [-1, 1]) {
    const a = new Group()
    a.position.set(s * 0.62, 1.78, 0)
    b(a, look.shirt, 0.3, 0.4, 0.34, 0, -0.15, 0)
    b(a, look.skin, 0.26, 0.55, 0.3, 0, -0.6, 0)
    body.add(a)
    arms.push(a)
  }
  let wave = 0
  let look2 = 0
  const target = new Vector3()
  return {
    group: g,
    greet() {
      wave = 1.6
    },
    update(t, dt, playerPos) {
      wave = Math.max(0, wave - dt)
      body.rotation.z = Math.sin(t * 1.3) * 0.03
      body.position.y = Math.sin(t * 2.6) * 0.015
      // Wave the right arm while greeting; otherwise a little idle arm swing.
      const w = Math.min(1, wave * 2)
      arms[1].rotation.z = -w * (2.4 + Math.sin(t * 14) * 0.35)
      arms[0].rotation.x = Math.sin(t * 1.3) * 0.08
      arms[1].rotation.x = (1 - w) * Math.sin(t * 1.3 + 1) * 0.08
      // Turn the head toward the player when they are near.
      g.updateMatrixWorld()
      target.set(playerPos.x, 0, playerPos.z)
      g.worldToLocal(target)
      const near = target.lengthSq() < 144 && target.z > 0
      const want = near ? Math.max(-0.9, Math.min(0.9, Math.atan2(target.x, target.z))) : Math.sin(t * 0.4) * 0.3
      look2 += (want - look2) * Math.min(1, dt * 5)
      head.rotation.y = look2
    },
  }
}
