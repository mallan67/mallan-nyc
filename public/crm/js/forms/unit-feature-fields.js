// A unit's features, from the Sale / Rental forms' checkbox groups to the Cotality fields a listing carries.
//
// The forms keep each group under its own key (saleExposure, saleFlooring ... : what the form restores from). This module adds the Cotality fields the same answers belong to, so
// a listing sent to the RLS carries them. Every [form value, Cotality field, live member] below is a member of that field's live picklist (tests/runtime/unit-feature-fields.test.ts
// checks each one against data/cotality-enums.live.json), chosen where the form's word IS the member (Hardwood) or a plain spelling of it (DoublePane = DoublePaneWindows).
// A box with no live member (Herringbone, Alcove Studio, Wrap Terrace ...) is not sent; it stays in the form's own key.
//
// Live evidence, 1,000 active Manhattan residential listings (2026-10-16): Exposures on 648 (DirectionFaces on none); PatioAndPorchFeatures and ExteriorFeatures both carry Balcony
// (84 listings each) and Terrace is PatioAndPorchFeatures only; InteriorFeatures carries HighCeilings (234) and WalkInClosets (138); Flooring Hardwood (215).
(function (global) {
  'use strict';

  var X = 'Exposures', FL = 'Flooring', WF = 'WindowFeatures', IF = 'InteriorFeatures', PP = 'PatioAndPorchFeatures', EX = 'ExteriorFeatures', RT = 'RoomType';

  // group suffix (the form key is prefix + suffix), form value, Cotality field, live member
  var MAP = [
    ['Exposure', 'North', X, 'North'], ['Exposure', 'South', X, 'South'], ['Exposure', 'East', X, 'East'], ['Exposure', 'West', X, 'West'],
    ['Exposure', 'Northeast', X, 'Northeast'], ['Exposure', 'Northwest', X, 'Northwest'], ['Exposure', 'Southeast', X, 'Southeast'], ['Exposure', 'Southwest', X, 'Southwest'],

    ['Flooring', 'Concrete', FL, 'Concrete'], ['Flooring', 'Hardwood', FL, 'Hardwood'], ['Flooring', 'Marble', FL, 'Marble'], ['Flooring', 'Parquet', FL, 'Parquet'],

    ['Windows', 'AluminumFrames', WF, 'AluminumFrames'], ['Windows', 'BayWindows', WF, 'BayWindows'], ['Windows', 'Blinds', WF, 'Blinds'], ['Windows', 'DisplayWindows', WF, 'DisplayWindows'],
    ['Windows', 'DoublePane', WF, 'DoublePaneWindows'], ['Windows', 'Drapes', WF, 'Drapes'], ['Windows', 'EnergyStar', WF, 'EnergyStarQualifiedWindows'], ['Windows', 'GardenWindows', WF, 'GardenWindows'],
    ['Windows', 'Insulated', WF, 'InsulatedWindows'], ['Windows', 'LowEmissivity', WF, 'LowEmissivityWindows'], ['Windows', 'NewWindows', WF, 'NewWindows'], ['Windows', 'Screens', WF, 'Screens'],
    ['Windows', 'Skylights', WF, 'Skylights'], ['Windows', 'SolarScreens', WF, 'SolarScreens'], ['Windows', 'Tinted', WF, 'TintedWindows'], ['Windows', 'TriplePane', WF, 'TriplePaneWindows'],
    ['Windows', 'WindowCoverings', WF, 'WindowCoverings'], ['Windows', 'WoodFrames', WF, 'WoodFrames'],

    ['Ceilings', 'BeamedCeilings', IF, 'BeamedCeilings'], ['Ceilings', 'HighCeilings', IF, 'HighCeilings'],
    ['Storage', 'WalkInClosets', IF, 'WalkInClosets'], ['Storage', 'MurphyBed', IF, 'MurphyBed'],
    ['BathroomFeatures', 'Bidet', IF, 'Bidet'], ['BathroomFeatures', 'Sauna', IF, 'Sauna'], ['BathroomFeatures', 'StallShower', IF, 'StallShower'], ['BathroomFeatures', 'EnSuite', IF, 'EnSuiteBathroom'],
    ['KitchenType', 'EatIn', IF, 'EatInKitchen'], ['KitchenType', 'Galley', IF, 'GalleyKitchen'], ['KitchenType', 'SecondKitchen', IF, 'SecondKitchen'],
    ['KitchenFeatures', 'Dishwasher', IF, 'Dishwasher'], ['KitchenFeatures', 'Pantry', IF, 'Pantry'],
    ['Dining', 'DiningArea', IF, 'DiningArea'],

    ['AdditionalRooms', 'ExerciseRoom', RT, 'ExerciseRoom'], ['AdditionalRooms', 'FamilyRoom', RT, 'FamilyRoom'], ['AdditionalRooms', 'Foyer', RT, 'Foyer'], ['AdditionalRooms', 'GreatRoom', RT, 'GreatRoom'],
    ['AdditionalRooms', 'LaundryRoom', RT, 'Laundry'], ['AdditionalRooms', 'Library', RT, 'Library'], ['AdditionalRooms', 'LivingRoom', RT, 'LivingRoom'], ['AdditionalRooms', 'MediaRoom', RT, 'MediaRoom'],
    ['AdditionalRooms', 'SunRoom', RT, 'Sunroom'],

    // private outdoor space: Balcony, Deck and Patio are on both fields in live listings; Terrace is on PatioAndPorchFeatures only; Garden, Juliet Balcony and Green House on ExteriorFeatures only
    ['PrivateOutdoorSpace', 'Balcony', PP, 'Balcony'], ['PrivateOutdoorSpace', 'Balcony', EX, 'Balcony'],
    ['PrivateOutdoorSpace', 'Deck', PP, 'Deck'], ['PrivateOutdoorSpace', 'Deck', EX, 'Deck'],
    ['PrivateOutdoorSpace', 'Patio', PP, 'Patio'], ['PrivateOutdoorSpace', 'Patio', EX, 'Patio'],
    ['PrivateOutdoorSpace', 'Terrace', PP, 'Terrace'],
    ['PrivateOutdoorSpace', 'Garden', EX, 'Garden'], ['PrivateOutdoorSpace', 'JulietBalcony', EX, 'JulietBalcony'], ['PrivateOutdoorSpace', 'GreenHouse', EX, 'Greenhouse']
  ];

  function listOf(v) { return Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]); }

  // Adds, for each Cotality field, the live members the unit's answers stand for. A field the collector already filled keeps its members and gains these.
  function apply(data, prefix) {
    var add = {};
    MAP.forEach(function (row) {
      var chosen = listOf(data[prefix + row[0]]);
      if (chosen.indexOf(row[1]) === -1) return;
      var list = add[row[2]] || (add[row[2]] = []);
      if (list.indexOf(row[3]) === -1) list.push(row[3]);
    });
    Object.keys(add).forEach(function (field) {
      var have = listOf(data[field]).slice();
      add[field].forEach(function (m) { if (have.indexOf(m) === -1) have.push(m); });
      data[field] = have;
    });
    return data;
  }

  global.MallanUnitFeatureFields = { MAP: MAP, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MallanUnitFeatureFields;
})(typeof window !== 'undefined' ? window : globalThis);
