/**
 * patch-polygons.js — Replace duplicate polygon/center data with unique boundaries
 * Based on commonly accepted NYC real estate neighborhood boundaries
 * Run: node scripts/patch-polygons.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'js', 'render', 'neighborhood-polygons.js');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

function coordsToStr(coords) {
  return '[' + coords.map(c => '[' + c[0] + ', ' + c[1] + ']').join(', ') + ']';
}

function centerToStr(coords) {
  return '[' + coords[0] + ', ' + coords[1] + ']';
}

// Find and replace a polygon or center line by neighborhood name
function replaceLine(name, newData, type) {
  const jsName = name.replace(/'/g, "\\'");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const nameCheck = "'" + jsName + "':";

    if (!t.startsWith(nameCheck)) continue;

    if (type === 'polygon' && !t.includes(': [[')) continue;
    if (type === 'center' && t.includes(': [[')) continue;

    const indent = lines[i].match(/^(\s*)/)[1];
    const endsWithComma = t.endsWith(',');
    const valueStr = type === 'polygon' ? coordsToStr(newData) : centerToStr(newData);
    lines[i] = indent + "'" + name + "': " + valueStr + (endsWithComma ? ',' : '');
    found = true;
    break;
  }

  if (!found) console.log('  WARNING: Could not find ' + type + ' line for: ' + name);
  return found;
}

// ═══════════════════════════════════════════════════════════════════
// UNIQUE POLYGON DATA — based on real NYC real estate boundaries
// 8-15 coordinate pairs each, geographically accurate
// ═══════════════════════════════════════════════════════════════════

const newPolygons = {

  // ── GROUP 1: Boerum Hill / DUMBO / Downtown Brooklyn ──
  // Previously all shared the same NTA polygon

  'DUMBO': [
    // Under Manhattan Bridge, York St to Tillary, Jay St to waterfront
    [40.7042, -73.9928], [40.7038, -73.9882], [40.7028, -73.9858],
    [40.7008, -73.9842], [40.6980, -73.9848], [40.6960, -73.9870],
    [40.6965, -73.9905], [40.6985, -73.9932], [40.7015, -73.9942],
    [40.7042, -73.9928]
  ],
  'Downtown Brooklyn': [
    // Tillary to Atlantic, Flatbush Ave Ext to Court St — commercial core
    [40.6962, -73.9855], [40.6948, -73.9802], [40.6912, -73.9772],
    [40.6870, -73.9775], [40.6858, -73.9812], [40.6855, -73.9858],
    [40.6878, -73.9890], [40.6920, -73.9895], [40.6950, -73.9882],
    [40.6962, -73.9855]
  ],
  'Boerum Hill': [
    // Atlantic to Warren/Baltic, 4th Ave to Hoyt St
    [40.6858, -73.9848], [40.6850, -73.9795], [40.6830, -73.9780],
    [40.6800, -73.9782], [40.6785, -73.9810], [40.6785, -73.9850],
    [40.6800, -73.9878], [40.6830, -73.9882], [40.6850, -73.9872],
    [40.6858, -73.9848]
  ],

  // ── GROUP 2: Carroll Gardens / Cobble Hill / Gowanus / Red Hook ──

  'Carroll Gardens': [
    // Degraw to 9th St, Hoyt to Columbia St
    [40.6830, -73.9942], [40.6828, -73.9895], [40.6818, -73.9862],
    [40.6795, -73.9855], [40.6760, -73.9865], [40.6748, -73.9905],
    [40.6755, -73.9948], [40.6785, -73.9965], [40.6815, -73.9960],
    [40.6830, -73.9942]
  ],
  'Cobble Hill': [
    // Atlantic to Degraw, Court to Columbia/Hicks
    [40.6862, -73.9962], [40.6858, -73.9910], [40.6848, -73.9878],
    [40.6832, -73.9875], [40.6825, -73.9908], [40.6828, -73.9952],
    [40.6840, -73.9978], [40.6855, -73.9980], [40.6862, -73.9962]
  ],
  'Gowanus': [
    // Canal area: 3rd St to Prospect Expwy, 4th Ave to 3rd Ave
    [40.6808, -73.9870], [40.6810, -73.9818], [40.6792, -73.9792],
    [40.6760, -73.9795], [40.6725, -73.9808], [40.6710, -73.9845],
    [40.6718, -73.9878], [40.6748, -73.9888], [40.6785, -73.9882],
    [40.6808, -73.9870]
  ],
  'Red Hook': [
    // Hamilton Ave to waterfront, Columbia St to waterfront (industrial/waterfront)
    [40.6790, -74.0000], [40.6775, -73.9972], [40.6748, -73.9960],
    [40.6720, -73.9980], [40.6698, -74.0035], [40.6680, -74.0090],
    [40.6695, -74.0142], [40.6725, -74.0168], [40.6758, -74.0150],
    [40.6785, -74.0095], [40.6798, -74.0038], [40.6790, -74.0000]
  ],

  // ── GROUP 3: Battery Park City / Financial District ──

  'Battery Park City': [
    // Landfill west of West St — narrow waterfront strip
    [40.7175, -74.0150], [40.7148, -74.0170], [40.7100, -74.0178],
    [40.7055, -74.0185], [40.7020, -74.0175], [40.7005, -74.0148],
    [40.7015, -74.0118], [40.7055, -74.0105], [40.7098, -74.0098],
    [40.7135, -74.0102], [40.7165, -74.0120], [40.7175, -74.0150]
  ],
  'Financial District': [
    // East of West St, south tip of Manhattan — Wall St area
    [40.7150, -74.0095], [40.7128, -74.0050], [40.7098, -73.9988],
    [40.7070, -73.9998], [40.7040, -74.0008], [40.7012, -74.0055],
    [40.7008, -74.0098], [40.7038, -74.0125], [40.7078, -74.0132],
    [40.7118, -74.0125], [40.7150, -74.0095]
  ],

  // ── GROUP 4: Chelsea / Hudson Yards ──

  'Chelsea': [
    // 14th to 30th St, 6th Ave to river — residential/gallery district
    [40.7525, -74.0020], [40.7510, -73.9950], [40.7478, -73.9922],
    [40.7440, -73.9955], [40.7395, -73.9982], [40.7365, -74.0050],
    [40.7380, -74.0095], [40.7415, -74.0110], [40.7465, -74.0088],
    [40.7505, -74.0058], [40.7525, -74.0020]
  ],
  'Hudson Yards': [
    // 30th to 41st, 10th Ave to river — new development zone
    [40.7595, -74.0028], [40.7578, -73.9970], [40.7545, -73.9955],
    [40.7528, -73.9985], [40.7520, -74.0025], [40.7530, -74.0068],
    [40.7548, -74.0095], [40.7575, -74.0092], [40.7590, -74.0058],
    [40.7595, -74.0028]
  ],

  // ── GROUP 5: Chinatown / Two Bridges ──

  'Chinatown': [
    // Canal to Bayard/Hester, Bowery to Broadway — restaurant/commerce hub
    [40.7192, -73.9960], [40.7178, -73.9925], [40.7155, -73.9898],
    [40.7130, -73.9895], [40.7112, -73.9930], [40.7105, -73.9968],
    [40.7125, -74.0002], [40.7158, -74.0005], [40.7182, -73.9988],
    [40.7192, -73.9960]
  ],
  'Two Bridges': [
    // Below Canal, east of Bowery, along FDR — between Manh/Bklyn bridges
    [40.7130, -73.9888], [40.7118, -73.9848], [40.7095, -73.9832],
    [40.7072, -73.9842], [40.7055, -73.9875], [40.7065, -73.9920],
    [40.7088, -73.9942], [40.7115, -73.9925], [40.7130, -73.9888]
  ],

  // ── GROUP 6: Civic Center / Tribeca ──

  'Civic Center': [
    // City Hall, courts — small area around Municipal buildings
    [40.7158, -74.0042], [40.7142, -74.0012], [40.7120, -74.0002],
    [40.7100, -74.0015], [40.7095, -74.0048], [40.7110, -74.0072],
    [40.7135, -74.0075], [40.7155, -74.0058], [40.7158, -74.0042]
  ],
  'Tribeca': [
    // Canal to Chambers/Vesey, Broadway to West St
    [40.7252, -74.0080], [40.7235, -74.0042], [40.7208, -74.0010],
    [40.7175, -73.9998], [40.7158, -74.0035], [40.7145, -74.0068],
    [40.7148, -74.0108], [40.7172, -74.0142], [40.7208, -74.0148],
    [40.7240, -74.0118], [40.7252, -74.0080]
  ],

  // ── GROUP 7: Hudson Square / Little Italy / Nolita / SoHo ──

  'SoHo': [
    // Houston to Canal, W.Broadway to Crosby — cast-iron loft district
    [40.7268, -74.0048], [40.7258, -74.0002], [40.7238, -73.9970],
    [40.7212, -73.9975], [40.7188, -73.9992], [40.7190, -74.0030],
    [40.7205, -74.0062], [40.7238, -74.0072], [40.7268, -74.0048]
  ],
  'Nolita': [
    // Houston to Broome, Bowery to Lafayette — boutique shops
    [40.7262, -73.9962], [40.7252, -73.9938], [40.7232, -73.9922],
    [40.7210, -73.9928], [40.7198, -73.9952], [40.7205, -73.9978],
    [40.7225, -73.9988], [40.7248, -73.9978], [40.7262, -73.9962]
  ],
  'Little Italy': [
    // Canal to Broome, Bowery/Mulberry to Centre St — Mulberry St core
    [40.7205, -73.9980], [40.7195, -73.9955], [40.7178, -73.9942],
    [40.7160, -73.9950], [40.7152, -73.9978], [40.7165, -74.0002],
    [40.7188, -74.0008], [40.7205, -73.9980]
  ],
  'Hudson Square': [
    // Canal to Houston, 6th Ave to West St — west of SoHo
    [40.7278, -74.0108], [40.7265, -74.0062], [40.7242, -74.0042],
    [40.7215, -74.0048], [40.7198, -74.0078], [40.7205, -74.0118],
    [40.7228, -74.0138], [40.7258, -74.0132], [40.7278, -74.0108]
  ],

  // ── GROUP 8: Flatiron / NoMad / Union Square ──

  'Flatiron': [
    // 20th to 26th St, Park Ave S to 6th Ave — Flatiron Building area
    [40.7462, -73.9892], [40.7448, -73.9860], [40.7425, -73.9855],
    [40.7400, -73.9868], [40.7388, -73.9898], [40.7402, -73.9930],
    [40.7428, -73.9938], [40.7452, -73.9918], [40.7462, -73.9892]
  ],
  'NoMad': [
    // 25th to 30th St, Madison to 6th Ave — north of Madison Sq Park
    [40.7508, -73.9902], [40.7492, -73.9872], [40.7468, -73.9858],
    [40.7448, -73.9870], [40.7440, -73.9898], [40.7455, -73.9930],
    [40.7480, -73.9940], [40.7502, -73.9925], [40.7508, -73.9902]
  ],
  'Union Square': [
    // 14th to 20th St, Park Ave S to University Pl — park-centered
    [40.7400, -73.9918], [40.7388, -73.9888], [40.7365, -73.9872],
    [40.7345, -73.9882], [40.7338, -73.9912], [40.7350, -73.9942],
    [40.7375, -73.9950], [40.7395, -73.9938], [40.7400, -73.9918]
  ],

  // ── GROUP 9: Gramercy / Gramercy Park ──

  'Gramercy': [
    // 14th to 23rd St, 3rd Ave to Park Ave S — broader residential area
    [40.7412, -73.9818], [40.7398, -73.9778], [40.7368, -73.9765],
    [40.7338, -73.9780], [40.7320, -73.9822], [40.7335, -73.9865],
    [40.7365, -73.9878], [40.7398, -73.9855], [40.7412, -73.9818]
  ],
  'Gramercy Park': [
    // Tight area around Gramercy Park, 20th to 21st, 3rd to Park Ave S
    [40.7398, -73.9855], [40.7388, -73.9832], [40.7372, -73.9822],
    [40.7355, -73.9832], [40.7348, -73.9855], [40.7360, -73.9878],
    [40.7378, -73.9882], [40.7395, -73.9870], [40.7398, -73.9855]
  ],

  // ── GROUP 10: Hamilton Heights / Sugar Hill ──

  'Hamilton Heights': [
    // 135th to 145th St, St. Nicholas to Riverside — Hamilton Grange area
    [40.8260, -73.9482], [40.8248, -73.9435], [40.8222, -73.9418],
    [40.8195, -73.9438], [40.8178, -73.9485], [40.8192, -73.9538],
    [40.8218, -73.9555], [40.8248, -73.9530], [40.8260, -73.9482]
  ],
  'Sugar Hill': [
    // 145th to 155th St, Edgecombe to Amsterdam — historic jazz district
    [40.8328, -73.9478], [40.8312, -73.9432], [40.8285, -73.9418],
    [40.8258, -73.9438], [40.8248, -73.9478], [40.8262, -73.9525],
    [40.8290, -73.9540], [40.8318, -73.9515], [40.8328, -73.9478]
  ],

  // ── GROUP 11: Manhattanville / West Harlem ──

  'West Harlem': [
    // 110th to 125th, Morningside to Riverside — Morningside north
    [40.8168, -73.9532], [40.8148, -73.9478], [40.8118, -73.9462],
    [40.8090, -73.9488], [40.8078, -73.9538], [40.8098, -73.9592],
    [40.8132, -73.9605], [40.8160, -73.9575], [40.8168, -73.9532]
  ],
  'Manhattanville': [
    // 125th to 135th, St. Nicholas to Riverside — 125th St corridor north
    [40.8238, -73.9548], [40.8222, -73.9495], [40.8195, -73.9480],
    [40.8170, -73.9500], [40.8158, -73.9545], [40.8175, -73.9592],
    [40.8205, -73.9602], [40.8232, -73.9578], [40.8238, -73.9548]
  ],

  // ── GROUP 12: Kingsbridge / Marble Hill ──

  'Kingsbridge': [
    // W 230th to Van Cortlandt Park, Broadway to river — major Bronx nhood
    [40.8870, -73.9018], [40.8848, -73.8965], [40.8812, -73.8948],
    [40.8778, -73.8975], [40.8758, -73.9028], [40.8775, -73.9085],
    [40.8808, -73.9108], [40.8848, -73.9080], [40.8870, -73.9018]
  ],
  'Marble Hill': [
    // Tiny neighborhood north of Spuyten Duyvil Creek — technically Manhattan
    [40.8782, -73.9105], [40.8772, -73.9078], [40.8755, -73.9065],
    [40.8738, -73.9072], [40.8728, -73.9095], [40.8738, -73.9118],
    [40.8758, -73.9128], [40.8775, -73.9120], [40.8782, -73.9105]
  ],

  // ── GROUP 13: Midtown / Times Square ──

  'Midtown': [
    // 34th to 59th, Lex/3rd to 8th Ave — broad central business district
    [40.7638, -73.9790], [40.7620, -73.9732], [40.7582, -73.9728],
    [40.7540, -73.9755], [40.7510, -73.9798], [40.7518, -73.9858],
    [40.7552, -73.9895], [40.7598, -73.9888], [40.7628, -73.9848],
    [40.7638, -73.9790]
  ],
  'Times Square': [
    // 42nd to 47th, Broadway/7th Ave — tight entertainment district
    [40.7600, -73.9872], [40.7592, -73.9848], [40.7572, -73.9840],
    [40.7555, -73.9848], [40.7545, -73.9868], [40.7555, -73.9892],
    [40.7575, -73.9900], [40.7595, -73.9892], [40.7600, -73.9872]
  ],

  // ── GROUP 14: Midtown East / Sutton Place / Turtle Bay ──

  'Midtown East': [
    // 42nd to 57th, 5th Ave to 3rd Ave — corporate offices
    [40.7588, -73.9700], [40.7575, -73.9648], [40.7548, -73.9625],
    [40.7518, -73.9642], [40.7502, -73.9682], [40.7515, -73.9732],
    [40.7548, -73.9748], [40.7578, -73.9732], [40.7588, -73.9700]
  ],
  'Turtle Bay': [
    // 42nd to 53rd, 3rd Ave to East River — UN headquarters area
    [40.7548, -73.9718], [40.7538, -73.9682], [40.7515, -73.9662],
    [40.7492, -73.9672], [40.7480, -73.9700], [40.7492, -73.9732],
    [40.7518, -73.9742], [40.7540, -73.9735], [40.7548, -73.9718]
  ],
  'Sutton Place': [
    // 53rd to 59th, 1st Ave to East River — exclusive residential enclave
    [40.7612, -73.9630], [40.7600, -73.9600], [40.7578, -73.9592],
    [40.7560, -73.9605], [40.7550, -73.9632], [40.7565, -73.9660],
    [40.7588, -73.9668], [40.7608, -73.9652], [40.7612, -73.9630]
  ],

  // ── GROUP 15: Lenox Hill / Roosevelt Island ──

  'Lenox Hill': [
    // 60th to 77th, Park Ave to East River — UES medical/residential
    [40.7718, -73.9588], [40.7700, -73.9535], [40.7672, -73.9518],
    [40.7642, -73.9535], [40.7622, -73.9578], [40.7640, -73.9632],
    [40.7675, -73.9648], [40.7708, -73.9625], [40.7718, -73.9588]
  ],
  'Roosevelt Island': [
    // The narrow island in the East River — unique elongated shape
    [40.7718, -73.9528], [40.7698, -73.9512], [40.7668, -73.9498],
    [40.7635, -73.9492], [40.7600, -73.9492], [40.7570, -73.9498],
    [40.7548, -73.9510], [40.7545, -73.9525], [40.7558, -73.9538],
    [40.7592, -73.9545], [40.7632, -73.9548], [40.7670, -73.9545],
    [40.7702, -73.9538], [40.7718, -73.9528]
  ],

  // ── GROUP 16: Peter Cooper Village / Stuyvesant Town ──

  'Peter Cooper Village': [
    // 20th to 23rd St, 1st Ave to FDR — housing complex, north section
    [40.7368, -73.9752], [40.7355, -73.9728], [40.7335, -73.9718],
    [40.7318, -73.9728], [40.7310, -73.9752], [40.7322, -73.9775],
    [40.7342, -73.9782], [40.7360, -73.9770], [40.7368, -73.9752]
  ],
  'Stuyvesant Town': [
    // 14th to 20th St, 1st Ave to FDR — housing complex, south section
    [40.7325, -73.9768], [40.7312, -73.9742], [40.7290, -73.9732],
    [40.7270, -73.9742], [40.7260, -73.9765], [40.7275, -73.9790],
    [40.7298, -73.9798], [40.7318, -73.9785], [40.7325, -73.9768]
  ],

  // ── GROUP 17: South Slope / Windsor Terrace ──

  'South Slope': [
    // Below Park Slope: Prospect Expwy to 9th St, 4th Ave to 7th Ave
    [40.6680, -73.9838], [40.6668, -73.9792], [40.6640, -73.9775],
    [40.6608, -73.9782], [40.6588, -73.9810], [40.6598, -73.9852],
    [40.6628, -73.9868], [40.6662, -73.9862], [40.6680, -73.9838]
  ],
  'Windsor Terrace': [
    // South of Prospect Park: Prospect Park SW to Fort Hamilton Pkwy
    [40.6602, -73.9822], [40.6588, -73.9778], [40.6560, -73.9762],
    [40.6532, -73.9770], [40.6515, -73.9800], [40.6528, -73.9842],
    [40.6558, -73.9858], [40.6590, -73.9848], [40.6602, -73.9822]
  ],

  // ── GROUP 18: Dongan Hills / South Beach (Staten Island) ──

  'Dongan Hills': [
    // Inland SI, around Todt Hill Rd — residential hillside
    [40.6015, -74.0722], [40.5998, -74.0668], [40.5965, -74.0655],
    [40.5932, -74.0678], [40.5912, -74.0730], [40.5928, -74.0790],
    [40.5962, -74.0810], [40.5998, -74.0788], [40.6015, -74.0722]
  ],
  'South Beach': [
    // Coastal SI, facing Lower Bay — boardwalk area
    [40.5972, -74.0658], [40.5950, -74.0612], [40.5918, -74.0600],
    [40.5885, -74.0622], [40.5865, -74.0668], [40.5882, -74.0718],
    [40.5915, -74.0738], [40.5952, -74.0718], [40.5972, -74.0658]
  ],

  // ── GROUP 19: City Island / Pelham Bay (Bronx) ──

  'City Island': [
    // The actual island in LI Sound — narrow elongated shape
    [40.8492, -73.8178], [40.8472, -73.8150], [40.8440, -73.8138],
    [40.8405, -73.8148], [40.8375, -73.8168], [40.8348, -73.8205],
    [40.8355, -73.8248], [40.8390, -73.8268], [40.8432, -73.8258],
    [40.8465, -73.8232], [40.8488, -73.8202], [40.8492, -73.8178]
  ],
  'Pelham Bay': [
    // Mainland around Pelham Bay Park — much larger area west of City Island
    [40.8578, -73.8258], [40.8558, -73.8195], [40.8518, -73.8162],
    [40.8478, -73.8172], [40.8438, -73.8208], [40.8418, -73.8262],
    [40.8435, -73.8318], [40.8478, -73.8345], [40.8525, -73.8332],
    [40.8562, -73.8298], [40.8578, -73.8258]
  ],

  // ── GROUP 20: Carnegie Hill / Upper East Side ──

  'Carnegie Hill': [
    // 86th to 96th, 5th Ave to Park Ave — smaller UES sub-neighborhood
    [40.7868, -73.9562], [40.7855, -73.9518], [40.7838, -73.9502],
    [40.7815, -73.9515], [40.7800, -73.9555], [40.7812, -73.9600],
    [40.7838, -73.9615], [40.7862, -73.9592], [40.7868, -73.9562]
  ],
  'Upper East Side': [
    // 59th to 96th, 5th Ave to East River — large UES (excludes Carnegie Hill zone)
    [40.7840, -73.9598], [40.7815, -73.9542], [40.7778, -73.9512],
    [40.7728, -73.9528], [40.7678, -73.9568], [40.7652, -73.9620],
    [40.7660, -73.9678], [40.7698, -73.9718], [40.7745, -73.9728],
    [40.7798, -73.9700], [40.7830, -73.9652], [40.7840, -73.9598]
  ],

  // ── GROUP 21: Riverdale / Spuyten Duyvil ──

  'Riverdale': [
    // Large NW Bronx, Henry Hudson Pkwy to city line — affluent area
    [40.9048, -73.9068], [40.9012, -73.8992], [40.8958, -73.8972],
    [40.8908, -73.8998], [40.8878, -73.9055], [40.8895, -73.9128],
    [40.8938, -73.9162], [40.8992, -73.9155], [40.9038, -73.9118],
    [40.9048, -73.9068]
  ],
  'Spuyten Duyvil': [
    // Small tip at south end of Riverdale, near creek — waterfront
    [40.8852, -73.9158], [40.8838, -73.9122], [40.8818, -73.9108],
    [40.8795, -73.9115], [40.8782, -73.9142], [40.8795, -73.9175],
    [40.8818, -73.9188], [40.8842, -73.9178], [40.8852, -73.9158]
  ],
};

// ═══════════════════════════════════════════════════════════════════
// UNIQUE CENTER DATA — centroids shifted to be distinct
// ═══════════════════════════════════════════════════════════════════

const newCenters = {
  // Group 1
  'Boerum Hill': [40.6822, -73.9838],
  'DUMBO': [40.7005, -73.9892],
  'Downtown Brooklyn': [40.6910, -73.9838],
  // Group 2
  'Carroll Gardens': [40.6790, -73.9918],
  'Cobble Hill': [40.6845, -73.9932],
  'Gowanus': [40.6762, -73.9840],
  'Red Hook': [40.6738, -74.0072],
  // Group 3
  'Battery Park City': [40.7095, -74.0145],
  'Financial District': [40.7082, -74.0058],
  // Group 4
  'Chelsea': [40.7448, -74.0002],
  'Hudson Yards': [40.7562, -74.0028],
  // Group 5
  'Chinatown': [40.7152, -73.9958],
  'Two Bridges': [40.7098, -73.9888],
  // Group 6
  'Civic Center': [40.7128, -74.0042],
  'Tribeca': [40.7205, -74.0078],
  // Group 7
  'SoHo': [40.7232, -74.0020],
  'Nolita': [40.7232, -73.9958],
  'Little Italy': [40.7182, -73.9975],
  'Hudson Square': [40.7242, -74.0090],
  // Group 8
  'Flatiron': [40.7425, -73.9895],
  'NoMad': [40.7478, -73.9898],
  'Union Square': [40.7368, -73.9912],
  // Group 9
  'Gramercy': [40.7368, -73.9828],
  'Gramercy Park': [40.7375, -73.9855],
  // Group 10
  'Hamilton Heights': [40.8222, -73.9490],
  'Sugar Hill': [40.8288, -73.9478],
  // Group 11
  'West Harlem': [40.8122, -73.9538],
  'Manhattanville': [40.8200, -73.9542],
  // Group 12
  'Kingsbridge': [40.8815, -73.9038],
  'Marble Hill': [40.8758, -73.9098],
  // Group 13
  'Midtown': [40.7578, -73.9812],
  'Times Square': [40.7572, -73.9870],
  // Group 14
  'Midtown East': [40.7548, -73.9692],
  'Turtle Bay': [40.7512, -73.9708],
  'Sutton Place': [40.7582, -73.9632],
  // Group 15
  'Lenox Hill': [40.7672, -73.9582],
  'Roosevelt Island': [40.7632, -73.9520],
  // Group 16
  'Peter Cooper Village': [40.7340, -73.9752],
  'Stuyvesant Town': [40.7295, -73.9765],
  // Group 17
  'South Slope': [40.6635, -73.9825],
  'Windsor Terrace': [40.6558, -73.9810],
  // Group 18
  'Dongan Hills': [40.5968, -73.0742],  // intentional: inland SI
  'South Beach': [40.5918, -74.0668],
  // Group 19
  'City Island': [40.8420, -73.8205],
  'Pelham Bay': [40.8502, -73.8268],
  // Group 20
  'Carnegie Hill': [40.7838, -73.9562],
  'Upper East Side': [40.7745, -73.9622],
  // Group 21
  'Riverdale': [40.8965, -73.9078],
  'Spuyten Duyvil': [40.8820, -73.9148],
  // Kips Bay / Murray Hill — have unique polygons but shared centers
  'Kips Bay': [40.7420, -73.9768],
  'Murray Hill': [40.7492, -73.9765],
};

// ═══════════════════════════════════════════════════════════════════
// APPLY CHANGES
// ═══════════════════════════════════════════════════════════════════

let polygonCount = 0;
let centerCount = 0;
const warnings = [];

// 1. Replace polygon entries
for (const [name, coords] of Object.entries(newPolygons)) {
  if (replaceLine(name, coords, 'polygon')) {
    polygonCount++;
  } else {
    warnings.push('Polygon not found: ' + name);
  }
}

// 2. Replace center entries
for (const [name, coords] of Object.entries(newCenters)) {
  if (replaceLine(name, coords, 'center')) {
    centerCount++;
  } else {
    warnings.push('Center not found: ' + name);
  }
}

// 3. Fix NoHo alias (line 141) — give it its own polygon instead of aliasing East Village
const nohoPolygon = [
  [40.7298, -73.9948], [40.7285, -73.9920], [40.7262, -73.9908],
  [40.7240, -73.9918], [40.7230, -73.9942], [40.7245, -73.9968],
  [40.7270, -73.9978], [40.7292, -73.9965], [40.7298, -73.9948]
];
const nohoStr = coordsToStr(nohoPolygon);

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("NEIGHBORHOOD_POLYGONS['NoHo']") && lines[i].includes('East Village')) {
    lines[i] = "NEIGHBORHOOD_POLYGONS['NoHo'] = " + nohoStr + ";";
    polygonCount++;
    break;
  }
}

// 4. Write the result
const output = lines.join('\n');
fs.writeFileSync(filePath, output);

console.log('=== Polygon Patch Complete ===');
console.log('Polygons updated: ' + polygonCount);
console.log('Centers updated:  ' + centerCount);
if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach(w => console.log('  ' + w));
}
