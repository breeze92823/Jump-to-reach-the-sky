import { Group, Matrix4, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// --- Baking: one mesh per material ------------------------------------------------
// Props are built from many small meshes (a palm is ~20); merging the ones
// that share a look keeps a set piece to a handful of draw calls (mobile).
const matKey = (m) => [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.vertexColors, m.side, m.flatShading, m.transparent, m.opacity, m.blending, m.map?.uuid, m.roughness, m.metalness, m.userData.k].join('|')
const rel = new Matrix4()
export function bake(root, castShadow = false) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const groups = new Map() // key -> { mat, geos }
  const out = new Group()
  root.traverse((o) => {
    if (!o.isMesh) return
    rel.multiplyMatrices(inv, o.matrixWorld)
    if (Array.isArray(o.material)) {
      out.add(new Mesh(o.geometry.clone().applyMatrix4(rel), o.material)) // multi-material: kept as is
      return
    }
    const key = matKey(o.material)
    let e = groups.get(key)
    if (!e) groups.set(key, (e = { mat: o.material, geos: [] }))
    e.geos.push((o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel))
  })
  for (const { mat, geos } of groups.values()) {
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]))
    for (const g of geos) {
      for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n)
      g.morphAttributes = {}
      g.clearGroups()
    }
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    if (merged) out.add(new Mesh(merged, mat))
  }
  out.traverse((o) => {
    if (o.isMesh) o.castShadow = castShadow
  })
  return out
}

// --- Compacting an animated model --------------------------------------------------
// Inside a part that animates (a creature's arms, a gift's lid), every group's
// leaf meshes that share a material become one mesh in that group's frame, so
// the groups keep animating but cost one draw call per material. Meshes flagged
// userData.dynamic (animated on their own) are left alone.
export function compact(node) {
  for (const c of [...node.children]) if (c.children.length) compact(c)
  const byMat = new Map()
  for (const c of node.children) {
    if (!c.isMesh || c.isInstancedMesh || c.children.length || c.userData.dynamic || Array.isArray(c.material)) continue
    if (!byMat.has(c.material)) byMat.set(c.material, [])
    byMat.get(c.material).push(c)
  }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue
    const geos = list.map((m) => {
      m.updateMatrix()
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix)
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n)
      g.morphAttributes = {}
      g.clearGroups()
      return g
    })
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    if (!merged) continue
    const mesh = new Mesh(merged, material)
    mesh.castShadow = list.some((m) => m.castShadow)
    mesh.receiveShadow = true
    for (const m of list) node.remove(m)
    node.add(mesh)
  }
}
