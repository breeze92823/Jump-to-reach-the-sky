// The other players in the room (the drawing half of presence; presence.js sends this player's
// pose, the backend relays everybody's through the roster, `net.js remoteRoster()`).
//  - Each other player is the base rig (avatar/character.js), animated by the same procedural
//    animator as the local one from the synced speed / grounded / carrying, dressed with the portal's
//    character kit when their outfit key is known, with a name tag, their equipped back item, the
//    brainrots they carry overhead (rare variants shine) and jump / landing puffs (hub/fx.js).
//  - Poses arrive ~10 times a second, so the drawn position eases toward the latest pose pushed a
//    little ahead along the estimated velocity (dead reckoning, NET.remoteLead) and snaps on a teleport.
//  - Only the nearest NET.remoteMax (NET.remoteMaxTouch on touch) within NET.remoteRange are built;
//    the rest cost nothing. Particle use follows the graphics preset through hub fx's density.
//  - It also feeds each other seat's base (hub/plots.js remoteBase) with its owner's name and the
//    brainrots on their pedestals.
import { Group } from 'three'
import { COARSE_POINTER, CREATURES, NET, PLAYER_DIMS, VARIANTS } from './config.js'
import { canDress, dressCharacter } from './bloxity.js'
import { remoteRoster } from './net.js'
import { player } from './player.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { makeAnimator, disposeAnimator } from './avatar/animator.js'
import { buildCreature } from './hub/creatures.js'
import { makeAura } from './hub/aura.js'
import { HOLD_SIZE, HOLD_Y } from './hub/carry.js'
import { mountBackItem } from './hub/items.js'
import { label } from './propkit.js'

const now = () => performance.now() / 1000
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const nearest = (list) => list.slice().sort((a, b) => a.d - b.d)

// "species:variant,-,species:variant" -> [{ species, variant } | null]; unknown species are skipped.
export function parseBrainrots(text) {
  if (typeof text !== 'string' || !text) return []
  return text.split(',').map((part) => {
    const [species, variant] = part.split(':')
    if (!species || !CREATURES[species]) return null
    return { species, variant: VARIANTS[variant] ? variant : 'normal' }
  })
}

export function createRemotePlayers({ scene, hub, camera, THREE, GLTFLoader }) {
  const fx = hub.fx
  const max = COARSE_POINTER ? NET.remoteMaxTouch : NET.remoteMax
  const auraMax = COARSE_POINTER ? NET.remoteAuraMaxTouch : NET.remoteAuraMax
  const entities = new Map() // sessionId -> entity
  const tagRange = NET.remoteTagRange

  // --- One remote player -----------------------------------------------------------
  function create(id, p) {
    const ent = {
      id,
      p,
      group: new Group(),
      avatar: null,
      animator: null,
      kit: null,
      gen: 0,
      outfit: '',
      name: '',
      tag: null,
      item: '',
      back: null,
      stackKey: '',
      stack: [],
      stackTop: 0, // m above the feet: the top of what they carry (the name tag sits over it)
      // pose smoothing
      target: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
      vel: { x: 0, y: 0, z: 0 },
      sampleAt: now(),
      pos: { x: p.x, y: p.y, z: p.z },
      yaw: p.yaw,
      grounded: p.grounded,
      airVy: 0,
      d: 0,
      aura: false,
      dead: false,
    }
    ent.group.position.set(p.x, p.y, p.z)
    ent.group.rotation.y = p.yaw
    scene.add(ent.group)
    setAvatar(ent, buildDefaultCharacter()) // shown at once; the real rig replaces it
    ent.back = mountBackItem(ent.group, () => ent.item)
    dress(ent, p.outfit)
    return ent
  }

  function setAvatar(ent, next) {
    if (ent.avatar) ent.group.remove(ent.avatar)
    disposeAnimator(ent.animator)
    ent.avatar = next
    ent.group.add(next)
    ent.animator = makeAnimator(next)
  }

  // Loads a fresh rig and dresses it with the outfit key (the kit hands back null when it cannot:
  // the plain rig stays). Only the newest request lands.
  async function dress(ent, key) {
    ent.outfit = key
    const mine = ++ent.gen
    const group = await loadBaseCharacter()
    if (ent.dead || mine !== ent.gen) return
    const handle = key && canDress(key) ? await dressCharacter(THREE, GLTFLoader, group, key) : null
    if (ent.dead || mine !== ent.gen) {
      handle?.dispose?.()
      return
    }
    const old = ent.kit
    ent.kit = handle
    setAvatar(ent, group)
    old?.dispose?.()
  }

  function outfitChanged(ent, key) {
    ent.outfit = key
    const mine = ent.gen
    if (ent.kit && key) {
      ent.kit.update(key).then((ok) => {
        if (!ok && !ent.dead && mine === ent.gen) dress(ent, key)
      }, () => dress(ent, key))
    } else dress(ent, key)
  }

  function destroy(ent) {
    ent.dead = true
    ent.gen++
    ent.kit?.dispose?.()
    disposeAnimator(ent.animator)
    clearStack(ent)
    ent.tag?.material.map?.dispose()
    ent.tag?.material.dispose()
    ent.group.removeFromParent()
  }

  // --- Name tag ---------------------------------------------------------------------
  function setName(ent, name) {
    ent.name = name
    if (ent.tag) {
      ent.group.remove(ent.tag)
      ent.tag.material.map?.dispose()
      ent.tag.material.dispose()
    }
    ent.tag = label(name || 'Player', 0.62, { color: '#ffffff', outline: '#10162a', outlineWidth: 14 })
    ent.tag.renderOrder = 5
    ent.tag.position.set(0, PLAYER_DIMS.height + 0.75, 0)
    ent.group.add(ent.tag)
  }

  // --- Carried brainrots, overhead (the layout of hub/carry.js) ----------------------
  function clearStack(ent) {
    for (const s of ent.stack) s.c.group.removeFromParent()
    ent.stack.length = 0
    ent.stackKey = ''
    ent.stackTop = 0
  }
  function syncStack(ent, p) {
    const list = parseBrainrots(p.stack).filter(Boolean).slice(0, Math.min(NET.stackShown, p.carrying))
    const key = list.map((d) => `${d.species}:${d.variant}`).join(',')
    if (key === ent.stackKey) return
    clearStack(ent)
    ent.stackKey = key
    let y = HOLD_Y
    for (const d of list) {
      const c = buildCreature(d.species, d.variant, Math.floor(Math.random() * 1000))
      const k = Math.min(0.85, HOLD_SIZE / c.height)
      c.group.scale.setScalar(k)
      c.group.position.set(0, y, 0)
      ent.group.add(c.group)
      ent.stack.push({ c, aura: makeAura(fx, c), y })
      ent.stackTop = y + c.height * k
      y += c.height * k * 0.82
    }
  }

  // --- Pose smoothing --------------------------------------------------------------
  function readPose(ent, p, t) {
    const T = ent.target
    if (Math.abs(p.x - T.x) + Math.abs(p.y - T.y) + Math.abs(p.z - T.z) + Math.abs(p.yaw - T.yaw) > 1e-4) {
      const dt = Math.max(0.05, t - ent.sampleAt)
      const jump = Math.hypot(p.x - T.x, p.y - T.y, p.z - T.z)
      if (jump > NET.remoteSnap) {
        ent.vel.x = ent.vel.y = ent.vel.z = 0
        ent.pos.x = p.x
        ent.pos.y = p.y
        ent.pos.z = p.z
      } else {
        ent.vel.x = (p.x - T.x) / dt
        ent.vel.y = (p.y - T.y) / dt
        ent.vel.z = (p.z - T.z) / dt
      }
      T.x = p.x
      T.y = p.y
      T.z = p.z
      T.yaw = p.yaw
      ent.sampleAt = t
    }
  }

  function move(ent, p, dt, t) {
    const age = t - ent.sampleAt
    const stale = age > NET.remoteStale
    const lead = stale ? 0 : Math.min(age, NET.remoteLead)
    const T = ent.target
    const k = 1 - Math.exp(-NET.remoteEase * dt)
    ent.pos.x += (T.x + (stale ? 0 : ent.vel.x * lead) - ent.pos.x) * k
    ent.pos.y += (T.y + (stale ? 0 : ent.vel.y * lead) - ent.pos.y) * k
    ent.pos.z += (T.z + (stale ? 0 : ent.vel.z * lead) - ent.pos.z) * k
    ent.yaw = wrap(ent.yaw + wrap(T.yaw - ent.yaw) * k)
    ent.group.position.set(ent.pos.x, ent.pos.y, ent.pos.z)
    ent.group.rotation.y = ent.yaw
    return stale
  }

  // --- Effects ------------------------------------------------------------------------
  function effects(ent, p, vy) {
    const near = ent.d < NET.remoteFxRange
    const S = NET.remoteFxScale
    const { x, y, z } = ent.pos
    if (ent.grounded && !p.grounded) {
      if (near && vy > 3) {
        const k = Math.min(1, vy / 40)
        fx.burst(x, y + 0.1, z, { spread: 'disc', count: (8 + k * 24) * S, colors: ['#ffffff', '#d8ffd0'], speed: [1.5 + k * 3, 3 + k * 6], life: [0.25, 0.45 + k * 0.3], size: [0.3, 0.5 + k * 0.4], drag: 4, grow: 1.5 })
        if (vy > 12) fx.ring(x, y + 0.06, z, { color: '#bfe6ff', r0: 0.4, r1: 2 + k * 4, life: 0.4 })
      }
    } else if (!ent.grounded && p.grounded) {
      const impact = -ent.airVy
      if (near && impact > 7) {
        const k = Math.min(1, impact / 40)
        fx.burst(x, y + 0.1, z, { spread: 'ring', count: (14 + k * 26) * S, colors: ['#f4ffe8', '#c8f5a8'], speed: [3 + k * 4, 6 + k * 8], life: [0.3, 0.55 + k * 0.4], size: [0.35, 0.6 + k * 0.5], drag: 5, grow: 1.6 })
        fx.ring(x, y + 0.06, z, { color: '#ffffff', r0: 0.3, r1: 2.4 + k * 5, life: 0.4 + k * 0.3 })
      }
    }
    if (!p.grounded) ent.airVy = vy
    ent.grounded = p.grounded
  }

  // --- Roster -> bases ---------------------------------------------------------------
  const baseKeys = new Map() // seat -> last pushed key
  let baseScan = 0
  function syncBases(roster) {
    const seen = new Set()
    for (const [, p] of roster) {
      seen.add(p.seat)
      const key = `${p.username}|${p.unlocked}|${p.slots}`
      if (baseKeys.get(p.seat) === key) continue
      baseKeys.set(p.seat, key)
      hub.bases.setOwner(p.seat, p.username || 'Player')
      hub.bases.setSlots(p.seat, parseBrainrots(p.slots), p.unlocked)
    }
    for (const seat of [...baseKeys.keys()]) {
      if (seen.has(seat) || baseKeys.get(seat) === '') continue
      baseKeys.set(seat, '')
      hub.bases.setOwner(seat, '')
      hub.bases.setSlots(seat, [], 0)
    }
  }

  // --- Frame ---------------------------------------------------------------------------
  let pick = 0
  const cam = camera.position
  return {
    get count() {
      return entities.size
    },
    update(dt, elapsed) {
      const t = now()
      const roster = remoteRoster()
      baseScan -= dt
      if (baseScan <= 0) {
        baseScan = 0.4
        syncBases(roster)
      }

      // Who is drawn: the nearest `max` posed players in range (the ones already drawn get a few
      // metres of grace, so two equally near players do not swap every half second).
      const me = player.renderPosition
      const posed = new Map()
      for (const [id, p] of roster) if (p.posed) posed.set(id, p)
      pick -= dt
      if (pick <= 0) {
        pick = 0.5
        const rows = []
        for (const [id, p] of posed) {
          const d = Math.hypot(p.x - me.x, p.y - me.y, p.z - me.z)
          if (d < NET.remoteRange) rows.push({ id, d: d - (entities.has(id) ? 6 : 0) })
        }
        const keep = new Set(nearest(rows).slice(0, max).map((r) => r.id))
        for (const [id, ent] of entities) {
          if (!keep.has(id)) {
            destroy(ent)
            entities.delete(id)
          }
        }
        for (const id of keep) if (!entities.has(id)) entities.set(id, create(id, posed.get(id)))
      }

      const live = []
      for (const [id, ent] of entities) {
        const p = posed.get(id)
        if (!p) {
          // left the room (or its session was replaced)
          destroy(ent)
          entities.delete(id)
          continue
        }
        ent.p = p
        const name = p.username || 'Player'
        if (name !== ent.name) setName(ent, name)
        if (p.outfit !== ent.outfit) outfitChanged(ent, p.outfit)
        ent.item = p.item
        readPose(ent, p, t)
        const stale = move(ent, p, dt, t)
        ent.d = Math.hypot(ent.pos.x - me.x, ent.pos.y - me.y, ent.pos.z - me.z)
        const vy = stale ? 0 : Math.max(-60, Math.min(60, ent.vel.y))
        effects(ent, p, vy)
        const speed = stale ? 0 : p.speed
        ent.animator?.update(dt, { grounded: p.grounded, speed, verticalVelocity: vy, turn: 0, carry: p.carrying > 0 })
        ent.back?.update(elapsed, dt)
        syncStack(ent, p)
        live.push(ent)

        // The tag rides above the head, or above the stack they carry; it fades with the camera's distance.
        if (ent.tag) {
          ent.tag.position.y = Math.max(PLAYER_DIMS.height + 0.75, ent.stackTop + 0.55)
          const c = Math.hypot(ent.pos.x - cam.x, ent.pos.y + 2 - cam.y, ent.pos.z - cam.z)
          const a = 1 - Math.min(1, Math.max(0, (c - tagRange[0]) / (tagRange[1] - tagRange[0])))
          ent.tag.material.opacity = a
          ent.tag.visible = a > 0.01
        }
      }

      // Overhead brainrots bounce with the stride; rare ones shine for the nearest few players.
      live.sort((a, b) => a.d - b.d)
      live.forEach((ent, i) => {
        const moving = ent.p.speed > 1 && ent.p.grounded
        const bob = moving ? Math.abs(Math.sin(elapsed * 9)) * 0.08 : 0
        const sway = ent.p.grounded ? Math.sin(elapsed * 4.5) * Math.min(1, ent.p.speed / 8) * 0.08 : 0
        ent.stack.forEach((s, k) => {
          s.c.group.position.y = s.y + bob * (1 + k * 0.4)
          s.c.group.rotation.z = sway * (1 + k * 0.5)
          if (ent.d < NET.remoteFxRange) s.c.update(elapsed, dt)
          s.aura(dt, i < auraMax && ent.d < NET.remoteFxRange)
        })
      })
    },
  }
}
