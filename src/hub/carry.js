// The brainrots held over the player's head (a stack: the Carry upgrade raises
// how many), and the little flights creatures make between places: from the
// lane up into your hands, from your hands onto a pedestal (or the ground).
// The stack is saved, so a reload keeps what you were carrying.
import { Vector3 } from 'three'
import { buildCreature } from './creatures.js'
import { makeAura } from './aura.js'
import { bus, discover, earn, game, sellValue, toast } from '../game/state.js'
import { player } from '../player.js'
import { short } from './paint.js'

export const HOLD_Y = 2.25 // m above the feet the first creature sits
export const HOLD_SIZE = 1.75 // m tall when held
const tmp = new Vector3()
const ease = (k) => k * k * (3 - 2 * k)
// Only what the save needs (species, variant and a reward's own income).
const clean = (d) => (d.income ? { species: d.species, variant: d.variant, income: d.income } : { species: d.species, variant: d.variant })

export function createCarry(ctx) {
  const held = [] // [{ data, c, aura }], bottom first
  const flights = [] // { c, from, to, s0, s1, r0, r1, t, d, arc, parent, local, onLand, follow }

  const holdScale = (c) => Math.min(0.85, HOLD_SIZE / c.height)
  // Where stack slot i sits: on the head, each one on top of the one below.
  function headPos(out, i = held.length) {
    const p = player.renderPosition
    let y = p.y + HOLD_Y
    for (let k = 0; k < Math.min(i, held.length); k++) y += held[k].c.height * holdScale(held[k].c) * 0.82
    return out.set(p.x, y, p.z)
  }
  const sync = () => {
    game.carried = held.map((h) => h.data)
    bus.emit('carry')
  }

  // Move creature `c` along an arc to `to` (world) over d seconds, then park it
  // in `parent` at `local` (or keep flying with the player if follow is set).
  function fly(c, to, { d = 0.3, arc = 1.2, scale = c.group.scale.x, rotY = c.group.rotation.y, parent = null, local = null, onLand = null, follow = false } = {}) {
    const g = c.group
    g.updateMatrixWorld(true)
    const from = g.getWorldPosition(new Vector3())
    ctx.scene.attach(g)
    flights.push({ c, from, to: to.clone(), s0: g.scale.x, s1: scale, r0: g.rotation.y, r1: rotY, t: 0, d, arc, parent, local, onLand, follow })
  }

  const full = () => held.length >= game.carryMax

  function pick(data, c = null) {
    if (full()) return false
    const isNew = discover(data.species, data.variant)
    const slot = held.length
    if (!c) {
      c = buildCreature(data.species, data.variant, Math.floor(Math.random() * 1000))
      headPos(tmp, slot)
      c.group.position.copy(tmp)
      c.group.scale.setScalar(holdScale(c))
      ctx.scene.add(c.group)
    } else {
      fly(c, headPos(tmp, slot), { d: 0.28, arc: 1.4, scale: holdScale(c), rotY: player.facing, follow: true })
    }
    held.push({ data: clean(data), c, aura: makeAura(ctx.fx, c) })
    sync()
    if (isNew) {
      toast(`New brainrot discovered!`, 'good')
      bus.emit('discover', data)
    }
    return true
  }

  // Hand a held creature over (to a pedestal, the ground...): the top one, or
  // stack index i. Returns { data, c } or null.
  function release(i = held.length - 1) {
    if (i < 0 || i >= held.length) return null
    const [h] = held.splice(i, 1)
    const f = flights.findIndex((fl) => fl.c === h.c)
    if (f >= 0) flights.splice(f, 1)
    sync()
    return h
  }

  // Sell held brainrot i (default the top one) for a few seconds of its income.
  function sell(i = held.length - 1) {
    const h = release(i)
    if (!h) return 0
    const value = sellValue(h.data)
    earn(value)
    const p = h.c.group.position
    ctx.sfx.cashIn({ x: p.x, z: p.z })
    ctx.fx.burst(p.x, p.y + 0.5, p.z, { count: 26, colors: ['#ffffff', '#e8f6ff'], speed: [2, 5], life: [0.4, 0.8], size: [0.5, 0.9], drag: 3, grow: 1.6 })
    let n = 0
    ctx.fx.coinShower(p.x, p.y, p.z, 8, () => ctx.sfx.coin(n++))
    ctx.fx.floatText(`+$${short(value)}`, p.x, p.y + 1, p.z, { color: '#7dff4a', stroke: '#0e2a0a', size: 1, rise: 2.4, life: 1.4 })
    h.c.group.parent?.remove(h.c.group)
    return value
  }
  function sellAll() {
    let total = 0
    while (held.length) total += sell()
    return total
  }

  // Restore what was being carried when the game was saved.
  const saved = game.carried
  game.carried = []
  for (const d of saved) pick(d)

  return {
    fly,
    pick,
    release,
    sell,
    sellAll,
    full,
    has: () => held.length > 0,
    get count() {
      return held.length
    },
    get list() {
      return held.map((h) => h.data)
    },
    get data() {
      return held[held.length - 1]?.data ?? null
    },
    get creature() {
      return held[held.length - 1]?.c ?? null
    },
    update(t, dt) {
      // Flights (pick-ups, placings, drops).
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i]
        f.t += dt
        const k = Math.min(1, f.t / f.d)
        const e = ease(k)
        if (f.follow) headPos(f.to, Math.max(0, held.findIndex((h) => h.c === f.c)))
        const g = f.c.group
        g.position.lerpVectors(f.from, f.to, e)
        g.position.y += Math.sin(k * Math.PI) * f.arc
        g.scale.setScalar(f.s0 + (f.s1 - f.s0) * e)
        g.rotation.y = f.r0 + Math.atan2(Math.sin(f.r1 - f.r0), Math.cos(f.r1 - f.r0)) * e
        f.c.update(t, dt)
        if (k >= 1) {
          flights.splice(i, 1)
          if (f.parent) {
            f.parent.add(g)
            g.position.copy(f.local)
            g.rotation.y = f.r1
          }
          f.onLand?.()
        }
      }
      // The stack rides on the head, facing where the player faces, bouncing
      // with the stride (higher ones sway a little more).
      const speed = Math.hypot(player.velocity.x, player.velocity.z)
      const bob = speed > 1 && player.grounded ? Math.abs(Math.sin(t * 9)) * 0.08 : 0
      const sway = player.grounded ? Math.sin(t * 4.5) * Math.min(1, speed / 8) * 0.08 : 0
      for (let i = 0; i < held.length; i++) {
        const h = held[i]
        if (!flights.some((f) => f.c === h.c)) {
          const g = h.c.group
          headPos(g.position, i)
          g.position.y += bob * (1 + i * 0.4)
          g.rotation.y = player.facing
          g.rotation.z = sway * (1 + i * 0.5)
        }
        h.c.update(t, dt)
        h.aura(dt)
      }
    },
  }
}
