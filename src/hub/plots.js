// The bases along the south wall. Six slots: the local player's own (fully interactive) and five
// that show the other players' (remoteBase, fed from the roster; an empty seat is an "Open Base").
// The local base: a studded wooden platform with a sand path down the middle,
// two rows of cream pedestals each with a glowing green collect pad, creatures
// earning money every second (each pad shows what it holds; step on it to
// collect: ka-ching, a coin shower that flies into you, "+$"), signs at the
// front ("+1 Slot" to buy the next pedestal, the base's unclaimed total with a
// Claim all you can walk into), a two-storey wooden pavilion at the back with a
// climbable ladder and two more pedestals upstairs, and a floating "You".
// Walk onto an empty pedestal carrying a brainrot to place it; E picks one back
// up or swaps it. Between the bases: pines, and in front, an hourglass with a
// free gift (a short jump boost) that pops open every few minutes.
import { BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, TorusGeometry, Vector3 } from 'three'
import { COARSE_POINTER, HUB, NET } from '../config.js'
import { onTick } from '../physics.js'
import { inputState } from '../input.js'
import { lego, solid, wbox } from './kit.js'
import { outlined, paintedTexture, roundRect, short } from './paint.js'
import { signPanel } from './signs.js'
import { buildCreature, SPECIES_NAMES } from './creatures.js'
import { makeAura } from './aura.js'
import { makeTag, tagLines } from './brainrots.js'
import { pine, roundTree } from './arena.js'
import { mulberry32 } from '../textures.js'
import { addBoost, baseIncome, bus, earn, game, incomeOf, moneyMult, offerPrompt, slotPrice, spend } from '../game/state.js'

const box = new BoxGeometry(1, 1, 1)
const cyl = new CylinderGeometry(1, 1, 1, 16)
function b(parent, material, w, h, d, x, y, z, geo = box) {
  const m = new Mesh(geo, material)
  m.scale.set(w, h, d)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
const plain = (c, extra) => new MeshStandardMaterial({ color: c, roughness: 0.6, ...extra })

function frontBoard(draw) {
  return paintedTexture(384, 256, (ctx, W, H) => {
    ctx.fillStyle = '#5a2f17'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#6b3a1d'
    for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 44 + 8, W, 30)
    draw(ctx, W, H)
  })
}
function button(ctx, x, y, w, h, fill, text, size = 34) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  roundRect(ctx, x - w / 2 + 3, y - h / 2 + 5, w, h, 12)
  ctx.fill()
  ctx.fillStyle = fill
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 12)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  roundRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.4, 8)
  ctx.fill()
  outlined(ctx, text, x, y + 2, { size, fill: '#ffffff', stroke: '#14301a', line: 0.2, maxW: w - 14 })
}

// A small "$1.2K" tag above a collect pad (repainted when the amount changes).
function padTag() {
  let text = '$0'
  const tex = paintedTexture(256, 96, (c, W, H) => outlined(c, text, W / 2, H / 2, { size: 64, fill: '#7dff4a', stroke: '#0e2a0a', line: 0.2, maxW: W - 10 }))
  const s = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
  return {
    set(v) {
      const next = `$${short(v)}`
      if (next === text) return
      text = next
      tex.userData.repaint()
    },
    tex,
    s,
  }
}

// The pad materials are shared by every base (the glow pulses once a frame, see pulsePads).
const padMat = new MeshStandardMaterial({ color: '#8ef02a', emissive: '#5ad61a', emissiveIntensity: 0.55, roughness: 0.4 })
const padDim = new MeshStandardMaterial({ color: '#6a7a5a', emissive: '#1a2a10', emissiveIntensity: 0.1, roughness: 0.6 })
const pulsePads = (t) => (padMat.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.12)

// Everything static the bases share: the platform, 12 pedestals with their collect pads (dim until
// a slot is unlocked), the two-storey pavilion with its ladder, and their colliders. The local base
// and the other players' bases (remoteBase) both start from this one.
function baseShell(ctx, cx) {
  const P = HUB.plots
  const z0 = P.front
  const depth = P.depth
  const W = P.width
  const root = new Group()
  root.position.set(cx, 0, 0)
  ctx.scene.add(root)
  const wood = lego('wood')
  const dark = lego('woodDark')
  const cream = lego('cream')
  const path = lego('path')

  // Platform, rim and the sand path.
  wbox(root, W, 0.5, depth, 0, 0.25, z0 + depth / 2, wood)
  for (const s of [-1, 1]) wbox(root, 0.5, 0.75, depth, s * (W / 2 - 0.25), 0.375, z0 + depth / 2, dark)
  wbox(root, W, 0.75, 0.5, 0, 0.375, z0 + depth - 0.25, dark)
  wbox(root, 4, 0.06, depth - 0.5, 0, 0.53, z0 + depth / 2, path, { shadow: false })
  solid(W / 2, 0.25, depth / 2, cx, 0.25, z0 + depth / 2)
  for (const s of [-1, 1]) solid(0.25, 0.375, depth / 2, cx + s * (W / 2 - 0.25), 0.375, z0 + depth / 2)

  // --- Slots: pedestal + glowing collect pad -------------------------------------------
  // Ten on the ground (two rows of five, west and east of the path) and two
  // upstairs on the pavilion deck, numbered row by row (game.slots order).
  const deckY = 5.6
  const dz0 = z0 + depth - 11.5
  const dz1 = z0 + depth - 0.2
  const slots = []
  const addSlot = (side, row, px, padX, z, top, up) => {
    const i = slots.length
    if (up) {
      wbox(root, 2.9, 0.4, 2.7, px, deckY + 0.92, z, cream)
      solid(1.45, 0.2, 1.35, cx + px, deckY + 0.92, z)
    } else {
      wbox(root, 2.9, 0.4, 2.7, px, 0.7, z, cream)
      b(root, plain('#e2d3b2'), 3.0, 0.08, 2.8, px, 0.52, z)
      solid(1.45, 0.45, 1.35, cx + px, 0.45, z)
    }
    const padY = up ? deckY + 0.78 : 0.57
    const pad = b(root, padDim, 1.3, 0.14, 2.2, padX, padY, z)
    pad.castShadow = false
    pad.userData.dynamic = true
    const tag = padTag()
    tag.s.scale.set(1.8, 0.65, 1)
    tag.s.rotation.set(-Math.PI / 2, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2)
    tag.s.position.set(padX, padY + 0.09, z)
    tag.s.visible = false
    tag.s.userData.dynamic = true
    root.add(tag.s)
    slots.push({ i, side, row, px, padX, z, top, padY, up, x: cx + padX, wx: cx + px, pad, tag, view: null, flash: 0, lock: null, rotY: side < 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3 })
  }
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) addSlot(side, row, side * 5.6, side * 3.0, z0 + 3.4 + row * 3.4, 0.9, false)
  for (const side of [-1, 1]) addSlot(side, 5, side * 5.5, side * 2.6, (dz0 + dz1) / 2, deckY + 1.12, true)

  // --- Pavilion at the back: posts, a studded deck, railings, ladder ---------------------
  const post = plain('#6b3d1f')
  for (const px of [-W / 2 + 0.4, -2.6, 2.6, W / 2 - 0.4]) {
    for (const pz of [dz0 + 0.3, (dz0 + dz1) / 2, dz1 - 0.3]) {
      b(root, post, 0.45, deckY, 0.45, px, deckY / 2 + 0.5, pz)
      solid(0.22, deckY / 2, 0.22, cx + px, deckY / 2 + 0.5, pz)
    }
  }
  wbox(root, W, 0.45, dz1 - dz0, 0, deckY + 0.5, (dz0 + dz1) / 2, wood)
  wbox(root, W + 0.3, 0.25, 0.4, 0, deckY + 0.25, dz0, dark)
  solid(W / 2, 0.22, (dz1 - dz0) / 2, cx, deckY + 0.5, (dz0 + dz1) / 2)
  // Railings with a gap at the ladder.
  const railY = deckY + 0.73
  const rail = plain('#8a5129')
  const railRun = (x0, x1, z) => {
    b(root, rail, x1 - x0, 0.16, 0.16, (x0 + x1) / 2, railY + 0.95, z)
    for (let x = x0; x <= x1 + 0.01; x += 1.2) b(root, rail, 0.14, 0.95, 0.14, x, railY + 0.45, z)
    solid((x1 - x0) / 2, 0.6, 0.1, cx + (x0 + x1) / 2, railY + 0.6, z)
  }
  railRun(-W / 2 + 0.3, -1.2, dz0 + 0.1)
  railRun(1.2, W / 2 - 0.3, dz0 + 0.1)
  for (const s of [-1, 1]) {
    b(root, rail, 0.16, 0.16, dz1 - dz0, s * (W / 2 - 0.2), railY + 0.95, (dz0 + dz1) / 2)
    for (let z = dz0; z <= dz1 + 0.01; z += 1.4) b(root, rail, 0.14, 0.95, 0.14, s * (W / 2 - 0.2), railY + 0.45, z)
    solid(0.1, 0.6, (dz1 - dz0) / 2, cx + s * (W / 2 - 0.2), railY + 0.6, (dz0 + dz1) / 2)
  }
  // Pergola beams over the deck.
  for (const pz of [dz0 + 0.3, dz1 - 0.3]) b(root, post, W, 0.35, 0.35, 0, deckY + 4.2, pz)
  for (const px of [-W / 2 + 0.4, -2.6, 2.6, W / 2 - 0.4]) {
    b(root, post, 0.35, 3.6, 0.35, px, deckY + 2.5, dz0 + 0.3)
    b(root, post, 0.35, 3.6, 0.35, px, deckY + 2.5, dz1 - 0.3)
    b(root, post, 0.3, 0.3, dz1 - dz0, px, deckY + 4.4, (dz0 + dz1) / 2)
  }
  // Ladder up the front of the deck, from the path.
  const lz = dz0 - 0.55
  for (const s of [-1, 1]) b(root, rail, 0.16, deckY + 1.6, 0.16, s * 0.6, (deckY + 1.6) / 2 + 0.5, lz)
  for (let y = 1.0; y < deckY + 1.8; y += 0.45) b(root, plain('#b07a44'), 1.2, 0.1, 0.12, 0, y, lz)
  return { P, z0, depth, W, root, slots, deckY, dz0, dz1, lz, wood, dark, cream }
}

function localBase(ctx, cx) {
  const { P, z0, depth, W, root, slots, deckY, dz0, dz1, lz } = baseShell(ctx, cx)
  // What a filled slot shows: the creature, its name / rarity / income tag, its variant aura.
  function show(slot) {
    const data = game.slots[slot.i]
    if (!data) return
    const c = buildCreature(data.species, data.variant, slot.i * 7 + 3)
    c.group.position.set(slot.px, slot.top, slot.z)
    c.group.rotation.y = slot.rotY
    c.group.userData.dynamic = true
    root.add(c.group)
    attach(slot, c)
  }
  function attach(slot, c) {
    const data = game.slots[slot.i]
    c.group.userData.dynamic = true
    const tag = makeTag(tagLines(data), 1.7)
    tag.sprite.position.set(slot.px, slot.top + c.height + 1.0, slot.z)
    root.add(tag.sprite)
    slot.view = { c, tag, aura: makeAura(ctx.fx, c), income: -1 }
  }
  function hide(slot) {
    if (!slot.view) return null
    const v = slot.view
    v.tag.dispose()
    slot.view = null
    return v.c
  }
  // Locked slots: a dim pad and a padlock tag; the next one to buy shows its price.
  function refreshLocks() {
    for (const slot of slots) {
      const locked = slot.i >= game.slotsUnlocked
      slot.pad.material = locked ? padDim : padMat
      if (slot.lock) {
        slot.lock.removeFromParent()
        slot.lock = null
      }
      if (locked) {
        const next = slot.i === game.slotsUnlocked && slotPrice() !== null
        slot.lock = ctx.label(next ? `Locked\n+1 Slot $${short(slotPrice())}` : 'Locked', next ? 1.5 : 0.8, { colors: ['#ff4a4a', '#7dff4a'], outline: '#2a0a0a', outlineWidth: 16 }, { near: 14, far: 26 })
        slot.lock.position.set(slot.px, slot.top + 1.2, slot.z)
        root.add(slot.lock)
      }
    }
  }
  for (const slot of slots) show(slot)
  refreshLocks()
  // Brainrots granted from the store appear on their pedestal with a pop.
  bus.on('slots', () => {
    for (const slot of slots) {
      if (!game.slots[slot.i] || slot.view || slot.flying) continue
      show(slot)
      landFx(slot, slot.view.c)
    }
  })

  // Collecting: step on a pad -> the bank flies to you.
  const collect = (slot) => {
    const data = game.slots[slot.i]
    if (!data || data.bank < 1) return false
    const amount = data.bank
    data.bank = 0
    slot.tag.set(0)
    earn(amount)
    ctx.sfx.cashIn({ x: slot.x, y: slot.padY, z: slot.z })
    let n = 0
    ctx.fx.coinShower(slot.x, slot.padY + 0.25, slot.z, Math.min(14, 5 + Math.log10(amount + 1) * 2), () => ctx.sfx.coin(n++))
    ctx.fx.burst(slot.x, slot.padY + 0.15, slot.z, { sprite: 'sparkle', spread: 'up', cone: 0.8, count: 18, colors: ['#9dff5a', '#ffffff', '#ffe066'], speed: [3, 6], life: [0.4, 0.8], size: [0.3, 0.5], gravity: 8 })
    ctx.fx.ring(slot.x, slot.padY + 0.1, slot.z, { color: '#7dff4a', r0: 0.4, r1: 2.6, life: 0.45 })
    const p = ctx.player.position
    ctx.fx.floatText(`+$${short(amount)}`, p.x, p.y + 2.8, p.z, { color: '#7dff4a', stroke: '#0e2a0a', size: 1.05, rise: 2.6, life: 1.5 })
    slot.flash = 1
    return true
  }

  // Placing the carried brainrot: it hops from your hands onto the pedestal.
  const landFx = (slot, c) => {
    const w = { x: slot.wx, y: slot.top, z: slot.z }
    ctx.sfx.place(w)
    ctx.fx.burst(w.x, w.y + 0.2, w.z, { count: 16, colors: ['#ffffff', '#f3e8cf'], speed: [2, 4], life: [0.3, 0.6], size: [0.4, 0.7], drag: 4, grow: 1.6, spread: 'ring' })
    ctx.fx.burst(w.x, w.y + 1, w.z, { sprite: 'sparkle', count: 16, colors: ['#ffe680', '#ffffff', '#7dff4a'], speed: [2, 5], life: [0.5, 0.9], size: [0.35, 0.6], gravity: 3 })
    ctx.fx.ring(w.x, w.y + 0.05, w.z, { color: '#7dff4a', r0: 0.3, r1: 2.4, life: 0.45 })
    ctx.fx.floatText(`+$${short(incomeOf(game.slots[slot.i]))}/s`, w.x, w.y + c.height + 1.6, w.z, { color: '#7dff4a', stroke: '#0e2a0a', size: 0.9, rise: 1.8 })
  }
  const settle = (slot, h) => {
    game.slots[slot.i] = { ...h.data, bank: 0 }
    slot.flying = true
    const local = new Vector3(slot.px, slot.top, slot.z)
    ctx.carry.fly(h.c, root.localToWorld(local.clone()), {
      d: 0.42,
      arc: 1.8,
      scale: 1,
      rotY: slot.rotY,
      parent: root,
      local,
      onLand() {
        slot.flying = false
        attach(slot, h.c)
        landFx(slot, h.c)
      },
    })
  }
  const place = (slot) => {
    const h = ctx.carry.release()
    if (h) settle(slot, h)
  }
  // Taking a brainrot back off its pedestal (its bank is collected first).
  const takeBack = (slot) => {
    if (!game.slots[slot.i] || !slot.view || ctx.carry.full()) return
    collect(slot)
    const data = game.slots[slot.i]
    game.slots[slot.i] = null
    slot.tag.s.visible = false
    ctx.carry.pick(data, hide(slot))
    ctx.sfx.pickup({ x: slot.wx, y: slot.top, z: slot.z })
  }
  const swapAt = (slot) => {
    if (!game.slots[slot.i] || !slot.view || !ctx.carry.has()) return
    collect(slot)
    const h = ctx.carry.release()
    const data = game.slots[slot.i]
    ctx.carry.pick(data, hide(slot))
    ctx.sfx.pickup({ x: slot.wx, y: slot.top, z: slot.z })
    settle(slot, h)
  }
  const buySlot = () => {
    const price = slotPrice()
    if (price === null) return
    bus.emit('confirm', {
      title: '+1 Slot',
      text: 'One more pedestal at your base, so one more brainrot earns money for you.',
      price,
      onBuy() {
        if (!spend(price)) return false
        game.slotsUnlocked++
        ctx.sfx.buy()
        refreshLocks()
        left.userData.repaint()
        const s = slots[game.slotsUnlocked - 1]
        ctx.fx.burst(s.wx, s.top + 0.5, s.z, { sprite: 'sparkle', count: 30, colors: ['#7dff4a', '#ffffff', '#ffe066'], speed: [3, 7], life: [0.5, 1], size: [0.4, 0.7], gravity: 5 })
        ctx.fx.ring(s.wx, s.top, s.z, { color: '#7dff4a', r0: 0.4, r1: 3, life: 0.5 })
        return true
      },
    })
  }

  for (const slot of slots) {
    const y0 = slot.up ? deckY : -1
    const y1 = slot.up ? deckY + 4 : 3
    ctx.zone({ x0: slot.x - 0.9, x1: slot.x + 0.9, z0: slot.z - 1.3, z1: slot.z + 1.3, y0, y1, onEnter: () => collect(slot) })
    ctx.zone({
      x0: Math.min(slot.x, slot.wx) - 1.6,
      x1: Math.max(slot.x, slot.wx) + 1.6,
      z0: slot.z - 1.6,
      z1: slot.z + 1.6,
      y0,
      y1,
      onEnter() {
        if (ctx.carry.has() && !game.slots[slot.i] && slot.i < game.slotsUnlocked) place(slot)
      },
      onStay() {
        const p = ctx.player.position
        const at = { x: slot.wx, y: slot.top + 1.4, z: slot.z, d: Math.hypot(p.x - slot.wx, p.z - slot.z) }
        if (slot.i >= game.slotsUnlocked) {
          if (slot.i === game.slotsUnlocked && slotPrice() !== null) offerPrompt({ ...at, key: 'E', text: 'Unlock Slot', sub: `$${short(slotPrice())}`, action: buySlot })
          return
        }
        const data = game.slots[slot.i]
        if (!data) {
          if (ctx.carry.has()) offerPrompt({ ...at, key: 'E', text: 'Place', action: () => ctx.carry.has() && !game.slots[slot.i] && place(slot) })
          return
        }
        if (!slot.view) return // still landing
        if (ctx.carry.full()) offerPrompt({ ...at, key: 'E', text: 'Swap', sub: SPECIES_NAMES[data.species], action: () => swapAt(slot) })
        else offerPrompt({ ...at, key: 'E', text: 'Pick Up', sub: SPECIES_NAMES[data.species], action: () => takeBack(slot) })
      },
    })
  }

  // --- Front signs ------------------------------------------------------------------------
  let shownMult = ''
  const left = frontBoard((c, W2) => {
    outlined(c, '+1 Slot', W2 / 2, 50, { size: 50, fill: '#ffffff', stroke: '#2a1408' })
    const price = slotPrice()
    button(c, W2 / 2, 120, 200, 56, price === null ? '#888888' : '#3cc43c', price === null ? 'Max' : `$${short(price)}`, 38)
    outlined(c, `$$$ x${shownMult || '1.0'}`, W2 / 2, 200, { size: 54, fill: '#7dff4a', stroke: '#0e2a0a', italic: true })
  })
  let unclaimed = 0
  const right = frontBoard((c, W2) => {
    button(c, W2 / 2, 46, 250, 56, '#3a8ff0', 'Base Income', 34)
    outlined(c, `$${short(unclaimed)}`, W2 / 2, 128, { size: 54, fill: '#7dff4a', stroke: '#0e2a0a' })
    button(c, W2 / 2, 205, 230, 56, '#3cc43c', 'Claim all', 36)
  })
  for (const [s, tex] of [[1, left], [-1, right]]) { // seen from the hub: +1 Slot on the left, Claim all on the right
    const g = new Group()
    g.position.set(s * (W / 2 - 1.8), 0, z0 - 0.6)
    g.rotation.y = Math.PI + s * 0.25 // faces north (the hub), turned a little toward the path
    root.add(g)
    for (const px of [-1.4, 1.4]) b(g, plain('#4a2612'), 0.28, 2.4, 0.28, px, 1.2, 0)
    const panel = signPanel(tex, 3.4, 2.27, { depth: 0.2, back: '#3b1e0e', glow: 0.2 })
    panel.position.set(0, 2.3, 0.15)
    panel.rotation.x = -0.12
    g.add(panel)
    solid(1.6, 1.2, 0.2, cx + s * (W / 2 - 1.8), 1.2, z0 - 0.6, s * 0.25)
  }
  // Walking up to "+1 Slot" offers the next slot.
  ctx.zone({ x0: cx + W / 2 - 4, x1: cx + W / 2 + 0.5, z0: z0 - 3.5, z1: z0 + 0.3, onEnter: buySlot })
  // Walking up to "Claim all" collects every pad at once.
  ctx.zone({
    x0: cx - W / 2 - 0.5,
    x1: cx - W / 2 + 4,
    z0: z0 - 3.5,
    z1: z0 + 0.3,
    onEnter() {
      let any = false
      for (const slot of slots) if (collect(slot)) any = true
      if (!any) ctx.sfx.pop({ x: cx - W / 2, z: z0 }, 500)
    },
  })

  // Climbing: inside the ladder box with any move input (or jump held), go up.
  const ladder = { x0: cx - 0.95, x1: cx + 0.95, z0: lz - 0.9, z1: lz + 0.5 }
  let climbing = false
  onTick(() => {
    const p = ctx.player.position
    const inside = p.x > ladder.x0 && p.x < ladder.x1 && p.z > ladder.z0 && p.z < ladder.z1 && p.y < deckY + 0.9
    const wants = Math.hypot(inputState.move.x, inputState.move.z) > 0.1
    climbing = inside && wants
    if (climbing) ctx.player.velocity.y = Math.max(ctx.player.velocity.y, 5.5)
  })
  let climbStep = 0
  ctx.onUpdate((t, dt) => {
    if (!climbing) return
    climbStep -= dt
    if (climbStep <= 0) {
      climbStep = 0.18
      ctx.sfx.step('wood', 6)
    }
  })

  // "You" floating over the base, gently bobbing.
  const you = ctx.label('You', 2.6, { color: '#3dff4a', outline: '#0c2a10', outlineWidth: 18 })
  you.position.set(0, 9.5, z0 + 6)
  root.add(you)

  // Money builds up on every filled pad all the time; tags and the boards catch up a few times a second.
  let acc = 0
  ctx.onUpdate((t, dt) => {
    acc += dt
    const mult = moneyMult()
    const pp = ctx.player.position
    for (const s of slots) {
      const data = game.slots[s.i]
      if (data && s.i < game.slotsUnlocked) data.bank += baseIncome(data) * mult * dt
      if (s.flash) {
        s.flash = Math.max(0, s.flash - dt * 2)
        s.pad.scale.y = 0.14 * (1 - s.flash * 0.6)
      }
      if (s.view) {
        const near = Math.hypot(pp.x - s.wx, pp.z - s.z) < 60
        if (near) s.view.c.update(t, dt)
        s.view.aura(dt, near)
        s.view.tag.sprite.position.y = s.top + s.view.c.height + 1.0 + Math.sin(t * 1.5 + s.i) * 0.08
      }
    }
    pulsePads(t)
    you.position.y = 9.5 + Math.sin(t * 1.4) * 0.25
    if (acc < 0.25) return
    acc = 0
    unclaimed = 0
    for (const s of slots) {
      const data = game.slots[s.i]
      s.tag.s.visible = !!data && s.i < game.slotsUnlocked
      if (!data) continue
      s.tag.set(data.bank)
      unclaimed += data.bank
      if (s.view) {
        const inc = incomeOf(data)
        if (inc !== s.view.income) {
          s.view.income = inc
          s.view.tag.paint(tagLines(data))
        }
      }
    }
    right.userData.repaint()
    const m = mult.toFixed(1)
    if (m !== shownMult) {
      shownMult = m
      left.userData.repaint()
    }
  })
  return root
}

// The other players' bases: the same platform, pedestals and pavilion as the local one, with a
// name gate over the entrance, whatever the owner has placed on the pedestals (synced through the
// roster, see remotePlayers.js) and glowing collect pads under the filled, unlocked ones. Nothing
// here is interactive: the owner's brainrots and money are theirs. An empty seat shows "Open Base".
function remoteBase(ctx, cx, seat) {
  const { root, slots, W, z0 } = baseShell(ctx, cx)
  let owner = ''
  const sign = paintedTexture(768, 256, (c, w, h) => {
    c.fillStyle = '#5a2f17'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#6b3a1d'
    for (let i = 0; i < 5; i++) c.fillRect(0, i * 52 + 8, w, 36)
    if (owner) {
      outlined(c, owner, w / 2, 100, { size: 104, fill: '#ffffff', stroke: '#2a1408', line: 0.16, maxW: w - 50 })
      outlined(c, 'Base', w / 2, 200, { size: 66, fill: '#7dff4a', stroke: '#0e2a0a' })
    } else {
      outlined(c, 'Open Base', w / 2, 128, { size: 108, fill: '#c9b99a', stroke: '#2a1408', line: 0.16, maxW: w - 50 })
    }
  })
  // A gate over the path: two posts either side of it and the board between, high enough to read
  // from the hub.
  const gate = new Group()
  gate.position.set(0, 0, z0 - 0.6)
  gate.rotation.y = Math.PI // faces north (the hub)
  root.add(gate)
  const post = plain('#4a2612')
  for (const s of [-1, 1]) {
    b(gate, post, 0.5, 8.6, 0.5, s * 5.9, 4.3, 0)
    solid(0.25, 4.3, 0.25, cx + s * 5.9, 4.3, z0 - 0.6)
  }
  const board = signPanel(sign, 11, 3.6, { depth: 0.3, back: '#3b1e0e', glow: 0.22 })
  board.position.set(0, 7.1, 0.15)
  gate.add(board)

  const views = slots.map(() => null)
  const keys = slots.map(() => '')
  let unlocked = 0
  const refreshPads = () => {
    for (const s of slots) s.pad.material = views[s.i] && s.i < unlocked ? padMat : padDim
  }
  function setView(s, data) {
    const old = views[s.i]
    if (old) {
      old.tag.dispose()
      old.c.group.removeFromParent()
      views[s.i] = null
    }
    if (!data) return
    const c = buildCreature(data.species, data.variant, s.i * 7 + 3 + seat * 13)
    c.group.position.set(s.px, s.top, s.z)
    c.group.rotation.y = s.rotY
    root.add(c.group)
    const tag = makeTag(tagLines(data).slice(0, -1), 1.5) // no $/s: that is the owner's multiplier
    tag.sprite.position.set(s.px, s.top + c.height + 0.9, s.z)
    root.add(tag.sprite)
    views[s.i] = { c, tag, aura: makeAura(ctx.fx, c), s, data, on: false }
    ctx.fx.burst(cx + s.px, s.top + 0.4, s.z, { sprite: 'sparkle', count: 10, colors: ['#ffe680', '#ffffff', '#7dff4a'], speed: [1.5, 3.5], life: [0.4, 0.8], size: [0.3, 0.5], gravity: 3 })
  }
  refreshPads()

  return {
    seat,
    views,
    setOwner(name) {
      const next = name || ''
      if (next === owner) return
      owner = next
      sign.userData.repaint()
    },
    // list: [{ species, variant } | null] by pedestal; count: how many pedestals the owner bought.
    setSlots(list, count) {
      unlocked = count
      for (const s of slots) {
        const d = list[s.i] ?? null
        const key = d ? `${d.species}:${d.variant}` : ''
        if (key === keys[s.i]) continue
        keys[s.i] = key
        setView(s, d)
      }
      refreshPads()
    },
    // Called a few times a second with the camera-side budget decided by the manager.
    update(t, dt, pp) {
      for (const v of views) {
        if (!v) continue
        const near = Math.hypot(pp.x - (cx + v.s.px), pp.z - v.s.z) < 60
        if (near) v.c.update(t, dt)
        v.aura(dt, near && v.on)
        v.tag.sprite.position.y = v.s.top + v.c.height + 0.9 + Math.sin(t * 1.5 + v.s.i) * 0.08
      }
    },
    cx,
  }
}

// All the other bases, keyed by seat. `setOwner(seat, name | null)` / `setSlots(seat, list, count)`
// are driven from the roster; rare brainrots shine only on the few nearest to the player (aura
// particles are the costly part, so the budget follows the graphics preset's particle density).
function remoteBases(ctx, seats) {
  const bases = new Map(seats.map(([seat, cx]) => [seat, remoteBase(ctx, cx, seat)]))
  let rank = 0
  const cand = []
  ctx.onUpdate((t, dt) => {
    pulsePads(t)
    const pp = ctx.player.position
    rank -= dt
    if (rank <= 0) {
      rank = 0.5
      cand.length = 0
      for (const base of bases.values()) {
        for (const v of base.views) {
          if (!v) continue
          v.on = false
          if (v.data.variant === 'normal') continue
          const d = Math.hypot(pp.x - (base.cx + v.s.px), pp.z - v.s.z)
          if (d < NET.baseAuraRange) cand.push([d, v])
        }
      }
      cand.sort((a, b) => a[0] - b[0])
      for (let i = 0; i < Math.min(cand.length, COARSE_POINTER ? NET.baseAuraMaxTouch : NET.baseAuraMax); i++) cand[i][1].on = true
    }
    for (const base of bases.values()) base.update(t, dt, pp)
  })
  return {
    has: (seat) => bases.has(seat),
    setOwner: (seat, name) => bases.get(seat)?.setOwner(name),
    setSlots: (seat, list, count) => bases.get(seat)?.setSlots(list, count),
  }
}

// Free boost hourglass: a purple frame, glass bulbs, sand that drains and flips,
// gifts around the base and a floating gift with a "!" that pops open.
function hourglass(ctx, x, z) {
  const g = new Group()
  g.position.set(x, 0, z)
  ctx.scene.add(g)
  wbox(g, 3.4, 0.3, 3.4, 0, 0.15, 0, lego('green'))
  const frame = plain('#7a3fd0', { metalness: 0.3, roughness: 0.4 })
  const glass = new MeshPhysicalMaterial({ color: '#e8f6ff', roughness: 0.05, transmission: 0.7, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false })
  const sandMat = plain('#ffd36a', { emissive: '#7a5a10', emissiveIntensity: 0.3 })
  const glassG = new Group()
  glassG.userData.dynamic = true
  glassG.position.y = 2.2
  g.add(glassG)
  b(glassG, frame, 2.4, 0.25, 2.4, 0, -1.75, 0)
  b(glassG, frame, 2.4, 0.25, 2.4, 0, 1.75, 0)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    b(glassG, frame, 0.16, 3.5, 0.16, Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05)
  }
  const bulb = new ConeGeometry(0.85, 1.6, 20, 1, true)
  const top = new Mesh(bulb, glass)
  top.position.y = 0.8
  top.rotation.x = Math.PI
  const bot = new Mesh(bulb, glass)
  bot.position.y = -0.8
  glassG.add(top, bot)
  const sandGeo = new ConeGeometry(0.75, 1.4, 20)
  const sandTop = new Mesh(sandGeo, sandMat)
  sandTop.rotation.x = Math.PI
  const sandBot = new Mesh(sandGeo, sandMat)
  const stream = new Mesh(cyl, sandMat)
  stream.scale.set(0.04, 1.4, 0.04)
  stream.position.y = -0.7
  glassG.add(sandTop, sandBot, stream)
  solid(1.7, 2, 1.7, x, 2, z)
  // Gifts around the base.
  const giftCols = [['#ff4f6a', '#ffe14a'], ['#4fb4ff', '#ffffff'], ['#b05aff', '#7dff6a'], ['#ffd23a', '#ff4f6a']]
  const gifts = [[-1.3, 1.25, 0.7], [1.35, 1.2, 0.6], [1.1, -1.3, 0.55]]
  gifts.forEach(([gx, gz, s], i) => {
    const [c1, c2] = giftCols[i]
    b(g, plain(c1), s, s, s, gx, 0.3 + s / 2, gz)
    b(g, plain(c2), s + 0.02, s + 0.02, 0.12, gx, 0.3 + s / 2, gz)
    b(g, plain(c2), 0.12, s + 0.02, s + 0.02, gx, 0.3 + s / 2, gz)
  })
  const tag = ctx.label('Free Gift\nevery 5 minutes!', 1.2, { colors: ['#ffe14a', '#7dff4a'], outline: '#10162a', outlineWidth: 14 }, { near: 25, far: 55 })
  tag.position.set(0, 6.2, 0)
  g.add(tag)

  // Floating gift with a bouncing "!".
  const gift = new Group()
  gift.userData.dynamic = true
  gift.position.set(0, 8.4, 0)
  g.add(gift)
  b(gift, plain('#ff3d5a', { emissive: '#5a0010', emissiveIntensity: 0.3 }), 1.3, 1.1, 1.3, 0, 0, 0)
  b(gift, plain('#ffe14a'), 1.34, 1.14, 0.22, 0, 0, 0)
  b(gift, plain('#ffe14a'), 0.22, 1.14, 1.34, 0, 0, 0)
  const lid = new Group()
  lid.position.y = 0.6
  gift.add(lid)
  b(lid, plain('#ff5a72'), 1.45, 0.3, 1.45, 0, 0.1, 0)
  for (const s of [-1, 1]) {
    const bow = b(lid, plain('#ffe14a'), 0.5, 0.3, 0.18, s * 0.25, 0.4, 0, new TorusGeometry(0.5, 0.2, 6, 12))
    bow.rotation.y = s * 0.4
  }
  const bang = ctx.label('!', 1.2, { color: '#ff3d3d', outline: '#ffffff', outlineWidth: 14 })
  bang.position.set(0.9, 1.4, 0)
  gift.add(bang)
  ctx.emitter({ boxes: [{ x, y: 8.4, z, sx: 1, sy: 0.8, sz: 1 }], count: 14, life: 1.6, velocity: [0, 0.4, 0], spread: [0.3, 0.3, 0.3], size: 0.3, color: '#ffe6a0', intensity: 3, twinkle: 9, sprite: 'sparkle', seed: 81 })

  let flip = 0 // 0..1 sand drained
  let flipping = 0
  let opened = 0 // s until the gift returns
  let lidPop = 0
  ctx.zone({
    x0: x - 3,
    x1: x + 3,
    z0: z - 3,
    z1: z + 3.5,
    onEnter() {
      if (opened > 0) {
        ctx.sfx.pop({ x, z }, 600)
        return
      }
      opened = 300
      lidPop = 1
      addBoost('jump30', 2)
      ctx.sfx.magic({ x, z })
      ctx.sfx.cashIn({ x, z })
      ctx.fx.burst(x, 8.4, z, { count: 60, colors: ['#ff4f6a', '#ffe14a', '#4fb4ff', '#7dff6a', '#b05aff', '#ffffff'], speed: [5, 11], up: 4, gravity: 10, life: [1, 1.8], size: [0.25, 0.45], drag: 1 })
      ctx.fx.burst(x, 8.4, z, { sprite: 'sparkle', count: 24, colors: ['#ffffff', '#ffe680'], speed: [2, 6], life: [0.5, 1], size: [0.4, 0.7] })
      const p = ctx.player.position
      ctx.fx.floatText('Free Boost! +30% Jump Power', p.x, p.y + 3, p.z, { color: '#ffe14a', stroke: '#4a2a00', size: 0.85, life: 2, rise: 2.4 })
    },
  })
  ctx.onUpdate((t, dt) => {
    // Sand drains over 20 s, then the glass turns over.
    if (flipping > 0) {
      flipping = Math.max(0, flipping - dt)
      glassG.rotation.z = (1 - flipping) * Math.PI
      if (flipping === 0) {
        glassG.rotation.z = 0
        flip = 0
      }
    } else {
      flip += dt / 20
      if (flip >= 1) {
        flip = 1
        flipping = 1
      }
    }
    const k = flip
    sandTop.scale.set(Math.max(0.01, 1 - k), Math.max(0.01, 1 - k), Math.max(0.01, 1 - k))
    sandTop.position.y = 0.55 + (1 - (1 - k)) * 0.1
    sandBot.scale.set(Math.max(0.01, k), Math.max(0.01, k), Math.max(0.01, k))
    sandBot.position.y = -1.6 + k * 0.7
    stream.visible = k > 0.02 && k < 0.98 && flipping === 0
    // Gift: bobs and turns; pops its lid when opened, hides, then comes back.
    if (opened > 0) opened = Math.max(0, opened - dt)
    lidPop = Math.max(0, lidPop - dt * 0.8)
    const hidden = opened > 0 && lidPop === 0
    gift.visible = !hidden
    gift.scale.setScalar(opened > 0 ? Math.max(0.01, lidPop) : Math.min(1, gift.scale.x + dt * 2))
    lid.position.y = 0.6 + (opened > 0 ? (1 - lidPop) * 2 : 0)
    lid.rotation.z = opened > 0 ? (1 - lidPop) * 1.2 : 0
    gift.position.y = 8.4 + Math.sin(t * 2) * 0.3
    gift.rotation.y = t * 0.8
    bang.position.y = 1.4 + Math.abs(Math.sin(t * 4)) * 0.3
    bang.visible = opened === 0
  })
}

export function buildPlots(ctx) {
  const P = HUB.plots
  const pitch = P.width + P.gap
  const rand = mulberry32(909)
  const trees = new Group()
  ctx.scene.add(trees)
  const others = []
  for (let i = 0; i < P.count; i++) {
    const cx = (i - (P.count - 1) / 2) * pitch
    if (i === P.local) localBase(ctx, cx)
    else others.push([i, cx])
    // Pines in the gaps at the back, and between every base.
    if (i < P.count - 1) {
      const gx = cx + pitch / 2
      pine(trees, gx, 0, P.front + P.depth - 3, 1.1 + rand() * 0.3, rand)
      if (rand() < 0.6) pine(trees, gx + (rand() - 0.5), 0, P.front + P.depth - 11, 0.8 + rand() * 0.3, rand)
    }
  }
  for (const s of [-1, 1]) {
    pine(trees, s * (HUB.halfX - 3), 0, HUB.south - 4, 1.3, rand)
    roundTree(trees, s * (HUB.halfX - 4), 0, HUB.south - 12, 1.1, rand)
  }
  trees.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  const localX = (P.local - (P.count - 1) / 2) * pitch
  hourglass(ctx, localX + pitch / 2, P.front - 2.2)
  return remoteBases(ctx, others)
}

