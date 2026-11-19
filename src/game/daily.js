// Daily Rewards clock: one claim per DAILY.cooldown hours, a missed streak (DAILY.streakBreak hours)
// restarts at Day 1. For a signed-in player the SERVER keeps the clock (backend daily.ts; net.js
// copies it into game.dailyDay / game.dailyAt) so a changed device clock unlocks nothing, and a
// claim only counts once the server says ok. Guests, and the game with no server, run the same
// rules on this device's clock (saved in localStorage).
// The Claim All Pass (game.dailyPass) skips the wait for the rest of the week and claims it at once.
import { DAILY } from '../config.js'
import { accountDaily, net, requestDailyClaim, serverNow } from '../net.js'
import { game, save } from './state.js'

const HOUR = 3600 * 1000
export const DAILY_CYCLE = DAILY.days.length

const cooldownMs = () => (accountDaily() && net.dailyCooldownMs ? net.dailyCooldownMs : DAILY.cooldown * HOUR)
const now = () => (accountDaily() ? serverNow() : Date.now())

// Seconds until the next claim is allowed (0 = ready).
export const dailyWait = () => (game.dailyAt ? Math.max(0, game.dailyAt + cooldownMs() - now()) / 1000 : 0)
export const dailyReady = () => dailyWait() <= 0

// Local streak bookkeeping (the server does its own); true when the streak restarted.
export function checkStreak() {
  if (accountDaily()) return false
  if (game.dailyAt && game.dailyDay > 0 && Date.now() - game.dailyAt > DAILY.streakBreak * HOUR) {
    game.dailyDay = 0
    game.dailyMilestones = {}
    return true
  }
  return false
}

// Claims the next day (all: the rest of the week). Resolves { ok, count, reason? }: on ok,
// game.dailyDay already moved on by `count` and the caller grants those days' rewards.
export async function claimDaily(all = false) {
  if (accountDaily()) return requestDailyClaim(all)
  checkStreak()
  const week = game.dailyDay % DAILY_CYCLE
  const ready = dailyReady()
  let count = 0
  if (all) {
    if (game.dailyPass && (ready || week !== 0)) count = DAILY_CYCLE - week
  } else if (ready || (game.dailyPass && week !== 0)) count = 1
  if (!count) return { ok: false, reason: 'locked' }
  game.dailyDay += count
  game.dailyAt = Date.now()
  save()
  return { ok: true, count }
}
