// The lane to the sky: a corridor of rising terraces north of the start line,
// one per zone (game/levels.js). Each terrace is a solid stud block in its
// zone's colour; its front wall is exactly as tall as the "Recommended" jump
// power painted on it can clear (the number turns green once you have it).
// Brown checker cliffs with grass caps and trees line both sides and step up
// with the terraces (an invisible wall above them keeps big jumps in the lane).
// Orange "Skip Wall" trampolines in front of each wall launch you over it once
// bought (money only). The top terrace ends at a golden sky gate.
// Per frame: which terrace you are on, Smart Jump and your jump speed, and the
// "new zone" celebration the first time you land on a terrace.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, TorusGeometry } from 'three'
import { HUB, LANE, PHYSICS } from '../config.js'
import { bake } from '../bake.js'
import { mulberry32 } from '../textures.js'
import { launch, player } from '../player.js'
import { LEVELS, LANE_END, TOP_Y, levelAt, smartCap } from '../game/levels.js'
import { bus, game, skipPrice, spend, jumpHeight, wallOpen } from '../game/state.js'
import { lego, solid, wbox } from './kit.js'
import { decalTexture, outlined, paintedTexture, paintJumper, short } from './paint.js'
import { signPanel } from './signs.js'
import { pine, roundTree } from './arena.js'

const LIPS = { lime: 'lipLime', cyan: 'lipCyan', blue: 'lipBlue', purple: 'lipPurple', gold: 'lipGold', pink: 'lipPink', black: 'lipBlack', cloud: 'lipCloud', snow: 'lipSnow' }
const SKY_ZONE = 8 // from here up the cliffs turn to cloud

// "500 / Recommended" with the jumper icon; the number turns green once your jump power reaches it.
function recommendTexture(req) {
  let ok = false
  const tex = paintedTexture(512, 512, (ctx, W) => {
    paintJumper(ctx, W / 2, 112, 150)
    outlined(ctx, short(req), W / 2, 300, { size: 190, fill: ok ? '#5dff4a' : '#3b8dff', stroke: '#0b1a3a', line: 0.16, maxW: W - 30 })
    outlined(ctx, 'Recommended', W / 2, 440, { size: 74, fill: '#ffffff', stroke: '#0b1a3a', line: 0.2, maxW: W - 20 })
  })
  return {
    tex,
    set(next) {
      if (next === ok) return
      ok = next
      tex.userData.repaint()
    },
  }
}

function tuft(parent, mat, x, y, z, rand) {
  for (let i = 0; i < 4; i++) {
    const m = new Mesh(tuftGeo, mat)
    const h = 0.45 + rand() * 0.4
    m.scale.set(0.09, h, 0.09)
    m.position.set(x + (rand() - 0.5) * 0.4, y + h / 2, z + (rand() - 0.5) * 0.4)
    m.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6)
    parent.add(m)
  }
}
const tuftGeo = new ConeGeometry(1, 1, 4)
const puffGeo = new IcosahedronGeometry(1, 2)

export function buildLane(ctx) {
  const L = HUB.laneHalf
  const T = LANE.cliffThickness
  const N = HUB.north
  const root = new Group() // static: baked below
  const decals = new Group()
  decals.userData.dynamic = true
  const rand = mulberry32(7171)
  const wall = lego('wall')
  const trim = lego('trim')
  const cloudCliff = lego('cliffCloud')
  const cloudTrim = lego('lipCloud')
  const grassTuft = new MeshStandardMaterial({ color: '#3fbf2a', roughness: 0.8, flatShading: true })
  const cloudMat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#dcecff', emissiveIntensity: 0.35, roughness: 1 })

  const risers = []
  for (const lv of LEVELS) {
    const { i, zone, y, south, north } = lv
    const depth = south - north
    const floor = lego(zone.floor)
    // --- Terrace block (level 0 is the flat start, flush with the hub floor) ---
    if (i === 0) {
      const s = N - HUB.wallThickness
      wbox(root, 2 * L, 1, s - north, 0, -0.5, (s + north) / 2, floor, { shadow: false, collide: true })
    } else {
      wbox(root, 2 * L, y, depth, 0, y / 2, (south + north) / 2, floor, { collide: true })
      // A lighter lip along the front edge.
      wbox(root, 2 * L, 0.08, 1.1, 0, y + 0.04, south - 0.55, lego(LIPS[zone.floor] ?? 'trim'), { shadow: false })
      // "N Recommended" on the visible part of the wall, low enough to read from below.
      const h = Math.min(14, Math.max(3, lv.rise * 0.55))
      const below = LEVELS[i - 1].y
      const r = recommendTexture(zone.req)
      const panel = new Mesh(new PlaneGeometry(h, h), new MeshBasicMaterial({ map: r.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
      panel.position.set(0, below + Math.min(lv.rise / 2, h / 2 + 2.2), south + 0.06)
      panel.renderOrder = 1
      decals.add(panel)
      risers.push({ req: zone.req, r })
      // Zone name painted on the terrace floor, just past the edge.
      const name = new Mesh(new PlaneGeometry(17, 4.25), new MeshBasicMaterial({ map: decalTexture(zone.name), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
      name.rotation.x = -Math.PI / 2
      name.position.set(0, y + 0.03, south - 6.5)
      name.renderOrder = 1
      decals.add(name)
    }
    // --- Side cliffs, stepping up with the terraces; invisible wall above ---
    const cs = i === 0 ? N - HUB.wallThickness : south
    const cd = cs - north
    const top = Math.max(HUB.wallHeight, y + LANE.cliff)
    const sky = i >= SKY_ZONE
    const side = sky ? cloudCliff : wall
    const cap = sky ? cloudTrim : trim
    for (const s of [-1, 1]) {
      const cx = s * (L + T / 2)
      wbox(root, T, top, cd, cx, top / 2, (cs + north) / 2, [side, side, cap, side, side, side], { collide: true, tile: 14 })
      wbox(root, T + 0.8, 1.4, cd + 0.4, cx, top + 0.3, (cs + north) / 2, cap)
      solid(0.5, LANE.airWall / 2, cd / 2, s * (L + 0.5), top + LANE.airWall / 2, (cs + north) / 2)
      // Trees and flowers on the cliff tops (clouds high up).
      const n = Math.max(1, Math.floor(cd / 14))
      for (let k = 0; k < n; k++) {
        const tz = north + 4 + rand() * (cd - 8)
        const tx = cx + (rand() - 0.5) * (T - 3)
        if (sky) {
          for (let p = 0; p < 4; p++) {
            const puff = new Mesh(puffGeo, cloudMat)
            const pr = 1.2 + rand() * 1.4
            puff.scale.set(pr, pr * 0.7, pr)
            puff.position.set(tx + (rand() - 0.5) * 3, top + 1 + rand() * 0.8, tz + (rand() - 0.5) * 4)
            root.add(puff)
          }
        } else if (rand() < 0.55) pine(root, tx, top + 0.9, tz, 0.9 + rand() * 0.5, rand)
        else roundTree(root, tx, top + 0.9, tz, 0.8 + rand() * 0.4, rand)
      }
    }
    // Grass tufts on the lower terraces.
    if (i < 7) {
      for (let k = 0; k < 10; k++) tuft(root, grassTuft, (rand() - 0.5) * (2 * L - 4), y, north + 2 + rand() * (depth - 4), rand)
    }
  }

  // --- The top: a back wall, a golden sky gate and clouds ---------------------------------
  const top = LEVELS[LEVELS.length - 1]
  const endH = TOP_Y + 40
  wbox(root, 2 * (L + T), endH, 6, 0, endH / 2, LANE_END - 3, [cloudCliff, cloudCliff, cloudTrim, cloudCliff, cloudCliff, cloudCliff], { collide: true, tile: 14 })
  const gold = new MeshStandardMaterial({ color: '#ffcf3a', metalness: 0.85, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.4 })
  const gateZ = top.mid - 8
  for (const s of [-1, 1]) {
    const pillar = new Mesh(new CylinderGeometry(1.1, 1.3, 16, 20), gold)
    pillar.position.set(s * 8, TOP_Y + 8, gateZ)
    pillar.castShadow = true
    root.add(pillar)
    solid(1.2, 8, 1.2, s * 8, TOP_Y + 8, gateZ)
    for (let p = 0; p < 6; p++) {
      const puff = new Mesh(puffGeo, cloudMat)
      const pr = 1.4 + rand() * 1.4
      puff.scale.set(pr, pr * 0.6, pr)
      puff.position.set(s * (8 + rand() * 4), TOP_Y + 0.6, gateZ + (rand() - 0.5) * 6)
      root.add(puff)
    }
  }
  const arch = new Mesh(new TorusGeometry(8, 0.9, 12, 40, Math.PI), gold)
  arch.position.set(0, TOP_Y + 16, gateZ)
  arch.castShadow = true
  root.add(arch)
  const skySign = paintedTexture(1024, 384, (c, W, H) => {
    outlined(c, 'YOU REACHED', W / 2, H * 0.3, { size: 120, fill: '#ffffff', stroke: '#7a4a00', line: 0.16, maxW: W - 40 })
    outlined(c, 'THE SKY!', W / 2, H * 0.72, { size: 170, fill: '#ffd84a', stroke: '#7a4a00', line: 0.16, maxW: W - 40 })
  })
  const sign = signPanel(skySign, 22, 8.25, { back: '#fff2c4', glow: 0.5 })
  sign.position.set(0, TOP_Y + 14, LANE_END + 0.2)
  root.add(sign)

  // --- Skip Wall trampolines (one each side of every wall) ------------------------------------
  const pads = buildSkipPads(ctx, root)
  // --- Base Level gates: a force field over every wall your base has not opened yet ------------
  const gates = buildGates(ctx)

  // Bake the static terrain to a few draw calls; decals and pads stay live.
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  baked.userData.dynamic = true
  ctx.scene.add(baked, decals)

  // Sky sparkle around the gate.
  ctx.emitter({ boxes: [{ x: 0, y: TOP_Y + 10, z: gateZ, sx: 9, sy: 7, sz: 1 }], count: 40, life: 2.6, velocity: [0, 0.6, 0], spread: [0.3, 0.3, 0.3], size: 0.45, grow: 0.3, color: '#fff2a0', intensity: 3, twinkle: 6, sprite: 'sparkle', seed: 909 })
  ctx.addEmitter('chimes', 0, TOP_Y + 4, gateZ, 0.6)

  // --- Per frame ---------------------------------------------------------------------------------
  let checkIn = 0
  ctx.onUpdate((t, dt) => {
    const p = player.position
    const li = levelAt(p.x, p.z)
    game.level = li
    game.zone = Math.max(0, li)
    // Jump height from jump power; Smart Jump caps it at what the next wall needs.
    let h = jumpHeight(game.jumpPower)
    if (game.smartJump) h = Math.min(h, smartCap(li))
    player.jumpSpeed = Math.sqrt(2 * -PHYSICS.gravity * h)
    // First landing on a new terrace: banner, fanfare, confetti.
    if (li > game.bestZone && player.grounded && Math.abs(p.y - LEVELS[li].y) < 1.2) {
      game.bestZone = li
      const z = LEVELS[li].zone
      bus.emit('banner', { title: z.name, sub: 'New zone reached!', color: z.color })
      ctx.sfx.zoneUp()
      ctx.fx.burst(p.x, p.y + 1.5, p.z, { count: 70, colors: ['#ff4f6a', '#ffe14a', '#4fb4ff', '#7dff6a', '#b05aff', '#ffffff'], speed: [5, 11], up: 5, gravity: 12, life: [1, 1.8], size: [0.25, 0.45], drag: 1 })
      ctx.fx.burst(p.x, p.y + 1, p.z, { sprite: 'sparkle', count: 30, colors: [z.color, '#ffffff'], speed: [2, 6], life: [0.6, 1.1], size: [0.4, 0.7] })
      ctx.fx.ring(p.x, p.y + 0.08, p.z, { color: z.color, r0: 0.5, r1: 7, life: 0.8 })
    }
    checkIn -= dt
    if (checkIn <= 0) {
      checkIn = 0.25
      for (const r of risers) r.r.set(game.jumpPower >= r.req)
    }
    pads.update(t, dt)
    gates.update(t, dt)
  })
}

// A shimmering purple force field over the top of wall i (from its edge up into the sky) with a
// collider, until Base Level i is built (state.js wallOpen). Bumping into it buzzes and says what to
// do; when the level is built the field shatters in a burst of sparks (quietly if it was already
// open at load).
function buildGates(ctx) {
  const L = HUB.laneHalf
  const H = 46
  const gates = []
  for (const lv of LEVELS) {
    if (lv.i === 0) continue
    // The field's face sits just in front of the wall's top edge; its collider runs 1.2 m deep over
    // the edge, so you cannot perch on the edge in front of it either.
    const z = lv.south + 0.2
    const mat = new MeshBasicMaterial({ color: new Color('#c47aff').multiplyScalar(1.6), map: fieldTex(), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    const field = new Mesh(new PlaneGeometry(2 * L, H), mat)
    field.position.set(0, lv.y - 0.5 + H / 2, z)
    field.userData.dynamic = true
    const edge = new Mesh(new BoxGeometry(2 * L, 0.18, 0.18), new MeshBasicMaterial({ color: new Color('#e2b8ff').multiplyScalar(2.4) }))
    edge.position.set(0, lv.y + 0.05, z)
    const tag = ctx.label(`Base Lv ${lv.i} needed`, 2.2, { colors: ['#e2b8ff', '#ffffff'], outline: '#2a0a4a', outlineWidth: 16 }, { near: 40, far: 110 })
    tag.position.set(0, lv.y + 3.2, z + 0.6)
    const collider = solid(L, H / 2, 0.6, 0, lv.y - 0.5 + H / 2, z - 0.6)
    const g = { i: lv.i, lv, z, field, edge, tag, collider, open: false, bumpIn: 0 }
    ctx.scene.add(field, edge, tag)
    gates.push(g)
  }
  let first = true
  const open = (g, quiet) => {
    g.open = true
    g.collider.setEnabled(false)
    g.field.removeFromParent()
    g.edge.removeFromParent()
    g.tag.removeFromParent()
    if (quiet) return
    const { lv, z } = g
    for (let k = 0; k < 7; k++) ctx.fx.burst((k / 6 - 0.5) * 2 * L, lv.y + 1 + Math.random() * 6, z, { sprite: 'sparkle', count: 18, colors: ['#e2b8ff', '#c47aff', '#ffffff'], speed: [3, 8], gravity: 6, life: [0.6, 1.2], size: [0.35, 0.6], drag: 1 })
    ctx.fx.ring(0, lv.y + 0.1, z - 2, { color: '#c47aff', r0: 1, r1: 14, life: 0.9 })
    ctx.sfx.unlock({ x: 0, y: lv.y, z })
  }
  return {
    update(t, dt) {
      const p = player.position
      for (const g of gates) {
        if (g.open) continue
        if (wallOpen(g.i)) {
          open(g, first)
          continue
        }
        g.field.material.map.offset.x = (t * 0.25) % 1
        g.field.material.opacity = 0.45 + Math.sin(t * 3 + g.i) * 0.12
        g.tag.position.y = g.lv.y + 3.2 + Math.sin(t * 1.6 + g.i) * 0.15
        // Bumping into it: a buzz, sparks where you hit and what to do (at most every 3 s).
        g.bumpIn -= dt
        if (g.bumpIn <= 0 && Math.abs(p.z - g.z) < 1.3 && p.y > g.lv.y - g.lv.rise + 1 && p.y < g.lv.y + 30) {
          g.bumpIn = 3
          ctx.sfx.locked({ x: p.x, y: p.y, z: p.z })
          ctx.fx.burst(p.x, p.y + 1, g.z, { sprite: 'sparkle', count: 20, colors: ['#e2b8ff', '#c47aff', '#ffffff'], speed: [2, 5], life: [0.3, 0.6], size: [0.3, 0.5], drag: 2 })
          ctx.fx.floatText(`Base Lv ${g.i} needed!`, p.x, p.y + 3, p.z, { color: '#e2b8ff', stroke: '#2a0a4a', size: 0.9, wobble: 0.12 })
          bus.emit('toast', { text: `Upgrade your base to Level ${g.i} to open the ${g.lv.zone.name} zone (the core in front of your base).`, kind: 'info' })
        }
      }
      first = false
    },
  }
}
// Diagonal energy stripes for the force field (repeating, scrolled each frame).
let fieldTexture = null
function fieldTex() {
  if (fieldTexture) return fieldTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, 'rgba(255,255,255,0.05)')
  grad.addColorStop(1, 'rgba(255,255,255,0.35)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(255,255,255,0.75)'
  for (let k = -128; k < 256; k += 32) {
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + 10, 0)
    g.lineTo(k + 10 + 128, 128)
    g.lineTo(k + 128, 128)
    g.fill()
  }
  fieldTexture = new CanvasTexture(c)
  fieldTexture.wrapS = fieldTexture.wrapT = RepeatWrapping
  fieldTexture.repeat.set(6, 8)
  return fieldTexture
}

// Orange trampolines in front of each wall: a bought skip launches you onto the
// next terrace in a high arc; otherwise stepping on asks to buy it.
function buildSkipPads(ctx, root) {
  const L = HUB.laneHalf
  const S = LANE.skipPad
  const legMat = new MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.6 })
  const frameMat = new MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.45 })
  const bounceMat = new MeshStandardMaterial({ color: '#ffd23a', emissive: '#7a4a00', emissiveIntensity: 0.35, roughness: 0.5 })
  const box = new BoxGeometry(1, 1, 1)
  const pads = []
  for (let i = 1; i < LEVELS.length; i++) {
    const lv = LEVELS[i]
    const y = LEVELS[i - 1].y
    const z = lv.south + S.back
    for (const s of [-1, 1]) {
      const x = s * (L - S.inset)
      // Frame on short legs (static, baked).
      for (const [lx, lz] of [[-1.4, -0.95], [1.4, -0.95], [-1.4, 0.95], [1.4, 0.95]]) {
        const leg = new Mesh(box, legMat)
        leg.scale.set(0.22, 0.32, 0.22)
        leg.position.set(x + lx, y + 0.16, z + lz)
        root.add(leg)
      }
      const frame = new Mesh(box, frameMat)
      frame.scale.set(3.4, 0.16, 2.5)
      frame.position.set(x, y + 0.38, z)
      frame.castShadow = true
      root.add(frame)
      solid(1.7, 0.23, 1.25, x, y + 0.23, z)
      // The springy yellow bed squashes when it fires.
      const bed = new Mesh(box, bounceMat)
      bed.scale.set(2.9, 0.08, 2.0)
      bed.position.set(x, y + 0.5, z)
      bed.userData.dynamic = true
      ctx.scene.add(bed)
      const pad = { i, x, y, z, s, bed, squash: 0, tag: null }
      pad.tag = skipTag(ctx, pad)
      pads.push(pad)
      ctx.zone({
        x0: x - 1.8,
        x1: x + 1.8,
        z0: z - 1.35,
        z1: z + 1.35,
        y0: y - 0.5,
        y1: y + 2.5,
        onEnter() {
          if (!wallOpen(i)) {
            ctx.sfx.locked({ x, y, z })
            bus.emit('toast', { text: `Base Lv ${i} needed before this wall can be skipped. Upgrade the core in front of your base.`, kind: 'info' })
            return
          }
          if (game.skips[i]) fire(ctx, pad)
          else {
            const price = skipPrice(i)
            bus.emit('confirm', {
              title: 'Skip Wall',
              text: `Launch over this wall to the ${lv.zone.name} zone, now and every time after.`,
              price,
              onBuy() {
                if (!spend(price)) return false
                game.skips[i] = true
                ctx.sfx.buy()
                for (const q of pads) if (q.i === i) refreshTag(ctx, q)
                fire(ctx, pad)
                return true
              },
            })
          }
        },
      })
    }
  }
  return {
    update(t, dt) {
      for (const p of pads) {
        p.squash = Math.max(0, p.squash - dt * 3)
        p.bed.scale.y = 0.08 * (1 - p.squash * 0.7)
        p.bed.position.y = p.y + 0.5 - p.squash * 0.12
        p.tag.position.y = p.y + 2.6 + Math.sin(t * 2 + p.i) * 0.1
      }
    },
  }
}

function skipTag(ctx, pad) {
  const owned = game.skips[pad.i]
  const text = owned ? 'Skip Wall\nOwned' : `Skip Wall\n$${short(skipPrice(pad.i))}`
  const tag = ctx.label(text, 1.3, { colors: ['#ffe14a', owned ? '#7dff4a' : '#7dff4a'], outline: '#3a1a00', outlineWidth: 16 }, { near: 22, far: 40 })
  tag.position.set(pad.x, pad.y + 2.6, pad.z)
  ctx.scene.add(tag)
  return tag
}
function refreshTag(ctx, pad) {
  pad.tag.removeFromParent()
  pad.tag = skipTag(ctx, pad)
}

// Launch: a ballistic arc that peaks above the wall and lands a few metres onto the next terrace.
function fire(ctx, pad) {
  const lv = LEVELS[pad.i]
  const g = -PHYSICS.gravity
  const apex = lv.rise + LANE.skipPad.extraApex
  const vy = Math.sqrt(2 * g * apex)
  const t = vy / g + Math.sqrt((2 * LANE.skipPad.extraApex) / g)
  const dz = lv.south - LANE.skipPad.land - player.position.z
  const dx = pad.x * 0.4 - player.position.x
  launch(dx / t, vy, dz / t)
  pad.squash = 1
  ctx.sfx.boing({ x: pad.x, y: pad.y, z: pad.z })
  ctx.fx.burst(pad.x, pad.y + 0.6, pad.z, { spread: 'ring', count: 24, colors: ['#ffe14a', '#ffffff', '#ff8a1f'], speed: [4, 8], life: [0.3, 0.6], size: [0.3, 0.5], drag: 4 })
  ctx.fx.ring(pad.x, pad.y + 0.55, pad.z, { color: '#ffd23a', r0: 0.5, r1: 4, life: 0.5 })
}
