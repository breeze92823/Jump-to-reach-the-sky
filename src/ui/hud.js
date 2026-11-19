// The game HUD, plain DOM over the canvas:
//  - top: Training / Home / Shops teleports
//  - left: Index, Rebirth, Store, Playtime, Daily tiles and the Smart Jump toggle
//  - bottom-left: money (+ income per second) and Jump Power, active boosts
//  - right: offers (Starter Pack, VIP, 1.5x Jump Power; money prices only) and
//    the zone bar: every zone of the lane in its colour, the current one
//    stretched with its name, your face sliding up it as you climb
//  - the brainrot you carry (Drop), "E" interaction prompts, toasts, the
//    new-zone banner, and the windows (Store, Rebirth, Index, Daily, Playtime, Buy)
// Everything keeps clear of the Bloxity toolbar and chat (reserved areas) and
// re-lays out on resize; touch gets bigger targets and a top stats row.
import './hud.css'
import { Vector3 } from 'three'
import { INDEX_BONUS, STORE, TELEPORTS, ZONES } from '../config.js'
import { addBoost, bus, canAfford, creatureInfo, game, incomeOf, indexBonus, indexFound, spend, totalIncome } from '../game/state.js'
import { LEVELS, laneProgress } from '../game/levels.js'
import { player } from '../player.js'
import { onKey } from '../input.js'
import { sfx } from '../audio/hub.js'
import { setDucked } from '../audio/core.js'
import { short } from '../hub/paint.js'
import { RARITY_COLORS, SPECIES_NAMES, VARIANT_COLORS, VARIANT_NAMES } from '../hub/creatures.js'
import { ICONS } from './icons.js'
import { createThumbs } from './thumbs.js'
import { createPanels } from './panels.js'
import { createRewards } from './rewards.js'
import * as juice from './juice.js'
import './windows.css'
import * as bloxity from '../bloxity.js'

function h(tag, cls = '', html = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const money = (n) => `$${short(n)}`
const clock = (s) => {
  s = Math.max(0, Math.ceil(s))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`
}
const nameOf = (d) => (d.variant !== 'normal' ? VARIANT_NAMES[d.variant] + ' ' : '') + SPECIES_NAMES[d.species]

export function createHud({ renderer, camera, hub, teleport }) {
  const thumb = createThumbs(renderer)
  const root = h('div', 'hud')
  document.body.appendChild(root)

  // Every HUD button clicks.
  const btn = (cls, html, fn) => {
    const b = h('button', cls, html)
    b.type = 'button'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      sfx.ui('click')
      fn(b)
    })
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    return b
  }

  // --- Top nav ----------------------------------------------------------------------------
  const nav = h('div', 'hud-nav')
  const go = (where) => {
    const t = TELEPORTS[where]
    teleport(t.x, t.y, t.z, t.facing)
    sfx.whoosh(null)
  }
  nav.append(btn('nav-btn training', 'Training', () => go('training')), btn('nav-btn home', 'Home', () => go('home')), btn('nav-btn shops', 'Shops', () => go('shops')))
  root.append(nav)

  // --- Left tiles -----------------------------------------------------------------------------
  const left = h('div', 'hud-left')
  const tile = (cls, cap, icon, fn) => {
    const b = btn(`tile ${cls}`, `<span class="cap">${cap}</span>${icon}<span class="badge">!</span>`, fn)
    return b
  }
  const tIndex = tile('index', 'Index', ICONS.book, () => openIndex())
  const tRebirth = tile('rebirth', 'Rebirth', ICONS.rebirth, () => openRebirth())
  const tStore = tile('store', 'Store', ICONS.store, () => openStore('perks'))
  const tPlay = tile('playtime', 'Playtime', ICONS.clock, () => openPlaytime())
  const playReady = h('span', 'ready', 'Ready')
  playReady.style.display = 'none'
  tPlay.append(playReady)
  const tDaily = tile('daily', 'Daily', ICONS.calendar, () => openDaily())
  const smart = btn('smart', '', () => {
    game.smartJump = !game.smartJump
    toast(game.smartJump ? 'Smart Jump ON: jumps stop just above the next wall.' : 'Smart Jump OFF: full power jumps!')
  })
  const spacer = h('div', 'spacer')
  left.append(tIndex, spacer, tRebirth, tStore, tPlay, tDaily, smart)
  root.append(left)

  // --- Stats ----------------------------------------------------------------------------------
  const stats = h('div', 'hud-stats')
  const boosts = h('div', 'boosts')
  const mRow = h('div', 'stat money', `${ICONS.cash}<span class="v">$0</span><span class="rate"></span>`)
  const jRow = h('div', 'stat jump', `${ICONS.jumper}<span class="v">0</span>`)
  stats.append(boosts, mRow, jRow)
  root.append(stats)
  const mV = mRow.querySelector('.v')
  const mRate = mRow.querySelector('.rate')
  const jV = jRow.querySelector('.v')

  // --- Offers ---------------------------------------------------------------------------------------
  const offers = h('div', 'hud-offers')
  const oStarter = btn('offer starter', '', () => buyStarter())
  oStarter.innerHTML = `<div class="burst"></div><div class="title">Starter Pack</div><div class="art"></div><div class="lines"><div class="o">+30% Jump Power (30m)</div><div class="g">+ Diamond Pengwaddle</div></div><div class="limited">LIMITED OFFER</div><div class="price">ONLY ${money(STORE.starter.price)}</div>`
  const oVip = btn('offer vip', `<div class="burst"></div><div class="price">${money(STORE.vip.price)}</div><div class="art">${ICONS.vip}</div><div class="name">VIP</div>`, () => buyPerk('vip'))
  const oJump = btn('offer jump15', `<div class="burst"></div><div class="price">${money(STORE.jump15.price)}</div><div class="art">${ICONS.jumper}</div><div class="name">1.5x Jump Power</div>`, () => buyPerk('jump15'))
  offers.append(oStarter, oVip, oJump)
  root.append(offers)

  // --- Zone bar --------------------------------------------------------------------------------------
  const bar = h('div', 'hud-bar')
  const segs = ZONES.map((z) => {
    const s = h('div', 'seg', `<span>${z.name}</span>`)
    s.style.background = `linear-gradient(90deg, ${z.color}, ${z.color}dd)`
    bar.append(s)
    return s
  })
  const marker = h('div', 'hud-marker', ICONS.face)
  root.append(bar, marker)

  // --- Carry chip, prompt, toasts, banner, modal --------------------------------------------------------
  const carry = h('div', 'hud-carry')
  const carryImg = h('img')
  carryImg.alt = ''
  const carryInfo = h('div', 'info')
  carry.append(carryImg, carryInfo, btn('chip-btn', 'Drop (Q)', () => hub.drop()))
  root.append(carry)
  const prompt = h('div', 'hud-prompt', '<div class="key">E</div><div><div class="t"></div><div class="s"></div></div>')
  const pT = prompt.querySelector('.t')
  const pS = prompt.querySelector('.s')
  const pKey = prompt.querySelector('.key')
  let current = null
  prompt.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (current) {
      sfx.ui('click')
      current.action()
    }
  })
  const toasts = h('div', 'hud-toasts')
  const banner = h('div', 'hud-banner', '<div class="b1"></div><div class="b2"></div>')
  const modal = h('div', 'hud-modal')
  modal.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (e.target === modal) closeWindow()
  })
  root.append(prompt, toasts, banner, modal)

  // --- Toasts & banner ------------------------------------------------------------------------------------
  function toast(text, kind = 'info') {
    const t = h('div', `toast ${kind}`)
    t.textContent = text
    toasts.prepend(t)
    while (toasts.children.length > 4) toasts.lastChild.remove()
    setTimeout(() => t.classList.add('out'), kind === 'rare' ? 3800 : 2600)
    setTimeout(() => t.remove(), kind === 'rare' ? 4300 : 3100)
  }
  let bannerT = 0
  function showBanner({ title, sub, color }) {
    banner.querySelector('.b1').textContent = title
    banner.querySelector('.b1').style.color = color ?? '#fff'
    banner.querySelector('.b2').textContent = sub ?? ''
    banner.classList.add('show')
    bannerT = 2.8
  }
  bus.on('toast', ({ text, kind }) => toast(text, kind))
  bus.on('banner', showBanner)

  // --- Windows ----------------------------------------------------------------------------------------------------
  // The frame from the reference screens: a coloured title bar (icon, outlined
  // title, optional counter, red X) a little wider than the green panel under
  // it, an optional footer below. build(body, w) fills it; w.main is the row the
  // panel sits in (side columns go there), w.foot the footer, w.count the counter.
  // w.refresh (or opts.refresh) runs a few times a second while it is open.
  let win = null // { body, refresh() }
  function openWindow(title, { small = false, theme = 'blue', icon = '', cls = '', count = false, refresh = null, build }) {
    const switching = !!win
    modal.innerHTML = ''
    const w = h('div', `gw t-${theme}${small ? ' small' : ''}${cls ? ' ' + cls : ''}`)
    const head = h('div', 'gw-head', `${icon ? `<div class="gw-ico">${icon}</div>` : ''}<div class="gw-title ol">${title}</div>`)
    const cnt = h('div', 'gw-count ol')
    if (count) head.append(cnt)
    head.append(btn('gw-x', '<span class="ol">X</span>', () => closeWindow()))
    const main = h('div', 'gw-main')
    const body = h('div', 'gw-body win-body')
    main.append(body)
    const foot = h('div', 'gw-foot')
    w.append(head, main, foot)
    modal.append(w)
    modal.classList.add('show')
    if (document.pointerLockElement) document.exitPointerLock?.()
    setDucked(true)
    sfx.ui('open')
    if (!switching) sfx.whoosh(null)
    win = { body, el: w, main, foot, count: cnt, refresh: null }
    const api = win
    build(body, api)
    if (win !== api) return
    win.refresh = refresh ?? api.refresh ?? null
    win.refresh?.(body)
    foot.classList.toggle('empty', !foot.children.length)
  }
  function closeWindow() {
    if (!win) return
    win = null
    const w = modal.firstChild
    modal.classList.add('closing')
    setTimeout(() => {
      if (win) return // another window opened meanwhile
      modal.classList.remove('show', 'closing')
      modal.innerHTML = ''
    }, 140)
    if (w) w.style.pointerEvents = 'none'
    setDucked(false)
    sfx.ui('close')
  }
  // Esc closes a window before the portal menu gets it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'Escape' && win) {
        e.stopImmediatePropagation()
        e.preventDefault()
        closeWindow()
      }
    },
    { capture: true },
  )

  // A buy button that knows whether you can afford it.
  function priceButton(price, label, onBuy) {
    const b = btn('buy', '', () => {
      if (!canAfford(price)) {
        sfx.ui('error')
        toast(`You need ${money(price - game.money)} more!`, 'error')
        return
      }
      onBuy()
    })
    b.update = () => {
      b.textContent = label ?? money(price)
    }
    b.update()
    return b
  }

  // Generic purchase / confirm (world things: pads, slots, skip walls, selling).
  bus.on('confirm', (o) => {
    openWindow(o.title, {
      small: true,
      build(body) {
        body.append(h('p', '', o.text))
        if (o.price) body.append(h('div', 'big-row', `${ICONS.cash}<span style="color:#7dff4a">${money(o.price)}</span>`))
        const need = h('p')
        const b = btn('buy', o.cta ?? `Buy ${money(o.price)}`, () => {
          if (o.price && !canAfford(o.price)) {
            sfx.ui('error')
            return
          }
          if (o.onBuy() !== false) closeWindow()
          else sfx.ui('error')
        })
        body.append(need, b)
        win.refreshBuy = () => {
          const short2 = o.price && !canAfford(o.price)
          b.disabled = !!short2
          need.textContent = short2 ? `You need ${money(o.price - game.money)} more.` : ''
        }
      },
      refresh() {
        win?.refreshBuy?.()
      },
    })
  })

  // --- Store -----------------------------------------------------------------------------------------------------
  function freeSlot() {
    for (let i = 0; i < game.slotsUnlocked; i++) if (!game.slots[i]) return i
    return -1
  }
  function grant(data) {
    const i = freeSlot()
    if (i >= 0) {
      game.slots[i] = { ...data, bank: 0 }
      bus.emit('slots')
      return true
    }
    if (!hub.carry.has()) return hub.carry.pick(data)
    return false
  }
  function buyStarter() {
    if (game.perks.starter) return
    const s = STORE.starter
    openWindow('Starter Pack', {
      small: true,
      build(body) {
        const art = h('div', 'big-row', `<img src="${thumb(s.creature.species, s.creature.variant)}" alt="" style="width:110px;height:110px">`)
        body.append(art, h('p', '', `+30% Jump Power for ${s.minutes} minutes and a <b style="color:#7ff0ff">Diamond Pengwaddle</b> (${money(incomeOf(s.creature))}/s). One time only!`))
        const b = priceButton(s.price, `Buy ${money(s.price)}`, () => {
          if (freeSlot() < 0 && hub.carry.has()) {
            toast('Free a base slot (or your hands) first!', 'error')
            return
          }
          if (!spend(s.price)) return
          game.perks.starter = true
          addBoost(s.boost, s.minutes)
          grant(s.creature)
          sfx.buy()
          toast('Starter Pack unlocked!', 'good')
          closeWindow()
        })
        body.append(b)
      },
    })
  }
  function buyPerk(id) {
    const p = STORE[id]
    if (game.perks[id]) {
      toast('Already yours!')
      return
    }
    const what = id === 'vip' ? `VIP: x${STORE.vip.money} money and x${STORE.vip.jump} Jump Power training, forever.` : `x${STORE.jump15.jump} Jump Power from all training, forever.`
    bus.emit('confirm', {
      title: id === 'vip' ? 'VIP' : '1.5x Jump Power',
      text: what,
      price: p.price,
      onBuy() {
        if (!spend(p.price)) return false
        game.perks[id] = true
        sfx.buy()
        toast(id === 'vip' ? 'You are VIP now!' : '1.5x Jump Power unlocked!', 'good')
        return true
      },
    })
  }
  function openStore(tab = 'perks') {
    openWindow('Store', {
      build(body) {
        const tabs = h('div', 'tabs')
        const cards = h('div', 'cards')
        const tPerks = btn('tab', 'Perks', () => show('perks'))
        const tBoosts = btn('tab', 'Boosts', () => show('boosts'))
        tabs.append(tPerks, tBoosts)
        body.append(h('p', '', 'Everything here costs money you earn in game.'), tabs, cards)
        const show = (which) => {
          tab = which
          tPerks.classList.toggle('on', which === 'perks')
          tBoosts.classList.toggle('on', which === 'boosts')
          cards.innerHTML = ''
          const card = (art, name, desc, button) => {
            const c = h('div', 'card', `<div class="art">${art}</div><div class="n">${name}</div><div class="d">${desc}</div>`)
            c.append(button)
            cards.append(c)
          }
          if (which === 'perks') {
            const s = STORE.starter
            const own = (b) => {
              b.disabled = true
              b.classList.add('owned')
              b.textContent = 'Owned'
              return b
            }
            const st = btn('buy', money(s.price), () => {
              closeWindow()
              buyStarter()
            })
            card(`<img src="${thumb('pengwaddle', 'diamond')}" alt="">`, 'Starter Pack', `+30% Jump Power (30m) + <b>Diamond Pengwaddle</b>`, game.perks.starter ? own(st) : st)
            const v = btn('buy', money(STORE.vip.price), () => buyPerk('vip'))
            card(ICONS.vip, 'VIP', `<b>x${STORE.vip.money}</b> money, <b>x${STORE.vip.jump}</b> training, forever`, game.perks.vip ? own(v) : v)
            const j = btn('buy', money(STORE.jump15.price), () => buyPerk('jump15'))
            card(ICONS.jumper, '1.5x Jump Power', `<b>x${STORE.jump15.jump}</b> Jump Power from all training, forever`, game.perks.jump15 ? own(j) : j)
          } else {
            const colors = { money2: '#5dff4a', train2: '#3fb7ff', lucky: '#ff7af2' }
            for (const id of ['money2', 'train2', 'lucky']) {
              const b = STORE.boosts[id]
              const left = game.boosts[id]
              const desc = (id === 'money2' ? 'Double money from your base' : id === 'train2' ? 'Double Jump Power from training' : 'Rare variants spawn 3x as often') + ` for <b>${b.minutes} min</b>` + (left ? `<br>Active: <b>${clock(left)}</b>` : '')
              card(ICONS.potion(colors[id]), b.name, desc, priceButton(b.price, money(b.price), () => {
                if (!spend(b.price)) return
                addBoost(id, b.minutes)
                sfx.buy()
                toast(`${b.name} active for ${b.minutes} minutes!`, 'good')
                show('boosts')
              }))
            }
          }
        }
        show(tab)
      },
    })
  }
  bus.on('store', (tab) => openStore(tab))

  // --- Game windows (ui/panels.js) + rewards (ui/rewards.js) -----------------------------------------------------------
  const rewards = createRewards({ hub, thumb, toast, moneyEl: mRow, jumpEl: jRow })
  const panels = createPanels({ openWindow, closeWindow, btn, thumb, toast, hub, go, showBanner, moneyEl: mRow, jumpEl: jRow, rewards })
  const { openIndex, openRebirth, openPlaytime, openDaily } = panels
  const WINDOWS = { upgrades: panels.openUpgrades, items: panels.openItems, sell: panels.openSell, index: openIndex, rebirth: openRebirth, playtime: openPlaytime, daily: openDaily }
  bus.on('window', (id) => WINDOWS[id]?.())

  // Lucky Jump: a big pop of text, confetti and a magic chime.
  let luckyCool = 0
  bus.on('lucky', (gain) => {
    if (luckyCool > 0) return
    luckyCool = 0.6
    sfx.lucky()
    const at = { x: innerWidth / 2, y: innerHeight * 0.38 }
    juice.floatText(at, `LUCKY JUMP! +${short(gain)}`, '#5dff4a', 1.3)
    juice.confetti(at, { count: 22, colors: ['#5dff4a', '#ffffff', '#ffe14a'] })
    juice.bump(jRow, 1.3)
  })
  // A new Index entry: the counter ticks, and every bonus step gets a fanfare.
  bus.on('discover', () => {
    const f = indexFound()
    if (f > 0 && f % INDEX_BONUS.every === 0) {
      sfx.zoneUp()
      showBanner({ title: 'INDEX BONUS!', sub: `+${Math.round(indexBonus() * 100)}% money from your brainrots`, color: '#5cc0ff' })
      juice.confetti(tIndex, { count: 30 })
    }
    juice.bump(tIndex, 1.25)
  })


  // --- Keys -----------------------------------------------------------------------------------------------------------
  onKey('KeyE', () => {
    if (!win && current) current.action()
  })
  onKey('KeyQ', () => {
    if (!win) hub.drop()
  })

  // --- Layout: keep clear of Bloxity's toolbar + chat, fit the left tiles to the space left ---------------------------------
  let areas = []
  function layout() {
    const W = window.innerWidth
    const H = window.innerHeight
    const touch = document.body.classList.contains('touch-ui')
    const pad = clamp(Math.min(W, H) * 0.016, 8, 16)
    // Nav: centred on the top edge; slid right of the toolbar if they would
    // overlap, or dropped below it when there is no room beside it.
    const navW = nav.offsetWidth || 360
    let nl = (W - navW) / 2
    let navTop = pad
    for (const a of areas) {
      if (a.top > 20 || a.left > nl + navW || a.left + a.width < nl) continue
      const right = a.left + a.width + 8
      if (right + navW <= W - 70) nl = Math.max(nl, right)
      else navTop = Math.max(navTop, a.top + a.height + 6)
    }
    root.style.setProperty('--nav-top', `${navTop}px`)
    nav.style.left = `${nl + navW / 2}px`
    const navBottom = navTop + (nav.offsetHeight || 50)
    // Left tiles: under the reserved boxes on the left, sized to fit above the stats / joystick.
    let leftTop = 0
    for (const a of areas) if (a.left < 160) leftTop = Math.max(leftTop, a.top + a.height)
    const bottomReserve = touch ? clamp(H * 0.34, 150, 230) : (stats.offsetHeight || 110) + pad * 2
    const capPx = 0.3
    const startTop = leftTop + 12
    const avail = H - startTop - bottomReserve
    const colTile = avail / (3 * (1 + capPx) + capPx + 0.6 + 0.2)
    let rowBottom = 0
    if (colTile >= 38) {
      const t = clamp(colTile, 38, Math.max(38, Math.min(82, W * 0.14)))
      left.classList.remove('row')
      root.style.setProperty('--tile', `${t}px`)
      root.style.setProperty('--left-top', `${startTop + t * capPx}px`)
      left.style.left = ''
    } else {
      // Too short (landscape phone): one row at the top, right of the chat.
      let rx = pad
      let tb = pad
      for (const a of areas) {
        if (a.top < 10) tb = Math.max(tb, a.top + a.height)
        else rx = Math.max(rx, a.left + a.width + 8)
      }
      const t = clamp((W - rx - 80) / 7.2, 36, 58)
      left.classList.add('row')
      root.style.setProperty('--tile', `${t}px`)
      const top = Math.max(tb, navBottom) + t * capPx + 8
      root.style.setProperty('--left-top', `${top}px`)
      left.style.left = `${rx}px`
      rowBottom = top + t
    }
    root.style.setProperty('--toast-top', `${Math.max(navBottom, rowBottom) + 8}px`)
    root.style.setProperty('--stats-top', `${Math.max(navBottom, rowBottom) + 6}px`)
    // Right side: offers + zone bar below the nav (and the touch buttons), above the touch cluster.
    const top = Math.max(navTop + 20, touch ? pad + 60 : 0, H * 0.12)
    const bottom = touch ? clamp(Math.min(W, H) * 0.2 + 120, 150, 240) : H * 0.14
    root.style.setProperty('--bar-top', `${top}px`)
    root.style.setProperty('--bar-bottom', `${bottom}px`)
    root.style.setProperty('--offers-top', `${top}px`)
    root.classList.toggle('bar-off', H - top - bottom < 150)
  }
  bloxity.onReservedAreas((a) => {
    areas = a
    layout()
  })
  window.addEventListener('resize', layout)
  new MutationObserver(layout).observe(document.body, { attributes: true, attributeFilter: ['class'] })
  setTimeout(layout, 300)

  // --- Per frame --------------------------------------------------------------------------------------------------------
  const shown = { money: '', rate: '', jump: '', smart: null, carry: null, zone: -1, boosts: '' }
  const v = new Vector3()
  let slow = 0
  let jumpBump = 0
  let lastJump = game.jumpPower

  return {
    toast,
    update(dt) {
      // Money / jump power.
      const m = money(game.money)
      if (m !== shown.money) mV.textContent = shown.money = m
      const j = short(game.jumpPower)
      if (j !== shown.jump) {
        jV.textContent = shown.jump = j
        if (game.jumpPower > lastJump) {
          jRow.classList.remove('bump')
          void jRow.offsetWidth
          jRow.classList.add('bump')
        }
        lastJump = game.jumpPower
      }
      if (game.smartJump !== shown.smart) {
        shown.smart = game.smartJump
        smart.textContent = `Smart Jump ${game.smartJump ? 'ON' : 'OFF'}`
        smart.classList.toggle('on', game.smartJump)
      }
      // Prompt: the closest offer, pinned over its spot in the world.
      current = hub.prompt ?? null
      if (current && !win) {
        v.set(current.x, current.y, current.z).project(camera)
        if (v.z < 1) {
          const x = clamp((v.x * 0.5 + 0.5) * window.innerWidth, 70, window.innerWidth - 70)
          const y = clamp((-v.y * 0.5 + 0.5) * window.innerHeight, 70, window.innerHeight - 20)
          prompt.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
          pT.textContent = current.text
          pS.textContent = current.sub ?? ''
          pKey.textContent = document.body.classList.contains('touch-ui') ? '☝' : current.key ?? 'E'
          prompt.classList.add('show')
        } else prompt.classList.remove('show')
      } else prompt.classList.remove('show')
      luckyCool = Math.max(0, luckyCool - dt)
      // Banner.
      if (bannerT > 0) {
        bannerT -= dt
        if (bannerT <= 0) banner.classList.remove('show')
      }
      // A few times a second: the rest.
      slow -= dt
      if (slow > 0) return
      slow = 0.2
      const rate = `+${money(totalIncome())}/s`
      if (rate !== shown.rate) mRate.textContent = shown.rate = rate
      // Carry chip.
      const cd = hub.carry.data
      const key = cd ? cd.species + cd.variant + hub.carry.count + '/' + game.carryMax : ''
      if (key !== shown.carry) {
        shown.carry = key
        carry.classList.toggle('show', !!cd)
        if (cd) {
          carryImg.src = thumb(cd.species, cd.variant)
          const info = creatureInfo(cd.species)
          carryInfo.innerHTML = `<div class="n" style="color:${cd.variant === 'normal' ? '#fff' : VARIANT_COLORS[cd.variant]}">${nameOf(cd)}</div><div><span style="color:${RARITY_COLORS[info.rarity]}">${info.rarity}</span> <span style="color:#7dff4a">${money(incomeOf(cd))}/s</span></div><div class="hint">${game.carryMax > 1 ? `Carrying ${hub.carry.count}/${game.carryMax} - ` : ""}Take it to your base!</div>`
        }
      }
      // Boost chips.
      const bs = Object.entries(game.boosts)
        .map(([id, s]) => `<span class="boost">${STORE.boosts[id]?.name ?? id} ${clock(s)}</span>`)
        .join('')
      if (bs !== shown.boosts) boosts.innerHTML = shown.boosts = bs
      // Badges.
      const playOn = panels.anyPlayReady()
      tPlay.classList.toggle('alert', playOn)
      playReady.style.display = playOn ? '' : 'none'
      tDaily.classList.toggle('alert', panels.anyDailyReady())
      tRebirth.classList.toggle('alert', panels.rebirthReady())
      oStarter.classList.toggle('owned', game.perks.starter)
      oVip.classList.toggle('owned', game.perks.vip)
      oJump.classList.toggle('owned', game.perks.jump15)
      if (!oStarter.dataset.art) {
        oStarter.dataset.art = '1'
        oStarter.querySelector('.art').innerHTML = `<img src="${thumb(STORE.starter.creature.species, STORE.starter.creature.variant)}" alt="">`
      }
      // Zone bar: current zone stretched, the face at your spot along the lane.
      const zi = Math.max(0, game.level)
      if (zi !== shown.zone) {
        shown.zone = zi
        segs.forEach((s, i) => s.classList.toggle('cur', i === zi))
      }
      const p = player.position
      const prog = laneProgress(p.x, p.z) * LEVELS.length
      const seg = segs[Math.min(segs.length - 1, Math.floor(prog))]
      const br = bar.getBoundingClientRect()
      const sr = seg.getBoundingClientRect()
      const frac = prog - Math.floor(prog)
      const y = sr.bottom - frac * sr.height
      marker.style.bottom = `${window.innerHeight - clamp(y, br.top + 6, br.bottom - 6)}px`
      // Open window numbers.
      win?.refresh?.()
    },
  }
}
