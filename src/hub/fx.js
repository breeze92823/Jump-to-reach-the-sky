// One-shot effects: particle bursts (sparks, confetti, dust), gold coins that
// pop out, arc and then fly into the player, expanding ground rings and
// floating "+$120" text. Everything is pooled and allocated once, so a burst
// never allocates during play; the pools simply recycle their oldest entry.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  Points,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { paintSoftDot, paintSparkle } from '../textures.js'
import { outlined, paintJumper } from './paint.js'

const vertexShader = /* glsl */ `
  uniform float uViewport;
  attribute vec3 tint;
  attribute float size;
  attribute float alpha;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vTint = tint;
    vAlpha = alpha;
    gl_PointSize = size * projectionMatrix[1][1] * 0.5 * uViewport / max(-mv.z, 0.1);
  }`
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uIntensity;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    if (vAlpha <= 0.0) discard;
    gl_FragColor = vec4(vTint * t.rgb * uIntensity, t.a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

const viewport = { value: 800 }
const tmp = new Color()

function makePool(scene, sprite, n, intensity) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(n * 3).fill(0)
  const tint = new Float32Array(n * 3)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  for (const [name, arr, k] of [['position', pos, 3], ['tint', tint, 3], ['size', size, 1], ['alpha', alpha, 1]]) {
    const a = new BufferAttribute(arr, k)
    a.setUsage(DynamicDrawUsage)
    geo.setAttribute(name, a)
  }
  const tex = new CanvasTexture(sprite)
  tex.colorSpace = SRGBColorSpace
  const material = new ShaderMaterial({
    uniforms: { uViewport: viewport, map: { value: tex }, uIntensity: { value: intensity } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 3
  scene.add(points)
  const p = []
  for (let i = 0; i < n; i++) p.push({ age: 1, life: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 0, s1: 0, x: 0, y: 0, z: 0 })
  return { points, geo, pos, tint, size, alpha, p, next: 0, n, active: 0 }
}

const rand = (a, b) => a + Math.random() * (b - a)

export function createFx(scene, getPlayer) {
  const pools = {
    dot: makePool(scene, paintSoftDot(), 700, 2.2),
    sparkle: makePool(scene, paintSparkle(), 400, 3),
  }
  let density = 1

  // opts: count, colors, speed [lo,hi], up, spread ('sphere' | 'up' | 'ring' | 'disc'),
  // radius (spawn jitter m), gravity, drag, life [lo,hi], size [lo,hi], grow, sprite
  function burst(x, y, z, o = {}) {
    const pool = pools[o.sprite ?? 'dot']
    const count = Math.max(1, Math.round((o.count ?? 20) * density))
    const colors = o.colors ?? ['#ffffff']
    const [s0, s1] = o.speed ?? [2, 5]
    const [l0, l1] = o.life ?? [0.5, 1]
    const [z0, z1] = o.size ?? [0.2, 0.4]
    for (let k = 0; k < count; k++) {
      const i = pool.next
      pool.next = (pool.next + 1) % pool.n
      const q = pool.p[i]
      const sp = rand(s0, s1)
      let dx, dy, dz
      const spread = o.spread ?? 'sphere'
      if (spread === 'up') {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * (o.cone ?? 0.5)
        dx = Math.cos(a) * r
        dz = Math.sin(a) * r
        dy = 1
      } else if (spread === 'ring' || spread === 'disc') {
        const a = Math.random() * Math.PI * 2
        dx = Math.cos(a)
        dz = Math.sin(a)
        dy = spread === 'ring' ? 0.15 : rand(0, 0.4)
      } else {
        dx = Math.random() * 2 - 1
        dy = Math.random() * 2 - 1
        dz = Math.random() * 2 - 1
      }
      const len = Math.hypot(dx, dy, dz) || 1
      const rj = o.radius ?? 0
      q.x = x + (Math.random() * 2 - 1) * rj
      q.y = y + (o.yJitter ? Math.random() * o.yJitter : 0)
      q.z = z + (Math.random() * 2 - 1) * rj
      q.vx = (dx / len) * sp
      q.vy = (dy / len) * sp + (o.up ?? 0)
      q.vz = (dz / len) * sp
      q.g = o.gravity ?? 0
      q.drag = o.drag ?? 1.5
      q.age = 0
      q.life = rand(l0, l1)
      q.s0 = rand(z0, z1)
      q.s1 = q.s0 * (o.grow ?? 0.2)
      tmp.set(colors[Math.floor(Math.random() * colors.length)])
      pool.tint[i * 3] = tmp.r
      pool.tint[i * 3 + 1] = tmp.g
      pool.tint[i * 3 + 2] = tmp.b
    }
    pool.geo.attributes.tint.needsUpdate = true
  }

  function updatePool(pool, dt) {
    let any = false
    for (let i = 0; i < pool.n; i++) {
      const q = pool.p[i]
      if (q.age >= q.life) {
        if (pool.alpha[i] !== 0) {
          pool.alpha[i] = 0
          any = true
        }
        continue
      }
      any = true
      q.age += dt
      const k = Math.min(1, q.age / q.life)
      const drag = Math.exp(-q.drag * dt)
      q.vx *= drag
      q.vz *= drag
      q.vy = q.vy * drag - q.g * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.z += q.vz * dt
      if (q.y < 0.05 && q.vy < 0) {
        q.y = 0.05
        q.vy *= -0.3
      }
      pool.pos[i * 3] = q.x
      pool.pos[i * 3 + 1] = q.y
      pool.pos[i * 3 + 2] = q.z
      pool.size[i] = q.s0 + (q.s1 - q.s0) * k
      pool.alpha[i] = Math.min(1, k * 10) * (1 - k * k)
    }
    if (any) {
      pool.geo.attributes.position.needsUpdate = true
      pool.geo.attributes.size.needsUpdate = true
      pool.geo.attributes.alpha.needsUpdate = true
    }
  }

  // --- Coins ----------------------------------------------------------------------
  const COINS = 64
  const coinGeo = new CylinderGeometry(0.32, 0.32, 0.09, 18)
  coinGeo.rotateX(Math.PI / 2)
  const coinMat = new MeshStandardMaterial({ color: '#ffcf33', metalness: 0.85, roughness: 0.25, emissive: '#7a4a00', emissiveIntensity: 0.6 })
  const coins = new InstancedMesh(coinGeo, coinMat, COINS)
  coins.instanceMatrix.setUsage(DynamicDrawUsage)
  coins.frustumCulled = false
  coins.castShadow = true
  scene.add(coins)
  const coinState = []
  const hidden = new Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < COINS; i++) {
    coinState.push({ live: false, t: 0, p: new Vector3(), v: new Vector3(), spin: 0, ax: 0, onArrive: null })
    coins.setMatrixAt(i, hidden)
  }
  let coinNext = 0
  const dummy = new Object3D()
  const target = new Vector3()

  // n coins pop up from (x, y, z), arc, then home into the player; onArrive(i) per coin.
  function coinShower(x, y, z, n = 8, onArrive = null) {
    n = Math.max(3, Math.round(n * (0.5 + density * 0.5)))
    for (let k = 0; k < n; k++) {
      const c = coinState[coinNext]
      coinNext = (coinNext + 1) % COINS
      const a = Math.random() * Math.PI * 2
      const sp = rand(1.5, 3.5)
      c.live = true
      c.t = -k * 0.035 // a little stagger so they spray out as a stream
      c.p.set(x, y, z)
      c.v.set(Math.cos(a) * sp, rand(6, 9), Math.sin(a) * sp)
      c.spin = rand(8, 14)
      c.ax = Math.random() * Math.PI
      c.onArrive = onArrive
    }
  }

  function updateCoins(dt) {
    const pl = getPlayer()
    let changed = false
    for (let i = 0; i < COINS; i++) {
      const c = coinState[i]
      if (!c.live) continue
      changed = true
      c.t += dt
      if (c.t < 0) {
        coins.setMatrixAt(i, hidden)
        continue
      }
      if (c.t < 0.55) {
        c.v.y -= 22 * dt
        c.p.addScaledVector(c.v, dt)
      } else {
        // Homing: accelerate toward the player's chest.
        target.set(pl.x, pl.y + 1.2, pl.z)
        const d = target.distanceTo(c.p)
        const speed = 8 + (c.t - 0.55) * 40
        if (d < 0.6) {
          c.live = false
          coins.setMatrixAt(i, hidden)
          burst(c.p.x, c.p.y, c.p.z, { sprite: 'sparkle', count: 3, colors: ['#ffe066', '#fff4b0'], speed: [1, 2.5], life: [0.25, 0.45], size: [0.35, 0.55] })
          c.onArrive?.(i)
          continue
        }
        c.v.lerp(target.sub(c.p).normalize().multiplyScalar(speed), Math.min(1, dt * 9))
        c.p.addScaledVector(c.v, dt)
      }
      dummy.position.copy(c.p)
      dummy.rotation.set(c.ax, c.t * c.spin, 0)
      const s = Math.min(1, c.t * 8)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      coins.setMatrixAt(i, dummy.matrix)
    }
    if (changed) coins.instanceMatrix.needsUpdate = true
  }

  // --- Ground rings -------------------------------------------------------------------
  const ringGeo = new RingGeometry(0.85, 1, 48)
  ringGeo.rotateX(-Math.PI / 2)
  const rings = []
  for (let i = 0; i < 10; i++) {
    const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    m.visible = false
    m.renderOrder = 2
    scene.add(m)
    rings.push({ m, t: 1, life: 1, r0: 1, r1: 4 })
  }
  let ringNext = 0
  function ring(x, y, z, { color = '#ffffff', r0 = 0.5, r1 = 4, life = 0.6 } = {}) {
    const r = rings[ringNext]
    ringNext = (ringNext + 1) % rings.length
    r.m.position.set(x, y, z)
    r.m.material.color.set(color).multiplyScalar(2)
    r.t = 0
    r.life = life
    r.r0 = r0
    r.r1 = r1
    r.m.visible = true
  }
  function updateRings(dt) {
    for (const r of rings) {
      if (!r.m.visible) continue
      r.t += dt
      const k = r.t / r.life
      if (k >= 1) {
        r.m.visible = false
        continue
      }
      const e = 1 - (1 - k) ** 3
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e)
      r.m.material.opacity = (1 - k) * 0.9
    }
  }

  // --- Floating text ---------------------------------------------------------------
  const texts = []
  function floatText(text, x, y, z, { color = '#7dff4a', stroke = '#123012', size = 0.9, rise = 2.2, life = 1.3, wobble = 0, icon = null } = {}) {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    ctx.font = '700 96px Fredoka, sans-serif'
    const iconW = icon ? 120 : 0
    c.width = Math.ceil(ctx.measureText(text).width + 60 + iconW)
    c.height = 140
    if (icon === 'jump') paintJumper(ctx, 30 + iconW / 2, 70, 118)
    outlined(ctx, text, (c.width + iconW) / 2, 72, { size: 96, fill: color, stroke, line: 0.18 })
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: NormalBlending, fog: false }))
    sprite.renderOrder = 10
    sprite.position.set(x, y, z)
    sprite.userData = { t: 0, life, rise, y, size, aspect: c.width / c.height, wobble, x }
    scene.add(sprite)
    texts.push(sprite)
  }
  function updateTexts(dt) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const s = texts[i]
      const u = s.userData
      u.t += dt
      const k = u.t / u.life
      if (k >= 1) {
        s.removeFromParent()
        s.material.map.dispose()
        s.material.dispose()
        texts.splice(i, 1)
        continue
      }
      // Pop in with an overshoot, drift up, fade out at the end.
      const pop = k < 0.15 ? 1.35 * Math.sin((k / 0.15) * Math.PI * 0.5) : 1 + 0.35 * Math.max(0, 1 - (k - 0.15) * 6)
      const h = u.size * pop
      s.scale.set(h * u.aspect, h, 1)
      s.position.y = u.y + u.rise * (1 - (1 - k) ** 2)
      if (u.wobble) s.position.x = u.x + Math.sin(u.t * 40) * u.wobble * (1 - k)
      s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
    }
  }

  return {
    burst,
    coinShower,
    ring,
    floatText,
    setDensity(d) {
      density = d
    },
    update(dt, viewportHeight) {
      viewport.value = viewportHeight
      updatePool(pools.dot, dt)
      updatePool(pools.sparkle, dt)
      updateCoins(dt)
      updateRings(dt)
      updateTexts(dt)
    },
  }
}

