// Canvas painters for the hub: lego stud surfaces (colour + derived normal map),
// wall signs, the leaderboards and ground decals. Everything is drawn once at
// load (signs repaint once Fredoka has loaded) so the game ships no images.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { heightToNormal, mulberry32 } from '../textures.js'
import { fontReady } from '../propkit.js'

const FONT = 'Fredoka, "Arial Black", sans-serif'

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb = ([r, g, b], k = 1) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`

// --- Lego studs ------------------------------------------------------------------
// One tile = `cells` x `cells` checker squares (colours alternate through
// `colors`), each with `studs` x `studs` round studs: a soft drop shadow, a
// slightly lighter cap, a dark rim and a bright arc where the sun catches it.
// The normal map comes from an analytic height field (raised discs with a
// rounded shoulder), so studs catch real light and shadow at any angle.
const studCache = new Map()
export function paintStuds({ colors, cells = 2, studs = 14, size = 1024, seed = 3, mottle = 0.04 }) {
  const key = JSON.stringify([colors, cells, studs, size, seed])
  if (studCache.has(key)) return studCache.get(key)
  const rand = mulberry32(seed)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const cellPx = size / cells
  const pitch = cellPx / studs
  const r = pitch * 0.27
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const base = hex(colors[(cx + cy) % colors.length])
      ctx.fillStyle = rgb(base)
      ctx.fillRect(cx * cellPx, cy * cellPx, cellPx, cellPx)
      // Faint mottling so big flat squares do not read as flat colour.
      for (let i = 0; i < 18; i++) {
        const k = 1 + (rand() - 0.5) * mottle * 2
        ctx.fillStyle = rgb(base, k)
        ctx.globalAlpha = 0.35
        const w = cellPx * (0.2 + rand() * 0.5)
        ctx.fillRect(cx * cellPx + rand() * (cellPx - w), cy * cellPx + rand() * (cellPx - w), w, w * (0.4 + rand()))
      }
      ctx.globalAlpha = 1
      // Hairline seam between bricks.
      ctx.strokeStyle = rgb(base, 0.86)
      ctx.lineWidth = Math.max(1, pitch * 0.05)
      ctx.strokeRect(cx * cellPx + 0.5, cy * cellPx + 0.5, cellPx - 1, cellPx - 1)
      for (let sy = 0; sy < studs; sy++) {
        for (let sx = 0; sx < studs; sx++) {
          const x = cx * cellPx + (sx + 0.5) * pitch
          const y = cy * cellPx + (sy + 0.5) * pitch
          ctx.fillStyle = 'rgba(0,0,0,0.09)'
          ctx.beginPath()
          ctx.ellipse(x + r * 0.22, y + r * 0.3, r * 1.04, r * 1.0, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = rgb(base, 1.03)
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = rgb(base, 0.8)
          ctx.lineWidth = Math.max(1, r * 0.16)
          ctx.beginPath()
          ctx.arc(x, y, r * 0.9, Math.PI * 0.05, Math.PI * 1.05)
          ctx.stroke()
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'
          ctx.lineWidth = Math.max(1, r * 0.18)
          ctx.beginPath()
          ctx.arc(x, y, r * 0.78, Math.PI * 1.1, Math.PI * 1.75)
          ctx.stroke()
        }
      }
    }
  }
  // Height: discs with a rounded shoulder, on a wrapped lattice.
  const hs = Math.min(size, 512) // the normal map does not need full colour resolution
  const hp = hs / (cells * studs)
  const hr = hp * 0.27
  const h = new Float32Array(hs * hs)
  for (let y = 0; y < hs; y++) {
    const fy = ((y + 0.5) % hp) - hp / 2
    for (let x = 0; x < hs; x++) {
      const fx = ((x + 0.5) % hp) - hp / 2
      const d = Math.hypot(fx, fy)
      const t = Math.min(1, Math.max(0, (hr + 1 - d) / 2))
      h[y * hs + x] = t * t * (3 - 2 * t)
    }
  }
  const out = { color: c, normal: heightToNormal(h, hs, 1.6) }
  studCache.set(key, out)
  return out
}

export function canvasTexture(c, srgb = true, repeat = false) {
  const t = new CanvasTexture(c)
  if (srgb) t.colorSpace = SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}

// A texture whose canvas is painted by `draw(ctx, w, h)` now and again once Fredoka loads.
export function paintedTexture(w, h, draw) {
  const c = canvas(w, h)
  const tex = canvasTexture(c)
  const run = () => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    draw(ctx, w, h)
    tex.needsUpdate = true
  }
  run()
  fontReady.then(run)
  tex.userData.repaint = run
  return tex
}

// Outlined text; `fit` shrinks the font to fit `maxW` px.
export function outlined(ctx, text, x, y, { size = 80, weight = 700, fill = '#fff', stroke = '#13213f', line = 0.16, maxW = 0, align = 'center', italic = false, shadow = true } = {}) {
  let s = size
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${s}px ${FONT}`
  if (maxW) {
    while (ctx.measureText(text).width > maxW && s > 8) {
      s -= 2
      ctx.font = `${italic ? 'italic ' : ''}${weight} ${s}px ${FONT}`
    }
  }
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = s * line
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.strokeText(text, x + s * 0.04, y + s * 0.08)
  }
  if (line > 0) {
    ctx.lineWidth = s * line
    ctx.strokeStyle = stroke
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  return s
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// A big wall sign: lego-checker panel with a white frame and huge outlined lettering.
// lines: [{ text, size, fill }]; skew: degrees the lettering is slanted (italic feel).
export function signTexture({ w = 1024, h = 512, colors, frame = '#ffffff', lines, stroke = '#122046', skew = 0, rotate = 0, studs = 6 }) {
  const studTile = paintStuds({ colors, cells: 2, studs, size: 256, seed: 11 })
  return paintedTexture(w, h, (ctx) => {
    const pat = ctx.createPattern(studTile.color, 'repeat')
    ctx.fillStyle = pat
    ctx.save()
    const scale = h / 512
    ctx.scale(scale, scale)
    ctx.fillRect(0, 0, w / scale, h / scale)
    ctx.restore()
    // Inner vignette for depth.
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7)
    g.addColorStop(0, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const b = h * 0.055
    ctx.lineWidth = b
    ctx.strokeStyle = frame
    ctx.strokeRect(b / 2, b / 2, w - b, h - b)
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rotate * Math.PI) / 180)
    ctx.transform(1, 0, Math.tan((-skew * Math.PI) / 180), 1, 0, 0)
    const total = lines.reduce((s, l) => s + l.size * 1.05, 0)
    let y = -total / 2
    for (const l of lines) {
      y += (l.size * 1.05) / 2
      outlined(ctx, l.text, 0, y, { size: l.size, fill: l.fill ?? '#ffffff', stroke, line: 0.14, maxW: w * 0.86 })
      y += (l.size * 1.05) / 2
    }
    ctx.restore()
  })
}

// Ground decal text ("Common" at the lane start): white letters, fat black outline.
export function decalTexture(text, { w = 1024, h = 256, fill = '#ffffff', stroke = '#151515' } = {}) {
  return paintedTexture(w, h, (ctx) => {
    outlined(ctx, text, w / 2, h / 2 + 6, { size: h * 0.78, fill, stroke, line: 0.2, maxW: w * 0.94, shadow: false })
  })
}

// The jump power icon: a little yellow figure leaping up in front of a blue arrow.
// (x, y) = centre, s = size in px.
export function paintJumper(ctx, x, y, s) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 100, s / 100)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // Arrow behind.
  ctx.beginPath()
  ctx.moveTo(0, -50)
  ctx.lineTo(30, -18)
  ctx.lineTo(13, -18)
  ctx.lineTo(13, 18)
  ctx.lineTo(-13, 18)
  ctx.lineTo(-13, -18)
  ctx.lineTo(-30, -18)
  ctx.closePath()
  ctx.fillStyle = '#2f86ff'
  ctx.strokeStyle = '#0d2a5a'
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.fill()
  // Limbs: arms up (yellow), legs kicked (green).
  const limb = (x0, y0, x1, y1, c) => {
    ctx.strokeStyle = '#0d2a5a'
    ctx.lineWidth = 17
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.strokeStyle = c
    ctx.lineWidth = 10
    ctx.stroke()
  }
  limb(-8, 6, -32, -14, '#ffd21f')
  limb(8, 6, 30, -16, '#ffd21f')
  limb(-6, 28, -24, 46, '#56d64a')
  limb(6, 28, 20, 48, '#56d64a')
  // Torso and head.
  ctx.fillStyle = '#2f86ff'
  ctx.strokeStyle = '#0d2a5a'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.rect(-12, 2, 24, 28)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffd21f'
  ctx.beginPath()
  ctx.arc(0, -10, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#0d2a5a'
  ctx.fillRect(-6, -14, 3, 5)
  ctx.fillRect(3, -14, 3, 5)
  ctx.restore()
}

// --- Number formatting (K, M, B, T, Qa, ...) ----------------------------------------
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc']
export function short(n) {
  if (n < 1000) return String(Math.floor(n))
  let i = 0
  while (n >= 1000 && i < SUFFIX.length - 1) {
    n /= 1000
    i++
  }
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(1)
  return s.replace(/\.0$/, '') + SUFFIX[i]
}
