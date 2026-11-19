// The game windows modelled on the reference screens (ui/hud.js frames them):
//   Upgrades (Lucky Jumps / Speed / Carry), Items Shop (back items), Sell
//   Brainrots (what you carry), Index (every brainrot x variant by tier, with
//   the collection bonus), Rebirths, Playtime Rewards and Daily Rewards.
// Every price is money (the reference's premium buttons cost money here, a
// slightly high price). Windows refresh a few times a second through
// `refresh`, which only touches the DOM when something actually changed, so
// buttons keep their pressed state and nothing is rebuilt per tick.
import { ASCENDED, BASE_LEVELS, CREATURES, DAILY, ECONOMY, FUSION, INDEX_BONUS, ITEMS, LUCKY_BLOCKS, PLAYTIME, RARITIES, UPGRADES, VARIANTS, ZONES } from '../config.js'
import { fusionGroups, fusionMinutes, fusionPrice, fusionState } from '../game/fusion.js'
import { ascEffect, ascendedUnlocked, ascLevel, ascPerk, ascPrice, baseBuildState, bus, buyAscended, nextBaseLevel, startBaseBuild, canAfford, doRebirth, game, incomeOf, indexBonus, indexFound, luckyPrice, rebirthMults, rebirthReq, rebirthSkipPrice, save, sellValue, spend } from '../game/state.js'
import { DAILY_CYCLE, checkStreak, claimDaily, dailyReady, dailyWait } from '../game/daily.js'
import { RARITY_COLORS, SPECIES_LIST, SPECIES_NAMES, VARIANT_NAMES } from '../hub/creatures.js'
import { short } from '../hub/paint.js'
import { sfx } from '../audio/hub.js'
import { ICONS } from './icons.js'
import { rarityHtml, variantHtml } from './rewards.js'
import * as juice from './juice.js'

const money = (n) => `$${short(n)}`
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const clock = (s) => {
  s = Math.max(0, Math.ceil(s))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}`) + `:${String(ss).padStart(2, '0')}`
}
function h(tag, cls = '', html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const VARIANT_ORDER = Object.keys(VARIANTS)

export function createPanels({ openWindow, closeWindow, btn, thumb, toast, hub, go, showBanner, moneyEl, jumpEl, rewards }) {
  // A money button: price text + an optional "+N" tag; dims when you cannot afford it.
  function priceButton(cls, tag, getPrice, onBuy) {
    const b = btn(`pbtn ${cls}`, `<span class="pv ol"></span>${tag ? `<span class="tag ol">${tag}</span>` : ''}`, () => {
      const price = getPrice()
      if (price === null) return
      if (!canAfford(price)) {
        sfx.ui('error')
        juice.shake(b)
        toast(`You need ${money(price - game.money)} more!`, 'error')
        return
      }
      onBuy(price, b)
    })
    const pv = b.querySelector('.pv')
    let shown = ''
    b.refresh = () => {
      const price = getPrice()
      const text = price === null ? 'MAX' : money(price)
      if (text !== shown) pv.textContent = shown = text
      b.classList.toggle('cant', price !== null && !canAfford(price))
      b.classList.toggle('max', price === null)
    }
    b.refresh()
    return b
  }
  const celebrate = (el, color = '#ffe14a', n = 16) => {
    juice.confetti(el, { count: n })
    juice.ring(el, color)
  }
  // Small "i" popover with a few lines; tap anywhere on it to close.
  function infoPop(parent, title, lines) {
    parent.querySelector('.ipop')?.remove()
    const p = h('div', 'ipop', `<div class="ipop-t ol">${title}</div>${lines.map((l) => `<div class="ipop-l">${l}</div>`).join('')}<div class="ipop-x">Tap to close</div>`)
    p.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      p.remove()
      sfx.ui('close')
    })
    parent.append(p)
    juice.bump(p, 1.06)
  }

  // =========================================================================================
  // Upgrades
  // =========================================================================================
  const speedNext = (n, premium) => {
    const u = UPGRADES.speed
    if (game.speed >= u.max) return null
    n = Math.min(n, u.max - game.speed)
    let sum = 0
    for (let i = 0; i < n; i++) sum += u.base * u.growth ** (game.speed + i - u.start)
    return Math.round(sum * (premium ? u.premium : 1))
  }
  const carryNext = (n, premium) => {
    const u = UPGRADES.carry
    if (game.carryMax >= u.max) return null
    n = Math.min(n, u.max - game.carryMax)
    let sum = 0
    for (let i = 0; i < n; i++) sum += u.base * u.growth ** (game.carryMax + i - u.start)
    return Math.round(sum * (premium ? u.premium : 1))
  }
  function openUpgrades() {
    openWindow('Upgrades', {
      theme: 'blue',
      icon: ICONS.upgrades,
      cls: 'w-upg',
      build(body, w) {
        const info = btn('info-btn', ICONS.info, () =>
          infoPop(body, 'Upgrades', [
            `<b>Lucky Jumps</b>: every jump and training hop has a ${UPGRADES.lucky.chance * 100}% chance to give <b>x${UPGRADES.lucky.mult}</b> Jump Power.`,
            `<b>Speed</b>: walk and sprint faster.`,
            `<b>Carry</b>: hold more brainrots over your head at once.`,
            `Everything costs money you earn in game.`,
          ]),
        )
        w.el.append(info)
        // Lucky Jumps.
        const lucky = h('div', 'urow lucky', `<div class="u-pat">${ICONS.clover}</div><div class="u-left"><div class="u-name ol">Lucky Jumps</div><div class="u-val ol"></div></div><div class="u-right"><div class="u-price ol"></div></div>`)
        const lVal = lucky.querySelector('.u-val')
        const lPrice = lucky.querySelector('.u-price')
        const unlock = btn('pbtn unlock', '<span class="pv ol">Unlock</span>', () => {
          if (game.luckyJumps) return
          if (!spend(UPGRADES.lucky.price)) {
            sfx.ui('error')
            juice.shake(unlock)
            toast(`You need ${money(UPGRADES.lucky.price - game.money)} more!`, 'error')
            return
          }
          game.luckyJumps = true
          sfx.unlock()
          sfx.lucky()
          celebrate(unlock, '#5dff4a', 40)
          juice.flash('#9dff7a', 350)
          showBanner({ title: 'LUCKY JUMPS!', sub: `${UPGRADES.lucky.chance * 100}% chance of x${UPGRADES.lucky.mult} Jump Power`, color: '#5dff4a' })
          save()
        })
        lucky.querySelector('.u-right').append(unlock)
        // Speed.
        const speed = h('div', 'urow speed', `<div class="u-pat">${ICONS.speed}</div><div class="u-left"><div class="u-name ol">Speed</div><div class="u-val ol"></div></div><div class="u-right"></div>`)
        const sVal = speed.querySelector('.u-val')
        const sBtns = UPGRADES.speed.bundles.map((n, i) => {
          const premium = i === UPGRADES.speed.bundles.length - 1 && i > 1
          return priceButton(premium ? 'pink' : 'red', `+${n}`, () => speedNext(n, premium), (price, b) => {
            spend(price)
            const add = Math.min(n, UPGRADES.speed.max - game.speed)
            game.speed += add
            sfx.upgrade(game.speed - UPGRADES.speed.start)
            juice.floatText(b, `+${add}`, '#ffffff')
            celebrate(b, '#ff8a8a', 10 + add)
            juice.bump(sVal, 1.3)
          })
        })
        speed.querySelector('.u-right').append(...sBtns)
        // Carry.
        const carry = h('div', 'urow carry', `<div class="u-pat">${ICONS.stack}</div><div class="u-left"><div class="u-name ol">Carry</div><div class="u-val ol"></div></div><div class="u-right"></div>`)
        const cVal = carry.querySelector('.u-val')
        const cBtns = UPGRADES.carry.bundles.map((n, i) => {
          const premium = i === UPGRADES.carry.bundles.length - 1 && i > 0
          return priceButton(premium ? 'pink' : 'olive', `+${n}`, () => carryNext(n, premium), (price, b) => {
            spend(price)
            const add = Math.min(n, UPGRADES.carry.max - game.carryMax)
            game.carryMax += add
            sfx.upgrade(game.carryMax * 8)
            sfx.unlock()
            juice.floatText(b, `+${add}`, '#ffffff')
            celebrate(b, '#ffe14a', 24)
            juice.bump(cVal, 1.3)
            toast(`You can carry ${game.carryMax} brainrots now!`, 'good')
          })
        })
        carry.querySelector('.u-right').append(...cBtns)
        body.append(lucky, speed, carry)

        const shown = {}
        w.refresh = () => {
          const lk = game.luckyJumps
          if (shown.lucky !== lk) {
            shown.lucky = lk
            lucky.classList.toggle('on', lk)
            lVal.textContent = lk ? 'Unlocked' : 'Locked'
            lPrice.textContent = lk ? `${UPGRADES.lucky.chance * 100}% x${UPGRADES.lucky.mult}` : money(UPGRADES.lucky.price)
            unlock.querySelector('.pv').textContent = lk ? 'Active' : 'Unlock'
            unlock.classList.toggle('done', lk)
          }
          unlock.classList.toggle('cant', !lk && !canAfford(UPGRADES.lucky.price))
          if (shown.speed !== game.speed) sVal.textContent = shown.speed = game.speed
          if (shown.carry !== game.carryMax) cVal.textContent = shown.carry = game.carryMax
          for (const b of [...sBtns, ...cBtns]) b.refresh()
        }
      },
    })
  }

  // =========================================================================================
  // Items Shop
  // =========================================================================================
  function openItems() {
    openWindow('Items Shop', {
      theme: 'orange',
      icon: ICONS.jumper,
      cls: 'w-items',
      build(body, w) {
        const strip = h('div', 'istrip')
        const cards = ITEMS.map((it) => {
          const c = h('div', `icard r-${it.rarity.toLowerCase()}`, `<div class="i-name ol">${it.name}</div><div class="i-rar ol" style="color:${RARITY_COLORS[it.rarity] ?? '#fff'}">${it.rarity}</div><div class="i-art"><img alt=""></div><div class="i-jp ol">Jump Power: +${short(it.jump)}</div><div class="i-act"></div>`)
          const img = c.querySelector('img')
          requestAnimationFrame(() => (img.src = thumb.item(it.id)))
          strip.append(c)
          return { it, c, act: c.querySelector('.i-act'), key: '' }
        })
        const step = (dir) => {
          const cw = cards[0].c.getBoundingClientRect().width + 12
          strip.scrollBy({ left: dir * cw, behavior: 'smooth' })
          sfx.page()
        }
        const prev = btn('iarrow prev', ICONS.arrow, () => step(-1))
        const next = btn('iarrow next', ICONS.arrow, () => step(1))
        body.append(prev, strip, next)
        // Open on the item you wear.
        requestAnimationFrame(() => {
          const i = ITEMS.findIndex((x) => x.id === game.equipped)
          if (i > 0) strip.scrollLeft = cards[i].c.offsetLeft - strip.offsetLeft - 8
        })
        const equip = (it, c) => {
          game.equipped = it.id
          sfx.equip()
          celebrate(c.querySelector('.i-art'), '#ffffff', 18)
          juice.bump(c, 1.04)
          save()
        }
        const actions = (o) => {
          const { it, c, act } = o
          const owned = !!game.items[it.id]
          const equipped = game.equipped === it.id
          const can = it.price !== null && canAfford(it.price)
          const key = `${owned}|${equipped}|${can}`
          if (key === o.key) return
          o.key = key
          act.innerHTML = ''
          c.classList.toggle('worn', equipped)
          if (equipped) act.append(btn('ibtn equipped', '<span class="ol">Equipped</span>', () => juice.bump(c, 1.03)))
          else if (owned) act.append(btn('ibtn equip', '<span class="ol">Equip</span>', () => equip(it, c)))
          else if (it.price === null) act.append(h('div', 'ibtn locked', `<span class="ol">${it.note ?? 'Reward only'}</span>`))
          else {
            const b = btn(`ibtn buy${can ? '' : ' cant'}`, `<span class="ol">${money(it.price)}</span>${can ? '<i class="bang">!</i>' : ''}`, () => {
              if (!spend(it.price)) {
                sfx.ui('error')
                juice.shake(b)
                toast(`You need ${money(it.price - game.money)} more!`, 'error')
                return
              }
              game.items[it.id] = true
              sfx.buy()
              juice.flash('#fff3c0', 250)
              equip(it, c)
              toast(`${it.name} bought and equipped!`, 'good')
            })
            act.append(b)
          }
        }
        w.refresh = () => {
          for (const o of cards) actions(o)
          prev.classList.toggle('off', strip.scrollLeft < 4)
          next.classList.toggle('off', strip.scrollLeft + strip.clientWidth > strip.scrollWidth - 4)
        }
      },
    })
  }

  // =========================================================================================
  // Sell Brainrots (what you carry)
  // =========================================================================================
  function openSell() {
    openWindow('Sell Brainrots', {
      theme: 'yellow',
      icon: ICONS.coins,
      cls: 'w-sell',
      build(body, w) {
        const top = h('div', 'sell-top', `<div class="sell-total ol">Total value: <span></span></div>`)
        const totalEl = top.querySelector('span')
        const all = btn('pbtn green sell-all', '<span class="pv ol">Sell all</span>', () => {
          if (!hub.carry.has()) {
            sfx.ui('error')
            juice.shake(all)
            toast('Carry brainrots here to sell them!')
            return
          }
          const v = hub.carry.sellAll()
          payout(v, all)
        })
        top.append(all)
        const list = h('div', 'sell-list')
        body.append(top, list)
        const payout = (v, from) => {
          let n = 0
          juice.flyTo(from, moneyEl, ICONS.cash, Math.min(12, 5 + Math.round(Math.log10(v + 1))), () => sfx.coin(n++))
          juice.floatText(from, `+${money(v)}`, '#7dff4a', 1.2)
          juice.confetti(from, { count: 24, colors: ['#ffe14a', '#5dff4a', '#ffffff'] })
          sfx.claim()
        }
        let key = null
        w.refresh = () => {
          const items = hub.carry.list
          const k = JSON.stringify(items)
          if (k === key) return
          key = k
          let total = 0
          for (const d of items) total += sellValue(d)
          totalEl.textContent = money(total)
          all.classList.toggle('cant', !items.length)
          list.innerHTML = ''
          if (!items.length) {
            list.append(h('div', 'sell-empty ol', 'Your inventory is empty.'), h('div', 'sell-hint', 'Pick up brainrots on the lane, then come back here to sell them.'))
            return
          }
          items.forEach((d, i) => {
            const info = CREATURES[d.species]
            const c = h('div', 'scard', `<img src="${thumb(d.species, d.variant)}" alt=""><div class="s-n ol">${SPECIES_NAMES[d.species]}</div><div class="s-tags">${variantHtml(d.variant)}${rarityHtml(info.rarity)}</div><div class="s-inc ol">${money(incomeOf(d))}/s</div>`)
            const b = btn('pbtn green', `<span class="pv ol">Sell ${money(sellValue(d))}</span>`, () => {
              const v = hub.carry.sell(i)
              if (v) payout(v, b)
            })
            c.append(b)
            list.append(c)
          })
        }
      },
    })
  }

  // =========================================================================================
  // Index
  // =========================================================================================
  const indexTotal = SPECIES_LIST.length * VARIANT_ORDER.length
  // Thumbnails render a few per frame so opening the Index never hitches.
  const thumbQueue = []
  let pumping = false
  function pump() {
    pumping = true
    let n = 0
    while (thumbQueue.length && n < 4) {
      const { img, species, variant } = thumbQueue.shift()
      if (!img.isConnected) continue
      if (!thumb.cached(species, variant)) n++
      img.src = thumb(species, variant)
      img.classList.add('in')
    }
    if (thumbQueue.length) requestAnimationFrame(pump)
    else pumping = false
  }
  const lazyThumb = (img, species, variant) => {
    thumbQueue.push({ img, species, variant })
    if (!pumping) requestAnimationFrame(pump)
  }
  let groupBy = 'tier'
  function openIndex() {
    openWindow('Index', {
      theme: 'blue',
      icon: ICONS.book,
      cls: 'w-index',
      count: true,
      build(body, w) {
        const side = h('div', 'ix-side')
        const grid = h('div', 'ix-grid')
        const bonus = h('div', 'ix-bonus', `<div class="ix-msg ol"></div><div class="ix-bar"><i></i></div><div class="ix-lbl ol"><span class="now"></span><span class="mid"></span><span class="nxt"></span></div>`)
        body.append(grid, bonus)
        w.main.prepend(side)
        const group = btn('ix-group ol', '', () => {
          groupBy = groupBy === 'tier' ? 'variant' : 'tier'
          sfx.page()
          fill()
        })
        w.foot.append(group)
        let anchors = []
        function fill() {
          group.textContent = `Group by: ${groupBy === 'tier' ? 'Tier' : 'Variant'}`
          grid.innerHTML = ''
          side.innerHTML = ''
          anchors = []
          const bySpecies = (r) => SPECIES_LIST.filter((s) => CREATURES[s].rarity === r).sort((a, b) => CREATURES[a].income - CREATURES[b].income)
          const groups =
            groupBy === 'tier'
              ? RARITIES.map((r) => ({ key: r, label: r, color: RARITY_COLORS[r], cls: `rb-${r.toLowerCase()}`, entries: VARIANT_ORDER.flatMap((v) => bySpecies(r).map((s) => [s, v])) }))
              : VARIANT_ORDER.map((v) => ({ key: v, label: v === 'normal' ? 'Normal' : VARIANT_NAMES[v], cls: `vb-${v}`, entries: RARITIES.flatMap((r) => bySpecies(r).map((s) => [s, v])) }))
          for (const g of groups) {
            if (!g.entries.length) continue
            let found = 0
            g.entries.forEach(([s, v], i) => {
              const seen = !!game.index[s]?.[v]
              if (seen) found++
              const cell = h('div', `ix-cell v-${v}${seen ? ' found' : ''}`, `<div class="ix-name ol">${seen ? SPECIES_NAMES[s] : '???'}</div><img alt="" class="${seen ? '' : 'sil'}"><div class="ix-tags">${variantHtml(v)}${rarityHtml(CREATURES[s].rarity)}</div>`)
              if (seen) cell.title = `${SPECIES_NAMES[s]}: ${money(incomeOf({ species: s, variant: v }))}/s`
              lazyThumb(cell.querySelector('img'), s, v)
              grid.append(cell)
              if (i === 0) anchors.push({ g, cell })
            })
            const pct = Math.floor((found / g.entries.length) * 100)
            const b = btn(`ix-tab ${g.cls}`, `<span class="pct ol">${pct}%</span><span class="lab ol">${g.label}</span>`, () => {
              const a = anchors.find((x) => x.g === g)
              grid.scrollTo({ top: a.cell.offsetTop - grid.offsetTop - 4, behavior: 'smooth' })
              sfx.page()
            })
            g.btn = b
            side.append(b)
          }
          grid.scrollTop = 0
          markSide()
        }
        // Highlight the tier you are looking at.
        function markSide() {
          const y = grid.scrollTop + grid.offsetTop + 10
          let cur = anchors[0]
          for (const a of anchors) if (a.cell.offsetTop <= y) cur = a
          for (const a of anchors) a.g.btn.classList.toggle('on', a === cur)
        }
        grid.addEventListener('scroll', markSide, { passive: true })
        fill()
        let shownFound = -1
        w.refresh = () => {
          const f = indexFound()
          if (f === shownFound) return
          if (shownFound >= 0) fill() // something new was found while open
          shownFound = f
          w.count.textContent = `${f}/${indexTotal}`
          const every = INDEX_BONUS.every
          const k = f % every
          const now = indexBonus()
          bonus.querySelector('.ix-msg').innerHTML = f >= indexTotal ? 'Index complete! Every bonus unlocked!' : `Find <b>${every - k}</b> more brainrot${every - k === 1 ? '' : 's'} to unlock the next bonus!`
          bonus.querySelector('i').style.width = `${(k / every) * 100}%`
          bonus.querySelector('.now').textContent = `Now: +${Math.round(now * 100)}%`
          bonus.querySelector('.mid').textContent = `${k}/${every}`
          bonus.querySelector('.nxt').textContent = `Next: +${Math.round((now + INDEX_BONUS.pct) * 100)}%`
        }
      },
    })
  }

  // =========================================================================================
  // Rebirths
  // =========================================================================================
  function openRebirth() {
    openWindow('Rebirths', {
      theme: 'pink',
      icon: ICONS.rebirth,
      cls: 'w-reb',
      build(body, w) {
        const col = () => h('div', 'rb-col', `<div class="rb-lbl ol"></div><div class="rb-chips"><div class="chip m">${ICONS.cash}<span class="ol"></span></div><div class="chip j">${ICONS.jumper}<span class="ol"></span></div></div>`)
        const a = col()
        const b = col()
        const top = h('div', 'rb-top')
        top.append(a, h('div', 'rb-arrow', ICONS.arrow), b)
        const box = h('div', 'rb-box', `<div class="rb-warn ol">Rebirth resets your jump power and money</div><div class="rb-bar"><i></i><span class="ol"></span></div>`)
        const act = h('div', 'rb-actions')
        const rb = btn('pbtn green rb-go', `<span class="rb-ico">${ICONS.rebirth}</span><span class="pv ol">Rebirth</span>`, () => {
          if (!doRebirth(false)) {
            sfx.ui('error')
            juice.shake(rb)
            toast(`You need ${short(rebirthReq() - game.jumpPower)} more Jump Power!`, 'error')
            return
          }
          reborn(rb)
        })
        const skipWrap = h('div', 'rb-skipwrap')
        const skip = btn('pbtn pink rb-skip', `<span class="pv ol"></span>`, () => {
          if (!doRebirth(true)) {
            sfx.ui('error')
            juice.shake(skip)
            toast(`You need ${money(rebirthSkipPrice() - game.money)} more!`, 'error')
            return
          }
          reborn(skip)
        })
        skipWrap.append(skip, h('div', 'rb-keep ol', 'Keep your jump power!'))
        act.append(rb, h('div', 'rb-or ol', 'OR'), skipWrap)
        body.append(top, box, act)
        function reborn(from) {
          const m = rebirthMults()
          sfx.rebirth()
          juice.flash('#ff7ab8', 700)
          juice.confetti(from, { count: 70, power: 1.6, colors: ['#ff5fa8', '#ffffff', '#3fb7ff', '#5dff4a', '#ffe14a'] })
          juice.ring(from, '#ff7ab8', 520)
          showBanner({ title: 'REBIRTH!', sub: `Rebirth ${game.rebirths}: x${short(m.money)} money, x${short(m.jump)} Jump Power`, color: '#ff7ab8' })
          setTimeout(() => {
            closeWindow()
            go('home')
          }, 650)
        }
        let key = ''
        w.refresh = () => {
          const n = game.rebirths
          const req = rebirthReq()
          const k2 = `${n}|${short(game.jumpPower)}|${canAfford(rebirthSkipPrice())}`
          if (k2 === key) return
          key = k2
          const m1 = rebirthMults(n + 1)
          const m2 = rebirthMults(n + 2)
          a.querySelector('.rb-lbl').textContent = `Rebirth ${n + 1}`
          b.querySelector('.rb-lbl').textContent = `Rebirth ${n + 2}`
          a.querySelector('.m span').textContent = `x${short(m1.money)}`
          a.querySelector('.j span').textContent = `x${short(m1.jump)}`
          b.querySelector('.m span').textContent = `x${short(m2.money)}`
          b.querySelector('.j span').textContent = `x${short(m2.jump)}`
          box.querySelector('i').style.width = `${clamp(game.jumpPower / req, 0, 1) * 100}%`
          box.querySelector('.rb-bar span').textContent = `Jump power: ${short(game.jumpPower)}/${short(req)}`
          const ready = game.jumpPower >= req
          rb.classList.toggle('cant', !ready)
          rb.classList.toggle('ready', ready)
          skip.querySelector('.pv').textContent = `SKIP! - ${money(rebirthSkipPrice())}`
          skip.classList.toggle('cant', !canAfford(rebirthSkipPrice()))
        }
      },
    })
  }

  // =========================================================================================
  // Lucky Blocks (walk up to the "?" heap): buy a block for money and break it open, or open
  // the ones you own (free ones come from Jump Crystals).
  // =========================================================================================
  let luckyBusy = false
  function openLucky() {
    openWindow('Lucky Blocks', {
      theme: 'yellow',
      icon: ICONS.luckyBlock('lucky'),
      cls: 'w-lucky',
      build(body, w) {
        const info = btn('info-btn', ICONS.info, () =>
          infoPop(body, 'Lucky Blocks', [
            'Break a block for a random prize: <b>cash</b>, <b>Jump Power</b>, <b>boosts</b> or <b>brainrots</b>.',
            'Bigger blocks can hold brainrots from zones <b>you have not reached yet</b>!',
            `Every <b>${LUCKY_BLOCKS.freeEvery} Jump Crystals</b> you pick up give you a free Lucky Block.`,
            'Prices grow with your base income. Money only.',
          ]),
        )
        w.el.append(info)
        const grid = h('div', 'rgrid lucky')
        const cards = Object.entries(LUCKY_BLOCKS.tiers).map(([tier, T]) => {
          const c = h('div', `rcard lb lb-${tier}`, `<div class="lb-shine"></div><div class="r-title ol${T.name.length > 12 ? ' long' : ''}">${T.name}</div><div class="r-art">${ICONS.luckyBlock(tier)}</div><div class="lb-owned ol"></div><div class="r-act"></div>`)
          const i = btn('r-info', ICONS.info, () => {
            const o = rewards.luckyOdds(tier)
            infoPop(body, `${T.name} odds`, o.map((x) => `<b>${x.pct}</b> ${x.what}`))
          })
          c.querySelector('.r-art').append(i)
          const act = c.querySelector('.r-act')
          const openBtn = btn('rbtn claim lb-open', '<span class="ol">Open!</span><i class="bang">!</i>', () => run(tier, c))
          const buy = priceButton('green lb-buy', '', () => luckyPrice(tier), (price) => {
            if (luckyBusy || !spend(price)) return
            game.luckyBlocks[tier]++
            sfx.buy()
            juice.bump(c, 1.06)
            run(tier, c)
          })
          act.append(openBtn, buy)
          grid.append(c)
          return { tier, c, openBtn, buy, owned: c.querySelector('.lb-owned'), key: '' }
        })
        body.append(grid)
        // Footer: progress toward the next free block.
        const prog = h('div', 'lb-prog', `<div class="lb-pi">${ICONS.crystal}</div><div class="lb-bar"><div class="lb-fill"></div><div class="lb-txt ol"></div></div><div class="lb-pi">${ICONS.luckyBlock('lucky')}</div>`)
        w.foot.append(prog)
        const fill = prog.querySelector('.lb-fill')
        const txt = prog.querySelector('.lb-txt')
        let shownProg = -1
        // Open one block of a tier you own: the show, then the card bounces.
        async function run(tier, c) {
          if (luckyBusy || game.luckyBlocks[tier] < 1) return
          luckyBusy = true
          game.luckyBlocks[tier]--
          save()
          w.refresh()
          try {
            await rewards.openLucky(tier)
          } finally {
            luckyBusy = false
          }
          celebrate(c.querySelector('.r-art'), '#ffe14a', 20)
          save()
          w.refresh()
        }
        w.refresh = () => {
          for (const o of cards) {
            const n = game.luckyBlocks[o.tier] || 0
            const key = `${n}`
            if (key !== o.key) {
              const more = o.key !== '' && n > Number(o.key)
              o.key = key
              o.owned.textContent = n ? `x${n}` : ''
              o.openBtn.style.display = n ? '' : 'none'
              o.c.classList.toggle('has', n > 0)
              if (more) {
                juice.bump(o.c, 1.08)
                celebrate(o.c.querySelector('.r-art'), '#ffe14a', 16)
              }
            }
            o.buy.refresh()
          }
          const p = game.crystals % LUCKY_BLOCKS.freeEvery
          if (p !== shownProg) {
            shownProg = p
            fill.style.width = `${(p / LUCKY_BLOCKS.freeEvery) * 100}%`
            txt.textContent = `${p}/${LUCKY_BLOCKS.freeEvery} Jump Crystals to a free block`
          }
        }
      },
    })
  }

  // =========================================================================================
  // Fusion Machine (walk up to the machine on the east wall): 3 of the same brainrot and
  // variant -> 1 of the next variant after a real-time build. The machine (hub.fusion) takes
  // the brainrots from your hands / base and runs the 3D side; this is the menu.
  // =========================================================================================
  const vName = (v) => (v === 'normal' ? '<span class="vt v-normal">Normal</span>' : variantHtml(v))
  let fuseBusy = false
  function openFusion() {
    openWindow('Fusion Machine', {
      theme: 'pink',
      icon: ICONS.fusion,
      cls: 'w-fuse',
      build(body, w) {
        const info = btn('info-btn', ICONS.info, () =>
          infoPop(body, 'Fusion Machine', [
            `Put <b>${FUSION.need}</b> of the same brainrot (same variant) in to make <b>1</b> of the next variant.`,
            'Normal → Golden → Diamond → Rainbow → Lava. Each one earns more money.',
            'They come from your hands first, then your base.',
            'The machine keeps working while you are away. Money only.',
          ]),
        )
        w.el.append(info)
        const head = h('div', 'fu-head')
        const list = h('div', 'fu-list')
        body.append(head, list)
        let headKey = ''
        let listKey = ''
        let bar = null
        let left = null
        let buttons = []
        const img = (species, variant, cls = '') => {
          const i = h('img', cls)
          i.alt = ''
          requestAnimationFrame(() => (i.src = thumb(species, variant)))
          return i
        }
        async function doClaim(b) {
          if (fuseBusy) return
          const out = hub.fusion.claim()
          if (!out) return
          fuseBusy = true
          sfx.claim()
          celebrate(b, '#ffd23a', 24)
          try {
            await rewards.openFusion({ species: out.species, from: out.from, to: out.variant })
          } finally {
            fuseBusy = false
          }
          save()
          w.refresh()
        }
        function renderHead(f) {
          head.innerHTML = ''
          bar = left = null
          head.className = `fu-head ${!f ? 'idle' : f.done ? 'done' : 'busy'}`
          if (!f) {
            head.innerHTML = `<div class="fu-tip ol">Put <b>${FUSION.need}</b> of the same brainrot in to get <b>1</b> of the next variant!</div><div class="fu-chain">${['normal', 'golden', 'diamond', 'rainbow', 'lava'].map((v) => vName(v)).join('<i class="fu-arr">➜</i>')}</div>`
            return
          }
          const ins = h('div', 'fu-ins')
          for (let k = 0; k < FUSION.need; k++) ins.append(img(f.species, f.from, 'fu-in'))
          const outBox = h('div', 'fu-out')
          outBox.append(img(f.species, f.to, 'fu-res'))
          const meta = h('div', 'fu-meta', `<div class="fu-name ol">${SPECIES_NAMES[f.species]}</div><div class="fu-var">${vName(f.to)}</div><div class="fu-inc ol">+${money(incomeOf({ species: f.species, variant: f.to }))}/s</div>`)
          const arrow = h('div', 'fu-arrow ol', '➜')
          head.append(ins, arrow, outBox, meta)
          if (f.done) {
            const b = btn('rbtn claim fu-claim', '<span class="ol">Claim!</span><i class="bang">!</i>', () => doClaim(b))
            head.append(b)
          } else {
            const wrap = h('div', 'fu-prog', '<div class="fu-bar"><div class="fu-fill"></div><div class="fu-left ol"></div></div>')
            head.append(wrap)
            bar = wrap.querySelector('.fu-fill')
            left = wrap.querySelector('.fu-left')
          }
        }
        function renderList(groups, busy) {
          list.innerHTML = ''
          buttons = []
          if (!groups.length) {
            list.append(h('div', 'fu-empty ol', `Bring <b>${FUSION.need}</b> of the same brainrot (same variant) to your base or hands, and they show up here!`))
            return
          }
          for (const g of groups) {
            const ready = g.count >= FUSION.need
            const row = h('div', `fu-row${ready ? ' ready' : ''}`)
            const a = h('div', 'fu-side')
            a.append(img(g.species, g.variant, 'fu-thumb'))
            a.append(h('div', 'fu-txt', `<div class="fu-name ol">${SPECIES_NAMES[g.species]}</div>${vName(g.variant)}<div class="fu-count ol">${Math.min(g.count, 99)}/${FUSION.need}</div>`))
            const b2 = h('div', 'fu-side')
            b2.append(img(g.species, g.to, 'fu-thumb out'))
            b2.append(h('div', 'fu-txt', `${vName(g.to)}<div class="fu-inc ol">+${money(incomeOf({ species: g.species, variant: g.to }))}/s</div>`))
            const act = h('div', 'fu-act')
            if (!ready) act.append(h('div', 'rbtn wait', `<span class="ol">Need ${FUSION.need - g.count} more</span>`))
            else if (busy) act.append(h('div', 'rbtn wait', '<span class="ol">Machine busy</span>'))
            else {
              const pb = priceButton('pink fu-go', `${fusionMinutes(g.to)}m`, () => fusionPrice(g.species, g.to), (price, b) => {
                if (!hub.fusion.start(g.species, g.variant)) {
                  sfx.ui('error')
                  juice.shake(b)
                  toast('Could not start: bring the brainrots to your base or hands.', 'error')
                  return
                }
                sfx.buy()
                celebrate(b, '#ff7af2', 26)
                juice.flash('#e8c8ff', 260)
                toast(`Fusing! Your ${VARIANT_NAMES[g.to]} ${SPECIES_NAMES[g.species]} is ready in ${fusionMinutes(g.to)} min.`, 'good')
                w.refresh()
              })
              act.append(pb)
              buttons.push(pb)
            }
            row.append(a, h('div', 'fu-arrow ol', '➜'), b2, act)
            list.append(row)
          }
        }
        w.refresh = () => {
          const f = fusionState()
          const hk = !f ? 'idle' : `${f.done ? 'done' : 'busy'}|${f.species}|${f.from}|${f.to}`
          if (hk !== headKey) {
            headKey = hk
            renderHead(f)
          }
          if (f && !f.done && bar) {
            bar.style.width = `${(f.progress * 100).toFixed(1)}%`
            const t = `${clock(f.left)} left`
            if (left.textContent !== t) left.textContent = t
          }
          const groups = fusionGroups(2)
          const lk = `${!!game.fusion}|${groups.map((g) => `${g.species}.${g.variant}.${g.count}`).join(',')}`
          if (lk !== listKey) {
            listKey = lk
            renderList(groups, !!game.fusion)
          }
          for (const b of buttons) b.refresh()
        }
      },
    })
  }

  // =========================================================================================
  // Ascended Shop (the tarp stall in the SHOPS row): permanent perks for money, open at
  // ASCENDED.unlock.rebirths. Before that the window is a locked preview of what is inside.
  // =========================================================================================
  const ascEffectText = (id, lv) => {
    const e = ascEffect(id, lv)
    switch (id) {
      case 'autoCollect':
        return lv ? 'Active' : 'Off'
      case 'magnet':
        return lv ? `Active (${ascPerk('magnet').radius} m)` : 'Off'
      case 'mastery':
        return `+${Math.round(e * 100)}% training`
      case 'fastFusion':
        return `${Math.round(e * 100)}% faster fusion`
      case 'golden':
        return `+${Math.round(e * 100)}% luck`
      case 'vault':
        return `${Math.round(ECONOMY.offlineCap / 3600 + e)} h offline income`
      default:
        return ''
    }
  }
  function openAscended() {
    openWindow('Ascended Shop', {
      theme: 'purple',
      icon: ICONS.crown,
      cls: 'w-asc',
      build(body, w) {
        const ribbon = h('div', 'asc-ribbon')
        const grid = h('div', 'asc-grid')
        body.append(ribbon, grid)
        const cards = ASCENDED.perks.map((p) => {
          const c = h('div', `asc-card a-${p.id}`, `<div class="asc-glow"></div><div class="asc-icon">${ICONS.asc[p.id]}</div><div class="asc-name ol">${p.name}</div><div class="asc-pips"></div><div class="asc-desc">${p.text}</div><div class="asc-eff ol"></div><div class="asc-act"></div>`)
          c.style.setProperty('--pc', p.color)
          const pips = c.querySelector('.asc-pips')
          if (p.max > 1) for (let i = 0; i < p.max; i++) pips.append(h('i', 'pip'))
          else pips.append(h('span', 'once ol', 'One-time unlock'))
          grid.append(c)
          return { p, c, pips: [...pips.querySelectorAll('.pip')], eff: c.querySelector('.asc-eff'), act: c.querySelector('.asc-act'), icon: c.querySelector('.asc-icon'), key: '', btn: null }
        })
        const buy = (o, b) => {
          const lv = buyAscended(o.p.id)
          if (!lv) {
            sfx.ui('error')
            juice.shake(b)
            return
          }
          const maxed = lv >= o.p.max
          sfx.ascendBuy(lv, maxed)
          celebrate(o.icon, o.p.color, 30 + lv * 3)
          juice.ring(o.icon, '#ffe14a', 260)
          juice.floatText(o.icon, o.p.max > 1 ? `Lv ${lv}!` : 'Unlocked!', o.p.color, 1.2)
          juice.bump(o.c, 1.08)
          juice.flash('#f0d8ff', 220)
          bus.emit('ascendedBuy', { id: o.p.id, level: lv })
          if (o.p.max === 1 || maxed) showBanner({ title: `${o.p.name.toUpperCase()}!`, sub: o.p.max === 1 ? o.p.text : 'Maxed out!', color: o.p.color })
          o.c.classList.add('pop')
          setTimeout(() => o.c.classList.remove('pop'), 700)
          w.refresh()
        }
        let ribbonKey = ''
        w.refresh = () => {
          const open = ascendedUnlocked()
          const rk = `${open}|${game.rebirths}`
          if (rk !== ribbonKey) {
            ribbonKey = rk
            const need = ASCENDED.unlock.rebirths
            ribbon.className = `asc-ribbon${open ? ' open' : ''}`
            ribbon.innerHTML = open
              ? `<div class="asc-rt ol">Permanent perks: a rebirth keeps them all!</div>`
              : `<div class="asc-lock">${ICONS.lock}</div><div class="asc-rt ol">Unlocks at <b>${need} Rebirths</b> (you have ${game.rebirths})</div><div class="asc-bar"><div class="asc-fill" style="width:${Math.min(100, (game.rebirths / need) * 100)}%"></div></div>`
            w.el.classList.toggle('locked', !open)
          }
          for (const o of cards) {
            const lv = ascLevel(o.p.id)
            const key = `${lv}|${open}`
            if (key !== o.key) {
              o.key = key
              o.pips.forEach((pp, i) => pp.classList.toggle('on', i < lv))
              const maxed = lv >= o.p.max
              o.eff.innerHTML = maxed || !open ? ascEffectText(o.p.id, lv) : `${ascEffectText(o.p.id, lv)} <b>➜ ${ascEffectText(o.p.id, lv + 1)}</b>`
              o.c.classList.toggle('maxed', maxed)
              o.c.classList.toggle('owned', lv > 0)
              o.act.innerHTML = ''
              o.btn = null
              if (!open) o.act.append(h('div', 'rbtn wait', `<span class="ol">${ASCENDED.unlock.rebirths} Rebirths</span>`))
              else if (maxed) o.act.append(h('div', 'rbtn done', `<span class="ol">${o.p.max > 1 ? 'MAXED' : 'Owned'}</span>`))
              else {
                o.btn = priceButton('green asc-buy', o.p.max > 1 ? `Lv ${lv + 1}` : '', () => ascPrice(o.p.id), (price, b) => buy(o, b))
                o.act.append(o.btn)
              }
            }
            o.btn?.refresh()
          }
        }
      },
    })
  }

  // =========================================================================================
  // Base Level (the core in front of your base): pay, wait for the build, and the next lane
  // wall opens; every level also adds money. The 3D core runs the build show.
  // =========================================================================================
  // Zone colours as text on the dark panels (Secret's near-black is lightened).
  const readable = (c = '#fff') => (c === '#34344a' ? '#b8b8f0' : c)
  const gemSvg = (c) => `<svg viewBox="0 0 100 100"><path d="M50 6l34 44-34 44-34-44z" fill="${c}" stroke="#0d1a3a" stroke-width="5" stroke-linejoin="round"/><path d="M50 6l-12 44 12 44 12-44zM16 50h68" fill="none" stroke="rgba(13,26,58,0.45)" stroke-width="3"/><path d="M50 6L38 50h24z" fill="rgba(255,255,255,0.45)"/></svg>`
  function openBase() {
    openWindow('Base Level', {
      theme: 'blue',
      icon: gemSvg('#7ff0ff'),
      cls: 'w-base',
      build(body, w) {
        const head = h('div', 'bl-head')
        const ladder = h('div', 'bl-ladder')
        body.append(head, ladder)
        const rows = BASE_LEVELS.levels.map((l, k) => {
          const lv = k + 1
          const zone = ZONES[lv]
          const r = h('div', 'bl-row', `<div class="bl-gem">${gemSvg(BASE_LEVELS.colors[lv])}</div><div class="bl-lv ol">Lv ${lv}</div><div class="bl-zone ol" style="color:${readable(zone?.color)}">Opens ${zone?.name ?? ''}</div><div class="bl-meta ol">$${short(l.cost)} · ${l.minutes} min</div><div class="bl-st ol"></div>`)
          ladder.append(r)
          return { lv, r, st: r.querySelector('.bl-st'), key: '' }
        })
        let headKey = ''
        let bar = null
        let left = null
        let btnBuild = null
        function renderHead(state) {
          head.innerHTML = ''
          bar = left = btnBuild = null
          const lv = game.baseLevel
          const next = nextBaseLevel()
          const b = baseBuildState()
          head.className = `bl-head ${state}`
          const cur = h('div', 'bl-cur', `<div class="bl-big">${gemSvg(BASE_LEVELS.colors[lv])}</div><div><div class="bl-title ol">Base Level ${lv}</div><div class="bl-bonus ol">+${Math.round(lv * BASE_LEVELS.income * 100)}% money</div></div>`)
          head.append(cur)
          if (state === 'max') {
            head.append(h('div', 'bl-msg ol', 'MAX LEVEL! Every wall is open.'))
            return
          }
          const zone = ZONES[next.level]
          const info = h('div', 'bl-next', `<div class="bl-nt ol">Level ${next.level} opens <b style="color:${readable(zone.color)}">${zone.name}</b></div><div class="bl-nm ol">+${Math.round(BASE_LEVELS.income * 100)}% money · builds in ${next.minutes} min (even while you are away)</div>`)
          head.append(info)
          if (state === 'building') {
            const wrap = h('div', 'bl-prog', `<div class="bl-bar"><div class="bl-fill"></div><div class="bl-left ol"></div></div>`)
            head.append(wrap)
            bar = wrap.querySelector('.bl-fill')
            left = wrap.querySelector('.bl-left')
          } else {
            btnBuild = priceButton('green bl-build', `${next.minutes}m`, () => nextBaseLevel()?.cost ?? null, (price, btn2) => {
              if (!startBaseBuild()) {
                sfx.ui('error')
                juice.shake(btn2)
                return
              }
              sfx.upgrade(game.baseLevel * 3)
              sfx.buy()
              celebrate(btn2, '#ffd23a', 26)
              juice.flash('#fff3c0', 220)
              bus.emit('baseBuild', next.level)
              toast(`Building Base Level ${next.level}! Ready in ${next.minutes} min.`, 'good')
              w.refresh()
            })
            head.append(btnBuild)
          }
        }
        w.refresh = () => {
          const b = baseBuildState()
          const state = !nextBaseLevel() ? 'max' : b ? 'building' : 'idle'
          const hk = `${state}|${game.baseLevel}`
          if (hk !== headKey) {
            const leveled = headKey && !headKey.endsWith(`|${game.baseLevel}`)
            headKey = hk
            renderHead(state)
            if (leveled) {
              celebrate(head.querySelector('.bl-big'), '#ffd23a', 40)
              juice.bump(head, 1.05)
            }
          }
          if (bar && b) {
            bar.style.width = `${(b.progress * 100).toFixed(1)}%`
            const t = `${clock(b.left)} left`
            if (left.textContent !== t) left.textContent = t
          }
          btnBuild?.refresh()
          for (const o of rows) {
            const st = o.lv <= game.baseLevel ? 'done' : b && b.level === o.lv ? 'building' : o.lv === game.baseLevel + 1 ? 'next' : 'locked'
            if (st === o.key) continue
            o.key = st
            o.r.className = `bl-row ${st}`
            o.st.textContent = st === 'done' ? 'Built' : st === 'building' ? 'Building' : st === 'next' ? 'Next' : ''
          }
        }
      },
    })
  }

  // =========================================================================================
  // Reward cards (Playtime + Daily)
  // =========================================================================================
  function rewardCard(def, cls) {
    const f = rewards.describe(def)
    const c = h('div', `rcard ${cls}${f.big ? ' big' : ''}`, `<div class="r-title ol${f.title.length > 9 ? ' long' : ''}">${f.title}</div><div class="r-art">${f.art}</div>${f.tags ? `<div class="r-tags">${f.tags}</div>` : ''}<div class="r-act"></div>`)
    if (f.info) {
      const i = btn('r-info', ICONS.info, () => {
        const o = rewards.odds(f.info)
        infoPop(c.closest('.gw-body'), 'Chest contents', o.map((x) => `<b>${x.pct}</b> ${x.what}`))
      })
      c.querySelector('.r-art').append(i)
    }
    c.def = def
    c.titleEl = c.querySelector('.r-title')
    return c
  }
  // Card button states: 'claimed', 'ready', or a label (timer / Day N).
  function setCardState(c, state, label, onClaim) {
    const key = `${state}|${label}`
    if (c.stateKey === key) return
    const wasState = c.stateKey?.split('|')[0]
    c.stateKey = key
    c.classList.toggle('claimed', state === 'claimed')
    c.classList.toggle('ready', state === 'ready')
    const act = c.querySelector('.r-act')
    if (wasState === state && state === 'wait') {
      act.firstChild.querySelector('span').textContent = label
      return
    }
    act.innerHTML = ''
    if (state === 'claimed') act.append(h('div', 'rbtn done', '<span class="ol">Claimed</span>'))
    else if (state === 'ready') act.append(btn('rbtn claim', '<span class="ol">Claim</span><i class="bang">!</i>', () => onClaim(c)))
    else act.append(h('div', 'rbtn wait', `<span class="ol">${label}</span>`))
  }
  // Money card titles grow with your income: keep them live.
  const liveTitle = (c) => {
    if (c.def.kind === 'money') {
      const t = rewards.describe(c.def).title
      if (c.titleEl.textContent !== t) c.titleEl.textContent = t
    }
  }

  // =========================================================================================
  // Playtime Rewards
  // =========================================================================================
  const playReady = (i) => !game.playtimeClaimed[i] && game.playtime >= PLAYTIME[i].minutes * 60
  const anyPlayReady = () => PLAYTIME.some((_, i) => playReady(i))
  function openPlaytime() {
    openWindow('Playtime Rewards', {
      theme: 'cyan',
      icon: ICONS.clock,
      cls: 'w-play',
      build(body, w) {
        const grid = h('div', 'rgrid play')
        const cards = PLAYTIME.map((def, i) => {
          const c = rewardCard(def, 'play')
          c.i = i
          grid.append(c)
          return c
        })
        body.append(grid)
        const claim = (c) => {
          if (!playReady(c.i)) return
          game.playtimeClaimed[c.i] = true
          rewards.grant(c.def, c)
          w.refresh()
        }
        w.refresh = () => {
          for (const c of cards) {
            const r = PLAYTIME[c.i]
            if (game.playtimeClaimed[c.i]) setCardState(c, 'claimed', '', claim)
            else if (game.playtime >= r.minutes * 60) setCardState(c, 'ready', '', claim)
            else setCardState(c, 'wait', clock(r.minutes * 60 - game.playtime), claim)
            liveTitle(c)
          }
        }
      },
    })
  }

  // =========================================================================================
  // Daily Rewards
  // =========================================================================================
  // The clock (one claim per cooldown, a missed streak restarts) is game/daily.js: the server's for
  // a signed-in player, this device's otherwise.
  const milestoneReady = (day) => game.dailyDay >= day && !game.dailyMilestones[day]
  const anyDailyReady = () => dailyReady() || milestoneReady(DAILY.pass.day) || milestoneReady(DAILY.milestone.day)
  function openDaily() {
    if (checkStreak()) toast('Your daily streak restarted. Claim every day to keep it!', 'info')
    openWindow('Daily Rewards', {
      theme: 'orange',
      icon: ICONS.calendar,
      cls: 'w-daily',
      build(body, w) {
        const grid = h('div', 'rgrid daily')
        const cards = DAILY.days.map((def, i) => {
          const c = rewardCard(def, `daily d${i + 1}`)
          c.i = i
          grid.append(c)
          return c
        })
        body.append(grid)
        // Streak milestones beside the panel.
        const ms = (day, def, cls) => {
          const f = rewards.describe(def)
          const m = h('div', `dside ${cls}`, `<div class="ds-title ol">${f.title}</div>${f.tags ? `<div class="ds-tags">${f.tags}</div>` : ''}<div class="ds-art">${f.art}</div><div class="ds-day ol">Day ${day}</div><div class="ds-act"></div>`)
          m.def = def
          m.day = day
          return m
        }
        const passSide = ms(DAILY.pass.day, { kind: 'pass' }, 'left')
        const mileSide = ms(DAILY.milestone.day, { kind: 'brainrot', species: DAILY.milestone.species, variant: DAILY.milestone.variant, best: DAILY.milestone.best }, 'right')
        w.main.prepend(passSide)
        w.main.append(mileSide)
        const claimAll = btn('pbtn green d-all', '<span class="pv ol">Claim All</span>', () => runClaimAll())
        w.foot.append(claimAll)
        let busy = false
        // Asks for the claim (the server decides for a signed-in player), then grants the days it
        // gave: `count` of them, the last one being the day game.dailyDay now points after.
        const claim = async (all) => {
          const r = await claimDaily(all)
          if (!r.ok) {
            sfx.ui('error')
            if (r.reason === 'offline' || r.reason === 'timeout') toast('Could not reach the server to claim. Try again in a moment.', 'info')
            else if (r.reason === 'save') toast('Your claim could not be saved. Try again.', 'info')
            w.refresh()
            return 0
          }
          return r.count
        }
        const claimDay = async (c) => {
          const week = game.dailyDay % DAILY_CYCLE
          if (busy || c.i !== week || (!dailyReady() && !(game.dailyPass && week !== 0))) return
          busy = true
          const count = await claim(false)
          // Grant the day the clock actually gave (the server may have restarted a lapsed streak).
          if (count) {
            const got = cards[(game.dailyDay - 1 + DAILY_CYCLE) % DAILY_CYCLE]
            await rewards.grant(got.def, got)
          }
          busy = false
          w.refresh()
        }
        async function runClaimAll() {
          if (busy || !game.dailyPass) return
          if (!dailyReady() && game.dailyDay % DAILY_CYCLE === 0) {
            sfx.ui('error')
            return
          }
          busy = true
          const count = await claim(true)
          // game.dailyDay already moved on: the days granted are the `count` before it.
          const start = (game.dailyDay - count) % DAILY_CYCLE
          for (let k = 0; k < count; k++) {
            await rewards.grant(cards[(start + k) % DAILY_CYCLE].def, cards[(start + k) % DAILY_CYCLE])
            w.refresh()
            await new Promise((r) => setTimeout(r, 180))
          }
          busy = false
          w.refresh()
          save()
        }
        const sideAct = (m) => {
          const act = m.querySelector('.ds-act')
          const owned = m.def.kind === 'pass' ? game.dailyPass : !!game.dailyMilestones[m.day]
          const ready = milestoneReady(m.day) && !(m.def.kind === 'pass' && game.dailyPass)
          const canBuy = m.def.kind === 'pass' && !game.dailyPass && !ready
          const key = `${owned}|${ready}|${canBuy}|${canBuy && canAfford(DAILY.pass.price)}`
          if (m.key === key) return
          m.key = key
          act.innerHTML = ''
          m.classList.toggle('owned', owned)
          m.classList.toggle('ready', ready)
          if (owned) act.append(h('div', 'rbtn done', '<span class="ol">Owned</span>'))
          else if (ready)
            act.append(
              btn('rbtn claim', '<span class="ol">Claim</span><i class="bang">!</i>', () => {
                if (!milestoneReady(m.day)) return
                game.dailyMilestones[m.day] = true
                rewards.grant(m.def, m)
                save()
              }),
            )
          else if (canBuy)
            act.append(
              priceButton('green small', '', () => DAILY.pass.price, (price, b) => {
                spend(price)
                game.dailyPass = true
                sfx.buy()
                sfx.unlock()
                celebrate(b, '#ffe14a', 30)
                toast('Claim All Pass unlocked!', 'good')
                save()
              }),
            )
          else act.append(h('div', 'rbtn wait', `<span class="ol">${game.dailyDay}/${m.day} days</span>`))
          act.querySelector('.pbtn')?.refresh?.()
        }
        w.refresh = () => {
          const week = game.dailyDay % DAILY_CYCLE
          const base = game.dailyDay - week
          const ready = dailyReady()
          for (const c of cards) {
            const dayN = base + c.i + 1
            if (c.i < week) setCardState(c, 'claimed', '', claimDay)
            else if (c.i === week && (ready || (game.dailyPass && week !== 0))) setCardState(c, 'ready', '', claimDay)
            else if (c.i === week) setCardState(c, 'wait', clock(dailyWait()), claimDay)
            else setCardState(c, 'wait', `Day ${dayN}`, claimDay)
            liveTitle(c)
          }
          sideAct(passSide)
          sideAct(mileSide)
          passSide.querySelector('.pbtn')?.refresh?.()
          claimAll.style.display = game.dailyPass ? '' : 'none'
          claimAll.classList.toggle('cant', !ready && week === 0)
        }
      },
    })
  }

  return {
    openUpgrades,
    openItems,
    openSell,
    openIndex,
    openRebirth,
    openPlaytime,
    openDaily,
    openLucky,
    openFusion,
    openAscended,
    openBase,
    anyPlayReady,
    anyDailyReady,
    rebirthReady: () => game.jumpPower >= rebirthReq(),
  }
}
