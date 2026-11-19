// The game windows modelled on the reference screens (ui/hud.js frames them):
//   Upgrades (Lucky Jumps / Speed / Carry), Items Shop (back items), Sell
//   Brainrots (what you carry), Index (every brainrot x variant by tier, with
//   the collection bonus), Rebirths, Playtime Rewards and Daily Rewards.
// Every price is money (the reference's premium buttons cost money here, a
// slightly high price). Windows refresh a few times a second through
// `refresh`, which only touches the DOM when something actually changed, so
// buttons keep their pressed state and nothing is rebuilt per tick.
import { CREATURES, DAILY, INDEX_BONUS, ITEMS, PLAYTIME, RARITIES, UPGRADES, VARIANTS } from '../config.js'
import { canAfford, doRebirth, game, incomeOf, indexBonus, indexFound, rebirthMults, rebirthReq, rebirthSkipPrice, save, sellValue, spend } from '../game/state.js'
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
        const box = h('div', 'rb-box', `<div class="rb-warn ol">Rebirth resets your jump power</div><div class="rb-bar"><i></i><span class="ol"></span></div>`)
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
          if (count) await rewards.grant(c.def, c)
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
    anyPlayReady,
    anyDailyReady,
    rebirthReady: () => game.jumpPower >= rebirthReq(),
  }
}
