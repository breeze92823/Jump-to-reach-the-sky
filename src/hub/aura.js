// Variant effects that follow a creature wherever it is (on the lane, held
// overhead, on a pedestal): golden / diamond / rainbow ones glitter, lava ones
// burn with real flames and embers from their fire points. Pooled fx bursts,
// so nothing is allocated per creature and it works while the creature moves.
import { Vector3 } from 'three'

const v = new Vector3()
const SPARK = {
  golden: ['#ffe680', '#fff4c0', '#ffc53a'],
  diamond: ['#bff6ff', '#ffffff', '#7ff0ff'],
  rainbow: ['#ff7af2', '#7dff6a', '#4fb4ff', '#ffe14a'],
}

// Returns tick(dt, on): call every frame; `on` = near enough to be worth drawing.
export function makeAura(fx, c) {
  let spark = Math.random()
  let fire = 0
  const colors = SPARK[c.variant]
  return (dt, on = true) => {
    if (!on) return
    if (colors) {
      spark -= dt
      if (spark <= 0) {
        spark = 0.18 + Math.random() * 0.25
        v.set((Math.random() - 0.5) * 1.2, Math.random() * c.height, (Math.random() - 0.5) * 1.2)
        c.group.localToWorld(v)
        fx.burst(v.x, v.y, v.z, { sprite: 'sparkle', count: 1, colors, speed: [0.1, 0.4], up: 0.4, life: [0.5, 0.9], size: [0.35, 0.6], drag: 2 })
      }
    }
    if (c.fire.length) {
      fire -= dt
      if (fire <= 0) {
        fire = 0.05
        for (const [x, y, z] of c.fire) {
          v.set(x, y, z)
          c.group.localToWorld(v)
          const s = c.group.scale.x
          fx.burst(v.x, v.y, v.z, { count: 2, colors: ['#ff7a1a', '#ffb040', '#ff4a10'], speed: [0.2, 0.7], up: 2.2 * s, radius: 0.15 * s, life: [0.35, 0.6], size: [0.5 * s, 0.8 * s], grow: 0.1, drag: 1 })
          if (Math.random() < 0.15) fx.burst(v.x, v.y, v.z, { sprite: 'sparkle', count: 1, colors: ['#ffe066'], speed: [0.5, 1.5], up: 2.5, life: [0.8, 1.4], size: [0.15, 0.25], drag: 1 })
        }
      }
    }
  }
}
