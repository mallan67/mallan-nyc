import {
  isInCorridor,
  isManhattanBbl,
  CORRIDOR_BOUNDS,
  MANHATTAN_BORO_CODE,
  CORRIDOR_FEATURE,
} from "@/lib/geo/manhattan-corridor";

describe("isInCorridor — landmarks INSIDE the corridor", () => {
  test.each([
    ["Mallan Real Estate office (400 E 90th St)", 40.7790, -73.9489],
    ["Empire State Building (350 5th Ave / 34th)", 40.7484, -73.9857],
    ["Times Square (Broadway & 7th / 42nd)", 40.7580, -73.9855],
    ["Rockefeller Center (50th & 5th)", 40.7587, -73.9787],
    ["Lincoln Center (66th & Broadway)", 40.7725, -73.9835],
    ["Carnegie Hall (57th & 7th)", 40.7651, -73.9799],
    ["Grand Central Terminal (42nd & Park)", 40.7527, -73.9772],
    ["Bryant Park (42nd & 6th)", 40.7536, -73.9832],
    ["Battery Park (south tip)", 40.7034, -74.0170],
    ["WTC One (FiDi)", 40.7127, -74.0134],
    ["Brookfield Place (Battery Park City)", 40.7128, -74.0157],
    ["Washington Square Park (Greenwich Village)", 40.7308, -73.9973],
    ["Union Square (14th)", 40.7359, -73.9911],
    ["Chelsea Market (15th & 9th)", 40.7423, -74.0061],
    ["Hudson Yards (33rd & 11th)", 40.7536, -74.0014],
    ["High Line south end (Gansevoort)", 40.7398, -74.0080],
    ["Tompkins Square Park (East Village)", 40.7264, -73.9818],
    ["Stuyvesant Town (16th & 1st)", 40.7325, -73.9779],
    ["UN Headquarters (42nd & FDR)", 40.7489, -73.9680],
    ["Sutton Place (57th between 1st & FDR)", 40.7591, -73.9608],
    ["Lenox Hill Hospital (77th & Lex)", 40.7733, -73.9617],
    ["Carnegie Hill (91st & Madison)", 40.7843, -73.9559],
    ["UWS Beacon Theatre (74th & B'way)", 40.7800, -73.9818],
    ["WV Bleecker St (Bleecker & Christopher)", 40.7331, -74.0036],
    ["TriBeCa (Greenwich & Franklin)", 40.7187, -74.0089],
    ["SoHo (Spring & Broadway)", 40.7227, -73.9986],
    ["Lower East Side (Delancey & Essex)", 40.7184, -73.9883],
    ["Lincoln Square (62nd & Columbus)", 40.7716, -73.9818],
    ["96th & Lex (just south of 97th E boundary)", 40.7847, -73.9510],
    ["109th & CPW (just south of 110th W boundary)", 40.7986, -73.9624],
  ])("%s should be inside", (_, lat, lng) => {
    expect(isInCorridor(lat, lng)).toBe(true);
  });
});

describe("isInCorridor — landmarks OUTSIDE the corridor", () => {
  test.each([
    ["East Harlem (125th & Lex)", 40.8033, -73.9376],
    ["Spanish Harlem (110th & 3rd Ave)", 40.7976, -73.9438], // east of CP, north of 97
    ["Harlem (125th & St Nicholas)", 40.8104, -73.9494],
    ["Columbia U Low Library (116th & B'way)", 40.8075, -73.9626],
    ["Morningside Heights (115th & Amsterdam)", 40.8061, -73.9622],
    ["Apollo Theater (125th & ACP Blvd)", 40.8099, -73.9505],
    ["Hamilton Heights (140th & Broadway)", 40.8222, -73.9530],
    ["Washington Heights (175th & B'way)", 40.8434, -73.9395],
    ["Inwood (Dyckman St)", 40.8676, -73.9210],
    ["Yankee Stadium (Bronx)", 40.8296, -73.9262],
    ["Brooklyn Heights Promenade", 40.6961, -73.9961],
    ["DUMBO (Brooklyn)", 40.7032, -73.9892],
    ["Williamsburg (Bedford & N 7th)", 40.7174, -73.9568],
    ["Astoria (Steinway St)", 40.7597, -73.9183],
    ["LIC Court Sq", 40.7470, -73.9460],
    ["Roosevelt Island (mid)", 40.7615, -73.9499],
    ["JFK Airport", 40.6413, -73.7781],
    ["Newark Airport", 40.6895, -74.1745],
    ["98th & Lex (just north of 97th E boundary)", 40.7869, -73.9523],
    ["111th & CPW (just north of 110th W boundary)", 40.8006, -73.9616],
  ])("%s should be outside", (_, lat, lng) => {
    expect(isInCorridor(lat, lng)).toBe(false);
  });
});

describe("isInCorridor — bad input handling", () => {
  test.each([
    ["NaN lat", NaN, -73.9786],
    ["NaN lng", 40.7580, NaN],
    ["Infinity lat", Infinity, -73.9786],
    ["Infinity lng", 40.7580, -Infinity],
    ["null-ish 0,0 (off Africa)", 0, 0],
  ])("%s returns false", (_, lat, lng) => {
    expect(isInCorridor(lat as number, lng as number)).toBe(false);
  });
});

describe("CORRIDOR_BOUNDS", () => {
  it("captures Manhattan-corridor extents", () => {
    expect(CORRIDOR_BOUNDS.minLat).toBeCloseTo(40.7011, 2);
    expect(CORRIDOR_BOUNDS.maxLat).toBeCloseTo(40.802, 2);
    expect(CORRIDOR_BOUNDS.minLng).toBeCloseTo(-74.0177, 2);
    expect(CORRIDOR_BOUNDS.maxLng).toBeCloseTo(-73.945, 2);
  });
});

describe("isManhattanBbl", () => {
  test.each([
    ["1015730019 (Mallan office, sample MN BBL)", true],
    ["1000010001 (FiDi)", true],
    ["1", true],
    ["3001230045 (Brooklyn BBL)", false],
    ["4000000000 (Queens BBL)", false],
    ["5000000000 (Staten Island BBL)", false],
    ["2000000000 (Bronx BBL)", false],
    ["", false],
  ])("%s → %s", (bbl, expected) => {
    expect(isManhattanBbl(bbl)).toBe(expected);
  });

  it("accepts numeric BBL", () => {
    expect(isManhattanBbl(1015730019)).toBe(true);
    expect(isManhattanBbl(3001230045)).toBe(false);
  });
});

describe("CORRIDOR_FEATURE shape", () => {
  it("is a valid GeoJSON Polygon Feature with non-trivial ring", () => {
    expect(CORRIDOR_FEATURE.geometry.coordinates).toHaveLength(1);
    expect(CORRIDOR_FEATURE.geometry.coordinates[0].length).toBeGreaterThan(10);
  });

  it("Manhattan boro code constant matches PLUTO convention", () => {
    expect(MANHATTAN_BORO_CODE).toBe("1");
  });
});
