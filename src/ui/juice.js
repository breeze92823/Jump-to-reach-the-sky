// DOM juice for the HUD windows: confetti bursts, icons flying into a counter,
// floating "+$3K" texts, bumps and shakes. Everything is pooled-free but short
// lived (Web Animations API, removed on finish) and capped so a phone never
// gets hundreds of nodes at once.
const layer = document.createElement('div')
layer.className = 'juice'
document.body.appendChild(layer)

let live = 0
const MAX = matchMedia('(pointer: coarse)').matches ? 90 : 180
const rnd = (a, b) => a + Math.random() * (b - a)

function node(cls, html = '') {
  const e = document.createElement('div')
  e.className = cls
  if (html) e.innerHTML = html
  layer.appendChild(e)
  live++
  return e
}
function done(e) {
  e.remove()
  live--
}
// Centre of an element (or a {x, y} point).
export function centerOf(el) {
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 }
  if (el.x !== undefined && !el.getBoundingClientRect) return el
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// Confetti + sparkles exploding out of a point, falling with a little gravity.
export function confetti(at, { count = 26, colors = ['#ffe14a', '#5dff4a', '#3fb7ff', '#ff5fa8', '#ffffff'], power = 1, stars = true } = {}) {
  const { x, y } = centerOf(at)
  const n = Math.min(count, MAX - live)
  for (let i = 0; i < n; i++) {
    const star = stars && i % 4 === 0
    const e = node(star ? 'jz-star' : 'jz-bit')
    const c = colors[i % colors.length]
    e.style.background = star ? 'none' : c
    if (star) e.style.color = c
    const s = rnd(0.6, 1.3)
    const a = rnd(0, Math.PI * 2)
    const v = rnd(90, 260) * power
    const dx = Math.cos(a) * v
    const dy = Math.sin(a) * v - rnd(60, 160) * power
    const fall = rnd(140, 260)
    const spin = rnd(-720, 720)
    const dur = rnd(800, 1400)
    e.style.left = `${x}px`
    e.style.top = `${y}px`
    e.animate(
      [
        { transform: `translate(-50%, -50%) scale(${s * 0.3}) rotate(0deg)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(${s}) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + fall}px)) scale(${s * 0.8}) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    ).onfinish = () => done(e)
  }
}

// A ring of light expanding from a point.
export function ring(at, color = '#ffffff', size = 160) {
  if (live >= MAX) return
  const { x, y } = centerOf(at)
  const e = node('jz-ring')
  e.style.left = `${x}px`
  e.style.top = `${y}px`
  e.style.borderColor = color
  e.animate(
    [
      { width: '10px', height: '10px', opacity: 0.9 },
      { width: `${size}px`, height: `${size}px`, opacity: 0 },
    ],
    { duration: 500, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
  ).onfinish = () => done(e)
}

// n copies of `html` (an icon) arcing from `from` into `to`; onArrive(i) per icon.
export function flyTo(from, to, html, n = 8, onArrive = null) {
  const a = centerOf(from)
  const b = centerOf(to)
  n = Math.min(n, Math.max(0, MAX - live))
  for (let i = 0; i < n; i++) {
    const e = node('jz-fly', html)
    const sx = a.x + rnd(-40, 40)
    const sy = a.y + rnd(-30, 30)
    const mx = (sx + b.x) / 2 + rnd(-120, 120)
    const my = Math.min(sy, b.y) - rnd(60, 180)
    e.style.left = '0px'
    e.style.top = '0px'
    const delay = i * 55
    const anim = e.animate(
      [
        { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(0.2)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(0.55)`, opacity: 0.9 },
      ],
      { duration: 820, delay, easing: 'cubic-bezier(0.45, 0, 0.6, 1)', fill: 'backwards' },
    )
    anim.onfinish = () => {
      done(e)
      onArrive?.(i)
      if (to?.getBoundingClientRect) bump(to)
    }
  }
}

// Text rising out of a point ("+$3K", "+5").
export function floatText(at, text, color = '#7dff4a', size = 1) {
  if (live >= MAX) return
  const { x, y } = centerOf(at)
  const e = node('jz-text')
  e.textContent = text
  e.style.color = color
  e.style.left = `${x}px`
  e.style.top = `${y}px`
  e.style.fontSize = `calc(${size} * clamp(18px, 3.6vmin, 34px))`
  e.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
      { transform: 'translate(-50%, -90%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -160%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -220%) scale(0.9)', opacity: 0 },
    ],
    { duration: 1200, easing: 'ease-out' },
  ).onfinish = () => done(e)
}

// Bouncy scale bump.
export function bump(el, k = 1.18) {
  el?.animate?.([{ transform: 'scale(1)' }, { transform: `scale(${k})` }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' })
}
// "No!" shake.
export function shake(el) {
  el?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8%)' }, { transform: 'translateX(7%)' }, { transform: 'translateX(-4%)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out' })
}
// A white flash over the whole screen (rebirth, big reveals).
export function flash(color = '#ffffff', ms = 500) {
  const e = node('jz-flash')
  e.style.background = color
  e.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).onfinish = () => done(e)
}
