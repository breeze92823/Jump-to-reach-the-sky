// The Base Upgrade core, in front of your base (config BASE_LEVELS, rules in state.js): a stone
// pedestal with a floating gem that grows and changes colour with your Base Level, studs orbiting it
// (one per level), a glowing ring and a live sign. Walking up opens the Base Level window. While a
// level builds: scaffolding rises around it, a gear spins, hammers clink and sparks fly, and the sign
// counts down. When it is done: fireworks, a fanfare, a banner naming the wall it opened, and the gem
// pops bigger in its new colour. A level you can afford calls you with sparkles and a bouncing "!".
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PointLight, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry } from 'three'
import { BASE_LEVELS, ZONES } from '../config.js'
import { baseBuildState, BASE_MAX, bus, canAfford, finishBaseBuild, game, nextBaseLevel } from '../game/state.js'
import { fontReady } from '../propkit.js'
import { solidCylinder } from './kit.js'
import { outlined } from './paint.js'

const clock = (s) => {
  s = Math.max(0, Math.ceil(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function buildBaseCore(ctx, x, z) {
  const g = new Group()
  g.position.set(x, 0, z)
  ctx.scene.add(g)
  const stone = new MeshStandardMaterial({ color: '#8a90a0', roughness: 0.8 })
  const goldM = new MeshStandardMaterial({ color: '#ffc21f', metalness: 0.8, roughness: 0.25, emissive: '#7a4a00', emissiveIntensity: 0.3 })
  const base = new Mesh(new CylinderGeometry(1.4, 1.6, 0.7, 8), stone)
  base.position.y = 0.35
  base.castShadow = base.receiveShadow = true
  const trim = new Mesh(new CylinderGeometry(1.45, 1.45, 0.12, 8), goldM)
  trim.position.y = 0.72
  const top = new Mesh(new CylinderGeometry(0.7, 0.9, 0.5, 8), stone)
  top.position.y = 0.95
  top.castShadow = true
  g.add(base, trim, top)
  solidCylinder(1.5, 1.2, x, 0.6, z)

  // Everything that moves or changes (kept out of the hub's static bake).
  const live = new Group()
  live.userData.dynamic = true
  g.add(live)
  const gemMat = new MeshStandardMaterial({ color: '#9aa0b0', metalness: 0.3, roughness: 0.15, emissive: '#9aa0b0', emissiveIntensity: 0.55, flatShading: true })
  const gem = new Mesh(new OctahedronGeometry(0.6, 0), gemMat)
  gem.castShadow = true
  gem.position.y = 2.6
  live.add(gem)
  const ringMat = new MeshBasicMaterial({ color: new Color('#9aa0b0').multiplyScalar(2), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false })
  const ring = new Mesh(new TorusGeometry(1.6, 0.05, 6, 48), ringMat)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.78
  live.add(ring)
  const studGeo = new BoxGeometry(0.22, 0.22, 0.22)
  const studs = []
  for (let k = 0; k < BASE_MAX; k++) {
    const s = new Mesh(studGeo, new MeshStandardMaterial({ color: BASE_LEVELS.colors[k + 1], emissive: BASE_LEVELS.colors[k + 1], emissiveIntensity: 0.5 }))
    s.visible = false
    live.add(s)
    studs.push(s)
  }
  // Scaffolding + a gear, shown while a level builds.
  const scaffold = new Group()
  live.add(scaffold)
  const wood = new MeshStandardMaterial({ color: '#c08a52', roughness: 0.8 })
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const pole = new Mesh(new BoxGeometry(0.14, 4, 0.14), wood)
    pole.position.set(Math.cos(a) * 1.5, 2, Math.sin(a) * 1.5)
    scaffold.add(pole)
  }
  for (const y of [1.6, 3.2]) {
    const band = new Mesh(new TorusGeometry(1.5, 0.06, 4, 4), wood)
    band.rotation.set(Math.PI / 2, 0, Math.PI / 4)
    band.position.y = y
    scaffold.add(band)
  }
  const gear = new Group()
  gear.position.y = 4.4
  scaffold.add(gear)
  const gearMat = new MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.8, roughness: 0.3 })
  gear.add(new Mesh(new TorusGeometry(0.45, 0.12, 6, 18), gearMat))
  for (let k = 0; k < 8; k++) {
    const tooth = new Mesh(new BoxGeometry(0.16, 0.22, 0.16), gearMat)
    const a = (k / 8) * Math.PI * 2
    tooth.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0)
    tooth.rotation.z = a
    gear.add(tooth)
  }
  scaffold.visible = false
  const light = new PointLight('#9aa0b0', 8, 9, 2)
  light.position.y = 2.8
  live.add(light)
  const sign = statusSign()
  sign.sprite.position.y = 4.9
  live.add(sign.sprite)
  const bang = makeBang()
  bang.position.set(0, 6.1, 0)
  live.add(bang)

  // The gem's look for a level (size, colour, studs).
  const show = (lv) => {
    const c = BASE_LEVELS.colors[Math.min(lv, BASE_LEVELS.colors.length - 1)]
    gemMat.color.set(c)
    gemMat.emissive.set(c)
    ringMat.color.set(c).multiplyScalar(2)
    light.color.set(c)
    studs.forEach((s, k) => (s.visible = k < lv))
  }
  let shownLevel = game.baseLevel
  show(shownLevel)
  let pop = 1
  let hype = 0
  let sparkIn = 0
  let hammerIn = 0
  let signIn = 0

  ctx.zone({
    x0: x - 2.4,
    x1: x + 2.4,
    z0: z - 2.4,
    z1: z + 2.4,
    onEnter() {
      hype = Math.max(hype, 0.6)
      ctx.sfx.magic({ x, z })
      ctx.fx.burst(x, 2.6, z, { sprite: 'sparkle', count: 24, colors: [BASE_LEVELS.colors[game.baseLevel], '#ffffff', '#ffe14a'], speed: [3, 6], up: 2, gravity: 5, life: [0.5, 0.9], size: [0.3, 0.5] })
      bus.emit('window', 'base')
    },
  })

  // A build was started (the window): dust and hammering begin.
  bus.on('baseBuild', () => {
    hype = 1.2
    ctx.fx.burst(x, 0.5, z, { count: 30, colors: ['#ffffff', '#e8d8b8'], speed: [2, 5], life: [0.5, 0.9], size: [0.6, 1], drag: 3, grow: 1.8, spread: 'ring' })
    ctx.fx.ring(x, 0.1, z, { color: '#ffd23a', r0: 0.5, r1: 6, life: 0.7 })
    ctx.sfx.hammer({ x, y: 2, z })
  })

  ctx.onUpdate((t, dt) => {
    const b = baseBuildState()
    // Finished (also right after loading, if it finished while you were away).
    if (b && b.done) {
      const lv = finishBaseBuild()
      if (lv) {
        shownLevel = lv
        show(lv)
        pop = 0
        hype = 2.5
        ctx.sfx.baseUp(lv)
        const zone = ZONES[lv]
        bus.emit('banner', { title: `BASE LEVEL ${lv}!`, sub: zone ? `The ${zone.name} wall is open!` : '+10% money', color: BASE_LEVELS.colors[lv] })
        ctx.fx.burst(x, 2.6, z, { sprite: 'sparkle', count: 80, colors: [BASE_LEVELS.colors[lv], '#ffffff', '#ffe14a'], speed: [5, 12], up: 4, gravity: 7, life: [0.8, 1.5], size: [0.4, 0.75], drag: 0.8 })
        ctx.fx.ring(x, 0.1, z, { color: BASE_LEVELS.colors[lv], r0: 0.5, r1: 12, life: 1 })
        for (let k = 0; k < 4; k++) {
          setTimeout(() => ctx.fx.burst(x + (Math.random() - 0.5) * 8, 8 + Math.random() * 4, z + (Math.random() - 0.5) * 6, { sprite: 'sparkle', count: 40, colors: [BASE_LEVELS.colors[lv], '#ffffff', '#ffd23a'], speed: [4, 8], gravity: 5, life: [0.8, 1.3], size: [0.35, 0.6], drag: 1.3 }), 200 + k * 240)
        }
      }
    }
    const building = b && !b.done
    scaffold.visible = !!building
    hype = Math.max(0, hype - dt * 0.6)
    pop = Math.min(1, pop + dt * 1.5)
    const size = 0.8 + shownLevel * 0.08
    const e = 1 - (1 - pop) ** 3
    gem.scale.setScalar(size * (e + Math.sin(pop * Math.PI) * 0.45))
    gem.rotation.y += dt * (0.8 + hype * 4 + (building ? 2 : 0))
    gem.position.y = 2.6 + Math.sin(t * 1.6) * 0.15 + hype * 0.3
    ring.scale.setScalar(1 + Math.sin(t * 2) * 0.04 + hype * 0.15)
    studs.forEach((s, k) => {
      if (!s.visible) return
      const a = t * 0.9 + (k / Math.max(1, shownLevel)) * Math.PI * 2
      s.position.set(Math.cos(a) * 1.15, 2.6 + Math.sin(t * 2 + k) * 0.25, Math.sin(a) * 1.15)
      s.rotation.set(t * 2 + k, t * 1.5, 0)
    })
    light.intensity = 8 + Math.sin(t * 3) * 2 + hype * 18 + (building ? 4 : 0)
    if (building) {
      gear.rotation.z += dt * 3
      gear.rotation.y = Math.sin(t * 0.7) * 0.4
      hammerIn -= dt
      if (hammerIn <= 0) {
        hammerIn = 0.55 + Math.random() * 0.4
        const a = Math.random() * Math.PI * 2
        const hx = x + Math.cos(a) * 1.5
        const hz = z + Math.sin(a) * 1.5
        const hy = 0.8 + Math.random() * 3
        ctx.fx.burst(hx, hy, hz, { sprite: 'sparkle', count: 10, colors: ['#ffd23a', '#ffffff', '#ff9a3a'], speed: [2, 5], gravity: 9, life: [0.25, 0.5], size: [0.2, 0.35] })
        ctx.sfx.hammer({ x: hx, y: hy, z: hz })
      }
    }
    // An affordable next level calls you over.
    const n = nextBaseLevel()
    const callMe = !b && n && canAfford(n.cost)
    bang.visible = !!callMe
    if (callMe) {
      bang.position.y = 6.1 + Math.abs(Math.sin(t * 4)) * 0.4
      sparkIn -= dt
      if (sparkIn <= 0) {
        sparkIn = 1
        ctx.fx.burst(x, 2.6, z, { sprite: 'sparkle', count: 8, colors: ['#ffe14a', '#ffffff'], speed: [1.5, 3], up: 1.5, gravity: 2, life: [0.6, 1], size: [0.3, 0.45] })
      }
    }
    signIn -= dt
    if (signIn <= 0) {
      signIn = 0.25
      const lv = game.baseLevel
      sign.set([
        [`Base Lv ${lv}`, BASE_LEVELS.colors[lv] === '#34344a' ? '#c8c8ff' : BASE_LEVELS.colors[lv]],
        building ? [`Building ${clock(b.left)}`, '#ffe14a'] : !n ? ['MAX', '#ffd23a'] : callMe ? ['Upgrade!', '#7dff4a'] : [`Next: ${ZONES[n.level]?.name ?? ''}`, '#ffffff'],
      ])
    }
    sign.sprite.position.y = 4.9 + Math.sin(t * 1.4) * 0.1 + (building ? 0.6 : 0)
  })
}

// A two-line outlined sign that repaints only when its text changes.
function statusSign() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 200
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  sprite.scale.set(3.9, 1.5, 1)
  sprite.renderOrder = 5
  let key = ''
  let lines = []
  const paint = () => {
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    lines.forEach(([text, fill], i) => outlined(g, text, c.width / 2, 52 + i * 92, { size: i ? 68 : 78, fill, stroke: '#13213f', line: 0.2, maxW: c.width - 24 }))
    tex.needsUpdate = true
  }
  fontReady.then(() => paint())
  return {
    sprite,
    set(next) {
      const k = next.map((l) => l.join()).join('|')
      if (k === key) return
      key = k
      lines = next
      paint()
    },
  }
}

// A bouncing red "!" sprite.
function makeBang() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const paint = () => {
    const g = c.getContext('2d')
    g.clearRect(0, 0, 128, 128)
    outlined(g, '!', 64, 70, { size: 120, fill: '#ff2a2a', stroke: '#ffffff', line: 0.16 })
    tex.needsUpdate = true
  }
  paint()
  fontReady.then(paint)
  const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  s.scale.set(1.1, 1.1, 1)
  s.renderOrder = 6
  s.visible = false
  return s
}
