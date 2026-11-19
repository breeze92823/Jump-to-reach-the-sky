// Portal emotes (docs.bloxity.io): the portal's emote wheel sends a catalogue id, the catalogue
// holds clips { len (s), loop, tracks: { bone: [[t, xDeg, yDeg, zDeg], ...] } }. Values are degree
// deltas over the pose, euler XYZ, smoothstep between keys, clamped outside the key range (wrapped
// when the clip loops). A clip blends in over ~0.1 s, stops as soon as the player moves, ignores
// bones the rig does not have and never throws.
import { Euler, Quaternion } from 'three'

const DEG = Math.PI / 180
const BLEND_IN = 0.1
const euler = new Euler()
const delta = new Quaternion()

// [x, y, z] of one track at time t.
export function sampleTrack(keys, t) {
  if (!Array.isArray(keys) || !keys.length) return null
  if (t <= keys[0][0] || keys.length === 1) return [keys[0][1], keys[0][2], keys[0][3]]
  const last = keys[keys.length - 1]
  if (t >= last[0]) return [last[1], last[2], last[3]]
  let i = 1
  while (keys[i][0] < t) i++
  const a = keys[i - 1]
  const b = keys[i]
  let s = (t - a[0]) / Math.max(1e-6, b[0] - a[0])
  s = s * s * (3 - 2 * s)
  return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s]
}

export function createEmotes() {
  let clip = null
  let time = 0
  const bones = new WeakMap() // avatar -> { name: bone }

  const boneOf = (avatar, name) => {
    let map = bones.get(avatar)
    if (!map) bones.set(avatar, (map = {}))
    if (!(name in map)) map[name] = avatar.getObjectByName(name) ?? null
    return map[name]
  }

  return {
    get playing() {
      return !!clip
    },
    play(next) {
      if (!next || !(next.len > 0) || !next.tracks) return
      clip = next
      time = 0
    },
    stop() {
      clip = null
    },
    // After the animator wrote this frame's pose: lays the clip on top of it.
    update(avatar, dt, moving) {
      if (!clip || !avatar) return
      if (moving) {
        clip = null
        return
      }
      time += dt
      if (!clip.loop && time >= clip.len) {
        clip = null
        return
      }
      const at = clip.loop ? time % clip.len : time
      const k = Math.min(1, time / BLEND_IN)
      for (const name in clip.tracks) {
        const bone = boneOf(avatar, name)
        const v = bone && sampleTrack(clip.tracks[name], at)
        if (!v) continue
        euler.set(v[0] * DEG * k, v[1] * DEG * k, v[2] * DEG * k, 'XYZ')
        bone.quaternion.multiply(delta.setFromEuler(euler))
      }
    },
  }
}
