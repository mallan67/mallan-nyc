/**
 * Enrich neighborhood JSON files with guide content:
 * - transitInfo (subwayLines, majorStations)
 * - localVibe
 * - notableStreets
 * - parkAndGreen
 * - diningScene
 *
 * Fair Housing compliant: NO demographics, safety, family-friendliness,
 * school quality, income, religion, ethnicity, age groups.
 * Only factual, architectural, transit, park, dining, and street descriptions.
 */

const fs = require('fs');
const path = require('path');

const enrichmentData = {
  // ============ MANHATTAN (33) ============
  "upper-east-side": {
    transitInfo: {
      subwayLines: ["4", "5", "6", "Q"],
      majorStations: ["86th Street (4/5/6)", "77th Street (6)", "72nd Street (Q)", "96th Street (Q/6)"]
    },
    localVibe: "Tree-lined blocks of pre-war limestone and brick buildings give way to Museum Mile's cultural institutions and Central Park's eastern edge.",
    notableStreets: ["Fifth Avenue", "Madison Avenue", "Park Avenue", "Lexington Avenue", "East End Avenue"],
    parkAndGreen: ["Central Park (East Meadow, Conservatory Garden)", "Carl Schurz Park", "John Jay Park", "Andrew Haswell Green Park"],
    diningScene: "Known for its refined dining establishments along Madison Avenue and a growing collection of wine bars and bistros on the Upper East Side's side streets."
  },
  "upper-west-side": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "B", "C"],
      majorStations: ["72nd Street (1/2/3)", "79th Street (1)", "86th Street (1)", "96th Street (1/2/3)", "81st Street-Museum of Natural History (B/C)"]
    },
    localVibe: "A walkable stretch of brownstone-lined streets between Central Park and Riverside Park, anchored by Lincoln Center and the American Museum of Natural History.",
    notableStreets: ["Broadway", "Columbus Avenue", "Amsterdam Avenue", "West End Avenue", "Riverside Drive"],
    parkAndGreen: ["Central Park (Great Lawn, Belvedere Castle)", "Riverside Park", "Theodore Roosevelt Park", "Straus Park"],
    diningScene: "Features a mix of longstanding neighborhood restaurants along Columbus and Amsterdam Avenues, with numerous brunch spots and international cuisines."
  },
  "tribeca": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "A", "C", "E"],
      majorStations: ["Chambers Street (1/2/3)", "Franklin Street (1)", "Canal Street (A/C/E)"]
    },
    localVibe: "Cast-iron loft buildings and cobblestone streets define this former industrial district, now home to converted warehouse residences and ground-floor galleries.",
    notableStreets: ["Greenwich Street", "Hudson Street", "West Broadway", "Church Street", "Reade Street"],
    parkAndGreen: ["Hudson River Park (Pier 25, Pier 26)", "Washington Market Park", "Teardrop Park", "City Hall Park"],
    diningScene: "A destination for acclaimed restaurants and chef-driven concepts, with notable establishments along Greenwich and Hudson Streets."
  },
  "soho": {
    transitInfo: {
      subwayLines: ["C", "E", "R", "W", "N", "Q", "6"],
      majorStations: ["Spring Street (C/E)", "Prince Street (R/W)", "Broadway-Lafayette Street (B/D/F/M)", "Canal Street (N/Q/R/W/6)"]
    },
    localVibe: "Cast-iron architecture and cobblestone streets form the backdrop for a commercial district of flagship stores, galleries, and loft-style residences.",
    notableStreets: ["Broadway", "West Broadway", "Prince Street", "Spring Street", "Mercer Street", "Greene Street"],
    parkAndGreen: ["Vesuvio Playground", "DeSalvio Playground", "Spring Street Park"],
    diningScene: "Features a concentration of global cuisine and stylish cafes along West Broadway and side streets, with sidewalk dining throughout warmer months."
  },
  "chelsea": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "A", "C", "E", "L"],
      majorStations: ["14th Street (A/C/E/1/2/3/L)", "23rd Street (C/E/1)", "28th Street (1)"]
    },
    localVibe: "A gallery district along the West 20s meets the elevated High Line park, with pre-war walk-ups and converted industrial lofts lining the avenues.",
    notableStreets: ["Tenth Avenue", "Ninth Avenue", "Eighth Avenue", "West 20th-27th Streets (Gallery Row)"],
    parkAndGreen: ["The High Line", "Hudson River Park (Chelsea Piers, Pier 62)", "Chelsea Park", "Clement Clarke Moore Park"],
    diningScene: "Anchored by Chelsea Market's food hall and a corridor of restaurants along Ninth and Tenth Avenues, with numerous international options."
  },
  "financial-district": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "4", "5", "J", "Z", "R", "W"],
      majorStations: ["Fulton Street (2/3/4/5/A/C/J/Z)", "Wall Street (2/3/4/5)", "Whitehall Street (R/W)", "Broad Street (J/Z)"]
    },
    localVibe: "Historic stone-facade buildings and narrow streets of the original city grid, with converted office towers offering open-plan residences amid waterfront promenades.",
    notableStreets: ["Wall Street", "Broadway", "Water Street", "Fulton Street", "Stone Street"],
    parkAndGreen: ["Battery Park", "Bowling Green", "Zuccotti Park", "The Battery Esplanade", "Elevated Acre"],
    diningScene: "Stone Street's pedestrian alley offers outdoor dining in warmer months, complemented by waterfront restaurants along the East River and South Street Seaport."
  },
  "greenwich-village": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "A", "C", "E", "B", "D", "F", "M"],
      majorStations: ["West 4th Street-Washington Square (A/B/C/D/E/F/M)", "Christopher Street (1)", "14th Street (1/2/3)"]
    },
    localVibe: "Winding, tree-shaded streets break from the Manhattan grid around Washington Square Park, lined with 19th-century townhouses and low-rise brick buildings.",
    notableStreets: ["Bleecker Street", "MacDougal Street", "Christopher Street", "Washington Square North", "Fifth Avenue"],
    parkAndGreen: ["Washington Square Park", "Father Demo Square", "Minetta Green", "Jefferson Market Garden"],
    diningScene: "Bleecker Street and the surrounding blocks feature a dense collection of Italian restaurants, bakeries, jazz venues, and neighborhood trattorias."
  },
  "midtown-east": {
    transitInfo: {
      subwayLines: ["4", "5", "6", "7", "E", "M", "S"],
      majorStations: ["Grand Central-42nd Street (4/5/6/7/S)", "51st Street (6)", "Lexington Avenue-53rd Street (E/M)"]
    },
    localVibe: "Corporate towers and Art Deco landmarks anchor this stretch east of Fifth Avenue, with residential pockets along the quieter side streets between the avenues.",
    notableStreets: ["Park Avenue", "Lexington Avenue", "Third Avenue", "East 42nd Street", "East 57th Street"],
    parkAndGreen: ["Tudor City Greens", "Dag Hammarskjold Plaza", "Greenacre Park", "St. Vartan Park"],
    diningScene: "Business dining destinations and steakhouses along the avenues, with a growing collection of ramen shops, sushi counters, and international eateries on the cross streets."
  },
  "hells-kitchen": {
    transitInfo: {
      subwayLines: ["A", "C", "E", "N", "Q", "R", "W", "1", "2", "3", "7"],
      majorStations: ["42nd Street-Port Authority (A/C/E)", "Times Square-42nd Street (1/2/3/7/N/Q/R/W)", "50th Street (C/E)"]
    },
    localVibe: "A theater district-adjacent neighborhood of tenement-style walk-ups and newer high-rises, with a lively restaurant row along Ninth Avenue.",
    notableStreets: ["Ninth Avenue", "Tenth Avenue", "Restaurant Row (46th Street)", "42nd Street"],
    parkAndGreen: ["Hudson River Park (Clinton Cove, Pier 84)", "DeWitt Clinton Park", "Hell's Kitchen Park"],
    diningScene: "Ninth Avenue is one of Manhattan's most concentrated restaurant corridors, with cuisines spanning Thai, Ethiopian, Mexican, Greek, and contemporary American."
  },
  "east-village": {
    transitInfo: {
      subwayLines: ["6", "L", "N", "R", "W"],
      majorStations: ["Astor Place (6)", "First Avenue (L)", "8th Street-NYU (R/W)", "14th Street-Union Square (4/5/6/L/N/Q/R/W)"]
    },
    localVibe: "Walk-up tenement buildings and converted townhouses line a grid of avenues known for independent shops, music venues, and a dense concentration of restaurants.",
    notableStreets: ["St. Marks Place", "Avenue A", "Avenue B", "First Avenue", "Second Avenue"],
    parkAndGreen: ["Tompkins Square Park", "Stuyvesant Square", "First Park", "La Plaza Cultural"],
    diningScene: "One of Manhattan's densest dining districts, with ramen shops, izakayas, pierogis, pizza counters, and cocktail bars concentrated along First and Second Avenues."
  },
  "lower-east-side": {
    transitInfo: {
      subwayLines: ["F", "J", "M", "Z"],
      majorStations: ["Delancey Street-Essex Street (F/J/M/Z)", "East Broadway (F)"]
    },
    localVibe: "Tenement-era brick buildings mix with modern glass towers along the blocks south of Houston Street, a neighborhood shaped by its layered architectural history.",
    notableStreets: ["Orchard Street", "Ludlow Street", "Rivington Street", "Delancey Street", "Essex Street"],
    parkAndGreen: ["Sara D. Roosevelt Park", "Seward Park", "East River Park", "Hester Street Playground"],
    diningScene: "A concentrated mix of traditional delis, dim sum parlors, modern cocktail bars, and new American restaurants along Orchard and Ludlow Streets."
  },
  "harlem": {
    transitInfo: {
      subwayLines: ["2", "3", "A", "B", "C", "D"],
      majorStations: ["125th Street (2/3/A/B/C/D)", "116th Street (2/3/B/C)", "135th Street (2/3/B/C)"]
    },
    localVibe: "Brownstone-lined blocks and wide boulevards define this historic neighborhood, with landmark theaters, churches, and cultural institutions along 125th Street.",
    notableStreets: ["125th Street (Martin Luther King Jr. Boulevard)", "Lenox Avenue (Malcolm X Boulevard)", "Adam Clayton Powell Jr. Boulevard", "Frederick Douglass Boulevard", "Convent Avenue"],
    parkAndGreen: ["Marcus Garvey Park (Mount Morris Park)", "St. Nicholas Park", "Morningside Park", "Riverbank State Park"],
    diningScene: "Frederick Douglass Boulevard and Lenox Avenue host a growing restaurant scene featuring Southern-inspired cuisine, West African dishes, and contemporary American fare."
  },
  "nomad": {
    transitInfo: {
      subwayLines: ["N", "R", "W", "6", "B", "D", "F", "M"],
      majorStations: ["28th Street (N/R/W/6)", "Herald Square-34th Street (B/D/F/M/N/Q/R/W)"]
    },
    localVibe: "A compact district of loft conversions and boutique hotels centered around the intersection of Broadway and Fifth Avenue, near Madison Square Park.",
    notableStreets: ["Broadway", "Fifth Avenue", "Park Avenue South", "Madison Avenue", "28th Street"],
    parkAndGreen: ["Madison Square Park", "Worth Square"],
    diningScene: "Anchored by notable restaurants around Madison Square Park and along Broadway, featuring rooftop bars, Korean cuisine on 32nd Street, and artisanal coffee shops."
  },
  "flatiron": {
    transitInfo: {
      subwayLines: ["N", "R", "W", "6", "L", "4", "5"],
      majorStations: ["23rd Street (N/R/W/6)", "14th Street-Union Square (4/5/6/L/N/Q/R/W)"]
    },
    localVibe: "Named for the iconic triangular Flatiron Building, this district features loft-style residences in converted commercial buildings along broad, sunlit avenues.",
    notableStreets: ["Broadway", "Fifth Avenue", "Park Avenue South", "23rd Street", "Lexington Avenue"],
    parkAndGreen: ["Madison Square Park", "Union Square Park", "Gramercy Park (private, key access)"],
    diningScene: "Eataly and the restaurants ringing Madison Square Park anchor the dining scene, complemented by a mix of upscale and casual options along Park Avenue South."
  },
  "gramercy": {
    transitInfo: {
      subwayLines: ["6", "L", "N", "R", "W"],
      majorStations: ["23rd Street (6)", "14th Street-Union Square (4/5/6/L/N/Q/R/W)"]
    },
    localVibe: "A residential enclave centered on Gramercy Park, one of Manhattan's two remaining private parks, surrounded by pre-war co-ops and townhouses on gas-lit blocks.",
    notableStreets: ["Irving Place", "Gramercy Park South", "Gramercy Park North", "Lexington Avenue", "Third Avenue"],
    parkAndGreen: ["Gramercy Park (private, key-holder access)", "Stuyvesant Square", "Peter Cooper Village green spaces"],
    diningScene: "Irving Place and the surrounding blocks offer a selection of wine bars, Italian trattorias, and neighborhood bistros in a residential setting."
  },
  "battery-park-city": {
    transitInfo: {
      subwayLines: ["1", "R", "W"],
      majorStations: ["Rector Street (1/R/W)", "Cortlandt Street (1/R/W)", "Chambers Street (1/2/3/A/C)"]
    },
    localVibe: "A master-planned waterfront community of modern residential towers lining the Hudson River esplanade, with manicured parks and river views throughout.",
    notableStreets: ["South End Avenue", "North End Avenue", "West Street", "River Terrace"],
    parkAndGreen: ["Battery Park City Esplanade", "Rockefeller Park", "Nelson A. Rockefeller Park Playground", "Teardrop Park", "Irish Hunger Memorial"],
    diningScene: "Waterfront dining along the esplanade and Brookfield Place's food hall, Le District, offering French-inspired market dining and Hudson River views."
  },
  "hudson-yards": {
    transitInfo: {
      subwayLines: ["7"],
      majorStations: ["34th Street-Hudson Yards (7)"]
    },
    localVibe: "A recently developed district of glass-and-steel towers above an active rail yard, anchored by a public plaza, observation deck, and retail center.",
    notableStreets: ["Hudson Boulevard", "Eleventh Avenue", "30th Street", "33rd Street"],
    parkAndGreen: ["Hudson Yards Public Square", "The High Line (northern terminus)", "Hudson River Park (nearby)"],
    diningScene: "A curated collection of restaurants within the Hudson Yards development, plus dining options along the High Line and extending into nearby Hell's Kitchen."
  },
  "midtown-west": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "A", "C", "E", "N", "Q", "R", "W", "B", "D", "F", "M"],
      majorStations: ["Penn Station-34th Street (1/2/3/A/C/E)", "Times Square-42nd Street (1/2/3/7/N/Q/R/W/S)", "Herald Square (B/D/F/M/N/Q/R/W)"]
    },
    localVibe: "The commercial core of Manhattan with Penn Station and Times Square, featuring post-war residential towers on the quieter side streets west of Eighth Avenue.",
    notableStreets: ["Broadway", "Seventh Avenue", "Eighth Avenue", "34th Street", "42nd Street"],
    parkAndGreen: ["Bryant Park", "Herald Square", "Hudson River Park"],
    diningScene: "Koreatown on 32nd Street and the blocks around Times Square offer a wide range of international cuisines, from Korean BBQ to Broadway pre-theater dining."
  },
  "west-village": {
    transitInfo: {
      subwayLines: ["1", "2", "3", "A", "C", "E", "L"],
      majorStations: ["Christopher Street-Sheridan Square (1)", "14th Street (A/C/E/L/1/2/3)", "West 4th Street (A/B/C/D/E/F/M)"]
    },
    localVibe: "Narrow, winding streets lined with Federal and Greek Revival townhouses, leafy courtyards, and small-scale brick buildings along the Hudson River's edge.",
    notableStreets: ["Bleecker Street", "Hudson Street", "West 4th Street", "Perry Street", "Charles Street", "Bank Street", "Greenwich Avenue"],
    parkAndGreen: ["Hudson River Park (Christopher Street Pier, Pier 45, Pier 46)", "Abingdon Square", "Jackson Square Park", "Bleecker Playground"],
    diningScene: "Intimate restaurants, bakeries, and wine bars line Bleecker, Hudson, and the side streets, with a strong tradition of Italian-American and French-inspired dining."
  },
  "nolita": {
    transitInfo: {
      subwayLines: ["6", "J", "Z", "N", "R", "W", "B", "D", "F", "M"],
      majorStations: ["Spring Street (6)", "Bowery (J/Z)", "Broadway-Lafayette (B/D/F/M)"]
    },
    localVibe: "A compact district of old-law tenements and narrow streets north of Little Italy, with boutique storefronts and outdoor dining along Mott and Elizabeth Streets.",
    notableStreets: ["Mott Street", "Elizabeth Street", "Mulberry Street", "Prince Street", "Spring Street"],
    parkAndGreen: ["Elizabeth Street Garden", "DeSalvio Playground", "Petrosino Square"],
    diningScene: "Sidewalk cafes and small-plate restaurants concentrate along Elizabeth and Mott Streets, featuring Italian, Mediterranean, and contemporary cuisine."
  },
  "noho": {
    transitInfo: {
      subwayLines: ["6", "B", "D", "F", "M", "N", "R", "W"],
      majorStations: ["Bleecker Street (6)", "Broadway-Lafayette Street (B/D/F/M)", "Astor Place (6)", "8th Street-NYU (N/R/W)"]
    },
    localVibe: "A small cluster of landmarked 19th-century commercial buildings and converted lofts between the Bowery and Broadway, with a gallery and design-studio character.",
    notableStreets: ["Bond Street", "Great Jones Street", "Lafayette Street", "Bleecker Street", "The Bowery"],
    parkAndGreen: ["Merchant's House Museum garden", "Colonnade Row", "nearby Tompkins Square Park"],
    diningScene: "Bond and Great Jones Streets host a collection of notable restaurants and wine bars in converted loft spaces and ground-floor storefronts."
  },
  "little-italy": {
    transitInfo: {
      subwayLines: ["6", "J", "Z", "N", "R", "W", "B", "D"],
      majorStations: ["Canal Street (6/J/Z/N/R/W)", "Spring Street (6)", "Bowery (J/Z)"]
    },
    localVibe: "A compact stretch of Mulberry Street defined by its red-sauce restaurants, bakeries, and seasonal street festivals, flanked by old-law tenement buildings.",
    notableStreets: ["Mulberry Street", "Grand Street", "Hester Street", "Mott Street"],
    parkAndGreen: ["Columbus Park", "DeSalvio Playground", "Petrosino Square"],
    diningScene: "Mulberry Street between Canal and Broome is the traditional restaurant row, featuring Italian-American trattorias, pastry shops, and gelaterias."
  },
  "chinatown": {
    transitInfo: {
      subwayLines: ["J", "Z", "N", "Q", "R", "W", "6", "B", "D"],
      majorStations: ["Canal Street (J/Z/N/Q/R/W/6)", "Grand Street (B/D)", "East Broadway (F)"]
    },
    localVibe: "Dense, bustling streets with open-air markets, herbal shops, and produce stands under fire-escape-fronted tenement buildings, one of the city's oldest commercial districts.",
    notableStreets: ["Canal Street", "Mott Street", "Baxter Street", "Doyers Street", "East Broadway", "Bowery"],
    parkAndGreen: ["Columbus Park", "Kimlau Square", "Chatham Square", "Sara D. Roosevelt Park"],
    diningScene: "One of the most concentrated dining districts in the city, featuring hand-pulled noodle shops, dim sum halls, Cantonese seafood restaurants, and Fujianese bakeries."
  },
  "washington-heights": {
    transitInfo: {
      subwayLines: ["1", "A", "C"],
      majorStations: ["168th Street (1/A/C)", "175th Street (A)", "181st Street (1/A)", "190th Street (A)", "George Washington Bridge Bus Station"]
    },
    localVibe: "Hilly, elevated terrain with pre-war apartment buildings and Art Deco facades, offering Hudson River views and proximity to Fort Tryon Park and The Cloisters museum.",
    notableStreets: ["Broadway", "Fort Washington Avenue", "St. Nicholas Avenue", "181st Street", "Cabrini Boulevard"],
    parkAndGreen: ["Fort Tryon Park (The Cloisters)", "Highbridge Park", "J. Hood Wright Park", "Bennett Park (Manhattan's highest point)"],
    diningScene: "Broadway and St. Nicholas Avenue feature Dominican and Caribbean cuisine, empanada shops, bakeries, and a growing number of contemporary restaurants."
  },
  "inwood": {
    transitInfo: {
      subwayLines: ["1", "A"],
      majorStations: ["Inwood-207th Street (A)", "Dyckman Street (1/A)", "215th Street (1)"]
    },
    localVibe: "Manhattan's northernmost neighborhood, where pre-war apartment buildings sit adjacent to old-growth forest in Inwood Hill Park and the Harlem River waterfront.",
    notableStreets: ["Broadway", "Dyckman Street", "Seaman Avenue", "Indian Road", "Payson Avenue"],
    parkAndGreen: ["Inwood Hill Park", "Isham Park", "Sherman Creek Park", "The Muscota Marsh"],
    diningScene: "Dyckman Street is the main dining corridor, with Dominican restaurants, seafood spots, and a growing selection of contemporary cafes and bars."
  },
  "murray-hill": {
    transitInfo: {
      subwayLines: ["6", "S"],
      majorStations: ["33rd Street (6)", "Grand Central-42nd Street (4/5/6/7/S)", "28th Street (6)"]
    },
    localVibe: "A residential enclave of brownstones and mid-rise apartment buildings between the commercial corridors of Park Avenue South and Third Avenue.",
    notableStreets: ["Park Avenue", "Lexington Avenue", "Third Avenue", "Madison Avenue", "34th Street"],
    parkAndGreen: ["St. Vartan Park", "Murray Hill Playground", "nearby Bryant Park"],
    diningScene: "Third and Lexington Avenues host a concentration of Indian restaurants (Curry Hill around 28th Street), along with Korean BBQ, Japanese izakayas, and pub-style dining."
  },
  "kips-bay": {
    transitInfo: {
      subwayLines: ["6"],
      majorStations: ["28th Street (6)", "33rd Street (6)", "23rd Street (6)"]
    },
    localVibe: "A residential stretch along the East River featuring post-war tower complexes and mid-rise buildings, with a quieter character than neighboring Midtown.",
    notableStreets: ["Second Avenue", "Third Avenue", "First Avenue", "34th Street"],
    parkAndGreen: ["Asser Levy Park", "Kips Bay Playground", "Bellevue South Park", "NYC Ferry landing at East 34th Street"],
    diningScene: "Second and Third Avenues offer a range of casual eateries including Indian, Thai, and Japanese restaurants, extending from the Curry Hill dining strip."
  },
  "sutton-place": {
    transitInfo: {
      subwayLines: ["4", "5", "6", "E", "M"],
      majorStations: ["51st Street (6)", "Lexington Avenue-53rd Street (E/M)", "59th Street (4/5/6/N/R/W)"]
    },
    localVibe: "A quiet residential enclave of mid-century co-ops and townhouses on the East River, with cul-de-sac streets and private gardens overlooking the Queensboro Bridge.",
    notableStreets: ["Sutton Place", "Sutton Place South", "East 57th Street", "East 59th Street", "York Avenue"],
    parkAndGreen: ["Sutton Place Park", "Bridgemarket Plaza", "Andrew Haswell Green Park", "East River Esplanade"],
    diningScene: "A selection of neighborhood restaurants and cafes along First and Second Avenues, with fine dining options concentrated near East 57th Street."
  },
  "morningside-heights": {
    transitInfo: {
      subwayLines: ["1"],
      majorStations: ["116th Street-Columbia University (1)", "Cathedral Parkway-110th Street (1)", "125th Street (1)"]
    },
    localVibe: "A hilltop neighborhood defined by Columbia University's campus, the Cathedral of St. John the Divine, and Riverside Church, with pre-war apartment buildings along Broadway.",
    notableStreets: ["Broadway", "Amsterdam Avenue", "Morningside Drive", "Riverside Drive", "116th Street"],
    parkAndGreen: ["Morningside Park", "Riverside Park (northern section)", "Sakura Park"],
    diningScene: "Broadway near Columbia University features a mix of international restaurants, cafes, bookstore-cafes, and takeout spots catering to a bustling campus neighborhood."
  },
  "east-harlem": {
    transitInfo: {
      subwayLines: ["4", "5", "6"],
      majorStations: ["125th Street (4/5/6)", "116th Street (6)", "103rd Street (6)", "110th Street (6)"]
    },
    localVibe: "A neighborhood of pre-war tenements and public housing alongside new-construction condos, centered on the commercial corridors of Lexington Avenue and 116th Street.",
    notableStreets: ["Lexington Avenue", "Third Avenue", "116th Street", "125th Street", "Pleasant Avenue"],
    parkAndGreen: ["Marcus Garvey Park", "Thomas Jefferson Park", "Randalls Island (via footbridge)", "Harlem River Park"],
    diningScene: "Lexington Avenue and the surrounding blocks feature Puerto Rican and Latin American cuisine, with a growing number of contemporary eateries and bakeries."
  },
  "roosevelt-island": {
    transitInfo: {
      subwayLines: ["F"],
      majorStations: ["Roosevelt Island (F)", "Roosevelt Island Tramway (to 59th Street/Lexington)"]
    },
    localVibe: "A narrow, car-limited island in the East River with modernist residential towers, a waterfront promenade, and views of both the Manhattan and Queens skylines.",
    notableStreets: ["Main Street", "West Road", "East Road"],
    parkAndGreen: ["Franklin D. Roosevelt Four Freedoms State Park", "Southpoint Park", "Lighthouse Park", "Octagon Park"],
    diningScene: "A small collection of cafes and restaurants along Main Street, with most residents accessing Manhattan and Queens dining via the F train or aerial tramway."
  },
  "yorkville": {
    transitInfo: {
      subwayLines: ["4", "5", "6", "Q"],
      majorStations: ["86th Street (4/5/6/Q)", "96th Street (6/Q)"]
    },
    localVibe: "A residential section of the Upper East Side between Lexington Avenue and the East River, with a mix of pre-war walk-ups, post-war towers, and newer condo developments.",
    notableStreets: ["Second Avenue", "First Avenue", "York Avenue", "East 86th Street"],
    parkAndGreen: ["Carl Schurz Park", "John Jay Park", "Asphalt Green", "East River Esplanade"],
    diningScene: "Second Avenue is the main dining strip, with a mix of German-heritage restaurants, neighborhood pubs, sushi bars, and contemporary cafes."
  },
  "two-bridges": {
    transitInfo: {
      subwayLines: ["F", "J", "Z"],
      majorStations: ["East Broadway (F)", "Fulton Street (J/Z/2/3/4/5)"]
    },
    localVibe: "A waterfront district between the Brooklyn Bridge and Manhattan Bridge, featuring a mix of public housing towers, tenement walk-ups, and new-construction high-rises along the East River.",
    notableStreets: ["Cherry Street", "Monroe Street", "Madison Street", "Pike Street", "Market Street"],
    parkAndGreen: ["Cherry Clinton Playground", "Corlears Hook Park", "East River Park (nearby)", "Rutgers Slip Park"],
    diningScene: "A mix of traditional Chinese bakeries and seafood restaurants alongside newer cafes, with proximity to the dining options of Chinatown and the Lower East Side."
  },

  // ============ BROOKLYN (10) ============
  "brooklyn-heights": {
    transitInfo: {
      subwayLines: ["2", "3", "4", "5", "A", "C", "R"],
      majorStations: ["Borough Hall (2/3/4/5)", "Clark Street (2/3)", "High Street-Brooklyn Bridge (A/C)", "Court Street (R)"]
    },
    localVibe: "New York City's first historic district, with tree-lined streets of Federal and Greek Revival brownstones overlooking the East River from the landmark Promenade.",
    notableStreets: ["Montague Street", "Henry Street", "Clinton Street", "Hicks Street", "Columbia Heights", "Pierrepont Street"],
    parkAndGreen: ["Brooklyn Bridge Park", "Brooklyn Heights Promenade", "Cadman Plaza Park", "Pierrepont Playground"],
    diningScene: "Montague Street and Henry Street feature a mix of neighborhood bistros, Middle Eastern restaurants, and waterfront dining options near Brooklyn Bridge Park."
  },
  "williamsburg": {
    transitInfo: {
      subwayLines: ["L", "J", "M", "G"],
      majorStations: ["Bedford Avenue (L)", "Marcy Avenue (J/M/Z)", "Lorimer Street (L/G)", "Metropolitan Avenue (G)"]
    },
    localVibe: "Former industrial waterfront blocks of converted warehouses and new glass towers, with a dense concentration of independent shops, galleries, and music venues.",
    notableStreets: ["Bedford Avenue", "Berry Street", "Wythe Avenue", "North 6th Street", "Grand Street", "Driggs Avenue"],
    parkAndGreen: ["Domino Park", "McCarren Park", "East River State Park", "Marsha P. Johnson State Park", "Grand Ferry Park"],
    diningScene: "One of Brooklyn's most concentrated dining districts, with wood-fired pizza, craft breweries, rooftop bars, and international cuisines along Bedford and Wythe Avenues."
  },
  "dumbo": {
    transitInfo: {
      subwayLines: ["A", "C", "F", "2", "3"],
      majorStations: ["York Street (F)", "High Street-Brooklyn Bridge (A/C)", "Jay Street-MetroTech (A/C/F/R)"]
    },
    localVibe: "Converted warehouse lofts beneath the Manhattan Bridge overpass, with cobblestone streets, waterfront views of the Manhattan skyline, and a thriving tech and arts presence.",
    notableStreets: ["Water Street", "Washington Street", "Front Street", "Main Street", "Plymouth Street"],
    parkAndGreen: ["Brooklyn Bridge Park (Main Street section, Jane's Carousel, Pebble Beach)", "Empire Fulton Ferry Park"],
    diningScene: "Waterfront restaurants and converted-warehouse eateries along Water and Front Streets, with the Time Out Market food hall at Empire Stores."
  },
  "park-slope": {
    transitInfo: {
      subwayLines: ["B", "Q", "2", "3", "D", "N", "R", "F", "G"],
      majorStations: ["Atlantic Avenue-Barclays Center (2/3/4/5/B/D/N/Q/R)", "7th Avenue (B/Q)", "Union Street (R)", "4th Avenue-9th Street (F/G/R)"]
    },
    localVibe: "A brownstone neighborhood sloping toward Prospect Park, with wide, tree-canopied blocks of Romanesque and Queen Anne row houses and an active commercial strip along Fifth and Seventh Avenues.",
    notableStreets: ["Fifth Avenue", "Seventh Avenue", "Prospect Park West", "Union Street", "Carroll Street", "President Street"],
    parkAndGreen: ["Prospect Park", "Grand Army Plaza", "J.J. Byrne Playground (Washington Park)", "Old Stone House"],
    diningScene: "Fifth and Seventh Avenues feature a wide range of restaurants, from farm-to-table American to Thai, Mexican, and Italian, with numerous brunch destinations."
  },
  "cobble-hill": {
    transitInfo: {
      subwayLines: ["F", "G", "2", "3", "4", "5"],
      majorStations: ["Bergen Street (F/G)", "Borough Hall (2/3/4/5)", "Carroll Street (F/G)"]
    },
    localVibe: "A small, landmarked neighborhood of well-preserved brownstones and tree-lined blocks between Brooklyn Heights and Carroll Gardens, with a village-like commercial strip along Court and Smith Streets.",
    notableStreets: ["Court Street", "Smith Street", "Atlantic Avenue", "Clinton Street", "Congress Street"],
    parkAndGreen: ["Cobble Hill Park", "Carroll Park (nearby)", "Kane Street Playground"],
    diningScene: "Court and Smith Streets offer a curated collection of French bistros, wine bars, Middle Eastern bakeries on Atlantic Avenue, and neighborhood Italian restaurants."
  },
  "carroll-gardens": {
    transitInfo: {
      subwayLines: ["F", "G"],
      majorStations: ["Carroll Street (F/G)", "Smith-9th Streets (F/G)"]
    },
    localVibe: "Brownstone row houses with deep front gardens set back from the sidewalk, a distinguishing feature of this Italian-American-rooted neighborhood along the Gowanus Canal's western edge.",
    notableStreets: ["Court Street", "Smith Street", "Carroll Street", "President Street", "Union Street"],
    parkAndGreen: ["Carroll Park", "Thomas Greene Playground", "Gowanus Canal esplanade (in development)"],
    diningScene: "Smith and Court Streets are lined with Italian-American red-sauce restaurants, modern trattorias, and a growing selection of wine bars and bakeries."
  },
  "fort-greene": {
    transitInfo: {
      subwayLines: ["C", "G", "B", "Q", "2", "3", "4", "5", "D", "N", "R"],
      majorStations: ["Lafayette Avenue (C)", "Fulton Street (G)", "Atlantic Avenue-Barclays Center (2/3/4/5/B/D/N/Q/R)", "DeKalb Avenue (B/Q/R)"]
    },
    localVibe: "A brownstone neighborhood anchored by Fort Greene Park and the Brooklyn Academy of Music, with landmarked row houses and proximity to the Barclays Center and Atlantic Terminal.",
    notableStreets: ["DeKalb Avenue", "Lafayette Avenue", "Fulton Street", "Myrtle Avenue", "South Portland Avenue"],
    parkAndGreen: ["Fort Greene Park", "BAM Park", "Commodore Barry Park"],
    diningScene: "DeKalb Avenue and Fulton Street feature a range of cuisines including West African, Caribbean, contemporary American, and a growing number of cocktail bars and cafes."
  },
  "prospect-heights": {
    transitInfo: {
      subwayLines: ["2", "3", "4", "5", "B", "Q", "D", "N", "R"],
      majorStations: ["Atlantic Avenue-Barclays Center (2/3/4/5/B/D/N/Q/R)", "Bergen Street (2/3)", "Eastern Parkway-Brooklyn Museum (2/3)"]
    },
    localVibe: "A mix of brownstone blocks and new Pacific Park development towers, bordered by the Brooklyn Museum, Brooklyn Botanic Garden, and Grand Army Plaza.",
    notableStreets: ["Vanderbilt Avenue", "Washington Avenue", "Flatbush Avenue", "Sterling Place", "St. Marks Avenue"],
    parkAndGreen: ["Prospect Park (Grand Army Plaza entrance)", "Brooklyn Botanic Garden", "Eastern Parkway greenway"],
    diningScene: "Vanderbilt Avenue is the main dining corridor, with a growing collection of wine bars, farm-to-table restaurants, and international eateries."
  },
  "greenpoint": {
    transitInfo: {
      subwayLines: ["G"],
      majorStations: ["Greenpoint Avenue (G)", "Nassau Avenue (G)"]
    },
    localVibe: "A waterfront neighborhood of low-rise row houses and converted industrial buildings, with a strong Polish-heritage commercial strip and new development along the East River.",
    notableStreets: ["Manhattan Avenue", "Franklin Street", "Nassau Avenue", "India Street", "West Street"],
    parkAndGreen: ["WNYC Transmitter Park", "McCarren Park (northern edge)", "Newtown Barge Playground", "Java Street Garden"],
    diningScene: "Manhattan Avenue features Polish bakeries and delis alongside contemporary cafes, craft cocktail bars, and a growing number of Asian and Mediterranean restaurants."
  },
  "bed-stuy": {
    transitInfo: {
      subwayLines: ["A", "C", "G", "J", "Z"],
      majorStations: ["Nostrand Avenue (A/C)", "Bedford-Nostrand Avenues (G)", "Utica Avenue (A/C)", "Myrtle Avenue (J/Z)"]
    },
    localVibe: "One of Brooklyn's largest neighborhoods, defined by blocks of Italianate and Neo-Grec brownstones and row houses, with a strong architectural character and active commercial corridors.",
    notableStreets: ["Nostrand Avenue", "Bedford Avenue", "Tompkins Avenue", "Lewis Avenue", "Stuyvesant Avenue", "Fulton Street"],
    parkAndGreen: ["Herbert Von King Park", "Saratoga Park", "Stuyvesant Heights Historic District green spaces"],
    diningScene: "Nostrand and Tompkins Avenues host a mix of Caribbean cuisine, Southern-inspired restaurants, contemporary brunch spots, and neighborhood cafes."
  },

  // ============ QUEENS (7) ============
  "astoria": {
    transitInfo: {
      subwayLines: ["N", "W", "M", "R"],
      majorStations: ["Astoria-Ditmars Boulevard (N/W)", "Astoria Boulevard (N/W)", "30th Avenue (N/W)", "Broadway (N/W)", "Steinway Street (M/R)"]
    },
    localVibe: "A grid-plan neighborhood of two-story row houses and low-rise apartment buildings, with a lively commercial strip culture and waterfront access along the East River.",
    notableStreets: ["Ditmars Boulevard", "Broadway", "30th Avenue", "Steinway Street", "31st Street"],
    parkAndGreen: ["Astoria Park", "Rainey Park", "Socrates Sculpture Park", "Halletts Point Playground"],
    diningScene: "One of the city's most varied dining districts, with Greek tavernas, Egyptian bakeries, Colombian restaurants, and craft beer gardens concentrated along Broadway, 30th Avenue, and Ditmars Boulevard."
  },
  "long-island-city": {
    transitInfo: {
      subwayLines: ["7", "E", "M", "G", "N", "W"],
      majorStations: ["Court Square (E/M/G/7)", "Queensboro Plaza (N/W/7)", "Hunters Point Avenue (7)", "Long Island City-Court Square (G)"]
    },
    localVibe: "A rapidly developed waterfront district of glass-tower residences and converted industrial lofts, with views of the Manhattan skyline across the East River.",
    notableStreets: ["Vernon Boulevard", "Jackson Avenue", "Center Boulevard", "Thomson Avenue", "Queens Boulevard"],
    parkAndGreen: ["Gantry Plaza State Park", "Hunter's Point South Park", "Queensbridge Park", "Murray Playground"],
    diningScene: "Vernon Boulevard and Jackson Avenue feature a growing restaurant scene, from waterfront dining to artisanal food halls and contemporary eateries."
  },
  "jackson-heights": {
    transitInfo: {
      subwayLines: ["7", "E", "F", "M", "R"],
      majorStations: ["Jackson Heights-Roosevelt Avenue (7/E/F/M/R)", "82nd Street-Jackson Heights (7)", "74th Street-Broadway (7)"]
    },
    localVibe: "A planned garden community of pre-war co-op buildings with interior courtyards, recognized as a National Historic District for its distinctive Tudor and Romanesque architecture.",
    notableStreets: ["Roosevelt Avenue", "Broadway (37th Avenue)", "74th Street", "82nd Street", "Northern Boulevard"],
    parkAndGreen: ["Diversity Plaza", "Travers Park", "Jackson Heights Green Alliance gardens", "34th Avenue Open Street"],
    diningScene: "Roosevelt Avenue and 74th Street form one of the city's most concentrated international food corridors, featuring South Asian, Tibetan, Colombian, Mexican, and Ecuadorian cuisines."
  },
  "flushing": {
    transitInfo: {
      subwayLines: ["7"],
      majorStations: ["Flushing-Main Street (7)", "Mets-Willets Point (7)"]
    },
    localVibe: "A major commercial center at the eastern terminus of the 7 train, with dense retail corridors, multilingual signage, and a mix of high-rise condos and row houses.",
    notableStreets: ["Main Street", "Roosevelt Avenue", "Northern Boulevard", "Union Street", "Kissena Boulevard"],
    parkAndGreen: ["Flushing Meadows-Corona Park", "Kissena Park", "Queens Botanical Garden", "Bowne Park"],
    diningScene: "One of the largest and most concentrated Asian dining destinations in the Western Hemisphere, featuring Sichuan, Cantonese, Shanghainese, Korean, and Southeast Asian cuisines."
  },
  "forest-hills": {
    transitInfo: {
      subwayLines: ["E", "F", "M", "R"],
      majorStations: ["Forest Hills-71st Avenue (E/F/M/R)", "67th Avenue (M/R)"]
    },
    localVibe: "A residential neighborhood anchored by the Tudor-style Forest Hills Gardens enclave, with a walkable commercial strip along Austin Street and a mix of co-ops and single-family homes.",
    notableStreets: ["Austin Street", "Queens Boulevard", "Continental Avenue", "108th Street", "Metropolitan Avenue"],
    parkAndGreen: ["Forest Park", "Yellowstone Park", "Annadale Playground", "Forest Hills Gardens (private streets)"],
    diningScene: "Austin Street is the main dining corridor, with a range of steakhouses, sushi restaurants, Uzbek cuisine, Italian trattorias, and neighborhood cafes."
  },
  "sunnyside": {
    transitInfo: {
      subwayLines: ["7"],
      majorStations: ["46th Street-Bliss (7)", "40th Street-Lowery (7)", "33rd Street-Rawson (7)"]
    },
    localVibe: "A compact, walkable neighborhood of brick row houses and garden-style apartment buildings, with a lively commercial strip along Queens Boulevard and Skillman Avenue.",
    notableStreets: ["Queens Boulevard", "Skillman Avenue", "Greenpoint Avenue", "46th Street", "43rd Avenue"],
    parkAndGreen: ["Sunnyside Gardens Park (private community park)", "Lou Lodati Playground", "Noonan Playground"],
    diningScene: "Queens Boulevard and Skillman Avenue feature a mix of Turkish, Romanian, Korean, Mexican, and Irish pub dining, reflecting the neighborhood's layered commercial character."
  },
  "bayside": {
    transitInfo: {
      subwayLines: ["7"],
      majorStations: ["Flushing-Main Street (7, then bus)", "Bayside LIRR station"]
    },
    localVibe: "A tree-lined residential neighborhood of single-family homes and garden-style co-ops, with a walkable downtown along Bell Boulevard and proximity to Little Neck Bay.",
    notableStreets: ["Bell Boulevard", "Northern Boulevard", "Francis Lewis Boulevard", "35th Avenue"],
    parkAndGreen: ["Fort Totten Park", "Crocheron Park", "Cunningham Park", "Little Bay Park", "Alley Pond Park"],
    diningScene: "Bell Boulevard is the main restaurant strip, featuring Korean BBQ, Italian restaurants, steakhouses, and waterfront seafood options near Little Neck Bay."
  },

  // ============ BRONX (5) ============
  "riverdale": {
    transitInfo: {
      subwayLines: ["1"],
      majorStations: ["231st Street (1)", "238th Street (1)", "Van Cortlandt Park-242nd Street (1)", "Riverdale Metro-North", "Spuyten Duyvil Metro-North"]
    },
    localVibe: "A hilly, tree-canopied enclave of Tudor homes, Colonial-style houses, and large co-op complexes, with Hudson River views and a distinctly residential character.",
    notableStreets: ["Riverdale Avenue", "Johnson Avenue", "Palisade Avenue", "Independence Avenue", "Henry Hudson Parkway"],
    parkAndGreen: ["Van Cortlandt Park", "Wave Hill", "Riverdale Park", "Seton Park", "Delafield Park"],
    diningScene: "Johnson Avenue and Riverdale Avenue feature a mix of neighborhood restaurants, diners, and bakeries, with dining options extending along Broadway near 242nd Street."
  },
  "city-island": {
    transitInfo: {
      subwayLines: ["6"],
      majorStations: ["Pelham Bay Park (6, then Bx29 bus to City Island)"]
    },
    localVibe: "A mile-long island in the Long Island Sound with a New England fishing-village character, featuring clapboard houses, marinas, and nautical-themed storefronts along a single main street.",
    notableStreets: ["City Island Avenue"],
    parkAndGreen: ["Pelham Bay Park (adjacent)", "City Island Nautical Museum grounds", "Orchard Beach (nearby)"],
    diningScene: "City Island Avenue is lined with seafood restaurants, many with waterfront dining and views of the Long Island Sound and Eastchester Bay."
  },
  "mott-haven": {
    transitInfo: {
      subwayLines: ["4", "5", "6", "2"],
      majorStations: ["138th Street-Grand Concourse (4/5)", "3rd Avenue-138th Street (6)", "Brook Avenue (6)", "149th Street-Grand Concourse (2/4/5)"]
    },
    localVibe: "A South Bronx waterfront neighborhood of landmarked brownstone row houses and new mixed-use developments along the Harlem River, with industrial-to-residential conversions underway.",
    notableStreets: ["Alexander Avenue", "Third Avenue", "138th Street", "Bruckner Boulevard", "Grand Concourse"],
    parkAndGreen: ["St. Mary's Park", "Mill Pond Park", "Randalls Island (via footbridge)", "Bronx Kill Greenway"],
    diningScene: "A growing dining scene along Alexander Avenue and Third Avenue, with Latin American restaurants, craft breweries, and contemporary eateries in the emerging waterfront district."
  },
  "pelham-bay": {
    transitInfo: {
      subwayLines: ["6"],
      majorStations: ["Pelham Bay Park (6)", "Buhre Avenue (6)", "Middletown Road (6)"]
    },
    localVibe: "A residential neighborhood of detached houses, garden-style co-ops, and low-rise apartment buildings, adjacent to the city's largest park and Orchard Beach on the Long Island Sound.",
    notableStreets: ["Pelham Parkway", "Crosby Avenue", "Middletown Road", "Country Club Road", "Westchester Avenue"],
    parkAndGreen: ["Pelham Bay Park (2,772 acres)", "Orchard Beach", "Twin Islands", "Hunter Island", "Turtle Cove Golf Center"],
    diningScene: "Crosby Avenue and Middletown Road feature Italian-American restaurants, Albanian cuisine, seafood spots, and neighborhood delis and bakeries."
  },
  "fordham": {
    transitInfo: {
      subwayLines: ["4", "B", "D"],
      majorStations: ["Fordham Road (4)", "Fordham Road (B/D)", "Kingsbridge Road (4/B/D)"]
    },
    localVibe: "A commercial hub centered on Fordham Road's retail corridor, with Fordham University's Gothic campus, the Bronx Zoo, and the New York Botanical Garden anchoring the surrounding blocks.",
    notableStreets: ["Fordham Road", "Grand Concourse", "Arthur Avenue", "Southern Boulevard", "Webster Avenue"],
    parkAndGreen: ["New York Botanical Garden", "Bronx Zoo (nearby)", "Poe Park", "Devoe Park", "St. James Park"],
    diningScene: "Arthur Avenue, known as the Bronx's Little Italy, is a destination for Italian-American markets, bakeries, pasta shops, and restaurants, with a vibrant indoor retail market."
  },

  // ============ STATEN ISLAND (4) ============
  "st-george": {
    transitInfo: {
      subwayLines: ["SIR"],
      majorStations: ["St. George SIR Terminal", "Staten Island Ferry Terminal (to Whitehall, Manhattan)"]
    },
    localVibe: "Staten Island's civic center at the ferry terminal, with Victorian-era hillside homes offering harbor views and a waterfront esplanade lined with new mixed-use development.",
    notableStreets: ["Bay Street", "Stuyvesant Place", "Richmond Terrace", "Victory Boulevard", "St. Marks Place"],
    parkAndGreen: ["St. George Esplanade", "Tompkinsville Park", "Snug Harbor Cultural Center (nearby)", "National Lighthouse Museum grounds"],
    diningScene: "Bay Street and Stuyvesant Place host a growing collection of restaurants, cafes, and bars, with waterfront dining options near the ferry terminal and esplanade."
  },
  "todt-hill": {
    transitInfo: {
      subwayLines: [],
      majorStations: ["Bus routes S74, S76, S78 to St. George Ferry Terminal"]
    },
    localVibe: "Staten Island's highest elevation, a residential enclave of large single-family homes set on wooded lots, with mature landscaping and winding, hilly roads.",
    notableStreets: ["Todt Hill Road", "Four Corners Road", "Ocean Terrace", "Benedict Road", "Flagg Place"],
    parkAndGreen: ["Reed's Basket Willow Swamp Park", "High Rock Park", "Willowbrook Park (nearby)", "Greenbelt Nature Center (nearby)"],
    diningScene: "Dining options are concentrated along Hylan Boulevard and Victory Boulevard, with Italian-American restaurants and neighborhood eateries accessible by short drive."
  },
  "great-kills": {
    transitInfo: {
      subwayLines: ["SIR"],
      majorStations: ["Great Kills SIR station"]
    },
    localVibe: "A waterfront residential neighborhood of single-family homes and low-rise buildings on the southeastern shore, with access to a harbor marina and the Gateway National Recreation Area.",
    notableStreets: ["Hylan Boulevard", "Nelson Avenue", "Hillside Terrace", "Amboy Road"],
    parkAndGreen: ["Great Kills Park (Gateway National Recreation Area)", "Great Kills Harbor", "Wolfe's Pond Park (nearby)", "Blue Heron Park (nearby)"],
    diningScene: "Hylan Boulevard and Nelson Avenue feature Italian-American restaurants, pizza shops, seafood spots, and neighborhood delis."
  },
  "new-brighton": {
    transitInfo: {
      subwayLines: ["SIR"],
      majorStations: ["St. George SIR Terminal (adjacent)"]
    },
    localVibe: "A hillside neighborhood adjacent to St. George, with Victorian and Colonial Revival houses, views of the Kill Van Kull waterway, and proximity to the Snug Harbor Cultural Center.",
    notableStreets: ["Richmond Terrace", "Jersey Street", "Castleton Avenue", "Brighton Avenue", "Henderson Avenue"],
    parkAndGreen: ["Snug Harbor Cultural Center & Botanical Garden", "Silver Lake Park", "Clove Lakes Park (nearby)", "Sailors' Snug Harbor grounds"],
    diningScene: "Richmond Terrace and Castleton Avenue offer a selection of neighborhood restaurants, including Sri Lankan cuisine, Italian-American eateries, and waterfront dining."
  }
};

// Process each borough file
const boroughFiles = [
  'manhattan-neighborhoods.json',
  'brooklyn-neighborhoods.json',
  'queens-neighborhoods.json',
  'bronx-neighborhoods.json',
  'staten-island-neighborhoods.json'
];

const dataDir = path.join(__dirname, '..', 'data');

let totalEnriched = 0;
let totalSkipped = 0;

for (const file of boroughFiles) {
  const filePath = path.join(dataDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  let fileEnriched = 0;

  for (const neighborhood of data.neighborhoods) {
    const slug = neighborhood.slug;
    const enrichment = enrichmentData[slug];

    if (!enrichment) {
      console.log(`  WARN: No enrichment data for ${slug} in ${file}`);
      totalSkipped++;
      continue;
    }

    let added = false;
    for (const [key, value] of Object.entries(enrichment)) {
      if (!(key in neighborhood)) {
        neighborhood[key] = value;
        added = true;
      }
    }

    if (added) {
      fileEnriched++;
      totalEnriched++;
    }
  }

  // Write back
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`${file}: enriched ${fileEnriched} neighborhoods`);
}

console.log(`\nTotal enriched: ${totalEnriched}, Skipped (no data): ${totalSkipped}`);
