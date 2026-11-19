import { CircleGeometry, Group, IcosahedronGeometry, Mesh, MeshLambertMaterial, MeshStandardMaterial } from 'three'
import { mulberry32 } from './textures.js'
import { bake } from './bake.js'

// Everything around the hub: puffy clouds in the sky and a far grass plain
// under the scenery hills, so the horizon past the walls never shows a void.
// The hub itself (floor, walls, props, colliders) is built by src/hub/.

function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const group = new Group()
  for (let i = 0; i < 22; i++) {
    // Mostly ahead (-Z), a few all around.
    const ang = i < 15 ? -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.25 : rand() * Math.PI * 2
    const dist = 240 + rand() * 170
    const cloud = new Group()
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.82, r)
      puff.position.set(t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    const flat = new Mesh(geo, mat) // flat underside
    flat.scale.set(len * 0.62, 4, 9)
    cloud.add(flat)
    cloud.position.set(Math.cos(ang) * dist, 30 + rand() * 70, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

// The clouds and the far plain.
export function createWorld(scene) {
  const plain = new Mesh(new CircleGeometry(1400, 48), new MeshStandardMaterial({ color: '#4fb733', roughness: 1 }))
  plain.rotation.x = -Math.PI / 2
  plain.position.y = -0.4
  plain.receiveShadow = false
  const clouds = bake(makeClouds()) // ~170 puffs, one material: one draw call
  scene.add(plain, clouds)
  return {
    update(dt, elapsed) {
      clouds.rotation.y = elapsed * 0.002 // a slow drift across the sky
    },
  }
}
