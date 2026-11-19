// The LEADERS corner (north wall, far west): the big LEADERS sign and two
// leaderboards on stepped wooden stands, "Total Money Earned" and "Highest
// Jump Power". With the game server connected they show its real top players and
// your rank (net.js); offline the names are generated and the numbers creep up
// while you watch. The local player's own row sits at the bottom of each board.
import { Group } from 'three'
import { HUB } from '../config.js'
import { net } from '../net.js'
import { mulberry32 } from '../textures.js'
import { lego, solid, wbox } from './kit.js'
import { outlined, paintedTexture, roundRect, short, signTexture } from './paint.js'
import { signPanel, wallSign } from './signs.js'

const SYL = ['zor', 'pix', 'nova', 'lu', 'kai', 'ber', 'mo', 'zen', 'tri', 'ox', 'ra', 'vex', 'sky', 'jum', 'pa', 'lo', 'fi', 'qua', 'dri', 'mel']
function names(seed, n) {
  const r = mulberry32(seed)
  const out = []
  for (let i = 0; i < n; i++) {
    let s = ''
    const k = 2 + Math.floor(r() * 2)
    for (let j = 0; j < k; j++) s += SYL[Math.floor(r() * SYL.length)]
    s = s[0].toUpperCase() + s.slice(1)
    if (r() < 0.5) s += Math.floor(r() * 999)
    else if (r() < 0.3) s += '_' + SYL[Math.floor(r() * SYL.length)]
    out.push(s)
  }
  return out
}

const AVATAR = ['#ffcf9e', '#f2b07a', '#8d5a3b', '#ffd9b8', '#c98a5a']

function boardTexture(title, rows, you) {
  const W = 512
  const H = 700
  return paintedTexture(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#fbeeb8')
    g.addColorStop(1, '#ecd389')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    outlined(ctx, title, W / 2, 46, { size: 44, fill: '#ffffff', stroke: '#3a2a12', line: 0.18, maxW: W - 40 })
    const top = 92
    const rowH = 33
    rows.forEach((r, i) => {
      const y = top + i * rowH
      if (i < 3) {
        ctx.fillStyle = ['rgba(255,210,60,0.55)', 'rgba(210,220,235,0.6)', 'rgba(222,150,90,0.45)'][i]
        roundRect(ctx, 14, y - rowH / 2 + 2, W - 28, rowH - 4, 8)
        ctx.fill()
      } else if (i % 2) {
        ctx.fillStyle = 'rgba(120,80,20,0.07)'
        ctx.fillRect(14, y - rowH / 2 + 2, W - 28, rowH - 4)
      }
      outlined(ctx, String(i + 1), 34, y, { size: 24, fill: '#2a2a2a', line: 0, shadow: false })
      ctx.fillStyle = AVATAR[i % AVATAR.length]
      ctx.beginPath()
      ctx.arc(66, y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3b2412'
      ctx.fillRect(56, y - 12, 20, 6)
      outlined(ctx, r.name, 86, y, { size: 24, fill: '#1e2a4a', line: 0, align: 'left', shadow: false, maxW: 250 })
      outlined(ctx, short(r.value), W - 26, y, { size: 24, fill: '#1e2a4a', line: 0, align: 'right', shadow: false })
    })
    // The local player's own standing.
    const y = H - 34
    ctx.fillStyle = 'rgba(60,200,80,0.35)'
    roundRect(ctx, 10, y - 22, W - 20, 44, 10)
    ctx.fill()
    outlined(ctx, you.rank == null ? '-' : `#${you.rank.toLocaleString()}`, 28, y, { size: 24, fill: '#ffffff', stroke: '#1a5a22', line: 0.2, align: 'left' })
    outlined(ctx, 'You', 150, y, { size: 26, fill: '#ffffff', stroke: '#1a5a22', line: 0.2, align: 'left' })
    outlined(ctx, short(you.value), W - 26, y, { size: 26, fill: '#ffffff', stroke: '#1a5a22', line: 0.2, align: 'right' })
  })
}

function board(ctx, x, z, title, seed, top, you, stat) {
  const r = mulberry32(seed)
  const n = names(seed, 16)
  const rows = []
  let v = top
  for (let i = 0; i < 16; i++) {
    rows.push({ name: n[i], value: v })
    v /= 1.3 + r() * 6
  }
  you.value = ctx.state[you.key]
  you.fakeRank = you.rank
  const tex = boardTexture(title, rows, you)
  const g = new Group()
  g.position.set(x, 0, z)
  // Stepped dark-wood stand.
  const dark = lego('woodDark')
  const wood = lego('wood')
  wbox(g, 8.6, 0.6, 3.4, 0, 0.3, 0, dark)
  wbox(g, 8.0, 0.6, 2.6, 0, 0.9, -0.2, wood)
  wbox(g, 7.4, 0.5, 1.6, 0, 1.45, -0.4, dark)
  // Frame posts + panel.
  for (const s of [-1, 1]) wbox(g, 0.5, 10.5, 0.6, s * 3.75, 6.4, -0.6, dark)
  wbox(g, 8.0, 0.5, 0.7, 0, 11.6, -0.6, dark)
  const panel = signPanel(tex, 7, 9.6, { depth: 0.3, back: '#4a2a14', glow: 0.18 })
  panel.position.set(0, 6.45, -0.45)
  panel.rotation.x = -0.04
  g.add(panel)
  ctx.scene.add(g)
  solid(4.3, 0.9, 1.7, x, 0.9, z)
  solid(4.1, 6, 0.5, x, 6, z - 0.6)
  // Real standings from the server once they arrive (and again every time it re-sends them); until
  // then (or offline) every few seconds the made-up leaders earn a bit more and the board repaints.
  const fake = rows.map((row) => ({ ...row }))
  let seen = -1
  let mine = 0
  let next = 3 + r() * 3
  ctx.onUpdate((t, dt) => {
    if (net.boards?.[stat] && net.connected) {
      if (seen !== net.boardsRev) {
        seen = net.boardsRev
        rows.splice(0, rows.length, ...net.boards[stat])
        you.rank = net.ranks?.[stat] ?? null
        you.value = ctx.state[you.key]
        tex.userData.repaint()
      } else if (you.value !== ctx.state[you.key] && (mine -= dt) <= 0) {
        mine = 1 // your own number repaints at most once a second
        you.value = ctx.state[you.key]
        tex.userData.repaint()
      }
      return
    }
    if (seen !== -1) {
      // The server went away: back to the made-up boards.
      seen = -1
      rows.splice(0, rows.length, ...fake)
      you.rank = you.fakeRank
    }
    next -= dt
    if (next > 0) return
    next = 4 + r() * 3
    for (const row of rows) row.value *= 1 + r() * 0.004
    you.value = ctx.state[you.key]
    tex.userData.repaint()
  })
}

export function buildLeaders(ctx) {
  const N = HUB.north
  const X = HUB.halfX
  const sign = signTexture({
    w: 1024,
    h: 360,
    colors: ['#f7dd8a', '#efcf72'],
    frame: '#fff6d8',
    stroke: '#1d2f5c',
    lines: [{ text: 'LEADERS', size: 210, fill: '#a9c9ff' }],
  })
  wallSign(ctx.scene, sign, 15, 5.3, -X + 10.5, 15.5, N + 0.2, 0, -0.025, { back: '#e6c460' })
  board(ctx, -X + 6, N + 2.2, 'Total Money Earned', 101, 7.3e30, { rank: 18204, value: 0, key: 'totalEarned' }, 'totalEarned')
  board(ctx, -X + 15.5, N + 2.2, 'Highest Jump Power', 202, 8.79e41, { rank: 25611, value: 0, key: 'jumpPower' }, 'jumpPower')
}
