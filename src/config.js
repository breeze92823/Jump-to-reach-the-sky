// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'jump-to-reach-the-sky' // slug registered on bloxity.io (= the repo folder name, lowercase; the backend's LEGION_GAME_ID)
export const GAME_TITLE = 'Jump to Reach the Sky'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The hub (src/hub/): a walled lego arena of bright green stud checker. +Z is south.
// North wall: leaderboards + auto training (west of the lane), shops (east of it).
// The lane to the sky starts at the checker line in the gap of the north wall.
// East wall: machines. South wall: the six player bases (plots).
export const HUB = {
  halfX: 70, // inner face of the west/east walls
  north: -55, // inner face of the north wall (the lane start line lies in its gap)
  south: 55, // inner face of the south wall
  wallHeight: 26,
  wallThickness: 4,
  cell: 7, // m per ground checker square
  studsPerCell: 14, // lego studs across one checker square (0.5 m studs)
  laneHalf: 14, // half-width of the gap in the north wall where the lane leaves (and of the lane)
  // Six bases along the south wall, front edge facing north. Only the local player's base is built;
  // the rest are blank checker pads waiting for owners. `count` is also the game server's room size
  // (backend ROOM_MAX_CLIENTS): one base per player. `local` is this player's base (west -> east),
  // the server's seat (setLocalBase below); 2 is the default when there is no server.
  plots: { count: 6, width: 18, depth: 32, gap: 4, front: 21, local: 2 },
}
// Spawn: on the path just in front of the local player's base, facing the hub.
export const SPAWN = { x: -11, y: 0.05, z: 16 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)
// Top-bar teleports (HUD): where each one drops you and which way you face.
export const TELEPORTS = {
  training: { x: -37.8, y: 0.3, z: -38, facing: Math.PI },
  home: { x: -11, y: 0.05, z: 16, facing: Math.PI },
  shops: { x: 30, y: 0.05, z: -40, facing: Math.PI },
}

// Makes base `seat` (0..plots.count - 1) this player's own: the one that gets built, where they spawn
// and where the Home button goes. Called once at boot with the server's seat, before the hub is built.
export function setLocalBase(seat) {
  const P = HUB.plots
  if (!Number.isInteger(seat) || seat < 0 || seat >= P.count) return
  P.local = seat
  const x = (seat - (P.count - 1) / 2) * (P.width + P.gap)
  SPAWN.x = x
  TELEPORTS.home.x = x
}

// --- Jump power -> jump height ------------------------------------------------
// Apex height (m) = base + k * log10(1 + jumpPower)^2. Every lane wall is sized
// from this curve, so the "Recommended" jump power painted on a wall clears it
// by LANE.margin. jumpPower 0 jumps 1.6 m; 500 jumps 8.9 m; 25M jumps 56 m.
export const JUMP = {
  base: 1.6,
  k: 1.0,
  smartExtra: 2.5, // Smart Jump caps a jump at the next wall + this many m
  maxFall: 70, // m/s terminal velocity
}
export function jumpHeight(jumpPower) {
  const l = Math.log10(1 + Math.max(0, jumpPower))
  return JUMP.base + JUMP.k * l * l
}

// --- The lane to the sky (src/hub/lane.js, src/hub/brainrots.js) -----------------
// Terraces going north (-Z) from the start line in the north wall's gap, one per
// zone. Each terrace is a solid block whose front wall rises jumpHeight(req) -
// margin above the one before, painted with "<req> Recommended". Brainrots of
// the zone's rarity spawn on its floor; "Lucky" zones roll better variants.
// floor = lego material (hub/kit.js LEGO) of the terrace; color = HUD bar colour.
export const ZONES = [
  { name: 'Common', color: '#4dca28', floor: 'grass', req: 0, depth: 36, rarity: 'Common', species: ['toastino', 'cactuzzo'], luck: 1 },
  { name: 'Lucky Common', color: '#9be635', floor: 'lime', req: 60, depth: 28, rarity: 'Common', species: ['mushmallow', 'toastino', 'cactuzzo'], luck: 3 },
  { name: 'Uncommon', color: '#2fd3e6', floor: 'cyan', req: 500, depth: 34, rarity: 'Uncommon', species: ['pengwaddle', 'teapotto'], luck: 1 },
  { name: 'Rare', color: '#3a7cf0', floor: 'blue', req: 3500, depth: 34, rarity: 'Rare', species: ['glimmerfin', 'froggolino'], luck: 1 },
  { name: 'Epic', color: '#a04de6', floor: 'purple', req: 15e3, depth: 36, rarity: 'Epic', species: ['grumbolt', 'pizzapus'], luck: 1 },
  { name: 'Legendary', color: '#ffb11f', floor: 'gold', req: 60e3, depth: 36, rarity: 'Legendary', species: ['bananaut', 'owlstronomo', 'lavalump'], luck: 1 },
  { name: 'Mythic', color: '#ff4f9a', floor: 'pink', req: 250e3, depth: 38, rarity: 'Mythic', species: ['dragoncino', 'unicornetto'], luck: 1 },
  { name: 'Secret', color: '#34344a', floor: 'black', req: 1e6, depth: 38, rarity: 'Secret', species: ['robottino', 'ghostello'], luck: 1 },
  { name: 'Celestial', color: '#aeefff', floor: 'cloud', req: 5e6, depth: 40, rarity: 'Celestial', species: ['cloudrillo', 'starfello'], luck: 1.5 },
  { name: 'Divine', color: '#ffe680', floor: 'snow', req: 25e6, depth: 64, rarity: 'Divine', species: ['solaro'], luck: 2 },
]
export const LANE = {
  margin: 1.0, // m the recommended jump power clears its wall by
  cliff: 12, // m the side cliffs rise above each terrace
  cliffThickness: 9,
  airWall: 140, // m of invisible wall above the cliffs (no jumping out of the lane)
  perZone: 6, // brainrots alive on each terrace
  crystalsPerZone: 2, // Jump Crystals on each terrace
  despawn: [45, 80], // s a brainrot waits on the lane before it vanishes
  crystalRespawn: 60, // s
  crystalGain: 0.01, // of the next zone's recommended jump power
  pickupRadius: 1.8, // m from the feet that grabs a brainrot with empty hands
  viewDistance: 95, // m past which lane brainrots are not drawn
  shadowDistance: 28, // m within which they cast shadows
  labelDistance: [26, 46], // m labels start / finish fading out
  skipPad: { inset: 4.5, back: 3.5, extraApex: 4, land: 6 }, // Skip Wall pads in front of each wall
}

// --- Brainrots (src/hub/creatures.js) -------------------------------------------
// name, rarity and base income ($/s) of every species; a variant multiplies it.
export const CREATURES = {
  toastino: { name: 'Toastino', rarity: 'Common', income: 40 },
  cactuzzo: { name: 'Cactuzzo', rarity: 'Common', income: 28 },
  mushmallow: { name: 'Mushmallow', rarity: 'Common', income: 60 },
  pengwaddle: { name: 'Pengwaddle', rarity: 'Uncommon', income: 320 },
  teapotto: { name: 'Teapotto', rarity: 'Uncommon', income: 260 },
  glimmerfin: { name: 'Glimmerfin', rarity: 'Rare', income: 2400 },
  froggolino: { name: 'Froggolino', rarity: 'Rare', income: 1900 },
  grumbolt: { name: 'Grumbolt', rarity: 'Epic', income: 14e3 },
  pizzapus: { name: 'Pizzapus', rarity: 'Epic', income: 18e3 },
  bananaut: { name: 'Bananaut', rarity: 'Legendary', income: 95e3 },
  owlstronomo: { name: 'Owlstronomo', rarity: 'Legendary', income: 80e3 },
  lavalump: { name: 'Lavalump', rarity: 'Legendary', income: 120e3 },
  dragoncino: { name: 'Dragoncino', rarity: 'Mythic', income: 650e3 },
  unicornetto: { name: 'Unicornetto', rarity: 'Mythic', income: 540e3 },
  robottino: { name: 'Robottino', rarity: 'Secret', income: 4.2e6 },
  ghostello: { name: 'Ghostello', rarity: 'Secret', income: 3.6e6 },
  cloudrillo: { name: 'Cloudrillo', rarity: 'Celestial', income: 28e6 },
  starfello: { name: 'Starfello', rarity: 'Celestial', income: 33e6 },
  solaro: { name: 'Solaro', rarity: 'Divine', income: 250e6 },
  // Absolute: reward-only (Playtime / Daily), never on the lane. Their income is
  // a share of your best brainrot when you get them ("30% of BEST").
  tickytocko: { name: 'Tickytocko', rarity: 'Absolute', income: 0, reward: true },
  prismeowza: { name: 'Prismeowza', rarity: 'Absolute', income: 0, reward: true },
  dadoodle: { name: 'Dadoodle', rarity: 'Absolute', income: 0, reward: true },
}
// Rarity order (Index sidebar, sorting).
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'Celestial', 'Divine', 'Absolute']
// Variant income multipliers and spawn weights (a Lucky zone multiplies the non-normal weights by its luck).
export const VARIANTS = {
  normal: { mult: 1, weight: 80 },
  golden: { mult: 1.5, weight: 12 },
  diamond: { mult: 2.5, weight: 5 },
  rainbow: { mult: 6, weight: 2.4 },
  lava: { mult: 10, weight: 0.6 },
}

// --- Auto training (src/hub/training.js) ------------------------------------------
// Standing on an unlocked pad hops you on a beat; every hop trains
// base * pad.mult * training multipliers of Jump Power. Pads west -> east.
export const TRAINING = {
  tick: 0.55, // s per hop
  base: 2,
  hop: 6.4, // m/s of the training hop
  jumpGain: 1, // Jump Power per manual jump anywhere (times the training multipliers)
  pads: [
    { mult: 30, color: '#ffd21f', price: 150e6 },
    { mult: 12, color: '#e93cf0', price: 8e6 },
    { mult: 5, color: '#1ee6ff', price: 120e3 },
    { mult: 2, color: '#3dff4f', price: 2500 },
    { mult: 1, color: '#e9eef5', price: 0 },
  ],
}

// --- Economy (src/game/state.js). Money only: nothing costs a premium currency. ---------
export const ECONOMY = {
  startMoney: 0,
  startJump: 0,
  sellSeconds: 20, // a brainrot sells for this many seconds of its income
  offlineCap: 2 * 3600, // s of income banked while away (at offlineRate)
  offlineRate: 0.5,
  // Rebirths, Playtime and Daily rewards have their own blocks (REBIRTH, PLAYTIME, DAILY).
  slots: { start: 6, total: 12, prices: [15e3, 75e3, 400e3, 2.5e6, 15e6, 100e6] },
  skipWall: { base: 5000, growth: 20 }, // price of the wall up to zone i = base * growth^(i - 1)
}
// The shop (HUD Store window + the offers on the right). Money prices (slightly high).
export const STORE = {
  starter: { price: 50e3, creature: { species: 'pengwaddle', variant: 'diamond' }, boost: 'jump30', minutes: 30 },
  vip: { price: 5e6, money: 1.5, jump: 1.25 },
  jump15: { price: 750e3, jump: 1.5 },
  boosts: {
    jump30: { name: '+30% Jump Power', jump: 1.3 },
    money2: { name: '2x Money', money: 2, minutes: 15, price: 250e3 },
    train2: { name: '2x Training', jump: 2, minutes: 15, price: 150e3 },
    lucky: { name: 'Lucky Potion', luck: 3, minutes: 10, price: 80e3 },
  },
}
// --- Upgrades window (Upgrades stall). Money only; the bundles that were premium
// in the reference cost money too (a slightly high price). ---------------------
export const UPGRADES = {
  // Lucky Jumps: once unlocked, every jump / training hop has `chance` to train `mult` x.
  lucky: { price: 2.4e12, chance: 0.1, mult: 5 },
  // Speed: shown as a level (16 = base walk speed). Walk/sprint m/s scale by
  // 1 + (level - 16) * perLevel. Price of the next +1 = base * growth^(level - 16).
  speed: { start: 16, max: 150, perLevel: 0.02, base: 1650, growth: 1.16, bundles: [1, 10, 50], premium: 1.1 },
  // Carry: brainrots held at once. Price of the next +1 = base * growth^(carry - 1).
  carry: { start: 1, max: 5, base: 240e6, growth: 12, bundles: [1, 2], premium: 1.1 },
}

// --- Items Shop (Items stall): worn on the back, each adds flat Jump Power to
// every jump / training hop (before multipliers). price 0 = owned from the start;
// price null = not for sale (a reward). -----------------------------------------
export const ITEMS = [
  { id: 'box', name: 'Box', rarity: 'Common', jump: 1, price: 0 },
  { id: 'backpack', name: 'Backpack', rarity: 'Common', jump: 2, price: 15e3 },
  { id: 'sack', name: 'Gift Sack', rarity: 'Uncommon', jump: 4, price: 250e3 },
  { id: 'jetpack', name: 'Jetpack', rarity: 'Rare', jump: 8, price: 4e6 },
  { id: 'spring', name: 'Spring Pack', rarity: 'Epic', jump: 20, price: 60e6 },
  { id: 'crimson', name: 'Crimson Glider', rarity: 'Exclusive', jump: 40, price: null, note: 'Daily Reward Day 5' },
  { id: 'rocket', name: 'Rocket', rarity: 'Legendary', jump: 70, price: 900e6 },
  { id: 'wings', name: 'Angel Wings', rarity: 'Mythic', jump: 250, price: 15e9 },
]

// --- Rebirths (Rebirths window): the requirement is Jump Power; a rebirth resets
// Jump Power and money (base, brainrots, pads, items, perks and Base Level stay).
// Rebirth n gives money x money[n] and training x jump[n] (past the table: x1.25 /
// x1.7 per rebirth). SKIP pays money instead and keeps Jump Power (and the money left).
// Pacing: tuned with the Base Level gates below so the fastest climb to Divine
// takes about 2 h 15 min (see the economy review's simulation).
export const REBIRTH = {
  req: { base: 5000, growth: 6 }, // jump power for rebirth n+1 = base * growth^n
  skip: { base: 400e3, growth: 9 }, // money to skip rebirth n+1 = base * growth^n (slightly high)
  money: [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7],
  jump: [1, 1.5, 2.25, 3.5, 5, 7.5, 11, 16, 24, 35, 50, 75],
}

// --- Base Level (the Base Upgrade core in front of your base, hub/baseCore.js) -----------------
// levels[i] is Base Level i + 1: it costs `cost` money, then builds for `minutes` of real time
// (it keeps building while you are away), and opens the wall into ZONES[i + 1] (a force field
// blocks that wall, and its Skip Wall, until then). Every level built adds `income` to money.
export const BASE_LEVELS = {
  income: 0.1,
  levels: [
    { cost: 5e3, minutes: 1 },
    { cost: 60e3, minutes: 2 },
    { cost: 500e3, minutes: 3 },
    { cost: 5e6, minutes: 4 },
    { cost: 50e6, minutes: 6 },
    { cost: 400e6, minutes: 8 },
    { cost: 3e9, minutes: 10 },
    { cost: 25e9, minutes: 12 },
    { cost: 200e9, minutes: 14 },
  ],
  colors: ['#9aa0b0', '#4dca28', '#9be635', '#2fd3e6', '#3a7cf0', '#a04de6', '#ffb11f', '#ff4f9a', '#34344a', '#aeefff'], // the core's gem per level
}

// --- Index bonus: every `every` brainrots found adds `pct` to money. ----------------
export const INDEX_BONUS = { every: 5, pct: 0.05 }

// --- Chests (Playtime / Daily rewards; "i" lists the odds). Each drop: weight +
// kind: money (seconds of base income, min), jump (share of the next zone's
// requirement), boost (STORE.boosts id, minutes), brainrot (one of `rarities`,
// variant rolled with `luck`). -------------------------------------------------------
export const CHESTS = {
  wood: {
    name: 'Wooden Chest',
    drops: [
      { kind: 'money', seconds: 90, min: 3000, weight: 45 },
      { kind: 'jump', share: 0.06, weight: 30 },
      { kind: 'boost', boost: 'train2', minutes: 5, weight: 15 },
      { kind: 'brainrot', rarities: ['Common', 'Uncommon'], luck: 1, weight: 10 },
    ],
  },
  red: {
    name: 'Royal Chest',
    drops: [
      { kind: 'money', seconds: 240, min: 25e3, weight: 35 },
      { kind: 'jump', share: 0.12, weight: 25 },
      { kind: 'boost', boost: 'money2', minutes: 10, weight: 20 },
      { kind: 'brainrot', rarities: ['Uncommon', 'Rare', 'Epic'], luck: 1.5, weight: 20 },
    ],
  },
  purple: {
    name: 'Skull Chest',
    drops: [
      { kind: 'money', seconds: 600, min: 150e3, weight: 30 },
      { kind: 'jump', share: 0.25, weight: 20 },
      { kind: 'boost', boost: 'lucky', minutes: 15, weight: 20 },
      { kind: 'brainrot', rarities: ['Epic', 'Legendary', 'Mythic'], luck: 2.5, weight: 30 },
    ],
  },
}

// --- Lucky Blocks (the "?" heap by the lane gap, hub/lucky.js + the Lucky Blocks window).
// A block costs `seconds` of your base income (at least `min`), so it stays worth
// opening as you grow; money only. Picking up `freeEvery` Jump Crystals gives a
// free Lucky Block. Drops work like CHESTS, plus brainrots from a zone `ahead`
// of the best one you reached (0 = that zone), at least `minVariant`, with
// `luck` on the variant roll. ---------------------------------------------------------
export const LUCKY_BLOCKS = {
  freeEvery: 10,
  tiers: {
    lucky: {
      name: 'Lucky Block',
      seconds: 180,
      min: 5e3,
      drops: [
        { kind: 'money', seconds: 240, min: 6e3, weight: 40 },
        { kind: 'jump', share: 0.03, weight: 25 },
        { kind: 'boost', boost: 'train2', minutes: 5, weight: 15 },
        { kind: 'brainrot', ahead: 0, luck: 1.5, weight: 20 },
      ],
    },
    super: {
      name: 'Super Lucky Block',
      seconds: 600,
      min: 50e3,
      drops: [
        { kind: 'money', seconds: 720, min: 60e3, weight: 30 },
        { kind: 'jump', share: 0.05, weight: 20 },
        { kind: 'boost', boost: 'money2', minutes: 10, weight: 15 },
        { kind: 'brainrot', ahead: 0, luck: 2.5, weight: 30 },
        { kind: 'brainrot', ahead: 1, luck: 1, weight: 5 },
      ],
    },
    rainbow: {
      name: 'Rainbow Lucky Block',
      seconds: 1800,
      min: 500e3,
      drops: [
        { kind: 'money', seconds: 2100, min: 600e3, weight: 20 },
        { kind: 'boost', boost: 'lucky', minutes: 15, weight: 15 },
        { kind: 'brainrot', ahead: 0, luck: 4, minVariant: 'golden', weight: 45 },
        { kind: 'brainrot', ahead: 1, luck: 2, minVariant: 'golden', weight: 17 },
        { kind: 'brainrot', ahead: 2, luck: 2, minVariant: 'golden', weight: 3 },
      ],
    },
  },
}

// --- Fusion Machine (east wall, hub/machines.js + the Fusion Machine window). Put
// `need` brainrots of the same species and variant in, get one of the next variant
// (normal -> golden -> diamond -> rainbow -> lava) after a real-time build (it keeps
// going while you are away). The fee is `seconds` of the result's income (at least
// `min`), money only. Unlocked at `unlock.rebirths` rebirths. Reward-only brainrots
// (Absolute) cannot be fused. -------------------------------------------------------------
export const FUSION = {
  unlock: { rebirths: 2 },
  need: 3,
  steps: {
    golden: { seconds: 60, min: 2e3, minutes: 2 },
    diamond: { seconds: 120, min: 10e3, minutes: 5 },
    rainbow: { seconds: 300, min: 50e3, minutes: 10 },
    lava: { seconds: 600, min: 250e3, minutes: 15 },
  },
}

// --- Ascended Shop (the tarp-covered stall in the SHOPS row, opens at `unlock.rebirths`).
// Permanent perks bought with money (a rebirth keeps them). Level n+1 costs
// base * growth^n; max 1 = a one-time unlock. `per` is the effect per level.
// Walking up before the unlock previews the shop, locked. ----------------------------------
export const ASCENDED = {
  unlock: { rebirths: 4 },
  perks: [
    { id: 'autoCollect', name: 'Auto Collect', max: 1, base: 50e6, growth: 1, color: '#5dff4a', text: 'Your base pays you anywhere: no more walking onto the collect pads.' },
    { id: 'magnet', name: 'Crystal Magnet', max: 1, base: 20e6, growth: 1, radius: 8, color: '#e07bff', text: 'Jump Crystals within 8 m fly to you.' },
    { id: 'mastery', name: 'Training Mastery', max: 10, base: 10e6, growth: 3, per: 0.1, color: '#3fb7ff', text: '+10% Jump Power from training and jumps per level.' },
    { id: 'fastFusion', name: 'Fast Fusion', max: 5, base: 15e6, growth: 3, per: 0.08, color: '#ff7af2', text: 'Fusion Machine builds 8% faster per level.' },
    { id: 'golden', name: 'Golden Touch', max: 5, base: 25e6, growth: 3, per: 0.1, color: '#ffd23a', text: '+10% luck for rare variants per level.' },
    { id: 'vault', name: 'Bigger Vault', max: 3, base: 200e6, growth: 5, per: 1, color: '#ff9a3a', text: '+1 hour of income banked while you are away per level.' },
  ],
}

// --- Hub events (game/events.js, hub/events.js, the JOIN EVENT billboard, the HUD event chip).
// On the SERVER's clock (net.js serverNow), so every player in a room sees the same event: a new
// one starts every `every` minutes and runs `length` minutes, taking turns through `list`.
// rain: brainrots fall around you every `every` s (from your best zone or the one below,
// variant luck x`luck`), each lasting `life` s. crystal: crystals give x`gain` and come back
// in `respawn` of the time. lava: x`luck` on every rare-variant roll. golden: Fusion Machine
// fee x`fee` and build time x`time`, Lucky Blocks x`lucky` price. -----------------------------------
export const EVENTS = {
  every: 20,
  length: 4,
  list: [
    { id: 'rain', name: 'Brainrot Rain', color: '#5ad0ff', text: 'Brainrots fall from the sky around you. Grab them!' },
    { id: 'crystal', name: 'Crystal Storm', color: '#e07bff', text: 'Jump Crystals give double and come back 3x faster.' },
    { id: 'lava', name: 'Lava Rush', color: '#ff7a1a', text: 'Triple luck for rare variants everywhere.' },
    { id: 'golden', name: 'Golden Machine', color: '#ffd23a', text: 'Fusion half price and twice as fast, Lucky Blocks 25% off.' },
  ],
  rain: { every: 2.2, life: 22, luck: 2, radius: [5, 16] },
  crystal: { gain: 2, respawn: 0.33 },
  lava: { luck: 3 },
  golden: { fee: 0.5, time: 0.5, lucky: 0.75 },
}

// --- Playtime Rewards (this session's play time, in minutes). The reference's
// premium-currency reward is a Lucky Potion here. -------------------------------------
export const PLAYTIME = [
  { minutes: 0, kind: 'boost', boost: 'jump30', boostMinutes: 10, title: 'Jump Power bonus', art: 'potionBlue' },
  { minutes: 1, kind: 'chest', chest: 'wood' },
  { minutes: 3, kind: 'money', seconds: 120, min: 15e3 },
  { minutes: 5, kind: 'chest', chest: 'red' },
  { minutes: 8, kind: 'boost', boost: 'lucky', boostMinutes: 10, title: 'Lucky Potion', art: 'potionPink' },
  { minutes: 12, kind: 'chest', chest: 'red' },
  { minutes: 30, kind: 'brainrot', species: 'tickytocko', variant: 'golden', best: 0.3 },
  { minutes: 60, kind: 'chest', chest: 'purple' },
]

// --- Daily Rewards: a 7-day cycle (one claim per `cooldown` hours; missing
// `streakBreak` hours restarts at Day 1) plus streak milestones. -----------------------
export const DAILY = {
  cooldown: 20,
  streakBreak: 48,
  days: [
    { kind: 'boost', boost: 'money2', boostMinutes: 15, title: 'Money bonus', art: 'potionGreen' },
    { kind: 'brainrot', species: 'tickytocko', variant: 'golden', best: 0.3 },
    { kind: 'chest', chest: 'red' },
    { kind: 'money', seconds: 900, min: 250e3, title: 'Cash Pile' },
    { kind: 'item', item: 'crimson' },
    { kind: 'chest', chest: 'purple' },
    { kind: 'brainrot', species: 'prismeowza', variant: 'diamond', best: 0.7 },
  ],
  // Claim All Pass: claim every remaining day of the week at once. A Day 14
  // streak reward, or bought with money (slightly high).
  pass: { day: 14, price: 75e6 },
  milestone: { day: 28, species: 'dadoodle', variant: 'rainbow', best: 1 },
}

export const SAVE = { key: 'jump-sky.save.v1', every: 5 } // localStorage key, autosave period (s)

// --- Game server (net.js; backend Jump-to-reach-the-sky-backend, room "world") ------------------
// Deployed builds find the server through the Bloxity matchmaker (Legion.SDK.net.resolveEndpoint):
// a fixed socket URL would pin everyone to one pod. Only the local dev server (`npm run dev`)
// connects straight to a URL (VITE_SERVER_URL_DEV in .env; set it empty to run without a server).
export const SERVER_URL = import.meta.env.DEV ? import.meta.env.VITE_SERVER_URL_DEV ?? 'ws://localhost:2567' : ''
export const NET = {
  saveEvery: 4, // s: progress is sent at most this often (and at once when the tab hides or closes)
  authWait: 3, // s to wait for the Bloxity sign-in state before connecting as a guest
  bootWait: 8, // s the loading screen waits for the server's answer (then it plays on the local save)
  retry: 2, // s before the first reconnect; doubles after each failed resolve/join...
  retryMax: 30, // ...up to this (the matchmaker can hold a cold start for ~45 s)
  rejoin: 1, // s before resolving again after the room closed (e.g. its pod is being replaced)
  claimWait: 8, // s a Daily Reward claim waits for the server's answer
  // --- Other players (presence.js sends, remotePlayers.js draws; backend presence.ts bounds it) ---
  poseEvery: 0.1, // s between pose messages (x, y, z, yaw, speed, grounded, carrying); the server drops faster ones
  poseStill: 1, // s: a player who has not moved still re-sends this often (the server keeps the last pose anyway)
  lookEvery: 0.4, // s: the most often a changed look (back item, outfit key, carried stack, base slots) is sent
  remoteMax: 5, // other players drawn at once (the room holds 6): the nearest ones
  remoteMaxTouch: 2, // ...on touch devices
  remoteRange: 260, // m past which a remote player is not drawn at all
  remoteEase: 14, // 1/s the drawn position chases the (dead-reckoned) synced one
  remoteLead: 0.15, // s of dead-reckoning past the latest pose, no more (it is only a guess)
  remoteSnap: 12, // m: a bigger gap (a teleport, a respawn) snaps instead of sliding
  remoteStale: 6, // s without a new pose: stand still (the player may have a hidden tab)
  remoteTagRange: [30, 70], // m the name tag fades in / out over
  remoteFxRange: 55, // m within which a remote player's jump / land puffs are shown
  remoteFxScale: 0.5, // their burst size relative to the local player's
  remoteAuraMax: 2, // remote players whose carried rare brainrots shine at once (nearest)
  remoteAuraMaxTouch: 1,
  baseAuraMax: 5, // rare brainrots on other players' bases that shine at once (nearest to you)
  baseAuraMaxTouch: 2,
  baseAuraRange: 60, // m
  stackShown: 5, // carried brainrots drawn on a remote player (backend STACK_SHOWN_MAX caps it)
}

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0, toneMapping: 'neutral' } // 'neutral' keeps saturated toy colours; 'aces' is filmic
export const FOG = { near: 220, far: 900 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1a7cf2',
    horizon: '#b4e6ff',
    sunColor: '#fff6e4',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 35, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#8fd16a',
    hemiIntensity: 0.9,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 48, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Audio (src/audio/) -------------------------------------------------------------
// Everything is synthesised at runtime (no sound files).
export const AUDIO = {
  volume: 0.8,
  storageKey: 'jump-sky.sound',
  buses: { ui: 0.8, sfx: 0.9, amb: 0.6, engine: 0.5 }, // per-bus levels before the master
  duck: 0.45, // world level while a menu window is open
  maxVoices: 48,
  maxVoicesTouch: 24,
  latency: 0.04, // AudioContext latencyHint (s), desktop / touch
  latencyTouch: 0.07,
  lead: 0.02, // s every one-shot is scheduled ahead of the clock
  // Generated impulse response: an open walled arena (long early slap off the walls, short tail).
  reverb: { seconds: 2, preDelay: 0.02, early: [[38, 0.32], [61, 0.26], [95, 0.2], [140, 0.14], [190, 0.08]], decay: 1.3, tail: 0.14, darken: 1.8, send: 0.8 },
  // Positional sources: gain = 1 / (1 + (d / near)^2); silent past `far` m.
  near: 7,
  far: 70,
  footstep: { walk: 2.1, sprint: 2.6 }, // m of travel per footstep (scaled by speed)
  ambience: { wind: 0.05, birdEvery: [3, 9], bird: 0.05, cricket: 0.02 },
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 12.4, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  // The portal's other standard keys (registering one adds its control to the portal menu):
  master_volume: { def: '80', type: 'number', min: 0, max: 100 }, // all sound (audio/core.js setVolume)
  music_volume: { def: '80', type: 'number', min: 0, max: 100 }, // the ambience bed (setMusicVolume); there is no music track
  enable_chat: { def: 'true', type: 'bool' }, // chat bubbles over heads
  background_transparency: { def: '0.9', type: 'number', min: 0.2, max: 1 }, // window panels (--panel-alpha)
}

// Bloxity leaderboards (bloxity.js defines them right after init; the SERVER reports the scores:
// backend LEADERBOARDS, same ids, max 10, permanent once created). Boxity draws the trophy / panel.
export const LEADERBOARDS = [
  { id: 'total-earned', label: 'Total Money Earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'jump-power', label: 'Highest Jump Power', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]

// Rewarded ads (bloxity.js showRewardedAd): a "Free Boost" offer in the HUD. The reward is only
// granted when the ad reports `completed`; there is a cooldown so it cannot be spammed.
export const ADS = {
  placement: 'free-boost', // lowercase letters, digits, hyphens
  boost: 'money2', // STORE.boosts id
  minutes: 5,
  cooldown: 120, // s between rewarded ads
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
  // Carrying a brainrot over the head: both arms up, elbows a little bent (layered over every state).
  carry: {
    pose: { ArmL1: { x: deg(-168), z: deg(14) }, ArmR1: { x: deg(-168), z: deg(-14) }, ArmL2: { x: deg(-18) }, ArmR2: { x: deg(-18) } },
    ease: 10, // 1/s the arms go up / down
  },
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}
