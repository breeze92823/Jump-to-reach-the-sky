// Building blocks for the hub: lego-stud materials, world-UV boxes (studs line
// up across neighbouring blocks and never stretch), cached plain materials and
// fixed colliders.
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Vector2 } from 'three'
import { RAPIER, addFixed } from '../physics.js'
import { canvasTexture, paintStuds } from './paint.js'

// Lego palette. colors alternate as a checker; `cells` squares per tile side,
// `studs` per square; one stud is 0.5 m, so a tile spans cells * studs * 0.5 m.
export const LEGO = {
  grass: { colors: ['#63de35', '#4dca28'], cells: 2, studs: 14, size: 1024 },
  wall: { colors: ['#b0704f', '#97593d'], cells: 2, studs: 14, size: 1024 },
  trim: { colors: ['#5ad52f'], cells: 1, studs: 8, size: 256 },
  wood: { colors: ['#7a4422'], cells: 1, studs: 8, size: 256 },
  woodDark: { colors: ['#5b301a'], cells: 1, studs: 8, size: 256 },
  plank: { colors: ['#9a5d32'], cells: 1, studs: 8, size: 256 },
  cream: { colors: ['#f3e8cf'], cells: 1, studs: 8, size: 256 },
  path: { colors: ['#d8b47c'], cells: 1, studs: 8, size: 256 },
  blank: { colors: ['#bb6d43', '#a35b36'], cells: 2, studs: 5, size: 512 },
  blue: { colors: ['#3fabf7', '#278de6'], cells: 2, studs: 14, size: 512 },
  purple: { colors: ['#b85bec', '#9c3fd5'], cells: 2, studs: 14, size: 512 },
  red: { colors: ['#f0614f', '#d6463a'], cells: 2, studs: 14, size: 512 },
  yellow: { colors: ['#ffd84a', '#f2bd25'], cells: 2, studs: 14, size: 512 },
  teal: { colors: ['#3fe0c8', '#25c4ad'], cells: 2, studs: 14, size: 512 },
  pink: { colors: ['#ff7ac4', '#f05aa8'], cells: 2, studs: 14, size: 512 },
  stone: { colors: ['#e3e6ea', '#cfd3d9'], cells: 2, studs: 6, size: 256 },
  green: { colors: ['#4fd06a', '#3bb956'], cells: 2, studs: 6, size: 256 },
  redPad: { colors: ['#e63a3a'], cells: 1, studs: 8, size: 256 },
  // Lane terraces (config ZONES[].floor).
  lime: { colors: ['#8fe23a', '#78d02a'], cells: 2, studs: 14, size: 512 },
  cyan: { colors: ['#2fd3ec', '#1dbad6'], cells: 2, studs: 14, size: 512 },
  gold: { colors: ['#ffc23a', '#f2a51f'], cells: 2, studs: 14, size: 512 },
  black: { colors: ['#363648', '#272736'], cells: 2, studs: 14, size: 512 },
  cloud: { colors: ['#c4f3ff', '#a8e6fa'], cells: 2, studs: 14, size: 512 },
  snow: { colors: ['#fffaf0', '#f3ead2'], cells: 2, studs: 14, size: 512 },
  // Lighter edge strips along each terrace's lip.
  lipLime: { colors: ['#c9ff7a'], cells: 1, studs: 8, size: 256 },
  lipCyan: { colors: ['#9ff4ff'], cells: 1, studs: 8, size: 256 },
  lipBlue: { colors: ['#8fc8ff'], cells: 1, studs: 8, size: 256 },
  lipPurple: { colors: ['#dba8ff'], cells: 1, studs: 8, size: 256 },
  lipGold: { colors: ['#ffe58a'], cells: 1, studs: 8, size: 256 },
  lipPink: { colors: ['#ffb3d6'], cells: 1, studs: 8, size: 256 },
  lipBlack: { colors: ['#6a6a88'], cells: 1, studs: 8, size: 256 },
  lipCloud: { colors: ['#ffffff'], cells: 1, studs: 8, size: 256 },
  lipSnow: { colors: ['#ffe680'], cells: 1, studs: 8, size: 256 },
  cliffCloud: { colors: ['#eaf6ff', '#d6ebfb'], cells: 2, studs: 14, size: 1024 },
}
export const tileOf = (name) => LEGO[name].cells * LEGO[name].studs * 0.5

const legoCache = new Map()
export function lego(name, extra = {}) {
  const key = name + JSON.stringify(extra)
  if (legoCache.has(key)) return legoCache.get(key)
  const spec = LEGO[name]
  const p = paintStuds(spec)
  const map = canvasTexture(p.color, true, true)
  const normalMap = canvasTexture(p.normal, false, true)
  const m = new MeshStandardMaterial({ map, normalMap, normalScale: new Vector2(0.55, 0.55), roughness: 0.62, metalness: 0, ...extra })
  m.userData.tile = tileOf(name)
  legoCache.set(key, m)
  return m
}

const plainCache = new Map()
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra)
  if (plainCache.has(key)) return plainCache.get(key)
  const m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.6, metalness: 0, ...extra })
  plainCache.set(key, m)
  return m
}

// Box UVs projected in world space: side faces use (z, y) or (x, y), the
// top/bottom use (x, z), all divided by the material's tile size.
export function worldUV(geo, tile) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (ny > 0.5) uv.setXY(i, x / tile, -z / tile)
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tile)
    else uv.setXY(i, x / tile, y / tile)
  }
  uv.needsUpdate = true
  return geo
}

// An axis-aligned box centred at (x, y, z) with world UVs. `m` is a material
// or an array of six; `collide` adds a matching fixed collider.
export function wbox(parent, w, h, d, x, y, z, m, { collide = false, shadow = true, tile } = {}) {
  const geo = new BoxGeometry(w, h, d).translate(x, y, z)
  const t = tile ?? (Array.isArray(m) ? m.find((q) => q.userData.tile)?.userData.tile : m.userData.tile) ?? 4
  worldUV(geo, t)
  const mesh = new Mesh(geo, m)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  parent.add(mesh)
  if (collide) solid(w / 2, h / 2, d / 2, x, y, z)
  return mesh
}

export function solid(hx, hy, hz, x, y, z, yaw = 0) {
  const q = yaw ? { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } : null
  return addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y, z }, q)
}

export function solidCylinder(r, h, x, y, z) {
  return addFixed(RAPIER.ColliderDesc.cylinder(h / 2, r), { x, y, z })
}

// Mesh placed in a parent (local coordinates) with shadows on.
export function add(parent, geo, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new Mesh(geo, material)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = receive
  parent.add(m)
  return m
}

// Converts a local point of a group into world coordinates (for colliders / zones).
export function toWorld(group, x, y, z) {
  group.updateMatrixWorld(true)
  const v = { x, y, z }
  const e = group.matrixWorld.elements
  return {
    x: e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12],
    y: e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13],
    z: e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14],
  }
}
