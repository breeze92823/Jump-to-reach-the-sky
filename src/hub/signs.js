// Signs: painted panels mounted on walls or posts. The face is a lit plane
// (a touch self-lit so it reads in shadow), on a thin backing block.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'

const backGeo = new BoxGeometry(1, 1, 1)

// tex: CanvasTexture; w x h metres; the face points along the group's +Z.
export function signPanel(tex, w, h, { depth = 0.35, back = '#ffffff', glow = 0.22 } = {}) {
  const g = new Group()
  const backing = new Mesh(backGeo, new MeshStandardMaterial({ color: back, roughness: 0.6 }))
  backing.scale.set(w + 0.1, h + 0.1, depth)
  backing.position.z = -depth / 2
  backing.castShadow = true
  backing.receiveShadow = true
  const face = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: glow }))
  face.position.z = 0.012
  face.receiveShadow = true
  g.add(backing, face)
  g.userData.face = face
  return g
}

// A sign on a wall: centre (x, y, z), facing yaw (0 = +Z/south), tilted `roll` radians in its plane.
export function wallSign(parent, tex, w, h, x, y, z, yaw = 0, roll = 0, opts) {
  const s = signPanel(tex, w, h, opts)
  s.position.set(x, y, z)
  s.rotation.set(0, yaw, roll, 'YXZ')
  parent.add(s)
  return s
}
