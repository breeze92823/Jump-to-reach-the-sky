// Rewards shared by the Playtime / Daily windows and chests: describing a
// reward for its card, granting it (money flies into the counter, brainrots go
// to a free base slot, your hands, or are sold if there is no room) and the
// chest opening show (shake, burst, rays, the prize card flipping in).
import { CHESTS, CREATURES, ITEMS, RARITIES, STORE } from '../config.js'
import { addBoost, bus, earn, game, incomeOf, nextZoneReq, rewardBrainrot, rollVariant, sellValue, totalIncome } from '../game/state.js'
import { RARITY_COLORS, SPECIES_NAMES, VARIANT_NAMES } from '../hub/creatures.js'
import { short } from '../hub/paint.js'
import { sfx } from '../audio/hub.js'
import { ICONS } from './icons.js'
import * as juice from './juice.js'

const money = (n) => `$${short(n)}`
export const rarityRank = (r) => Math.max(0, RARITIES.indexOf(r))
// Variant word; Rainbow gets a colour (and a little hop) per letter.
const RAINBOW = ['#ff3b3b', '#ff9a1f', '#ffe83a', '#4dff4a', '#2fd8ff', '#3a7cff', '#b04aff']
export const variantHtml = (v) => {
  if (v === 'normal') return ''
  if (v === 'rainbow') return `<span class="vt v-rainbow">${[...VARIANT_NAMES.rainbow].map((c, i) => `<i style="color:${RAINBOW[i % RAINBOW.length]};animation-delay:${i * 0.08}s">${c}</i>`).join('')}</span>`
  return `<span class="vt v-${v}">${VARIANT_NAMES[v]}</span>`
}
export const rarityHtml = (r) => `<span class="rt" style="color:${RARITY_COLORS[r] ?? '#fff'}">${r}</span>`
const potion = { potionBlue: ICONS.orb('#3fa0ff', '#bfe4ff'), potionGreen: ICONS.orb('#3fd04a', '#c8ffc0'), potionPink: ICONS.orb('#c84aff', '#f0c8ff') }

export function createRewards({ hub, thumb, toast, moneyEl, jumpEl }) {
  // --- Amounts (live: they grow with your base) -------------------------------------
  const cashFor = (seconds, min) => Math.round(Math.max(min, totalIncome() * seconds))
  const jumpFor = (share) => Math.max(5, Math.round(nextZoneReq() * share))

  // A reward definition (config PLAYTIME / DAILY entry or a chest drop) -> card face.
  function describe(def) {
    switch (def.kind) {
      case 'money':
        return { title: money(cashFor(def.seconds, def.min)), art: ICONS.cashStack, sub: def.title ?? '' }
      case 'boost':
        return { title: def.title ?? STORE.boosts[def.boost].name, art: potion[def.art] ?? ICONS.orb('#ff7af2', '#ffd0f6'), sub: `${def.boostMinutes ?? def.minutes} min` }
      case 'chest':
        return { title: 'Chest', art: ICONS.chest(def.chest), info: def.chest }
      case 'item': {
        const it = ITEMS.find((i) => i.id === def.item)
        return { title: it.name, art: `<img src="${thumb.item(it.id)}" alt="">`, sub: `Jump Power +${short(it.jump)}` }
      }
      case 'brainrot':
        return {
          title: SPECIES_NAMES[def.species],
          art: `<img src="${thumb(def.species, def.variant)}" alt="">`,
          tags: `${variantHtml(def.variant)}${rarityHtml(CREATURES[def.species].rarity)}${def.best ? `<span class="best">${Math.round(def.best * 100)}% of BEST</span>` : ''}`,
          big: true,
        }
      case 'pass':
        return { title: 'Claim All Pass', art: ICONS.ticket }
      default:
        return { title: '?', art: '' }
    }
  }

  // --- Granting ----------------------------------------------------------------------------
  function freeSlot() {
    for (let i = 0; i < game.slotsUnlocked; i++) if (!game.slots[i]) return i
    return -1
  }
  // A brainrot goes to a free pedestal, else your hands, else it is sold.
  function giveBrainrot(data) {
    const i = freeSlot()
    if (i >= 0) {
      game.slots[i] = { ...data, bank: 0 }
      game.index[data.species] ??= {}
      const isNew = !game.index[data.species][data.variant]
      game.index[data.species][data.variant] = true
      if (isNew) bus.emit('discover', data)
      bus.emit('slots')
      return 'slot'
    }
    if (hub.carry.pick(data)) return 'carry'
    const v = sellValue(data)
    earn(v)
    toast(`No room for it! Sold for ${money(v)}.`, 'info')
    return 'sold'
  }
  function cashIn(amount, from) {
    earn(amount)
    let n = 0
    juice.flyTo(from, moneyEl, ICONS.cash, Math.min(10, 4 + Math.round(Math.log10(amount + 1))), () => sfx.coin(n++))
    juice.floatText(from, `+${money(amount)}`, '#7dff4a')
  }

  // Grant a definition (from a card at element `from`). Chests open their show.
  // Returns a promise that resolves when the reward is in.
  function grant(def, from) {
    switch (def.kind) {
      case 'money':
        cashIn(cashFor(def.seconds, def.min), from)
        break
      case 'jump': {
        const j = jumpFor(def.share)
        game.jumpPower += j
        juice.flyTo(from, jumpEl, ICONS.jumper, 6)
        juice.floatText(from, `+${short(j)} Jump Power`, '#5fd0ff')
        break
      }
      case 'boost':
        addBoost(def.boost, def.boostMinutes ?? def.minutes)
        juice.floatText(from, `${STORE.boosts[def.boost].name}!`, '#ff9af2')
        break
      case 'item':
        game.items[def.item] = true
        juice.floatText(from, 'New item!', '#ffd23a')
        toast(`${ITEMS.find((i) => i.id === def.item).name} unlocked! Equip it in the Items Shop.`, 'good')
        break
      case 'brainrot': {
        const data = def.best ? rewardBrainrot(def.species, def.variant, def.best) : { species: def.species, variant: def.variant }
        const where = giveBrainrot(data)
        juice.floatText(from, `+${money(incomeOf(data))}/s`, '#7dff4a')
        if (where === 'slot') toast(`${SPECIES_NAMES[data.species]} is on your base!`, 'good')
        else if (where === 'carry') toast(`${SPECIES_NAMES[data.species]} is in your hands. Take it home!`, 'good')
        break
      }
      case 'pass':
        game.dailyPass = true
        toast('Claim All Pass unlocked!', 'good')
        break
      case 'chest':
        return openChest(def.chest)
    }
    sfx.claim()
    juice.confetti(from, { count: 22 })
    juice.ring(from, '#ffffff')
    return Promise.resolve()
  }

  // --- Chests ---------------------------------------------------------------------------------
  function roll(tier) {
    const drops = CHESTS[tier].drops
    let r = Math.random() * drops.reduce((s, d) => s + d.weight, 0)
    const d = drops.find((x) => (r -= x.weight) <= 0) ?? drops[0]
    if (d.kind !== 'brainrot') return d
    const pool = Object.keys(CREATURES).filter((s) => !CREATURES[s].reward && d.rarities.includes(CREATURES[s].rarity))
    const species = pool[Math.floor(Math.random() * pool.length)]
    return { kind: 'brainrot', species, variant: rollVariant(d.luck) }
  }
  // What the reveal card shows for a rolled drop.
  function face(d) {
    if (d.kind === 'jump') return { title: `+${short(jumpFor(d.share))}`, art: ICONS.jumper, sub: 'Jump Power', rank: 1 }
    const f = describe(d)
    let rank = d.kind === 'boost' ? 1 : 0
    if (d.kind === 'brainrot') rank = Math.min(4, Math.floor(rarityRank(CREATURES[d.species].rarity) / 2) + (d.variant !== 'normal' ? 1 : 0))
    if (d.kind === 'money') f.sub = 'Cash'
    return { ...f, rank }
  }
  // Odds list for the "i" button.
  function odds(tier) {
    const drops = CHESTS[tier].drops
    const total = drops.reduce((s, d) => s + d.weight, 0)
    return drops.map((d) => {
      const pct = `${Math.round((d.weight / total) * 100)}%`
      const what = d.kind === 'money' ? 'Cash' : d.kind === 'jump' ? 'Jump Power' : d.kind === 'boost' ? STORE.boosts[d.boost].name : `${d.rarities.join(' / ')} brainrot`
      return { pct, what }
    })
  }

  // The show: a dark overlay with spinning rays, the chest shaking three times,
  // a flash, then the prize card. Tap (or wait) to collect.
  function openChest(tier) {
    return new Promise((resolve) => {
      const d = roll(tier)
      const f = face(d)
      const ov = document.createElement('div')
      ov.className = `chest-show tier-${tier}`
      ov.innerHTML = `<div class="rays"></div><div class="glow"></div><div class="chest">${ICONS.chest(tier)}</div><div class="prize r${f.rank}"><div class="p-art">${f.art}</div><div class="p-title ol">${f.title}</div>${f.tags ? `<div class="p-tags">${f.tags}</div>` : ''}${f.sub ? `<div class="p-sub ol">${f.sub}</div>` : ''}</div><div class="tap ol">Tap to collect!</div><div class="cname ol">${CHESTS[tier].name}</div>`
      document.body.appendChild(ov)
      const chest = ov.querySelector('.chest')
      const prize = ov.querySelector('.prize')
      let stage = 0
      const timers = []
      const later = (ms, fn) => timers.push(setTimeout(fn, ms))
      for (let i = 0; i < 3; i++) {
        later(250 + i * 380, () => {
          sfx.chestShake(i)
          chest.animate([{ transform: 'rotate(0) scale(1)' }, { transform: `rotate(${i % 2 ? 9 : -9}deg) scale(${1.05 + i * 0.04})` }, { transform: `rotate(${i % 2 ? -6 : 6}deg) scale(1)` }, { transform: 'rotate(0) scale(1)' }], { duration: 300 })
        })
      }
      const open = () => {
        if (stage > 0) return
        stage = 1
        timers.forEach(clearTimeout)
        sfx.chestOpen(['wood', 'red', 'purple'].indexOf(tier))
        juice.flash('#ffffff', 450)
        chest.classList.add('burst')
        juice.confetti(chest, { count: 40 + f.rank * 10, power: 1.4 })
        juice.ring(chest, '#ffe680', 420)
        later(260, () => {
          prize.classList.add('show')
          ov.classList.add('revealed')
          sfx.reveal(f.rank)
        })
        later(900, () => (stage = 2))
      }
      const collect = () => {
        if (stage < 2) return
        stage = 3
        const at = prize.getBoundingClientRect()
        const pt = { x: at.left + at.width / 2, y: at.top + at.height / 2 }
        ov.classList.add('out')
        setTimeout(() => ov.remove(), 260)
        grant(d, pt).then(resolve)
      }
      later(250 + 3 * 380 + 120, open)
      ov.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        if (stage === 0) open()
        else collect()
      })
      // Esc / E also advance (desktop).
      const key = (e) => {
        if (!ov.isConnected) return removeEventListener('keydown', key, true)
        if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
          e.stopImmediatePropagation()
          e.preventDefault()
          if (stage === 0) open()
          else collect()
        }
      }
      addEventListener('keydown', key, true)
    })
  }

  return { describe, grant, openChest, odds, giveBrainrot, cashIn, cashFor }
}

