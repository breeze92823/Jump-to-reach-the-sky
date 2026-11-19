// Rewards shared by the Playtime / Daily windows and chests: describing a
// reward for its card, granting it (money flies into the counter, brainrots go
// to a free base slot, your hands, or are sold if there is no room) and the
// chest opening show (shake, burst, rays, the prize card flipping in).
import { CHESTS, CREATURES, ITEMS, LUCKY_BLOCKS, RARITIES, STORE, VARIANTS, ZONES } from '../config.js'
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

  // --- Lucky Blocks -----------------------------------------------------------------------------
  // A drop rolled from a tier. Brainrots come from the zone `ahead` of your best one; the rank (0..4,
  // the reveal's grandeur) grows with how far ahead it is and how rare its variant is.
  const VARIANT_ORDER = Object.keys(VARIANTS)
  const TOP = ZONES.length - 1
  const pickWeighted = (drops) => {
    let r = Math.random() * drops.reduce((s, d) => s + d.weight, 0)
    return drops.find((x) => (r -= x.weight) <= 0) ?? drops[0]
  }
  function rollLucky(tier) {
    const d = pickWeighted(LUCKY_BLOCKS.tiers[tier].drops)
    if (d.kind !== 'brainrot') return { ...d, rank: d.kind === 'money' ? 0 : 1 }
    const zi = Math.min(TOP, game.bestZone + d.ahead)
    const zone = ZONES[zi]
    const species = zone.species[Math.floor(Math.random() * zone.species.length)]
    let variant = rollVariant(d.luck * zone.luck)
    if (d.minVariant && VARIANT_ORDER.indexOf(variant) < VARIANT_ORDER.indexOf(d.minVariant)) variant = d.minVariant
    const vr = VARIANT_ORDER.indexOf(variant)
    const ahead = zi - game.bestZone
    return { kind: 'brainrot', species, variant, ahead, rank: Math.min(4, ahead * 2 + (vr >= 1 ? 1 : 0) + (vr >= 3 ? 1 : 0)) }
  }
  // Odds list for a tier's "i" button (brainrot lines name the rarity they give you right now).
  function luckyOdds(tier) {
    const drops = LUCKY_BLOCKS.tiers[tier].drops
    const total = drops.reduce((s, d) => s + d.weight, 0)
    return drops.map((d) => {
      const p = (d.weight / total) * 100
      const pct = `${p < 1 ? p.toFixed(1) : Math.round(p)}%`
      let what = d.kind === 'money' ? 'Cash' : d.kind === 'jump' ? 'Jump Power' : d.kind === 'boost' ? STORE.boosts[d.boost].name : ''
      if (d.kind === 'brainrot') {
        const zi = Math.min(TOP, game.bestZone + d.ahead)
        const ahead = zi - game.bestZone
        what = `${rarityHtml(ZONES[zi].rarity)} brainrot${d.minVariant ? ` (${VARIANT_NAMES[d.minVariant]}+)` : ''}${ahead === 1 ? ' <b class="ahead">next zone!</b>' : ahead > 1 ? ` <b class="ahead">${ahead} zones ahead!</b>` : ''}`
      }
      return { pct, what }
    })
  }

  const TEASE = ['#fff3b0', '#8dff7a', '#c79aff', '#ffd23a', '#ff7af2']
  // The show: the block drops in, charges up over four hits (sparks rushing in, the glow
  // turning the colour of what is inside on the last one), cracks into shards, then the prize.
  function openLucky(tier) {
    return new Promise((resolve) => {
      const T = LUCKY_BLOCKS.tiers[tier]
      const d = rollLucky(tier)
      const f = { ...face(d), rank: d.rank }
      const ov = document.createElement('div')
      ov.className = `chest-show lucky-show lb-${tier} rank-${d.rank}`
      ov.style.setProperty('--tease', TEASE[d.rank])
      const art = ICONS.luckyBlock(tier)
      const shards = [
        ['polygon(0 0, 52% 0, 46% 48%, 0 55%)', -1, -1],
        ['polygon(52% 0, 100% 0, 100% 50%, 46% 48%)', 1, -1],
        ['polygon(0 55%, 46% 48%, 55% 100%, 0 100%)', -1, 1],
        ['polygon(46% 48%, 100% 50%, 100% 100%, 55% 100%)', 1, 1],
      ]
      const banner = d.rank >= 4 ? 'JACKPOT!' : d.rank >= 3 ? 'AMAZING!' : ''
      ov.innerHTML = `<div class="rays"></div><div class="rays rays2"></div><div class="glow"></div><div class="chest lblock">${art}</div>${shards.map(([c]) => `<div class="shard" style="clip-path:${c}">${art}</div>`).join('')}<div class="prize r${f.rank}"><div class="p-art">${f.art}</div><div class="p-title ol">${f.title}</div>${f.tags ? `<div class="p-tags">${f.tags}</div>` : ''}${d.ahead ? `<div class="p-ahead ol">${d.ahead > 1 ? `${d.ahead} zones ahead!` : 'From the next zone!'}</div>` : ''}${f.sub ? `<div class="p-sub ol">${f.sub}</div>` : ''}</div>${banner ? `<div class="jackpot ol">${banner}</div>` : ''}<div class="tap ol">Tap to collect!</div><div class="cname ol">${T.name}</div>`
      document.body.appendChild(ov)
      const block = ov.querySelector('.lblock')
      const prize = ov.querySelector('.prize')
      let stage = 0
      const timers = []
      const later = (ms, fn) => timers.push(setTimeout(fn, ms))
      // Sparks rushing into the block from all around.
      const sparks = (n, color) => {
        for (let i = 0; i < n; i++) {
          const s = document.createElement('i')
          s.className = 'lspark'
          s.style.background = color
          ov.append(s)
          const a = Math.random() * Math.PI * 2
          const r = 16 + Math.random() * 16
          s.animate(
            [
              { transform: `translate(${Math.cos(a) * r}em, ${Math.sin(a) * r}em) scale(1.2)`, opacity: 0 },
              { opacity: 1, offset: 0.3 },
              { transform: 'translate(0, 0) scale(0.3)', opacity: 0.2 },
            ],
            { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(0.55, 0, 0.9, 0.5)' },
          ).onfinish = () => s.remove()
        }
      }
      const HITS = [300, 700, 1050, 1350]
      HITS.forEach((ms, i) => {
        later(ms, () => {
          sfx.luckyCharge(i)
          const k = 1 + i * 0.05
          block.animate([{ transform: 'rotate(0) scale(1)' }, { transform: `rotate(${i % 2 ? 10 : -10}deg) scale(${k + 0.1})` }, { transform: `rotate(${i % 2 ? -6 : 6}deg) scale(${k})` }, { transform: `rotate(0) scale(${k})` }], { duration: 280, fill: 'forwards' })
          sparks(6 + i * 4, i === HITS.length - 1 ? TEASE[d.rank] : '#fff6c8')
          ov.style.setProperty('--charge', String((i + 1) / HITS.length))
          if (i === HITS.length - 1) ov.classList.add('tease')
        })
      })
      const open = () => {
        if (stage > 0) return
        stage = 1
        timers.forEach(clearTimeout)
        ov.classList.add('tease', 'broken')
        sfx.luckyBreak(d.rank)
        juice.flash(d.rank >= 3 ? TEASE[d.rank] : '#ffffff', 450 + d.rank * 80)
        ov.querySelectorAll('.shard').forEach((s, i) => {
          const [, dx, dy] = shards[i]
          s.animate(
            [
              { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
              { transform: `translate(${dx * (14 + Math.random() * 8)}em, ${dy * (10 + Math.random() * 8) + 8}em) rotate(${dx * (40 + Math.random() * 60)}deg)`, opacity: 0 },
            ],
            { duration: 700, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)', fill: 'forwards' },
          )
        })
        juice.confetti(block, { count: 40 + d.rank * 18, power: 1.3 + d.rank * 0.2 })
        juice.ring(block, TEASE[d.rank], 420 + d.rank * 60)
        if (d.rank >= 3) {
          ov.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-1.2em, 0.6em)' }, { transform: 'translate(1em, -0.8em)' }, { transform: 'translate(-0.6em, 0.4em)' }, { transform: 'translate(0,0)' }], { duration: 380 })
          later(500, () => sfx.jackpot())
          for (let k = 1; k <= d.rank - 1; k++) later(300 + k * 380, () => juice.confetti({ x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * 0.3 }, { count: 30, power: 1.5 }))
        }
        later(280, () => {
          prize.classList.add('show')
          ov.classList.add('revealed')
          sfx.reveal(f.rank)
        })
        later(950, () => (stage = 2))
      }
      const collect = () => {
        if (stage < 2) return
        stage = 3
        const at = prize.getBoundingClientRect()
        const pt = { x: at.left + at.width / 2, y: at.top + at.height / 2 }
        ov.classList.add('out')
        setTimeout(() => ov.remove(), 260)
        bus.emit('luckyCollect', { tier, rank: d.rank })
        grant(d, pt).then(resolve)
      }
      later(HITS[HITS.length - 1] + 450, open)
      ov.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        if (stage === 0) open()
        else collect()
      })
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

  // --- Fusion ---------------------------------------------------------------------------------------
  // The claim show: three portraits of the old variant whirl around the centre, spiralling in faster
  // and faster (a swirl per lap, sparks rushing in), implode in a flash of the new variant's colour,
  // and the prize card with the fused brainrot pops out. Resolves once it is collected (granted).
  const FUSE_RANK = { golden: 1, diamond: 2, rainbow: 3, lava: 4 }
  const FUSE_COLOR = { golden: '#ffd23a', diamond: '#7ff0ff', rainbow: '#ff7af2', lava: '#ff7a1a' }
  function openFusion({ species, from, to }) {
    return new Promise((resolve) => {
      const rank = FUSE_RANK[to] ?? 1
      const d = { kind: 'brainrot', species, variant: to }
      const f = { ...face(d), rank }
      const color = FUSE_COLOR[to] ?? '#ffffff'
      const banner = rank >= 4 ? 'LAVA FUSION!' : rank >= 3 ? 'AMAZING!' : ''
      const src = thumb(species, from)
      const ov = document.createElement('div')
      ov.className = `chest-show lucky-show fusion-show rank-${rank}`
      ov.style.setProperty('--tease', color)
      ov.innerHTML = `<div class="rays"></div><div class="rays rays2"></div><div class="glow"></div><div class="fu-core"></div>${[0, 1, 2].map(() => `<div class="fu-orb"><img src="${src}" alt=""></div>`).join('')}<div class="prize r${rank}"><div class="p-art">${f.art}</div><div class="p-title ol">${f.title}</div>${f.tags ? `<div class="p-tags">${f.tags}</div>` : ''}<div class="p-ahead ol">Fused from 3 ${VARIANT_NAMES[from] ?? 'Normal'}!</div></div>${banner ? `<div class="jackpot ol">${banner}</div>` : ''}<div class="tap ol">Tap to collect!</div><div class="cname ol">Fusion!</div>`
      document.body.appendChild(ov)
      const prize = ov.querySelector('.prize')
      const orbs = [...ov.querySelectorAll('.fu-orb')]
      const DUR = 1700
      // Spiral keyframes: angle grows ever faster, radius shrinks to nothing.
      const anims = orbs.map((o, i) => {
        const frames = []
        for (let k = 0; k <= 24; k++) {
          const p = k / 24
          const a = (i / 3) * Math.PI * 2 + p * p * Math.PI * 5
          const r = 14 * (1 - p * p)
          frames.push({ transform: `translate(${Math.cos(a) * r}em, ${Math.sin(a) * r}em) scale(${1 - p * 0.55}) rotate(${p * 540}deg)` })
        }
        return o.animate(frames, { duration: DUR, easing: 'linear', fill: 'forwards' })
      })
      let stage = 0
      const timers = []
      const later = (ms, fn) => timers.push(setTimeout(fn, ms))
      const sparks = (n, c) => {
        for (let i = 0; i < n; i++) {
          const s = document.createElement('i')
          s.className = 'lspark'
          s.style.background = c
          ov.append(s)
          const a = Math.random() * Math.PI * 2
          const r = 16 + Math.random() * 14
          s.animate([{ transform: `translate(${Math.cos(a) * r}em, ${Math.sin(a) * r}em) scale(1.2)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translate(0, 0) scale(0.3)', opacity: 0.2 }], { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(0.55, 0, 0.9, 0.5)' }).onfinish = () => s.remove()
        }
      }
      ;[0, 450, 850, 1200].forEach((ms, i) =>
        later(ms, () => {
          sfx.fuseSwirl(i)
          sparks(5 + i * 4, i === 3 ? color : '#e6d4ff')
          ov.style.setProperty('--charge', String((i + 1) / 4))
          if (i === 3) ov.classList.add('tease')
        }),
      )
      const open = () => {
        if (stage > 0) return
        stage = 1
        timers.forEach(clearTimeout)
        anims.forEach((a) => a.finish())
        ov.classList.add('tease', 'broken')
        sfx.fuseMerge(rank)
        juice.flash(color, 450 + rank * 80)
        const core = ov.querySelector('.fu-core')
        juice.confetti(core, { count: 40 + rank * 16, power: 1.3 + rank * 0.2 })
        juice.ring(core, color, 420 + rank * 60)
        if (rank >= 3) {
          ov.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-1.2em, 0.6em)' }, { transform: 'translate(1em, -0.8em)' }, { transform: 'translate(0,0)' }], { duration: 340 })
          later(500, () => sfx.jackpot())
        }
        later(300, () => {
          prize.classList.add('show')
          ov.classList.add('revealed')
          sfx.reveal(rank)
        })
        later(950, () => (stage = 2))
      }
      const collect = () => {
        if (stage < 2) return
        stage = 3
        const at = prize.getBoundingClientRect()
        ov.classList.add('out')
        setTimeout(() => ov.remove(), 260)
        grant(d, { x: at.left + at.width / 2, y: at.top + at.height / 2 }).then(resolve)
      }
      later(DUR, open)
      ov.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        if (stage === 0) open()
        else collect()
      })
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

  return { describe, grant, openChest, odds, giveBrainrot, cashIn, cashFor, openLucky, luckyOdds, openFusion }
}

