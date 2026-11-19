// The lane's terraces, computed once from config ZONES: each zone's floor
// height (its wall rises jumpHeight(req) - margin above the terrace before it)
// and its z extent (south edge = where its wall stands, north = the far edge).
// Level 0 (Common) is the flat start of the lane, level with the hub floor.
import { HUB, JUMP, LANE, ZONES, jumpHeight } from '../config.js'

export const LEVELS = []
{
  let y = 0
  let z = HUB.north
  ZONES.forEach((zone, i) => {
    const rise = i === 0 ? 0 : jumpHeight(zone.req) - LANE.margin
    y += rise
    LEVELS.push({ i, zone, y, rise, south: z, north: z - zone.depth, mid: z - zone.depth / 2 })
    z -= zone.depth
  })
}
export const LANE_END = LEVELS[LEVELS.length - 1].north
export const TOP_Y = LEVELS[LEVELS.length - 1].y

// The terrace under (x, z), or -1 in the hub (south of the start line) / outside the lane.
export function levelAt(x, z) {
  if (z > HUB.north || Math.abs(x) > HUB.laneHalf + 0.5) return -1
  for (const l of LEVELS) if (z <= l.south && z > l.north) return l.i
  return LEVELS.length - 1
}

// 0..1 along the whole lane (for the HUD bar): whole zones plus the share of the current one.
export function laneProgress(x, z) {
  const i = levelAt(x, z)
  if (i < 0) return 0
  const l = LEVELS[i]
  return (i + Math.min(1, Math.max(0, (l.south - z) / (l.south - l.north)))) / LEVELS.length
}

// Smart Jump: the highest a jump needs to go from terrace i (its next wall + a little).
export function smartCap(i) {
  const next = LEVELS[Math.max(0, i) + 1]
  return next ? next.rise + JUMP.smartExtra : JUMP.base + JUMP.smartExtra
}
