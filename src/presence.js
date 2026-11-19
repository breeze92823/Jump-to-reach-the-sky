// Tells the other players in the room what this one is doing and looks like (the sending half of
// presence; remotePlayers.js is the drawing half, backend src/presence.ts bounds both).
//  - `pose` ~NET.poseEvery: where the feet are, which way the character faces, how fast it moves,
//    whether it is on the ground and how many brainrots it holds overhead. A player who stands
//    still only re-sends every NET.poseStill s.
//  - `look` when something changed (at most every NET.lookEvery s): the equipped back item, the
//    Bloxity outfit key (an id, never a URL), the carried stack and the base's pedestals.
import { NET } from './config.js'
import { getOutfitKey } from './bloxity.js'
import { game } from './game/state.js'
import { net, sendLook, sendPose } from './net.js'
import { player } from './player.js'

const SLOTS_SHOWN = 12 // backend BASE_SHOWN_MAX
const brainrot = (d) => (d ? { species: d.species, variant: d.variant } : null)

export function createPresence({ carry, isSignedIn }) {
  let poseT = 0
  let lookT = 0
  let still = 0
  let lastKey = ''
  let lastJoin = -1
  const last = { x: NaN, y: NaN, z: NaN, yaw: NaN, grounded: null, carrying: -1 }

  function look() {
    return {
      item: game.equipped || '',
      outfit: isSignedIn() ? getOutfitKey() : '',
      stack: carry.list.slice(0, NET.stackShown).map(brainrot),
      slots: game.slots.slice(0, SLOTS_SHOWN).map(brainrot),
      unlocked: game.slotsUnlocked,
    }
  }

  return {
    update(dt) {
      if (!net.connected) return
      poseT -= dt
      lookT -= dt
      still += dt
      if (poseT <= 0) {
        poseT = NET.poseEvery
        const p = player.renderPosition
        const yaw = player.facing
        const carrying = carry.count
        const moved = Math.abs(p.x - last.x) > 0.02 || Math.abs(p.y - last.y) > 0.02 || Math.abs(p.z - last.z) > 0.02 || Math.abs(yaw - last.yaw) > 0.02
        if (moved || player.grounded !== last.grounded || carrying !== last.carrying || still >= NET.poseStill) {
          still = 0
          Object.assign(last, { x: p.x, y: p.y, z: p.z, yaw, grounded: player.grounded, carrying })
          sendPose({ x: p.x, y: p.y, z: p.z, yaw, speed: Math.hypot(player.velocity.x, player.velocity.z), grounded: player.grounded, carrying })
        }
      }
      if (lookT <= 0) {
        lookT = NET.lookEvery
        const l = look()
        const key = JSON.stringify(l)
        if (key !== lastKey || net.joins !== lastJoin) {
          lastKey = key
          lastJoin = net.joins
          still = NET.poseStill // a fresh session: pose goes out with it
          sendLook(l)
        }
      }
    },
  }
}
