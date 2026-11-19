// The arena shell: the green stud-checker floor, the tall brown checker walls
// with grass caps, the gap in the north wall where the lane leaves (checker
// start line + "Common" painted on the ground; the lane itself is lane.js),
// blocky hills outside the walls and low-poly trees.
// Static meshes are baked to one mesh per material; colliders are plain boxes.
import { ConeGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { HUB } from '../config.js'
import { bake } from '../bake.js'
import { mulberry32 } from '../textures.js'
import { lego, solid, wbox } from './kit.js'
import { decalTexture } from './paint.js'

const pineGeo = new ConeGeometry(1, 1, 7)
const blobGeo = new IcosahedronGeometry(1, 0)
const trunkMat = new MeshStandardMaterial({ color: '#6e4527', roughness: 0.9 })
const pineMat = new MeshStandardMaterial({ color: '#2f9440', roughness: 0.8, flatShading: true })
const pineDark = new MeshStandardMaterial({ color: '#25803a', roughness: 0.8, flatShading: true })
const leafMat = new MeshStandardMaterial({ color: '#43b23c', roughness: 0.8, flatShading: true })
const leafLight = new MeshStandardMaterial({ color: '#5cc84a', roughness: 0.8, flatShading: true })
const flowerMats = ['#ffffff', '#ffe14a', '#ff8fc8'].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.5 }))

function mesh(parent, geo, m, sx, sy, sz, x, y, z, ry = 0) {
  const o = new Mesh(geo, m)
  o.scale.set(sx, sy, sz)
  o.position.set(x, y, z)
  o.rotation.y = ry
  parent.add(o)
  return o
}

// A low-poly pine: a square trunk and three stacked 7-sided cones.
export function pine(parent, x, y, z, s = 1, rand = Math.random) {
  const ry = rand() * Math.PI
  mesh(parent, blobGeo, trunkMat, 0.35 * s, 1.3 * s, 0.35 * s, x, y + 1.1 * s, z, ry)
  const tiers = [[2.3, 2.6, 2.6], [1.8, 2.3, 4.2], [1.25, 2.0, 5.6]]
  tiers.forEach(([r, h, ty], i) => mesh(parent, pineGeo, i % 2 ? pineDark : pineMat, r * s, h * s, r * s, x, y + ty * s, z, ry + i * 0.4))
}

// A round tree: trunk + a cluster of faceted leaf blobs.
export function roundTree(parent, x, y, z, s = 1, rand = Math.random) {
  mesh(parent, blobGeo, trunkMat, 0.4 * s, 1.6 * s, 0.4 * s, x, y + 1.4 * s, z)
  mesh(parent, blobGeo, leafMat, 2.2 * s, 1.8 * s, 2.2 * s, x, y + 3.6 * s, z, rand() * 3)
  mesh(parent, blobGeo, leafLight, 1.5 * s, 1.3 * s, 1.5 * s, x + 0.9 * s, y + 4.4 * s, z + 0.4 * s, rand() * 3)
  mesh(parent, blobGeo, leafMat, 1.3 * s, 1.1 * s, 1.3 * s, x - 1 * s, y + 4.1 * s, z - 0.5 * s, rand() * 3)
}

function flowers(parent, x, y, z, rand) {
  for (let i = 0; i < 4; i++) {
    const m = flowerMats[Math.floor(rand() * flowerMats.length)]
    mesh(parent, blobGeo, m, 0.22, 0.18, 0.22, x + (rand() - 0.5) * 1.6, y + 0.15, z + (rand() - 0.5) * 1.6)
  }
}

export function buildArena(scene) {
  const { halfX: X, north: N, south: S, wallHeight: H, wallThickness: T, laneHalf: L } = HUB
  const root = new Group()
  const rand = mulberry32(4242)
  const grass = lego('grass')
  const wall = lego('wall')
  const trim = lego('trim')
  const wallMats = [wall, wall, trim, wall, wall, wall]

  // --- Floor ---
  const fx0 = -X - T
  const fx1 = X + T
  const fz0 = N - T
  const fz1 = S + T
  wbox(root, fx1 - fx0, 1, fz1 - fz0, (fx0 + fx1) / 2, -0.5, (fz0 + fz1) / 2, grass, { shadow: false })
  solid((fx1 - fx0) / 2, 2, (fz1 - fz0) / 2, 0, -2, (fz1 + fz0) / 2)

  // --- Walls (box + an overhanging grass cap) ---
  const walls = [
    // [x0, x1, z0, z1]
    [-X - T, X + T, S, S + T], // south
    [-X - T, -X, N - T, S], // west
    [X, X + T, N - T, S], // east
    [-X - T, -L, N - T, N], // north, west of the lane gap
    [L, X + T, N - T, N], // north, east of the gap (the lane's own cliffs carry on north: lane.js)
  ]
  for (const [x0, x1, z0, z1] of walls) {
    const w = x1 - x0
    const d = z1 - z0
    wbox(root, w, H, d, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, wallMats, { collide: true, tile: 14 })
    wbox(root, w + 0.8, 1.4, d + 0.8, (x0 + x1) / 2, H + 0.3, (z0 + z1) / 2, trim)
  }
  // A darker skirting band where the walls meet the floor (grounds them visually).
  const skirt = lego('woodDark')
  wbox(root, 2 * X, 0.6, 0.4, 0, 0.3, S - 0.2, skirt)
  wbox(root, 0.4, 0.6, S - N, -X + 0.2, 0.3, (S + N) / 2, skirt)
  wbox(root, 0.4, 0.6, S - N, X - 0.2, 0.3, (S + N) / 2, skirt)
  wbox(root, X - L, 0.6, 0.4, -(X + L) / 2, 0.3, N + 0.2, skirt)
  wbox(root, X - L, 0.6, 0.4, (X + L) / 2, 0.3, N + 0.2, skirt)

  // --- Trees and flowers on the wall tops ---
  const top = H + 1
  const along = (x0, x1, z0, z1, n) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (x1 - x0)
      const z = z0 + rand() * (z1 - z0)
      if (rand() < 0.55) pine(root, x, top, z, 0.9 + rand() * 0.6, rand)
      else roundTree(root, x, top, z, 0.9 + rand() * 0.5, rand)
      flowers(root, x + 2, top, z + 1, rand)
    }
  }
  along(-X + 2, X - 2, S + 1, S + T - 1, 9)
  along(-X - T + 1, -X - 1, N, S, 7)
  along(X + 1, X + T - 1, N, S, 7)
  along(-X, -L - 3, N - T + 1, N - 1, 4)
  along(L + 3, X, N - T + 1, N - 1, 4)

  // --- Lane start: checker line across the gap and "Common" painted on the ground ---
  const light = new MeshStandardMaterial({ color: '#eef1f5', roughness: 0.5 })
  const dark = new MeshStandardMaterial({ color: '#4c5360', roughness: 0.5 })
  const seg = 1.6
  for (let i = 0, x = -L; x < L - 0.01; i++, x += seg) {
    for (let row = 0; row < 2; row++) {
      const m = new Mesh(new PlaneGeometry(seg, 0.6), (i + row) % 2 ? dark : light)
      m.rotation.x = -Math.PI / 2
      m.position.set(x + seg / 2, 0.025, N - 0.3 - row * 0.6)
      m.receiveShadow = true
      root.add(m)
    }
  }
  const decal = new Mesh(new PlaneGeometry(17, 4.25), new MeshBasicMaterial({ map: decalTexture('Common'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  decal.rotation.x = -Math.PI / 2
  decal.position.set(0, 0.03, N - 5.2)
  decal.renderOrder = 1
  root.add(decal)

  // --- Blocky hills outside the walls, peeking over them ---
  const hill = (cx, cz, w, d, h) => {
    wbox(root, w, h, d, cx, h / 2 - 0.4, cz, wallMats, { tile: 14, shadow: false })
    wbox(root, w + 0.8, 1.3, d + 0.8, cx, h + 0.2, cz, trim, { shadow: false })
    const n = Math.floor((w * d) / 260)
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * (w - 4)
      const z = cz + (rand() - 0.5) * (d - 4)
      if (rand() < 0.6) pine(root, x, h + 0.8, z, 1 + rand() * 0.6, rand)
      else roundTree(root, x, h + 0.8, z, 1 + rand() * 0.4, rand)
    }
  }
  for (let i = 0; i < 7; i++) hill(-X + 10 + i * 22 + rand() * 6, S + T + 14 + rand() * 18, 18 + rand() * 14, 18 + rand() * 12, H + 4 + rand() * 18)
  for (let i = 0; i < 6; i++) hill(-X - T - 14 - rand() * 16, S - 10 - i * 20 - rand() * 4, 18 + rand() * 10, 18 + rand() * 12, H + 4 + rand() * 20)
  for (let i = 0; i < 6; i++) hill(X + T + 14 + rand() * 16, S - 10 - i * 20 - rand() * 4, 18 + rand() * 10, 18 + rand() * 12, H + 4 + rand() * 20)
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) hill(s * (L + T + 20 + i * 18 + rand() * 4), N - T - 16 - rand() * 14, 16 + rand() * 8, 22 + rand() * 10, H + 6 + rand() * 16)

  // The decal (transparent) stays a separate mesh so it draws after the floor.
  root.remove(decal)
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  baked.add(decal)
  baked.userData.dynamic = true
  scene.add(baked)
  return baked
}
