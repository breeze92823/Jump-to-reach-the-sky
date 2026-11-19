// Portraits for the HUD (Index, windows, carry chip, offers): each creature
// species + variant (or any other model, e.g. a back item) is rendered once with
// the game's own renderer into a small render target, read back and kept as a
// data URL. Transparent background.
//   thumb(species, variant)      -> creature portrait
//   thumb.item(id)               -> Items Shop item portrait
//   thumb.cached(species, variant) -> true when it is ready without rendering
import { Box3, DirectionalLight, HemisphereLight, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, Color } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCreature } from '../hub/creatures.js'
import { buildItem } from '../hub/items.js'

const SIZE = 160

export function createThumbs(renderer) {
  const rt = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
  rt.texture.colorSpace = SRGBColorSpace
  const scene = new Scene()
  scene.add(new HemisphereLight('#ffffff', '#9ab4d8', 2.4))
  const sun = new DirectionalLight('#ffffff', 2.2)
  sun.position.set(3, 6, 7)
  scene.add(sun)
  // A soft studio environment so golden / diamond variants have something to reflect.
  let envReady = false
  const ensureEnv = () => {
    if (envReady) return
    envReady = true
    try {
      const pmrem = new PMREMGenerator(renderer)
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      scene.environmentIntensity = 1.15
      pmrem.dispose()
    } catch {
      // No environment: plain lighting still works.
    }
  }
  const cam = new PerspectiveCamera(28, 1, 0.1, 100)
  const cache = new Map()
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const c2d = canvas.getContext('2d')
  const image = c2d.createImageData(SIZE, SIZE)
  const box = new Box3()
  const centre = new Vector3()
  const dims = new Vector3()
  const clear = new Color()

  // Renders the group (framed to fit) to a PNG data URL.
  function shoot(group, rotY) {
    ensureEnv()
    group.rotation.y = rotY
    scene.add(group)
    group.updateMatrixWorld(true)
    box.setFromObject(group)
    box.getCenter(centre)
    box.getSize(dims)
    const r = Math.max(dims.y, dims.x * 0.9, dims.z * 0.9) * 0.62
    const dist = r / Math.tan((cam.fov * Math.PI) / 360)
    cam.position.set(centre.x + dist * 0.12, centre.y + dist * 0.12, centre.z + dist)
    cam.lookAt(centre)
    const prevTarget = renderer.getRenderTarget()
    renderer.getClearColor(clear)
    const prevAlpha = renderer.getClearAlpha()
    const prevShadow = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, cam)
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels)
    renderer.setRenderTarget(prevTarget)
    renderer.setClearColor(clear, prevAlpha)
    renderer.shadowMap.autoUpdate = prevShadow
    scene.remove(group)
    // Rows come back bottom-up.
    for (let y = 0; y < SIZE; y++) image.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4)
    c2d.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function render(key, make, rotY) {
    if (cache.has(key)) return cache.get(key)
    let url = ''
    try {
      url = shoot(make(), rotY)
    } catch {
      url = ''
    }
    cache.set(key, url)
    return url
  }

  function thumb(species, variant = 'normal') {
    return render(
      species + '|' + variant,
      () => {
        const c = buildCreature(species, variant, 7)
        c.update(variant === 'rainbow' ? 3.3 : 0.6, 0.016) // rainbow: a magenta moment of its hue cycle
        return c.group
      },
      -0.45,
    )
  }
  thumb.item = (id) =>
    render(
      'item|' + id,
      () => {
        const it = buildItem(id)
        it.update(0.4)
        return it.group
      },
      -0.55,
    )
  thumb.cached = (species, variant = 'normal') => cache.has(species + '|' + variant)
  return thumb
}
