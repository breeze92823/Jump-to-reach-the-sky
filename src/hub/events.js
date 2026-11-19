// Hub events in the world (schedule: game/events.js, tunables: config EVENTS). Each frame it
// applies the running event's effects (state.js eventFx), announces starts / ends (fanfare,
// banner, toast, a burst around you), ticks the last 5 seconds, and plays the event:
//   rain     brainrots fall around you (hub plaza, or the lane terrace you are on)
//   crystal  purple glitter drifting down around you
//   lava     embers rising around you
//   golden   gold sparks pouring off the Fusion Machine, glitter around you
import { EVENTS, HUB, ZONES } from '../config.js'
import { currentEvent } from '../game/events.js'
import { LEVELS } from '../game/levels.js'
import { bus, eventFx, game, rollVariant } from '../game/state.js'
import { player } from '../player.js'

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// The open part of the hub floor where rain may land (clear of the stalls, pads and bases).
const PLAZA = { x0: -30, x1: 30, z0: -32, z1: 14 }
const MACHINE = { x: HUB.halfX - 6, y: 5.7, z: -6 }

function apply(id) {
  eventFx.luck = id === 'lava' ? EVENTS.lava.luck : 1
  eventFx.crystalGain = id === 'crystal' ? EVENTS.crystal.gain : 1
  eventFx.crystalRespawn = id === 'crystal' ? EVENTS.crystal.respawn : 1
  eventFx.fuseFee = id === 'golden' ? EVENTS.golden.fee : 1
  eventFx.fuseTime = id === 'golden' ? EVENTS.golden.time : 1
  eventFx.luckyPrice = id === 'golden' ? EVENTS.golden.lucky : 1
}

export function buildEvents(ctx, brainrots) {
  let lastId = null
  let rainIn = 0.8
  let fxIn = 0
  let lastTick = -1

  // One brainrot of the rain: mostly from your best zone, sometimes the one below.
  function drop() {
    const p = player.position
    let x
    let z
    let ground = 0
    const lv = game.level >= 0 ? LEVELS[game.level] : null
    if (lv) {
      x = rand(-HUB.laneHalf + 2.5, HUB.laneHalf - 2.5)
      z = rand(lv.north + 5, lv.south - 4)
      ground = lv.y
    } else {
      const a = Math.random() * Math.PI * 2
      const r = rand(...EVENTS.rain.radius)
      x = clamp(p.x + Math.cos(a) * r, PLAZA.x0, PLAZA.x1)
      z = clamp(p.z + Math.sin(a) * r, PLAZA.z0, PLAZA.z1)
    }
    const zone = ZONES[Math.max(0, game.bestZone - (Math.random() < 0.35 ? 1 : 0))]
    const species = zone.species[Math.floor(Math.random() * zone.species.length)]
    brainrots.rainDrop({ species, variant: rollVariant(zone.luck * EVENTS.rain.luck) }, x, z, ground, EVENTS.rain.life)
  }

  ctx.onUpdate((t, dt) => {
    const ev = currentEvent()
    const id = ev?.def.id ?? null
    const p = player.position
    if (id !== lastId) {
      if (lastId) {
        ctx.sfx.eventEnd()
        bus.emit('toast', { text: `${EVENTS.list.find((e) => e.id === lastId).name} is over! Watch for the next one.`, kind: 'info' })
      }
      if (id) {
        ctx.sfx.eventStart()
        bus.emit('banner', { title: `${ev.def.name.toUpperCase()}!`, sub: ev.def.text, color: ev.def.color })
        ctx.fx.burst(p.x, p.y + 1.5, p.z, { sprite: 'sparkle', count: 60, colors: [ev.def.color, '#ffffff', '#ffe14a'], speed: [5, 11], up: 3, gravity: 7, life: [0.8, 1.4], size: [0.4, 0.7], drag: 1 })
        ctx.fx.ring(p.x, p.y + 0.1, p.z, { color: ev.def.color, r0: 0.5, r1: 9, life: 0.8 })
        rainIn = 0.8
      }
      apply(id)
      lastId = id
      lastTick = -1
    }
    if (!ev) return
    // The last 5 seconds tick down.
    const sec = Math.ceil(ev.left)
    if (sec <= 5 && sec !== lastTick) {
      lastTick = sec
      ctx.sfx.eventTick(sec <= 1)
    }
    if (id === 'rain') {
      rainIn -= dt
      if (rainIn <= 0) {
        rainIn = EVENTS.rain.every * rand(0.7, 1.3)
        drop()
      }
    }
    // Ambient particles around you, a few times a second.
    fxIn -= dt
    if (fxIn > 0) return
    fxIn = 0.22
    const a = Math.random() * Math.PI * 2
    const r = rand(2, 13)
    const x = p.x + Math.cos(a) * r
    const z = p.z + Math.sin(a) * r
    if (id === 'crystal') ctx.fx.burst(x, p.y + rand(8, 14), z, { sprite: 'sparkle', count: 4, colors: ['#e07bff', '#c23bff', '#ffffff'], speed: [0.3, 1], gravity: 5, life: [1.4, 2], size: [0.3, 0.55] })
    else if (id === 'lava') ctx.fx.burst(x, p.y + 0.2, z, { spread: 'up', cone: 0.35, count: 4, colors: ['#ff7a1a', '#ffd23a', '#ff3a1a'], speed: [2, 4.5], gravity: 0.6, life: [1, 1.8], size: [0.18, 0.35] })
    else if (id === 'golden') {
      ctx.fx.burst(x, p.y + rand(6, 10), z, { sprite: 'sparkle', count: 2, colors: ['#ffd23a', '#fff6c8'], speed: [0.3, 1], gravity: 4, life: [1.2, 1.8], size: [0.3, 0.5] })
      ctx.fx.burst(MACHINE.x, MACHINE.y, MACHINE.z, { sprite: 'sparkle', count: 8, colors: ['#ffd23a', '#ffffff', '#ffb11f'], speed: [3, 6], up: 2, gravity: 5, life: [0.6, 1.1], size: [0.35, 0.6] })
    } else if (id === 'rain') ctx.fx.burst(x, p.y + rand(10, 16), z, { count: 2, colors: ['#ffffff', '#dff0ff'], speed: [0.2, 0.6], life: [0.8, 1.2], size: [0.8, 1.3], drag: 2, grow: 1.6 })
  })
}
