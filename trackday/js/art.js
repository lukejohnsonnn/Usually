'use strict';
// =====================================================================
//  TRACK DAY — pixel font, artifact pixel art and the collectible list
// =====================================================================

// 5x7 bitmap font. '#' = pixel.
const FONT_SRC = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '*': ['..#..', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const FONT = {};
for (const ch in FONT_SRC) {
  const pts = [];
  FONT_SRC[ch].forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') pts.push([x, y]); });
  FONT[ch] = pts;
}

// ---------------------------------------------------------------- icon palette
const ICOL = {
  w: '#f4f4f4', g: '#94b0c2', G: '#566c86', d: '#333c57', n: '#29366f', b: '#3b5dc9', c: '#41a6f6', C: '#73eff7',
  y: '#ffcd75', Y: '#ffd23f', O: '#e0a31a', o: '#ef7d57', r: '#e43b44', R: '#b13e53', p: '#9b4fd1', P: '#5d275d',
  l: '#a7f070', e: '#38b764', t: '#257179', B: '#9a6233', D: '#5e3a22', s: '#f2d38c', m: '#f3b98a', k: '#1a1c2c',
};
const ICONS = {
  stopwatch: ['.......YY.......', '......YOOY......', '.......gg.......', '.....gggggg.....', '....gwwwwwwg....', '...gwwwwkwwwg...', '...gwwwwkwwwg...', '...gwwwwkwwwg...', '...gwwwwkkkwg...', '...gwwwwwwwwg...', '...gwwwwwwwwg...', '....gwwwwwwg....', '.....gggggg.....'],
  blocks: ['...bb......bb...', '..bbbb....bbbb..', '..bcbbG...bcbbG.', '...bbGG....bbGG.', '....GGG.....GGG.', 'GGGGGGGGGGGGGGGG', 'gggggggggggggggg', 'GGGGGGGGGGGGGGGG', '.g............g.'],
  photo: ['wwwwwwwwwwwwww', 'wCCCCCCrCCCCCw', 'wCCCkCCrCCCCCw', 'wCCkkkCrCCCCCw', 'wCCCkCCrCCCCCw', 'wCCkCkCrCCCCCw', 'woooooorooooow', 'woooooorooooow', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww'],
  spikes: ['..........YYY...', '.........YYYYY..', '........YYwYYY..', '.......YYYwYYY..', '.YYYYYYYYYYYYY..', 'YYYwwYYYYYYYYYY.', 'YYYYYYYYYYYYYYY.', 'OOOOOOOOOOOOOOO.', '.g..g..g..g..g..'],
  bolt: ['.DDDD.', '.DDDD.', '..CC..', '..CC..', 'CCCCCC', 'CnnnnC', 'CnnYnC', 'CnYYnC', 'CYYYYC', 'CnnYYC', 'CnnYnC', 'CnYnnC', 'CnnnnC', '.CCCC.'],
  cone: ['.......oo.......', '......oooo......', '......wwww......', '.....oooooo.....', '.....oooooo.....', '....wwwwwwww....', '....oooooooo....', '...oooooooooo...', '...wwwwwwwwww...', '..oooooooooooo..', 'oooooooooooooooo', 'RRRRRRRRRRRRRRRR'],
  woodhurdle: ['BBBBBBBBBBBBBBBB', 'wwwwBBBBwwwwBBBB', 'BBBBBBBBBBBBBBBB', '.D............D.', '.D............D.', '.D............D.', '.D............D.', '.D............D.', 'DDDD........DDDD'],
  feather: ['.............CC.', '............CCC.', '..........CCCw..', '.........CCCwC..', '........CCCwCC..', '.......CCCwCC...', '......CCCwCC....', '.....CCCwCC.....', '....CCCwCC......', '....CCwCC.......', '...CCwCC........', '...CwC..........', '..w.............', '.w..............'],
  hurdlegold: ['..w.........w...', '.www.......www..', '..w.........w...', 'YYYYYYYYYYYYYYYY', 'YwwYYYYwwYYYYwwY', 'OOOOOOOOOOOOOOOO', '.O............O.', '.O............O.', '.O............O.', '.O............O.', 'OOOO........OOOO'],
  wings: ['.w..............', '.ww.............', '.www............', '.wwww...........', '..wwwww.........', '...wwwwww.......', '....wwwwYYYY....', '.....wwYYYYYYY..', '......YYYYYYYYY.', '.....BBBBBBBBBBB', '.....DDDDDDDDDD.'],
  rake: ['..............B.', '.............B..', '............B...', '...........B....', '..........B.....', '.........B......', '........B.......', '.......B........', '......B.........', '..GGGGGGGGG.....', '..G.G.G.G.G.....', '..G.G.G.G.G.....'],
  flag: ['G..............', 'Gwwwwwwwwww....', 'Gwwwwwwwwwww...', 'Gwwwwwwwwwwww..', 'Gwwwwwwwwwww...', 'Gwwwwwwwwww....', 'G..............', 'G..............', 'G..............', 'G..............', 'G..............', 'GG.............'],
  tape: ['...yyyyyyyy.....', '..yyyyyyyyyy....', '..yyGGGGGGyy....', '..yyGyyyyGyy....', '..yyGyGGyGyy....', '..yyGyyyyGyy....', '..yyGGGGGGyy....', '..yyyyyyyyyywwwww', '...yyyyyyyy.wGwGw'],
  sandglass: ['OOOOOOOOOOOOO', '.C.........C.', '.CsssssssssC.', '..CsssssssC..', '...CsssssC...', '....CsssC....', '.....CsC.....', '.....CsC.....', '....CCsCC....', '...CCCsCCC...', '..CCCsssCCC..', '.CCsssssssCC.', '.C.........C.', 'OOOOOOOOOOOOO'],
  comet: ['r...............', 'ro..............', 'roo.......cc....', 'rooy.....cccc...', '.ooyy...cwcccc..', '..oyyyccccccccc.', '...yycccccccccc.', '....wwwwwwwwwww.'],
  windsock: ['G...............', 'Gooowwwooo......', 'Gooowwwoooww....', 'Gooowwwoooww....', 'Gooowwwooo......', 'G...............', 'G...............', 'G...............', 'G...............', 'G...............', 'GG..............'],
  ashjav: ['..............gg', '.............gg.', '............BB..', '...........BB...', '..........BB....', '.........BB.....', '........rr......', '.......rr.......', '......BB........', '.....BB.........', '....BB..........', '...BB...........', '..BB............', '.BB.............'],
  arrowhead: ['....o....', '...ooo...', '...oOo...', '..ooOoo..', '..oOOOo..', '.ooOOOoo.', '.oOOOOOo.', 'ooOOOOOoo', 'ooooooooo', '...BBB...', '...BBB...', '...DDD...'],
  eagle: ['.............ww.', '............wBB.', '...........BBB..', '..........BBwB..', '.........BBwBB..', '........BBwBB...', '.......BBwBB....', '......BBwBB.....', '.....BBwBB......', '....DBwBB.......', '...DDwBB........', '...DwD..........', '..w.............', '.w..............'],
  meteor: ['...............w', '..............wC', '.............CC.', '............CC..', '...........CC...', '..........CC....', '.........CC.....', '.......yCC......', '......yyC.......', '.....oyy........', '....ooy.........', '...roo..........', '..rro...........', '.rr.............'],
  chalk: ['....wwwwwwww....', '...wwwwwwwwww...', '...bbbbbbbbbb...', '...bbbbbbbbbb...', '..bbbbbbbbbbbb..', '..bbbwwbbbbbbb..', '..bbwwwwbbbbbb..', '..bbbwwbbbbbbb..', '..bbbbbbbbbbbb..', '...bbbbbbbbbb...', '....bbbbbbbb....'],
  glove: ['....B.B.B......', '....B.B.B.B....', '....BBBBBBB....', '....BBBBBBB....', '.B..BBBBBBB....', '.BB.BBBBBBB....', '..BBBBBBBBB....', '...BBBBBBBB....', '....BBBBBBB....', '....rrrrrrr....', '....rrrrrrr....'],
  ironball: ['......GGGG......', '.....G....G.....', '......G..G......', '.......GG.......', '.......GG.......', '.....dddddd.....', '....dddddddd....', '...ddgwdddddd...', '...ddgddddddd...', '...dddddddddd...', '...dddddddddd...', '....dddddddd....', '.....dddddd.....'],
  anvil: ['.dddddddddddd...', 'GGGGGGGGGGGGGGG.', '.GGGGGGGGGGGGG..', '.....GGGGG......', '.....GGGGG......', '....GGGGGGG.....', '...dddddddddd...'],
  storm: ['......YYYY......', '.....Y....Y.....', '......Y..Y......', '.......YY.......', '.......YY.......', '.....nnnnnn.....', '....nnnYnnnn....', '...nnnYYnnnnn...', '...nnYYYYYnnn...', '...nnnnYYnnnn...', '...nnnnYnnnnn...', '....nnYnnnnn....', '.....nnnnnn.....'],
  laurel: ['..e..........e..', '.le..........el.', '.ee..........ee.', '.le..........el.', '..ee........ee..', '..lee......eel..', '...eee....eee...', '....leeeeeeel...', '......eeee......', '.......rr.......', '......r..r......'],
  torch: ['.......r........', '......ror.......', '.....rooor......', '.....royyor.....', '.....roywyo.....', '......oyyo......', '....OOOOOOOO....', '.....YYYYYY.....', '......YYYY......', '......YOYY......', '......YYYY......', '.......YY.......', '.......YY.......', '.......OO.......'],
  trophy: ['..YYYYYYYYYYYY..', 'Y.YYwYYYYYYYYY.Y', 'Y.YwYYYYYYYYYY.Y', '.YYwYYYYYYYYYYY.', '...YYYYYYYYYY...', '....YYYYYYYY....', '......YYYY......', '.......YY.......', '.......YY.......', '.....OOOOOO.....', '....OOOOOOOO....'],
  crown: ['Y.....Y.....Y', 'YY...YYY...YY', 'YYY.YYYYY.YYY', 'YYYYYYYYYYYYY', 'YYrYYYcYYYrYY', 'YYYYYYYYYYYYY', 'OOOOOOOOOOOOO'],
  box: ['..YYYYYYYYYYYY..', '.YOOOOOrrOOOOOY.', '.YOOOOOrrOOOOOY.', 'YYYYYYYrrYYYYYYY', 'rrrrrrrrrrrrrrrr', 'YYYYYYYrrYYYYYYY', '.YOOOOOrrOOOOOY.', '.YOOOOOrrOOOOOY.', '.YOOOOOrrOOOOOY.', '.YOOOOOrrOOOOOY.', '.YYYYYYrrYYYYYY.'],
  // event icons
  ev_sprint: ['........mm......', '.......mmmm.....', '.......mmmm.....', '........rr......', '......rrrrrr....', '....mm.rrrr.mm..', '.......rrrr.....', '.......nnnn.....', '......nn..nn....', '.....mm....mm...', '....mm......mm..', '...yy........yy.'],
  ev_hurdles: ['wwwwkkkkwwwwkkkk', 'wwwwkkkkwwwwkkkk', '.g............g.', '.g............g.', '.g............g.', '.g............g.', '.g............g.', '.g............g.', 'gggg........gggg'],
  ev_longjump: ['.........mm.....', '........mmmm....', '....mm..mmmm....', '.....mm.rrrr....', '......rrrrr.....', '.....nnnrr......', '...nn.....nn....', '..yy.......yy...', '................', 'ssssssssssssssss', 'SssssSsssssSssss'.replace(/S/g, 'O')],
  ev_javelin: ['..............kk', '............ggk.', '..........gggg..', '........gggg....', '......oooo......', '....gggg........', '..gggg..........', 'gggg............'],
  ev_hammer: ['....g...........', '.....g..........', '......g.........', '.......g........', '........g..ddd..', '.........gddddd.', '..........ddgdd.', '.........ddwddd.', '..........ddddd.', '...........ddd..'],
};

const ICON_CACHE = {};
function iconCanvas(id, sc = 1, silhouette = false) {
  const key = id + '|' + sc + '|' + (silhouette ? 1 : 0);
  if (ICON_CACHE[key]) return ICON_CACHE[key];
  const src = ICONS[id] || ICONS.box;
  const N = 18, grid = [];
  for (let y = 0; y < N; y++) grid.push(new Array(N).fill(null));
  const h = src.length, w = Math.max(...src.map((r) => r.length));
  const ox = Math.floor((N - w) / 2), oy = Math.floor((N - h) / 2);
  src.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.' && ICOL[ch]) grid[y + oy][x + ox] = silhouette ? '#333c57' : ICOL[ch]; } });
  const c = document.createElement('canvas'); c.width = N * sc; c.height = N * sc;
  const x = c.getContext('2d');
  // outline
  for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
    if (grid[yy][xx]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const v = grid[yy + dy] && grid[yy + dy][xx + dx]; if (v && v !== 'O_') { near = true; break; } }
    if (near) { x.fillStyle = silhouette ? '#1a1c2c' : '#1a1c2c'; x.fillRect(xx * sc, yy * sc, sc, sc); }
  }
  for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { const v = grid[yy][xx]; if (v) { x.fillStyle = v; x.fillRect(xx * sc, yy * sc, sc, sc); } }
  ICON_CACHE[key] = c;
  return c;
}
const ICON_URL = {};
function iconURL(id, sc = 4, sil = false) { const k = id + sc + sil; if (!ICON_URL[k]) ICON_URL[k] = iconCanvas(id, sc, sil).toDataURL(); return ICON_URL[k]; }
function drawIcon(id, x, y, sc = 1) { g.drawImage(iconCanvas(id, sc), Math.round(x), Math.round(y)); }

// ---------------------------------------------------------------- collectibles
const RARITY = {
  common: { name: 'COMMON', c: '#94b0c2', rank: 0 },
  rare: { name: 'RARE', c: '#41a6f6', rank: 1 },
  epic: { name: 'EPIC', c: '#b56cff', rank: 2 },
  legendary: { name: 'LEGENDARY', c: '#ffd23f', rank: 3 },
};
const ARTIFACTS = [
  { id: 'stopwatch', ev: 'sprint', rar: 'common', name: 'Brass Stopwatch', desc: 'Runs a little fast. Just like you.' },
  { id: 'blocks', ev: 'sprint', rar: 'common', name: 'Starting Blocks', desc: 'Still warm from a blistering start.' },
  { id: 'photo', ev: 'sprint', rar: 'rare', name: 'Photo Finish', desc: 'Proof. By a nose. Well, a chest.' },
  { id: 'spikes', ev: 'sprint', rar: 'epic', name: 'Golden Spikes', desc: 'Grip the track like it owes you money.' },
  { id: 'bolt', ev: 'sprint', rar: 'legendary', name: 'Bottled Lightning', desc: 'Captured during a sub-10 dash. Do not open.' },

  { id: 'cone', ev: 'hurdles', rar: 'common', name: 'Training Cone', desc: 'Where every hurdler starts.' },
  { id: 'woodhurdle', ev: 'hurdles', rar: 'common', name: 'Old Wooden Hurdle', desc: 'Splinters included, free of charge.' },
  { id: 'feather', ev: 'hurdles', rar: 'rare', name: 'Swift Feather', desc: 'Light as air. So were your trail legs.' },
  { id: 'hurdlegold', ev: 'hurdles', rar: 'epic', name: 'Golden Hurdle', desc: 'Nobody has ever knocked this one down.' },
  { id: 'wings', ev: 'hurdles', rar: 'legendary', name: 'Winged Sandals', desc: 'Ten barriers? You barely noticed.' },

  { id: 'rake', ev: 'longjump', rar: 'common', name: 'Sand Rake', desc: 'Smooths the pit for the next big leap.' },
  { id: 'flag', ev: 'longjump', rar: 'common', name: 'White Flag', desc: 'Fair jump! The best flag there is.' },
  { id: 'tape', ev: 'longjump', rar: 'rare', name: 'Measuring Tape', desc: 'It stretched. It had to.' },
  { id: 'sandglass', ev: 'longjump', rar: 'epic', name: 'Hourglass of Pit Sand', desc: 'Time slowed down while you were airborne.' },
  { id: 'comet', ev: 'longjump', rar: 'legendary', name: 'Comet Shoe', desc: 'Left a trail of fire over the sand.' },

  { id: 'windsock', ev: 'javelin', rar: 'common', name: 'Wind Sock', desc: 'Always know which way the breeze blows.' },
  { id: 'arrowhead', ev: 'javelin', rar: 'common', name: 'Bronze Tip', desc: 'Sharp, shiny, stuck in the turf.' },
  { id: 'ashjav', ev: 'javelin', rar: 'rare', name: 'Ash Wood Javelin', desc: 'A classic. Throws true, sings in flight.' },
  { id: 'eagle', ev: 'javelin', rar: 'epic', name: 'Eagle Feather', desc: 'Your throw flew higher than the birds.' },
  { id: 'meteor', ev: 'javelin', rar: 'legendary', name: 'Meteor Javelin', desc: 'Re-entered the atmosphere near the 90m line.' },

  { id: 'chalk', ev: 'hammer', rar: 'common', name: 'Chalk Bag', desc: 'Dusty hands, steady grip.' },
  { id: 'glove', ev: 'hammer', rar: 'common', name: 'Throwing Glove', desc: 'Worn smooth by a thousand spins.' },
  { id: 'ironball', ev: 'hammer', rar: 'rare', name: 'Iron Ball', desc: 'Heavier than it looks. Much heavier.' },
  { id: 'anvil', ev: 'hammer', rar: 'epic', name: 'Tiny Anvil', desc: 'Forged where the hammer landed.' },
  { id: 'storm', ev: 'hammer', rar: 'legendary', name: 'Storm Hammer', desc: 'It came back down with thunder.' },

  { id: 'laurel', ev: 'meet', rar: 'rare', name: 'Laurel Wreath', desc: 'Scored 4,000+ points in one meet.' },
  { id: 'torch', ev: 'meet', rar: 'epic', name: 'Victory Torch', desc: 'Won a medal in all five events.' },
  { id: 'trophy', ev: 'meet', rar: 'epic', name: 'Golden Trophy', desc: 'Scored 4,500+ points in one meet.' },
  { id: 'crown', ev: 'meet', rar: 'legendary', name: "Champion's Crown", desc: 'Five gold medals. One perfect day.' },
];
const ART_BY_ID = Object.fromEntries(ARTIFACTS.map((a) => [a.id, a]));

// Roll for an artifact after an event. Better scores = better odds and rarer loot.
function rollArtifact(evId, pts, worldRecord, r = Math.random) {
  const pool = ARTIFACTS.filter((a) => a.ev === evId);
  if (worldRecord) return pool.find((a) => a.rar === 'legendary');
  if (pts < 560) return null;
  const chance = Math.min(0.95, 0.3 + (pts - 560) / 650);
  if (r() > chance) return null;
  const w = {
    common: 1.2,
    rare: pts >= 700 ? (pts - 650) / 150 : 0,
    epic: pts >= 850 ? (pts - 820) / 130 : 0,
    legendary: pts >= 980 ? (pts - 960) / 90 : 0,
  };
  let tot = 0; for (const k in w) tot += w[k];
  let x = r() * tot, rar = 'common';
  for (const k of ['common', 'rare', 'epic', 'legendary']) { if (x < w[k]) { rar = k; break; } x -= w[k]; }
  const opts = pool.filter((a) => a.rar === rar);
  return opts.length ? opts[Math.floor(r() * opts.length)] : pool[0];
}
function meetArtifact(total, medals) {
  if (medals.every((m) => m === 'gold')) return ART_BY_ID.crown;
  if (total >= 4500) return ART_BY_ID.trophy;
  if (medals.every((m) => !!m)) return ART_BY_ID.torch;
  if (total >= 4000) return ART_BY_ID.laurel;
  return null;
}
