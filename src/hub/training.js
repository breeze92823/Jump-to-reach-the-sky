// AUTO TRAINING (north wall, west of the lane): glowing pads inside a neon
// outline, best multiplier on the west. Standing on an unlocked pad hops you
// on a steady beat; every hop trains Jump Power (a pluck that climbs the scale,
// a "+N" with the jumper icon, a sparkle puff, the pad pulsing). A locked pad
// buzzes and offers to unlock it for money (no premium currency anywhere).
// On the floor in front: a "Next zone progress" bar toward the next wall's
// recommended jump power.
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PointLight } from 'three'
import { HUB, TRAINING, ZONES } from '../config.js'
import { neon } from '../propkit.js'
import { hop } from '../player.js'
import { addJump, bus, game, spend } from '../game/state.js'
import { solid } from './kit.js'
import { lego } from './kit.js'
import { outlined, paintedTexture, paintJumper, roundRect, short, signTexture } from './paint.js'
import { signPanel, wallSign } from './signs.js'

const SIZE = 5.4
const PITCH = 6.1

function codesBoard() {
  return paintedTexture(512, 320, (ctx, W) => {
    ctx.fillStyle = '#ffe680'
    ctx.fillRect(0, 0, W, 320)
    ctx.fillStyle = '#ffd84a'
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 40, W, 20)
    outlined(ctx, 'How to play', W / 2, 44, { size: 40, fill: '#ffffff', stroke: '#3a2a12', line: 0.2, maxW: W - 30 })
    const tips = ['1. Train here: Jump Power', '2. Jump up the lane', '3. Grab brainrots, bring home', '4. Collect money, upgrade!']
    tips.forEach((t, i) => outlined(ctx, t, W / 2, 112 + i * 54, { size: 30, fill: i % 2 ? '#7dff4a' : '#ffffff', stroke: '#3a2a12', line: 0.2, maxW: W - 30 }))
  })
}

// The floor bar: "Next zone progress  461 / 500".
function progressBar() {
  let shown = ''
  const state = { cur: 0, goal: 1, name: '' }
  const tex = paintedTexture(1024, 256, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H)
    paintJumper(ctx, 110, 128, 170)
    outlined(ctx, state.goal ? 'Next zone progress' : 'All zones reached!', 600, 52, { size: 64, fill: '#ffffff', stroke: '#0b1a3a', line: 0.18, maxW: 760 })
    const x = 220
    const w = W - x - 30
    ctx.fillStyle = '#0b1a3a'
    roundRect(ctx, x, 104, w, 110, 55)
    ctx.fill()
    const k = state.goal ? Math.min(1, state.cur / state.goal) : 1
    const g = ctx.createLinearGradient(0, 110, 0, 208)
    g.addColorStop(0, '#7df0ff')
    g.addColorStop(1, '#1e9be6')
    ctx.fillStyle = g
    if (k > 0.02) {
      roundRect(ctx, x + 8, 112, Math.max(90, (w - 16) * k), 94, 47)
      ctx.fill()
    }
    outlined(ctx, state.goal ? `${short(state.cur)} / ${short(state.goal)}` : short(state.cur), x + w / 2, 160, { size: 70, fill: '#ffffff', stroke: '#0b1a3a', line: 0.18 })
  })
  return {
    tex,
    set(cur, goal) {
      const key = `${short(cur)}|${goal}`
      if (key === shown) return
      shown = key
      state.cur = cur
      state.goal = goal
      tex.userData.repaint()
    },
  }
}

export function buildTraining(ctx) {
  const N = HUB.north
  const cz = N + 10
  const x0 = -50
  const root = new Group()
  ctx.scene.add(root)
  const PADS = TRAINING.pads

  const sign = signTexture({
    w: 1024,
    h: 560,
    colors: ['#2f86ee', '#2575dc'],
    lines: [
      { text: 'AUTO', size: 190 },
      { text: 'TRAINING', size: 190 },
    ],
    stroke: '#0f2350',
    rotate: -4,
  })
  wallSign(root, sign, 13, 7.1, x0 + 2 * PITCH, 16.5, N + 0.2, 0, 0.07)
  const board = signPanel(codesBoard(), 6.4, 4, { back: '#6b3b1d', glow: 0.25 })
  board.position.set(x0 + 4 * PITCH - 0.5, 5.2, N + 0.25)
  board.rotation.x = -0.06
  root.add(board)

  // Neon outline around the row of pads, and a soft light to wash the floor in colour.
  const outline = neon('#ffffff', 3)
  const span = PITCH * (PADS.length - 1) + SIZE + 1.4
  const depth = SIZE + 1.4
  const cx = x0 + ((PADS.length - 1) / 2) * PITCH
  for (const [w, d, x, z] of [[span, 0.28, cx, cz - depth / 2], [span, 0.28, cx, cz + depth / 2], [0.28, depth, cx - span / 2, cz], [0.28, depth, cx + span / 2, cz]]) {
    const m = new Mesh(new BoxGeometry(w, 0.12, d), outline)
    m.position.set(x, 0.06, z)
    root.add(m)
  }
  const light = new PointLight('#bfe6ff', 6, 22, 2)
  light.position.set(cx, 3, cz)
  root.add(light)
  ctx.addEmitter('hum', cx, 1, cz, 0.8)

  // Next-zone progress, lying tilted on the floor in front of the pads.
  const bar = progressBar()
  const barMesh = new Mesh(new PlaneGeometry(12, 3), new MeshBasicMaterial({ map: bar.tex, transparent: true, depthWrite: false }))
  barMesh.rotation.x = -Math.PI / 2 + 0.5
  barMesh.position.set(cx, 1.1, cz + depth / 2 + 3.2)
  barMesh.renderOrder = 2
  barMesh.userData.dynamic = true
  root.add(barMesh)

  const studs = lego('stone').normalMap
  let streak = 0
  PADS.forEach((p, i) => {
    const x = x0 + i * PITCH
    const color = new Color(p.color)
    const m = new MeshStandardMaterial({ color: color.clone().multiplyScalar(0.7), emissive: color, emissiveIntensity: 0.3, roughness: 0.75, normalMap: studs })
    const pad = new Mesh(new BoxGeometry(SIZE, 0.22, SIZE), m)
    pad.position.set(x, 0.11, cz)
    pad.receiveShadow = true
    pad.userData.dynamic = true
    root.add(pad)
    // Raised glowing trim on the pad's edge.
    const trim = neon(p.color, 2.6)
    for (const [w, d, ox, oz] of [[SIZE, 0.18, 0, -SIZE / 2 + 0.09], [SIZE, 0.18, 0, SIZE / 2 - 0.09], [0.18, SIZE, -SIZE / 2 + 0.09, 0], [0.18, SIZE, SIZE / 2 - 0.09, 0]]) {
      const t = new Mesh(new BoxGeometry(w, 0.1, d), trim)
      t.position.set(x + ox, 0.27, cz + oz)
      root.add(t)
    }
    solid(SIZE / 2, 0.11, SIZE / 2, x, 0.11, cz)
    ctx.emitter({
      boxes: [{ x, y: 0.3, z: cz, sx: SIZE / 2 - 0.3, sy: 0, sz: SIZE / 2 - 0.3 }],
      count: 26,
      life: 2.4,
      velocity: [0, 1.4, 0],
      spread: [0.15, 0.4, 0.15],
      size: 0.28,
      grow: 0.3,
      color: p.color,
      intensity: 2.2,
      twinkle: 7,
      sprite: 'sparkle',
      seed: 30 + i,
    })

    const locked = () => !game.pads[i]
    let tag = null
    let tagY = 0
    const makeTag = () => {
      tag?.removeFromParent()
      const lines = [`x${p.mult}`]
      const colors = ['#59b8ff']
      if (locked()) {
        lines.push('Locked', `$${short(p.price)}`)
        colors.push('#ff3b3b', '#7dff4a')
      }
      tag = ctx.label(lines.join('\n'), 1.35 * lines.length, { colors, outline: '#0b1a3a', outlineWidth: 16 }, { near: 30, far: 70 })
      tagY = 4.6 + lines.length * 0.6
      tag.position.set(x, tagY, cz - 0.5)
      root.add(tag)
    }
    makeTag()

    let flash = 0
    let shake = 0
    let tickIn = 0
    let pulse = 0
    const unlock = () => {
      bus.emit('confirm', {
        title: `x${p.mult} Training Pad`,
        text: `Every hop on this pad trains ${p.mult}x more Jump Power. Yours to keep, even after a rebirth.`,
        price: p.price,
        onBuy() {
          if (!spend(p.price)) return false
          game.pads[i] = true
          makeTag()
          ctx.sfx.unlock({ x, z: cz })
          ctx.fx.burst(x, 0.5, cz, { sprite: 'sparkle', spread: 'up', cone: 0.9, count: 40, colors: [p.color, '#ffffff'], speed: [4, 9], life: [0.6, 1.2], size: [0.4, 0.7], gravity: 6 })
          ctx.fx.ring(x, 0.25, cz, { color: p.color, r0: 0.5, r1: 5, life: 0.6 })
          pulse = 1
          tickIn = 0.3
          return true
        },
      })
    }
    ctx.zone({
      x0: x - SIZE / 2,
      x1: x + SIZE / 2,
      z0: cz - SIZE / 2,
      z1: cz + SIZE / 2,
      onEnter() {
        ctx.fx.ring(x, 0.25, cz, { color: locked() ? '#ff4040' : p.color, r0: 0.5, r1: 3.6, life: 0.5 })
        if (locked()) {
          ctx.sfx.locked({ x, z: cz })
          ctx.fx.floatText('Locked!', ctx.player.position.x, ctx.player.position.y + 3, ctx.player.position.z, { color: '#ff4a4a', stroke: '#3a0000', size: 0.9, wobble: 0.15 })
          flash = 1
          shake = 0.5
          unlock()
        } else {
          game.onPad = true
          ctx.sfx.padEnter(p.mult, { x, z: cz })
          ctx.fx.burst(x, 0.4, cz, { sprite: 'sparkle', spread: 'up', cone: 0.9, count: 26, colors: [p.color, '#ffffff', '#9fdcff'], speed: [3, 7], life: [0.5, 1], size: [0.35, 0.6], gravity: 6 })
          tickIn = 0.3
        }
      },
      onStay(dt) {
        if (locked()) return
        game.onPad = true
        tickIn -= dt
        if (tickIn > 0 || !ctx.player.grounded) return
        tickIn = TRAINING.tick
        // The hop: a little bounce on the beat, and the gain it trains.
        hop(TRAINING.hop)
        const gain = addJump(TRAINING.base * p.mult)
        ctx.sfx.trainTick(streak++)
        pulse = 1
        const pl = ctx.player.position
        ctx.fx.floatText(`+${short(gain)}`, pl.x + 0.9 + (Math.random() - 0.5) * 0.6, pl.y + 2.4, pl.z, { color: '#5fd0ff', stroke: '#0b2350', size: 0.75, rise: 2.4, icon: 'jump' })
        ctx.fx.burst(pl.x, pl.y + 0.2, pl.z, { spread: 'up', cone: 0.6, count: 10, colors: [p.color, '#ffffff'], speed: [2, 4], life: [0.4, 0.8], size: [0.25, 0.45], gravity: 3, sprite: 'sparkle' })
        ctx.fx.ring(pl.x, 0.25, pl.z, { color: p.color, r0: 0.4, r1: 2.4, life: 0.45 })
      },
      onExit() {
        game.onPad = false
        streak = 0
      },
    })

    const base = 0.3
    const red = new Color('#ff2020')
    ctx.onUpdate((t, dt) => {
      // Labels bob; locked ones shake when bumped.
      shake = Math.max(0, shake - dt)
      tag.position.y = tagY + Math.sin(t * 1.8 + i) * 0.12
      tag.position.x = x + (shake > 0 ? Math.sin(t * 60) * shake * 0.4 : 0)
      flash = Math.max(0, flash - dt * 2.5)
      pulse = Math.max(0, pulse - dt * 2.2)
      m.emissive.copy(color).lerp(red, flash)
      m.emissiveIntensity = (locked() ? base : base + 0.15) + Math.sin(t * 2 + i) * 0.08 + pulse * 0.9 + flash * 0.6
    })
  })

  // Progress toward the first wall your jump power cannot clear yet.
  ctx.onUpdate(() => {
    const next = ZONES.find((z) => z.req > game.jumpPower)
    bar.set(game.jumpPower, next ? next.req : 0)
  })
}
