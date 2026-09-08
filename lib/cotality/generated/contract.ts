// ════════════════════════════════════════════════════════════════════════════════════════
// GENERATED — DO NOT EDIT.  `npm run cotality:compile:light && npm run cotality:generate`
//
// THE COTALITY (TRESTLE) CONTRACT AS TYPESCRIPT. Source: the live authenticated API only —
// $metadata (existence, types, navigation), Field catalogue (RESO/RLS flags), Lookup catalogue
// (published members), per-field live probes (filterable, populated, entitlement).
//
// provider      https://api.cotality.com/trestle
// acquired_at   2026-09-08T03:32:52.480Z
// probe_mode    light
// metadata_sha  a60bcbbdccc9da852a8da53acc178fc90d7159c42f59f58babb2d09ab7a6bbae
// evidence_sha  0c62605128b8183fbd47a5a2d4ccc7c3653a2bc175dc31b3179178fd8587f59a
// content_sha   9115497c2598b2047535235e3740a67c4a53fc5a6c23f92128e0264aa374822c (source: bundle)
// resources     17 · fields 1456 · navigations 31
//
// RULES FOR EVERY READER (human or agent):
//   1. A field that is not on the interface DOES NOT EXIST on this subscription. Do not add it.
//   2. `filterable: false` means the provider rejects $filter/$orderby on it (HTTP 400). It can
//      still be $select-ed. `populated: null` on such a field means UNMEASURABLE, not zero.
//   3. `populated: 0` means declared, selectable, and EMPTY on the live feed at acquisition time.
//      Zero is a fact about the feed — it is never a licence to read a different field instead.
//   4. Enum unions are the Lookup vocabulary published for THAT resource+field (EnumType members
//      when the provider publishes no Lookup). Member spelling is exact (`Canceled`, not `Cancelled`).
//   5. Populations drift daily; membership/existence/filterability change only with a provider
//      Content Patch, which changes metadata_sha and must be followed by regeneration.
// ════════════════════════════════════════════════════════════════════════════════════════

export const COTALITY_CONTRACT = {
  provider_base: "https://api.cotality.com/trestle",
  acquired_at: "2026-09-08T03:32:52.480Z",
  probe_mode: "light",
  metadata_sha256: "a60bcbbdccc9da852a8da53acc178fc90d7159c42f59f58babb2d09ab7a6bbae",
  catalog_sha256: "35b5d81e96affbeea2777f9aaefd9703c002861ecb6770390b74a3a3d0b24293",
  probe_sha256: "786f5fd08b8f58d1c4d7c74ac7f71eb76fd61c03ef28c7d2e507113cd34a0373",
  evidence_sha256: "0c62605128b8183fbd47a5a2d4ccc7c3653a2bc175dc31b3179178fd8587f59a",
  content_sha256: "9115497c2598b2047535235e3740a67c4a53fc5a6c23f92128e0264aa374822c",
  source: "bundle",
  resourceCount: 17,
  fieldCount: 1456,
  navigationCount: 31,
} as const;

export type CotalityAccessState = 'accessible' | 'rejected' | 'unmeasured';

/** Measured facts about one declared field. `null` = unmeasured/unmeasurable, never assumed. */
export interface CotalityFieldFact {
  /** Declared EDM / enum type from $metadata. */
  readonly type: string;
  readonly nullable: boolean;
  /** EnumType name when the field is enum-typed. */
  readonly enum: string | null;
  /** Multi-select enum (serialized as comma-joined member names). */
  readonly multi: boolean;
  /** Number of Lookup rows the provider publishes for this resource+field, or null. */
  readonly lookup: number | null;
  /** true = $filter accepted live; false = provider-suppressed (HTTP 400); null = unmeasured. */
  readonly filterable: boolean | null;
  /** Live `@odata.count` of rows where the field is non-null; null = unmeasurable/unmeasured. */
  readonly populated: number | null;
  /** Field catalogue SystemReferences includes RLS (REBNY carries the field); null = no catalogue row. */
  readonly rlsField: boolean | null;
  /** Field catalogue RESOStandardYN; null = no catalogue row. */
  readonly reso: boolean | null;
}

// ── Vocabularies (string-literal unions) ─────────────────────────────────────────────────

/** 18 members · $metadata EnumType AreaSource */
export type CotalityEnum_AreaSource = "Appraiser" | "Assessor" | "Builder" | "CondoDocuments" | "Estimated" | "GisCalculated" | "ListingAgent" | "Measured" | "Multiple" | "NotAvailable" | "NotMeasured" | "Other" | "Owner" | "Plans" | "PublicRecords" | "Realist" | "SeeRemarks" | "Survey";

/** 3 members · $metadata EnumType AreaUnits */
export type CotalityEnum_AreaUnits = "Acres" | "SquareFeet" | "SquareMeters";

/** 16 members · $metadata EnumType FeeFrequency */
export type CotalityEnum_FeeFrequency = "Annually" | "BiMonthly" | "BiWeekly" | "Daily" | "FullTerm" | "Monthly" | "NotApplicable" | "OneTime" | "Other" | "Quarterly" | "Seasonal" | "SeeAgent" | "SeeRemarks" | "SemiAnnually" | "SemiMonthly" | "Weekly";

/** 22 members · $metadata EnumType Attic */
export type CotalityEnum_Attic = "AccessOnly" | "Common" | "CrawlSpace" | "Dormer" | "Expandable" | "Finished" | "Floored" | "Full" | "None" | "Other" | "Partial" | "PartiallyFinished" | "PartiallyFloored" | "PermanentStairs" | "PullDownStairs" | "Scuttle" | "SeeRemarks" | "Storage" | "StorageOnly" | "Unfinished" | "WalkIn" | "WalkUp";

/** 12 members · $metadata EnumType AvailabilityType */
export type CotalityEnum_AvailabilityType = "Annual" | "Biweekly" | "Daily" | "LongTerm" | "Monthly" | "None" | "OffSeason" | "Other" | "Seasonal" | "ShortTerm" | "Vacation" | "Weekly";

/** 32 members · $metadata EnumType BoatDockSlipFeatures */
export type CotalityEnum_BoatDockSlipFeatures = "BoatLock" | "CommunityRamp" | "Composite" | "DeepWaterAccess" | "DockAvailable" | "ElectricAvailable" | "ExclusiveUse" | "Floating" | "FuelAvailable" | "Hoist" | "Lift" | "LiftElectric" | "LiftManual" | "LiveAboardPermitted" | "MarinaServices" | "MarineRail" | "NoWakeZone" | "None" | "Other" | "Overnight" | "Parking" | "PhoneAvailable" | "Private" | "Ramp" | "RestroomFacilities" | "SeeAgent" | "SewagePump" | "SlipAvailable" | "TreatedLumber" | "WaterSupplyAvailable" | "Wood" | "YachtClub";

/** 8 members · $metadata EnumType GulfAccessType */
export type CotalityEnum_GulfAccessType = "Bridges" | "NoBridges" | "NoBridgesWaterDirect" | "Other" | "ViaBoatLift" | "ViaBoatLock" | "WaterDirect" | "WaterIndirect";

/** 4 members · $metadata EnumType LandTenure */
export type CotalityEnum_LandTenure = "Abstract" | "FeeSimple" | "LeaseHold" | "Torrens";

/** 5 members · $metadata EnumType LeaseAmountPerAreaUnit */
export type CotalityEnum_LeaseAmountPerAreaUnit = "DollarsPerAcre" | "DollarsPerHectare" | "DollarsPerSquareFoot" | "DollarsPerSquareMeter" | "DollarsPerTract";

/** 1127 members · Lookup catalogue for CustomProperty.ListAOR (EnumType AOR declares 1110; the Lookup publishes 1127) */
export type CotalityLookup_CustomProperty_ListAOR = "AberdeenAreaAssociationOfRealtors" | "AbileneAssociationOfRealtors" | "AckAssociationOfRealtors" | "AdaCountyAssociationOfRealtors" | "AdirondackChamplainValleyRealtors" | "AikenAssociationOfRealtors" | "AkronClevelandAssociationOfRealtors" | "AlamanceMlsInc" | "Alameda" | "AlaskaMls" | "AlbemarleAreaAssociationOfRealtors" | "AlbertaRealEstateAssociation" | "AlbertaWestRealtorsAssociation" | "AlbuquerqueBoardOfRealtors" | "AliceBoardOfRealtors" | "AltitudeRealtors" | "Amador" | "AmarilloAssociationOfRealtors" | "AmeliaIslandNassauCountyAssocOfRealtorsInc" | "AnnArborAreaBoardOfRealtors" | "AnneArundelCountyAssociationOfRealtors" | "AntelopeValley" | "AntrimCharlevoixKalkaskaAssociationOfRealtors" | "ApexMls" | "Arcadia" | "ArizonaRegionalMultipleListingService" | "ArkansasRealtorsAssociation" | "ArkansasRegionalMlsLlc" | "ArkansasValleyBoardOfRealtors" | "ArlingtonBoardOfRealtors" | "ArtesiaBoardOfRealtors" | "AsheboroRandolphBoardOfRealtors" | "AshevilleBoardOfRealtors" | "AshtabulaCountyRealtors" | "AspenBoardOfRealtors" | "AspenGlenwoodMls" | "AspireNorthRealtors" | "AssociationOfInteriorRealtors" | "AssociationOfReginaRealtors" | "AssociationOfSaskatchewanRealtors" | "Atascadero" | "AthensAreaAssociationOfRealtors" | "AthensLimestoneAssociationOfRealtors" | "AtlantaBoardOfRealtors" | "AtlantaCommercialBoardOfRealtors" | "AtlanticCityAndCountyBoardOfRealtors" | "AuroraAssociationOfRealtors" | "AustinBoardOfRealtors" | "AveryWataugaAssociationOfRealtors" | "BadlandsBoardOfRealtors" | "BagnellDamAssociationOfRealtors" | "BaldwinRealtors" | "BancroftAndAreaAssociationOfRealtors" | "Baries" | "BarrieAndDistrictAssociationOfRealtors" | "BarryEatonBoardOfRealtors" | "Bartow" | "BastropAssociationOfRealtors" | "BatesvilleBoardOfRealtors" | "BattleCreekAreaAssociationOfRealtors" | "BayAreaAssociationofREALTORS" | "BayCountyRealtorAssociation" | "BayEast" | "BayouBoardOfRealtors" | "BcNorthernRealEstateBoard" | "BeachesMls" | "BeachesmlsFlexmls" | "BeachesmlsMatrix" | "BeaumontBoardOfRealtorsInc" | "BeaverCreekAreaAssociationOfRealtors" | "BeckleyBoardOfRealtors" | "BemidjiBoardOfRealtors" | "Berkeley" | "BerkshireCountyBoardOfRealtors" | "BeverlyHillsGreaterLa" | "BigBearAssociationOfRealtors" | "BigSkyCountryMls" | "BillingsAssociationOfRealtors" | "BirminghamAssociationOfRealtors" | "BismarkMandanBoardOfRealtors" | "BitterrootValleyBoardOfRealtors" | "BlackHillsAssociationofREALTORS" | "BlueRidgeAssociationOfRealtors" | "BlueRiverAreaBoardOfRealtors" | "BoiseRegionalRealtors" | "BoloRealtors" | "BonitaSprings" | "BootheelRegionalBoardOfRealtors" | "BoulderAreaRealtorsAssociation" | "BramptonRealEstateBoard" | "BranchCountyAssociationOfRealtors" | "BrandonAreaRealtors" | "BrantfordRegionalRealEstateAssociationInc" | "BrazoriaCountyBoardOfRealtors" | "BrevardBoardOfRealtors" | "BridgeAssociationOfRealtors" | "Bridgemls" | "Bridgeport" | "BrightMls" | "BristolTennesseeVirginiaAssociationOfRealtors" | "BritishColumbiaRealEstateAssociation" | "BrooklynNewYorkMls" | "BrownsvilleSouthPadreIslandBoardOfRealtors" | "BrownwoodBoardOfRealtorsInc" | "BrunswickCountyBoardOfRealtors" | "BryanCollegeStationRegionalAor" | "BucksCountyAssociationOfRealtors" | "Buffalo" | "BuffaloNiagaraAssociationOfRealtorsInc" | "Burbank" | "BurkeCountyBoardOfRealtorsInc" | "BurlingtonAlamanceCountyAssociationOfRealtors" | "CalaverasCountyAssociationOfRealtors" | "CaldwellBoardOfRealtors" | "CalgaryRealEstateBoard" | "CaliforniaDesert" | "CaliforniaRegionalMls" | "CambriaSomersetAssociationOfRealtors" | "CambridgeAssociationOfRealtorsInc" | "CanopyMls" | "CapeCodAndIslandsAssociationOfRealtors" | "CapeFearRealtors" | "CapeMayCountyAssociationOfRealtors" | "CapitalAreaAssociationOfRealtors" | "CarbonCountyBoardOfRealtors" | "CarlisleBoardOfRealtors" | "CarlsbadBoardOfRealtors" | "CarolinaMls" | "CarolinasSmokiesAssociationOfRealtors" | "CarpetCapitalAssociationOfRealtors" | "CarrollCountyAssociationofREALTORS" | "CarteretCountyAssociationOfRealtorsInc" | "CascadesEastAssociationOfRealtors" | "CatawbaValleyAssociationOfRealtors" | "CecilCountyBoardofREALTORS" | "CedarRapidsAreaAssociationOfRealtors" | "CentralAlbertaRealtorsAssociation" | "CentralArizonaAssociationOfRealtors" | "CentralCarolinaAssociationOfRealtors" | "CentralGeorgiaMLS" | "CentralHillCountryBoardOfRealtorsInc" | "CentralIllinoisBoardOfRealtors" | "CentralJerseyMls" | "CentralLakesAssociationOfRealtors" | "CentralMichiganAssociationOfRealtors" | "CentralMississippiRealtors" | "CentralOregonAssociationOfRealtors" | "CentralOzarksBoardOfRealtorsAssociation" | "CentralPanhandleAssociationOfRealtors" | "CentralPasco" | "CentralTexasCcimChapter" | "CentralTexasCommercialAssociationOfRealtors" | "CentralTexasMls" | "CentralValley" | "CentralVirginiaRegionalMls" | "CentralWestTennesseeAssociationOfRealtors" | "CentralWisconsinBoardOfRealtors" | "CentralizedRealEstateInfo" | "CentreCountyAssociationofREALTORS" | "ChapelHillBoardOfRealtorsInc" | "Char" | "CharlestonTridentAssociationOfRealtors" | "CharlotteRegionalRealtorAssociationInc" | "CharlottesvilleAreaAssociationOfRealtors" | "ChathamKentAssociationOfRealtors" | "ChautauquaCattaraugus" | "CherokeeAssociationOfRealtors" | "CherokeeCountyBoardOfRealtors" | "ChesapeakeBayAndRiversAssociationOfRealtors" | "ChesapeakeBayAreaMls" | "CheyenneBoardOfRealtors" | "ChicagoAssociationOfRealtorsInc" | "ChilliwackAndDistrictRealEstateBoard" | "ChsRegionalMls" | "CitrusValley" | "CitrusValleyAssociationOfRealtors" | "ClareGladwinBoardOfRealtors" | "ClatsopAssociationofREALTORS" | "Claw" | "CleburneCountyBoardOfRealtors" | "ClevelandCountyAssociationOfRealtors" | "ClovisPortalesAssociationOfRealtors" | "CoastalAssociationofREALTORS" | "CoastalCarolinasAssociationOfRealtors" | "CoastalMendocino" | "CoastalPlainsAssociationOfRealtors" | "CobbAssociationOfRealtors" | "CochraneAndTimiskamingDistrictsAssociationOfRealtors" | "CoeurDaleneRegionalRealtors" | "ColinCountyAssociationOfRealtors" | "CollinCountyAssociationOfRealtorsInc" | "ColoradoAssociationOfRealtors" | "ColumbiaBoardOfRealtors" | "ColumbiaGreeneBoardOfRealtors" | "ColumbusBoardOfRealtors" | "ColumbusandCentralOhioRegionalMLS" | "CombinedLosAngelesWestsideMls" | "CommercialAllianceOfRealtors" | "CommercialAssociationOfRealtorsOfNewMexico" | "CommercialBoard" | "CommercialInformationExchange" | "Conejo" | "ContraCosta" | "ConwayAndPerryCountyRealtorsAssociation" | "CookeCountyBoardOfRealtors" | "CooperativeArkansasRealtors" | "CornerstoneAssociationOfRealtors" | "CornwallAndDistrictRealEstateBoard" | "CorpusChristi" | "Cortland" | "CoshoctonCountyBoardOfRealtors" | "CraigAssociationOfRealtors" | "CrenMls" | "Crisnet" | "CumberlandCountyBoardOfRealtors" | "Darien" | "DaytonAreaBoardOfRealtors" | "DaytonaBeachAreaAssociationOfRealtors" | "DearbornAreaBoardOfRealtors" | "DekalbBoardOfRealtorsInc" | "DelRioBoardOfRealtors" | "Delta" | "DeltaAssociationOfRealtors" | "DeltaCountyBoardOfRealtors" | "DemingLunaCountyBoardOfRealtors" | "DenverBoardOfRealtors" | "DenverMetroAssocOfRealtors" | "DenverMetroCommAssocRealtor" | "DesMoinesAreaAssociationOfRealtors" | "DesertCommunities" | "DesertMls" | "Desoto" | "DetroitAssociationOfRealtors" | "DixieGilchristLevyAssociationofREALTORS" | "DoorCountyBoardOfRealtors" | "DownRiverAssociationOfRealtors" | "Downey" | "DullesAreaAssociationOfRealtors" | "DuluthAreaAssociationOfRealtors" | "DurangoAreaAssociationOfRealtors" | "DurhamAssociationOfRealtors" | "DurhamRegionAssociationOfRealtors" | "EastAlabamaBoardOfRealtors" | "EastBayRecip" | "EastBayRegionalDataMls" | "EastCentralAssociationOfRealtors" | "EastPasco" | "EastPolk" | "EastTennesseeRealtors" | "EastValley" | "EastValleyRedlands" | "EastValleyYucaipa" | "EasternCt" | "EasternPanhandleBoardofREALTORS" | "EasternThumbAssociationOfRealtors" | "EasternUpperPeninsulaAssociationOfRealtors" | "EgyptianBoardOfRealtors" | "ElDoradoBoardOfRealtors" | "ElPasoAssociationOfRealtors" | "ElkinsRandolphBoardOfRealtors" | "ElkoCountyAssociationOfRealtors" | "EllisHillAssociationOfRealtors" | "ElmiraCorningRegionalAssociationOfRealtors" | "EmeraldCoastAssociationOfRealtors" | "EmmetAssociationOfRealtors" | "Englewood" | "EstesParkBoardOfRealtors" | "FairmontBoardOfRealtors" | "FargoMoorheadAreaAssociationOfRealtors" | "FaulknerCountyBoardOfRealtors" | "FayettevilleAssociationOfRealtorsInc" | "FirelandsAssociationOfRealtors" | "FirstMls" | "FivePointsBoardOfRealtors" | "Flagler" | "FlaglerCountyAssociationOfRealtors" | "FlintHillsAssociationOfRealtors" | "FloridaGulfCoast" | "FloridaKeysBoardOfRealtors" | "FoothillsRealtorAssociationOfNorthCarolina" | "ForgottenCoastRealtorAssociation" | "FortCollinsBoardOfRealtors" | "FortHoodAreaAssociationOfRealtors" | "FortMcmurrayRealEstateBoard" | "FortSmithBoardOfRealtors" | "FourCornersBoardOfRealtors" | "FourRiversAssociationOfRealtors" | "FranklinBoardOfRealtors" | "FranklinCountyBoardOfRealtors" | "FraserValleyRealEstateBoard" | "FrederickCountyAssociationofREALTORS" | "FredericksburgAreaAssociationOfRealtors" | "FremontBoardOfRealtors" | "Fresno" | "FresnoMultipleListingService" | "FtLauderdale" | "GainesvilleAlachua" | "GallatinAssociationOfRealtors" | "GallupBoardOfRealtors" | "GalvestonAssociationOfRealtors" | "GardenCityMls" | "GardenStateMls" | "GastonAssociationOfRealtors" | "GeorgiaMls" | "GeorgiaUpstateLakesBoardOfRealtors" | "Glendale" | "GlendaleWestMaricopaBoardOfRealtorsInc" | "GlenwoodSpringsAssociationRealtors" | "GlobalMls" | "GloucesterSalemCountiesBoardOfRealtors" | "GoldenEmpireMLSBakersfield" | "GoldenIslesAssociationOfRealtors" | "GoldsboroWayneCountyAssociationOfRealtors" | "GranburyAssociationOfRealtors" | "GrandCountyBoardOfRealtors" | "GrandForksAreaAssociationOfRealtors" | "GrandIslandBoardOfRealtors" | "GrandJunctionRealtorAssociation" | "GrandPrairieBoardOfRealtors" | "GrandRapidsAssociationOfRealtors" | "GrandePrairieAndAreaAssociationOfRealtors" | "GreatFallsAssociationOfRealtors" | "GreatNorthMls" | "GreatPlainsRegionalMls" | "GreatSmokyMountainsAssociationOfRealtors" | "GreaterAlabamaMls" | "GreaterAlbuquerqueAssociationOfRealtors" | "GreaterAlexandriaAreaAssociationOfRealtors" | "GreaterAntelopeValleyAssociationOfRealtors" | "GreaterAugustaAssociationOfRealtorsInc" | "GreaterBaltimoreBoardOfRealtors" | "GreaterBatonRougeAssociationOfRealtors" | "GreaterBergenRealtors" | "GreaterBinghamtonAssociationOfRealtors" | "GreaterBostonRealEstateBoard" | "GreaterCapitalAreaAssociationOfRealtors" | "GreaterCapitalAssociationOfRealtorsInc" | "GreaterCentralBoardOfRealtors" | "GreaterCentralLouisianaRealtorsAssociation" | "GreaterChattanoogaMls" | "GreaterChattanoogaRealtors" | "GreaterColumbiaAssociationOfRealtorsInc" | "GreaterDentonWiseAssociationOfRealtors" | "GreaterElPasoAssociationOfRealtors" | "GreaterErieBoardOfRealtors" | "GreaterFairbanksBoardOfRealtors" | "GreaterFairfield" | "GreaterFortPolkAreaRealtors" | "GreaterFortWorthAssociationOfRealtors" | "GreaterFtLauderdaleRealtors" | "GreaterGatewayAssociationOfRealtors" | "GreaterGoldenTriangleRealtors" | "GreaterGreenvilleAssocOfRealtors" | "GreaterHarrisburgAssociationOfRealtors" | "GreaterHartford" | "GreaterHartfordAssociationOfRealtorsrInc" | "GreaterKalamazooAssociationOfRealtors" | "GreaterLakesAssociationOfRealtors" | "GreaterLansingAssociationOfRealtors" | "GreaterLasVegasAssociationOfRealtorsInc" | "GreaterLewisvilleAssociationOfRealtors" | "GreaterLouisvilleAssociationOfRealtors" | "GreaterMcallenAssociationOfRealtors" | "GreaterMetroWestAssociationRealtorsInc" | "GreaterMetropolitanAssociationOfRealtors" | "GreaterNashvilleAssociationOfRealtorsInc" | "GreaterNewHavenAssociationOfRealtorsInc" | "GreaterNewMilford" | "GreaterOwensboroREALTORAssociation" | "GreaterPhiladelphiaAssociationOfRealtors" | "GreaterPiedmontRealtors" | "GreaterRegionalAllianceOfRealtors" | "GreaterRochesterAssociationOfRealtorsInc" | "GreaterScrantonBoardOfRealtors" | "GreaterShiawasseeAssociationOfRealtors" | "GreaterSiouxCityBoardOfRealtors" | "GreaterSouthernMls" | "GreaterSpringfieldBoardOfRealtors" | "GreaterTampaAssociationOfRealtors" | "GreaterTexomaAssociationOfRealtors" | "GreaterTulsaAssociationOfRealtors" | "GreaterTylerAssociationOfRealtorsInc" | "GreaterUnionCountyAssociationOfRealtors" | "GreaterVancouverRealtors" | "GreaterWaterbury" | "GreeleyAreaRealtorAssociation" | "GreenValleySahuaritaAssociationOfRealtors" | "GreenbrierValleyBoardOfRealtors" | "GreensboroRegionalRealtorsAssociation" | "GreenwichBoardOfRealtors" | "GreenwoodAssociationOfRealtors" | "GreersFerryLakeAreaBoardOfRealtors" | "GrossePointeBoardOfRealtors" | "GuelphAndDistrictAssociationOfRealtors" | "GuernseyMuskingumValleyAssociationOfRealtors" | "GulfCoastAssociationOfRealtors" | "GulfCoastMls" | "GulfSouthRealEstateInformationNetworkInc" | "GunnisonCountryAssociationRealtors" | "GunnisonCrestedButteAssociationOfRealtors" | "HamptonRoadsRealtorsAssociationInc" | "HarfordCountyAssociationofREALTORS" | "HarlingenBoardOfRealtors" | "HarrisonCountyAssociationOfRealtors" | "HarrisonDistrictBoardOfRealtors" | "HarrisonburgRockinghamAreaAssociationOfRealtors" | "HattiesburgAreaAssociationOfRealtors" | "HawaiiInformationService" | "HaywoodCountyBoardOfRealtors" | "HeartOfIowaRegionalBoardOfRealtors" | "Heartland" | "HeartlandAssociationOfRealtors" | "HeartofKentuckyAssociationofREALTORS" | "HelenaAssociationOfRealtors" | "HemetSanJacinto" | "HendersonCountyBoardOfRealtors" | "HendersonvilleBoardOfRealtors" | "HerefordBoardOfRealtors" | "HernandoCountyAssociationOfRealtors" | "HgarHudsonGatewayAssociationOfRealtors" | "HiCentral" | "HighCountryAssociationOfRealtorsInc" | "HighDesert" | "HighPlainsAssociationOfRealtors" | "HighPointRegionalAssocOfRealtorsInc" | "HighlandLakesAssociationOfRealtors" | "HighlandsCashiersBoardOfRealtors" | "HillsdaleCountyBoardOfRealtors" | "HiltonHeadAreaAssociationOfRealtors" | "HiltonHeadIsland" | "HinesvilleAreaBoardOfRealtors" | "HiveMls" | "HobbsAssociationOfRealtors" | "HopkinsvilleChristianAndToddCountyAor" | "HotSpringsBoardOfRealtors" | "HoustonAssociationOfRealtors" | "HowardCountyAssociationofREALTORS" | "HudsonValleyCatskillsRegionMls" | "HumboldtAssociationOfRealtors" | "HunterdonSomersetAssociationOfRealtors" | "HuntingtonBoardOfRealtors" | "HuntsvilleAreaAssociationOfRealtorsInc" | "HuronPerthAssociationOfRealtors" | "ITech" | "ImagineMLS" | "InclineVillageBoardOfRealtors" | "IndianRiver" | "InformationAndRealEstateServices" | "Inglewood" | "InlandValleys" | "IntermountainMls" | "IowaCityAreaAssociationofREALTORS" | "IowaRealty" | "IrvingLasColinasAssociationOfRealtors" | "ItascaCountyBoardOfRealtors" | "IthacaBoardOfRealtors" | "JacksonAreaAssociationOfRealtors" | "JacksonCountyBoardOfRealtors" | "JacksonvilleBoardOfRealtors" | "JasperAreaBoardOfRealtors" | "JeffersonCityAreaBoardOfRealtors" | "JeffersonCountyAssociationOfRealtors" | "JeffersonLewisBoard" | "JohnsonCountyAssociationOfRealtors" | "JohnstonCountyAssociationOfRealtors" | "JoshuaTreeGateway" | "KamloopsRealEstateAssociation" | "KanawhaValleyBoardOfRealtors" | "KansasCityRegionalAssociationOfRealtorsInc" | "KaufmanVanZandtAssociationOfRealtors" | "KawarthaLakesRealEstateAssociationInc" | "KentCountyAssociationofREALTORS" | "KentuckyBarkleyLakesBoardOfRealtors" | "KerrLakeBoardOfRealtorsInc" | "KerrvilleBoardOfRealtors" | "KershawCountyBoardOfRealtors" | "KeyWestAssociationOfRealtors" | "KingsCountyBoardofREALTORS" | "KingstonAndAreaRealEstateAssociation" | "KingsvilleAreaAssociationOfRealtors" | "KitchenerWaterlooAssociationOfRealtors" | "KlamathCountyAssociationOfRealtors" | "KnoxvilleAreaAssociationOfRealtorsInc" | "KootenayAssociationOfRealtors" | "KootenayRealEstateBoard" | "Laguna" | "LakeAndSumter" | "LakeCitiesAssociationOfRealtors" | "LakeCityBoardofREALTORS" | "LakeCounty" | "LakeGeaugaAreaAssociationOfRealtors" | "LakeHavasuAssociationOfRealtors" | "LakeMartinAreaAssociationofREALTORS" | "LakeOfTheOzarksBoardOfRealtors" | "LakeRegionAssociationOfRealtors" | "LakeWales" | "Lakeland" | "LakesCountryAssociationOfRealtors" | "LakewayAreaAssociationOfRealtors" | "LancasterCountyAssociationofREALTORS" | "LandOfTheSkyAssociationOfRealtors" | "LapeerAndUpperThumbAssociationOfRealtors" | "LaredoBoardOfRealtorsInc" | "LasCrucesAssociationOfRealtors" | "LasVegasBoardOfRealtors" | "LassenAssociationofREALTORS" | "LatahCountyBoardOfRealtors" | "LawrenceBoardOfRealtors" | "LawtonBoardOfREALTORS" | "LebanonBoardOfRealtors" | "LebanonCountyAssociationofREALTORS" | "LeeCountyAssociationOfRealtors" | "LehighValleyMls" | "LenaweeCountyAssociationOfRealtors" | "LethbridgeAndDistrictAssociationOfRealtors" | "LewisClarkAssociationOfRealtors" | "LewistonChapterofBillingsAssociationofREALTORS" | "LexingtonBluegrassAssociationOfRealtors" | "LexingtonBoardOfRealtors" | "LibertyBoardOfRealtorsInc" | "LincolnCountyBoardOfRealtors" | "LitchfieldCounty" | "LittleRockRealtorsAssociation" | "LivingstonCountyAssociationOfRealtors" | "LoganCountyBoardOfRealtors" | "LompocValley" | "LondonAndStThomasAssociationOfRealtors" | "LongIslandBoardOfRealtorsInc" | "LongleafPineRealtors" | "LongmontAssociationOfRealtors" | "LongviewAreaAssociationOfRealtors" | "LorainCountyAssociationOfRealtors" | "LovelandBerthoudAssociationRealtors" | "LowcountryRegionalMls" | "LowerYakimaValleyAssociationOfRealtors" | "LubbockAssociationOfRealtors" | "LufkinAssociationOfRealtors" | "LuzerneCountyAssociationofREALTORS" | "LynchburgAssociationOfRealtors" | "Madera" | "MaineListings" | "MainstreetOrganizationOfRealtors" | "Malibu" | "MammothLakesBoardOfRealtors" | "Manatee" | "ManitobaRealEstateAssociation" | "MansfieldAssociationOfRealtors" | "MarathonAndLowerKeysAssociationOfRealtors" | "MarcoIslandAreaAssociationOfRealtors" | "MariettaBoardOfRealtors" | "MarinREALTORS" | "MarinetteCountyBoardOfRealtors" | "MariposaCounty" | "MarkTwainAssociationOfRealtors" | "MarshallCountyBoardOfRealtors" | "MartinCounty" | "MartinCountyRealtorsOfTheTreasureCoast" | "MasonOceanaManisteeBoardOfRealtors" | "MassanuttenBoardOfRealtors" | "MatagordaCountyBoardOfRealtors" | "MayfieldGravesCountyBoardOfRealtors" | "McdowellBoardOfRealtors" | "MckeanPa" | "MedicineHatRealEstateBoard" | "MedinaCountyBoardOfRealtors" | "MemphisAreaAssociationOfRealtors" | "MenaAreaBoardOfRealtors" | "MercedCounty" | "MercerCountyAssociationOfRealtors" | "MetroAreaBoardOfRealtors" | "MetroCentreAssociationOfRealtors" | "MetroMilwaukee" | "MetroSearch" | "Metrolist" | "MetropolitanConsolidatedAssociationOfRealtors" | "MetropolitanIndianapolisBoardOfRealtors" | "MetrotexAssociationOfRealtorsInc" | "MiamiAssociationOfRealtors" | "MiamiAssociationOfRealtorsInc" | "MiamiRealtors" | "MiborRealtorAssociation" | "MichiganRegionalInformationCenter" | "MidAmericaRegionalInformationSystems" | "MidCarolinaRegionalAssociationOfRealtors" | "MidFairfieldCounty" | "MidHudsonMultipleListingService" | "MidIowaRegionalBoardOfRealtors" | "MidJerseyAssociationOfRealtors" | "MidKansasMultipleListingService" | "MidState" | "MidValleyAssociationOfRealtors" | "MiddleGeorgiaMls" | "MidlandBoardOfRealtors" | "MidwestRealEstateData" | "MiltonAndDistrictRealEstateBoard" | "MineralAreaBoardOfRealtors" | "MiniCassiaAssociationOfRealtors" | "MinneapolisAreaAssociationOfRealtors" | "MinnesotaArrowheadMls" | "Mirealsource" | "MiscellaneousAssociation" | "MississaugaRealEstateBoard" | "MissoulaCountyAssociationOfRealtors" | "MissoulaOrganizationOfRealtors" | "MlsOfCatawbaValley" | "MlsOfGreaterCincinnati" | "MlsOfSouthernArizona" | "MlsPropertyInformationNetwork" | "MlsTechnology" | "MlsUnited" | "Mlslistings" | "Mlspin" | "MobileAreaAssociationOfRealtors" | "MohawkValley" | "MonmouthCountyAssociationOfRealtorsInc" | "MonmouthOceanRegionalRealtors" | "MonroeCountyAssociationOfRealtors" | "MontagueCountyBoardOfRealtors" | "MontanaRegionalMls" | "MontcalmCountyAssociationOfRealtors" | "MontebelloDistrict" | "MontgomeryAreaAssociationOfRealtors" | "MontgomeryCountyAssociationOfRealtors" | "MontroseAssociationOfRealtors" | "MorganCountyAssociationOfRealtors" | "MorgantownBoardOfRealtors" | "MountainCentralAssociationOfRealtors" | "MountainLakesBoardofREALTORS" | "MountainMetroAssociationOfRealtors" | "Mrmls" | "MurrayCallowayCountyBoardOfRealtors" | "MyStateMls" | "NacogdochesCountyBoardOfRealtors" | "NampaAssociationOfRealtors" | "Naples" | "NaplesAreaBoardOfRealtors" | "NavarreAreaBoardOfRealtors" | "NavarroCountyBoardOfRealtors" | "NebraskaRealtorsAssociation" | "NemahaValleyBoardOfRealtors" | "NeuseRiverRegionAssociationOfRealtors" | "NevadaCounty" | "NevadaREALTORS" | "NewBernBoardOfRealtorsInc" | "NewBraunfelsCanyonLakeAreaAssocOfRealtors" | "NewBrunswickRealEstateAssociation" | "NewCanaanBoardOfRealtors" | "NewCastleCountyBoardofREALTORS" | "NewHavenMiddlesex" | "NewMexicoAssociationOfRealtors" | "NewRiverValleyAssociationOfRealtors" | "NewSmyrnaBeachBoardOfRealtors" | "NewYorkStateMls" | "NewfoundlandAndLabradorAssociationOfRealtors" | "Newport" | "NewportBeachAssociationOfRealtors" | "Newtown" | "NexusAssociationOfRealtors" | "NiagaraAssociationOfRealtors" | "NocoastMls" | "NolanCountyBoardOfRealtors" | "NorfolkBoardOfRealtors" | "NormanBoardOfRealtors" | "NorthBay" | "NorthBayAndAreaRealtorsAssociation" | "NorthBayRealEstateBoard" | "NorthCarolinaMountainsMls" | "NorthCarolinaRegionalMls" | "NorthCentralIowaRegionalMls" | "NorthCentralJerseyAssociationOfRealtors" | "NorthIowaRegionalBoardOfRealtors" | "NorthMetroDenverRealtorAssociationInc" | "NorthMetroRealtorsAssociation" | "NorthOaklandCountyBoardOfRealtorsInc" | "NorthPulaskiBoardOfRealtors" | "NorthSanDiegoCounty" | "NorthSanLuisObispo" | "NorthSantaBarbaraCountyRegionalMLS" | "NorthShoreBarringtonAssociationOfRealtors" | "NorthTennesseeAssociationOfRealtors" | "NorthTexasCommercialAssociationOfRealtors" | "NorthTexasInformationSystems" | "NorthTexasRealEstateInformationSystems" | "NortheastAlabamaAssociationOfRealtors" | "NortheastArkansasBoardOfRealtors" | "NortheastAtlantaMetroAssnOfRealtorsInc" | "NortheastFloridaAssociationOfRealtorsInc" | "NortheastGeorgiaBoardOfRealtors" | "NortheastIowaRegionalBoardofREALTORS" | "NortheastLouisianaAssociationOfRealtors" | "NortheastMichiganBoardOfRealtors" | "NortheastMississippiBoardOfRealtors" | "NortheastOklahomaBoardOfRealtors" | "NortheastRealtorsOfLouisiana" | "NortheastSouthDakotaAssociationOfRealtors" | "NortheastTarrantCountyBoardOfRealtors" | "NortheastTennesseeAssociationOfRealtors" | "NortheastWashingtonAssociationOfRealtors" | "NortheasternMichiganBoardOfRealtors" | "NorthernArizonaMls" | "NorthernColoradoCommercialAssociationOfRealtors" | "NorthernFairfieldCounty" | "NorthernGreatLakesRealtors" | "NorthernIndianaRealtorsAssociation" | "NorthernJacksonCountyBoardOfRealtors" | "NorthernKentuckyMultipleListingService" | "NorthernNevadaRegionalMls" | "NorthernNewBrunswickRealEstateBoard" | "NorthernOhioRegionalMls" | "NorthernSolanoCountyAssociationofREALTORS" | "NorthernVirginiaAssociationOfRealtors" | "NorthshoreAreaBoardOfRealtors" | "NorthumberlandHillsAssociationOfRealtors" | "NorthwestArkansasBoardOfRealtorsMls" | "NorthwestIllinoisAllianceOfRealtors" | "NorthwestIndianaRealtorsAssociation" | "NorthwestIowaRealtors" | "NorthwestIowaRegionalBoardOfRealtors" | "NorthwestLouisianaAssociationOfRealtors" | "NorthwestMinnesotaAssociationOfRealtors" | "NorthwestMississippiAssociationOfRealtors" | "NorthwestMontanaAssociationOfRealtors" | "NorthwestMultipleListingService" | "NorthwestOhioRealEstateInformationService" | "NorthwestWyomingBoardOfRealtors" | "NorthwoodsAssocOfRealtorsInc" | "Oakland" | "Oakville" | "OakvilleMiltonAndDistrictRealEstateBoard" | "OcalaMarion" | "OcalaMarionCountyAssociationOfRealtorsInc" | "OceanCityBoardOfRealtors" | "OceanCountyBoardOfRealtors" | "OdessaBoardOfRealtors" | "OjaiValley" | "OkanaganMainlineRealEstateBoard" | "Okeechobee" | "OklahomaCityMetropolitanAor" | "OmahaAreaBoardOfRealtors" | "OmniMlsLlc" | "OnekeyMls" | "OnepointAssociationOfRealtors" | "OrangeChathamAssociationOfRealtors" | "OrangeCoastAssociationOfRealtors" | "OrangeCounty" | "OregonCoastMls" | "OrlandoRegional" | "OrlandoRegionalRealtorAssociation" | "Oroville" | "Osceola" | "OtherUnspecificed" | "OtsegoDelaware" | "OttawaRealEstateBoard" | "OutOfAreaBoard" | "OuterBanksAssociationOfRealtors" | "OzarkGatewayAssociationOfRealtors" | "OzarkTrailBoardOfRealtors" | "PacificRegionalMultipleListingService" | "PacificSouthwest" | "PacificWest" | "PaducahBoardOfRealtors" | "PagosaSpringsAreaAssnOfRealtors" | "PalestineAssociationOfRealtors" | "PalmSprings" | "PalosVerdesPeninsula" | "Paradise" | "ParagouldBoardOfRealtors" | "ParisBoardOfRealtors" | "ParkCityBoardOfRealtors" | "ParkersburgAreaAssociationOfRealtors" | "PasadenaFoothills" | "PasoRobles" | "PassaicCountyBoardOfRealtors" | "PearlRiverCountyBoardOfRealtors" | "PeeDeeRealtorAssociation" | "PennyrileBoardOfRealtors" | "PensacolaAssociationOfRealtorsInc" | "PeoriaAreaAssociationOfRealtors" | "PermianBasinBoardOfRealtorsInc" | "PeterboroughAndTheKawarthasAssociationOfRealtors" | "PetroplexAssociationofREALTORS" | "PhoenixAssociationOfRealtors" | "PiedmontRegionalAssociationOfRealtors" | "PikeWayneAssociationOfRealtors" | "PikesPeakAssociationOfRealtors" | "Pillar9" | "PinehurstSouthernPinesAreaAssociation" | "PinellasSuncoast" | "PinellasSuncoastAssociationOfRealtorsInc" | "PineyWoodsBoardOfRealtors" | "PismoCoast" | "PittsburgBoardOfRealtors" | "PlacerCountyAssociationOfRealtors" | "Plumas" | "PoconoMountainsAssociationOfRealtors" | "PortCharlotte" | "PortageCountyAssociationOfRealtors" | "PortlandMetropolitanAssociationOfRealtors" | "PowellRiverSunshineCoastRealEstateBoard" | "PrescottAreaAssociationOfRealtors" | "PrimeMLS" | "PrinceGeorgesCountyAssociationOfRealtorsInc" | "PrinceWilliamAssociationOfRealtors" | "PuebloAssociationOfRealtors" | "PuertoRico" | "PulaskiCountyBoardOfRealtors" | "QuadCityAreaRealtors" | "QuinteAndDistrictAssociationOfRealtors" | "REALTORSAssociationofYorkandAdamsCounties" | "REALTORSofGreaterMidNebraska" | "RaleighRegionalAssociationOfRealtors" | "RaleighWakeBoardOfRealtors" | "RanchoSoutheast" | "RangeAssociationofREALTORS" | "RapbBeachesmls" | "ReadingBerksAssociationOfRealtorsInc" | "RealEstateBoardOfGreaterVancouver" | "RealEstateBoardOfNewYork" | "RealEstateBoardOfTheFrederictonArea" | "RealEstateInformationNetworkInc" | "RealcompIiLtd" | "Realmls" | "RealsourceAssociationOfRealtorsInc" | "RealtorAssnGreaterFortLauderdale" | "RealtorAssocOfGreaterMiamiAndTheBeaches" | "RealtorAssociationOfAcadiana" | "RealtorAssociationOfFranklinAndGulfCounties" | "RealtorAssociationOfSouthernMinnesota" | "RealtorAssociationOfTheGreaterPeeDeeInc" | "RealtorAssociationOfTheSiouxEmpire" | "RealtorAssociationOfWesternKentucky" | "RealtorAssociationPalmBeaches" | "RealtorsAssocOfGreaterFtMyersAndTheBeach" | "RealtorsAssociationOfCitrusCounty" | "RealtorsAssociationOfEdmonton" | "RealtorsAssociationOfGreyBruceOwenSound" | "RealtorsAssociationOfHamiltonBurlington" | "RealtorsAssociationOfLincoln" | "RealtorsAssociationOfLloydminsterAndDistrict" | "RealtorsAssociationOfMaui" | "RealtorsAssociationOfMetropolitanPittsburgh" | "RealtorsAssociationOfNortheastWisconsin" | "RealtorsAssociationOfSouthCentralAlberta" | "RealtorsAssociationOfSouthCentralWisconsin" | "RealtorsAssociationOfSouthwesternIllinois" | "RealtorsLandInstitute" | "RealtorsOfCentralColorado" | "RealtorsOfGreaterAugusta" | "RealtorsOfNorthwesternWisconsin" | "Realtracs" | "ReciprocalBoard" | "Recolorado" | "RegionalMlsOfMinnesota" | "RemMetroSouthAssociationOfRealtorsInc" | "RemMiddleTennesseeAssociationOfRealtorsInc" | "RemSoutheastValleyRegionalAssociationOfRealtors" | "RemWilliamsonCountyAssociationOfRealtorsInc" | "RenfrewCountyRealEstateBoard" | "Resides" | "RhodeIslandStateWideMls" | "RichmondAssociationOfRealtors" | "RichmondCountyBoardOfRealtorsInc" | "RideauStLawrenceRealEstateBoard" | "Ridgefield" | "RimOTheWorld" | "RioGrandeValleyMls" | "RlsConnectNyc" | "RoamMls" | "RoanokeValleyAssociationOfRealtorsInc" | "RobertsonCountyAssociationOfRealtors" | "Rochester" | "RockinghamCountyAssociationOfRealtorsInc" | "RockportAreaBoardOfRealtors" | "RockyMountAreaAssociationOfRealtors" | "RockyMountainAssociationOfRealtors" | "RogueValleyAssociationOfRealtors" | "RoswellAssociationOfRealtors" | "RoyalGorgeAssociationOfRealtors" | "RoyalPalmCoastRealtorAssociation" | "RuidosoLincolnCountyAssociationOfRealtors" | "RutherfordCountyBoardOfRealtors" | "SacramentoAssociationOfRealtorsInc" | "SaginawBoardOfRealtors" | "SaintJohnRealEstateBoard" | "SalisburyRowanAssociationOfRealtors" | "SalisburyRowanRealtors" | "SaltLakeBoardOfRealtors" | "SanAngeloAssociationOfRealtors" | "SanAntonioBoardOfRealtors" | "SanDiego" | "SanDiegoAssociationOfRealtors" | "SanDiegoMls" | "SanFrancisco" | "SanJuanCountyBoardOfRealtors" | "SanLuisObispo" | "SanLuisObispoCoastal" | "SanMarcosAreaBoardOfRealtors" | "SanMateoCountyAssociationOfRealtors" | "SandicorMls" | "SantaBarbara" | "SantaBarbaraAssociationOfRealtors" | "SantaClaraCounty" | "SantaCruzCountyBoardOfRealtors" | "SantaFeAssociationOfRealtors" | "SantaMaria" | "SantaYnezValley" | "SarasotaAssociationOfRealtorsInc" | "SarasotaManatee" | "SaratogaSchenectadySchoharieAssociation" | "SarniaLambtonRealEstateBoard" | "SaskatchewanRealtorsAssociation" | "SaskatoonRegionAssociationOfRealtors" | "SaultSteMarieRealEstateBoard" | "SavannahBoardOfRealtors" | "SavannahMultiListCorporation" | "ScenicCoast" | "SciotoValleyAssociationOfRealtors" | "ScottsdaleAreaAssociationOfRealtorsInc" | "SearcyBoardOfRealtors" | "SeattleKingCountyAssociationOfRealtorsInc" | "SedonaVerdeValleyAssociationOfRealtors" | "SeguinBoardOfRealtors" | "SelkirkAssociationOfRealtors" | "Selma" | "ShalMls" | "ShastaAssociationOfRealtors" | "SheridanCountyBoardOfRealtors" | "SierraCountyBoardOfRealtors" | "SierraNevadaAssociationOfRealtors" | "SierraNevadaRealtors" | "SierraNorthValley" | "SiliconValleyAssociationOfRealtors" | "SilverCityRegionalMls" | "SimcoeAndDistrictRealEstateBoard" | "SimiValley" | "SiskiyouAssociationOfRealtors" | "SmartMls" | "SnakeRiverRegionalMls" | "SoBrowardBoardOfRealtors" | "Socalmls" | "SouthBay" | "SouthCentralArkansasRealtorsAssociation" | "SouthCentralBoardOfRealtors" | "SouthCentralKansasMls" | "SouthGeorgiaMLS" | "SouthJerseyShoreRegionalMls" | "SouthMetroDenverRealtorAssociation" | "SouthMonmouthBoardOfRealtors" | "SouthOkanaganRealEstateBoard" | "SouthPadreIslandBoardOfRealtors" | "SouthTahoeAssociationOfRealtors" | "SouthTexasCommercialAssociationOfRealtors" | "SoutheastAlabamaAssociationOfRealtors" | "SoutheastArkansasBoardOfRealtors" | "SoutheastFloridaRegional" | "SoutheastIowaRegionalBoardOfRealtors" | "SoutheastKern" | "SoutheastMinnesotaAssociationOfRealtors" | "SoutheastMissouriRealtors" | "SoutheasternBorderAssociationOfRealtors" | "SouthernAdirondackRealtors" | "SouthernGatewayAssociationOfRealtors" | "SouthernGeorgianBayAssociationOfRealtors" | "SouthernIndianaRealtorsAssociation" | "SouthernMarylandAssociationofREALTORS" | "SouthernMissouriRegionalMls" | "SouthernOklahomaBoardofREALTORS" | "Southland" | "SouthlandRegionalAssociationOfRealtorsInc" | "SouthwestGeorgiaBoardOfRealtorsAndMls" | "SouthwestIowaAssociationOfRealtors" | "SouthwestLosAngeles" | "SouthwestLosAngelesAssociationOfRealtors" | "SouthwestLouisianaAssociation" | "SouthwestLouisianaAssociationOfRealtors" | "SouthwestMichiganAssociationOfRealtors" | "SouthwestRiversideCounty" | "SouthwestVirginiaAssociationOfRealtors" | "SouthwesternIllinoisBoardOfRealtors" | "SouthwesternMichiganAssociationOfRealtors" | "SpaceCoastAssociationOfRealtors" | "SpanishPeaksBoard" | "SpartanburgAssociationOfRealtors" | "SpartanburgBoardOfRealtorsInc" | "SpokaneRealtors" | "StAugustineAndStJohnsCountyBoardOfRealtors" | "StCharlesCountyAssociationOfRealtors" | "StCloudAreaAssociationOfRealtors" | "StJosephCountyAssociationOfRealtors" | "StLouisRealtors" | "StPaulAreaAssociationOfRealtors" | "Stamford" | "StarkCountyAssociationOfRealtorsInc" | "StarkTrumbullAreaRealtors" | "StatenIslandBoardOfRealtors" | "StatenIslandMultipleListingService" | "SteamboatSpringsBoardOfRealtors" | "StellarMls" | "StephenvilleAssociationOfRealtors" | "SudburyRealEstateBoard" | "SummitAssociationOfRealtors" | "SumterBoardOfRealtors" | "SunValleyBoardOfRealtors" | "SuncoastTampaAssociationOfRealtors" | "SunflowerAssociationOfRealtors" | "SuperiorAssociationOfRealtors" | "SussexCountyAssociationOfRealtors" | "SutterYubaAssnOfRealtors" | "Syracuse" | "TacomaPierceCountyAssociationofREALTORS" | "Tampa" | "TaosAssociationOfRealtors" | "TaosCountyAssociationOfRealtors" | "TehachapiAreaAssociationofREALTORS" | "TehamaCounty" | "TellurideAssociationOfRealtors" | "TempleBeltonBoardOfRealtors" | "TennesseeValleyAssociationOfRealtors" | "TennesseeVirginiaRegionalMls" | "TetonBoardOfRealtors" | "TexarkanaBoardOfRealtors" | "TheGreaterMonctonRealtorsDuGrandMoncton" | "TheInlandGateway" | "TheLakelandsAssociationOfRealtors" | "Themls" | "ThreeRiversBoardOfRealtors" | "ThunderBayRealEstateBoard" | "TillsonburgDistrictRealEstateBoard" | "Timmins" | "TitusCampMorrisUpshurAssociationOfRealtors" | "Tmp" | "Toledo" | "TopsailIslandAssociationOfRealtors" | "TorontoRealEstateBoard" | "TraverseAreaAssociationOfRealtors" | "TriCityAssociationOfRealtors" | "TriCounties" | "TriCounty" | "TriCountySuburbanRealtors" | "TriLakesBoardOfRealtors" | "TriStateCommercialRealty" | "TriadMultipleListingService" | "TriangleCommercialAssocOfRealtors" | "TriangleMls" | "TucsonAssociationOfRealtors" | "TulareCountyAssociationOfRealtors" | "TuolumneCountyAssociationOfRealtors" | "TylerCountyBoardOfRealtors" | "UlsterCountyBoardOfRealtors" | "UnionCountyAssociationOfRealtors" | "UnitedAssociationOfRealtors" | "UpperCumberlandMls" | "UpperPeninsulaAssociationOfRealtors" | "Utahrealestatecom" | "UvaldeBoardOfRealtors" | "VailBoardOfRealtors" | "VailMultiListService" | "Valley" | "ValleyMls" | "VancouverIslandRealEstateBoard" | "VcrdsMls" | "Venice" | "VenturaCoastal" | "VictorValley" | "VictoriaAreaAssociationOfRealtors" | "VictoriaBoardOfRealtorsInc" | "VictoriaRealEstateBoard" | "WacoAssociationOfRealtors" | "WarrenAreaBoardOfRealtors" | "WasatchFrontRealEstate" | "WashingtonBeaufortCountyBoardOfRealtors" | "WashingtonCountyBoardOfRealtors" | "WaterWonderlandBoardOfRealtors" | "WaterlooRegionAssociationOfRealtors" | "WayneHolmesAssociationOfRealtors" | "WestAlabamaMultipleListingService" | "WestBranchValleyAssociationOfRealtors" | "WestCentralAssociationOfRealtors" | "WestCentralIowaRealEstateAndRealtors" | "WestCentralIowaRegionalMls" | "WestContraCosta" | "WestEssexBoardOfRealtors" | "WestMichiganLakeshoreAssociationOfRealtors" | "WestPasco" | "WestPennMultiList" | "WestPlainsBoardOfRealtors" | "WestSanGabrielValley" | "WestVolusia" | "WestchesterCountyBoardOfRealtors" | "WestchesterPutnam" | "WesternAzRegionalRealEstateDataExchange" | "WesternMagicValleyRealtors" | "WesternRegionalInformationSystemsAndTechnology" | "WesternUpstateAssociationOfRealtors" | "WesternWayneOaklandCountyAssnOfRealtors" | "WesternWayneOaklandCountyAssociationRealtors" | "WesternWisconsinRealtorsAssociation" | "WestonBuckhannonBoardOfRealtors" | "WheelingBoardOfRealtors" | "WhiteMountainAssociationOfRealtors" | "WhitmanCountyAssociationOfRealtors" | "WichitaFallsAssociationOfRealtors" | "WilkesCountyAssociationOfRealtors" | "WillametteAssociationOfRealtors" | "WillametteValueMultipleListingService" | "WilliamsburgMls" | "WilliamsonCountyAssociationOfRealtors" | "WilliamsonCountyAssociationOfRealtorsInc" | "WillistonBoardOfRealtors" | "WilmingtonRegionalAssociationOfRealtorsInc" | "WilsonBoardOfRealtors" | "WindsorEssexCountyAssociationOfRealtors" | "WinnipegRegionalRealEstateBoard" | "WinstonSalemBoardOfRealtors" | "WiregrassBoardOfRealtors" | "WisconsinRealEstateExchange" | "WisconsinRealtorsAssociation" | "WoodstockIngersollAndDistrictRealEstateBoard" | "WoodstockIngersollTillsonburgAreaAssociationOfRealtors" | "WorcesterRegionalAssociationOfRealtors" | "YadkinValleyAssociationOfRealtorsInc" | "YakimaAssociationOfRealtors" | "YamhillCountyAssociationOfRealtors" | "YanceyMitchellBoardOfRealtors" | "YorkCountyAssociationOfRealtors" | "YoungstownColumbianaAssociationOfRealtors" | "YumaAssociationOfRealtors";

/** 15 members · $metadata EnumType LotSizeSource */
export type CotalityEnum_LotSizeSource = "Appraiser" | "Assessor" | "Builder" | "Estimated" | "GisCalculated" | "ListingAgent" | "Measured" | "NotAvailable" | "NotTaped" | "Other" | "Owner" | "Plans" | "PublicRecords" | "SeeRemarks" | "Survey";

/** 4 members · $metadata EnumType LotSizeUnits */
export type CotalityEnum_LotSizeUnits = "Acres" | "Hectares" | "SquareFeet" | "SquareMeters";

/** 1 members · $metadata EnumType Membership */
export type CotalityEnum_Membership = "GolfClub";

/** 20 members · $metadata EnumType MineralRights */
export type CotalityEnum_MineralRights = "Available" | "CompleteSellerReservation" | "GroundWater" | "Included" | "Leased" | "MineralRightsReserved" | "Negotiable" | "NoSellerReservation" | "None" | "NotIncluded" | "NotLeased" | "NotOwnedBySeller" | "Other" | "OwnedBySeller" | "Partial" | "PartialSellerReservation" | "SeeAgent" | "SeeRemarks" | "Unknown" | "Yes";

/** 18 members · $metadata EnumType ListingPermission */
export type CotalityEnum_ListingPermission = "AgentOnly" | "ComingSoon" | "CompSold" | "DownPaymentResourceNo" | "DownPaymentResourceYes" | "FirmOnly" | "History" | "IDX" | "MemberInactive" | "OfficeInactive" | "OfficeOnly" | "OfficeSuspended" | "Officeidxoptout" | "PhotoOptedOut" | "Private" | "Public" | "SyndicateOptOut" | "VOW";

/** 3 members · $metadata EnumType PotentialShortSale */
export type CotalityEnum_PotentialShortSale = "No" | "Unknown" | "Yes";

/** 10 members · $metadata EnumType PropertyAccess */
export type CotalityEnum_PropertyAccess = "BoatAccessOnly" | "Easement" | "FlyIn" | "Highway" | "NoAccess" | "Other" | "Rail" | "Seasonal" | "WaterAccess" | "YearRound";

/** 76 members · Lookup catalogue for CustomProperty.PropertySubType (EnumType PropertySubType declares 75; the Lookup publishes 76) */
export type CotalityLookup_CustomProperty_PropertySubType = "Acreage" | "Agriculture" | "Apartment" | "Attached" | "BoatSlip" | "Building" | "BuildingBusiness" | "BuildingLand" | "BuildingLandBusiness" | "Business" | "BusinessLand" | "Cabin" | "Chalet" | "Cluster" | "CoOwnership" | "Commercial" | "Condominium" | "DeededParking" | "Detached" | "Dockominium" | "Duplex" | "Earthship" | "Efficiency" | "Farm" | "FlexibleSpace" | "Fractional" | "Garage" | "HalfDuplex" | "HotelMotel" | "ImprovedLand" | "Industrial" | "Institutional" | "Investment" | "Land" | "LiveWork" | "Loft" | "ManufacturedHome" | "ManufacturedOnLand" | "MiningClaim" | "MixedUse" | "MobileHome" | "MobileHomePark" | "ModularHome" | "MultiFamily" | "MultipleParcels" | "NewHomeCommunity" | "NewHomePlan" | "NewHomeSpecHome" | "NoLand" | "Office" | "Other" | "OwnYourOwn" | "ParkModel" | "Quadruplex" | "Ranch" | "Recreation" | "Residential" | "Retail" | "RoomingHouse" | "RoomsForRent" | "SemiDetached" | "SingleFamilyResidence" | "SitePlanned" | "SpecialPurpose" | "StockCooperative" | "Studio" | "TenancyInCommon" | "Timeshare" | "ToBeBuilt" | "Townhouse" | "Triplex" | "TwoApartment" | "UnimprovedLand" | "Villa" | "Warehouse" | "WaterPositionWithLand";

/** 13 members · $metadata EnumType PropertyType */
export type CotalityEnum_PropertyType = "BusinessOpportunity" | "CommercialLease" | "CommercialSale" | "DisasterReliefRental" | "Farm" | "HighRise" | "Land" | "ManufacturedInPark" | "MultiFamily" | "Residential" | "ResidentialIncome" | "ResidentialLease" | "Specialty";

/** 106 members · Lookup catalogue for CustomProperty.Restrictions (EnumType Restrictions declares 106; the Lookup publishes 106) */
export type CotalityLookup_CustomProperty_Restrictions = "AdditionalRestrictions" | "Age18OrOlder" | "Age45OrOlder" | "Age55OrOlder" | "Age62OrOlder" | "AgeRestrictions" | "AgriculturalLandReserve" | "AirspaceRestriction" | "AnimalRestriction" | "AnimalsAllowed" | "Architectural" | "AssociationApprovalRequired" | "BarbecuesAllowed" | "BuildingRestrictions" | "BuyerApprovalRequired" | "CallListingAgent" | "CannabisRestrictions" | "CityRestrictions" | "CommunityRestrictions" | "Conservation" | "CorporateBuyerOk" | "Covenant" | "CowsAllowed" | "DailyRentals" | "DailyRentalsAllowed" | "DeedRestrictions" | "DevelopmentRestriction" | "DockRestrictions" | "Easements" | "Encroachment" | "EnvironmentalRestrictions" | "ExteriorAlterations" | "FenceRestrictions" | "HistoricRestrictions" | "HorsesAllowed" | "LandlordApproval" | "LeasedEquipmentAssumed" | "LimitedNumberVehicles" | "LivestockAllowed" | "LivestockRestriction" | "LotSize" | "ManufacturedHomeAllowed" | "MineralRights" | "MobileHomeAllowed" | "ModularHomeAllowed" | "MotorcyclesAllowed" | "NoBoats" | "NoCannabisGrowingOrProduction" | "NoCommercial" | "NoCommercialVehicles" | "NoCorporateBuyer" | "NoCovenants" | "NoDeedRestrictions" | "NoDivide" | "NoLease" | "NoLease1stYearOwned" | "NoLease2ndYearOwned" | "NoLivestockAllowed" | "NoLongTermRentals" | "NoManufacturedHome" | "NoMobileHome" | "NoModularHome" | "NoMotorcycles" | "NoPets" | "NoRestrictions" | "NoRv" | "NoShortTermRentals" | "NoSigns" | "NoSmoking" | "NoSubleases" | "NoTimeshareIntervalOwnershipAllowed" | "NoTrailerParking" | "NoTruck" | "NoWaterbeds" | "NoiseRestriction" | "OkToLease" | "OkayToLease1stYear" | "OtherRestrictions" | "OverheadRightOfWay" | "ParkApproval" | "ParkingRestrictions" | "PetRestrictions" | "RentalAllowed" | "RentalNotAllowed" | "RentalRestriction" | "RentingLimited" | "RestrictiveCovenant" | "RightOfWay" | "RoadRestriction" | "RvRestrictions" | "SeeRemarks" | "SellerImposed" | "ShortTermRentalsAllowed" | "SignRestrictions" | "SmokingAllowed" | "SpecialLicensingRequired" | "SubdivisionRestrictions" | "SurfaceRightOfWay" | "TreePreservation" | "UndergroundUtilityRightOfWay" | "Unknown" | "UseRestriction" | "UtilityRightOfWay" | "WaterfrontRestrictions" | "WetlandsWildlifeHabitat" | "ZoningRestrictions";

/** 11 members · $metadata EnumType StandardStatus */
export type CotalityEnum_StandardStatus = "Active" | "ActiveUnderContract" | "Canceled" | "Closed" | "ComingSoon" | "Delete" | "Expired" | "Hold" | "Incomplete" | "Pending" | "Withdrawn";

/** 25 members · $metadata EnumType StormProtection */
export type CotalityEnum_StormProtection = "CompleteAccordionShutters" | "CompleteElectricShutters" | "CompleteImpactGlass" | "CompletePanelShutters" | "CompleteRollDownShutters" | "CurrentOwnerWindMitigationCertificate" | "ElectricShutters" | "GeneratorHookup" | "ImpactGlass" | "ImpactResistantDoors" | "ManualShutters" | "NoStormShelter" | "None" | "Other" | "PartialAccordionShutters" | "PartialElectricShutters" | "PartialImpactGlass" | "PartialPanelShutters" | "PartialPermanentGenerator" | "PartialRollDownShutters" | "SafeRoom" | "ScreenShutters" | "Shutters" | "StormShelter" | "WholeHousePermanentGenerator";

/** 4 members · $metadata EnumType ThirdPartyIntegrationType */
export type CotalityEnum_ThirdPartyIntegrationType = "DownPaymentResource" | "RentalBeastApply" | "Rentspree" | "Showingtime";

/** 15 members · Lookup catalogue for HistoryTransactional.ChangeType (EnumType ChangeType declares 16; the Lookup publishes 15) */
export type CotalityLookup_HistoryTransactional_ChangeType = "Active" | "ActiveUnderContract" | "BackOnMarket" | "Canceled" | "Closed" | "ComingSoon" | "Deleted" | "Expired" | "Hold" | "Incomplete" | "NewListing" | "Other" | "Pending" | "PriceChange" | "Withdrawn";

/** 28 members · Lookup catalogue for HistoryTransactional.SyndicateTo (EnumType SyndicateTo declares 27; the Lookup publishes 28) */
export type CotalityLookup_HistoryTransactional_SyndicateTo = "Apartmentscom" | "Austinhomesearchcom" | "BrokerReciprocity" | "CREA" | "Crexi" | "Harcom" | "Homescom" | "Homesnap" | "Homestory" | "IdxSites" | "InternationalMLS" | "JamesEditioncom" | "Listhub" | "Naplesareacom" | "None" | "Properstarcom" | "RILivingcom" | "Realtorcom" | "RealtorcomInternational" | "RentSpree" | "RentalBeast" | "Rpr" | "State27homescom" | "SyndicationAllowed" | "Terrascope" | "Texasrealestatecom" | "ZillowGroup" | "ZillowTrulia";

/** 17 members · $metadata EnumType ClassName */
export type CotalityEnum_ClassName = "BusinessOpportunity" | "CommercialLease" | "CommercialSale" | "Contacts" | "CrossProperty" | "Farm" | "HistoryTransactional" | "Land" | "ManufacturedInPark" | "Media" | "Member" | "Office" | "OpenHouse" | "Residential" | "ResidentialIncome" | "ResidentialLease" | "SavedSearch";

/** 92 members · $metadata EnumType ImageOf */
export type CotalityEnum_ImageOf = "AerialView" | "Atrium" | "Attic" | "BackOfStructure" | "Balcony" | "Bar" | "Barn" | "Basement" | "BasketballCourt" | "Bathroom" | "Bedroom" | "BonusRoom" | "BreakfastArea" | "Closet" | "CommonAmenity" | "Community" | "Courtyard" | "Deck" | "Den" | "DiningArea" | "DiningRoom" | "Dock" | "EntranceFoyer" | "Entry" | "ExerciseRoom" | "FamilyRoom" | "Fence" | "Fireplace" | "FloorPlan" | "FrontOfStructure" | "FrontPorch" | "GameRoom" | "Garage" | "Garden" | "GolfCourse" | "GreatRoom" | "GuestQuarters" | "Gym" | "Hallway" | "HobbyRoom" | "Inlaw" | "Kitchen" | "Lake" | "Laundry" | "Library" | "LivingRoom" | "LoadingDock" | "Lobby" | "Loft" | "Lot" | "Map" | "MasterBathroom" | "MasterBedroom" | "MediaRoom" | "MudRoom" | "Nursery" | "Office" | "Other" | "OutBuildings" | "Pantry" | "Parking" | "Patio" | "Pier" | "PlatMap" | "Playground" | "Pond" | "Pool" | "Porch" | "PrimaryBathroom" | "PrimaryBedroom" | "Reception" | "RecreationRoom" | "Sauna" | "ScreenedPorch" | "Showroom" | "SideOfStructure" | "SittingRoom" | "Spa" | "Stable" | "Stairs" | "Storage" | "Studio" | "Study" | "SunRoom" | "TennisCourt" | "UtilityRoom" | "View" | "WalkInClosets" | "Waterfront" | "WineCellar" | "Workshop" | "Yard";

/** 10 members · $metadata EnumType MediaAlteration */
export type CotalityEnum_MediaAlteration = "DeclutteredItemRemoved" | "ModelHome" | "None" | "OtherMediaModification" | "TwilightConversion" | "VirtualEnhancements" | "VirtualRenovation" | "VirtualRepresentationToBeBuilt" | "VirtualRepresentationUnderConstruction" | "VirtualStagingItemAddition";

/** 18 members · $metadata EnumType MediaCategory */
export type CotalityEnum_MediaCategory = "Addendum" | "AerialView" | "AgentPhoto" | "BrandedVirtualTour" | "Disclosure" | "Document" | "FloorPlan" | "Map" | "OfficeLogo" | "OfficePhoto" | "Other" | "Photo" | "RentalDocuments" | "Restriction" | "Survey" | "Topography" | "UnbrandedVirtualTour" | "Video";

/** 4 members · Lookup catalogue for Media.MediaClassification (EnumType MediaClassification declares 6; the Lookup publishes 4) */
export type CotalityLookup_Media_MediaClassification = "Document" | "Floorplan" | "Photo" | "Video";

/** 3 members · $metadata EnumType MediaStatus */
export type CotalityEnum_MediaStatus = "Active" | "Deleted" | "Other";

/** 22 members · Lookup catalogue for Media.MediaType (EnumType MediaType declares 44; the Lookup publishes 22) */
export type CotalityLookup_Media_MediaType = "Bmp" | "Doc" | "Docx" | "Gif" | "Htm" | "Html" | "Jpeg" | "Mov" | "Mp4" | "Mpeg" | "Pdf" | "Png" | "Pptx" | "Quicktime" | "Rtf" | "Svg" | "Tiff" | "Txt" | "Wmv" | "Wps" | "Xls" | "Xlsx";

/** 7 members · Lookup catalogue for Media.Permission (EnumType Permission declares 20; the Lookup publishes 7) */
export type CotalityLookup_Media_Permission = "AgentOnly" | "FirmOnly" | "Idx" | "OfficeOnly" | "Private" | "Public" | "Vow";

/** 5 members · $metadata EnumType ResourceName */
export type CotalityEnum_ResourceName = "Building" | "Contacts" | "Member" | "Office" | "Property";

/** 1127 members · Lookup catalogue for Member.MemberAOR (EnumType AOR declares 1110; the Lookup publishes 1127) */
export type CotalityLookup_Member_MemberAOR = "AberdeenAreaAssociationOfRealtors" | "AbileneAssociationOfRealtors" | "AckAssociationOfRealtors" | "AdaCountyAssociationOfRealtors" | "AdirondackChamplainValleyRealtors" | "AikenAssociationOfRealtors" | "AkronClevelandAssociationOfRealtors" | "AlamanceMlsInc" | "Alameda" | "AlaskaMls" | "AlbemarleAreaAssociationOfRealtors" | "AlbertaRealEstateAssociation" | "AlbertaWestRealtorsAssociation" | "AlbuquerqueBoardOfRealtors" | "AliceBoardOfRealtors" | "AltitudeRealtors" | "Amador" | "AmarilloAssociationOfRealtors" | "AmeliaIslandNassauCountyAssocOfRealtorsInc" | "AnnArborAreaBoardOfRealtors" | "AnneArundelCountyAssociationOfRealtors" | "AntelopeValley" | "AntrimCharlevoixKalkaskaAssociationOfRealtors" | "ApexMls" | "Arcadia" | "ArizonaRegionalMultipleListingService" | "ArkansasRealtorsAssociation" | "ArkansasRegionalMlsLlc" | "ArkansasValleyBoardOfRealtors" | "ArlingtonBoardOfRealtors" | "ArtesiaBoardOfRealtors" | "AsheboroRandolphBoardOfRealtors" | "AshevilleBoardOfRealtors" | "AshtabulaCountyRealtors" | "AspenBoardOfRealtors" | "AspenGlenwoodMls" | "AspireNorthRealtors" | "AssociationOfInteriorRealtors" | "AssociationOfReginaRealtors" | "AssociationOfSaskatchewanRealtors" | "Atascadero" | "AthensAreaAssociationOfRealtors" | "AthensLimestoneAssociationOfRealtors" | "AtlantaBoardOfRealtors" | "AtlantaCommercialBoardOfRealtors" | "AtlanticCityAndCountyBoardOfRealtors" | "AuroraAssociationOfRealtors" | "AustinBoardOfRealtors" | "AveryWataugaAssociationOfRealtors" | "BadlandsBoardOfRealtors" | "BagnellDamAssociationOfRealtors" | "BaldwinRealtors" | "BancroftAndAreaAssociationOfRealtors" | "Baries" | "BarrieAndDistrictAssociationOfRealtors" | "BarryEatonBoardOfRealtors" | "Bartow" | "BastropAssociationOfRealtors" | "BatesvilleBoardOfRealtors" | "BattleCreekAreaAssociationOfRealtors" | "BayAreaAssociationofREALTORS" | "BayCountyRealtorAssociation" | "BayEast" | "BayouBoardOfRealtors" | "BcNorthernRealEstateBoard" | "BeachesMls" | "BeachesmlsFlexmls" | "BeachesmlsMatrix" | "BeaumontBoardOfRealtorsInc" | "BeaverCreekAreaAssociationOfRealtors" | "BeckleyBoardOfRealtors" | "BemidjiBoardOfRealtors" | "Berkeley" | "BerkshireCountyBoardOfRealtors" | "BeverlyHillsGreaterLa" | "BigBearAssociationOfRealtors" | "BigSkyCountryMls" | "BillingsAssociationOfRealtors" | "BirminghamAssociationOfRealtors" | "BismarkMandanBoardOfRealtors" | "BitterrootValleyBoardOfRealtors" | "BlackHillsAssociationofREALTORS" | "BlueRidgeAssociationOfRealtors" | "BlueRiverAreaBoardOfRealtors" | "BoiseRegionalRealtors" | "BoloRealtors" | "BonitaSprings" | "BootheelRegionalBoardOfRealtors" | "BoulderAreaRealtorsAssociation" | "BramptonRealEstateBoard" | "BranchCountyAssociationOfRealtors" | "BrandonAreaRealtors" | "BrantfordRegionalRealEstateAssociationInc" | "BrazoriaCountyBoardOfRealtors" | "BrevardBoardOfRealtors" | "BridgeAssociationOfRealtors" | "Bridgemls" | "Bridgeport" | "BrightMls" | "BristolTennesseeVirginiaAssociationOfRealtors" | "BritishColumbiaRealEstateAssociation" | "BrooklynNewYorkMls" | "BrownsvilleSouthPadreIslandBoardOfRealtors" | "BrownwoodBoardOfRealtorsInc" | "BrunswickCountyBoardOfRealtors" | "BryanCollegeStationRegionalAor" | "BucksCountyAssociationOfRealtors" | "Buffalo" | "BuffaloNiagaraAssociationOfRealtorsInc" | "Burbank" | "BurkeCountyBoardOfRealtorsInc" | "BurlingtonAlamanceCountyAssociationOfRealtors" | "CalaverasCountyAssociationOfRealtors" | "CaldwellBoardOfRealtors" | "CalgaryRealEstateBoard" | "CaliforniaDesert" | "CaliforniaRegionalMls" | "CambriaSomersetAssociationOfRealtors" | "CambridgeAssociationOfRealtorsInc" | "CanopyMls" | "CapeCodAndIslandsAssociationOfRealtors" | "CapeFearRealtors" | "CapeMayCountyAssociationOfRealtors" | "CapitalAreaAssociationOfRealtors" | "CarbonCountyBoardOfRealtors" | "CarlisleBoardOfRealtors" | "CarlsbadBoardOfRealtors" | "CarolinaMls" | "CarolinasSmokiesAssociationOfRealtors" | "CarpetCapitalAssociationOfRealtors" | "CarrollCountyAssociationofREALTORS" | "CarteretCountyAssociationOfRealtorsInc" | "CascadesEastAssociationOfRealtors" | "CatawbaValleyAssociationOfRealtors" | "CecilCountyBoardofREALTORS" | "CedarRapidsAreaAssociationOfRealtors" | "CentralAlbertaRealtorsAssociation" | "CentralArizonaAssociationOfRealtors" | "CentralCarolinaAssociationOfRealtors" | "CentralGeorgiaMLS" | "CentralHillCountryBoardOfRealtorsInc" | "CentralIllinoisBoardOfRealtors" | "CentralJerseyMls" | "CentralLakesAssociationOfRealtors" | "CentralMichiganAssociationOfRealtors" | "CentralMississippiRealtors" | "CentralOregonAssociationOfRealtors" | "CentralOzarksBoardOfRealtorsAssociation" | "CentralPanhandleAssociationOfRealtors" | "CentralPasco" | "CentralTexasCcimChapter" | "CentralTexasCommercialAssociationOfRealtors" | "CentralTexasMls" | "CentralValley" | "CentralVirginiaRegionalMls" | "CentralWestTennesseeAssociationOfRealtors" | "CentralWisconsinBoardOfRealtors" | "CentralizedRealEstateInfo" | "CentreCountyAssociationofREALTORS" | "ChapelHillBoardOfRealtorsInc" | "Char" | "CharlestonTridentAssociationOfRealtors" | "CharlotteRegionalRealtorAssociationInc" | "CharlottesvilleAreaAssociationOfRealtors" | "ChathamKentAssociationOfRealtors" | "ChautauquaCattaraugus" | "CherokeeAssociationOfRealtors" | "CherokeeCountyBoardOfRealtors" | "ChesapeakeBayAndRiversAssociationOfRealtors" | "ChesapeakeBayAreaMls" | "CheyenneBoardOfRealtors" | "ChicagoAssociationOfRealtorsInc" | "ChilliwackAndDistrictRealEstateBoard" | "ChsRegionalMls" | "CitrusValley" | "CitrusValleyAssociationOfRealtors" | "ClareGladwinBoardOfRealtors" | "ClatsopAssociationofREALTORS" | "Claw" | "CleburneCountyBoardOfRealtors" | "ClevelandCountyAssociationOfRealtors" | "ClovisPortalesAssociationOfRealtors" | "CoastalAssociationofREALTORS" | "CoastalCarolinasAssociationOfRealtors" | "CoastalMendocino" | "CoastalPlainsAssociationOfRealtors" | "CobbAssociationOfRealtors" | "CochraneAndTimiskamingDistrictsAssociationOfRealtors" | "CoeurDaleneRegionalRealtors" | "ColinCountyAssociationOfRealtors" | "CollinCountyAssociationOfRealtorsInc" | "ColoradoAssociationOfRealtors" | "ColumbiaBoardOfRealtors" | "ColumbiaGreeneBoardOfRealtors" | "ColumbusBoardOfRealtors" | "ColumbusandCentralOhioRegionalMLS" | "CombinedLosAngelesWestsideMls" | "CommercialAllianceOfRealtors" | "CommercialAssociationOfRealtorsOfNewMexico" | "CommercialBoard" | "CommercialInformationExchange" | "Conejo" | "ContraCosta" | "ConwayAndPerryCountyRealtorsAssociation" | "CookeCountyBoardOfRealtors" | "CooperativeArkansasRealtors" | "CornerstoneAssociationOfRealtors" | "CornwallAndDistrictRealEstateBoard" | "CorpusChristi" | "Cortland" | "CoshoctonCountyBoardOfRealtors" | "CraigAssociationOfRealtors" | "CrenMls" | "Crisnet" | "CumberlandCountyBoardOfRealtors" | "Darien" | "DaytonAreaBoardOfRealtors" | "DaytonaBeachAreaAssociationOfRealtors" | "DearbornAreaBoardOfRealtors" | "DekalbBoardOfRealtorsInc" | "DelRioBoardOfRealtors" | "Delta" | "DeltaAssociationOfRealtors" | "DeltaCountyBoardOfRealtors" | "DemingLunaCountyBoardOfRealtors" | "DenverBoardOfRealtors" | "DenverMetroAssocOfRealtors" | "DenverMetroCommAssocRealtor" | "DesMoinesAreaAssociationOfRealtors" | "DesertCommunities" | "DesertMls" | "Desoto" | "DetroitAssociationOfRealtors" | "DixieGilchristLevyAssociationofREALTORS" | "DoorCountyBoardOfRealtors" | "DownRiverAssociationOfRealtors" | "Downey" | "DullesAreaAssociationOfRealtors" | "DuluthAreaAssociationOfRealtors" | "DurangoAreaAssociationOfRealtors" | "DurhamAssociationOfRealtors" | "DurhamRegionAssociationOfRealtors" | "EastAlabamaBoardOfRealtors" | "EastBayRecip" | "EastBayRegionalDataMls" | "EastCentralAssociationOfRealtors" | "EastPasco" | "EastPolk" | "EastTennesseeRealtors" | "EastValley" | "EastValleyRedlands" | "EastValleyYucaipa" | "EasternCt" | "EasternPanhandleBoardofREALTORS" | "EasternThumbAssociationOfRealtors" | "EasternUpperPeninsulaAssociationOfRealtors" | "EgyptianBoardOfRealtors" | "ElDoradoBoardOfRealtors" | "ElPasoAssociationOfRealtors" | "ElkinsRandolphBoardOfRealtors" | "ElkoCountyAssociationOfRealtors" | "EllisHillAssociationOfRealtors" | "ElmiraCorningRegionalAssociationOfRealtors" | "EmeraldCoastAssociationOfRealtors" | "EmmetAssociationOfRealtors" | "Englewood" | "EstesParkBoardOfRealtors" | "FairmontBoardOfRealtors" | "FargoMoorheadAreaAssociationOfRealtors" | "FaulknerCountyBoardOfRealtors" | "FayettevilleAssociationOfRealtorsInc" | "FirelandsAssociationOfRealtors" | "FirstMls" | "FivePointsBoardOfRealtors" | "Flagler" | "FlaglerCountyAssociationOfRealtors" | "FlintHillsAssociationOfRealtors" | "FloridaGulfCoast" | "FloridaKeysBoardOfRealtors" | "FoothillsRealtorAssociationOfNorthCarolina" | "ForgottenCoastRealtorAssociation" | "FortCollinsBoardOfRealtors" | "FortHoodAreaAssociationOfRealtors" | "FortMcmurrayRealEstateBoard" | "FortSmithBoardOfRealtors" | "FourCornersBoardOfRealtors" | "FourRiversAssociationOfRealtors" | "FranklinBoardOfRealtors" | "FranklinCountyBoardOfRealtors" | "FraserValleyRealEstateBoard" | "FrederickCountyAssociationofREALTORS" | "FredericksburgAreaAssociationOfRealtors" | "FremontBoardOfRealtors" | "Fresno" | "FresnoMultipleListingService" | "FtLauderdale" | "GainesvilleAlachua" | "GallatinAssociationOfRealtors" | "GallupBoardOfRealtors" | "GalvestonAssociationOfRealtors" | "GardenCityMls" | "GardenStateMls" | "GastonAssociationOfRealtors" | "GeorgiaMls" | "GeorgiaUpstateLakesBoardOfRealtors" | "Glendale" | "GlendaleWestMaricopaBoardOfRealtorsInc" | "GlenwoodSpringsAssociationRealtors" | "GlobalMls" | "GloucesterSalemCountiesBoardOfRealtors" | "GoldenEmpireMLSBakersfield" | "GoldenIslesAssociationOfRealtors" | "GoldsboroWayneCountyAssociationOfRealtors" | "GranburyAssociationOfRealtors" | "GrandCountyBoardOfRealtors" | "GrandForksAreaAssociationOfRealtors" | "GrandIslandBoardOfRealtors" | "GrandJunctionRealtorAssociation" | "GrandPrairieBoardOfRealtors" | "GrandRapidsAssociationOfRealtors" | "GrandePrairieAndAreaAssociationOfRealtors" | "GreatFallsAssociationOfRealtors" | "GreatNorthMls" | "GreatPlainsRegionalMls" | "GreatSmokyMountainsAssociationOfRealtors" | "GreaterAlabamaMls" | "GreaterAlbuquerqueAssociationOfRealtors" | "GreaterAlexandriaAreaAssociationOfRealtors" | "GreaterAntelopeValleyAssociationOfRealtors" | "GreaterAugustaAssociationOfRealtorsInc" | "GreaterBaltimoreBoardOfRealtors" | "GreaterBatonRougeAssociationOfRealtors" | "GreaterBergenRealtors" | "GreaterBinghamtonAssociationOfRealtors" | "GreaterBostonRealEstateBoard" | "GreaterCapitalAreaAssociationOfRealtors" | "GreaterCapitalAssociationOfRealtorsInc" | "GreaterCentralBoardOfRealtors" | "GreaterCentralLouisianaRealtorsAssociation" | "GreaterChattanoogaMls" | "GreaterChattanoogaRealtors" | "GreaterColumbiaAssociationOfRealtorsInc" | "GreaterDentonWiseAssociationOfRealtors" | "GreaterElPasoAssociationOfRealtors" | "GreaterErieBoardOfRealtors" | "GreaterFairbanksBoardOfRealtors" | "GreaterFairfield" | "GreaterFortPolkAreaRealtors" | "GreaterFortWorthAssociationOfRealtors" | "GreaterFtLauderdaleRealtors" | "GreaterGatewayAssociationOfRealtors" | "GreaterGoldenTriangleRealtors" | "GreaterGreenvilleAssocOfRealtors" | "GreaterHarrisburgAssociationOfRealtors" | "GreaterHartford" | "GreaterHartfordAssociationOfRealtorsrInc" | "GreaterKalamazooAssociationOfRealtors" | "GreaterLakesAssociationOfRealtors" | "GreaterLansingAssociationOfRealtors" | "GreaterLasVegasAssociationOfRealtorsInc" | "GreaterLewisvilleAssociationOfRealtors" | "GreaterLouisvilleAssociationOfRealtors" | "GreaterMcallenAssociationOfRealtors" | "GreaterMetroWestAssociationRealtorsInc" | "GreaterMetropolitanAssociationOfRealtors" | "GreaterNashvilleAssociationOfRealtorsInc" | "GreaterNewHavenAssociationOfRealtorsInc" | "GreaterNewMilford" | "GreaterOwensboroREALTORAssociation" | "GreaterPhiladelphiaAssociationOfRealtors" | "GreaterPiedmontRealtors" | "GreaterRegionalAllianceOfRealtors" | "GreaterRochesterAssociationOfRealtorsInc" | "GreaterScrantonBoardOfRealtors" | "GreaterShiawasseeAssociationOfRealtors" | "GreaterSiouxCityBoardOfRealtors" | "GreaterSouthernMls" | "GreaterSpringfieldBoardOfRealtors" | "GreaterTampaAssociationOfRealtors" | "GreaterTexomaAssociationOfRealtors" | "GreaterTulsaAssociationOfRealtors" | "GreaterTylerAssociationOfRealtorsInc" | "GreaterUnionCountyAssociationOfRealtors" | "GreaterVancouverRealtors" | "GreaterWaterbury" | "GreeleyAreaRealtorAssociation" | "GreenValleySahuaritaAssociationOfRealtors" | "GreenbrierValleyBoardOfRealtors" | "GreensboroRegionalRealtorsAssociation" | "GreenwichBoardOfRealtors" | "GreenwoodAssociationOfRealtors" | "GreersFerryLakeAreaBoardOfRealtors" | "GrossePointeBoardOfRealtors" | "GuelphAndDistrictAssociationOfRealtors" | "GuernseyMuskingumValleyAssociationOfRealtors" | "GulfCoastAssociationOfRealtors" | "GulfCoastMls" | "GulfSouthRealEstateInformationNetworkInc" | "GunnisonCountryAssociationRealtors" | "GunnisonCrestedButteAssociationOfRealtors" | "HamptonRoadsRealtorsAssociationInc" | "HarfordCountyAssociationofREALTORS" | "HarlingenBoardOfRealtors" | "HarrisonCountyAssociationOfRealtors" | "HarrisonDistrictBoardOfRealtors" | "HarrisonburgRockinghamAreaAssociationOfRealtors" | "HattiesburgAreaAssociationOfRealtors" | "HawaiiInformationService" | "HaywoodCountyBoardOfRealtors" | "HeartOfIowaRegionalBoardOfRealtors" | "Heartland" | "HeartlandAssociationOfRealtors" | "HeartofKentuckyAssociationofREALTORS" | "HelenaAssociationOfRealtors" | "HemetSanJacinto" | "HendersonCountyBoardOfRealtors" | "HendersonvilleBoardOfRealtors" | "HerefordBoardOfRealtors" | "HernandoCountyAssociationOfRealtors" | "HgarHudsonGatewayAssociationOfRealtors" | "HiCentral" | "HighCountryAssociationOfRealtorsInc" | "HighDesert" | "HighPlainsAssociationOfRealtors" | "HighPointRegionalAssocOfRealtorsInc" | "HighlandLakesAssociationOfRealtors" | "HighlandsCashiersBoardOfRealtors" | "HillsdaleCountyBoardOfRealtors" | "HiltonHeadAreaAssociationOfRealtors" | "HiltonHeadIsland" | "HinesvilleAreaBoardOfRealtors" | "HiveMls" | "HobbsAssociationOfRealtors" | "HopkinsvilleChristianAndToddCountyAor" | "HotSpringsBoardOfRealtors" | "HoustonAssociationOfRealtors" | "HowardCountyAssociationofREALTORS" | "HudsonValleyCatskillsRegionMls" | "HumboldtAssociationOfRealtors" | "HunterdonSomersetAssociationOfRealtors" | "HuntingtonBoardOfRealtors" | "HuntsvilleAreaAssociationOfRealtorsInc" | "HuronPerthAssociationOfRealtors" | "ITech" | "ImagineMLS" | "InclineVillageBoardOfRealtors" | "IndianRiver" | "InformationAndRealEstateServices" | "Inglewood" | "InlandValleys" | "IntermountainMls" | "IowaCityAreaAssociationofREALTORS" | "IowaRealty" | "IrvingLasColinasAssociationOfRealtors" | "ItascaCountyBoardOfRealtors" | "IthacaBoardOfRealtors" | "JacksonAreaAssociationOfRealtors" | "JacksonCountyBoardOfRealtors" | "JacksonvilleBoardOfRealtors" | "JasperAreaBoardOfRealtors" | "JeffersonCityAreaBoardOfRealtors" | "JeffersonCountyAssociationOfRealtors" | "JeffersonLewisBoard" | "JohnsonCountyAssociationOfRealtors" | "JohnstonCountyAssociationOfRealtors" | "JoshuaTreeGateway" | "KamloopsRealEstateAssociation" | "KanawhaValleyBoardOfRealtors" | "KansasCityRegionalAssociationOfRealtorsInc" | "KaufmanVanZandtAssociationOfRealtors" | "KawarthaLakesRealEstateAssociationInc" | "KentCountyAssociationofREALTORS" | "KentuckyBarkleyLakesBoardOfRealtors" | "KerrLakeBoardOfRealtorsInc" | "KerrvilleBoardOfRealtors" | "KershawCountyBoardOfRealtors" | "KeyWestAssociationOfRealtors" | "KingsCountyBoardofREALTORS" | "KingstonAndAreaRealEstateAssociation" | "KingsvilleAreaAssociationOfRealtors" | "KitchenerWaterlooAssociationOfRealtors" | "KlamathCountyAssociationOfRealtors" | "KnoxvilleAreaAssociationOfRealtorsInc" | "KootenayAssociationOfRealtors" | "KootenayRealEstateBoard" | "Laguna" | "LakeAndSumter" | "LakeCitiesAssociationOfRealtors" | "LakeCityBoardofREALTORS" | "LakeCounty" | "LakeGeaugaAreaAssociationOfRealtors" | "LakeHavasuAssociationOfRealtors" | "LakeMartinAreaAssociationofREALTORS" | "LakeOfTheOzarksBoardOfRealtors" | "LakeRegionAssociationOfRealtors" | "LakeWales" | "Lakeland" | "LakesCountryAssociationOfRealtors" | "LakewayAreaAssociationOfRealtors" | "LancasterCountyAssociationofREALTORS" | "LandOfTheSkyAssociationOfRealtors" | "LapeerAndUpperThumbAssociationOfRealtors" | "LaredoBoardOfRealtorsInc" | "LasCrucesAssociationOfRealtors" | "LasVegasBoardOfRealtors" | "LassenAssociationofREALTORS" | "LatahCountyBoardOfRealtors" | "LawrenceBoardOfRealtors" | "LawtonBoardOfREALTORS" | "LebanonBoardOfRealtors" | "LebanonCountyAssociationofREALTORS" | "LeeCountyAssociationOfRealtors" | "LehighValleyMls" | "LenaweeCountyAssociationOfRealtors" | "LethbridgeAndDistrictAssociationOfRealtors" | "LewisClarkAssociationOfRealtors" | "LewistonChapterofBillingsAssociationofREALTORS" | "LexingtonBluegrassAssociationOfRealtors" | "LexingtonBoardOfRealtors" | "LibertyBoardOfRealtorsInc" | "LincolnCountyBoardOfRealtors" | "LitchfieldCounty" | "LittleRockRealtorsAssociation" | "LivingstonCountyAssociationOfRealtors" | "LoganCountyBoardOfRealtors" | "LompocValley" | "LondonAndStThomasAssociationOfRealtors" | "LongIslandBoardOfRealtorsInc" | "LongleafPineRealtors" | "LongmontAssociationOfRealtors" | "LongviewAreaAssociationOfRealtors" | "LorainCountyAssociationOfRealtors" | "LovelandBerthoudAssociationRealtors" | "LowcountryRegionalMls" | "LowerYakimaValleyAssociationOfRealtors" | "LubbockAssociationOfRealtors" | "LufkinAssociationOfRealtors" | "LuzerneCountyAssociationofREALTORS" | "LynchburgAssociationOfRealtors" | "Madera" | "MaineListings" | "MainstreetOrganizationOfRealtors" | "Malibu" | "MammothLakesBoardOfRealtors" | "Manatee" | "ManitobaRealEstateAssociation" | "MansfieldAssociationOfRealtors" | "MarathonAndLowerKeysAssociationOfRealtors" | "MarcoIslandAreaAssociationOfRealtors" | "MariettaBoardOfRealtors" | "MarinREALTORS" | "MarinetteCountyBoardOfRealtors" | "MariposaCounty" | "MarkTwainAssociationOfRealtors" | "MarshallCountyBoardOfRealtors" | "MartinCounty" | "MartinCountyRealtorsOfTheTreasureCoast" | "MasonOceanaManisteeBoardOfRealtors" | "MassanuttenBoardOfRealtors" | "MatagordaCountyBoardOfRealtors" | "MayfieldGravesCountyBoardOfRealtors" | "McdowellBoardOfRealtors" | "MckeanPa" | "MedicineHatRealEstateBoard" | "MedinaCountyBoardOfRealtors" | "MemphisAreaAssociationOfRealtors" | "MenaAreaBoardOfRealtors" | "MercedCounty" | "MercerCountyAssociationOfRealtors" | "MetroAreaBoardOfRealtors" | "MetroCentreAssociationOfRealtors" | "MetroMilwaukee" | "MetroSearch" | "Metrolist" | "MetropolitanConsolidatedAssociationOfRealtors" | "MetropolitanIndianapolisBoardOfRealtors" | "MetrotexAssociationOfRealtorsInc" | "MiamiAssociationOfRealtors" | "MiamiAssociationOfRealtorsInc" | "MiamiRealtors" | "MiborRealtorAssociation" | "MichiganRegionalInformationCenter" | "MidAmericaRegionalInformationSystems" | "MidCarolinaRegionalAssociationOfRealtors" | "MidFairfieldCounty" | "MidHudsonMultipleListingService" | "MidIowaRegionalBoardOfRealtors" | "MidJerseyAssociationOfRealtors" | "MidKansasMultipleListingService" | "MidState" | "MidValleyAssociationOfRealtors" | "MiddleGeorgiaMls" | "MidlandBoardOfRealtors" | "MidwestRealEstateData" | "MiltonAndDistrictRealEstateBoard" | "MineralAreaBoardOfRealtors" | "MiniCassiaAssociationOfRealtors" | "MinneapolisAreaAssociationOfRealtors" | "MinnesotaArrowheadMls" | "Mirealsource" | "MiscellaneousAssociation" | "MississaugaRealEstateBoard" | "MissoulaCountyAssociationOfRealtors" | "MissoulaOrganizationOfRealtors" | "MlsOfCatawbaValley" | "MlsOfGreaterCincinnati" | "MlsOfSouthernArizona" | "MlsPropertyInformationNetwork" | "MlsTechnology" | "MlsUnited" | "Mlslistings" | "Mlspin" | "MobileAreaAssociationOfRealtors" | "MohawkValley" | "MonmouthCountyAssociationOfRealtorsInc" | "MonmouthOceanRegionalRealtors" | "MonroeCountyAssociationOfRealtors" | "MontagueCountyBoardOfRealtors" | "MontanaRegionalMls" | "MontcalmCountyAssociationOfRealtors" | "MontebelloDistrict" | "MontgomeryAreaAssociationOfRealtors" | "MontgomeryCountyAssociationOfRealtors" | "MontroseAssociationOfRealtors" | "MorganCountyAssociationOfRealtors" | "MorgantownBoardOfRealtors" | "MountainCentralAssociationOfRealtors" | "MountainLakesBoardofREALTORS" | "MountainMetroAssociationOfRealtors" | "Mrmls" | "MurrayCallowayCountyBoardOfRealtors" | "MyStateMls" | "NacogdochesCountyBoardOfRealtors" | "NampaAssociationOfRealtors" | "Naples" | "NaplesAreaBoardOfRealtors" | "NavarreAreaBoardOfRealtors" | "NavarroCountyBoardOfRealtors" | "NebraskaRealtorsAssociation" | "NemahaValleyBoardOfRealtors" | "NeuseRiverRegionAssociationOfRealtors" | "NevadaCounty" | "NevadaREALTORS" | "NewBernBoardOfRealtorsInc" | "NewBraunfelsCanyonLakeAreaAssocOfRealtors" | "NewBrunswickRealEstateAssociation" | "NewCanaanBoardOfRealtors" | "NewCastleCountyBoardofREALTORS" | "NewHavenMiddlesex" | "NewMexicoAssociationOfRealtors" | "NewRiverValleyAssociationOfRealtors" | "NewSmyrnaBeachBoardOfRealtors" | "NewYorkStateMls" | "NewfoundlandAndLabradorAssociationOfRealtors" | "Newport" | "NewportBeachAssociationOfRealtors" | "Newtown" | "NexusAssociationOfRealtors" | "NiagaraAssociationOfRealtors" | "NocoastMls" | "NolanCountyBoardOfRealtors" | "NorfolkBoardOfRealtors" | "NormanBoardOfRealtors" | "NorthBay" | "NorthBayAndAreaRealtorsAssociation" | "NorthBayRealEstateBoard" | "NorthCarolinaMountainsMls" | "NorthCarolinaRegionalMls" | "NorthCentralIowaRegionalMls" | "NorthCentralJerseyAssociationOfRealtors" | "NorthIowaRegionalBoardOfRealtors" | "NorthMetroDenverRealtorAssociationInc" | "NorthMetroRealtorsAssociation" | "NorthOaklandCountyBoardOfRealtorsInc" | "NorthPulaskiBoardOfRealtors" | "NorthSanDiegoCounty" | "NorthSanLuisObispo" | "NorthSantaBarbaraCountyRegionalMLS" | "NorthShoreBarringtonAssociationOfRealtors" | "NorthTennesseeAssociationOfRealtors" | "NorthTexasCommercialAssociationOfRealtors" | "NorthTexasInformationSystems" | "NorthTexasRealEstateInformationSystems" | "NortheastAlabamaAssociationOfRealtors" | "NortheastArkansasBoardOfRealtors" | "NortheastAtlantaMetroAssnOfRealtorsInc" | "NortheastFloridaAssociationOfRealtorsInc" | "NortheastGeorgiaBoardOfRealtors" | "NortheastIowaRegionalBoardofREALTORS" | "NortheastLouisianaAssociationOfRealtors" | "NortheastMichiganBoardOfRealtors" | "NortheastMississippiBoardOfRealtors" | "NortheastOklahomaBoardOfRealtors" | "NortheastRealtorsOfLouisiana" | "NortheastSouthDakotaAssociationOfRealtors" | "NortheastTarrantCountyBoardOfRealtors" | "NortheastTennesseeAssociationOfRealtors" | "NortheastWashingtonAssociationOfRealtors" | "NortheasternMichiganBoardOfRealtors" | "NorthernArizonaMls" | "NorthernColoradoCommercialAssociationOfRealtors" | "NorthernFairfieldCounty" | "NorthernGreatLakesRealtors" | "NorthernIndianaRealtorsAssociation" | "NorthernJacksonCountyBoardOfRealtors" | "NorthernKentuckyMultipleListingService" | "NorthernNevadaRegionalMls" | "NorthernNewBrunswickRealEstateBoard" | "NorthernOhioRegionalMls" | "NorthernSolanoCountyAssociationofREALTORS" | "NorthernVirginiaAssociationOfRealtors" | "NorthshoreAreaBoardOfRealtors" | "NorthumberlandHillsAssociationOfRealtors" | "NorthwestArkansasBoardOfRealtorsMls" | "NorthwestIllinoisAllianceOfRealtors" | "NorthwestIndianaRealtorsAssociation" | "NorthwestIowaRealtors" | "NorthwestIowaRegionalBoardOfRealtors" | "NorthwestLouisianaAssociationOfRealtors" | "NorthwestMinnesotaAssociationOfRealtors" | "NorthwestMississippiAssociationOfRealtors" | "NorthwestMontanaAssociationOfRealtors" | "NorthwestMultipleListingService" | "NorthwestOhioRealEstateInformationService" | "NorthwestWyomingBoardOfRealtors" | "NorthwoodsAssocOfRealtorsInc" | "Oakland" | "Oakville" | "OakvilleMiltonAndDistrictRealEstateBoard" | "OcalaMarion" | "OcalaMarionCountyAssociationOfRealtorsInc" | "OceanCityBoardOfRealtors" | "OceanCountyBoardOfRealtors" | "OdessaBoardOfRealtors" | "OjaiValley" | "OkanaganMainlineRealEstateBoard" | "Okeechobee" | "OklahomaCityMetropolitanAor" | "OmahaAreaBoardOfRealtors" | "OmniMlsLlc" | "OnekeyMls" | "OnepointAssociationOfRealtors" | "OrangeChathamAssociationOfRealtors" | "OrangeCoastAssociationOfRealtors" | "OrangeCounty" | "OregonCoastMls" | "OrlandoRegional" | "OrlandoRegionalRealtorAssociation" | "Oroville" | "Osceola" | "OtherUnspecificed" | "OtsegoDelaware" | "OttawaRealEstateBoard" | "OutOfAreaBoard" | "OuterBanksAssociationOfRealtors" | "OzarkGatewayAssociationOfRealtors" | "OzarkTrailBoardOfRealtors" | "PacificRegionalMultipleListingService" | "PacificSouthwest" | "PacificWest" | "PaducahBoardOfRealtors" | "PagosaSpringsAreaAssnOfRealtors" | "PalestineAssociationOfRealtors" | "PalmSprings" | "PalosVerdesPeninsula" | "Paradise" | "ParagouldBoardOfRealtors" | "ParisBoardOfRealtors" | "ParkCityBoardOfRealtors" | "ParkersburgAreaAssociationOfRealtors" | "PasadenaFoothills" | "PasoRobles" | "PassaicCountyBoardOfRealtors" | "PearlRiverCountyBoardOfRealtors" | "PeeDeeRealtorAssociation" | "PennyrileBoardOfRealtors" | "PensacolaAssociationOfRealtorsInc" | "PeoriaAreaAssociationOfRealtors" | "PermianBasinBoardOfRealtorsInc" | "PeterboroughAndTheKawarthasAssociationOfRealtors" | "PetroplexAssociationofREALTORS" | "PhoenixAssociationOfRealtors" | "PiedmontRegionalAssociationOfRealtors" | "PikeWayneAssociationOfRealtors" | "PikesPeakAssociationOfRealtors" | "Pillar9" | "PinehurstSouthernPinesAreaAssociation" | "PinellasSuncoast" | "PinellasSuncoastAssociationOfRealtorsInc" | "PineyWoodsBoardOfRealtors" | "PismoCoast" | "PittsburgBoardOfRealtors" | "PlacerCountyAssociationOfRealtors" | "Plumas" | "PoconoMountainsAssociationOfRealtors" | "PortCharlotte" | "PortageCountyAssociationOfRealtors" | "PortlandMetropolitanAssociationOfRealtors" | "PowellRiverSunshineCoastRealEstateBoard" | "PrescottAreaAssociationOfRealtors" | "Primemls" | "PrinceGeorgesCountyAssociationOfRealtorsInc" | "PrinceWilliamAssociationOfRealtors" | "PuebloAssociationOfRealtors" | "PuertoRico" | "PulaskiCountyBoardOfRealtors" | "QuadCityAreaRealtors" | "QuinteAndDistrictAssociationOfRealtors" | "REALTORSAssociationofYorkandAdamsCounties" | "REALTORSofGreaterMidNebraska" | "RaleighRegionalAssociationOfRealtors" | "RaleighWakeBoardOfRealtors" | "RanchoSoutheast" | "RangeAssociationofREALTORS" | "RapbBeachesmls" | "ReadingBerksAssociationOfRealtorsInc" | "RealEstateBoardOfGreaterVancouver" | "RealEstateBoardOfNewYork" | "RealEstateBoardOfTheFrederictonArea" | "RealEstateInformationNetworkInc" | "RealcompIiLtd" | "Realmls" | "RealsourceAssociationOfRealtorsInc" | "RealtorAssnGreaterFortLauderdale" | "RealtorAssocOfGreaterMiamiAndTheBeaches" | "RealtorAssociationOfAcadiana" | "RealtorAssociationOfFranklinAndGulfCounties" | "RealtorAssociationOfSouthernMinnesota" | "RealtorAssociationOfTheGreaterPeeDeeInc" | "RealtorAssociationOfTheSiouxEmpire" | "RealtorAssociationOfWesternKentucky" | "RealtorAssociationPalmBeaches" | "RealtorsAssocOfGreaterFtMyersAndTheBeach" | "RealtorsAssociationOfCitrusCounty" | "RealtorsAssociationOfEdmonton" | "RealtorsAssociationOfGreyBruceOwenSound" | "RealtorsAssociationOfHamiltonBurlington" | "RealtorsAssociationOfLincoln" | "RealtorsAssociationOfLloydminsterAndDistrict" | "RealtorsAssociationOfMaui" | "RealtorsAssociationOfMetropolitanPittsburgh" | "RealtorsAssociationOfNortheastWisconsin" | "RealtorsAssociationOfSouthCentralAlberta" | "RealtorsAssociationOfSouthCentralWisconsin" | "RealtorsAssociationOfSouthwesternIllinois" | "RealtorsLandInstitute" | "RealtorsOfCentralColorado" | "RealtorsOfGreaterAugusta" | "RealtorsOfNorthwesternWisconsin" | "Realtracs" | "ReciprocalBoard" | "Recolorado" | "RegionalMlsOfMinnesota" | "RemMetroSouthAssociationOfRealtorsInc" | "RemMiddleTennesseeAssociationOfRealtorsInc" | "RemSoutheastValleyRegionalAssociationOfRealtors" | "RemWilliamsonCountyAssociationOfRealtorsInc" | "RenfrewCountyRealEstateBoard" | "Resides" | "RhodeIslandStateWideMls" | "RichmondAssociationOfRealtors" | "RichmondCountyBoardOfRealtorsInc" | "RideauStLawrenceRealEstateBoard" | "Ridgefield" | "RimOTheWorld" | "RioGrandeValleyMls" | "RlsConnectNyc" | "RoamMls" | "RoanokeValleyAssociationOfRealtorsInc" | "RobertsonCountyAssociationOfRealtors" | "Rochester" | "RockinghamCountyAssociationOfRealtorsInc" | "RockportAreaBoardOfRealtors" | "RockyMountAreaAssociationOfRealtors" | "RockyMountainAssociationOfRealtors" | "RogueValleyAssociationOfRealtors" | "RoswellAssociationOfRealtors" | "RoyalGorgeAssociationOfRealtors" | "RoyalPalmCoastRealtorAssociation" | "RuidosoLincolnCountyAssociationOfRealtors" | "RutherfordCountyBoardOfRealtors" | "SacramentoAssociationOfRealtorsInc" | "SaginawBoardOfRealtors" | "SaintJohnRealEstateBoard" | "SalisburyRowanAssociationOfRealtors" | "SalisburyRowanRealtors" | "SaltLakeBoardOfRealtors" | "SanAngeloAssociationOfRealtors" | "SanAntonioBoardOfRealtors" | "SanDiego" | "SanDiegoAssociationOfRealtors" | "SanDiegoMls" | "SanFrancisco" | "SanJuanCountyBoardOfRealtors" | "SanLuisObispo" | "SanLuisObispoCoastal" | "SanMarcosAreaBoardOfRealtors" | "SanMateoCountyAssociationOfRealtors" | "SandicorMls" | "SantaBarbara" | "SantaBarbaraAssociationOfRealtors" | "SantaClaraCounty" | "SantaCruzCountyBoardOfRealtors" | "SantaFeAssociationOfRealtors" | "SantaMaria" | "SantaYnezValley" | "SarasotaAssociationOfRealtorsInc" | "SarasotaManatee" | "SaratogaSchenectadySchoharieAssociation" | "SarniaLambtonRealEstateBoard" | "SaskatchewanRealtorsAssociation" | "SaskatoonRegionAssociationOfRealtors" | "SaultSteMarieRealEstateBoard" | "SavannahBoardOfRealtors" | "SavannahMultiListCorporation" | "ScenicCoast" | "SciotoValleyAssociationOfRealtors" | "ScottsdaleAreaAssociationOfRealtorsInc" | "SearcyBoardOfRealtors" | "SeattleKingCountyAssociationOfRealtorsInc" | "SedonaVerdeValleyAssociationOfRealtors" | "SeguinBoardOfRealtors" | "SelkirkAssociationOfRealtors" | "Selma" | "ShalMls" | "ShastaAssociationOfRealtors" | "SheridanCountyBoardOfRealtors" | "SierraCountyBoardOfRealtors" | "SierraNevadaAssociationOfRealtors" | "SierraNevadaRealtors" | "SierraNorthValley" | "SiliconValleyAssociationOfRealtors" | "SilverCityRegionalMls" | "SimcoeAndDistrictRealEstateBoard" | "SimiValley" | "SiskiyouAssociationOfRealtors" | "SmartMls" | "SnakeRiverRegionalMls" | "SoBrowardBoardOfRealtors" | "Socalmls" | "SouthBay" | "SouthCentralArkansasRealtorsAssociation" | "SouthCentralBoardOfRealtors" | "SouthCentralKansasMls" | "SouthGeorgiaMLS" | "SouthJerseyShoreRegionalMls" | "SouthMetroDenverRealtorAssociation" | "SouthMonmouthBoardOfRealtors" | "SouthOkanaganRealEstateBoard" | "SouthPadreIslandBoardOfRealtors" | "SouthTahoeAssociationOfRealtors" | "SouthTexasCommercialAssociationOfRealtors" | "SoutheastAlabamaAssociationOfRealtors" | "SoutheastArkansasBoardOfRealtors" | "SoutheastFloridaRegional" | "SoutheastIowaRegionalBoardOfRealtors" | "SoutheastKern" | "SoutheastMinnesotaAssociationOfRealtors" | "SoutheastMissouriRealtors" | "SoutheasternBorderAssociationOfRealtors" | "SouthernAdirondackRealtors" | "SouthernGatewayAssociationOfRealtors" | "SouthernGeorgianBayAssociationOfRealtors" | "SouthernIndianaRealtorsAssociation" | "SouthernMarylandAssociationofREALTORS" | "SouthernMissouriRegionalMls" | "SouthernOklahomaBoardofREALTORS" | "Southland" | "SouthlandRegionalAssociationOfRealtorsInc" | "SouthwestGeorgiaBoardOfRealtorsAndMls" | "SouthwestIowaAssociationOfRealtors" | "SouthwestLosAngeles" | "SouthwestLosAngelesAssociationOfRealtors" | "SouthwestLouisianaAssociation" | "SouthwestLouisianaAssociationOfRealtors" | "SouthwestMichiganAssociationOfRealtors" | "SouthwestRiversideCounty" | "SouthwestVirginiaAssociationOfRealtors" | "SouthwesternIllinoisBoardOfRealtors" | "SouthwesternMichiganAssociationOfRealtors" | "SpaceCoastAssociationOfRealtors" | "SpanishPeaksBoard" | "SpartanburgAssociationOfRealtors" | "SpartanburgBoardOfRealtorsInc" | "SpokaneRealtors" | "StAugustineAndStJohnsCountyBoardOfRealtors" | "StCharlesCountyAssociationOfRealtors" | "StCloudAreaAssociationOfRealtors" | "StJosephCountyAssociationOfRealtors" | "StLouisRealtors" | "StPaulAreaAssociationOfRealtors" | "Stamford" | "StarkCountyAssociationOfRealtorsInc" | "StarkTrumbullAreaRealtors" | "StatenIslandBoardOfRealtors" | "StatenIslandMultipleListingService" | "SteamboatSpringsBoardOfRealtors" | "StellarMls" | "StephenvilleAssociationOfRealtors" | "SudburyRealEstateBoard" | "SummitAssociationOfRealtors" | "SumterBoardOfRealtors" | "SunValleyBoardOfRealtors" | "SuncoastTampaAssociationOfRealtors" | "SunflowerAssociationOfRealtors" | "SuperiorAssociationOfRealtors" | "SussexCountyAssociationOfRealtors" | "SutterYubaAssnOfRealtors" | "Syracuse" | "TacomaPierceCountyAssociationofREALTORS" | "Tampa" | "TaosAssociationOfRealtors" | "TaosCountyAssociationOfRealtors" | "TehachapiAreaAssociationofREALTORS" | "TehamaCounty" | "TellurideAssociationOfRealtors" | "TempleBeltonBoardOfRealtors" | "TennesseeValleyAssociationOfRealtors" | "TennesseeVirginiaRegionalMls" | "TetonBoardOfRealtors" | "TexarkanaBoardOfRealtors" | "TheGreaterMonctonRealtorsDuGrandMoncton" | "TheInlandGateway" | "TheLakelandsAssociationOfRealtors" | "Themls" | "ThreeRiversBoardOfRealtors" | "ThunderBayRealEstateBoard" | "TillsonburgDistrictRealEstateBoard" | "Timmins" | "TitusCampMorrisUpshurAssociationOfRealtors" | "Tmp" | "Toledo" | "TopsailIslandAssociationOfRealtors" | "TorontoRealEstateBoard" | "TraverseAreaAssociationOfRealtors" | "TriCityAssociationOfRealtors" | "TriCounties" | "TriCounty" | "TriCountySuburbanRealtors" | "TriLakesBoardOfRealtors" | "TriStateCommercialRealty" | "TriadMultipleListingService" | "TriangleCommercialAssocOfRealtors" | "TriangleMls" | "TucsonAssociationOfRealtors" | "TulareCountyAssociationOfRealtors" | "TuolumneCountyAssociationOfRealtors" | "TylerCountyBoardOfRealtors" | "UlsterCountyBoardOfRealtors" | "UnionCountyAssociationOfRealtors" | "UnitedAssociationOfRealtors" | "UpperCumberlandMls" | "UpperPeninsulaAssociationOfRealtors" | "Utahrealestatecom" | "UvaldeBoardOfRealtors" | "VailBoardOfRealtors" | "VailMultiListService" | "Valley" | "ValleyMls" | "VancouverIslandRealEstateBoard" | "VcrdsMls" | "Venice" | "VenturaCoastal" | "VictorValley" | "VictoriaAreaAssociationOfRealtors" | "VictoriaBoardOfRealtorsInc" | "VictoriaRealEstateBoard" | "WacoAssociationOfRealtors" | "WarrenAreaBoardOfRealtors" | "WasatchFrontRealEstate" | "WashingtonBeaufortCountyBoardOfRealtors" | "WashingtonCountyBoardOfRealtors" | "WaterWonderlandBoardOfRealtors" | "WaterlooRegionAssociationOfRealtors" | "WayneHolmesAssociationOfRealtors" | "WestAlabamaMultipleListingService" | "WestBranchValleyAssociationOfRealtors" | "WestCentralAssociationOfRealtors" | "WestCentralIowaRealEstateAndRealtors" | "WestCentralIowaRegionalMls" | "WestContraCosta" | "WestEssexBoardOfRealtors" | "WestMichiganLakeshoreAssociationOfRealtors" | "WestPasco" | "WestPennMultiList" | "WestPlainsBoardOfRealtors" | "WestSanGabrielValley" | "WestVolusia" | "WestchesterCountyBoardOfRealtors" | "WestchesterPutnam" | "WesternAzRegionalRealEstateDataExchange" | "WesternMagicValleyRealtors" | "WesternRegionalInformationSystemsAndTechnology" | "WesternUpstateAssociationOfRealtors" | "WesternWayneOaklandCountyAssnOfRealtors" | "WesternWayneOaklandCountyAssociationRealtors" | "WesternWisconsinRealtorsAssociation" | "WestonBuckhannonBoardOfRealtors" | "WheelingBoardOfRealtors" | "WhiteMountainAssociationOfRealtors" | "WhitmanCountyAssociationOfRealtors" | "WichitaFallsAssociationOfRealtors" | "WilkesCountyAssociationOfRealtors" | "WillametteAssociationOfRealtors" | "WillametteValueMultipleListingService" | "WilliamsburgMls" | "WilliamsonCountyAssociationOfRealtors" | "WilliamsonCountyAssociationOfRealtorsInc" | "WillistonBoardOfRealtors" | "WilmingtonRegionalAssociationOfRealtorsInc" | "WilsonBoardOfRealtors" | "WindsorEssexCountyAssociationOfRealtors" | "WinnipegRegionalRealEstateBoard" | "WinstonSalemBoardOfRealtors" | "WiregrassBoardOfRealtors" | "WisconsinRealEstateExchange" | "WisconsinRealtorsAssociation" | "WoodstockIngersollAndDistrictRealEstateBoard" | "WoodstockIngersollTillsonburgAreaAssociationOfRealtors" | "WorcesterRegionalAssociationOfRealtors" | "YadkinValleyAssociationOfRealtorsInc" | "YakimaAssociationOfRealtors" | "YamhillCountyAssociationOfRealtors" | "YanceyMitchellBoardOfRealtors" | "YorkCountyAssociationOfRealtors" | "YoungstownColumbianaAssociationOfRealtors" | "YumaAssociationOfRealtors";

/** 3 members · $metadata EnumType BillingPreference */
export type CotalityEnum_BillingPreference = "Email" | "Fax" | "Mail";

/** 246 members · $metadata EnumType Country */
export type CotalityEnum_Country = "AD" | "AE" | "AF" | "AG" | "AI" | "AL" | "AM" | "AN" | "AO" | "AQ" | "AR" | "AS" | "AT" | "AU" | "AW" | "AX" | "AZ" | "BA" | "BB" | "BD" | "BE" | "BF" | "BG" | "BH" | "BI" | "BJ" | "BL" | "BM" | "BN" | "BO" | "BR" | "BS" | "BT" | "BV" | "BW" | "BY" | "BZ" | "CA" | "CC" | "CD" | "CF" | "CG" | "CH" | "CI" | "CK" | "CL" | "CM" | "CN" | "CO" | "CR" | "CU" | "CV" | "CX" | "CY" | "CZ" | "DE" | "DJ" | "DK" | "DM" | "DO" | "DZ" | "EC" | "EE" | "EG" | "EH" | "ER" | "ES" | "ET" | "FI" | "FJ" | "FK" | "FM" | "FO" | "FR" | "GA" | "GB" | "GD" | "GE" | "GF" | "GG" | "GH" | "GI" | "GL" | "GM" | "GN" | "GP" | "GQ" | "GR" | "GS" | "GT" | "GU" | "GW" | "GY" | "HK" | "HM" | "HN" | "HR" | "HT" | "HU" | "ID" | "IE" | "IL" | "IM" | "IN" | "IO" | "IQ" | "IR" | "IS" | "IT" | "JE" | "JM" | "JO" | "JP" | "KE" | "KG" | "KH" | "KI" | "KM" | "KN" | "KP" | "KR" | "KW" | "KY" | "KZ" | "LA" | "LB" | "LC" | "LI" | "LK" | "LR" | "LS" | "LT" | "LU" | "LV" | "LY" | "MA" | "MC" | "MD" | "ME" | "MF" | "MG" | "MH" | "MK" | "ML" | "MM" | "MN" | "MO" | "MP" | "MQ" | "MR" | "MS" | "MT" | "MU" | "MV" | "MW" | "MX" | "MY" | "MZ" | "NA" | "NC" | "NE" | "NF" | "NG" | "NI" | "NL" | "NP" | "NR" | "NU" | "NZ" | "OM" | "OT" | "PA" | "PE" | "PF" | "PG" | "PH" | "PK" | "PL" | "PM" | "PN" | "PR" | "PS" | "PT" | "PW" | "PY" | "QA" | "RE" | "RO" | "RS" | "RU" | "RW" | "SA" | "SB" | "SC" | "SD" | "SE" | "SG" | "SH" | "SI" | "SJ" | "SK" | "SL" | "SM" | "SN" | "SO" | "SR" | "ST" | "SV" | "SY" | "SZ" | "TC" | "TD" | "TF" | "TG" | "TH" | "TJ" | "TK" | "TL" | "TM" | "TN" | "TO" | "TR" | "TT" | "TV" | "TW" | "TZ" | "UA" | "UG" | "UM" | "US" | "UY" | "UZ" | "VA" | "VC" | "VE" | "VG" | "VI" | "VN" | "VU" | "WF" | "WS" | "YE" | "YT" | "ZA" | "ZM" | "ZW";

/** 93 members · $metadata EnumType MemberDesignation */
export type CotalityEnum_MemberDesignation = "AccreditedAppraiserCanadianInstitute" | "AccreditedBuyerRepresentativeManager" | "AccreditedBuyersRepresentative" | "AccreditedCommercialProfessional" | "AccreditedGreenagentResidential" | "AccreditedGreenbrokerCommercial" | "AccreditedLandConsultant" | "AccreditedLeasingOfficer" | "AccreditedLuxuryHomeSpecialist" | "AccreditedManagementOrganization" | "AccreditedMortgageProfessional" | "AccreditedResidentialManager" | "AccreditedSeniorAgent" | "AccreditedSeniorAppraiser" | "AccreditedStagingProfessional" | "AssociateOfTheCanadianCondominiumInstitute" | "AssociateReservePlanner" | "AtHomeWithDiversity" | "BrokerPriceOpinionResource" | "BusinessCorporationOwnedByARealEstateBroker" | "CanadianEmployeeRelocationCouncilRelocationSpecialist" | "CanadianEmployeeRelocationProfessional" | "CanadianPersonalPropertyAppraiser" | "CanadianRealtorAssociationExecutive" | "CanadianResidentialAppraiser" | "CertifiedCommercialInvestmentMember" | "CertifiedCondoSpecialist" | "CertifiedDistressedPropertyExpert" | "CertifiedGeneralAccountant" | "CertifiedInMarketingOfRealEstate" | "CertifiedInRealEstateFinance" | "CertifiedInternationalPropertySpecialist" | "CertifiedLeaseProfessionalDesignation" | "CertifiedLeasingOfficer" | "CertifiedLuxuryHomeMarketingSpecialist" | "CertifiedManagementAccountant" | "CertifiedManagerOfCondominiums" | "CertifiedMoldRemediation" | "CertifiedMountainAreaSpecialist" | "CertifiedNegotiationExpert" | "CertifiedNewHomeSpecialist" | "CertifiedProfessionalResidentialPropertyManager" | "CertifiedPropertyManager" | "CertifiedRealEstateBrokerageManager" | "CertifiedRealEstateSpecialist" | "CertifiedRealEstateTeamSpecialist" | "CertifiedReserveFundPlanner" | "CertifiedReservePlanner" | "CertifiedResidentialSpecialist" | "CertifiedResidentialUnderwriter" | "CertifiedValuationAnalyst" | "CharteredAccountant" | "CharteredProfessionalAccountant" | "CounselorOfRealEstate" | "DesignatedAgencyRepresentatives" | "DistinguishedRealEstateInstructor" | "Ecobroker" | "FellowOfTheRealEstateInstitute" | "FellowOfTheRealEstateInstituteAppraisalSpecialist" | "FellowOfTheRealEstateInstituteExecutive" | "FellowsOfTheRoyalInstitutionOfCharteredSurveyors" | "GeneralAccreditedAppraiser" | "GraduateRealtorInstitute" | "HomeFinanceResource" | "InstituteOfRealEstateManagement" | "LeadershipTrainingGraduate" | "MarketValueAppraiserResidential" | "MasterCertifiedNegotiationExpert" | "MemberAppraisalInstitute" | "MemberOfTheRoyalInstituteOfCharterSurveyors" | "MilitaryRelocationProfessional" | "NARsGreenDesignation" | "PerformanceManagementNetwork" | "PersonalRealEstateCorporation" | "PricingStrategyAdvisor" | "ProfessionalLandEconomist" | "RealEstateNegotiationExpert" | "RealEstateProfessionalAssistant" | "RealPropertyAdministrator" | "RealtorAssociationCertifiedExecutive" | "RealtorsCommitmentToExcellence" | "RelocationResortSpecialist" | "ResidentialAccreditedAppraiser" | "ResidentialConstructionCertified" | "ResortAndSecondHomePropertySpecialist" | "RoyalInstituteOfCharteredSurveyors" | "SellerRepresentativeSpecialist" | "SeniorResidentialAppraiser" | "SeniorsRealEstateSpecialist" | "ShortSalesAndForeclosureResource" | "SocietyOfIndustrialAndOfficeRealtors" | "TransnationalReferralCertification" | "ePRO";

/** 212 members · $metadata EnumType Languages */
export type CotalityEnum_Languages = "Abkhazian" | "Afar" | "Afrikaans" | "Albanian" | "AmericanSignLanguage" | "Amharic" | "Arabic" | "Aramaic" | "Armenian" | "Assamese" | "AssyrianNeoAramaic" | "Avestan" | "Aymara" | "Azerbaijani" | "BahasaMalaysia" | "Bambara" | "Bangla" | "Bashkir" | "Basque" | "Belorussian" | "Bengali" | "Bihari" | "Bikol" | "Bislama" | "Bosnian" | "BrazilianPortuguese" | "Bulgarian" | "Burmese" | "Byelorussian" | "Cambodian" | "Cantonese" | "CapeVerdeanCreole" | "Catalan" | "Cebuano" | "Chaldean" | "Chamorro" | "Chechen" | "Chinese" | "Chuukese" | "Chuvash" | "Cornish" | "Corsican" | "Cree" | "Creole" | "Croatian" | "Czech" | "Danish" | "Dari" | "Dioula" | "Dutch" | "Dzongkha" | "English" | "Esperanto" | "Estonian" | "Faroese" | "Farsi" | "Fiji" | "Finnish" | "Flemish" | "French" | "Frisian" | "Galician" | "Galla" | "Gan" | "Georgian" | "German" | "Greek" | "Greenlandic" | "Guarani" | "Gujarati" | "HaitianCreole" | "Hakka" | "Hausa" | "Hebrew" | "Herero" | "Hiligaynon" | "Hindi" | "Hindustani" | "HiriMotu" | "Hmong" | "Hungarian" | "Iban" | "Icelandic" | "Igbo" | "Ilocano" | "Indonesian" | "Interlingua" | "Inuktitut" | "Inupiak" | "Irish" | "Italian" | "Japanese" | "Javanese" | "JinYu" | "KIche" | "Kannada" | "Kashmiri" | "Kazakh" | "Kejia" | "Khmer" | "Kichwa" | "Kikuyu" | "Kinyarwanda" | "Kirghiz" | "Kirundi" | "Kiswahili" | "Komi" | "Konkani" | "Korean" | "Kpelle" | "Kru" | "Kurdish" | "Lao" | "Latin" | "Latvian" | "Lingala" | "Lithuanian" | "Luxemburgish" | "Macedonian" | "Malagasy" | "Malay" | "Malayalam" | "Malaysian" | "Maltese" | "Mandarin" | "Maninka" | "ManxGaelic" | "Maori" | "Marathi" | "Marshallese" | "Miny" | "Moldovan" | "Mongolian" | "Nauru" | "Navajo" | "Ndebele" | "Ndonga" | "Nepali" | "Norwegian" | "NorwegianNynorsk" | "Nyanja" | "Occitan" | "Oriya" | "Oromo" | "Ossetian" | "Pakhto" | "Pali" | "Pangasinan" | "Papiamento" | "Pashto" | "Polish" | "Portuguese" | "Punjabi" | "Quechua" | "Romanian" | "Romany" | "Russian" | "Sami" | "Samoan" | "Sangho" | "Sanskrit" | "Sardinian" | "ScotsGaelic" | "Serbian" | "SerboCroatian" | "Sesotho" | "Setswana" | "Shan" | "Shona" | "Sindhi" | "Sinhalese" | "Siswati" | "Slovak" | "Slovenian" | "Somali" | "SouthernNdebele" | "Spanish" | "Sundanese" | "Swahili" | "Swedish" | "Syriac" | "Tagalog" | "Tahitian" | "Taiwanese" | "Tajik" | "Tamil" | "Tatar" | "Tchi" | "Telugu" | "Thai" | "Tibetan" | "Tigrinya" | "Tongan" | "Tsonga" | "Turkish" | "Turkmen" | "Twi" | "Uigur" | "Ukrainian" | "Urdu" | "Uzbek" | "Vietnamese" | "Volapuk" | "Welsh" | "Wolof" | "Xhosa" | "Xiang" | "Yiddish" | "Yoruba" | "Yue" | "Zhuang" | "Zulu";

/** 9 members · $metadata EnumType MemberMlsSecurityClass */
export type CotalityEnum_MemberMlsSecurityClass = "Administrative" | "AgentLevel" | "AgentLimitedInput" | "BaseLevelUser" | "Broker" | "HeadBroker" | "InternalUser" | "NoAccess" | "OfficeLevel";

/** 14 members · $metadata EnumType MemberOtherPhoneType */
export type CotalityEnum_MemberOtherPhoneType = "Direct" | "Fax" | "First" | "Home" | "Mobile" | "Modem" | "Office" | "Pager" | "Preferred" | "Second" | "Sms" | "Third" | "TollFree" | "Voicemail";

/** 4 members · $metadata EnumType PreferredMail */
export type CotalityEnum_PreferredMail = "HomeAddress" | "MailingAddress" | "OfficeMailingAddress" | "OfficeStreetAddress";

/** 5 members · $metadata EnumType PreferredPublication */
export type CotalityEnum_PreferredPublication = "Fax" | "HomeAddress" | "MailingAddress" | "OfficeMailingAddress" | "OfficeStreetAddress";

/** 100 members · $metadata EnumType StateOrProvince */
export type CotalityEnum_StateOrProvince = "AB" | "AK" | "AL" | "AR" | "AZ" | "BC" | "CA" | "CO" | "CT" | "DC" | "DE" | "FL" | "GA" | "HI" | "IA" | "ID" | "IL" | "IN" | "KS" | "KY" | "LA" | "MA" | "MB" | "MD" | "ME" | "MI" | "MN" | "MO" | "MS" | "MT" | "MXAGU" | "MXBCN" | "MXBCS" | "MXCAM" | "MXCHH" | "MXCHP" | "MXCMX" | "MXCOA" | "MXCOL" | "MXDUR" | "MXGRO" | "MXGUA" | "MXHID" | "MXJAL" | "MXMEX" | "MXMIC" | "MXMOR" | "MXNAY" | "MXNLE" | "MXOAX" | "MXPUE" | "MXQUE" | "MXROO" | "MXSIN" | "MXSLP" | "MXSON" | "MXTAB" | "MXTAM" | "MXTLA" | "MXVER" | "MXYUC" | "MXZAC" | "NB" | "NC" | "ND" | "NE" | "NF" | "NH" | "NJ" | "NL" | "NM" | "NS" | "NT" | "NU" | "NV" | "NY" | "OH" | "OK" | "ON" | "OR" | "OS" | "PA" | "PE" | "PR" | "QC" | "RI" | "SC" | "SD" | "SK" | "TN" | "TX" | "UT" | "VA" | "VI" | "VT" | "WA" | "WI" | "WV" | "WY" | "YT";

/** 4 members · $metadata EnumType MemberStatus */
export type CotalityEnum_MemberStatus = "Active" | "DisciplinaryCaution" | "Inactive" | "Suspended";

/** 23 members · $metadata EnumType MemberType */
export type CotalityEnum_MemberType = "Affiliate" | "Assistant" | "AssociateBroker" | "AssociationStaff" | "Broker" | "BrokerOfRecord" | "DesignatedRealtorAppraiser" | "DesignatedRealtorParticipant" | "LicensedAssistant" | "MlsOnlyAppraiser" | "MlsOnlyBroker" | "MlsOnlyBrokerAssociate" | "MlsOnlySalesperson" | "MlsStaff" | "NonMemberVendor" | "OfficeManager" | "OfficeStaff" | "Photographer" | "RealtorAppraiser" | "RealtorBrokerAssociate" | "RealtorSalesperson" | "Team" | "UnlicensedAssistant";

/** 17 members · $metadata EnumType SocialMediaType */
export type CotalityEnum_SocialMediaType = "Blog" | "Digg" | "Facebook" | "FacebookMessenger" | "Googleplus" | "Instagram" | "Linkedin" | "Pinterest" | "Reddit" | "Slack" | "Snapchat" | "Stumbleupon" | "Tumblr" | "Twitter" | "Website" | "Youtube" | "iMessage";

/** 3 members · $metadata EnumType OfficeBranchType */
export type CotalityEnum_OfficeBranchType = "Branch" | "Main" | "StandAlone";

/** 2 members · $metadata EnumType OfficeStatus */
export type CotalityEnum_OfficeStatus = "Active" | "Inactive";

/** 12 members · $metadata EnumType OfficeType */
export type CotalityEnum_OfficeType = "Affiliate" | "Appraiser" | "Association" | "Mls" | "MlsOnlyBranch" | "MlsOnlyFirm" | "MlsOnlyOffice" | "NonMemberVendor" | "RealEstate" | "RealtorBranchOffice" | "RealtorFirm" | "RealtorOffice";

/** 2 members · $metadata EnumType SyndicateAgentOption */
export type CotalityEnum_SyndicateAgentOption = "None" | "Other";

/** 3 members · $metadata EnumType Attended */
export type CotalityEnum_Attended = "Agent" | "Seller" | "Unattended";

/** 3 members · $metadata EnumType OpenHouseStatus */
export type CotalityEnum_OpenHouseStatus = "Active" | "Canceled" | "Ended";

/** 9 members · $metadata EnumType OpenHouseType */
export type CotalityEnum_OpenHouseType = "Broker" | "InPersonAndLivestreamBroker" | "InPersonAndLivestreamPublic" | "LivestreamBroker" | "LivestreamOffice" | "LivestreamPublic" | "Office" | "Private" | "Public";

/** 76 members · $metadata EnumType AccessibilityFeatures */
export type CotalityEnum_AccessibilityFeatures = "AccessibilityFeatures" | "AccessibleApproachWithRamp" | "AccessibleBedroom" | "AccessibleCentralLivingArea" | "AccessibleClosets" | "AccessibleCommonArea" | "AccessibleDoors" | "AccessibleElectricalAndEnvironmentalControls" | "AccessibleElevatorInstalled" | "AccessibleEntrance" | "AccessibleForHearingImpairment" | "AccessibleFullBath" | "AccessibleHallways" | "AccessibleKitchen" | "AccessibleKitchenAppliances" | "AccessibleStairway" | "AccessibleWasherDryer" | "AdaCompliant" | "AdaptableBathroomWalls" | "AdaptableForElevator" | "BuildingAccessibleApproachWithRamp" | "BuildingAccessibleCommonArea" | "BuildingAccessibleDoors" | "BuildingAccessibleElectricalAndEnvironmentalControls" | "BuildingAccessibleElevatorInstalled" | "BuildingAccessibleEntrance" | "BuildingAccessibleForHearingImpairment" | "BuildingAccessibleHallways" | "BuildingAccessibleStairway" | "BuildingAdaCompliant" | "BuildingAdaptableForElevator" | "BuildingCeilingTrack" | "BuildingElectronicEnvironmentalControls" | "BuildingEnhancedAccessible" | "BuildingGripAccessibleFeatures" | "BuildingReinforcedFloors" | "BuildingSmartTechnology" | "BuildingStairLift" | "BuildingStandbyGenerator" | "BuildingTherapeuticWhirlpool" | "BuildingVisitable" | "BuildingWalkerAccessibleStairs" | "BuildingWheelchairAccessible" | "CeilingTrack" | "CentralLivingArea" | "CommonArea" | "CoveredEntry" | "CustomizedWheelchairAccessible" | "ElectronicEnvironmentalControls" | "EnhancedAccessible" | "ExteriorWheelchairLift" | "GrabBars" | "GripAccessibleFeatures" | "HandRails" | "LevelLot" | "LeveredHandles" | "LowCabinetry" | "LowPileCarpet" | "LowThresholdShower" | "LowerFixtures" | "NoStairs" | "None" | "NotAdaCompliant" | "Other" | "Parking" | "ReinforcedFloors" | "SafeEmergencyEgressFromHome" | "SeeRemarks" | "SmartTechnology" | "StairLift" | "StandbyGenerator" | "TherapeuticWhirlpool" | "Visitable" | "VisitorBathroom" | "WalkerAccessibleStairs" | "WheelchairAccess";

/** 129 members · $metadata EnumType Appliances */
export type CotalityEnum_Appliances = "AirToAirExchanger" | "AppliancesNegotiable" | "BarFridge" | "Barbecue" | "BuiltIn" | "BuiltInCoffeeMaker" | "BuiltInDoubleOven" | "BuiltInElectricOven" | "BuiltInElectricRange" | "BuiltInFreezer" | "BuiltInGasOven" | "BuiltInGasRange" | "BuiltInOven" | "BuiltInRange" | "BuiltInRefrigerator" | "CentralAirConditioner" | "CentralVacuum" | "CoalWaterHeater" | "CommonWaterHeater" | "ConvectionOven" | "Cooktop" | "CounterTop" | "Dishwasher" | "Disposal" | "DoubleOven" | "DownDraft" | "Dryer" | "ElectricCooking" | "ElectricCooktop" | "ElectricDryer" | "ElectricOven" | "ElectricRange" | "ElectricWaterHeater" | "EnergyStarQualifiedAppliances" | "EnergyStarQualifiedDishwasher" | "EnergyStarQualifiedDryer" | "EnergyStarQualifiedFreezer" | "EnergyStarQualifiedRefrigerator" | "EnergyStarQualifiedWasher" | "EnergyStarQualifiedWaterHeater" | "ExhaustFan" | "FreeStanding" | "FreeStandingElectricOven" | "FreeStandingElectricRange" | "FreeStandingFreezer" | "FreeStandingGasOven" | "FreeStandingGasRange" | "FreeStandingRange" | "FreeStandingRefrigerator" | "Freezer" | "GasCooking" | "GasCooktop" | "GasDryer" | "GasGrillConnection" | "GasOven" | "GasRange" | "GasWaterHeater" | "GeothermalWaterHeater" | "HeatPumpWaterHeater" | "Heater" | "HighEfficiencyWaterHeater" | "HotWaterCirculator" | "Humidifier" | "IceMaker" | "IndoorGrill" | "InductionCooktop" | "InstantHotWater" | "Microwave" | "MicrowaveHoodFan" | "MultipleDishwashers" | "MultipleRefrigerators" | "MultipleWaterHeaters" | "NoHotWater" | "None" | "OilWaterHeater" | "Other" | "Oven" | "PlumbedForGas" | "PlumbedForIceMaker" | "PortableAirConditioningUnits" | "PortableDishwasher" | "PotFiller" | "PropaneCooking" | "PropaneCooktop" | "PropaneOven" | "PropaneRange" | "PropaneWaterHeater" | "Range" | "RangeHood" | "Refrigerator" | "RefrigeratorWithIceMaker" | "SeeRemarks" | "SelfCleaningOven" | "SeparateIceMachine" | "SixBurnerStove" | "SmartAppliances" | "SmoothCooktop" | "SolarHotWater" | "SomeCommercialGrade" | "SomeElectricAppliances" | "SomeGasAppliances" | "SomePropaneAppliances" | "StainlessSteelAppliances" | "Stove" | "SumpPump" | "TanklessWaterHeater" | "TrashCompactor" | "VentedExhaustFan" | "WalkInCooler" | "WallWindowAirConditioner" | "WarmingDrawer" | "Washer" | "WasherDryer" | "WasherDryerAllInOne" | "WasherDryerAllowed" | "WasherDryerStacked" | "WaterHeater" | "WaterHeaterOwned" | "WaterHeaterRented" | "WaterPurifier" | "WaterPurifierOwned" | "WaterPurifierRented" | "WaterSoftener" | "WaterSoftenerOwned" | "WaterSoftenerRented" | "WaterToRefrigerator" | "WineCooler" | "WineRefrigerator" | "WoodWaterHeater";

/** 135 members · $metadata EnumType ArchitecturalStyle */
export type CotalityEnum_ArchitecturalStyle = "AFrame" | "Acadian" | "Airlite" | "ArtDeco" | "ArtNouveau" | "Backsplit" | "Barndominium" | "BeauxArts" | "Berm" | "BiLevel" | "Brutalist" | "Bungalow" | "BungalowRaised" | "Cabin" | "Camelback" | "Camp" | "CapeCod" | "CastIron" | "ChaletAlpine" | "Charleston" | "ClusterHome" | "CoachCarriage" | "Coastal" | "Colonial" | "CommonEntryBuilding" | "Contemporary" | "ContemporaryModern" | "Conventional" | "Cottage" | "Country" | "Courtyard" | "Craftsman" | "Creole" | "Custom" | "Dallas" | "Detached" | "Dome" | "Duplex" | "DutchColonial" | "EarlyAmerican" | "English" | "European" | "Farmhouse" | "Federal" | "Flat" | "Florida" | "Fourplex" | "FrenchProvincial" | "GambrelBarn" | "GarageApartment" | "GardenApartment" | "GardenHome" | "GarrisonFrontier" | "Georgian" | "GothicRevival" | "GreekRevival" | "HighRise" | "HillCountry" | "HistoricAntique" | "HouseWithCottage" | "International" | "Italianate" | "Loft" | "LogHome" | "LowRise" | "Mansion" | "ManufacturedHome" | "Mediterranean" | "MidCenturyModern" | "MidEntry" | "MidRise" | "MobileHome" | "Modern" | "ModularPrefab" | "Monterey" | "Mountain" | "MultiFamily" | "MultiLevel" | "Multiplex" | "National" | "Neoclassical" | "NewEngland" | "None" | "NorthernNewMexico" | "OneAndOneHalfStory" | "OneStory" | "Other" | "PatioHome" | "Penthouse" | "PostAndBeam" | "Prairie" | "Prewar" | "Pueblo" | "QueenAnne" | "RaisedBeach" | "RaisedRanch" | "Ranch" | "Regency" | "Reverse" | "Romanesque" | "RowHouse" | "Rustic" | "Saltbox" | "SecondEmpire" | "SeeRemarks" | "Shingle" | "Shotgun" | "SideBySide" | "Sidesplit" | "Southwestern" | "Spanish" | "SpanishMediterranean" | "SplitFoyer" | "SplitLevel" | "SquareDesign" | "Stacked" | "Stick" | "Stilt" | "StraightThru" | "Studio" | "Territorial" | "ThreeStory" | "TimberFrame" | "Traditional" | "Transitional" | "TriLevel" | "Triplex" | "Tudor" | "TwinHome" | "TwoAndOneHalfStory" | "TwoStory" | "TwoUnitCondo" | "Victorian" | "WalkUp" | "Williamsburg";

/** 137 members · $metadata EnumType AssociationAmenities */
export type CotalityEnum_AssociationAmenities = "AdjacentWater" | "AirportRunway" | "Barbecue" | "BasketballCourt" | "BeachAccess" | "BeachRights" | "BikeStorage" | "BilliardRoom" | "Billiards" | "BoatDock" | "BoatHouse" | "BoatRamp" | "BoatSlip" | "Boating" | "BocceCourt" | "BuildingRoofDeck" | "BusinessCenter" | "Cabana" | "CableTv" | "CallForRules" | "Campground" | "CarWashArea" | "Clubhouse" | "CoinLaundry" | "CommonGrounds" | "CommunityKitchen" | "Concierge" | "ControlledAccess" | "CountryClub" | "DayCare" | "Dock" | "DogPark" | "DryDock" | "DuesPaidAnnually" | "DuesPaidMonthly" | "DuesPaidQuarterly" | "DuesPaidSemiAnnually" | "Electricity" | "Elevators" | "ExerciseCourse" | "FirePit" | "FitnessCenter" | "FoodServices" | "GameCourtExterior" | "GameCourtInterior" | "GameRoom" | "GardenArea" | "Gas" | "Gated" | "Gazebo" | "GolfCourse" | "Guard" | "GuestSuites" | "HobbyRoom" | "HorseTrails" | "HotWater" | "IndoorPool" | "Insurance" | "JoggingPath" | "Kennel" | "LakeOrPond" | "Landscaping" | "Laundry" | "Library" | "MaidService" | "Maintenance" | "MaintenanceFrontYard" | "MaintenanceGrounds" | "MaintenanceStructure" | "Management" | "ManagementFees" | "Marina" | "MediaRoom" | "MedicalCareService" | "MedicalFacility" | "MeetingBanquetPartyRoom" | "MeetingRoom" | "None" | "Other" | "OtherCourts" | "OutdoorCookingArea" | "OwnerAllowedGolfCart" | "OwnerAllowedMotorcycle" | "PaddleTennis" | "Park" | "Parking" | "PartyRoom" | "PetRestrictions" | "PetsAllowed" | "PetsNotAllowed" | "Pickleball" | "PicnicArea" | "Pier" | "Playground" | "PondSeasonal" | "PondYearRound" | "Pool" | "PoweredBoatsAllowed" | "PrivateMembership" | "PuttingGreens" | "Racquetball" | "RecreationFacilities" | "RecreationRoom" | "Restaurant" | "RoofDeck" | "RvBoatStorage" | "RvParking" | "SatelliteTv" | "Sauna" | "SchoolBusStop" | "Security" | "SeeRemarks" | "ServiceElevators" | "ShuffleboardCourt" | "Sidewalks" | "SkiAccessible" | "SkiInSkiOut" | "SkiStorage" | "SnowRemoval" | "SpaHotTub" | "SportCourt" | "SportsFields" | "Stables" | "Storage" | "StreamSeasonal" | "StreamYearRound" | "Taxes" | "TenantAllowedGolfCart" | "TenantAllowedMotorcycle" | "TennisCourts" | "Trails" | "TransportationService" | "Trash" | "Utilities" | "VehicleWashArea" | "Water" | "WorkshopArea";

/** 63 members · $metadata EnumType AssociationFeeIncludes */
export type CotalityEnum_AssociationFeeIncludes = "AirConditioning" | "AllFacilities" | "Amenities" | "AssociationManagement" | "BoatRamp" | "CableTv" | "Caretaker" | "Clubhouse" | "CommonAreaElectricity" | "CommonAreaInsurance" | "CommonAreaMaintenance" | "CommonAreas" | "DockReserve" | "EarthquakeInsurance" | "Electricity" | "Fencing" | "FishingRights" | "FitnessFacility" | "FloodInsurance" | "Gas" | "Golf" | "Heat" | "HighSpeedInternet" | "HotWater" | "Hvac" | "Insurance" | "Internet" | "IrrigationWater" | "Laundry" | "LegalAccounting" | "MaintenanceGrounds" | "MaintenanceStructure" | "None" | "Other" | "Parking" | "PartialAmenities" | "PartialUtilities" | "PestControl" | "Phone" | "Playground" | "Pools" | "Receptionist" | "RecreationFacilities" | "Recycling" | "ReserveFund" | "RoadMaintenance" | "Roof" | "Security" | "SeeAgent" | "SeeRemarks" | "Sewer" | "SharedAmenities" | "SnowRemoval" | "SpecialAssessment" | "Sprinkler" | "StreetLights" | "Taxes" | "TennisCourts" | "Trash" | "Utilities" | "Valet" | "Water" | "WaterAccess";

/** 23 members · $metadata EnumType ExistingLeaseType */
export type CotalityEnum_ExistingLeaseType = "AbsoluteNet" | "BaseAndPercentage" | "CpiAdjustment" | "DepositRequired" | "EscalationClause" | "Fixed" | "FullService" | "Gross" | "GroundLease" | "IndustrialGross" | "Modified" | "ModifiedGross" | "Net" | "Nn" | "Nnn" | "None" | "NotForLease" | "Oral" | "Other" | "Percentage" | "SeeAgent" | "SeeRemarks" | "Sublease";

/** 43 members · $metadata EnumType Basement */
export type CotalityEnum_Basement = "Apartment" | "BathStubbed" | "Bathroom" | "Bedroom" | "Block" | "CommonBasement" | "Concrete" | "CrawlSpace" | "Daylight" | "DirtFloor" | "DrainTiled" | "DrivewayAccess" | "EgressWindows" | "Encapsulated" | "ExteriorEntry" | "Finished" | "FoyerFinished" | "FrenchDrain" | "Full" | "FullExposure" | "GarageAccess" | "GardenLevel" | "HatchwayAccess" | "Heated" | "InteriorEntry" | "Kitchen" | "NoExposure" | "None" | "Other" | "Partial" | "PartialExposure" | "PartiallyFinished" | "Private" | "RecFamilyArea" | "SeeRemarks" | "SeparateEntrance" | "SleepingArea" | "StorageSpace" | "SumpPump" | "Unfinished" | "Utility" | "WalkOutAccess" | "WalkUpAccess";

/** 7 members · $metadata EnumType BodyType */
export type CotalityEnum_BodyType = "DoubleWide" | "Expando" | "Other" | "QuadWide" | "SeeRemarks" | "SingleWide" | "TripleWide";

/** 123 members · $metadata EnumType BuildingFeatures */
export type CotalityEnum_BuildingFeatures = "AlleyLoading" | "Appliances" | "BasketballCourt" | "BikeStorage" | "BilliardRoom" | "BowlingAlley" | "Cafeteria" | "CarWashArea" | "CleaningService" | "ClearSpan" | "ClubhouseOrPartyRoom" | "ColdPlungePool" | "ColdStorage" | "CommonDiningRoom" | "CommonLibrary" | "CommonLounge" | "CommonPlayroom" | "CompactedYard" | "CompressedAirLines" | "ComputerArea" | "Concierge" | "ConferenceRoom" | "Conveyor" | "Coolers" | "Coworkspace" | "DangerousGoodsStorage" | "DayCareFacility" | "DeliveryDoor" | "DockGradeLoading" | "DockLevelers" | "DogCare" | "DogPark" | "DogRun" | "DoorSign" | "DriveInDoors" | "DryCleaningService" | "Dumpster" | "ElectricCarChargingStation" | "Elevators" | "EmergencyLighting" | "Escalators" | "EventSuite" | "ExerciseCourse" | "ExhaustSystem" | "ExteriorLighting" | "FitnessCenter" | "FloorDrains" | "FoodServices" | "Fountain" | "Freezers" | "FreightElevator" | "GameRoom" | "GolfSimulatorRoom" | "GradeLevelLoading" | "GreenBuilding" | "GuestSuites" | "HandicapAccess" | "HealthClub" | "IndoorPool" | "JanitorialService" | "KitchenFacilities" | "LaundryDropOffService" | "LaundryFacility" | "LivingArea" | "LoadingDock" | "Lockers" | "Lunchroom" | "Maintenance" | "Management" | "MeetingRooms" | "Mezzanine" | "MultiTenant" | "NoElevators" | "NoLoading" | "NotApplicable" | "OffStreetLoading" | "Office" | "OnSiteManagement" | "Other" | "OverheadCrane" | "OverheadDoors" | "PackageDeliveryLocker" | "PackageRoom" | "Parking" | "PavedYard" | "PhoneSystem" | "PilatesStudio" | "PoleSign" | "PrivateRestrooms" | "PublicRestrooms" | "Racquetball" | "RailService" | "RailroadSiding" | "ReceptionArea" | "RecreationRoom" | "RentalSuite" | "Restaurant" | "RoofSign" | "Sauna" | "ScreeningRoom" | "SeeRemarks" | "Shelving" | "Showers" | "Showroom" | "ShuffleboardCourt" | "Signs" | "SignsExcluded" | "SignsLeased" | "SignsNotPermitted" | "SignsOwned" | "SignsPermitted" | "SingleTenant" | "SpaHotTub" | "SportCourt" | "SteamRoom" | "Storage" | "Storefront" | "TennisCourts" | "TvAntenna" | "TvSystem" | "WiFi" | "WorkshopArea" | "YogaStudio";

/** 139 members · $metadata EnumType BusinessType */
export type CotalityEnum_BusinessType = "Accounting" | "AdministrativeAndSupport" | "AdultFamilyHome" | "Advertising" | "Agriculture" | "AnimalGrooming" | "Antiques" | "Appliances" | "AquariumSupplies" | "ArtsAndEntertainment" | "Athletic" | "AutoBody" | "AutoDealer" | "AutoGlass" | "AutoParts" | "AutoRentLease" | "AutoRepairSpecialty" | "AutoService" | "AutoStereoAlarm" | "AutoTires" | "AutoWrecking" | "Bakery" | "BarTavernLounge" | "BarberBeauty" | "BedAndBreakfast" | "BooksCardsStationary" | "BowlingAlley" | "BuildToSuit" | "Butcher" | "Cabinets" | "Cafe" | "CandyCookie" | "Cannabis" | "CarParkGarages" | "CarWash" | "CareHome" | "CarpetTile" | "Casino" | "ChildCare" | "Church" | "Clothing" | "Commercial" | "Computer" | "Condominium" | "ConstructionContractor" | "Convalescent" | "ConvenienceStore" | "DanceStudio" | "Decorator" | "DeliCatering" | "Dental" | "Distribution" | "Doughnut" | "Drugstore" | "DryCleaner" | "EducationSchool" | "Electronics" | "Employment" | "Farm" | "FastFood" | "Financial" | "Fitness" | "FloristNursery" | "FoodAndBeverage" | "ForestReserve" | "Franchise" | "FuneralHome" | "Furniture" | "GasStation" | "GiftShop" | "Government" | "GravelPit" | "Grocery" | "Hardware" | "HealthFood" | "HealthServices" | "Hobby" | "HomeCleaner" | "Hospitality" | "HotelMotel" | "IceCreamFrozenYogurt" | "Industrial" | "Institutional" | "Jewelry" | "Landscaping" | "Laundromat" | "LiquorStore" | "LiveWork" | "Locksmith" | "Manufacturing" | "Marina" | "Medical" | "Mixed" | "MobileTrailerPark" | "MultiTenant" | "Music" | "NursingHome" | "OfficeSupply" | "Other" | "Pads" | "Paints" | "Parking" | "PetBoarding" | "PetStore" | "Photographer" | "Pizza" | "Printing" | "ProfessionalOffice" | "ProfessionalService" | "Ranch" | "RealEstate" | "Recreation" | "Recycling" | "RegionalCenter" | "Rental" | "Residential" | "Restaurant" | "Retail" | "SaddleryHarness" | "SeeRemarks" | "Showroom" | "SingleTenant" | "SpecialUse" | "SportingGoods" | "StandAlone" | "Storage" | "StripMall" | "Technology" | "Toys" | "Transportation" | "Travel" | "Upholstery" | "Utility" | "Variety" | "Video" | "Wallpaper" | "Warehouse" | "Weddings" | "Wholesale";

/** 27 members · $metadata EnumType BuyerAgentDesignation */
export type CotalityEnum_BuyerAgentDesignation = "AccreditedBuyersRepresentative" | "AccreditedLandConsultant" | "AtHomeWithDiversity" | "CertifiedCommercialInvestmentMember" | "CertifiedDistressedPropertyExpert" | "CertifiedInternationalPropertySpecialist" | "CertifiedPropertyManager" | "CertifiedRealEstateBrokerageManager" | "CertifiedRealEstateTeamSpecialist" | "CertifiedResidentialSpecialist" | "CounselorOfRealEstate" | "GeneralAccreditedAppraiser" | "GraduateRealtorInstitute" | "MilitaryRelocationProfessional" | "NARsGreenDesignation" | "PerformanceManagementNetwork" | "PricingStrategyAdvisor" | "RealEstateNegotiationExpert" | "RealtorAssociationCertifiedExecutive" | "ResidentialAccreditedAppraiser" | "ResortAndSecondHomePropertySpecialist" | "SellerRepresentativeSpecialist" | "SeniorsRealEstateSpecialist" | "ShortSalesAndForeclosureResource" | "SocietyOfIndustrialAndOfficeRealtors" | "TransnationalReferralCertification" | "ePRO";

/** 5 members · $metadata EnumType CompensationType */
export type CotalityEnum_CompensationType = "Dollars" | "Mx" | "Other" | "Percent" | "SeeRemarks";

/** 42 members · $metadata EnumType BuyerFinancing */
export type CotalityEnum_BuyerFinancing = "Arm" | "Assumed" | "BondForDeed" | "BuyerAssistanceProgram" | "CalVetLoan" | "Cash" | "CashToLoan" | "CashToNewLoan" | "CashToSecondLoan" | "CommittedFunds" | "Contract" | "Conventional" | "CourtApproval" | "Cryptocurrency" | "Exchange1031" | "FederalLandBank" | "Fha" | "Fha203b" | "Fha203k" | "Fhva" | "Fmha" | "GraduatedPaymentMortgage" | "Lease" | "LenderApproval" | "NotDisclosed" | "Other" | "PortfolioLoan" | "Private" | "RehabFinancing" | "RelocationProperty" | "SbaTypeLoan" | "SeeAgent" | "SeeRemarks" | "SellerFinancing" | "TexasVet" | "Trade" | "TrustConveyance" | "TrustDeed" | "Usda" | "Va" | "WrapAround" | "ZeroDown";

/** 1127 members · Lookup catalogue for Property.CoBuyerOfficeAOR (EnumType AOR declares 1110; the Lookup publishes 1127) */
export type CotalityLookup_Property_CoBuyerOfficeAOR = "AberdeenAreaAssociationOfRealtors" | "AbileneAssociationOfRealtors" | "AckAssociationOfRealtors" | "AdaCountyAssociationOfRealtors" | "AdirondackChamplainValleyRealtors" | "AikenAssociationOfRealtors" | "AkronClevelandAssociationOfRealtors" | "AlamanceMlsInc" | "Alameda" | "AlaskaMls" | "AlbemarleAreaAssociationOfRealtors" | "AlbertaRealEstateAssociation" | "AlbertaWestRealtorsAssociation" | "AlbuquerqueBoardOfRealtors" | "AliceBoardOfRealtors" | "AltitudeRealtors" | "Amador" | "AmarilloAssociationOfRealtors" | "AmeliaIslandNassauCountyAssocOfRealtorsInc" | "AnnArborAreaBoardOfRealtors" | "AnneArundelCountyAssociationOfRealtors" | "AntelopeValley" | "AntrimCharlevoixKalkaskaAssociationOfRealtors" | "ApexMls" | "Arcadia" | "ArizonaRegionalMultipleListingService" | "ArkansasRealtorsAssociation" | "ArkansasRegionalMlsLlc" | "ArkansasValleyBoardOfRealtors" | "ArlingtonBoardOfRealtors" | "ArtesiaBoardOfRealtors" | "AsheboroRandolphBoardOfRealtors" | "AshevilleBoardOfRealtors" | "AshtabulaCountyRealtors" | "AspenBoardOfRealtors" | "AspenGlenwoodMls" | "AspireNorthRealtors" | "AssociationOfInteriorRealtors" | "AssociationOfReginaRealtors" | "AssociationOfSaskatchewanRealtors" | "Atascadero" | "AthensAreaAssociationOfRealtors" | "AthensLimestoneAssociationOfRealtors" | "AtlantaBoardOfRealtors" | "AtlantaCommercialBoardOfRealtors" | "AtlanticCityAndCountyBoardOfRealtors" | "AuroraAssociationOfRealtors" | "AustinBoardOfRealtors" | "AveryWataugaAssociationOfRealtors" | "BadlandsBoardOfRealtors" | "BagnellDamAssociationOfRealtors" | "BaldwinRealtors" | "BancroftAndAreaAssociationOfRealtors" | "Baries" | "BarrieAndDistrictAssociationOfRealtors" | "BarryEatonBoardOfRealtors" | "Bartow" | "BastropAssociationOfRealtors" | "BatesvilleBoardOfRealtors" | "BattleCreekAreaAssociationOfRealtors" | "BayAreaAssociationofREALTORS" | "BayCountyRealtorAssociation" | "BayEast" | "BayouBoardOfRealtors" | "BcNorthernRealEstateBoard" | "BeachesMls" | "BeachesmlsFlexmls" | "BeachesmlsMatrix" | "BeaumontBoardOfRealtorsInc" | "BeaverCreekAreaAssociationOfRealtors" | "BeckleyBoardOfRealtors" | "BemidjiBoardOfRealtors" | "Berkeley" | "BerkshireCountyBoardOfRealtors" | "BeverlyHillsGreaterLa" | "BigBearAssociationOfRealtors" | "BigSkyCountryMls" | "BillingsAssociationOfRealtors" | "BirminghamAssociationOfRealtors" | "BismarkMandanBoardOfRealtors" | "BitterrootValleyBoardOfRealtors" | "BlackHillsAssociationofREALTORS" | "BlueRidgeAssociationOfRealtors" | "BlueRiverAreaBoardOfRealtors" | "BoiseRegionalRealtors" | "BoloRealtors" | "BonitaSprings" | "BootheelRegionalBoardOfRealtors" | "BoulderAreaRealtorsAssociation" | "BramptonRealEstateBoard" | "BranchCountyAssociationOfRealtors" | "BrandonAreaRealtors" | "BrantfordRegionalRealEstateAssociationInc" | "BrazoriaCountyBoardOfRealtors" | "BrevardBoardOfRealtors" | "BridgeAssociationOfRealtors" | "Bridgemls" | "Bridgeport" | "BrightMls" | "BristolTennesseeVirginiaAssociationOfRealtors" | "BritishColumbiaRealEstateAssociation" | "BrooklynNewYorkMls" | "BrownsvilleSouthPadreIslandBoardOfRealtors" | "BrownwoodBoardOfRealtorsInc" | "BrunswickCountyBoardOfRealtors" | "BryanCollegeStationRegionalAor" | "BucksCountyAssociationOfRealtors" | "Buffalo" | "BuffaloNiagaraAssociationOfRealtorsInc" | "Burbank" | "BurkeCountyBoardOfRealtorsInc" | "BurlingtonAlamanceCountyAssociationOfRealtors" | "CalaverasCountyAssociationOfRealtors" | "CaldwellBoardOfRealtors" | "CalgaryRealEstateBoard" | "CaliforniaDesert" | "CaliforniaRegionalMls" | "CambriaSomersetAssociationOfRealtors" | "CambridgeAssociationOfRealtorsInc" | "CanopyMls" | "CapeCodAndIslandsAssociationOfRealtors" | "CapeFearRealtors" | "CapeMayCountyAssociationOfRealtors" | "CapitalAreaAssociationOfRealtors" | "CarbonCountyBoardOfRealtors" | "CarlisleBoardOfRealtors" | "CarlsbadBoardOfRealtors" | "CarolinaMls" | "CarolinasSmokiesAssociationOfRealtors" | "CarpetCapitalAssociationOfRealtors" | "CarrollCountyAssociationofREALTORS" | "CarteretCountyAssociationOfRealtorsInc" | "CascadesEastAssociationOfRealtors" | "CatawbaValleyAssociationOfRealtors" | "CecilCountyBoardofREALTORS" | "CedarRapidsAreaAssociationOfRealtors" | "CentralAlbertaRealtorsAssociation" | "CentralArizonaAssociationOfRealtors" | "CentralCarolinaAssociationOfRealtors" | "CentralGeorgiaMLS" | "CentralHillCountryBoardOfRealtorsInc" | "CentralIllinoisBoardOfRealtors" | "CentralJerseyMls" | "CentralLakesAssociationOfRealtors" | "CentralMichiganAssociationOfRealtors" | "CentralMississippiRealtors" | "CentralOregonAssociationOfRealtors" | "CentralOzarksBoardOfRealtorsAssociation" | "CentralPanhandleAssociationOfRealtors" | "CentralPasco" | "CentralTexasCcimChapter" | "CentralTexasCommercialAssociationOfRealtors" | "CentralTexasMls" | "CentralValley" | "CentralVirginiaRegionalMls" | "CentralWestTennesseeAssociationOfRealtors" | "CentralWisconsinBoardOfRealtors" | "CentralizedRealEstateInfo" | "CentreCountyAssociationofREALTORS" | "ChapelHillBoardOfRealtorsInc" | "Char" | "CharlestonTridentAssociationOfRealtors" | "CharlotteRegionalRealtorAssociationInc" | "CharlottesvilleAreaAssociationOfRealtors" | "ChathamKentAssociationOfRealtors" | "ChautauquaCattaraugus" | "CherokeeAssociationOfRealtors" | "CherokeeCountyBoardOfRealtors" | "ChesapeakeBayAndRiversAssociationOfRealtors" | "ChesapeakeBayAreaMls" | "CheyenneBoardOfRealtors" | "ChicagoAssociationOfRealtorsInc" | "ChilliwackAndDistrictRealEstateBoard" | "ChsRegionalMls" | "CitrusValley" | "CitrusValleyAssociationOfRealtors" | "ClareGladwinBoardOfRealtors" | "ClatsopAssociationofREALTORS" | "Claw" | "CleburneCountyBoardOfRealtors" | "ClevelandCountyAssociationOfRealtors" | "ClovisPortalesAssociationOfRealtors" | "CoastalAssociationofREALTORS" | "CoastalCarolinasAssociationOfRealtors" | "CoastalMendocino" | "CoastalPlainsAssociationOfRealtors" | "CobbAssociationOfRealtors" | "CochraneAndTimiskamingDistrictsAssociationOfRealtors" | "CoeurDaleneRegionalRealtors" | "ColinCountyAssociationOfRealtors" | "CollinCountyAssociationOfRealtorsInc" | "ColoradoAssociationOfRealtors" | "ColumbiaBoardOfRealtors" | "ColumbiaGreeneBoardOfRealtors" | "ColumbusBoardOfRealtors" | "ColumbusandCentralOhioRegionalMLS" | "CombinedLosAngelesWestsideMls" | "CommercialAllianceOfRealtors" | "CommercialAssociationOfRealtorsOfNewMexico" | "CommercialBoard" | "CommercialInformationExchange" | "Conejo" | "ContraCosta" | "ConwayAndPerryCountyRealtorsAssociation" | "CookeCountyBoardOfRealtors" | "CooperativeArkansasRealtors" | "CornerstoneAssociationOfRealtors" | "CornwallAndDistrictRealEstateBoard" | "CorpusChristi" | "Cortland" | "CoshoctonCountyBoardOfRealtors" | "CraigAssociationOfRealtors" | "CrenMls" | "Crisnet" | "CumberlandCountyBoardOfRealtors" | "Darien" | "DaytonAreaBoardOfRealtors" | "DaytonaBeachAreaAssociationOfRealtors" | "DearbornAreaBoardOfRealtors" | "DekalbBoardOfRealtorsInc" | "DelRioBoardOfRealtors" | "Delta" | "DeltaAssociationOfRealtors" | "DeltaCountyBoardOfRealtors" | "DemingLunaCountyBoardOfRealtors" | "DenverBoardOfRealtors" | "DenverMetroAssocOfRealtors" | "DenverMetroCommAssocRealtor" | "DesMoinesAreaAssociationOfRealtors" | "DesertCommunities" | "DesertMls" | "Desoto" | "DetroitAssociationOfRealtors" | "DixieGilchristLevyAssociationofREALTORS" | "DoorCountyBoardOfRealtors" | "DownRiverAssociationOfRealtors" | "Downey" | "DullesAreaAssociationOfRealtors" | "DuluthAreaAssociationOfRealtors" | "DurangoAreaAssociationOfRealtors" | "DurhamAssociationOfRealtors" | "DurhamRegionAssociationOfRealtors" | "EastAlabamaBoardOfRealtors" | "EastBayRecip" | "EastBayRegionalDataMls" | "EastCentralAssociationOfRealtors" | "EastPasco" | "EastPolk" | "EastTennesseeRealtors" | "EastValley" | "EastValleyRedlands" | "EastValleyYucaipa" | "EasternCt" | "EasternPanhandleBoardofREALTORS" | "EasternThumbAssociationOfRealtors" | "EasternUpperPeninsulaAssociationOfRealtors" | "EgyptianBoardOfRealtors" | "ElDoradoBoardOfRealtors" | "ElPasoAssociationOfRealtors" | "ElkinsRandolphBoardOfRealtors" | "ElkoCountyAssociationOfRealtors" | "EllisHillAssociationOfRealtors" | "ElmiraCorningRegionalAssociationOfRealtors" | "EmeraldCoastAssociationOfRealtors" | "EmmetAssociationOfRealtors" | "Englewood" | "EstesParkBoardOfRealtors" | "FairmontBoardOfRealtors" | "FargoMoorheadAreaAssociationOfRealtors" | "FaulknerCountyBoardOfRealtors" | "FayettevilleAssociationOfRealtorsInc" | "FirelandsAssociationOfRealtors" | "FirstMls" | "FivePointsBoardOfRealtors" | "Flagler" | "FlaglerCountyAssociationOfRealtors" | "FlintHillsAssociationOfRealtors" | "FloridaGulfCoast" | "FloridaKeysBoardOfRealtors" | "FoothillsRealtorAssociationOfNorthCarolina" | "ForgottenCoastRealtorAssociation" | "FortCollinsBoardOfRealtors" | "FortHoodAreaAssociationOfRealtors" | "FortMcmurrayRealEstateBoard" | "FortSmithBoardOfRealtors" | "FourCornersBoardOfRealtors" | "FourRiversAssociationOfRealtors" | "FranklinBoardOfRealtors" | "FranklinCountyBoardOfRealtors" | "FraserValleyRealEstateBoard" | "FrederickCountyAssociationofREALTORS" | "FredericksburgAreaAssociationOfRealtors" | "FremontBoardOfRealtors" | "Fresno" | "FresnoMultipleListingService" | "FtLauderdale" | "GainesvilleAlachua" | "GallatinAssociationOfRealtors" | "GallupBoardOfRealtors" | "GalvestonAssociationOfRealtors" | "GardenCityMls" | "GardenStateMls" | "GastonAssociationOfRealtors" | "GeorgiaMls" | "GeorgiaUpstateLakesBoardOfRealtors" | "Glendale" | "GlendaleWestMaricopaBoardOfRealtorsInc" | "GlenwoodSpringsAssociationRealtors" | "GlobalMls" | "GloucesterSalemCountiesBoardOfRealtors" | "GoldenEmpireMLSBakersfield" | "GoldenIslesAssociationOfRealtors" | "GoldsboroWayneCountyAssociationOfRealtors" | "GranburyAssociationOfRealtors" | "GrandCountyBoardOfRealtors" | "GrandForksAreaAssociationOfRealtors" | "GrandIslandBoardOfRealtors" | "GrandJunctionRealtorAssociation" | "GrandPrairieBoardOfRealtors" | "GrandRapidsAssociationOfRealtors" | "GrandePrairieAndAreaAssociationOfRealtors" | "GreatFallsAssociationOfRealtors" | "GreatNorthMls" | "GreatPlainsRegionalMls" | "GreatSmokyMountainsAssociationOfRealtors" | "GreaterAlabamaMls" | "GreaterAlbuquerqueAssociationOfRealtors" | "GreaterAlexandriaAreaAssociationOfRealtors" | "GreaterAntelopeValleyAssociationOfRealtors" | "GreaterAugustaAssociationOfRealtorsInc" | "GreaterBaltimoreBoardOfRealtors" | "GreaterBatonRougeAssociationOfRealtors" | "GreaterBergenRealtors" | "GreaterBinghamtonAssociationOfRealtors" | "GreaterBostonRealEstateBoard" | "GreaterCapitalAreaAssociationOfRealtors" | "GreaterCapitalAssociationOfRealtorsInc" | "GreaterCentralBoardOfRealtors" | "GreaterCentralLouisianaRealtorsAssociation" | "GreaterChattanoogaMls" | "GreaterChattanoogaRealtors" | "GreaterColumbiaAssociationOfRealtorsInc" | "GreaterDentonWiseAssociationOfRealtors" | "GreaterElPasoAssociationOfRealtors" | "GreaterErieBoardOfRealtors" | "GreaterFairbanksBoardOfRealtors" | "GreaterFairfield" | "GreaterFortPolkAreaRealtors" | "GreaterFortWorthAssociationOfRealtors" | "GreaterFtLauderdaleRealtors" | "GreaterGatewayAssociationOfRealtors" | "GreaterGoldenTriangleRealtors" | "GreaterGreenvilleAssocOfRealtors" | "GreaterHarrisburgAssociationOfRealtors" | "GreaterHartford" | "GreaterHartfordAssociationOfRealtorsrInc" | "GreaterKalamazooAssociationOfRealtors" | "GreaterLakesAssociationOfRealtors" | "GreaterLansingAssociationOfRealtors" | "GreaterLasVegasAssociationOfRealtorsInc" | "GreaterLewisvilleAssociationOfRealtors" | "GreaterLouisvilleAssociationOfRealtors" | "GreaterMcallenAssociationOfRealtors" | "GreaterMetroWestAssociationRealtorsInc" | "GreaterMetropolitanAssociationOfRealtors" | "GreaterNashvilleAssociationOfRealtorsInc" | "GreaterNewHavenAssociationOfRealtorsInc" | "GreaterNewMilford" | "GreaterOwensboroREALTORAssociation" | "GreaterPhiladelphiaAssociationOfRealtors" | "GreaterPiedmontRealtors" | "GreaterRegionalAllianceOfRealtors" | "GreaterRochesterAssociationOfRealtorsInc" | "GreaterScrantonBoardOfRealtors" | "GreaterShiawasseeAssociationOfRealtors" | "GreaterSiouxCityBoardOfRealtors" | "GreaterSouthernMls" | "GreaterSpringfieldBoardOfRealtors" | "GreaterTampaAssociationOfRealtors" | "GreaterTexomaAssociationOfRealtors" | "GreaterTulsaAssociationOfRealtors" | "GreaterTylerAssociationOfRealtorsInc" | "GreaterUnionCountyAssociationOfRealtors" | "GreaterVancouverRealtors" | "GreaterWaterbury" | "GreeleyAreaRealtorAssociation" | "GreenValleySahuaritaAssociationOfRealtors" | "GreenbrierValleyBoardOfRealtors" | "GreensboroRegionalRealtorsAssociation" | "GreenwichBoardOfRealtors" | "GreenwoodAssociationOfRealtors" | "GreersFerryLakeAreaBoardOfRealtors" | "GrossePointeBoardOfRealtors" | "GuelphAndDistrictAssociationOfRealtors" | "GuernseyMuskingumValleyAssociationOfRealtors" | "GulfCoastAssociationOfRealtors" | "GulfCoastMls" | "GulfSouthRealEstateInformationNetworkInc" | "GunnisonCountryAssociationRealtors" | "GunnisonCrestedButteAssociationOfRealtors" | "HamptonRoadsRealtorsAssociationInc" | "HarfordCountyAssociationofREALTORS" | "HarlingenBoardOfRealtors" | "HarrisonCountyAssociationOfRealtors" | "HarrisonDistrictBoardOfRealtors" | "HarrisonburgRockinghamAreaAssociationOfRealtors" | "HattiesburgAreaAssociationOfRealtors" | "HawaiiInformationService" | "HaywoodCountyBoardOfRealtors" | "HeartOfIowaRegionalBoardOfRealtors" | "Heartland" | "HeartlandAssociationOfRealtors" | "HeartofKentuckyAssociationofREALTORS" | "HelenaAssociationOfRealtors" | "HemetSanJacinto" | "HendersonCountyBoardOfRealtors" | "HendersonvilleBoardOfRealtors" | "HerefordBoardOfRealtors" | "HernandoCountyAssociationOfRealtors" | "HgarHudsonGatewayAssociationOfRealtors" | "HiCentral" | "HighCountryAssociationOfRealtorsInc" | "HighDesert" | "HighPlainsAssociationOfRealtors" | "HighPointRegionalAssocOfRealtorsInc" | "HighlandLakesAssociationOfRealtors" | "HighlandsCashiersBoardOfRealtors" | "HillsdaleCountyBoardOfRealtors" | "HiltonHeadAreaAssociationOfRealtors" | "HiltonHeadIsland" | "HinesvilleAreaBoardOfRealtors" | "HiveMls" | "HobbsAssociationOfRealtors" | "HopkinsvilleChristianAndToddCountyAor" | "HotSpringsBoardOfRealtors" | "HoustonAssociationOfRealtors" | "HowardCountyAssociationofREALTORS" | "HudsonValleyCatskillsRegionMls" | "HumboldtAssociationOfRealtors" | "HunterdonSomersetAssociationOfRealtors" | "HuntingtonBoardOfRealtors" | "HuntsvilleAreaAssociationOfRealtorsInc" | "HuronPerthAssociationOfRealtors" | "ITech" | "ImagineMLS" | "InclineVillageBoardOfRealtors" | "IndianRiver" | "InformationAndRealEstateServices" | "Inglewood" | "InlandValleys" | "IntermountainMls" | "IowaCityAreaAssociationofREALTORS" | "IowaRealty" | "IrvingLasColinasAssociationOfRealtors" | "ItascaCountyBoardOfRealtors" | "IthacaBoardOfRealtors" | "JacksonAreaAssociationOfRealtors" | "JacksonCountyBoardOfRealtors" | "JacksonvilleBoardOfRealtors" | "JasperAreaBoardOfRealtors" | "JeffersonCityAreaBoardOfRealtors" | "JeffersonCountyAssociationOfRealtors" | "JeffersonLewisBoard" | "JohnsonCountyAssociationOfRealtors" | "JohnstonCountyAssociationOfRealtors" | "JoshuaTreeGateway" | "KamloopsRealEstateAssociation" | "KanawhaValleyBoardOfRealtors" | "KansasCityRegionalAssociationOfRealtorsInc" | "KaufmanVanZandtAssociationOfRealtors" | "KawarthaLakesRealEstateAssociationInc" | "KentCountyAssociationofREALTORS" | "KentuckyBarkleyLakesBoardOfRealtors" | "KerrLakeBoardOfRealtorsInc" | "KerrvilleBoardOfRealtors" | "KershawCountyBoardOfRealtors" | "KeyWestAssociationOfRealtors" | "KingsCountyBoardofREALTORS" | "KingstonAndAreaRealEstateAssociation" | "KingsvilleAreaAssociationOfRealtors" | "KitchenerWaterlooAssociationOfRealtors" | "KlamathCountyAssociationOfRealtors" | "KnoxvilleAreaAssociationOfRealtorsInc" | "KootenayAssociationOfRealtors" | "KootenayRealEstateBoard" | "Laguna" | "LakeAndSumter" | "LakeCitiesAssociationOfRealtors" | "LakeCityBoardofREALTORS" | "LakeCounty" | "LakeGeaugaAreaAssociationOfRealtors" | "LakeHavasuAssociationOfRealtors" | "LakeMartinAreaAssociationofREALTORS" | "LakeOfTheOzarksBoardOfRealtors" | "LakeRegionAssociationOfRealtors" | "LakeWales" | "Lakeland" | "LakesCountryAssociationOfRealtors" | "LakewayAreaAssociationOfRealtors" | "LancasterCountyAssociationofREALTORS" | "LandOfTheSkyAssociationOfRealtors" | "LapeerAndUpperThumbAssociationOfRealtors" | "LaredoBoardOfRealtorsInc" | "LasCrucesAssociationOfRealtors" | "LasVegasBoardOfRealtors" | "LassenAssociationofREALTORS" | "LatahCountyBoardOfRealtors" | "LawrenceBoardOfRealtors" | "LawtonBoardOfREALTORS" | "LebanonBoardOfRealtors" | "LebanonCountyAssociationofREALTORS" | "LeeCountyAssociationOfRealtors" | "LehighValleyMls" | "LenaweeCountyAssociationOfRealtors" | "LethbridgeAndDistrictAssociationOfRealtors" | "LewisClarkAssociationOfRealtors" | "LewistonChapterofBillingsAssociationofREALTORS" | "LexingtonBluegrassAssociationOfRealtors" | "LexingtonBoardOfRealtors" | "LibertyBoardOfRealtorsInc" | "LincolnCountyBoardOfRealtors" | "LitchfieldCounty" | "LittleRockRealtorsAssociation" | "LivingstonCountyAssociationOfRealtors" | "LoganCountyBoardOfRealtors" | "LompocValley" | "LondonAndStThomasAssociationOfRealtors" | "LongIslandBoardOfRealtorsInc" | "LongleafPineRealtors" | "LongmontAssociationOfRealtors" | "LongviewAreaAssociationOfRealtors" | "LorainCountyAssociationOfRealtors" | "LovelandBerthoudAssociationRealtors" | "LowcountryRegionalMls" | "LowerYakimaValleyAssociationOfRealtors" | "LubbockAssociationOfRealtors" | "LufkinAssociationOfRealtors" | "LuzerneCountyAssociationofREALTORS" | "LynchburgAssociationOfRealtors" | "Madera" | "MaineListings" | "MainstreetOrganizationOfRealtors" | "Malibu" | "MammothLakesBoardOfRealtors" | "Manatee" | "ManitobaRealEstateAssociation" | "MansfieldAssociationOfRealtors" | "MarathonAndLowerKeysAssociationOfRealtors" | "MarcoIslandAreaAssociationOfRealtors" | "MariettaBoardOfRealtors" | "MarinREALTORS" | "MarinetteCountyBoardOfRealtors" | "MariposaCounty" | "MarkTwainAssociationOfRealtors" | "MarshallCountyBoardOfRealtors" | "MartinCounty" | "MartinCountyRealtorsOfTheTreasureCoast" | "MasonOceanaManisteeBoardOfRealtors" | "MassanuttenBoardOfRealtors" | "MatagordaCountyBoardOfRealtors" | "MayfieldGravesCountyBoardOfRealtors" | "McdowellBoardOfRealtors" | "MckeanPa" | "MedicineHatRealEstateBoard" | "MedinaCountyBoardOfRealtors" | "MemphisAreaAssociationOfRealtors" | "MenaAreaBoardOfRealtors" | "MercedCounty" | "MercerCountyAssociationOfRealtors" | "MetroAreaBoardOfRealtors" | "MetroCentreAssociationOfRealtors" | "MetroMilwaukee" | "MetroSearch" | "Metrolist" | "MetropolitanConsolidatedAssociationOfRealtors" | "MetropolitanIndianapolisBoardOfRealtors" | "MetrotexAssociationOfRealtorsInc" | "MiamiAssociationOfRealtors" | "MiamiAssociationOfRealtorsInc" | "MiamiRealtors" | "MiborRealtorAssociation" | "MichiganRegionalInformationCenter" | "MidAmericaRegionalInformationSystems" | "MidCarolinaRegionalAssociationOfRealtors" | "MidFairfieldCounty" | "MidHudsonMultipleListingService" | "MidIowaRegionalBoardOfRealtors" | "MidJerseyAssociationOfRealtors" | "MidKansasMultipleListingService" | "MidState" | "MidValleyAssociationOfRealtors" | "MiddleGeorgiaMls" | "MidlandBoardOfRealtors" | "MidwestRealEstateData" | "MiltonAndDistrictRealEstateBoard" | "MineralAreaBoardOfRealtors" | "MiniCassiaAssociationOfRealtors" | "MinneapolisAreaAssociationOfRealtors" | "MinnesotaArrowheadMls" | "Mirealsource" | "MiscellaneousAssociation" | "MississaugaRealEstateBoard" | "MissoulaCountyAssociationOfRealtors" | "MissoulaOrganizationOfRealtors" | "MlsOfCatawbaValley" | "MlsOfGreaterCincinnati" | "MlsOfSouthernArizona" | "MlsPropertyInformationNetwork" | "MlsTechnology" | "MlsUnited" | "Mlslistings" | "Mlspin" | "MobileAreaAssociationOfRealtors" | "MohawkValley" | "MonmouthCountyAssociationOfRealtorsInc" | "MonmouthOceanRegionalRealtors" | "MonroeCountyAssociationOfRealtors" | "MontagueCountyBoardOfRealtors" | "MontanaRegionalMls" | "MontcalmCountyAssociationOfRealtors" | "MontebelloDistrict" | "MontgomeryAreaAssociationOfRealtors" | "MontgomeryCountyAssociationOfRealtors" | "MontroseAssociationOfRealtors" | "MorganCountyAssociationOfRealtors" | "MorgantownBoardOfRealtors" | "MountainCentralAssociationOfRealtors" | "MountainLakesBoardofREALTORS" | "MountainMetroAssociationOfRealtors" | "Mrmls" | "MurrayCallowayCountyBoardOfRealtors" | "MyStateMls" | "NacogdochesCountyBoardOfRealtors" | "NampaAssociationOfRealtors" | "Naples" | "NaplesAreaBoardOfRealtors" | "NavarreAreaBoardOfRealtors" | "NavarroCountyBoardOfRealtors" | "NebraskaRealtorsAssociation" | "NemahaValleyBoardOfRealtors" | "NeuseRiverRegionAssociationOfRealtors" | "NevadaCounty" | "NevadaREALTORS" | "NewBernBoardOfRealtorsInc" | "NewBraunfelsCanyonLakeAreaAssocOfRealtors" | "NewBrunswickRealEstateAssociation" | "NewCanaanBoardOfRealtors" | "NewCastleCountyBoardofREALTORS" | "NewHavenMiddlesex" | "NewMexicoAssociationOfRealtors" | "NewRiverValleyAssociationOfRealtors" | "NewSmyrnaBeachBoardOfRealtors" | "NewYorkStateMls" | "NewfoundlandAndLabradorAssociationOfRealtors" | "Newport" | "NewportBeachAssociationOfRealtors" | "Newtown" | "NexusAssociationOfRealtors" | "NiagaraAssociationOfRealtors" | "NocoastMls" | "NolanCountyBoardOfRealtors" | "NorfolkBoardOfRealtors" | "NormanBoardOfRealtors" | "NorthBay" | "NorthBayAndAreaRealtorsAssociation" | "NorthBayRealEstateBoard" | "NorthCarolinaMountainsMls" | "NorthCarolinaRegionalMls" | "NorthCentralIowaRegionalMls" | "NorthCentralJerseyAssociationOfRealtors" | "NorthIowaRegionalBoardOfRealtors" | "NorthMetroDenverRealtorAssociationInc" | "NorthMetroRealtorsAssociation" | "NorthOaklandCountyBoardOfRealtorsInc" | "NorthPulaskiBoardOfRealtors" | "NorthSanDiegoCounty" | "NorthSanLuisObispo" | "NorthSantaBarbaraCountyRegionalMLS" | "NorthShoreBarringtonAssociationOfRealtors" | "NorthTennesseeAssociationOfRealtors" | "NorthTexasCommercialAssociationOfRealtors" | "NorthTexasInformationSystems" | "NorthTexasRealEstateInformationSystems" | "NortheastAlabamaAssociationOfRealtors" | "NortheastArkansasBoardOfRealtors" | "NortheastAtlantaMetroAssnOfRealtorsInc" | "NortheastFloridaAssociationOfRealtorsInc" | "NortheastGeorgiaBoardOfRealtors" | "NortheastIowaRegionalBoardofREALTORS" | "NortheastLouisianaAssociationOfRealtors" | "NortheastMichiganBoardOfRealtors" | "NortheastMississippiBoardOfRealtors" | "NortheastOklahomaBoardOfRealtors" | "NortheastRealtorsOfLouisiana" | "NortheastSouthDakotaAssociationOfRealtors" | "NortheastTarrantCountyBoardOfRealtors" | "NortheastTennesseeAssociationOfRealtors" | "NortheastWashingtonAssociationOfRealtors" | "NortheasternMichiganBoardOfRealtors" | "NorthernArizonaMls" | "NorthernColoradoCommercialAssociationOfRealtors" | "NorthernFairfieldCounty" | "NorthernGreatLakesRealtors" | "NorthernIndianaRealtorsAssociation" | "NorthernJacksonCountyBoardOfRealtors" | "NorthernKentuckyMultipleListingService" | "NorthernNevadaRegionalMls" | "NorthernNewBrunswickRealEstateBoard" | "NorthernOhioRegionalMls" | "NorthernSolanoCountyAssociationofREALTORS" | "NorthernVirginiaAssociationOfRealtors" | "NorthshoreAreaBoardOfRealtors" | "NorthumberlandHillsAssociationOfRealtors" | "NorthwestArkansasBoardOfRealtorsMls" | "NorthwestIllinoisAllianceOfRealtors" | "NorthwestIndianaRealtorsAssociation" | "NorthwestIowaRealtors" | "NorthwestIowaRegionalBoardOfRealtors" | "NorthwestLouisianaAssociationOfRealtors" | "NorthwestMinnesotaAssociationOfRealtors" | "NorthwestMississippiAssociationOfRealtors" | "NorthwestMontanaAssociationOfRealtors" | "NorthwestMultipleListingService" | "NorthwestOhioRealEstateInformationService" | "NorthwestWyomingBoardOfRealtors" | "NorthwoodsAssocOfRealtorsInc" | "Oakland" | "Oakville" | "OakvilleMiltonAndDistrictRealEstateBoard" | "OcalaMarion" | "OcalaMarionCountyAssociationOfRealtorsInc" | "OceanCityBoardOfRealtors" | "OceanCountyBoardOfRealtors" | "OdessaBoardOfRealtors" | "OjaiValley" | "OkanaganMainlineRealEstateBoard" | "Okeechobee" | "OklahomaCityMetropolitanAor" | "OmahaAreaBoardOfRealtors" | "OmniMlsLlc" | "OnekeyMls" | "OnepointAssociationOfRealtors" | "OrangeChathamAssociationOfRealtors" | "OrangeCoastAssociationOfRealtors" | "OrangeCounty" | "OregonCoastMls" | "OrlandoRegional" | "OrlandoRegionalRealtorAssociation" | "Oroville" | "Osceola" | "OtherUnspecificed" | "OtsegoDelaware" | "OttawaRealEstateBoard" | "OutOfAreaBoard" | "OuterBanksAssociationOfRealtors" | "OzarkGatewayAssociationOfRealtors" | "OzarkTrailBoardOfRealtors" | "PacificRegionalMultipleListingService" | "PacificSouthwest" | "PacificWest" | "PaducahBoardOfRealtors" | "PagosaSpringsAreaAssnOfRealtors" | "PalestineAssociationOfRealtors" | "PalmSprings" | "PalosVerdesPeninsula" | "Paradise" | "ParagouldBoardOfRealtors" | "ParisBoardOfRealtors" | "ParkCityBoardOfRealtors" | "ParkersburgAreaAssociationOfRealtors" | "PasadenaFoothills" | "PasoRobles" | "PassaicCountyBoardOfRealtors" | "PearlRiverCountyBoardOfRealtors" | "PeeDeeRealtorAssociation" | "PennyrileBoardOfRealtors" | "PensacolaAssociationOfRealtorsInc" | "PeoriaAreaAssociationOfRealtors" | "PermianBasinBoardOfRealtorsInc" | "PeterboroughAndTheKawarthasAssociationOfRealtors" | "PetroplexAssociationofREALTORS" | "PhoenixAssociationOfRealtors" | "PiedmontRegionalAssociationOfRealtors" | "PikeWayneAssociationOfRealtors" | "PikesPeakAssociationOfRealtors" | "Pillar9" | "PinehurstSouthernPinesAreaAssociation" | "PinellasSuncoast" | "PinellasSuncoastAssociationOfRealtorsInc" | "PineyWoodsBoardOfRealtors" | "PismoCoast" | "PittsburgBoardOfRealtors" | "PlacerCountyAssociationOfRealtors" | "Plumas" | "PoconoMountainsAssociationOfRealtors" | "PortCharlotte" | "PortageCountyAssociationOfRealtors" | "PortlandMetropolitanAssociationOfRealtors" | "PowellRiverSunshineCoastRealEstateBoard" | "PrescottAreaAssociationOfRealtors" | "Primemls" | "PrinceGeorgesCountyAssociationOfRealtorsInc" | "PrinceWilliamAssociationOfRealtors" | "PuebloAssociationOfRealtors" | "PuertoRico" | "PulaskiCountyBoardOfRealtors" | "QuadCityAreaRealtors" | "QuinteAndDistrictAssociationOfRealtors" | "REALTORSAssociationofYorkandAdamsCounties" | "REALTORSofGreaterMidNebraska" | "RaleighRegionalAssociationOfRealtors" | "RaleighWakeBoardOfRealtors" | "RanchoSoutheast" | "RangeAssociationofREALTORS" | "RapbBeachesmls" | "ReadingBerksAssociationOfRealtorsInc" | "RealEstateBoardOfGreaterVancouver" | "RealEstateBoardOfNewYork" | "RealEstateBoardOfTheFrederictonArea" | "RealEstateInformationNetworkInc" | "RealcompIiLtd" | "Realmls" | "RealsourceAssociationOfRealtorsInc" | "RealtorAssnGreaterFortLauderdale" | "RealtorAssocOfGreaterMiamiAndTheBeaches" | "RealtorAssociationOfAcadiana" | "RealtorAssociationOfFranklinAndGulfCounties" | "RealtorAssociationOfSouthernMinnesota" | "RealtorAssociationOfTheGreaterPeeDeeInc" | "RealtorAssociationOfTheSiouxEmpire" | "RealtorAssociationOfWesternKentucky" | "RealtorAssociationPalmBeaches" | "RealtorsAssocOfGreaterFtMyersAndTheBeach" | "RealtorsAssociationOfCitrusCounty" | "RealtorsAssociationOfEdmonton" | "RealtorsAssociationOfGreyBruceOwenSound" | "RealtorsAssociationOfHamiltonBurlington" | "RealtorsAssociationOfLincoln" | "RealtorsAssociationOfLloydminsterAndDistrict" | "RealtorsAssociationOfMaui" | "RealtorsAssociationOfMetropolitanPittsburgh" | "RealtorsAssociationOfNortheastWisconsin" | "RealtorsAssociationOfSouthCentralAlberta" | "RealtorsAssociationOfSouthCentralWisconsin" | "RealtorsAssociationOfSouthwesternIllinois" | "RealtorsLandInstitute" | "RealtorsOfCentralColorado" | "RealtorsOfGreaterAugusta" | "RealtorsOfNorthwesternWisconsin" | "Realtracs" | "ReciprocalBoard" | "Recolorado" | "RegionalMlsOfMinnesota" | "RemMetroSouthAssociationOfRealtorsInc" | "RemMiddleTennesseeAssociationOfRealtorsInc" | "RemSoutheastValleyRegionalAssociationOfRealtors" | "RemWilliamsonCountyAssociationOfRealtorsInc" | "RenfrewCountyRealEstateBoard" | "Resides" | "RhodeIslandStateWideMls" | "RichmondAssociationOfRealtors" | "RichmondCountyBoardOfRealtorsInc" | "RideauStLawrenceRealEstateBoard" | "Ridgefield" | "RimOTheWorld" | "RioGrandeValleyMls" | "RlsConnectNyc" | "RoamMls" | "RoanokeValleyAssociationOfRealtorsInc" | "RobertsonCountyAssociationOfRealtors" | "Rochester" | "RockinghamCountyAssociationOfRealtorsInc" | "RockportAreaBoardOfRealtors" | "RockyMountAreaAssociationOfRealtors" | "RockyMountainAssociationOfRealtors" | "RogueValleyAssociationOfRealtors" | "RoswellAssociationOfRealtors" | "RoyalGorgeAssociationOfRealtors" | "RoyalPalmCoastRealtorAssociation" | "RuidosoLincolnCountyAssociationOfRealtors" | "RutherfordCountyBoardOfRealtors" | "SacramentoAssociationOfRealtorsInc" | "SaginawBoardOfRealtors" | "SaintJohnRealEstateBoard" | "SalisburyRowanAssociationOfRealtors" | "SalisburyRowanRealtors" | "SaltLakeBoardOfRealtors" | "SanAngeloAssociationOfRealtors" | "SanAntonioBoardOfRealtors" | "SanDiego" | "SanDiegoAssociationOfRealtors" | "SanDiegoMls" | "SanFrancisco" | "SanJuanCountyBoardOfRealtors" | "SanLuisObispo" | "SanLuisObispoCoastal" | "SanMarcosAreaBoardOfRealtors" | "SanMateoCountyAssociationOfRealtors" | "SandicorMls" | "SantaBarbara" | "SantaBarbaraAssociationOfRealtors" | "SantaClaraCounty" | "SantaCruzCountyBoardOfRealtors" | "SantaFeAssociationOfRealtors" | "SantaMaria" | "SantaYnezValley" | "SarasotaAssociationOfRealtorsInc" | "SarasotaManatee" | "SaratogaSchenectadySchoharieAssociation" | "SarniaLambtonRealEstateBoard" | "SaskatchewanRealtorsAssociation" | "SaskatoonRegionAssociationOfRealtors" | "SaultSteMarieRealEstateBoard" | "SavannahBoardOfRealtors" | "SavannahMultiListCorporation" | "ScenicCoast" | "SciotoValleyAssociationOfRealtors" | "ScottsdaleAreaAssociationOfRealtorsInc" | "SearcyBoardOfRealtors" | "SeattleKingCountyAssociationOfRealtorsInc" | "SedonaVerdeValleyAssociationOfRealtors" | "SeguinBoardOfRealtors" | "SelkirkAssociationOfRealtors" | "Selma" | "ShalMls" | "ShastaAssociationOfRealtors" | "SheridanCountyBoardOfRealtors" | "SierraCountyBoardOfRealtors" | "SierraNevadaAssociationOfRealtors" | "SierraNevadaRealtors" | "SierraNorthValley" | "SiliconValleyAssociationOfRealtors" | "SilverCityRegionalMls" | "SimcoeAndDistrictRealEstateBoard" | "SimiValley" | "SiskiyouAssociationOfRealtors" | "SmartMls" | "SnakeRiverRegionalMls" | "SoBrowardBoardOfRealtors" | "Socalmls" | "SouthBay" | "SouthCentralArkansasRealtorsAssociation" | "SouthCentralBoardOfRealtors" | "SouthCentralKansasMls" | "SouthGeorgiaMLS" | "SouthJerseyShoreRegionalMls" | "SouthMetroDenverRealtorAssociation" | "SouthMonmouthBoardOfRealtors" | "SouthOkanaganRealEstateBoard" | "SouthPadreIslandBoardOfRealtors" | "SouthTahoeAssociationOfRealtors" | "SouthTexasCommercialAssociationOfRealtors" | "SoutheastAlabamaAssociationOfRealtors" | "SoutheastArkansasBoardOfRealtors" | "SoutheastFloridaRegional" | "SoutheastIowaRegionalBoardOfRealtors" | "SoutheastKern" | "SoutheastMinnesotaAssociationOfRealtors" | "SoutheastMissouriRealtors" | "SoutheasternBorderAssociationOfRealtors" | "SouthernAdirondackRealtors" | "SouthernGatewayAssociationOfRealtors" | "SouthernGeorgianBayAssociationOfRealtors" | "SouthernIndianaRealtorsAssociation" | "SouthernMarylandAssociationofREALTORS" | "SouthernMissouriRegionalMls" | "SouthernOklahomaBoardofREALTORS" | "Southland" | "SouthlandRegionalAssociationOfRealtorsInc" | "SouthwestGeorgiaBoardOfRealtorsAndMls" | "SouthwestIowaAssociationOfRealtors" | "SouthwestLosAngeles" | "SouthwestLosAngelesAssociationOfRealtors" | "SouthwestLouisianaAssociation" | "SouthwestLouisianaAssociationOfRealtors" | "SouthwestMichiganAssociationOfRealtors" | "SouthwestRiversideCounty" | "SouthwestVirginiaAssociationOfRealtors" | "SouthwesternIllinoisBoardOfRealtors" | "SouthwesternMichiganAssociationOfRealtors" | "SpaceCoastAssociationOfRealtors" | "SpanishPeaksBoard" | "SpartanburgAssociationOfRealtors" | "SpartanburgBoardOfRealtorsInc" | "SpokaneRealtors" | "StAugustineAndStJohnsCountyBoardOfRealtors" | "StCharlesCountyAssociationOfRealtors" | "StCloudAreaAssociationOfRealtors" | "StJosephCountyAssociationOfRealtors" | "StLouisRealtors" | "StPaulAreaAssociationOfRealtors" | "Stamford" | "StarkCountyAssociationOfRealtorsInc" | "StarkTrumbullAreaRealtors" | "StatenIslandBoardOfRealtors" | "StatenIslandMultipleListingService" | "SteamboatSpringsBoardOfRealtors" | "StellarMls" | "StephenvilleAssociationOfRealtors" | "SudburyRealEstateBoard" | "SummitAssociationOfRealtors" | "SumterBoardOfRealtors" | "SunValleyBoardOfRealtors" | "SuncoastTampaAssociationOfRealtors" | "SunflowerAssociationOfRealtors" | "SuperiorAssociationOfRealtors" | "SussexCountyAssociationOfRealtors" | "SutterYubaAssnOfRealtors" | "Syracuse" | "TacomaPierceCountyAssociationofREALTORS" | "Tampa" | "TaosAssociationOfRealtors" | "TaosCountyAssociationOfRealtors" | "TehachapiAreaAssociationofREALTORS" | "TehamaCounty" | "TellurideAssociationOfRealtors" | "TempleBeltonBoardOfRealtors" | "TennesseeValleyAssociationOfRealtors" | "TennesseeVirginiaRegionalMls" | "TetonBoardOfRealtors" | "TexarkanaBoardOfRealtors" | "TheGreaterMonctonRealtorsDuGrandMoncton" | "TheInlandGateway" | "TheLakelandsAssociationOfRealtors" | "Themls" | "ThreeRiversBoardOfRealtors" | "ThunderBayRealEstateBoard" | "TillsonburgDistrictRealEstateBoard" | "Timmins" | "TitusCampMorrisUpshurAssociationOfRealtors" | "Tmp" | "Toledo" | "TopsailIslandAssociationOfRealtors" | "TorontoRealEstateBoard" | "TraverseAreaAssociationOfRealtors" | "TriCityAssociationOfRealtors" | "TriCounties" | "TriCounty" | "TriCountySuburbanRealtors" | "TriLakesBoardOfRealtors" | "TriStateCommercialRealty" | "TriadMultipleListingService" | "TriangleCommercialAssocOfRealtors" | "TriangleMls" | "TucsonAssociationOfRealtors" | "TulareCountyAssociationOfRealtors" | "TuolumneCountyAssociationOfRealtors" | "TylerCountyBoardOfRealtors" | "UlsterCountyBoardOfRealtors" | "UnionCountyAssociationOfRealtors" | "UnitedAssociationOfRealtors" | "UpperCumberlandMls" | "UpperPeninsulaAssociationOfRealtors" | "Utahrealestatecom" | "UvaldeBoardOfRealtors" | "VailBoardOfRealtors" | "VailMultiListService" | "Valley" | "ValleyMls" | "VancouverIslandRealEstateBoard" | "VcrdsMls" | "Venice" | "VenturaCoastal" | "VictorValley" | "VictoriaAreaAssociationOfRealtors" | "VictoriaBoardOfRealtorsInc" | "VictoriaRealEstateBoard" | "WacoAssociationOfRealtors" | "WarrenAreaBoardOfRealtors" | "WasatchFrontRealEstate" | "WashingtonBeaufortCountyBoardOfRealtors" | "WashingtonCountyBoardOfRealtors" | "WaterWonderlandBoardOfRealtors" | "WaterlooRegionAssociationOfRealtors" | "WayneHolmesAssociationOfRealtors" | "WestAlabamaMultipleListingService" | "WestBranchValleyAssociationOfRealtors" | "WestCentralAssociationOfRealtors" | "WestCentralIowaRealEstateAndRealtors" | "WestCentralIowaRegionalMls" | "WestContraCosta" | "WestEssexBoardOfRealtors" | "WestMichiganLakeshoreAssociationOfRealtors" | "WestPasco" | "WestPennMultiList" | "WestPlainsBoardOfRealtors" | "WestSanGabrielValley" | "WestVolusia" | "WestchesterCountyBoardOfRealtors" | "WestchesterPutnam" | "WesternAzRegionalRealEstateDataExchange" | "WesternMagicValleyRealtors" | "WesternRegionalInformationSystemsAndTechnology" | "WesternUpstateAssociationOfRealtors" | "WesternWayneOaklandCountyAssnOfRealtors" | "WesternWayneOaklandCountyAssociationRealtors" | "WesternWisconsinRealtorsAssociation" | "WestonBuckhannonBoardOfRealtors" | "WheelingBoardOfRealtors" | "WhiteMountainAssociationOfRealtors" | "WhitmanCountyAssociationOfRealtors" | "WichitaFallsAssociationOfRealtors" | "WilkesCountyAssociationOfRealtors" | "WillametteAssociationOfRealtors" | "WillametteValueMultipleListingService" | "WilliamsburgMls" | "WilliamsonCountyAssociationOfRealtors" | "WilliamsonCountyAssociationOfRealtorsInc" | "WillistonBoardOfRealtors" | "WilmingtonRegionalAssociationOfRealtorsInc" | "WilsonBoardOfRealtors" | "WindsorEssexCountyAssociationOfRealtors" | "WinnipegRegionalRealEstateBoard" | "WinstonSalemBoardOfRealtors" | "WiregrassBoardOfREALTORS" | "WisconsinRealEstateExchange" | "WisconsinRealtorsAssociation" | "WoodstockIngersollAndDistrictRealEstateBoard" | "WoodstockIngersollTillsonburgAreaAssociationOfRealtors" | "WorcesterRegionalAssociationOfRealtors" | "YadkinValleyAssociationOfRealtorsInc" | "YakimaAssociationOfRealtors" | "YamhillCountyAssociationOfRealtors" | "YanceyMitchellBoardOfRealtors" | "YorkCountyAssociationOfRealtors" | "YoungstownColumbianaAssociationOfRealtors" | "YumaAssociationOfRealtors";

/** 13 members · $metadata EnumType CommonInterest */
export type CotalityEnum_CommonInterest = "BareLandCondominium" | "CoOwnership" | "CommunityApartment" | "Condominium" | "Condop" | "Freehold" | "Leasehold" | "None" | "Other" | "PlannedDevelopment" | "RentalBuilding" | "StockCooperative" | "Timeshare";

/** 6 members · $metadata EnumType CommonWalls */
export type CotalityEnum_CommonWalls = "EndUnit" | "NoCommonWalls" | "NoOneAbove" | "NoOneBelow" | "OneCommonWall" | "TwoCommonWallsOrMore";

/** 141 members · $metadata EnumType CommunityFeatures */
export type CotalityEnum_CommunityFeatures = "AirportRunway" | "ArtsCenter" | "BarLounge" | "Barbecue" | "BasketballCourt" | "Beach" | "BicycleStorage" | "Biking" | "BilliardRoom" | "BoatFacilities" | "BoatSlip" | "BocceCourt" | "Bulkhead" | "BusinessCenter" | "CableTv" | "CableTvAvailable" | "CarShareAvailable" | "ClubMembershipAvailable" | "Clubhouse" | "CommonGroundsArea" | "CommonTv" | "CommunityMailbox" | "CommunityPool" | "Concierge" | "CondoHotelCommunity" | "ConferenceMeetingRoom" | "Courtyard" | "Curbs" | "DeckPorch" | "DeliveryDoor" | "DisplayWindow" | "Dock" | "DogPark" | "ElectricityIncluded" | "Elevator" | "EnclosedPorch" | "EquestrianCommunity" | "EquestrianFacilities" | "FeesRequired" | "FencedYard" | "Fishing" | "Fitness" | "FitnessCenter" | "Foothills" | "GameRoom" | "GardenArea" | "GasIncluded" | "Gated" | "Golf" | "GolfCartsOk" | "GolfCourseCommunity" | "Gutters" | "HandicapAccess" | "HighTrafficLocation" | "HighwayAccess" | "Hiking" | "HomeOwnersAssociation" | "HorseTrails" | "Hunting" | "InternetAccess" | "KitchenFacilities" | "Lake" | "LaundryFacilities" | "LaundryService" | "Library" | "LoadingDock" | "LongTermRentalAllowed" | "MaintainedCommunity" | "MaintenanceOnSite" | "Marina" | "MasterPlannedCommunity" | "MediaRoom" | "MedicalService" | "MilitaryLand" | "Mountainous" | "NearFireStation" | "NearHospital" | "NearHotelMotel" | "NearNationalForest" | "NearSchools" | "NearStatePark" | "NonGated" | "None" | "Other" | "OutdoorShower" | "PackageService" | "Park" | "Patio" | "PetAmenities" | "Pickleball" | "Pier" | "PlaceOfWorship" | "PlannedSocialActivities" | "Playground" | "Pond" | "Pool" | "PreservePublicLand" | "PrivateBeach" | "PropertyManagerOnSite" | "PublicTransportation" | "PuttingGreen" | "QuietArea" | "Racquetball" | "Ravine" | "RecreationArea" | "RecreationCenter" | "Restaurant" | "River" | "RooftopDeck" | "RooftopLounge" | "Rural" | "Sauna" | "SeeRemarks" | "Shopping" | "ShortTermRentalAllowed" | "Shuffleboard" | "Sidewalks" | "SkiInSkiOut" | "Skiing" | "SnowRemoval" | "SportCourts" | "SportsField" | "Stables" | "StorageFacilities" | "StormDrains" | "Stream" | "StreamSeasonal" | "StreetLights" | "Suburban" | "TennisCourts" | "TrailsPaths" | "TrainStation" | "TrashChute" | "TrashPickupDoorToDoor" | "Urban" | "Valley" | "VoluntaryHomeOwnersAssociation" | "WalkToSchool" | "WaterAccess" | "WaterSports" | "Waterfront";

/** 2 members · $metadata EnumType ConcessionInPriceType */
export type CotalityEnum_ConcessionInPriceType = "Item" | "Item1";

/** 3 members · $metadata EnumType Concessions */
export type CotalityEnum_Concessions = "CallListingAgent" | "No" | "Yes";

/** 87 members · $metadata EnumType ConstructionMaterials */
export type CotalityEnum_ConstructionMaterials = "Adobe" | "Alcan" | "AluminumSiding" | "Asbestos" | "Asphalt" | "AtticCrawlHatchwaysInsulated" | "BattsInsulation" | "Block" | "BlownInInsulation" | "BoardAndBattenSiding" | "Brick" | "BrickVeneer" | "Cedar" | "CementSiding" | "Clapboard" | "CompositeSiding" | "Concrete" | "ConcreteComposite" | "CopperPlumbing" | "DoubleWall" | "Drywall" | "DuctsProfessionallyAirSealed" | "EngineeredWood" | "ExteriorDuctWorkIsInsulated" | "FiberCement" | "FiberglassSiding" | "Flagstone" | "FoamInsulation" | "Frame" | "Glass" | "Hardboard" | "HardiplankType" | "HollowTile" | "IcatRecessedLighting" | "InsulatedConcreteForms" | "LapSiding" | "Log" | "LogSiding" | "LowVocInsulation" | "Manufactured" | "ManufacturedFloorJoists" | "Masonite" | "Masonry" | "MetalFrame" | "MetalSiding" | "Mixed" | "ModularPrefab" | "NaturalBuilding" | "NesInsulationPackage" | "OffFrameModular" | "OnFrameModular" | "Other" | "PexPlumbing" | "Plaster" | "PreCastConcrete" | "RadiantBarrier" | "RammedEarth" | "RecycledBioBasedInsulation" | "RedwoodSiding" | "Rock" | "SeeRemarks" | "ShakeSiding" | "ShingleSiding" | "SilentFloorJoists" | "SingleWall" | "SlumpBlock" | "SprayFoamInsulation" | "Steel" | "SteelFrame" | "SteelSiding" | "StickBuilt" | "Stone" | "StoneVeneer" | "Straw" | "StructuralInsulatedPanels" | "Stucco" | "Synthetic" | "SyntheticStucco" | "T111Siding" | "TiltUp" | "TvaInsulationPackage" | "Unknown" | "Veneer" | "VerticalSiding" | "VinylSiding" | "WoodFrame" | "WoodSiding";

/** 41 members · $metadata EnumType Cooling */
export type CotalityEnum_Cooling = "AtticFan" | "BuildingCooling" | "CeilingFans" | "CentralAir" | "Common" | "CoolingSourceRented" | "Dual" | "Ductless" | "Electric" | "EnergyStarQualifiedEquipment" | "EvaporativeCooling" | "EvaporativeSwamp" | "ExhaustFan" | "ForcedAir" | "Full" | "Gas" | "Geothermal" | "HeatPump" | "HighEfficiency" | "HumidityControl" | "MultiUnits" | "None" | "OneUnit" | "Other" | "Partial" | "Refrigerated" | "ReverseCycle" | "RoofTurbines" | "Rooftop" | "RoughIn" | "SeeRemarks" | "SeparateMeters" | "SeparateUnits" | "ThreeOrMoreUnits" | "TwoUnits" | "VariesByUnit" | "WallUnits" | "WallWindowUnits" | "WholeHouseFan" | "WindowUnits" | "Zoned";

/** 24 members · $metadata EnumType CurrentFinancing */
export type CotalityEnum_CurrentFinancing = "Assumable" | "CalVetLoan" | "Cash" | "Contract" | "Conventional" | "ExistingBonds" | "FannieMae" | "Fha" | "Fha203b" | "Fha203k" | "FreddieMac" | "GovernmentLoan" | "LeasedRenewables" | "None" | "Other" | "PowerPurchaseAgreement" | "Private" | "PropertyAssessedCleanEnergy" | "SeeRemarks" | "TrustDeed" | "Usda" | "Va" | "VaNoLoan" | "VaNoNoLoan";

/** 66 members · Lookup catalogue for Property.CurrentUse (EnumType CurrentOrPossibleUse declares 65; the Lookup publishes 66) */
export type CotalityLookup_Property_CurrentUse = "Agricultural" | "Automotive" | "Berries" | "BuyerToVerify" | "Cattle" | "Commercial" | "ConvenienceStore" | "Dairy" | "Development" | "Farm" | "Fishery" | "FishingRights" | "FoodService" | "Gallery" | "Grazing" | "HighwayTouristService" | "HobbyFarm" | "Horses" | "HotelMotel" | "Hunting" | "Improved" | "Industrial" | "Investment" | "Irrigation" | "Leased" | "LiveWork" | "Livestock" | "ManufacturedHome" | "Manufacturing" | "Marina" | "MedicalDental" | "MiniStorage" | "MixedUse" | "MobileHome" | "MultiFamily" | "Nursery" | "Office" | "Orchard" | "Other" | "ParkingLot" | "Pasture" | "PlaceOfWorship" | "Plantable" | "Poultry" | "Ranch" | "Recreational" | "Residential" | "Restaurant" | "Retail" | "RowCrops" | "SeeAgent" | "SeeRemarks" | "Service" | "ServiceBusiness" | "SingleFamily" | "SpecialUse" | "Storage" | "Subdevelopment" | "Subdivision" | "Timber" | "TreeFarm" | "Unimproved" | "Vacant" | "Vineyard" | "Warehouse" | "Wholesale";

/** 19 members · $metadata EnumType DevelopmentStatus */
export type CotalityEnum_DevelopmentStatus = "Clear" | "Completed" | "FinishedLots" | "InfrastructureIn" | "NewConstruction" | "Other" | "Proposed" | "RawLand" | "RemodeledUpgraded" | "ResalePreviouslyOwned" | "RoughGrade" | "SeeRemarks" | "SitePlanApproved" | "SitePlanFiled" | "StreetsInstalled" | "Subdivided" | "UnderConstruction" | "Unknown" | "Zoned";

/** 9 members · $metadata EnumType DirectionFaces */
export type CotalityEnum_DirectionFaces = "East" | "North" | "Northeast" | "Northwest" | "South" | "Southeast" | "Southwest" | "Unknown" | "West";

/** 119 members · $metadata EnumType Disclosures */
export type CotalityEnum_Disclosures = "AcceptingBackupOffers" | "AccessoryDwellingUnit" | "AgentHasFinancialInterest" | "AgriculturalDistrict" | "AgriculturalExemption" | "AicuzAccidentPotentialClearZone" | "AicuzAccidentPotentialZone1" | "AicuzAccidentPotentialZone2" | "AicuzNoiseLevel65" | "AicuzNoiseLevel6570" | "AicuzNoiseLevel7075" | "AicuzNoiseLevel75" | "AsbestosDisclosure" | "BeachRights" | "BuilderExclusive" | "BuriedFuelTanks" | "CallAgent" | "CautionsCallAgent" | "CityInspectionRequired" | "CoastalCommissionRestrictions" | "CoastalZone" | "CodeComplianceRequired" | "ConditionalUsePermit" | "CourtConfirmation" | "CovenantsRestrictionsDisclosure" | "DeathOnProperty3Yrs" | "DeedRestriction" | "Disclaimer" | "DisclosureOnFile" | "EarthquakeInsuranceAvailable" | "Easements" | "Encroachment" | "EstablishedRentalHistory" | "Exchange1031" | "ExclusionsDisclosure" | "ExemptDisclaimer" | "ExemptDisclosureDisclaimer" | "FamilialRelation" | "FaultZone" | "FirstRightOfRefusal" | "FixtureException" | "FixtureLeases" | "FloodInsuranceRequired" | "FloodPlainDisclosure" | "ForeignSeller" | "HeroPaceLoan" | "Historical" | "HoaDisclosure" | "HomeWarranty" | "HomesteadExemption" | "Incorporated" | "LeadBasedPaintDisclosure" | "LenderApprovalRequired" | "LicensedVacationRental" | "ListingBrokerAdvantage" | "ManufacturedHomesAllowed" | "MethaneGas" | "Moratorium" | "MunicipalUtilityDistrictDisclosure" | "NaturalHazard" | "NoLakeRights" | "NoSmoking" | "NonConformingUse" | "None" | "NotBuilderExclusive" | "OccupancyPermitRequired" | "OilRights" | "OpenSpaceRestrictions" | "Other" | "OwnerHasFloodInsurance" | "OwnerIsListingAgent" | "OwnerIsanAgent" | "PetOnProperty" | "PetRestrictions" | "PlannedUnitDevelopment" | "PotentialShortSale" | "PrincipalIsRealEstateLicensed" | "PrivateTransferTaxes" | "ProposedSpecialAssessment" | "ProspectsReserved" | "PublicImprovementDistrict" | "PurchaserToVerifyElectricity" | "Radon" | "Ranm2100Disclosure" | "Reap" | "RelocationAddendumRequired" | "RentControl" | "RentersInsuranceRequired" | "ResidentialServiceContract" | "Restricted" | "RestrictedPropertyAccess" | "RvRestrictions" | "Section8Approved" | "SeeRemarks" | "SeeSupplements" | "SeismicHazard" | "SellerDisclosure" | "SellerWillPaySec1Termite" | "SellersDisclosureNotAvailable" | "SeniorTaxExemption" | "SepticDisclosure" | "SlideZone" | "SpecialAddendum" | "SpecialAssessment" | "SpecialStudyArea" | "SubjectToEstateRuling" | "TenantsInCommonDrePink" | "TenantsInCommonDreWhite" | "ThirdPartyRights" | "TrustConservatorship" | "UncappedGasWell" | "UndergroundStorageTank" | "Unincorporated" | "Unknown" | "UseVariance" | "VirtuallyStagedPhotos" | "WaterRights" | "WellLogAvailable" | "Winterized";

/** 4 members · $metadata EnumType LinearUnits */
export type CotalityEnum_LinearUnits = "Blocks" | "Feet" | "Meters" | "Miles";

/** 94 members · $metadata EnumType DocumentsAvailable */
export type CotalityEnum_DocumentsAvailable = "Abstract" | "AccessibilityFeaturesForm" | "Aerial" | "Appraisal" | "BuildingPlans" | "BuildingRestrictions" | "BuildingRules" | "BylawsAndAmendments" | "CallListingAgent" | "ComingSoonOwnerAuthorization" | "CommunityPlan" | "ComplianceCertificate" | "Contracts" | "CostEstimates" | "CropLease" | "CustomerList" | "Deed" | "DeedRestriction" | "Demographics" | "Disclosures" | "Easements" | "ElevationCertificate" | "EncroachmentAgreement" | "Energy" | "EngineeringReport" | "EnvironmentalStudy" | "EstoppelCertificate" | "FeasibilityStudy" | "Financials" | "Floorplan" | "GeologicalSurvey" | "GroundPhoto" | "Historical" | "HoaDocuments" | "HomeInspectionReport" | "HydrologyReport" | "Inventory" | "LandLease" | "LeadBasedPaintDisclosure" | "Lease" | "LegalDescription" | "LegalDocuments" | "Licenses" | "LocationMap" | "MarketingBrochure" | "None" | "NotApplicable" | "OakWiltTest" | "OfferingPlan" | "Other" | "OwnerOptOut" | "PercReport" | "Permits" | "PestControlReport" | "Plat" | "PlumbingPlans" | "PotabilityReport" | "PreliminaryTitleReport" | "ProfitLossStatement" | "Prospectus" | "RadonTest" | "RealEstateConditionReport" | "RealPropertyReport" | "RentRolls" | "ResalePackage" | "RestrictiveCovenants" | "RoadMaintenanceAgreement" | "RoofInspection" | "ScheduleA" | "SecurityCodes" | "SeeRemarks" | "SellersPropertyDisclosure" | "SepticCertification" | "SepticInspection" | "SewerMap" | "SharedWellAgreement" | "ShortSaleAddendum" | "SitePlan" | "SoilTest" | "SpecialAssessmentDistrict" | "SubdivisionPlan" | "Survey" | "TaxInformation" | "TenancySchedule" | "Title" | "TitleInsurance" | "TopographicalSurvey" | "TrafficCounts" | "UnitMixSchedule" | "Warranties" | "WaterWellReport" | "WellInspectionReport" | "WellLogAvailable" | "Yes";

/** 18 members · $metadata EnumType DoorFeatures */
export type CotalityEnum_DoorFeatures = "AtriumDoors" | "DoorHardware" | "DoubleDoorEntry" | "EnergyStarQualifiedDoors" | "FrenchDoors" | "InsulatedDoors" | "LeveredOrGraspableDoorHandles" | "MirroredClosetDoors" | "Other" | "PanelDoors" | "PocketDoors" | "RemoteControlledDoors" | "ScreenDoors" | "ServiceEntrance" | "SixPanelDoors" | "SlidingDoors" | "StormDoors" | "WideDoors";

/** 46 members · $metadata EnumType Electric */
export type CotalityEnum_Electric = "Amps100" | "Amps150" | "Amps200OrMore" | "Amps400" | "Amps600" | "Amps800" | "Amps801OrMore" | "BatteryBackup" | "CircuitBreakers" | "ElectricityOnBond" | "ElectricityOnProperty" | "EnergyStorageDevice" | "Fuses" | "Generator" | "GeneratorHookup" | "Heavy" | "Mixed" | "NetMeter" | "None" | "Other" | "Phases3" | "PhotovoltaicsNone" | "PhotovoltaicsOnGrid" | "PhotovoltaicsSellerOwned" | "PhotovoltaicsStandAlone" | "PhotovoltaicsThirdPartyOwned" | "PreWiredForRenewables" | "ReadyForRenewables" | "SeeRemarks" | "SeparateMeters" | "SinglePhase" | "Standard" | "Underground" | "Unknown" | "Volts110" | "Volts220" | "Volts220ForSpa" | "Volts220InGarage" | "Volts220InKitchen" | "Volts220InLaundry" | "Volts220InWorkshop" | "Volts220Other" | "Volts240" | "Volts440" | "WindTurbineSellerOwned" | "WindTurbineThirdPartyOwned";

/** 152 members · $metadata EnumType ExteriorFeatures */
export type CotalityEnum_ExteriorFeatures = "Arbor" | "Awnings" | "Balcony" | "Barbecue" | "BasketballCourt" | "BlacktopDriveway" | "BoatLift" | "BoatLock" | "BoatRamp" | "BoatSlip" | "Breezeway" | "BrickDriveway" | "BuildingAwnings" | "BuildingBalcony" | "BuildingBarbecue" | "BuildingBasketballCourt" | "BuildingBoatSlip" | "BuildingBuiltInBarbecue" | "BuildingCourtyard" | "BuildingCoveredCourtyard" | "BuildingDock" | "BuildingDogRun" | "BuildingElectricGrill" | "BuildingFirePit" | "BuildingGarden" | "BuildingGasGrill" | "BuildingGrayWaterSystem" | "BuildingKennel" | "BuildingLighting" | "BuildingMistingSystem" | "BuildingNone" | "BuildingOther" | "BuildingOutdoorGrill" | "BuildingOutdoorKitchen" | "BuildingOutdoorShower" | "BuildingPermeablePaving" | "BuildingPlayground" | "BuildingRainBarrelCisterns" | "BuildingRainGutters" | "BuildingRoofDeck" | "BuildingRvHookup" | "BuildingStorage" | "BuildingTennisCourts" | "BuildingUncoveredCourtyard" | "BuiltInBarbecue" | "BurglarBar" | "ChimneyCaps" | "CircularDriveway" | "Columns" | "ConcreteDriveway" | "CornerLot" | "Courtyard" | "CoveredCourtyard" | "CoveredPatio" | "Curb" | "Deck" | "DirtDriveway" | "Dock" | "DogRun" | "ElectricGrill" | "Elevator" | "EnclosedPorch" | "EntryFlatOrRampedAccess" | "ExteriorSteps" | "Fence" | "FirePit" | "FrenchPatioDoors" | "FruitTrees" | "FullyFenced" | "Garden" | "GasGrill" | "GolfCourseAccess" | "GravelDriveway" | "GrayWaterSystem" | "Greenhouse" | "GutterGuardSystem" | "HandicapAccessible" | "Hardscaping" | "HeatedDriveway" | "HeatedWalkway" | "HorseFacilities" | "HotTubSpa" | "InWallPestControlSystem" | "JulietBalcony" | "Kennel" | "KoiPond" | "LandscapeLights" | "Landscaping" | "Lighting" | "MatureTreesLandscape" | "MistingSystem" | "MultipleEntryFlatOrRamped" | "NoExteriorSteps" | "None" | "Other" | "OutBuildings" | "OutdoorGrill" | "OutdoorKitchen" | "OutdoorLivingArea" | "OutdoorShower" | "Patio" | "PavedDriveway" | "PermeablePaving" | "PlayStructure" | "Playground" | "Pool" | "Porch" | "Privacy" | "PrivacyWall" | "PrivateEntrance" | "PrivateOutdoorSpaceOver60Sqft" | "PrivateOutdoorSpaceUnder60Sqft" | "PrivateYard" | "PropaneTankLeased" | "PropaneTankOwned" | "RainBarrelCisterns" | "RainGutters" | "RoomForPool" | "RvHookup" | "RvParkingRvHookup" | "SatelliteDish" | "SecurityHighImpactDoors" | "SecurityLighting" | "SeeRemarks" | "Shed" | "ShuttersElectric" | "ShuttersManual" | "SideEntryAccess" | "Skirting" | "SlidingGlassPatioDoors" | "SmartCamerasRecording" | "SmartIrrigation" | "SmartLights" | "SmartLocks" | "SoundSystem" | "SportCourt" | "SprinklerIrrigation" | "StampedConcreteDriveway" | "StoneWall" | "Storage" | "StormSecurityShutters" | "StormShelter" | "StormWindowsDoors" | "StreetLamp" | "TarAndGravelDriveway" | "TennisCourts" | "TvAntenna" | "UncoveredCourtyard" | "UndergroundUtilities" | "UnpavedDriveway" | "WaterFeature" | "Workshop";

/** 56 members · $metadata EnumType Fencing */
export type CotalityEnum_Fencing = "AutomaticGate" | "AverageCondition" | "BackYard" | "BarbedWire" | "Block" | "Brick" | "ChainLink" | "Composite" | "CrossFenced" | "Decorative" | "DogRun" | "Electric" | "ExcellentCondition" | "FairCondition" | "Fenced" | "FrontYard" | "Full" | "GameFence" | "Gate" | "Glass" | "GoatType" | "GoodCondition" | "Grapestake" | "HighFence" | "Invisible" | "Livestock" | "LogFence" | "Masonry" | "Metal" | "Mixed" | "NeedsRepair" | "NewCondition" | "None" | "Other" | "Partial" | "PartialCross" | "Pasture" | "Perimeter" | "PetFence" | "Picket" | "Pipe" | "Privacy" | "RanchFence" | "RvGate" | "Security" | "SeeRemarks" | "SlumpStone" | "SplitRail" | "Stone" | "StuccoWall" | "Vinyl" | "Wall" | "Wire" | "Wood" | "WroughtIron" | "YardFenced";

/** 5 members · $metadata EnumType FhaEligibility */
export type CotalityEnum_FhaEligibility = "Approved" | "ConditionallyApproved" | "Rejected" | "Unknown" | "Withdrawn";

/** 5 members · $metadata EnumType FinancialDataSource */
export type CotalityEnum_FinancialDataSource = "Accountant" | "Other" | "Owner" | "PropertyManager" | "SeeRemarks";

/** 79 members · $metadata EnumType FireplaceFeatures */
export type CotalityEnum_FireplaceFeatures = "Basement" | "Bath" | "Bedroom" | "BlowerFan" | "BonusRoom" | "Brass" | "Ceramic" | "Circulating" | "Coal" | "Custom" | "Decorative" | "Den" | "DiningRoom" | "DoubleSided" | "Electric" | "Entrance" | "EpaCertifiedWoodStove" | "EpaQualifiedFireplace" | "FactoryBuilt" | "FamilyLivingGreatRoom" | "FamilyRoom" | "FirePit" | "FireplaceEquipment" | "FireplaceScreen" | "FreeStanding" | "Gas" | "GasLog" | "GasStarter" | "GlassDoors" | "Grate" | "GreatRoom" | "GuestAccommodations" | "HearthRoom" | "Heatilator" | "Insert" | "KeepingRoom" | "Kitchen" | "Kiva" | "Library" | "LivingRoom" | "Loft" | "LogBurning" | "LogLighter" | "LowerLevel" | "MainLevel" | "Mantle" | "Marble" | "Masonry" | "MasterBedroom" | "Metal" | "MultiSided" | "Multiple" | "None" | "Oak" | "One" | "Option" | "Other" | "Outside" | "PelletStove" | "PrimaryBedroom" | "Propane" | "RaisedHearth" | "RecreationRoom" | "RoughIn" | "SealedCombustion" | "SeeRemarks" | "SeeThrough" | "Stone" | "Stove" | "SunRoom" | "Three" | "Tile" | "Two" | "UpperLevel" | "Vented" | "Ventless" | "WoodBurning" | "WoodBurningStove" | "ZeroClearance";

/** 62 members · $metadata EnumType Flooring */
export type CotalityEnum_Flooring = "Adobe" | "Asphalt" | "Bamboo" | "Brick" | "Broadloom" | "Carpet" | "CarpetFree" | "CeramicTile" | "Clay" | "Combination" | "Concrete" | "Cork" | "CriGreenLabelPlusCertifiedCarpet" | "Cushion" | "Dirt" | "EngineeredHardwood" | "Epoxy" | "Flagstone" | "FloorScoreCertifiedFlooring" | "FscOrSfiCertifiedSourceHardwood" | "Granite" | "HardSurfaceFlooringOrLowPileCarpet" | "Hardwood" | "HeavyDuty" | "HeavyLoading" | "Laminate" | "Linoleum" | "LuxuryVinyl" | "LuxuryVinylPlank" | "LuxuryVinylTile" | "Marble" | "Metal" | "Mixed" | "None" | "Other" | "PaintedStained" | "Parquet" | "PartiallyCarpeted" | "Pavers" | "Plank" | "Plywood" | "PlywoodComposite" | "PorcelainTile" | "Quartz" | "ReclaimedWood" | "Resilient" | "SeeRemarks" | "SimulatedWood" | "Slate" | "Softwood" | "Stamped" | "Stone" | "Sustainable" | "Terrazzo" | "Tile" | "Travertine" | "Unfinished" | "Unknown" | "Varies" | "Vinyl" | "Wood" | "WoodVeneer";

/** 27 members · $metadata EnumType FoundationDetails */
export type CotalityEnum_FoundationDetails = "Basement" | "Block" | "BrickMortar" | "Cellar" | "Combination" | "ConcretePerimeter" | "Crawlspace" | "FhaApproved" | "HudApproved" | "None" | "NotPermanent" | "Other" | "PerimeterWall" | "Permanent" | "PierJacks" | "PillarPostPier" | "Poured" | "QuakeBracing" | "Raised" | "Sealed" | "SeeRemarks" | "Skirt" | "Slab" | "StemWall" | "Stone" | "TieDown" | "TreatedWood";

/** 3 members · $metadata EnumType FrontageLengthUnit */
export type CotalityEnum_FrontageLengthUnit = "Feet" | "Meters" | "Yards";

/** 14 members · $metadata EnumType FrontageType */
export type CotalityEnum_FrontageType = "BayHarbor" | "Canal" | "Conservation" | "GolfCourse" | "LagoonEstuary" | "Lakefront" | "Marina" | "Oceanfront" | "Other" | "ParkGreenbelt" | "Preservation" | "River" | "SeeRemarks" | "Waterfront";

/** 5 members · $metadata EnumType Furnished */
export type CotalityEnum_Furnished = "Furnished" | "FurnishedOrUnfurnished" | "Negotiable" | "Partially" | "Unfurnished";

/** 29 members · $metadata EnumType GreenBuildingVerificationType */
export type CotalityEnum_GreenBuildingVerificationType = "AustinEnergyGreenBuildingProgram" | "BuildGreenNewMexicoBronze" | "BuildGreenNewMexicoEmerald" | "BuildGreenNewMexicoGold" | "BuildGreenNewMexicoSilver" | "CertifiedPassiveHouse" | "EarthcraftHome" | "EnergyStarCertifiedHomes" | "Enerphit" | "EnvironmentsForLiving" | "HersIndexScore" | "HomeEnergyScore" | "HomeEnergyUpgradeCertificateOfEnergyEfficiencyImprovements" | "HomeEnergyUpgradeCertificateOfEnergyEfficiencyPerformance" | "HomePerformanceWithEnergyStar" | "IndoorAirplus" | "LeedForHomes" | "LivingBuildingChallenge" | "NahbGreenBuildingCertified" | "NgbsNewConstruction" | "NgbsSmallProjectsRemodel" | "NgbsWholeHomeRemodel" | "None" | "Other" | "PearlCertification" | "PhiusPlus" | "Unknown" | "Watersense" | "ZeroEnergyReadyHome";

/** 25 members · $metadata EnumType GreenEnergyEfficient */
export type CotalityEnum_GreenEnergyEfficient = "Appliances" | "Construction" | "Doors" | "EnergyRecoveryVentilator" | "ExposureShade" | "HealthyLivingFeatures" | "Hvac" | "Incentives" | "Insulation" | "Lighting" | "Materials" | "Other" | "RadiantAtticBarrier" | "RainFreezeSensors" | "Roof" | "SeeRemarks" | "SolarFeatures" | "SolarPanels" | "SolarPanelsLeased" | "SolarScreens" | "Sustainability" | "Thermostat" | "WaterConservation" | "WaterHeater" | "Windows";

/** 8 members · $metadata EnumType GreenEnergyGeneration */
export type CotalityEnum_GreenEnergyGeneration = "BatteryStorage" | "Geothermal" | "GridTied" | "None" | "Offgrid" | "Other" | "Solar" | "Wind";

/** 8 members · $metadata EnumType GreenIndoorAirQuality */
export type CotalityEnum_GreenIndoorAirQuality = "ContaminantControl" | "Filtration" | "IntegratedPestManagement" | "LowVocPaintMaterials" | "MoistureControl" | "RadonMitigationSystem" | "Ventilation" | "WholeHouseExhaustOnlyVentilation";

/** 5 members · $metadata EnumType GreenLocation */
export type CotalityEnum_GreenLocation = "CarChargingStation" | "None" | "Other" | "PublicTransportation" | "Walkability";

/** 9 members · $metadata EnumType GreenSustainability */
export type CotalityEnum_GreenSustainability = "BiodegradableMaterials" | "ConservingMethods" | "OnsiteRecyclingCenter" | "ProductiveVeggieGarden" | "RecyclableMaterials" | "RecycledMaterials" | "RegionallySourcedMaterials" | "RenewableMaterials" | "SalvagedMaterials";

/** 12 members · $metadata EnumType GreenWaterConservation */
export type CotalityEnum_GreenWaterConservation = "CompostingToilet" | "DualFlushToilet" | "EfficientHotWaterDistribution" | "GrayWaterSystem" | "GreenInfrastructure" | "LowFlowFixtures" | "LowVolumeDripIrrigation" | "Other" | "RainGardens" | "RainWaterCollection" | "WaterRecycling" | "WaterSmartLandscaping";

/** 96 members · $metadata EnumType Heating */
export type CotalityEnum_Heating = "ActiveSolar" | "Baseboard" | "BuildingCitySteam" | "BuildingDuctless" | "BuildingElectric" | "BuildingEnergyStarAccaRsiQualifiedInstallation" | "BuildingEnergyStarQualifiedEquipment" | "BuildingExhaustFan" | "BuildingFireplaces" | "BuildingForcedAir" | "BuildingGeothermal" | "BuildingGravity" | "BuildingHeatPump" | "BuildingHotWater" | "BuildingHumidityControl" | "BuildingKerosene" | "BuildingNaturalGas" | "BuildingNone" | "BuildingOil" | "BuildingOther" | "BuildingPassiveSolar" | "BuildingPropane" | "BuildingRadiant" | "BuildingRadiantCeiling" | "BuildingRadiantFloor" | "BuildingSeparateMeters" | "BuildingSolar" | "BuildingSteam" | "BuildingWood" | "BuildingZoned" | "Ceiling" | "Central" | "CitySteam" | "Coal" | "CoalStove" | "Combination" | "Common" | "DualSystem" | "Ductless" | "Electric" | "EnergyStarAccaRsiQualifiedInstallation" | "EnergyStarQualifiedEquipment" | "ExhaustFan" | "FanCoil" | "FireplaceInsert" | "Fireplaces" | "FloorFurnace" | "FloorRoughIn" | "ForcedAir" | "Gas" | "Geothermal" | "Gravity" | "HeatPump" | "HeatRecoverySystem" | "HeatRecoveryVentilator" | "HeatStrip" | "HeatingSourceRented" | "HighEfficiency" | "HotWater" | "HumidityControl" | "HydroAir" | "Individual" | "Kerosene" | "MakeUpAir" | "MidEfficiency" | "MultiFuel" | "MultipleHeatingUnits" | "NaturalGas" | "None" | "Oil" | "Other" | "OutdoorFurnace" | "OverheadHeaters" | "PassiveSolar" | "PelletStove" | "Propane" | "PropaneStove" | "Radiant" | "RadiantCeiling" | "RadiantFloor" | "Radiators" | "Rooftop" | "SeeAgent" | "SeeRemarks" | "SeparateMeters" | "SeparateUnits" | "Solar" | "SpaceHeater" | "Steam" | "Stove" | "VariesByUnit" | "WallFurnace" | "WindowUnit" | "Wood" | "WoodStove" | "Zoned";

/** 41 members · $metadata EnumType HorseAmenities */
export type CotalityEnum_HorseAmenities = "Arena" | "Barn" | "BoardingFacilities" | "Corrals" | "FederalLandAccess" | "Fenced" | "HayStorage" | "HorseTrack" | "HorsesAllowed" | "HotWalker" | "IndoorArena" | "LivestockBarn" | "LivestockTrough" | "LoafingShed" | "Lounge" | "Mirror" | "None" | "Office" | "Other" | "OutdoorArena" | "OutdoorLights" | "Paddocks" | "PalpationChute" | "Pasture" | "RegulationDressage" | "RidingRing" | "RidingTrail" | "RoundPen" | "SeeRemarks" | "ShavingBin" | "SpraySystem" | "Stables" | "StockPens" | "TackRoom" | "TrailerStorage" | "WashRack" | "WaterSource" | "Zoned1Horse" | "Zoned2Horse" | "Zoned3Horse" | "ZonedMultipleHorses";

/** 9 members · $metadata EnumType HoursDaysOfOperation */
export type CotalityEnum_HoursDaysOfOperation = "EveningsOnly" | "Open24Hours" | "Open7Days" | "Open8HoursDay" | "OpenLessThan8HoursDay" | "OpenMondayFriday" | "OpenMoreThan8HoursDay" | "OpenSaturday" | "OpenSunday";

/** 7 members · $metadata EnumType IncomeIncludes */
export type CotalityEnum_IncomeIncludes = "Laundry" | "Other" | "Parking" | "Recreation" | "RentOnly" | "RvStorage" | "Storage";

/** 299 members · Lookup catalogue for Property.InteriorFeatures (EnumType InteriorOrRoomFeatures declares 295; the Lookup publishes 299) */
export type CotalityLookup_Property_InteriorFeatures = "AccessibleClosets" | "AdditionalLivingQuarters" | "AirFiltration" | "AllBedroomsDown" | "AllBedroomsUp" | "ArchedDoorways" | "Atrium" | "Attic" | "Balcony" | "Bar" | "BathInMasterBedroom" | "BathInPrimaryBedroom" | "BathroomExhaustFan" | "BathroomRoughIn" | "BathroomonMainLevel" | "Bathtub" | "BayWindow" | "BeamedCeilings" | "BedroomOnMainLevel" | "BedroomonUpperLevel" | "Bidet" | "BlockWalls" | "Bookcases" | "BreakfastArea" | "BreakfastBar" | "BrickCounters" | "BrickWalls" | "BuiltInBunkBeds" | "BuiltInClosets" | "BuiltInFeatures" | "BuiltInShowerChair" | "BuiltInTrashRecycling" | "ButcherBlockCounters" | "ButlersPantry" | "CableTv" | "CarbonMonoxideDetector" | "CathedralCeilings" | "CedarClosets" | "CeilingFans" | "CeilingTrack" | "CentralVacuum" | "CentralVacuumRoughIn" | "CeramicBath" | "CeramicCounters" | "ChairRail" | "Chandelier" | "Closet" | "ClosetCabinetry" | "ClosetOrganizers" | "CoatCloset" | "CofferedCeilings" | "CommonEntry" | "ConcreteCounters" | "ConvertibleBedroom" | "CopperCounters" | "CountryKitchen" | "CoveCeiling" | "CrownMolding" | "CustomCabinets" | "CustomMirrors" | "DecorativeDesignerLightingFixtures" | "Den" | "DiningArea" | "DoubleHungCloset" | "DoubleSidedCloset" | "DoubleVanity" | "DressingArea" | "DropStaircase" | "DryBar" | "DualClosets" | "DualSinks" | "Dumbwaiter" | "EatInKitchen" | "EightPieceBathroom" | "ElectricOvenConnection" | "ElectricRangeConnection" | "Elevator" | "ElevatorShaft" | "EnSuiteBathroom" | "EnclosedToilet" | "EntranceFoyer" | "FamilyDiningRoom" | "FamilyRoomLowerLevel" | "FamilyRoomMainLevel" | "FireExtinguisher" | "Fireplace" | "FirstFloorEntry" | "FivePieceBathroom" | "FourPieceBathroom" | "FrenchDoorsAtriumDoors" | "FullBathOnMainLevel" | "Furnished" | "GalleyKitchen" | "GameRoom" | "GardenTubRomanTub" | "GasOvenConnection" | "GasRangeConnection" | "GourmetKitchen" | "GrabBarsAroundToilet" | "GrabBarsInShowerOrTub" | "GraniteCounters" | "GreatRoom" | "GreenhouseWindow" | "GuestAccommodations" | "HalfBathonMainLevel" | "HandHeldShowerHead" | "HandicapAccess" | "HeatedFloor" | "HighCeilings" | "HighSpeedInternet" | "HisAndHersClosets" | "HollywoodBath" | "HomeOffice" | "HomeTheater" | "HotTubSpa" | "HouseBoatFloatingHome" | "HumidityControlled" | "InLawFloorplan" | "InstantHotWater" | "Intercom" | "InteriorSteps" | "InternalExpansion" | "JackAndJillBath" | "JettedTub" | "KitchenDiningCombo" | "KitchenExhaustFan" | "KitchenFamilyRoomCombo" | "KitchenIsland" | "KitchenWindow" | "Kitchenette" | "LaminateCounters" | "LaminateCountertop" | "LaundryChute" | "Library" | "LiftOrStairChair" | "LimestoneCounters" | "LinenCloset" | "LivingDiningRoom" | "LivingRoomDeckAttached" | "Loft" | "LowFlowPlumbingFixtures" | "LowerLevelEntry" | "LuxuryTile" | "MainLevelMaster" | "MainLevelPrimary" | "MainLivingAreaEntryLevel" | "MainLivingAreaUpperLevel" | "MarbleCounters" | "MasterDownstairs" | "MasterSuite" | "MetalCountertop" | "MudRoom" | "MultiLevelBedroom" | "MultipleClosets" | "MultipleDiningAreas" | "MultipleEnSuiteBathrooms" | "MultipleLivingAreas" | "MultipleMasterSuites" | "MultiplePrimarySuites" | "MultipleShowerHeads" | "MultipleStaircases" | "MurphyBed" | "NaturalWoodwork" | "NewPaint" | "NoCloset" | "NoInteriorSteps" | "None" | "OnePieceBathroom" | "OpenBeamsBeamedCeailings" | "OpenConcept" | "OpenFloorplan" | "Other" | "OtherCounters" | "OversizedMaster" | "OversizedPrimary" | "PaintedWoodwork" | "PanelingWainscoting" | "Pantry" | "PartiallyFurnished" | "PermanentAtticStairs" | "PhoneSystem" | "PorcelainCounters" | "PotFiller" | "PotRack" | "PotsAndPanDrawers" | "PrimaryDownstairs" | "PrimarySuite" | "ProfessionallyDesigned" | "ProgrammableThermostat" | "PullDownAtticStairs" | "PullmanBath" | "QuartzCounters" | "QuartziteCounters" | "RecessedLighting" | "Remodeled" | "RollInShower" | "Sauna" | "SecondFloorEntry" | "SecondKitchen" | "SeeAgent" | "SeeRemarks" | "SelfClosingCabinetDoors" | "SelfClosingDrawers" | "SeparateFamilyRoom" | "SeparateFormalDiningRoom" | "SeparateFormalLivingRoom" | "SeparateHeatingControls" | "SeparateRoom" | "SeparateShower" | "SevenPieceBathroom" | "ShowerOnly" | "Shutters" | "SingleLivingLevel" | "Sink" | "SittingAreaInMaster" | "SittingAreaInPrimary" | "SixPieceBathroom" | "Skylights" | "SlidingDoors" | "SlidingGlassDoors" | "SmartCamerasRecording" | "SmartHome" | "SmartLights" | "SmartTechnologyForAccessibility" | "SmartThermostat" | "SmokeFree" | "SmoothCeilings" | "SoakingTub" | "SolarTubes" | "SolidSurfaceCounters" | "SoundSystem" | "SpecialMillwork" | "SplitBedrooms" | "StackedBedrooms" | "StainlessSteelAppliances" | "StainlessSteelCounters" | "StairClimber" | "StallShower" | "SteamShower" | "StoneCounters" | "Storage" | "StorageCloset" | "Study" | "SunRoom" | "SunkenBathtub" | "SunkenLivingRoom" | "SuspendedCeilings" | "Tandem" | "ThirdFloorEntry" | "ThreeBedroomsUp" | "ThreePieceBathroom" | "ThreeQuarterBathonMainLevel" | "TileCounters" | "TileCountertop" | "TiledShower" | "TongueAndGrooveCeilings" | "TrackLighting" | "TraditionalFloorplan" | "TrashChute" | "TravertineCounters" | "TrayCeilings" | "TubShower" | "TwoBedroomsDown" | "TwoBedroomsUp" | "TwoPieceBathroom" | "TwoStoryCeilings" | "UnfinishedWalls" | "Unfurnished" | "UpdatedKitchen" | "Upgraded" | "UpgradedCountertops" | "UpperLevelMaster" | "UpperLevelPrimary" | "UtilityRoom" | "UtilitySink" | "Vanity" | "VaultedCeilings" | "VinylCounters" | "WalkInBathtub" | "WalkInClosets" | "WalkInPantry" | "WalkInShower" | "WalkOut" | "WallMountedTv" | "WaterClosets" | "WaterSenseFixtures" | "WetBar" | "WideInteriorHallsAndDoors" | "WindowTreatments" | "WindowedBathroom" | "Windows" | "WineCellar" | "WiredForData" | "WiredForSound" | "WoodBurningStove" | "WoodCabinets" | "WoodCounters" | "WoodProductWalls" | "Workshop";

/** 21 members · $metadata EnumType IrrigationSource */
export type CotalityEnum_IrrigationSource = "CanalDitch" | "CommunitySystem" | "CreekStream" | "DeededWaterRights" | "ExtraCost" | "IncludedInAssessment" | "Lake" | "Metered" | "Municipal" | "None" | "Other" | "Pipeline" | "Pond" | "Private" | "ReclaimedWater" | "River" | "Seasonal" | "SeeRemarks" | "Shared" | "Spring" | "Well";

/** 3 members · $metadata EnumType LaborInformation */
export type CotalityEnum_LaborInformation = "EmployeeLicenseRequired" | "NonUnion" | "Union";

/** 50 members · $metadata EnumType LaundryFeatures */
export type CotalityEnum_LaundryFeatures = "AccessibleUtilitiesOrLaundry" | "BuildingCoinOperated" | "BuildingInBasement" | "BuildingInHall" | "BuildingInside" | "BuildingLowerLevel" | "BuildingMainLevel" | "BuildingMultipleLocations" | "BuildingNone" | "BuildingOther" | "BuildingOutside" | "BuildingUpperLevel" | "BuildingWasherDryerInstallAllowed" | "Cabinets" | "CoinOperated" | "CommonArea" | "CommonOnFloor" | "DryerHookup" | "ElectricDryerHookup" | "EnSuiteLaundry" | "GasDryerHookup" | "InBasement" | "InBathroom" | "InCarport" | "InGarage" | "InHall" | "InKitchen" | "InMudRoom" | "InUnit" | "Inside" | "LaundryChute" | "LaundryCloset" | "LaundryInUtilityRoom" | "LaundryLivingArea" | "LaundryRoom" | "LaundryTub" | "LowerLevel" | "MainLevel" | "MultipleLocations" | "None" | "Other" | "Outside" | "PropaneDryerHookup" | "SeeAgent" | "SeeRemarks" | "Sink" | "Stacked" | "UpperLevel" | "WasherDryerInstallAllowed" | "WasherHookup";

/** 5 members · $metadata EnumType LeaseRenewalCompensation */
export type CotalityEnum_LeaseRenewalCompensation = "CallListingAgent" | "CallListingOffice" | "CommissionPaidOnTenantPurchase" | "NoRenewalCommission" | "RenewalCommissionPaid";

/** 26 members · Lookup catalogue for Property.LeaseTerm (EnumType LeaseTerm declares 24; the Lookup publishes 26) */
export type CotalityLookup_Property_LeaseTerm = "Daily" | "Deposit" | "FiveYears" | "FourYears" | "Item5to10Years" | "LessThan1Year" | "LongTerm" | "MonthToMonth" | "MultipleYears" | "Negotiable" | "NineMonths" | "None" | "Other" | "OverSixYears" | "RenewalOption" | "Seasonal" | "SeeRemarks" | "ShortTermLease" | "SixMonths" | "Sublease" | "ThirtySixMonths" | "ThreeMonths" | "ThreeToFiveYears" | "TwelveMonths" | "TwentyFourMonths" | "Weekly";

/** 18 members · $metadata EnumType Levels */
export type CotalityEnum_Levels = "BiLevel" | "FiveLevelSplit" | "FourLevelSplit" | "MultiLevelUnit" | "MultiSplit" | "None" | "One" | "OneAndOneHalf" | "Other" | "QuadLevel" | "SingleLevelUnit" | "SplitLevel" | "ThreeLevelSplit" | "ThreeOrMore" | "TriLevel" | "Two" | "TwoAndOneHalf" | "TwoOrMore";

/** 11 members · $metadata EnumType ListingAgreement */
export type CotalityEnum_ListingAgreement = "CoExclusiveAgency" | "ExclusiveAgency" | "ExclusiveRightToLease" | "ExclusiveRightToSell" | "ExclusiveRightWithException" | "Net" | "NonExclusiveAgency" | "Open" | "Probate" | "PropertyManagement" | "SellerReserved";

/** 3 members · $metadata EnumType ListingService */
export type CotalityEnum_ListingService = "EntryOnly" | "FullService" | "LimitedService";

/** 67 members · $metadata EnumType ListingTerms */
export type CotalityEnum_ListingTerms = "AllFinancingConsidered" | "AllInclusiveTrustDeed" | "Arm" | "Assumable" | "BondForDeed" | "BuyerAssistancePrograms" | "CalVetLoan" | "Cash" | "CashToExistingLoan" | "CashToNewLoan" | "CommercialLease" | "CommittedFunds" | "Contract" | "Conventional" | "CourtApproval" | "Cryptocurrency" | "Exchange1031" | "ExistingBonds" | "FHA" | "FannieMae" | "FederalLandBank" | "Fha203b" | "Fha203k" | "FreddieMac" | "GovernmentLoan" | "GraduatedPaymentMortgage" | "InvestorFinancing" | "LandContract" | "LandUseFee" | "Lease" | "LeaseBack" | "LeaseOption" | "LeasePurchase" | "LenderApproval" | "LienRelease" | "NewLoan" | "Other" | "OwnerMayCarry" | "OwnerMayCarrySecond" | "OwnerPayPoints" | "OwnerSurvey" | "OwnerWillCarry" | "PortfolioLoan" | "PreQualified" | "PrivateFinancingAvailable" | "RehabFinancing" | "RelocationProperty" | "SbaTypeLoan" | "SeeAgent" | "SeeRemarks" | "SellerEquityShare" | "SpecialFunding" | "StateBond" | "SubjectToOther" | "Submit" | "Subordinate" | "TexasVet" | "ThirdPartyFinancing" | "Trade" | "TrustConveyance" | "TrustDeed" | "UsdaLoan" | "VaLoan" | "VaNoLoan" | "VaNoNoLoan" | "WarrantyDeed" | "ZeroDown";

/** 7 members · $metadata EnumType ListingURLDescription */
export type CotalityEnum_ListingURLDescription = "AgentWebsite" | "BrokerWebsite" | "BrokerageWebsite" | "FranchisorWebsite" | "MlsWebsite" | "OtherWebsite" | "SyndicationWebsite";

/** 11 members · $metadata EnumType LockBoxType */
export type CotalityEnum_LockBoxType = "CallListingOffice" | "CallSellerDirect" | "Combo" | "Electronic" | "LobbyBox" | "None" | "Other" | "Risco" | "SeeRemarks" | "Sentrilock" | "Supra";

/** 14 members · $metadata EnumType LotDimensionsSource */
export type CotalityEnum_LotDimensionsSource = "Appraiser" | "Assessor" | "Builder" | "Estimated" | "GisCalculated" | "ListingAgent" | "Measured" | "NotTaped" | "Other" | "Owner" | "Plans" | "PublicRecords" | "SeeRemarks" | "Survey";

/** 207 members · $metadata EnumType LotFeatures */
export type CotalityEnum_LotFeatures = "Acreage" | "AdditionalLandAvailable" | "AdjacentToOpenSpace" | "AdjacentToPublicLand" | "Agricultural" | "Airpark" | "Alley" | "BackYard" | "BacksToCommonGrounds" | "BacksToGreenbeltPark" | "BacksToTrees" | "BayFront" | "BeachFront" | "Bluff" | "BordersNationalForest" | "BordersStateLand" | "Buildable" | "BusinessPark" | "BuyerApprovalRequired" | "CattleGuard" | "CentralBusinessDistrict" | "CertifiedOrganicSoil" | "CityLot" | "ClaySoil" | "Cleared" | "CloseToClubhouse" | "CompactSoil" | "ConservationArea" | "CornerLot" | "CornersMarked" | "CulDeSac" | "DeadEnd" | "DesertBack" | "DesertFront" | "DesertLandscaping" | "Drainage" | "DripIrrigationBubblers" | "Easement" | "EasyAccess" | "ElevenToFifteenUnitsAcre" | "EstateLot" | "Farm" | "FewTrees" | "FiftyToOneHundred" | "FishingPonds" | "FishingRights" | "FiveToTenAcres" | "FlagLot" | "Flat" | "FloodZone" | "Foothills" | "FrontYard" | "FruitTrees" | "Garden" | "GentleSloping" | "Greenbelt" | "HalfToOneAcreLot" | "HardwoodTrees" | "HistoricDistrict" | "HorseProperty" | "IndustrialPark" | "InteriorLot" | "IrregularLot" | "Island" | "LakeErieFront" | "LakeFront" | "LakeOnLot" | "Landscaped" | "Lawn" | "LessThanHalfAcre" | "LessThanOneAcre" | "LessThanQuarterAcre" | "Levee" | "Level" | "LoamSoil" | "LotOver40000Sqft" | "LowMaintenanceLandscape" | "Mainland" | "ManufacturedHomePad" | "ManyTrees" | "MatureTrees" | "Meadow" | "MineralRights" | "MobileHomeAllowed" | "MobileHomeReady" | "ModerateTrees" | "MoreThanOneHundredAcres" | "MultipleLots" | "NativePlants" | "NearGolfCourse" | "NearPark" | "NearPublicTransit" | "NearSkiArea" | "Neighborhood" | "NoBackyardGrass" | "NoLandscaping" | "NoRearNeighbors" | "None" | "NotInSubdivision" | "OffGrid" | "OnGolfCourse" | "OneOrMoreAcres" | "OneToFiveAcres" | "OneToFourAcres" | "OneToThreeAcres" | "OneToTwoAcres" | "OpenLot" | "OpenSpace" | "Orchards" | "Other" | "OutsideCityLimits" | "Over40UnitsAcre" | "OversizedLot" | "PartiallyCleared" | "Pasture" | "Paved" | "PeatSoil" | "Percolate" | "PieShapedLot" | "PlannedUnitDevelopment" | "PondOnLot" | "Private" | "PrivateRoad" | "PublicMaintainedRoad" | "PublicRoad" | "QuarterToHalfAcreLot" | "QuarterToOneAcre" | "Ranch" | "Ravine" | "Recreational" | "Rectangular" | "RectangularLot" | "ResidentialLot" | "ResortProperty" | "RetainingWall" | "ReversePieShapedLot" | "RimLot" | "RockOutcropping" | "Rocks" | "RockySoil" | "RollingSlope" | "RoughGradeYard" | "RuralLot" | "RvLot" | "SandSoil" | "Secluded" | "SeeRemarks" | "SideYard" | "SiltSoil" | "SixToTenUnitsAcre" | "SixteenToTwentyUnitsAcre" | "SkiInSkiOut" | "Sloped" | "SlopedDown" | "SlopedUp" | "SplitPossible" | "Spring" | "SprinklerRainSensor" | "SprinklerSystem" | "SprinklersAutomatic" | "SprinklersInFront" | "SprinklersInGround" | "SprinklersInRear" | "SprinklersManual" | "SprinklersMultipleLocations" | "SprinklersNone" | "SprinklersOnSide" | "SprinklersPartial" | "SprinklersTimer" | "SquareShapedLot" | "SteepSlope" | "StreamCreek" | "StreetLevel" | "Subdivided" | "Subdivision" | "SuitableForGrazing" | "SyntheticGrass" | "TearDown" | "TenToTwentyAcres" | "TenToTwentyFive" | "ThirtyOneToThirtyFiveUnitsAcre" | "ThirtySixToFortyUnitsAcre" | "ThreeToFiveAcres" | "Tillable" | "Trees" | "TreesLargeSize" | "TreesMediumSize" | "TreesSmallSize" | "TwentyFiveToFiftyAcres" | "TwentyOneToTwentyFiveUnitsAcre" | "TwentySixToThirtyUnitsAcre" | "TwentyToFiftyAcres" | "TwoToFiveUnitsAcre" | "TwoToThreeAcres" | "Undeveloped" | "ValueInLand" | "Views" | "Walkstreet" | "Waterfall" | "Waterfront" | "Wetlands" | "Wooded" | "Xeriscape" | "Yard" | "YardLights" | "ZeroLotLine" | "ZeroToOneUnitAcre";

/** 14 members · Lookup catalogue for Property.MajorChangeType (EnumType ChangeType declares 16; the Lookup publishes 14) */
export type CotalityLookup_Property_MajorChangeType = "Active" | "ActiveUnderContract" | "BackOnMarket" | "Canceled" | "Closed" | "ComingSoon" | "Deleted" | "Expired" | "Hold" | "NewListing" | "Pending" | "PriceChange" | "StatusChange" | "Withdrawn";

/** 26 members · Lookup catalogue for Property.MlsStatus (EnumType MlsStatus declares 25; the Lookup publishes 26) */
export type CotalityLookup_Property_MlsStatus = "Active" | "ActiveOptionContract" | "ActiveUnderContract" | "AttorneyReview" | "Canceled" | "CanceledRelisted" | "Closed" | "ComingSoon" | "CompSold" | "Contingent" | "Delete" | "Expired" | "FirstLook" | "Hold" | "Incomplete" | "Leased" | "OptionPeriod" | "Pending" | "PendingBackupsRequested" | "PendingFeasibility" | "PendingInspection" | "PendingShortSale" | "PrepNoShow" | "PrepShow" | "Terminated" | "Withdrawn";

/** 13 members · $metadata EnumType MoveInCosts */
export type CotalityEnum_MoveInCosts = "AdditionalApplicationFee" | "AdministrationFee" | "ApplicationFee" | "AssociationDeposit" | "BackgroundCheck" | "CleaningFee" | "CreditCheck" | "FirstMonthRent" | "GuarantorOrCoSigner" | "LastMonthRent" | "Other" | "PetDeposit" | "SecurityDeposit";

/** 7 members · $metadata EnumType OccupantType */
export type CotalityEnum_OccupantType = "Annual" | "CallAgent" | "Occupied" | "Other" | "Owner" | "Tenant" | "Vacant";

/** 5 members · $metadata EnumType OngoingFees */
export type CotalityEnum_OngoingFees = "HoaFee" | "None" | "Other" | "ParkingFee" | "PetFee";

/** 39 members · $metadata EnumType OperatingExpenseIncludes */
export type CotalityEnum_OperatingExpenseIncludes = "Accounting" | "Advertising" | "Association" | "CableTv" | "CapitalImprovements" | "Depreciation" | "Electric" | "EquipmentRental" | "Fuel" | "FurnitureReplacement" | "Gardener" | "Insurance" | "Legal" | "Licenses" | "Maintenance" | "MaintenanceGrounds" | "MaintenanceStructure" | "Manager" | "MortgageLoans" | "NewTax" | "None" | "Other" | "Parking" | "PersonalPropertyTax" | "PestControl" | "PoolSpa" | "ProfessionalManagement" | "RealEstateTax" | "Rent" | "Security" | "SeeRemarks" | "SnowRemoval" | "Staff" | "Supplies" | "Trash" | "Utilities" | "VacancyAllowance" | "WaterSewer" | "WorkmansCompensation";

/** 35 members · $metadata EnumType OtherEquipment */
export type CotalityEnum_OtherEquipment = "AirPurifier" | "CallListingAgent" | "CompressedAirLines" | "Compressor" | "Coolers" | "DcWellPump" | "Dehumidifier" | "EmergencyLighting" | "EquipmentSoldSeparately" | "FarmEquipment" | "FuelTanks" | "Generator" | "Hoists" | "HomeTheater" | "HvacSystem" | "Intercom" | "IronRemovalSystem" | "IrrigationEquipment" | "ListAvailable" | "LivestockEquipment" | "Negotiable" | "None" | "NotApplicable" | "OrchardEquipment" | "Other" | "PropaneTank" | "ReverseOsmosisSystem" | "RotaryAntenna" | "SatelliteDish" | "TvAntenna" | "VariesByUnit" | "VentilationSystem" | "WaterSoftenerLoop" | "WheelLine" | "Workbench";

/** 59 members · $metadata EnumType OtherStructures */
export type CotalityEnum_OtherStructures = "AirplaneHangar" | "Apartment" | "Arena" | "Aviary" | "Barns" | "Bathroom" | "BoatHouse" | "Bunkhouse" | "Cabana" | "Cabin" | "Carports" | "CarriageHouse" | "Caves" | "Corrals" | "CoveredArena" | "GarageApartment" | "Garages" | "Gazebo" | "GrainStorage" | "Greenhouse" | "GuestHouse" | "GuestHouseAttached" | "GuestHouseDetached" | "KennelDogRun" | "Kennels" | "LivestockPens" | "LivingQuarters" | "ManufacturedHome" | "MobileHome" | "None" | "Other" | "Outbuilding" | "OutdoorKitchen" | "Outhouse" | "PackingShed" | "Pergola" | "PoleBarn" | "PoolHouse" | "PoultryCoop" | "Quonset" | "Residence" | "RvBoatStorage" | "SaunaPrivate" | "SecondGarage" | "SecondResidence" | "SeeRemarks" | "Sheds" | "SmokeHouse" | "Stables" | "Storage" | "StudioAttached" | "StudioDetached" | "StudioOffice" | "TennisCourts" | "TwoOnALot" | "UtilityBuildings" | "WellHouse" | "Workshop" | "Yurt";

/** 39 members · $metadata EnumType OwnerPays */
export type CotalityEnum_OwnerPays = "AirConditioning" | "AllUtilities" | "Assessments" | "AssociationFees" | "CableTv" | "CommonAreaMaintenance" | "EarthquakeInsurance" | "Electricity" | "ExteriorMaintenance" | "Garage" | "Gardener" | "Gas" | "GroundsCare" | "Heat" | "HotWater" | "HvacMaintenance" | "Insurance" | "Internet" | "JanitorialService" | "Laundry" | "Management" | "None" | "Other" | "OtherTax" | "ParkingFee" | "PestControl" | "PoolMaintenance" | "Recreational" | "Repairs" | "RoofMaintenance" | "Security" | "SeeRemarks" | "Sewer" | "SnowRemoval" | "Supplies" | "Taxes" | "Telephone" | "TrashCollection" | "Water";

/** 13 members · $metadata EnumType OwnershipType */
export type CotalityEnum_OwnershipType = "CoOwnership" | "Common" | "Corporation" | "FeeSimple" | "Fractional" | "Franchise" | "LimitedPartnership" | "Llc" | "Partnership" | "Private" | "Reo" | "SeeRemarks" | "SoleProprietor";

/** 204 members · $metadata EnumType ParkingFeatures */
export type CotalityEnum_ParkingFeatures = "AccessibleParking" | "AdditionalParking" | "Aggregate" | "AirConditionedGarage" | "AlleyAccess" | "Asphalt" | "Assigned" | "Attached" | "AttachedCarport" | "AutomatedParkingSystem" | "Barn" | "Basement" | "BathInGarage" | "BedroomInGarage" | "Boat" | "Brick" | "BuildingAdditionalParking" | "BuildingAlleyAccess" | "BuildingAsphalt" | "BuildingAssigned" | "BuildingAttached" | "BuildingAttachedCarport" | "BuildingBasement" | "BuildingCarport" | "BuildingCircularDriveway" | "BuildingCommon" | "BuildingCommunityStructure" | "BuildingConcrete" | "BuildingConvertedGarage" | "BuildingCovered" | "BuildingDeck" | "BuildingDeeded" | "BuildingDetached" | "BuildingDetachedCarport" | "BuildingDirectAccess" | "BuildingDriveThrough" | "BuildingDriveway" | "BuildingElectricGate" | "BuildingElectricVehicleChargingStations" | "BuildingEnclosed" | "BuildingGarage" | "BuildingGarageDoorOpener" | "BuildingGarageFacesFront" | "BuildingGarageFacesRear" | "BuildingGarageFacesSide" | "BuildingGated" | "BuildingGravel" | "BuildingGuest" | "BuildingHeatedGarage" | "BuildingInsideEntrance" | "BuildingLeased" | "BuildingLighted" | "BuildingNoGarage" | "BuildingNone" | "BuildingOffSite" | "BuildingOffStreet" | "BuildingOnSite" | "BuildingOnStreet" | "BuildingOpen" | "BuildingOther" | "BuildingOutside" | "BuildingOversized" | "BuildingParkingLot" | "BuildingParkingPad" | "BuildingPaved" | "BuildingPaverBlock" | "BuildingPermitRequired" | "BuildingPrivate" | "BuildingRvGated" | "BuildingSecured" | "BuildingSharedDriveway" | "BuildingSideBySide" | "BuildingStorage" | "BuildingTandem" | "BuildingUnassigned" | "BuildingUnderground" | "BuildingUnpaved" | "BuildingValet" | "BuildingVariesByUnit" | "BuiltIn" | "Carport" | "CircularDriveway" | "Common" | "CommunityStructure" | "Concrete" | "ControlledEntrance" | "ConvertedGarage" | "Covered" | "Deck" | "Deeded" | "Detached" | "DetachedCarport" | "DirectAccess" | "DoorMulti" | "DoorSingle" | "Drain" | "DriveThrough" | "Driveway" | "DrivewayBlind" | "DrivewayDownSlopeFromStreet" | "DrivewayLevel" | "DrivewayUpSlopeFromStreet" | "ElectricGate" | "ElectricVehicleChargingStations" | "Electricity" | "Enclosed" | "EntrySwingIn" | "EpoxyFlooring" | "ExteriorAccessDoor" | "Fenced" | "FinishedGarage" | "FiveCarGarage" | "FourCarGarage" | "FourOrMoreSpaces" | "FreeParking" | "FrontEntry" | "Garage" | "GarageAvailable" | "GarageDoorOpener" | "GarageDoorWifi" | "GarageFacesFront" | "GarageFacesRear" | "GarageFacesSide" | "Gated" | "GolfCartGarage" | "Gravel" | "Guarded" | "Guest" | "Handicap" | "HeatedGarage" | "Indoor" | "InsideEntrance" | "InsulatedGarage" | "Interlock" | "KitchenInGarage" | "KitchenLevel" | "Leased" | "Lift" | "Lighted" | "MainLevelGarage" | "Metered" | "MultiLevel" | "NoDriveway" | "NoGarage" | "None" | "OffSite" | "OffStreet" | "OnSite" | "OnStreet" | "OneAndOneHalfSpaces" | "OneCarGarage" | "OneSpace" | "Open" | "Other" | "Outside" | "Oversized" | "Parkade" | "ParkingAvailable" | "ParkingFee" | "ParkingGarage" | "ParkingLot" | "ParkingPad" | "ParkingSpaces" | "Paved" | "PaverBlock" | "PermitRequired" | "PorteCochere" | "Private" | "Public" | "PullThrough" | "RearSideOffStreet" | "RvAccessParking" | "RvCarport" | "RvCovered" | "RvGarage" | "RvGated" | "RvHookUps" | "RvPaved" | "RvPotential" | "Secured" | "SeeRemarks" | "SharedDriveway" | "Shelves" | "SideBySide" | "SixCarGarage" | "Storage" | "Surfaced" | "Tandem" | "ThreeCarGarage" | "ThreeOrMoreSpaces" | "TruckParking" | "TuckUnderGarage" | "TwoCarGarage" | "TwoOrMoreSpaces" | "TwoSpaces" | "Unassigned" | "Uncovered" | "Underground" | "UnfinishedGarage" | "Unpaved" | "Valet" | "VariesByUnit" | "WaterAvailable" | "WorkshopInGarage";

/** 53 members · $metadata EnumType PatioAndPorchFeatures */
export type CotalityEnum_PatioAndPorchFeatures = "ArizonaRoom" | "Awnings" | "Balcony" | "Bar" | "Brick" | "BuildingCovered" | "BuildingDeck" | "BuildingEnclosed" | "BuildingFrontPorch" | "BuildingGlassEnclosed" | "BuildingNone" | "BuildingOther" | "BuildingPatio" | "BuildingPorch" | "BuildingRearPorch" | "BuildingScreened" | "BuildingSidePorch" | "BuildingTerrace" | "BuildingWrapAround" | "Composite" | "Concrete" | "Covered" | "CoveredPorch" | "Deck" | "Enclosed" | "FourSeason" | "FrontPorch" | "GlassEnclosed" | "Heated" | "Lanai" | "MosquitoSystem" | "Multiple" | "None" | "Open" | "Other" | "Oversized" | "Patio" | "Pavers" | "Porch" | "RearPorch" | "Refrigerator" | "Rooftop" | "Screened" | "SeeRemarks" | "Shower" | "SidePorch" | "Stone" | "Stoop" | "Terrace" | "ThreeSeason" | "Tile" | "Wood" | "WrapAround";

/** 31 members · $metadata EnumType PetsAllowed */
export type CotalityEnum_PetsAllowed = "BirdsOk" | "BreedRestrictions" | "BuildingBreedRestrictions" | "BuildingCatsOk" | "BuildingDogsOk" | "BuildingNo" | "BuildingNumberLimit" | "BuildingSizeLimit" | "BuildingYes" | "Call" | "CatsOk" | "ChickensOk" | "Conditional" | "DogsOk" | "FishOk" | "Negotiable" | "No" | "NoBreedRestrictions" | "NoDogs" | "NoPetRestrictions" | "NoSizeLimit" | "NumberLimit" | "Other" | "OwnerOnly" | "PetDeposit" | "PetFee" | "PetRestrictions" | "ReptileOk" | "SeeRemarks" | "SizeLimit" | "Yes";

/** 88 members · $metadata EnumType PoolFeatures */
export type CotalityEnum_PoolFeatures = "AboveGround" | "Association" | "AutomaticChlorination" | "BlackBottom" | "BuildingAboveGround" | "BuildingBlackBottom" | "BuildingCabana" | "BuildingDivingBoard" | "BuildingElectricHeat" | "BuildingEnergyStarQualifiedPoolPump" | "BuildingFenced" | "BuildingFiberglass" | "BuildingFiltered" | "BuildingGasHeat" | "BuildingGunite" | "BuildingHeated" | "BuildingInGround" | "BuildingIndoor" | "BuildingInfinity" | "BuildingLap" | "BuildingLiner" | "BuildingNone" | "BuildingOther" | "BuildingOutdoorPool" | "BuildingPoolCover" | "BuildingPoolSpaCombo" | "BuildingPoolSweep" | "BuildingSaltWater" | "BuildingScreenEnclosure" | "BuildingSolarCover" | "BuildingSolarHeat" | "BuildingSport" | "BuildingTile" | "BuildingVinyl" | "BuildingWaterfall" | "Cabana" | "CleaningSystem" | "Clubhouse" | "Cocktail" | "Community" | "Concrete" | "DivingBoard" | "ElectricHeat" | "EnergyStarQualifiedPoolPump" | "Fenced" | "Fiberglass" | "Filtered" | "FreeForm" | "GasHeat" | "Gunite" | "Heated" | "HeatedPassively" | "InGround" | "Indoor" | "Infinity" | "Lap" | "Liner" | "NegativeEdge" | "NoPermits" | "None" | "Other" | "OutdoorPool" | "OutsideBathAccess" | "Pebble" | "Permits" | "Pool" | "PoolAlarm" | "PoolCover" | "PoolEquipment" | "PoolSpaCombo" | "PoolSweep" | "Private" | "PropaneHeat" | "ResidentsOnly" | "RoofTop" | "SaltWater" | "ScreenEnclosure" | "SeeAgent" | "SeeRemarks" | "Slide" | "SolarCover" | "SolarHeat" | "Sport" | "Therapeutic" | "Tile" | "Vinyl" | "WaterFeature" | "Waterfall";

/** 39 members · $metadata EnumType Possession */
export type CotalityEnum_Possession = "BeforeClosing" | "CloseOfEscrow" | "ClosePlus" | "ClosePlus15Days" | "ClosePlus1Day" | "ClosePlus20Days" | "ClosePlus2Days" | "ClosePlus30Days" | "ClosePlus30To120Days" | "ClosePlus30To45Days" | "ClosePlus30To60Days" | "ClosePlus30To90Days" | "ClosePlus3Days" | "ClosePlus3To5Days" | "ClosePlus45Days" | "ClosePlus45To90Days" | "ClosePlus5To30Days" | "ClosePlus60Days" | "ClosePlus60To90Days" | "ClosePlus90Days" | "ClosePlus90To120Days" | "CloseThrough30Days" | "CloseThrough45Days" | "CloseThrough60Days" | "CloseThrough90Days" | "Closing" | "ClosingAndFunding" | "DeliveryOfDeed" | "Immediately" | "Negotiable" | "Other" | "Over90Days" | "RentalAgreement" | "SeeAgent" | "SeeRemarks" | "SellerRentBack" | "SpecifiedDate" | "SubjectToTenantRights" | "TimeOfTransfer";

/** 2 members · $metadata EnumType PowerProductionType */
export type CotalityEnum_PowerProductionType = "Photovoltaics" | "Wind";

/** 27 members · $metadata EnumType PropertyCondition */
export type CotalityEnum_PropertyCondition = "AdditionsAlterations" | "AverageCondition" | "BelowAverage" | "BuildingPermit" | "Excellent" | "Fixer" | "GoodCondition" | "KnownDamage" | "NeverOccupied" | "NewConstruction" | "Other" | "PoorCondition" | "RepairsCosmetic" | "RepairsMajor" | "Resale" | "SeeDisclosure" | "SeeRemarks" | "ShowsWell" | "TearDownValueInLand" | "TermiteClearance" | "ToBeBuilt" | "Turnkey" | "UnderConstruction" | "UnderRenovation" | "Unknown" | "UpdatedRemodeled" | "VeryGoodCondition";

/** 33 members · $metadata EnumType RentIncludes */
export type CotalityEnum_RentIncludes = "Advertising" | "AirConditioning" | "AllUtilities" | "AssociationDues" | "BuildingMaintenance" | "CableTv" | "CommonAreaMaintenance" | "Electricity" | "FitnessCenter" | "Gardener" | "Gas" | "Heat" | "HotWater" | "Hvac" | "Insurance" | "Internet" | "LaundryFacilities" | "MaidService" | "Management" | "None" | "Other" | "Parking" | "PestControl" | "Pool" | "Recycling" | "SecuritySystem" | "SeeRemarks" | "Sewer" | "SnowRemoval" | "SomeUtilities" | "Taxes" | "TrashCollection" | "Water";

/** 29 members · $metadata EnumType RoadFrontageType */
export type CotalityEnum_RoadFrontageType = "AccessIsSeasonal" | "AllWeatherRoad" | "Alley" | "CityStreet" | "CountryRoad" | "CountyRoad" | "CulDeSac" | "DeededAccess" | "Easement" | "FarmToMarketRoad" | "Freeway" | "FrontageRoad" | "Highway" | "Interchange" | "Interstate" | "MainThoroughfare" | "None" | "NotApplicable" | "Other" | "PrivateRoad" | "PublicRoad" | "RightOfWay" | "SeeRemarks" | "ServiceRoad" | "Shared" | "StateRoad" | "TownRoad" | "Unimproved" | "YearRound";

/** 5 members · $metadata EnumType RoadResponsibility */
export type CotalityEnum_RoadResponsibility = "NoWinterMaintenance" | "None" | "PrivateMaintainedRoad" | "PublicMaintainedRoad" | "RoadMaintenanceAgreement";

/** 16 members · $metadata EnumType RoadSurfaceType */
export type CotalityEnum_RoadSurfaceType = "AlleyPaved" | "Asphalt" | "Caliche" | "ChipAndSeal" | "Concrete" | "Dirt" | "Graded" | "Gravel" | "Maintained" | "None" | "NotMaintained" | "Other" | "Paved" | "SeeRemarks" | "Shell" | "Unimproved";

/** 51 members · Lookup catalogue for Property.Roof (EnumType Roof declares 50; the Lookup publishes 51) */
export type CotalityLookup_Property_Roof = "Aluminum" | "Architectural" | "AsbestosShingle" | "Asphalt" | "Bahama" | "Barrel" | "Bitumen" | "Bituthene" | "BuiltUp" | "Clay" | "CommonRoof" | "Composition" | "Concrete" | "Copper" | "Corrugated" | "Elastomeric" | "Fiberglass" | "FireProof" | "Flat" | "FlatTile" | "Foam" | "Fortified" | "GreenRoof" | "Insulated" | "Mansard" | "Membrane" | "Metal" | "Mixed" | "None" | "Other" | "Pitched" | "Reflective" | "RidgeVents" | "RolledHotMop" | "RoofOver" | "Rubber" | "SeeRemarks" | "Shake" | "Shingle" | "Slate" | "SpanishTile" | "StandingSeam" | "SteelTrusses" | "Stone" | "Synthetic" | "TLock" | "TarGravel" | "Tile" | "Vented" | "Wood" | "WoodTrusses";

/** 122 members · Lookup catalogue for Property.RoomType (EnumType RoomType declares 121; the Lookup publishes 122) */
export type CotalityLookup_Property_RoomType = "AdditionalRoom" | "AdditlLivingSuite" | "ArtStudio" | "Atrium" | "Attic" | "Bar" | "Basement" | "Bathroom" | "Bathroom1" | "Bathroom2" | "Bathroom3" | "Bathroom4" | "Bathroom5" | "Bathroom6" | "BathroomRoughIn" | "Bedroom" | "Bedroom1" | "Bedroom10" | "Bedroom11" | "Bedroom12" | "Bedroom13" | "Bedroom14" | "Bedroom15" | "Bedroom2" | "Bedroom3" | "Bedroom4" | "Bedroom5" | "Bedroom6" | "Bedroom7" | "Bedroom8" | "Bedroom9" | "BilliardRoom" | "BonusRoom" | "BreakfastRoomNook" | "Breezeway" | "CarolinaRoom" | "CenterHall" | "ColdRoom" | "ComputerRoom" | "Conservatory" | "ConvertedBedroom" | "ConvertedGarage" | "DanceStudio" | "Darkroom" | "Den" | "Dinette" | "DiningRoom" | "EatInKitchen" | "EnSuiteBathroom" | "EntryFoyer" | "ExerciseRoom" | "FamilyRoom" | "FloridaRoom" | "FourSeason" | "Foyer" | "FullBath" | "GameRoom" | "Garage" | "GarageApartment" | "GreatRoom" | "GuestQuarters" | "Gym" | "HalfBath" | "Hall" | "HearthRoom" | "HotTubSpa" | "InLawSuite" | "KeepingRoom" | "Kitchen" | "Kitchenette" | "Laundry" | "LeisureRoom" | "Library" | "LivingRoom" | "Loft" | "MasterBathroom" | "MasterBedroom" | "MasterFullBath" | "MasterHalfBath" | "MasterQuarterBath" | "MasterThreeQtrBath" | "MediaRoom" | "MudRoom" | "MusicRoom" | "None" | "Nursery" | "Office" | "OneQuarterBath" | "Other" | "PanicRoom" | "Pantry" | "Patio" | "Porch" | "PowderRoom" | "PrimaryBathroom" | "PrimaryBedroom" | "PrimaryFullBath" | "PrimaryHalfBath" | "PrimaryQuarterBath" | "PrimaryThreeQtrBath" | "ProjectionRoom" | "Recreation" | "Retreat" | "Sauna" | "ScreenedPorch" | "SeparateApartment" | "SittingRoom" | "SoundStudio" | "SpiceKitchen" | "SteamRoom" | "StorageRoom" | "Studio" | "Study" | "SummerKitchen" | "Sunroom" | "ThreeQuarterBath" | "ThreeSeason" | "Unfinished" | "UtilityRoom" | "WineCellar" | "WineRoom" | "Workshop";

/** 6 members · $metadata EnumType SaleOrLeaseIndicator */
export type CotalityEnum_SaleOrLeaseIndicator = "Both" | "ForLease" | "ForSale" | "ForSaleOrLease" | "Lease" | "Sale";

/** 84 members · $metadata EnumType SecurityFeatures */
export type CotalityEnum_SecurityFeatures = "BuildingCarbonMonoxideDetectors" | "BuildingClosedCircuitCameras" | "BuildingFireAlarm" | "BuildingFireEscape" | "BuildingFireSprinklerSystem" | "BuildingFirewalls" | "BuildingIntercom" | "BuildingKeyFobEntry" | "BuildingNone" | "BuildingOther" | "BuildingPanicAlarm" | "BuildingPrewired" | "BuildingSecuredGarageParking" | "BuildingSecurity" | "BuildingSecurityFence" | "BuildingSecurityGate" | "BuildingSecurityLights" | "BuildingSecuritySystem" | "BuildingSmartLocks" | "BuildingSmokeDetectors" | "BuildingSurveillanceSystem" | "BuildingWindowBars" | "BuildingWindowBarsWithQuickRelease" | "BurglarAlarmMonitored" | "CarbonMonoxideDetectors" | "ClosedCircuitCameras" | "ComplexFenced" | "ControlledAccess" | "DeadBolts" | "DoorBuzzer" | "DoorMan" | "ElevatorSecured" | "Fenced" | "FireAlarm" | "FireDetectionSystem" | "FireEscape" | "FireHydrants" | "FireRatedDrywall" | "FireSprinklerSystem" | "Firewalls" | "FloorAccessControl" | "GarageSecured" | "GatedCommunity" | "GatedWithAttendant" | "GatedWithGuard" | "HeatDetector" | "Intercom" | "KeyCardEntry" | "LobbySecured" | "MedicalAlarm" | "Monitored" | "MotionDetectors" | "NoSafetyShelter" | "None" | "Other" | "PanicAlarm" | "PhoneEntry" | "Prewired" | "RadonMitigationSystem" | "ResidentManager" | "SafeRoomExterior" | "SafeRoomInterior" | "SecuredGarageParking" | "SecuredYard" | "SecurityDoor" | "SecurityFence" | "SecurityGate" | "SecurityGuard" | "SecurityLights" | "SecurityService" | "SecuritySystem" | "SecuritySystemLeased" | "SecuritySystemOwned" | "SeeRemarks" | "SmokeDetectors" | "StormShelter" | "StormShelterExterior" | "StormShelterInterior" | "SurveillanceSystem" | "TwentyFourHourSecurity" | "VariesByUnit" | "WindowBars" | "WindowBarsWithQuickRelease" | "Wireless";

/** 55 members · $metadata EnumType Sewer */
export type CotalityEnum_Sewer = "AerobicSeptic" | "AssessmentPaid" | "AssessmentUnpaid" | "CallAgent" | "Cesspool" | "CommunityCoopSewer" | "Connected" | "ConventionalSewer" | "CountySepticMaintenanceProgramNo" | "CountySepticMaintenanceProgramYes" | "CountySewer" | "EngineeredSeptic" | "GrinderPump" | "HoldingTank" | "Lagoon" | "LiftStation" | "MoundSeptic" | "MunicipalUtilityDistrict" | "NeedsSeptic" | "None" | "NotConnected" | "NotConnectedAtLot" | "NotConnectedNearby" | "OpenDischarge" | "Other" | "PercTestOnFile" | "PercTestRequired" | "PrivateSewer" | "PublicSewer" | "Rural" | "Sanitary" | "SeeRemarks" | "SepticApprovalRequired" | "SepticApproved" | "SepticNeeded" | "SepticPermit" | "SepticPermit1Bedroom" | "SepticPermit2Bedroom" | "SepticPermit3Bedroom" | "SepticPermit4Bedroom" | "SepticPermit5OrMoreBedroom" | "SepticPermitUnavailable" | "SepticTank" | "SepticTypeUnknown" | "SewerAppliedForPermit" | "SewerAssessments" | "SewerOnBond" | "SewerTapFee" | "SewerTapPaid" | "SharedSeptic" | "SoilsAnalysisSeptic" | "StormSewer" | "TreatmentPlant" | "Unknown" | "Wetland";

/** 14 members · $metadata EnumType ShowingConsiderations */
export type CotalityEnum_ShowingConsiderations = "DaySleeper" | "ElectricityNotOn" | "InconsistentCellService" | "LimitedVisibilityFromRoad" | "MinimalExteriorLighting" | "MinimalInteriorLighting" | "NoExteriorLighting" | "NoHeat" | "NoInteriorLighting" | "Occupied" | "PetsOnPremises" | "RemoteLocation" | "SecuritySystem" | "SeeRemarks";

/** 15 members · $metadata EnumType ShowingContactType */
export type CotalityEnum_ShowingContactType = "Agent" | "Business" | "Family" | "Friend" | "Lead" | "None" | "Occupant" | "Office" | "Other" | "Owner" | "PropertyManager" | "Prospect" | "ReadyToBuy" | "SeeRemarks" | "ShowingService";

/** 7 members · $metadata EnumType ShowingDays */
export type CotalityEnum_ShowingDays = "Friday" | "Monday" | "Saturday" | "Sunday" | "Thursday" | "Tuesday" | "Wednesday";

/** 40 members · Lookup catalogue for Property.ShowingRequirements (EnumType ShowingRequirements declares 39; the Lookup publishes 40) */
export type CotalityLookup_Property_ShowingRequirements = "AppointmentOnly" | "CallBeforeShowing" | "CallListingAgent" | "CallListingOffice" | "CallManager" | "CallOwner" | "CallTenant" | "CombinationLockBox" | "DaySleeper" | "DelayedShowing" | "DoNotDisturbTenant" | "DoNotShow" | "DriveBy" | "EmailListingAgent" | "FortyEightHourNotice" | "GoDirect" | "InPersonAndLiveVideo" | "KeyInOffice" | "KeyWithGateGuard" | "ListingAgentPresent" | "LiveVideoOnly" | "Lockbox" | "NoLockbox" | "NoSign" | "None" | "Occupied" | "Other" | "PetsOnPremises" | "RestrictedHours" | "SecuritySystem" | "SeeRemarks" | "SeeShowingInstructions" | "ShowAnytime" | "ShowingService" | "Showingtime" | "TextListingAgent" | "ToBeBuilt" | "TwentyFourHourNotice" | "UnderConstruction" | "Vacant";

/** 11 members · $metadata EnumType ShowingServiceName */
export type CotalityEnum_ShowingServiceName = "AlignedShowings" | "BrokerBay" | "HomeSnap" | "InstaShowing" | "LocalShowing" | "None" | "Other" | "SentrikeyShowing" | "ShowingTime" | "Showingly" | "Touchbase";

/** 25 members · $metadata EnumType Skirt */
export type CotalityEnum_Skirt = "Alcan" | "Aluminum" | "Block" | "Brick" | "CementBoard" | "Combination" | "Concrete" | "Fiberglass" | "Flagstone" | "Frame" | "Glass" | "Masonite" | "Metal" | "None" | "Other" | "SeeRemarks" | "Siding" | "Steel" | "Stone" | "Stucco" | "Synthetic" | "Unknown" | "Veneer" | "Vinyl" | "Wood";

/** 24 members · $metadata EnumType SpaFeatures */
export type CotalityEnum_SpaFeatures = "AboveGround" | "Association" | "Bath" | "Community" | "Conventional" | "ElectricHeat" | "Fiberglass" | "GasHeat" | "Gunite" | "Heated" | "HotTub" | "InGround" | "IndoorHotTub" | "NoPermits" | "None" | "OutdoorHotTub" | "Permits" | "Private" | "RoofTop" | "Sauna" | "Screened" | "SeeRemarks" | "SolarHeat" | "SteamRoom";

/** 19 members · $metadata EnumType SpecialLicenses */
export type CotalityEnum_SpecialLicenses = "BeerWine" | "City" | "ClassH" | "County" | "Entertainment" | "Franchise" | "Gambling" | "Liquor" | "Liquor5YearsOrLess" | "Liquor5YearsOrMore" | "LiquorOffSale" | "LiquorOnSale" | "None" | "Occupational" | "Other" | "Professional" | "SeeAgent" | "SeeRemarks" | "State";

/** 34 members · $metadata EnumType SpecialListingConditions */
export type CotalityEnum_SpecialListingConditions = "AffordableHousingSubsidy" | "AllowanceFlooring" | "AllowanceRoofing" | "Auction" | "BankruptcyProperty" | "BoardApprovalNotRequired" | "BoardApprovalRequired" | "BuilderOwned" | "Conservatorship" | "CorporateListing" | "Estate" | "GovernmentOwned" | "GseOwned" | "HudOwned" | "InForeclosure" | "ListedAsIs" | "Model" | "NoSmoking" | "None" | "NoticeOfDefault" | "Other" | "PetRestrictions" | "PreForeclosure" | "ProbateListing" | "RealEstateOwned" | "Relocation" | "Section8Accepted" | "SeeAgent" | "SeeRemarks" | "ShortSale" | "Standard" | "ThirdPartyApproval" | "Trust" | "VaOwned";

/** 10 members · $metadata EnumType StreetDirection */
export type CotalityEnum_StreetDirection = "E" | "EW" | "N" | "NE" | "NS" | "NW" | "S" | "SE" | "SW" | "W";

/** 298 members · $metadata EnumType StreetSuffix */
export type CotalityEnum_StreetSuffix = "Abbey" | "Acres" | "Alley" | "Anex" | "Annex" | "Arcade" | "Arch" | "Avenue" | "AvenueClose" | "AvenueCourt" | "AvenueCrescent" | "AvenuePlace" | "Bay" | "Bayou" | "Beach" | "Bend" | "Bluff" | "Bluffs" | "Bottom" | "Boulevard" | "Bourne" | "Branch" | "Bridge" | "Brook" | "Brooks" | "Burg" | "Burgs" | "Bypass" | "Byway" | "Camp" | "Canyon" | "Cape" | "Causeway" | "Cay" | "Center" | "Centers" | "Centre" | "Channel" | "Chase" | "Circle" | "Circles" | "Circuit" | "Cliff" | "Cliffs" | "Close" | "Club" | "Common" | "Commons" | "Concession" | "Corner" | "Corners" | "Corridor" | "CountyRoad" | "Course" | "Court" | "CourtAvenue" | "CourtStreet" | "Courts" | "Cove" | "Coves" | "Creek" | "Crescent" | "Crest" | "Cross" | "Crossing" | "Crossroad" | "Crossroads" | "Crossway" | "CulDeSac" | "Curve" | "Cut" | "Cutoff" | "Dale" | "Dam" | "Diversion" | "Divide" | "Downs" | "Draw" | "Drive" | "DriveCourt" | "Drives" | "EastAvenue" | "EastCircle" | "EastCourt" | "EastPlace" | "End" | "Estate" | "Estates" | "Expressway" | "Extension" | "Extensions" | "Fairway" | "Fall" | "Falls" | "Farm" | "Ferry" | "Field" | "Fields" | "Flat" | "Flats" | "Ford" | "Fords" | "Forest" | "Forge" | "Forges" | "Fork" | "Forks" | "Fort" | "Freeway" | "Garden" | "Gardens" | "Gate" | "Gateway" | "Glen" | "Glens" | "Glenway" | "Golfway" | "Grade" | "Grange" | "Green" | "Greens" | "Greenway" | "Grove" | "Groves" | "Gulch" | "Harbor" | "Harbors" | "Haven" | "Heath" | "Heights" | "Highway" | "Hill" | "Hills" | "Holler" | "Hollow" | "Inlet" | "Interstate" | "Island" | "Islands" | "Isle" | "Junction" | "Junctions" | "Key" | "Keys" | "Knoll" | "Knolls" | "Lake" | "Lakes" | "Land" | "Landing" | "Lane" | "Light" | "Lights" | "Line" | "Link" | "Loaf" | "Lock" | "Locks" | "Lodge" | "Lookout" | "Loop" | "Mall" | "Manor" | "Manors" | "Maze" | "Meadow" | "Meadows" | "Mews" | "Mill" | "Mills" | "Mission" | "Motorway" | "Mount" | "Mountain" | "Mountains" | "Neck" | "Orchard" | "Outlook" | "Oval" | "Overlook" | "Overpass" | "Parade" | "Park" | "Parkland" | "Parkway" | "Parkways" | "Pass" | "Passage" | "Path" | "Pathway" | "Peak" | "Pike" | "Pine" | "Pines" | "Place" | "Placeway" | "Plain" | "Plains" | "Plaza" | "Point" | "Pointe" | "Points" | "Pond" | "Port" | "Ports" | "Prairie" | "Private" | "Promenade" | "Quay" | "Radial" | "Ramp" | "Ranch" | "Rang" | "Range" | "Rapid" | "Rapids" | "Ravine" | "Reach" | "Rest" | "Retreat" | "Ridge" | "Ridges" | "Ring" | "Rise" | "River" | "Road" | "Roads" | "Route" | "Row" | "Rue" | "Run" | "Shoal" | "Shoals" | "Shore" | "Shores" | "SideRoad" | "Skyway" | "Spring" | "Springs" | "Spur" | "Spurs" | "Square" | "Squares" | "Stage" | "Station" | "Stravenue" | "Stream" | "Street" | "StreetClose" | "StreetCourt" | "StreetCrescent" | "StreetDrive" | "StreetPlace" | "Streets" | "Subdivision" | "Summit" | "Swing" | "Terrace" | "Throughway" | "Township" | "Trace" | "Track" | "Trafficway" | "Trail" | "Trailer" | "Tunnel" | "Turn" | "Turnpike" | "Underpass" | "Union" | "Unions" | "Vale" | "Valley" | "Valleys" | "Viaduct" | "View" | "Views" | "Villa" | "Village" | "Villages" | "Villas" | "Ville" | "Vista" | "Walk" | "Walks" | "Walkway" | "Wall" | "Way" | "Ways" | "Well" | "Wells" | "WestAvenue" | "WestCircle" | "WestCourt" | "WestPlace" | "Wood" | "Woods" | "Wynd";

/** 23 members · $metadata EnumType StructureType */
export type CotalityEnum_StructureType = "Apartment" | "Cabin" | "Dock" | "Duplex" | "Flex" | "FreeStandingBuilding" | "HighRise" | "HotelMotel" | "House" | "Industrial" | "LowRise" | "ManufacturedHouse" | "MidRise" | "MixedUse" | "MultiFamily" | "None" | "Office" | "Other" | "Quadruplex" | "Retail" | "Townhouse" | "Triplex" | "Warehouse";

/** 3 members · $metadata EnumType TaxStatusCurrent */
export type CotalityEnum_TaxStatusCurrent = "Personal" | "PersonalAndReal" | "Real";

/** 61 members · $metadata EnumType TenantPays */
export type CotalityEnum_TenantPays = "AdaUpgrades" | "Advertising" | "AirConditioning" | "AllUtilities" | "ApplicationFee" | "AssociationFees" | "BankFees" | "CableTv" | "CarpetCleaningFee" | "CommonAreaMaintenance" | "CreditCheck" | "DepartureCleaning" | "Doors" | "EarthquakeInsurance" | "ElectricalSystems" | "Electricity" | "ExteriorElectric" | "ExteriorMaintenance" | "FireInsurance" | "FireplaceFlueCleaning" | "FrozenPipeDamage" | "Gardener" | "Gas" | "GreenFees" | "GroundsCare" | "Heat" | "HotWater" | "HvacMaintenance" | "Insurance" | "InteriorDecor" | "Internet" | "JanitorialService" | "KeyDeposit" | "Management" | "MinorInteriorMaintenance" | "MoveInOutFee" | "None" | "Other" | "OtherTax" | "ParkingFee" | "Pavement" | "PestControl" | "PetDeposit" | "Plumbing" | "PoolMaintenance" | "ReKeyFee" | "RecreationFee" | "RentOnly" | "Repairs" | "Roof" | "Security" | "SeeRemarks" | "Sewer" | "SnowRemoval" | "StructuralMaintenance" | "Taxes" | "Telephone" | "TrashCollection" | "Water" | "WaterTreatment" | "Windows";

/** 22 members · $metadata EnumType UnitTypeType */
export type CotalityEnum_UnitTypeType = "Apartments" | "Commercial" | "Efficiency" | "FourBedroomOrMore" | "HotelRoom" | "Industrial" | "Living" | "Loft" | "ManagersUnit" | "Office" | "OneBedroom" | "Other" | "Penthouse" | "Residential" | "Retail" | "Shop" | "Storage" | "Studio" | "ThreeBedroom" | "Townhouse" | "TwoBedroom" | "Warehouse";

/** 7 members · $metadata EnumType UnitsFurnished */
export type CotalityEnum_UnitsFurnished = "AllUnits" | "Furnished" | "Negotiable" | "None" | "Partially" | "Unfurnished" | "VariesByUnit";

/** 41 members · $metadata EnumType Utilities */
export type CotalityEnum_Utilities = "AboveGroundUtilities" | "CableAvailable" | "CableConnected" | "CableNotAvailable" | "CellularPhoneReception" | "ElectricityAvailable" | "ElectricityConnected" | "ElectricityNotAvailable" | "FiberOpticAvailable" | "HighSpeedInternetAvailable" | "HighSpeedInternetConnected" | "MunicipalUtilities" | "NaturalGasAvailable" | "NaturalGasConnected" | "NaturalGasNotAvailable" | "None" | "OilAvailable" | "Other" | "OverheadUtilities" | "PhoneAvailable" | "PhoneConnected" | "PhoneNotAvailable" | "Propane" | "RecyclingCollection" | "SatelliteInternetAvailable" | "SeeRemarks" | "SeparateMeters" | "SepticAvailable" | "SewerAvailable" | "SewerConnected" | "SewerNotAvailable" | "SnowRemoval" | "TrashCollection" | "TrashCollectionPrivate" | "TrashCollectionPublic" | "UndergroundUtilities" | "Unknown" | "WaterAvailable" | "WaterConnected" | "WaterNotAvailable" | "YardMaintenance";

/** 19 members · $metadata EnumType Vegetation */
export type CotalityEnum_Vegetation = "Aspen" | "Brush" | "Cleared" | "Crops" | "Evergreen" | "FruitTrees" | "Grassed" | "HeavilyWooded" | "Mixed" | "NaturalState" | "None" | "Oak" | "Other" | "PartiallyWooded" | "Pine" | "Sagebrush" | "ScrubOak" | "SeeRemarks" | "Wooded";

/** 85 members · $metadata EnumType View */
export type CotalityEnum_View = "BackBay" | "Bay" | "Bayou" | "Beach" | "Bluff" | "Bridges" | "Canal" | "Canyon" | "Casino" | "Catalina" | "Channel" | "City" | "CityLights" | "Clubhouse" | "Coastline" | "Courtyard" | "CreekStream" | "CulDeSac" | "Desert" | "Downtown" | "East" | "Farmland" | "Forest" | "Garden" | "GolfCourse" | "GolfFairway" | "GolfGreen" | "Greenbelt" | "Gulf" | "Harbor" | "Hills" | "Intercoastal" | "Lagoon" | "Lake" | "Landmark" | "Landscaped" | "LongRange" | "Mangroves" | "Marina" | "MarshView" | "Meadow" | "Mountains" | "Neighborhood" | "None" | "North" | "Ocean" | "Orchard" | "Other" | "Panoramic" | "ParkGreenbelt" | "Partial" | "PartialBuildings" | "Pasture" | "PeekABoo" | "Pier" | "Pond" | "Pool" | "Preserve" | "Reservoir" | "Residential" | "Ridge" | "River" | "Rocks" | "Rural" | "Saltwater" | "Scenic" | "SeasonalView" | "SeeRemarks" | "SkiArea" | "Skyline" | "SlopeView" | "Sound" | "South" | "SouthernExposure" | "Street" | "StripView" | "Sunrise" | "Sunset" | "TennisCourt" | "Territorial" | "TreesWoods" | "Valley" | "Vineyard" | "Water" | "West";

/** 25 members · $metadata EnumType WaterHeater */
export type CotalityEnum_WaterHeater = "Central" | "Coal" | "Common" | "Electric" | "EnergyStarQualified" | "Gas" | "Geothermal" | "HeatPump" | "HighEfficiency" | "Hybrid" | "InstantHotWater" | "Insulated" | "Leased" | "Multiple" | "None" | "OffHeatingSystem" | "Oil" | "Other" | "Owned" | "Propane" | "Recirculating" | "SeeRemarks" | "Solar" | "Tankless" | "Wood";

/** 39 members · $metadata EnumType WaterSource */
export type CotalityEnum_WaterSource = "AgriculturalWell" | "AgricultureDitchWater" | "AssessmentPaid" | "AssessmentUnpaid" | "Cistern" | "CommunityCoop" | "Connected" | "DrilledWell" | "DrivenWell" | "DugWell" | "HoldingTank" | "IrrigationDistrict" | "Lake" | "MultipleMeters" | "MunicipalUtilityDistrict" | "None" | "NotConnected" | "NotConnectedAtLot" | "NotConnectedNearby" | "Other" | "Pond" | "PotableWater" | "Private" | "Public" | "River" | "Rural" | "SandPointWell" | "Seasonal" | "SeeRemarks" | "SharedWell" | "Spring" | "Stream" | "WaterAssessments" | "WaterRights" | "WaterTapFee" | "WaterTapPaid" | "Well" | "WellInstalled" | "WellNeeded";

/** 77 members · $metadata EnumType WaterfrontFeatures */
export type CotalityEnum_WaterfrontFeatures = "AcrossTheRoadFromLakeOcean" | "AcrossTheRoadWaterFrontage" | "AllSportsLake" | "Basin" | "BayAccess" | "Bayfront" | "Bayou" | "BeachAccess" | "BeachFront" | "Bluff" | "BoatDockSlip" | "BoatRampLiftAccess" | "Bulkhead" | "CanalAccess" | "CanalFront" | "Channel" | "Cove" | "Creek" | "DeededAccess" | "DeepWater" | "DockAccess" | "FixedBridge" | "Gulf" | "GulfAccess" | "GulfOfMexico" | "Harbor" | "Indirect" | "IntersectingCanal" | "IntracoastalAccess" | "Island" | "Lagoon" | "Lake" | "LakeFront" | "LakePrivileges" | "Mangrove" | "MarinaInCommunity" | "Marsh" | "Mooring" | "NavigableWater" | "NoFixedBridges" | "None" | "OceanAccess" | "OceanFront" | "OceanSideOfFreeway" | "OceanSideOfHighway" | "Other" | "Pier" | "PointLot" | "Pond" | "ReservoirInCommunity" | "RiparianRights" | "Riprap" | "RiverAccess" | "RiverFront" | "SailBoatAccess" | "Seasonal" | "Seawall" | "SeeRemarks" | "Shared" | "ShorelineClean" | "ShorelineDeep" | "ShorelineFishermanWeeds" | "ShorelineGravel" | "ShorelineHardBottom" | "ShorelineMixed" | "ShorelineNatural" | "ShorelineRocky" | "ShorelineSand" | "ShorelineShallow" | "ShorelineSilt" | "ShorelineSoftBottom" | "Sound" | "Stream" | "Tidal" | "WalkToWater" | "WaterAccess" | "Waterfront";

/** 55 members · $metadata EnumType WindowFeatures */
export type CotalityEnum_WindowFeatures = "AluminumFrames" | "Arched" | "Atrium" | "Barn" | "BayWindows" | "Blinds" | "CasementWindows" | "Clad" | "CustomCoverings" | "DisplayWindows" | "DoubleHung" | "DoublePaneWindows" | "DraperyTracks" | "Drapes" | "EnergyStarQualifiedWindows" | "FiberglassFrames" | "FloorToCeilingWindows" | "FrenchMullioned" | "GardenWindows" | "ImpactGlass" | "InsulatedWindows" | "Jalousie" | "LeadedGlass" | "LowEmissivityWindows" | "Metal" | "MultiPane" | "NewWindows" | "NonInsulated" | "None" | "Other" | "PalladianWindows" | "PlantationShutters" | "ReplacementWindows" | "Rods" | "RollerShields" | "Screens" | "SeeRemarks" | "Shutters" | "SingleHung" | "SinglePane" | "Skylights" | "Sliding" | "SolarScreens" | "SomeWindowTreatments" | "StainedGlass" | "StormWindows" | "ThermalWindows" | "TiltInWindows" | "TintedWindows" | "TransomWindows" | "TriplePaneWindows" | "Vinyl" | "WindowCoverings" | "WindowTreatments" | "WoodFrames";

/** 10 members · $metadata EnumType GeocodeSource */
export type CotalityEnum_GeocodeSource = "Bing" | "GeoService" | "Google" | "Imported" | "Linctbl" | "Manual" | "Pxpoint" | "Realist" | "Starmap" | "Unknown";

/** 8 members · $metadata EnumType YearBuiltSource */
export type CotalityEnum_YearBuiltSource = "Appraiser" | "Assessor" | "Builder" | "Estimated" | "Other" | "Owner" | "PublicRecords" | "SeeRemarks";

/** 10 members · $metadata EnumType GreenVerificationSource */
export type CotalityEnum_GreenVerificationSource = "Administrator" | "Assessor" | "Builder" | "ContractorOrInstaller" | "Other" | "Owner" | "ProgramSponsor" | "ProgramVerifier" | "PublicRecords" | "SeeRemarks";

/** 4 members · $metadata EnumType GreenVerificationStatus */
export type CotalityEnum_GreenVerificationStatus = "Complete" | "Expired" | "InProcess" | "Proposed";

/** 303 members · Lookup catalogue for PropertyRooms.RoomFeatures (EnumType InteriorOrRoomFeatures declares 295; the Lookup publishes 303) */
export type CotalityLookup_PropertyRooms_RoomFeatures = "AccessibleClosets" | "AdditionalLivingQuarters" | "AirFiltration" | "AllBedroomsDown" | "AllBedroomsUp" | "ArchedDoorways" | "Atrium" | "Attic" | "Balcony" | "Bar" | "BathInMasterBedroom" | "BathInPrimaryBedroom" | "BathroomExhaustFan" | "BathroomRoughIn" | "BathroomonMainLevel" | "Bathtub" | "BayWindow" | "BeamedCeilings" | "BedroomOnMainLevel" | "BedroomonUpperLevel" | "Bidet" | "BlockWalls" | "Bookcases" | "BreakfastArea" | "BreakfastBar" | "BrickCounters" | "BrickWalls" | "BuiltInBunkBeds" | "BuiltInClosets" | "BuiltInFeatures" | "BuiltInOven" | "BuiltInShowerChair" | "BuiltInTrashRecycling" | "ButcherBlockCounters" | "ButlersPantry" | "CableTv" | "CarbonMonoxideDetector" | "CathedralCeilings" | "CedarClosets" | "CeilingFans" | "CeilingTrack" | "CentralVacuum" | "CentralVacuumRoughIn" | "CeramicBath" | "CeramicCounters" | "ChairRail" | "Chandelier" | "Closet" | "ClosetCabinetry" | "ClosetOrganizers" | "CoatCloset" | "CofferedCeilings" | "CommonEntry" | "ConcreteCounters" | "ConvertibleBedroom" | "CopperCounters" | "CountryKitchen" | "CoveCeiling" | "CrownMolding" | "CustomCabinets" | "CustomMirrors" | "DecorativeDesignerLightingFixtures" | "Den" | "DiningArea" | "Dishwasher" | "Disposal" | "DoubleHungCloset" | "DoubleSidedCloset" | "DoubleVanity" | "DressingArea" | "DropStaircase" | "DryBar" | "DualClosets" | "DualSinks" | "Dumbwaiter" | "EatInKitchen" | "EightPieceBathroom" | "ElectricOvenConnection" | "ElectricRangeConnection" | "Elevator" | "ElevatorShaft" | "EnSuiteBathroom" | "EnclosedToilet" | "EntranceFoyer" | "FamilyDiningRoom" | "FamilyRoomLowerLevel" | "FamilyRoomMainLevel" | "FireExtinguisher" | "Fireplace" | "FirstFloorEntry" | "FivePieceBathroom" | "FourPieceBathroom" | "FrenchDoorsAtriumDoors" | "FullBathOnMainLevel" | "Furnished" | "GalleyKitchen" | "GameRoom" | "GardenTubRomanTub" | "GasOvenConnection" | "GasRangeConnection" | "GourmetKitchen" | "GrabBarsAroundToilet" | "GrabBarsInShowerOrTub" | "GraniteCounters" | "GreatRoom" | "GreenhouseWindow" | "GuestAccommodations" | "HalfBathonMainLevel" | "HandHeldShowerHead" | "HandicapAccess" | "HeatedFloor" | "HighCeilings" | "HighSpeedInternet" | "HisAndHersClosets" | "HollywoodBath" | "HomeOffice" | "HomeTheater" | "HotTubSpa" | "HouseBoatFloatingHome" | "HumidityControlled" | "InLawFloorplan" | "InstantHotWater" | "Intercom" | "InteriorSteps" | "InternalExpansion" | "JackAndJillBath" | "JettedTub" | "KitchenDiningCombo" | "KitchenExhaustFan" | "KitchenFamilyRoomCombo" | "KitchenIsland" | "KitchenWindow" | "Kitchenette" | "LaminateCounters" | "LaminateCountertop" | "LaundryChute" | "Library" | "LiftOrStairChair" | "LimestoneCounters" | "LinenCloset" | "LivingDiningRoom" | "LivingRoomDeckAttached" | "Loft" | "LowFlowPlumbingFixtures" | "LowerLevelEntry" | "LuxuryTile" | "MainLevelMaster" | "MainLevelPrimary" | "MainLivingAreaEntryLevel" | "MainLivingAreaUpperLevel" | "MarbleCounters" | "MasterDownstairs" | "MasterSuite" | "MetalCountertop" | "MudRoom" | "MultiLevelBedroom" | "MultipleClosets" | "MultipleDiningAreas" | "MultipleEnSuiteBathrooms" | "MultipleLivingAreas" | "MultipleMasterSuites" | "MultiplePrimarySuites" | "MultipleShowerHeads" | "MultipleStaircases" | "MurphyBed" | "NaturalWoodwork" | "NewPaint" | "NoCloset" | "NoInteriorSteps" | "None" | "OnePieceBathroom" | "OpenBeamsBeamedCeailings" | "OpenConcept" | "OpenFloorplan" | "Other" | "OtherCounters" | "OversizedMaster" | "OversizedPrimary" | "PaintedWoodwork" | "PanelingWainscoting" | "Pantry" | "PartiallyFurnished" | "PermanentAtticStairs" | "PhoneSystem" | "PorcelainCounters" | "PotFiller" | "PotRack" | "PotsAndPanDrawers" | "PrimaryDownstairs" | "PrimarySuite" | "ProfessionallyDesigned" | "ProgrammableThermostat" | "PullDownAtticStairs" | "PullmanBath" | "QuartzCounters" | "QuartziteCounters" | "RecessedLighting" | "Remodeled" | "RollInShower" | "Sauna" | "SecondFloorEntry" | "SecondKitchen" | "SeeAgent" | "SeeRemarks" | "SelfClosingCabinetDoors" | "SelfClosingDrawers" | "SeparateFamilyRoom" | "SeparateFormalDiningRoom" | "SeparateFormalLivingRoom" | "SeparateHeatingControls" | "SeparateRoom" | "SeparateShower" | "SevenPieceBathroom" | "ShowerOnly" | "Shutters" | "SingleLivingLevel" | "Sink" | "SittingAreaInMaster" | "SittingAreaInPrimary" | "SixPieceBathroom" | "Skylights" | "SlidingDoors" | "SlidingGlassDoors" | "SmartCamerasRecording" | "SmartHome" | "SmartLights" | "SmartTechnologyForAccessibility" | "SmartThermostat" | "SmokeFree" | "SmoothCeilings" | "SoakingTub" | "SolarTubes" | "SolidSurfaceCounters" | "SoundSystem" | "SpecialMillwork" | "SplitBedrooms" | "StackedBedrooms" | "StainlessSteelAppliances" | "StainlessSteelCounters" | "StairClimber" | "StallShower" | "SteamShower" | "StoneCounters" | "Storage" | "StorageCloset" | "Study" | "SunRoom" | "SunkenBathtub" | "SunkenLivingRoom" | "SuspendedCeilings" | "Tandem" | "ThirdFloorEntry" | "ThreeBedroomsUp" | "ThreePieceBathroom" | "ThreeQuarterBathonMainLevel" | "TileCounters" | "TileCountertop" | "TiledShower" | "TongueAndGrooveCeilings" | "TrackLighting" | "TraditionalFloorplan" | "TrashChute" | "TrashCompactor" | "TravertineCounters" | "TrayCeilings" | "TubShower" | "TwoBedroomsDown" | "TwoBedroomsUp" | "TwoPieceBathroom" | "TwoStoryCeilings" | "UnfinishedWalls" | "Unfurnished" | "UpdatedKitchen" | "Upgraded" | "UpgradedCountertops" | "UpperLevelMaster" | "UpperLevelPrimary" | "UtilityRoom" | "UtilitySink" | "Vanity" | "VaultedCeilings" | "VinylCounters" | "WalkInBathtub" | "WalkInClosets" | "WalkInPantry" | "WalkInShower" | "WalkOut" | "WallMountedTv" | "WaterClosets" | "WaterSenseFixtures" | "WetBar" | "WideInteriorHallsAndDoors" | "WindowTreatments" | "WindowedBathroom" | "Windows" | "WineCellar" | "WiredForData" | "WiredForSound" | "WoodBurningStove" | "WoodCabinets" | "WoodCounters" | "WoodProductWalls" | "Workshop";

/** 15 members · $metadata EnumType RoomLevel */
export type CotalityEnum_RoomLevel = "Basement" | "Eighth" | "Fifth" | "First" | "Fourth" | "Lower" | "Main" | "Middle" | "Ninth" | "Other" | "Second" | "Seventh" | "Sixth" | "Third" | "Upper";

/** 3 members · Lookup catalogue for TeamMembers.MemberStatus (EnumType MemberStatus declares 4; the Lookup publishes 3) */
export type CotalityLookup_TeamMembers_MemberStatus = "Active" | "DisciplinaryCaution" | "Inactive";

/** 2 members · $metadata EnumType TeamImpersonationLevel */
export type CotalityEnum_TeamImpersonationLevel = "Impersonate" | "WorkOnBehalf";

/** 11 members · $metadata EnumType TeamMemberType */
export type CotalityEnum_TeamMemberType = "AdministrationAssistant" | "BuyerAgent" | "LeadManager" | "ListingAgent" | "MarketingAssistant" | "OperationsManager" | "ShowingAgent" | "TeamLead" | "TeamMember" | "Teammemberlead" | "TransactionCoordinator";

// ── Resources ─────────────────────────────────────────────────────────────────────────────

/** Building · Cotality.DataStandard.RESO.DD.Building · 1 fields · REJECTED on this subscription (HTTP 403: {"error":{"code":"Forbidden[403]. TraceId: 05ff1bee-5737-4569-abf0-142bb1c2d8ff","message":"Resource Cotality.DataStandard.RESO.DD.Building not available"}}) */
export interface CotalityBuilding {
  /** Edm.String(255) · filterability unmeasured · RLS field */
  BuildingKey: string;
}

/** Building navigation properties (present on a row only under $expand). */
export interface CotalityBuildingNavigations {
  /** → Media[] · $expand PROVIDER_REJECTED (HTTP 403) */
  Media?: CotalityMedia[];
  /** → Property[] · $expand PROVIDER_REJECTED (HTTP 403) */
  Property?: CotalityProperty[];
}

/** CustomProperty · Cotality.DataStandard.RESO.DD.CustomProperty · 142 fields · accessible */
export interface CotalityCustomProperty {
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeBedrooms: string | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeFinishedAreaRange: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeFinishedAreaRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeFinishedAreaRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeUnfinishedAreaRange: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeUnfinishedAreaRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AboveGradeUnfinishedAreaRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.Decimal(14,2) · filterable · populated 90 · not an RLS field · non-RESO */
  AdditionalFee: number | null;
  /** Edm.String(1024) · filterable · populated 317,956 · not an RLS field · non-RESO */
  AdditionalFeeDescription: string | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 1) · filterable · populated 34 · not an RLS field · non-RESO */
  AdditionalFeeFrequency: CotalityEnum_FeeFrequency | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 591,609 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  AdditionalFeeYN: boolean | null;
  /** Edm.String(8000) · filterable · populated 29 · RLS field · non-RESO */
  AdditionalInfo1: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  AdditionalInfo2: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  AdditionalInfo3: string | null;
  /** Edm.Decimal(14,2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ApplicationFee: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationFeeTotal: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationFeeTotalFrequency: CotalityEnum_FeeFrequency | null;
  /** Enums.Multi.Attic · multi-enum (comma-joined member names) · Lookup 22 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_Attic */
  Attic: string | null;
  /** Enums.Multi.AvailabilityType · multi-enum (comma-joined member names) · Lookup 12 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_AvailabilityType */
  AvailabilityType: string | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeBedrooms: string | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeFinishedAreaRange: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeFinishedAreaRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeFinishedAreaRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeUnfinishedAreaRange: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeUnfinishedAreaRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BelowGradeUnfinishedAreaRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  BoatDockAccommodates: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  BoatDockHeight: number | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  BoatDockSlipDescription: string | null;
  /** Enums.Multi.BoatDockSlipFeatures · multi-enum (comma-joined member names) · Lookup 32 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_BoatDockSlipFeatures */
  BoatDockSlipFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  BoatDockYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  BoatSlipYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  BonusAmount: number | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  BuildingAreaTotalRange: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BuildingAreaTotalRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  BuildingAreaTotalRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(50) · filterable · populated 9,394 · RLS field · non-RESO */
  BuildingSizeDimensions: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  CommunityDevelopmentDistrictYN: boolean | null;
  /** Edm.String(50) · filterable · populated 1 · not an RLS field · non-RESO */
  ComplexName: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConsumerRemarks: string | null;
  /** Edm.String(100000) · filterable · populated 591,649 · not an RLS field · non-RESO */
  CustomFields: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  DevelopmentName: string | null;
  /** Edm.String(50) · filterable · populated 192,124 · RLS field · non-RESO */
  FractionalShare: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  GarageArea: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  GarageAreaUnits: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field · non-RESO */
  GarageDimensions: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  GuestHouseAreaTotal: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  GuestHouseAreaTotalSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  GuestHouseAreaTotalUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  GuestHouseDescription: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  GuestHouseYN: boolean | null;
  /** Enums.Multi.GulfAccessType · multi-enum (comma-joined member names) · Lookup 8 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_GulfAccessType */
  GulfAccessType: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  GulfAccessYN: boolean | null;
  /** Edm.Boolean · filterable · populated 591,649 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 591,649 · not an RLS field · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  LakeChainName: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  LakeId: string | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  LakeName: string | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  LakeSize: string | null;
  /** Enums.Multi.LandTenure · multi-enum (comma-joined member names) · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_LandTenure */
  LandTenure: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field · non-RESO */
  Lang2_Type: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field · non-RESO */
  Lang3_Type: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  LastMonthRentReqYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  LeaseAmountPerArea: number | null;
  /** Enums.LeaseAmountPerAreaUnit · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  LeaseAmountPerAreaUnit: CotalityEnum_LeaseAmountPerAreaUnit | null;
  /** Edm.String(1200) · filterable · populated 0 · not an RLS field · non-RESO */
  LeaseTermsDescription: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterable · populated 591,649 · not an RLS field */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 591,649 · not an RLS field */
  ListOfficeMlsId: string | null;
  /** Edm.String(60) · filterable · populated 591,649 · not an RLS field */
  ListingId: string | null;
  /** Edm.String(20) · filterable · populated 591,649 · not an RLS field */
  ListingKey: string;
  /** Edm.Int64 · filterable · populated 591,649 · not an RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  LivingAreaRange: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  LivingAreaRangeHigh: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  LivingAreaRangeLow: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  LivingAreaRangeSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  LivingAreaRangeUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  Location: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  LotSizeAreaRangeHigh: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  LotSizeAreaRangeLow: number | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  LotSizeRange: string | null;
  /** Enums.LotSizeSource · Lookup 15 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  LotSizeRangeSource: CotalityEnum_LotSizeSource | null;
  /** Enums.LotSizeUnits · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  LotSizeRangeUnits: CotalityEnum_LotSizeUnits | null;
  /** Enums.Multi.Membership · multi-enum (comma-joined member names) · Lookup 1 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_Membership */
  Membership: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  MembershipDescription: string | null;
  /** Edm.Decimal(14,2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  MembershipFee: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  MembershipFeeFrequency: CotalityEnum_FeeFrequency | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  MembershipRequiredYN: boolean | null;
  /** Enums.Multi.MineralRights · multi-enum (comma-joined member names) · Lookup 20 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_MineralRights */
  MineralRights: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,649 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  MonthlyRate: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  NumberOfBoatDocks: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  NumberOfBoatSlips: number | null;
  /** Edm.Date(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OffMarketDate: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OffSeasonRate: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  OffersDescription: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field · non-RESO */
  OffersReviewDate: string | null;
  /** Edm.String(510) · filterable · populated 591,649 · not an RLS field */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterable · populated 591,649 · not an RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterable · populated 591,649 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Edm.String(500) · filterable · populated 1 · not an RLS field · non-RESO */
  OtherExpenseDescription: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Enums.PotentialShortSale · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  PotentialShortSale: CotalityEnum_PotentialShortSale | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  PricePerArea: number | null;
  /** Enums.PricePerAreaUnit · Lookup 5 members (RLS-listed 1) · filterable · populated 12 · not an RLS field · non-RESO */
  PricePerAreaUnit: CotalityEnum_LeaseAmountPerAreaUnit | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  PrivateShowingInstructions: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  ProjectName: string | null;
  /** Enums.Multi.PropertyAccess · multi-enum (comma-joined member names) · Lookup 10 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_PropertyAccess */
  PropertyAccess: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterable · populated 591,633 */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterable · populated 553,713 · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterable · populated 591,649 · not an RLS field */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.String(4000) · filterable · populated 0 · not an RLS field · non-RESO */
  PublicRemarks_lang2: string | null;
  /** Edm.String(4000) · filterable · populated 0 · not an RLS field · non-RESO */
  PublicRemarks_lang3: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  RentSpreeURL: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  RentSpreeYN: boolean | null;
  /** Enums.Multi.Restrictions · multi-enum (comma-joined member names) · Lookup 106 members (RLS-listed 2) · filterable · populated 24,129 · RLS field · non-RESO · members: CotalityLookup_CustomProperty_Restrictions */
  Restrictions: string | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  RiverName: string | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field · non-RESO */
  SaleOrLeaseIncludes: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  SeasonRate: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  SecurityDepositDescription: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  SecurityDepositYN: boolean | null;
  /** Edm.Int64 · filterable · populated 11,316 · not an RLS field · non-RESO */
  SourceFloorPlansCount: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  SourceSupplementPublicCount: number | null;
  /** Edm.String(510) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SourceSystemKey: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterable · populated 591,649 · not an RLS field */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  StoriesPartial: string | null;
  /** Edm.String(100) · filterable · populated 0 · not an RLS field · non-RESO */
  StoriesPartialTotal: string | null;
  /** Enums.Multi.StormProtection · multi-enum (comma-joined member names) · Lookup 25 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_StormProtection */
  StormProtection: string | null;
  /** Edm.String(12) · filterable · populated 0 · not an RLS field · non-RESO */
  TaxAssessedValueImprovement: string | null;
  /** Edm.String(12) · filterable · populated 14 · not an RLS field · non-RESO */
  TaxAssessedValueLand: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  TaxAuthority: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  TaxRate: number | null;
  /** Edm.String(100) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  TaxYearRange: string | null;
  /** Enums.Multi.ThirdPartyIntegrationType · multi-enum (comma-joined member names) · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_ThirdPartyIntegrationType */
  ThirdPartyIntegrationType: string | null;
  /** Edm.String(300) · filterable · populated 0 · not an RLS field · non-RESO */
  TitleCompanyAddress: string | null;
  /** Edm.String(200) · filterable · populated 0 · not an RLS field · non-RESO */
  TitleCompanyName: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  TitleCompanyPhone: string | null;
  /** Edm.String(200) · filterable · populated 0 · not an RLS field · non-RESO */
  TitleCompanyPreferred: string | null;
  /** Edm.String(1024) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  UnitLocation: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  WaterAccessDescription: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  WaterAccessYN: boolean | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  WeeklyRate: string | null;
}

/** CustomProperty navigation properties (present on a row only under $expand). */
export interface CotalityCustomPropertyNavigations {
  /** → Property[] · $expand SUPPORTED */
  Property?: CotalityProperty[];
}

/** Enumeration · Cotality.DataStandard.RESO.WebAPI.Enumeration · 8 fields · REJECTED on this subscription (HTTP 404: "Page not found") */
export interface CotalityEnumeration {
  /** Edm.String · filterability unmeasured */
  EnumerationLongValue: string | null;
  /** Edm.String · filterability unmeasured */
  EnumerationName: string | null;
  /** Edm.String · filterability unmeasured */
  EnumerationValue: string | null;
  /** Edm.String(255) · filterability unmeasured */
  ID: string;
  /** Edm.DateTimeOffset(27) · filterability unmeasured */
  ModificationTimestamp: string | null;
  /** Edm.String · filterability unmeasured */
  OriginatingSystemName: string | null;
  /** Edm.String · filterability unmeasured */
  ParentEnumerationName: string | null;
  /** Edm.String · filterability unmeasured */
  ParentEnumerationValue: string | null;
}

/** Enumeration navigation properties (present on a row only under $expand). */
export interface CotalityEnumerationNavigations {
}

/** Field · Cotality.DataStandard.RESO.DD.Field · 15 fields · accessible */
export interface CotalityField {
  /** Edm.String(8000) · filterable · populated 2,249 · RLS field · non-RESO */
  Definition: string | null;
  /** Edm.String(100) · filterable · populated 2,249 · RLS field · non-RESO */
  DisplayName: string | null;
  /** Edm.String(20) · filterable · populated 2,249 · RLS field · non-RESO */
  FieldKey: string;
  /** Edm.String(100) · filterable · populated 2,249 · RLS field · non-RESO */
  FieldName: string | null;
  /** Edm.Int64 · filterable · populated 2,152 · RLS field · non-RESO */
  Length: number | null;
  /** Edm.String(100) · filterable · populated 619 · RLS field · non-RESO */
  LookupName: string | null;
  /** Edm.String(20) · filterable · populated 2,249 · RLS field · non-RESO */
  ModelKey: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 2,249 · RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Int64 · filterable · populated 0 · RLS field · non-RESO */
  NumOccurrences: number | null;
  /** Edm.Int64 · filterable · populated 136 · RLS field · non-RESO */
  Precision: number | null;
  /** Edm.Boolean · filterable · populated 2,249 · RLS field · non-RESO */
  RESOStandardYN: boolean | null;
  /** Edm.String(100) · filterable · populated 2,249 · RLS field · non-RESO */
  ResourceName: string | null;
  /** Edm.Int64 · filterable · populated 2,249 · RLS field · non-RESO */
  SystemReferenceCount: number | null;
  /** Edm.String(8000) · filterable · populated 1,178 · RLS field · non-RESO */
  SystemReferences: string | null;
  /** Edm.String(30) · Lookup 9 members (RLS-listed 0) · filterable · populated 2,249 · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  Type: string | null;
}

/** Field navigation properties (present on a row only under $expand). */
export interface CotalityFieldNavigations {
}

/** HistoryTransactional · Cotality.DataStandard.RESO.DD.HistoryTransactional · 29 fields · REJECTED on this subscription (HTTP 400: {"error":{"code":"BadRequest[400]. TraceId: 473ffe64-985f-45f2-9783-f039e1fa9f21","message":"No OriginatingSystemNames available for querying given request! This is an indication that you do not have ) */
export interface CotalityHistoryTransactional {
  /** Enums.ChangeType · Lookup 15 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO */
  ChangeType: CotalityLookup_HistoryTransactional_ChangeType | null;
  /** Edm.String(25) · filterability unmeasured · RLS field · non-RESO */
  ChangedByMemberID: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  ChangedByMemberKey: string | null;
  /** Edm.String(20) · filterability unmeasured · RLS field · non-RESO */
  FieldKey: string | null;
  /** Edm.String(100) · filterability unmeasured · RLS field · non-RESO */
  FieldName: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  HistoryTransactionalKey: string;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterability unmeasured · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.Int64 · filterability unmeasured · RLS field · non-RESO */
  ListAgentKey: number | null;
  /** Edm.String(20) · filterability unmeasured · RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(8000) · filterability unmeasured · RLS field · non-RESO */
  ListingPermission: string | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(8000) · filterability unmeasured · RLS field · non-RESO */
  NewValue: string | null;
  /** Edm.Date(10) · filterability unmeasured · RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  OriginatingSystemHistoryKey: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Edm.String(8000) · filterability unmeasured · RLS field · non-RESO */
  PreviousValue: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.String(100) · filterability unmeasured · RLS field · non-RESO */
  ResourceName: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  ResourceRecordID: string | null;
  /** Edm.String(20) · filterability unmeasured · RLS field · non-RESO */
  ResourceRecordKey: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  SourceSystemHistoryKey: string | null;
  /** Edm.String(25) · filterability unmeasured · RLS field · non-RESO */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · RLS field · non-RESO */
  SourceSystemName: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterability unmeasured · RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterability unmeasured · RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
}

/** HistoryTransactional navigation properties (present on a row only under $expand). */
export interface CotalityHistoryTransactionalNavigations {
}

/** Lookup · Cotality.DataStandard.RESO.DD.Lookup · 15 fields · accessible */
export interface CotalityLookup {
  /** Edm.String(8000) · filterable · populated 191,912 · RLS field · non-RESO */
  Definition: string | null;
  /** Edm.String(20) · filterable · populated 191,912 · RLS field · non-RESO */
  FieldKey: string | null;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  FieldName: string | null;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  LegacyODataValue: string | null;
  /** Edm.String(20) · filterable · populated 191,912 · RLS field · non-RESO */
  LookupKey: string;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  LookupName: string | null;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  LookupValue: string | null;
  /** Edm.String(20) · filterable · populated 191,912 · RLS field · non-RESO */
  ModelKey: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 191,912 · RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String · filterable · populated 0 · RLS field · non-RESO */
  OdataOverride: string | null;
  /** Edm.Boolean · filterable · populated 191,912 · RLS field · non-RESO */
  RESOStandardYN: boolean | null;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  ResourceName: string | null;
  /** Edm.String(100) · filterable · populated 191,912 · RLS field · non-RESO */
  StandardLookupValue: string | null;
  /** Edm.Int64 · filterable · populated 191,912 · RLS field · non-RESO */
  SystemReferenceCount: number | null;
  /** Edm.String(8000) · filterable · populated 81,777 · RLS field · non-RESO */
  SystemReferences: string | null;
}

/** Lookup navigation properties (present on a row only under $expand). */
export interface CotalityLookupNavigations {
}

/** Media · Cotality.DataStandard.RESO.DD.Media · 56 fields · accessible */
export interface CotalityMedia {
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  ChangedByMemberID: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  ChangedByMemberKey: string | null;
  /** Edm.Int64 · filterable · populated 0 · not an RLS field · non-RESO */
  ChangedByMemberKeyNumeric: number | null;
  /** Enums.ClassName · Lookup 17 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ClassName: CotalityEnum_ClassName | null;
  /** Edm.Boolean · filterable · populated 0 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  ImageHeight: number | null;
  /** Enums.ImageOf · Lookup 92 members (RLS-listed 1) · filterable · populated 1 · not an RLS field */
  ImageOf: CotalityEnum_ImageOf | null;
  /** Edm.String(50) · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  ImageSizeDescription: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  ImageWidth: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 2,000,836 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterable · populated 1,987,830 · not an RLS field · non-RESO */
  ListAgentKey: string | null;
  /** Edm.String(20) · filterable · populated 2,000,750 · not an RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 2,000,836 · not an RLS field · non-RESO */
  ListOfficeMlsId: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterable · populated 1,699,794 · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  ListingPermission: string | null;
  /** Edm.String(1024) · filterable · populated 31,738 · RLS field */
  LongDescription: string | null;
  /** Enums.Multi.MediaAlteration · multi-enum (comma-joined member names) · Lookup 10 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_MediaAlteration */
  MediaAlteration: string | null;
  /** Enums.MediaCategory · Lookup 18 members (RLS-listed 8) · filterable · populated 2,000,897 · RLS field */
  MediaCategory: CotalityEnum_MediaCategory | null;
  /** Enums.MediaClassification · Lookup 4 members (RLS-listed 0) · filterable · populated 2,000,898 · not an RLS field · non-RESO */
  MediaClassification: CotalityLookup_Media_MediaClassification | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field */
  MediaHTML: string | null;
  /** Edm.String(20) · filterable · populated 2,000,898 · RLS field */
  MediaKey: string;
  /** Edm.Int64 · filterable · populated 2,000,898 · RLS field · non-RESO */
  MediaKeyNumeric: number | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 2,000,898 · RLS field */
  MediaModificationTimestamp: string | null;
  /** Edm.String(255) · filterable · populated 1,562,623 · RLS field */
  MediaObjectID: string | null;
  /** Enums.MediaStatus · Lookup 3 members (RLS-listed 1) · filterable · populated 2,000,898 · RLS field */
  MediaStatus: CotalityEnum_MediaStatus | null;
  /** Edm.String(1024) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  MediaStatusDescription: string | null;
  /** Enums.MediaType · Lookup 22 members (RLS-listed 7) · filterable · populated 2,000,898 · RLS field */
  MediaType: CotalityLookup_Media_MediaType | null;
  /** Edm.String(8000) · filterable · populated 589,848 · not an RLS field */
  MediaURL: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 2,000,898 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Date(10) · filterable · populated 1,362,225 · not an RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Edm.Int32 · filterable · populated 2,000,898 · RLS field */
  Order: number | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field · non-RESO */
  OriginalMediaUrl: string | null;
  /** Edm.String(25) · filterable · populated 1,318,099 · RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterable · populated 2,000,898 · RLS field */
  OriginatingSystemMediaKey: string | null;
  /** Edm.String(255) · filterable · populated 2,000,898 · not an RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OriginatingSystemResourceRecordId: string | null;
  /** Edm.String(255) · filterable · populated 2,000,898 · RLS field · non-RESO */
  OriginatingSystemResourceRecordKey: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterable · populated 2,000,836 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.Permission · multi-enum (comma-joined member names) · Lookup 7 members (RLS-listed 2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityLookup_Media_Permission */
  Permission: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 71,570 · RLS field · string with Lookup (see lookups.live.json) */
  PreferredPhotoYN: boolean | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterable · populated 2,000,293 · not an RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterable · populated 1,821,445 · not an RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterable · populated 2,000,836 · not an RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.Int32 · filterable · populated 2,000,898 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Enums.ResourceName · Lookup 5 members (RLS-listed 3) · filterable · populated 2,000,898 · RLS field */
  ResourceName: CotalityEnum_ResourceName | null;
  /** Edm.String(255) · filterable · populated 2,000,888 · RLS field */
  ResourceRecordID: string | null;
  /** Edm.String(20) · filterable · populated 2,000,898 · RLS field */
  ResourceRecordKey: string | null;
  /** Edm.Int64 · filterable · populated 2,000,898 · RLS field · non-RESO */
  ResourceRecordKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 133,895 · not an RLS field */
  ShortDescription: string | null;
  /** Edm.String(25) · filterable · populated 2,000,898 · RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterable · populated 1,840,948 · RLS field */
  SourceSystemMediaKey: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  SourceSystemName: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  SourceSystemResourceRecordKey: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterable · populated 2,000,836 · not an RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
  /** Edm.String · NOT filterable (provider-suppressed) · population unmeasurable */
  X_MediaStream: string | null;
}

/** Media navigation properties (present on a row only under $expand). */
export interface CotalityMediaNavigations {
  /** → Property[] · $expand SUPPORTED */
  Property?: CotalityProperty[];
}

/** Member · Cotality.DataStandard.RESO.DD.Member · 91 fields · accessible */
export interface CotalityMember {
  /** Edm.Boolean · filterable · populated 11,191 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  JobTitle: string | null;
  /** Edm.DateTimeOffset(27) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  LastLoginTimestamp: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · filterable · populated 11,191 · RLS field */
  MemberAOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  MemberAORMlsId: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  MemberAORkey: string | null;
  /** Edm.Int64 · filterable · populated 0 · not an RLS field · non-RESO */
  MemberAORkeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 10,472 · RLS field */
  MemberAddress1: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  MemberAddress2: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  MemberAlternateId: string | null;
  /** Edm.String(500) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberAssociationComments: string | null;
  /** Enums.BillingPreference · Lookup 3 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberBillingPreference: CotalityEnum_BillingPreference | null;
  /** Edm.String(1024) · filterable · populated 1,042 · RLS field · non-RESO */
  MemberBio: string | null;
  /** Edm.String(9) · filterable · populated 0 · not an RLS field */
  MemberCarrierRoute: string | null;
  /** Edm.String(50) · filterable · populated 10,462 · RLS field */
  MemberCity: string | null;
  /** Edm.String(150) · filterable · populated 0 · not an RLS field · non-RESO */
  MemberCityRegion: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  MemberCommitteeCount: number | null;
  /** Enums.Country · Lookup 246 members (RLS-listed 2) · filterable · populated 11,191 · RLS field */
  MemberCountry: CotalityEnum_Country | null;
  /** Edm.String(50) · Lookup 4423 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  MemberCountyOrParish: string | null;
  /** Enums.Multi.MemberDesignation · multi-enum (comma-joined member names) · Lookup 93 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_MemberDesignation */
  MemberDesignation: string | null;
  /** Edm.String(16) · filterable · populated 11,064 · RLS field */
  MemberDirectPhone: string | null;
  /** Edm.String(80) · filterable · populated 11,186 · RLS field */
  MemberEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  MemberFax: string | null;
  /** Edm.String(50) · filterable · populated 11,190 · RLS field */
  MemberFirstName: string | null;
  /** Edm.String(150) · filterable · populated 11,191 · RLS field */
  MemberFullName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberHomePhone: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  MemberIsAssistantTo: string | null;
  /** Edm.String(20) · filterable · populated 11,191 · RLS field */
  MemberKey: string;
  /** Edm.Int64 · filterable · populated 11,191 · RLS field · non-RESO */
  MemberKeyNumeric: number | null;
  /** Enums.Multi.Languages · multi-enum (comma-joined member names) · Lookup 212 members (RLS-listed 28) · filterable · populated 816 · RLS field · members: CotalityEnum_Languages */
  MemberLanguages: string | null;
  /** Edm.String(50) · filterable · populated 11,191 · RLS field */
  MemberLastName: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberLoginId: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  MemberMailOptOutYN: boolean | null;
  /** Edm.String(50) · filterable · populated 4,281 · RLS field */
  MemberMiddleName: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  MemberMlsAccessYN: boolean | null;
  /** Edm.String(25) · filterable · populated 11,191 · RLS field */
  MemberMlsId: string | null;
  /** Enums.MemberMlsSecurityClass · Lookup 9 members (RLS-listed 5) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  MemberMlsSecurityClass: CotalityEnum_MemberMlsSecurityClass | null;
  /** Edm.String(16) · filterable · populated 10,114 · RLS field */
  MemberMobilePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  MemberNamePrefix: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  MemberNameSuffix: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  MemberNationalAssociationEntryDate: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  MemberNationalAssociationId: string | null;
  /** Edm.String(50) · filterable · populated 9,890 · RLS field */
  MemberNickname: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  MemberOfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  MemberOfficePhoneExt: string | null;
  /** Enums.MemberOtherPhoneType · Lookup 14 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  MemberOtherPhoneType: CotalityEnum_MemberOtherPhoneType | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberPager: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  MemberPhoneTTYTDD: string | null;
  /** Edm.String(10) · filterable · populated 10,474 · RLS field */
  MemberPostalCode: string | null;
  /** Edm.String(4) · filterable · populated 141 · RLS field */
  MemberPostalCodePlus4: string | null;
  /** Enums.PreferredMail · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  MemberPreferredMail: CotalityEnum_PreferredMail | null;
  /** Enums.PreferredMedia · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  MemberPreferredMedia: CotalityEnum_BillingPreference | null;
  /** Edm.String(16) · filterable · populated 11,064 · RLS field */
  MemberPreferredPhone: string | null;
  /** Edm.String(10) · filterable · populated 29 · RLS field */
  MemberPreferredPhoneExt: string | null;
  /** Enums.PreferredPublication · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  MemberPreferredPublication: CotalityEnum_PreferredPublication | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  MemberPrimaryAorId: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  MemberStateLicense: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  MemberStateLicenseExpirationDate: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  MemberStateLicenseState: CotalityEnum_StateOrProvince | null;
  /** Edm.String(100) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MemberStateLicenseType: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 45) · filterable · populated 10,459 · RLS field */
  MemberStateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Enums.MemberStatus · Lookup 4 members (RLS-listed 2) · filterable · populated 11,191 · RLS field */
  MemberStatus: CotalityEnum_MemberStatus | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  MemberStreetAdditionalInfo: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  MemberTollFreePhone: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  MemberTransferDate: string | null;
  /** Enums.MemberType · Lookup 23 members (RLS-listed 2) · filterable · populated 0 · not an RLS field */
  MemberType: CotalityEnum_MemberType | null;
  /** Edm.String(8000) · filterable · populated 773 · not an RLS field · non-RESO */
  MemberUrl: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  MemberVoiceMail: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  MemberVoiceMailExt: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  MemberVotingPrecinct: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 11,191 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(20) · filterable · populated 11,191 · RLS field */
  OfficeKey: string | null;
  /** Edm.Int64 · filterable · populated 11,191 · RLS field · non-RESO */
  OfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 11,191 · RLS field */
  OfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field */
  OfficeName: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  OfficeNationalAssociationId: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 0 · not an RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(25) · filterable · populated 11,191 · RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field */
  OriginatingSystemMemberKey: string | null;
  /** Edm.String(510) · filterable · populated 11,191 · RLS field · non-RESO */
  OriginatingSystemMemberMlsSecurityClass: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field · non-RESO */
  OriginatingSystemOfficeKey: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 1) · filterable · populated 11,191 · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Edm.Int32 · filterable · populated 11,191 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Enums.SocialMediaType · Lookup 17 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SocialMediaType: CotalityEnum_SocialMediaType | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field */
  SourceSystemMemberKey: string | null;
  /** Edm.String(255) · filterable · populated 11,191 · RLS field */
  SourceSystemName: string | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
  /** Edm.String(300) · filterable · populated 0 · not an RLS field */
  UniqueLicenseeIdentifier: string | null;
}

/** Member navigation properties (present on a row only under $expand). */
export interface CotalityMemberNavigations {
  /** → Property[] · $expand PROVIDER_REJECTED (HTTP 400) */
  BuyerAgentProperties?: CotalityProperty[];
  /** → Property[] · $expand PROVIDER_REJECTED (HTTP 400) */
  CoBuyerAgentProperties?: CotalityProperty[];
  /** → Property[] · $expand SUPPORTED */
  CoListAgentProperties?: CotalityProperty[];
  /** → Property[] · $expand SUPPORTED */
  ListAgentProperties?: CotalityProperty[];
  /** → Media[] · $expand SUPPORTED */
  Media?: CotalityMedia[];
}

/** Model · Cotality.DataStandard.RESO.DD.Model · 8 fields · accessible */
export interface CotalityModel {
  /** Edm.String(8000) · filterable · populated 17 · RLS field · non-RESO */
  Definition: string | null;
  /** Edm.String(20) · filterable · populated 17 · RLS field · non-RESO */
  ModelKey: string;
  /** Edm.String(100) · filterable · populated 17 · RLS field · non-RESO */
  ModelName: string | null;
  /** Edm.String(20) · filterable · populated 0 · RLS field · non-RESO */
  ModelTimestampFieldKey: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 17 · RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(20) · filterable · populated 17 · RLS field · non-RESO */
  PrimaryKeyFieldKey: string | null;
  /** Edm.Int64 · filterable · populated 17 · RLS field · non-RESO */
  SystemReferenceCount: number | null;
  /** Edm.String(8000) · filterable · populated 17 · RLS field · non-RESO */
  SystemReferences: string | null;
}

/** Model navigation properties (present on a row only under $expand). */
export interface CotalityModelNavigations {
}

/** Office · Cotality.DataStandard.RESO.DD.Office · 80 fields · accessible */
export interface CotalityOffice {
  /** Edm.String(300) · filterable · populated 0 · not an RLS field */
  BillingOfficeKey: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  FranchiseAffiliation: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  FranchiseNationalAssociationId: string | null;
  /** Edm.Boolean · filterable · populated 578 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 578 · RLS field · string with Lookup (see lookups.live.json) */
  IDXOfficeParticipationYN: boolean | null;
  /** Edm.String(20) · filterable · populated 576 · RLS field */
  MainOfficeKey: string | null;
  /** Edm.Int64 · filterable · populated 576 · RLS field · non-RESO */
  MainOfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 576 · RLS field */
  MainOfficeMlsId: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 578 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfBranches: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfNonMemberSalespersons: number | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · filterable · populated 577 · RLS field */
  OfficeAOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  OfficeAORMlsId: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  OfficeAORkey: string | null;
  /** Edm.Int64 · filterable · populated 0 · not an RLS field · non-RESO */
  OfficeAORkeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 546 · RLS field */
  OfficeAddress1: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  OfficeAddress2: string | null;
  /** Edm.String(50) · filterable · populated 14 · not an RLS field */
  OfficeAlternateId: string | null;
  /** Edm.String(500) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OfficeAssociationComments: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field · non-RESO */
  OfficeBio: string | null;
  /** Enums.OfficeBranchType · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficeBranchType: CotalityEnum_OfficeBranchType | null;
  /** Edm.String(20) · filterable · populated 530 · RLS field */
  OfficeBrokerKey: string | null;
  /** Edm.Int64 · filterable · populated 530 · RLS field · non-RESO */
  OfficeBrokerKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 530 · RLS field */
  OfficeBrokerMlsId: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OfficeBrokerNationalAssociationId: string | null;
  /** Edm.String(50) · filterable · populated 546 · RLS field */
  OfficeCity: string | null;
  /** Edm.String(150) · filterable · populated 0 · not an RLS field · non-RESO */
  OfficeCityRegion: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OfficeCorporateLicense: string | null;
  /** Enums.Country · Lookup 246 members (RLS-listed 2) · filterable · populated 577 · RLS field */
  OfficeCountry: CotalityEnum_Country | null;
  /** Edm.String(50) · Lookup 4423 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  OfficeCountyOrParish: string | null;
  /** Edm.String(80) · filterable · populated 42 · not an RLS field */
  OfficeEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  OfficeFax: string | null;
  /** Edm.String(20) · filterable · populated 578 · RLS field */
  OfficeKey: string;
  /** Edm.Int64 · filterable · populated 578 · RLS field · non-RESO */
  OfficeKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  OfficeMailAddress1: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  OfficeMailAddress2: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  OfficeMailCareOf: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  OfficeMailCity: string | null;
  /** Enums.Country · Lookup 246 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficeMailCountry: CotalityEnum_Country | null;
  /** Edm.String(50) · Lookup 4423 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  OfficeMailCountyOrParish: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  OfficeMailPostalCode: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  OfficeMailPostalCodePlus4: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficeMailStateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  OfficeManagerKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  OfficeManagerKeyNumeric: number | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  OfficeManagerMlsId: string | null;
  /** Edm.String(25) · filterable · populated 578 · RLS field */
  OfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 578 · RLS field */
  OfficeName: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  OfficeNationalAssociationId: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  OfficeNationalAssociationIdInsertDate: string | null;
  /** Edm.String(16) · filterable · populated 546 · RLS field */
  OfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 7 · not an RLS field */
  OfficePhoneExt: string | null;
  /** Edm.String(10) · filterable · populated 546 · RLS field */
  OfficePostalCode: string | null;
  /** Edm.String(4) · filterable · populated 25 · RLS field */
  OfficePostalCodePlus4: string | null;
  /** Enums.PreferredMedia · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficePreferredMedia: CotalityEnum_BillingPreference | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  OfficePrimaryAorId: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficePrimaryStateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 43) · filterable · populated 546 · RLS field */
  OfficeStateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Enums.OfficeStatus · Lookup 2 members (RLS-listed 2) · filterable · populated 578 · RLS field */
  OfficeStatus: CotalityEnum_OfficeStatus | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  OfficeStreetAdditionalInfo: string | null;
  /** Enums.OfficeType · Lookup 12 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OfficeType: CotalityEnum_OfficeType | null;
  /** Edm.String(8000) · filterable · populated 383 · not an RLS field · non-RESO */
  OfficeUrl: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 1 · not an RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(25) · filterable · populated 577 · RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterable · populated 576 · RLS field · non-RESO */
  OriginatingSystemMainOfficeKey: string | null;
  /** Edm.String(255) · filterable · populated 578 · RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(50) · filterable · populated 530 · RLS field · non-RESO */
  OriginatingSystemOfficeBrokerKey: string | null;
  /** Edm.String(255) · filterable · populated 578 · RLS field */
  OriginatingSystemOfficeKey: string | null;
  /** Edm.String(50) · filterable · populated 412 · RLS field · non-RESO */
  OriginatingSystemOfficeManagerKey: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 1) · filterable · populated 577 · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  OtherPhone: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Edm.Int32 · filterable · populated 578 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Enums.SocialMediaType · Lookup 17 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SocialMediaType: CotalityEnum_SocialMediaType | null;
  /** Edm.String(25) · filterable · populated 578 · RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterable · populated 577 · RLS field */
  SourceSystemName: string | null;
  /** Edm.String(255) · filterable · populated 578 · RLS field */
  SourceSystemOfficeKey: string | null;
  /** Enums.SyndicateAgentOption · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SyndicateAgentOption: CotalityEnum_SyndicateAgentOption | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  VirtualOfficeWebsiteYN: boolean | null;
}

/** Office navigation properties (present on a row only under $expand). */
export interface CotalityOfficeNavigations {
  /** → Property[] · $expand PROVIDER_REJECTED (HTTP 400) */
  BuyerOfficeProperties?: CotalityProperty[];
  /** → Property[] · $expand PROVIDER_REJECTED (HTTP 400) */
  CoBuyerOfficeProperties?: CotalityProperty[];
  /** → Property[] · $expand SUPPORTED */
  CoListOfficeProperties?: CotalityProperty[];
  /** → Property[] · $expand SUPPORTED */
  ListOfficeProperties?: CotalityProperty[];
  /** → Media[] · $expand SUPPORTED */
  Media?: CotalityMedia[];
}

/** OpenHouse · Cotality.DataStandard.RESO.DD.OpenHouse · 47 fields · accessible */
export interface CotalityOpenHouse {
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 1,474 · RLS field · string with Lookup (see lookups.live.json) */
  AppointmentRequiredYN: boolean | null;
  /** Edm.Boolean · filterable · populated 1,483 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 1,483 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterable · populated 1,483 · RLS field · non-RESO */
  ListAgentKey: string | null;
  /** Edm.String(20) · filterable · populated 1,483 · not an RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 1,483 · not an RLS field · non-RESO */
  ListOfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · RLS field */
  ListingId: string | null;
  /** Edm.String(20) · filterable · populated 1,483 · RLS field */
  ListingKey: string | null;
  /** Edm.Int64 · filterable · populated 1,483 · RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterable · populated 604 · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  ListingPermission: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  LivestreamOpenHouseURL: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 1,483 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Date(10) · filterable · populated 100 · not an RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Enums.Attended · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OpenHouseAttendedBy: CotalityEnum_Attended | null;
  /** Edm.Date(10) · filterable · populated 1,483 · RLS field */
  OpenHouseDate: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 1,483 · RLS field */
  OpenHouseEndTime: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · RLS field */
  OpenHouseId: string | null;
  /** Edm.String(20) · filterable · populated 1,483 · RLS field */
  OpenHouseKey: string;
  /** Edm.Int64 · filterable · populated 1,483 · RLS field · non-RESO */
  OpenHouseKeyNumeric: number | null;
  /** Edm.String(12000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  OpenHouseRemarks: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 1,483 · RLS field */
  OpenHouseStartTime: string | null;
  /** Enums.OpenHouseStatus · Lookup 3 members (RLS-listed 3) · filterable · populated 1,483 · RLS field */
  OpenHouseStatus: CotalityEnum_OpenHouseStatus | null;
  /** Enums.OpenHouseType · Lookup 9 members (RLS-listed 2) · filterable · populated 613 · RLS field */
  OpenHouseType: CotalityEnum_OpenHouseType | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 0 · not an RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(25) · filterable · populated 14 · RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · RLS field */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · RLS field · non-RESO */
  OriginatingSystemListingKey: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · not an RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterable · populated 1,483 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterable · populated 1,483 · not an RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterable · populated 1,430 · not an RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterable · populated 1,483 · not an RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.Int32 · filterable · populated 1,483 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  Refreshments: string | null;
  /** Edm.String(50) · filterable · populated 1,196 · RLS field */
  ShowingAgentFirstName: string | null;
  /** Edm.String(255) · filterable · populated 1,373 · RLS field */
  ShowingAgentKey: string | null;
  /** Edm.Int64 · filterable · populated 0 · not an RLS field · non-RESO */
  ShowingAgentKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 1,196 · RLS field */
  ShowingAgentLastName: string | null;
  /** Edm.String(25) · filterable · populated 1,373 · RLS field */
  ShowingAgentMlsID: string | null;
  /** Edm.String(25) · filterable · populated 1,483 · RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  SourceSystemKey: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  SourceSystemListingKey: string | null;
  /** Edm.String(255) · filterable · populated 1,483 · RLS field */
  SourceSystemName: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterable · populated 1,483 · not an RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
}

/** OpenHouse navigation properties (present on a row only under $expand). */
export interface CotalityOpenHouseNavigations {
  /** → Property[] · $expand SUPPORTED */
  Property?: CotalityProperty[];
}

/** Property · Cotality.DataStandard.RESO.DD.Property · 757 fields · accessible */
export interface CotalityProperty {
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  AboveGradeFinishedArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  AboveGradeFinishedAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 1) · filterable · populated 76 · not an RLS field */
  AboveGradeFinishedAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  AboveGradeUnfinishedArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  AboveGradeUnfinishedAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  AboveGradeUnfinishedAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  AccessCode: string | null;
  /** Enums.Multi.AccessibilityFeatures · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 25) · filterable · populated 4,802 · RLS field · members: CotalityEnum_AccessibilityFeatures */
  AccessibilityFeatures: string | null;
  /** Edm.Date(10) · filterable · populated 46,105 · RLS field · non-RESO */
  ActivationDate: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  AdditionalParcelsDescription: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  AdditionalParcelsYN: boolean | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  AnchorsCoTenants: string | null;
  /** Enums.Multi.Appliances · multi-enum (comma-joined member names) · Lookup 129 members (RLS-listed 61) · filterable · populated 202,134 · RLS field · members: CotalityEnum_Appliances */
  Appliances: string | null;
  /** Enums.Multi.ArchitecturalStyle · multi-enum (comma-joined member names) · Lookup 135 members (RLS-listed 18) · filterable · populated 248,763 · RLS field · members: CotalityEnum_ArchitecturalStyle */
  ArchitecturalStyle: string | null;
  /** Enums.Multi.AssociationAmenities · multi-enum (comma-joined member names) · Lookup 137 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_AssociationAmenities */
  AssociationAmenities: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 243,779 · RLS field */
  AssociationFee: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 60 · not an RLS field */
  AssociationFee2: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 5) · filterable · populated 178 · not an RLS field */
  AssociationFee2Frequency: CotalityEnum_FeeFrequency | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationFee3: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationFee3Frequency: CotalityEnum_FeeFrequency | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 4) · filterable · populated 81,884 · RLS field */
  AssociationFeeFrequency: CotalityEnum_FeeFrequency | null;
  /** Enums.Multi.AssociationFeeIncludes · multi-enum (comma-joined member names) · Lookup 63 members (RLS-listed 14) · filterable · populated 4,552 · RLS field · members: CotalityEnum_AssociationFeeIncludes */
  AssociationFeeIncludes: string | null;
  /** Edm.String(50) · filterable · populated 200 · not an RLS field */
  AssociationName: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  AssociationName2: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationName3: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  AssociationPhone: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  AssociationPhone2: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  AssociationPhone3: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 40,139 · RLS field · string with Lookup (see lookups.live.json) */
  AssociationYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 21,379 · RLS field · string with Lookup (see lookups.live.json) */
  AttachedGarageYN: boolean | null;
  /** Edm.String(120) · filterable · populated 0 · not an RLS field · non-RESO */
  AttributionContact: string | null;
  /** Edm.Date(10) · filterable · populated 373,040 · RLS field */
  AvailabilityDate: string | null;
  /** Enums.Multi.ExistingLeaseType · multi-enum (comma-joined member names) · Lookup 23 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_ExistingLeaseType */
  AvailableLeaseType: string | null;
  /** Edm.Date(10) · filterable · populated 4,354 · not an RLS field */
  BackOnMarketDate: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 4,353 · not an RLS field · non-RESO */
  BackOnMarketTimestamp: string | null;
  /** Enums.Multi.Basement · multi-enum (comma-joined member names) · Lookup 43 members (RLS-listed 20) · filterable · populated 59,659 · RLS field · members: CotalityEnum_Basement */
  Basement: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 65,252 · RLS field · string with Lookup (see lookups.live.json) */
  BasementYN: boolean | null;
  /** Edm.Int32 · filterable · populated 481,482 · RLS field */
  BathroomsFull: number | null;
  /** Edm.Int32 · filterable · populated 409,765 · RLS field */
  BathroomsHalf: number | null;
  /** Edm.Int32 · filterable · populated 323 · not an RLS field */
  BathroomsOneQuarter: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  BathroomsPartial: number | null;
  /** Edm.Int32 · filterable · populated 258 · not an RLS field */
  BathroomsThreeQuarter: number | null;
  /** Edm.Int32 · filterable · populated 587,684 · RLS field */
  BathroomsTotalInteger: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  BedroomsPossible: number | null;
  /** Edm.Int32 · filterable · populated 587,737 · RLS field */
  BedroomsTotal: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  BelowGradeFinishedArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  BelowGradeFinishedAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 1) · filterable · populated 16 · not an RLS field */
  BelowGradeFinishedAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  BelowGradeUnfinishedArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  BelowGradeUnfinishedAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  BelowGradeUnfinishedAreaUnits: CotalityEnum_AreaUnits | null;
  /** Enums.Multi.BodyType · multi-enum (comma-joined member names) · Lookup 7 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_BodyType */
  BodyType: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  BuilderModel: string | null;
  /** Edm.String(50) · filterable · populated 79 · not an RLS field */
  BuilderName: string | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  BuildingAreaSource: CotalityEnum_AreaSource | null;
  /** Edm.Decimal(14,2) · filterable · populated 15,003 · RLS field */
  BuildingAreaTotal: number | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 2) · filterable · populated 12,674 · RLS field */
  BuildingAreaUnits: CotalityEnum_AreaUnits | null;
  /** Enums.Multi.BuildingFeatures · multi-enum (comma-joined member names) · Lookup 123 members (RLS-listed 39) · filterable · populated 65,882 · RLS field · members: CotalityEnum_BuildingFeatures */
  BuildingFeatures: string | null;
  /** Edm.String(300) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  BuildingKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  BuildingKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 221,140 · RLS field */
  BuildingName: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  BusinessName: string | null;
  /** Enums.Multi.BusinessType · multi-enum (comma-joined member names) · Lookup 139 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_BusinessType */
  BusinessType: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentAOR: CotalityLookup_Member_MemberAOR | null;
  /** Enums.Multi.BuyerAgentDesignation · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_BuyerAgentDesignation */
  BuyerAgentDesignation: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentDirectPhone: string | null;
  /** Edm.String(80) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentEmail: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentFax: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentFirstName: string | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentFullName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentHomePhone: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  BuyerAgentKeyNumeric: number | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentLastName: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentMiddleName: string | null;
  /** Edm.String(25) · filterable · populated 100,112 · RLS field */
  BuyerAgentMlsId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentMobilePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentNamePrefix: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentNameSuffix: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentNationalAssociationId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentOfficePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentOfficePhoneExt: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentPager: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentPreferredPhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentPreferredPhoneExt: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentStateLicense: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentTollFreePhone: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerAgentURL: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentVoiceMail: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerAgentVoiceMailExt: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  BuyerBrokerageCompensation: string | null;
  /** Enums.CompensationType · Lookup 5 members (RLS-listed 2) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  BuyerBrokerageCompensationType: CotalityEnum_CompensationType | null;
  /** Enums.Multi.BuyerFinancing · multi-enum (comma-joined member names) · Lookup 42 members (RLS-listed 8) · filterable · populated 184 · not an RLS field · members: CotalityEnum_BuyerFinancing */
  BuyerFinancing: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerOfficeAOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(80) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerOfficeEmail: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerOfficeFax: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerOfficeKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  BuyerOfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 100,463 · RLS field */
  BuyerOfficeMlsId: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerOfficeName: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerOfficeNationalAssociationId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerOfficePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerOfficePhoneExt: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  BuyerOfficeURL: string | null;
  /** Edm.String(20) · filterable · populated 0 · not an RLS field */
  BuyerTeamKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  BuyerTeamKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field · non-RESO */
  BuyerTeamMlsId: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  BuyerTeamName: string | null;
  /** Edm.Int64 · filterable · populated 539,492 · not an RLS field · non-RESO */
  CLIP: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  CableTvExpense: number | null;
  /** Edm.Date(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CancellationDate: string | null;
  /** Edm.Decimal(5,2) · filterable · populated 44 · not an RLS field */
  CapRate: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 5 · not an RLS field */
  CarportSpaces: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 144 · not an RLS field · string with Lookup (see lookups.live.json) */
  CarportYN: boolean | null;
  /** Edm.String(9) · filterable · populated 0 · not an RLS field */
  CarrierRoute: string | null;
  /** Edm.String(50) · Lookup 24514 members (RLS-listed 1) · filterable · populated 591,607 · RLS field · string with Lookup (see lookups.live.json) */
  City: string | null;
  /** Edm.String(150) · filterable · populated 591,607 · RLS field */
  CityRegion: string | null;
  /** Edm.Date(10) · filterable · populated 578,417 · RLS field */
  CloseDate: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 508,931 · RLS field */
  ClosePrice: number | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentAOR: CotalityLookup_Member_MemberAOR | null;
  /** Enums.Multi.CoBuyerAgentDesignation · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_BuyerAgentDesignation */
  CoBuyerAgentDesignation: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentDirectPhone: string | null;
  /** Edm.String(80) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentEmail: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentFax: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentFirstName: string | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentFullName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentHomePhone: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  CoBuyerAgentKeyNumeric: number | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentLastName: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentMiddleName: string | null;
  /** Edm.String(25) · filterable · populated 3,168 · not an RLS field */
  CoBuyerAgentMlsId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentMobilePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentNamePrefix: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentNameSuffix: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentNationalAssociationId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentOfficePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentOfficePhoneExt: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentPager: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentPreferredPhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentPreferredPhoneExt: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentStateLicense: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentTollFreePhone: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentURL: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentVoiceMail: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerAgentVoiceMailExt: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeAOR: CotalityLookup_Property_CoBuyerOfficeAOR | null;
  /** Edm.String(80) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeEmail: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeFax: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  CoBuyerOfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 3,173 · not an RLS field */
  CoBuyerOfficeMlsId: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeName: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeNationalAssociationId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficePhone: string | null;
  /** Edm.String(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficePhoneExt: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoBuyerOfficeURL: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 50,821 · not an RLS field · non-RESO */
  CoListAgent2AOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(16) · filterable · populated 50,831 · not an RLS field · non-RESO */
  CoListAgent2DirectPhone: string | null;
  /** Edm.String(80) · filterable · populated 50,916 · not an RLS field · non-RESO */
  CoListAgent2Email: string | null;
  /** Edm.String(50) · filterable · populated 50,931 · not an RLS field · non-RESO */
  CoListAgent2FirstName: string | null;
  /** Edm.String(150) · filterable · populated 50,995 · not an RLS field · non-RESO */
  CoListAgent2FullName: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent2HomePhone: string | null;
  /** Edm.String(50) · filterable · populated 50,994 · not an RLS field · non-RESO */
  CoListAgent2Key: string | null;
  /** Edm.String(50) · filterable · populated 50,931 · not an RLS field · non-RESO */
  CoListAgent2LastName: string | null;
  /** Edm.String(50) · filterable · populated 19,072 · not an RLS field · non-RESO */
  CoListAgent2MiddleName: string | null;
  /** Edm.String(25) · filterable · populated 51,234 · not an RLS field · non-RESO */
  CoListAgent2MlsId: string | null;
  /** Edm.String(16) · filterable · populated 48,785 · not an RLS field · non-RESO */
  CoListAgent2MobilePhone: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent2NationalAssociationId: string | null;
  /** Edm.String(100) · filterable · populated 50,677 · not an RLS field · non-RESO */
  CoListAgent2Nickname: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent2OfficePhone: string | null;
  /** Edm.String(16) · filterable · populated 50,779 · not an RLS field · non-RESO */
  CoListAgent2PreferredPhone: string | null;
  /** Edm.String(50) · filterable · populated 50,697 · not an RLS field · non-RESO */
  CoListAgent2StateLicense: string | null;
  /** Edm.String(8000) · filterable · populated 3,861 · not an RLS field · non-RESO */
  CoListAgent2URL: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 7,868 · not an RLS field · non-RESO */
  CoListAgent3AOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(16) · filterable · populated 7,962 · not an RLS field · non-RESO */
  CoListAgent3DirectPhone: string | null;
  /** Edm.String(80) · filterable · populated 7,987 · not an RLS field · non-RESO */
  CoListAgent3Email: string | null;
  /** Edm.String(50) · filterable · populated 7,957 · not an RLS field · non-RESO */
  CoListAgent3FirstName: string | null;
  /** Edm.String(150) · filterable · populated 7,993 · not an RLS field · non-RESO */
  CoListAgent3FullName: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent3HomePhone: string | null;
  /** Edm.String(50) · filterable · populated 7,993 · not an RLS field · non-RESO */
  CoListAgent3Key: string | null;
  /** Edm.String(50) · filterable · populated 7,957 · not an RLS field · non-RESO */
  CoListAgent3LastName: string | null;
  /** Edm.String(50) · filterable · populated 3,101 · not an RLS field · non-RESO */
  CoListAgent3MiddleName: string | null;
  /** Edm.String(25) · filterable · populated 7,994 · not an RLS field · non-RESO */
  CoListAgent3MlsId: string | null;
  /** Edm.String(16) · filterable · populated 7,493 · not an RLS field · non-RESO */
  CoListAgent3MobilePhone: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent3NationalAssociationId: string | null;
  /** Edm.String(100) · filterable · populated 7,828 · not an RLS field · non-RESO */
  CoListAgent3Nickname: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field · non-RESO */
  CoListAgent3OfficePhone: string | null;
  /** Edm.String(16) · filterable · populated 7,937 · not an RLS field · non-RESO */
  CoListAgent3PreferredPhone: string | null;
  /** Edm.String(50) · filterable · populated 7,880 · not an RLS field · non-RESO */
  CoListAgent3StateLicense: string | null;
  /** Edm.String(8000) · filterable · populated 716 · not an RLS field · non-RESO */
  CoListAgent3URL: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · filterable · populated 207,368 · RLS field */
  CoListAgentAOR: CotalityLookup_Member_MemberAOR | null;
  /** Enums.Multi.CoListAgentDesignation · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_BuyerAgentDesignation */
  CoListAgentDesignation: string | null;
  /** Edm.String(16) · filterable · populated 206,739 · RLS field */
  CoListAgentDirectPhone: string | null;
  /** Edm.String(80) · filterable · populated 208,274 · RLS field */
  CoListAgentEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListAgentFax: string | null;
  /** Edm.String(50) · filterable · populated 207,355 · RLS field */
  CoListAgentFirstName: string | null;
  /** Edm.String(150) · filterable · populated 208,274 · RLS field */
  CoListAgentFullName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoListAgentHomePhone: string | null;
  /** Edm.String(20) · filterable · populated 207,401 · RLS field */
  CoListAgentKey: string | null;
  /** Edm.Int64 · filterable · populated 207,401 · RLS field · non-RESO */
  CoListAgentKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 207,360 · RLS field */
  CoListAgentLastName: string | null;
  /** Edm.String(50) · filterable · populated 84,950 · RLS field */
  CoListAgentMiddleName: string | null;
  /** Edm.String(25) · filterable · populated 208,023 · RLS field */
  CoListAgentMlsId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  CoListAgentMobilePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListAgentNamePrefix: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListAgentNameSuffix: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  CoListAgentNationalAssociationId: string | null;
  /** Edm.String(100) · filterable · populated 206,954 · not an RLS field · non-RESO */
  CoListAgentNickname: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListAgentOfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListAgentOfficePhoneExt: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListAgentPager: string | null;
  /** Edm.String(16) · filterable · populated 206,467 · RLS field */
  CoListAgentPreferredPhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListAgentPreferredPhoneExt: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  CoListAgentStateLicense: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListAgentTollFreePhone: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  CoListAgentURL: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListAgentVoiceMail: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListAgentVoiceMailExt: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 50,884 · not an RLS field · non-RESO */
  CoListOffice2AOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(80) · filterable · populated 6,411 · not an RLS field · non-RESO */
  CoListOffice2Email: string | null;
  /** Edm.String(50) · filterable · populated 50,994 · not an RLS field · non-RESO */
  CoListOffice2Key: string | null;
  /** Edm.String(25) · filterable · populated 50,994 · not an RLS field · non-RESO */
  CoListOffice2MlsId: string | null;
  /** Edm.String(255) · filterable · populated 50,994 · not an RLS field · non-RESO */
  CoListOffice2Name: string | null;
  /** Edm.String(16) · filterable · populated 50,927 · not an RLS field · non-RESO */
  CoListOffice2Phone: string | null;
  /** Edm.String(8000) · filterable · populated 48,800 · not an RLS field · non-RESO */
  CoListOffice2URL: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 207,183 · RLS field */
  CoListOfficeAOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(80) · filterable · populated 21,683 · RLS field */
  CoListOfficeEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  CoListOfficeFax: string | null;
  /** Edm.String(20) · filterable · populated 207,401 · RLS field */
  CoListOfficeKey: string | null;
  /** Edm.Int64 · filterable · populated 207,401 · RLS field · non-RESO */
  CoListOfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 207,401 · RLS field */
  CoListOfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 207,401 · RLS field */
  CoListOfficeName: string | null;
  /** Edm.String(30) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CoListOfficeNationalAssociationId: string | null;
  /** Edm.String(16) · filterable · populated 207,248 · RLS field */
  CoListOfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  CoListOfficePhoneExt: string | null;
  /** Edm.String(8000) · filterable · populated 199,749 · RLS field */
  CoListOfficeURL: string | null;
  /** Enums.CommonInterest · Lookup 13 members (RLS-listed 6) · filterable · populated 435,273 · RLS field */
  CommonInterest: CotalityEnum_CommonInterest | null;
  /** Enums.Multi.CommonWalls · multi-enum (comma-joined member names) · Lookup 6 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_CommonWalls */
  CommonWalls: string | null;
  /** Enums.Multi.CommunityFeatures · multi-enum (comma-joined member names) · Lookup 141 members (RLS-listed 2) · filterable · populated 5,999 · RLS field · members: CotalityEnum_CommunityFeatures */
  CommunityFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  CompSaleYN: boolean | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  CompensationComments: string | null;
  /** Edm.Decimal(14,3) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionInPrice: number | null;
  /** Enums.ConcessionInPriceType · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionInPriceType: CotalityEnum_ConcessionInPriceType | null;
  /** Enums.Concessions · Lookup 3 members (RLS-listed 3) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  Concessions: CotalityEnum_Concessions | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ConcessionsAmount: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionsBuyerBrokerFee: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionsClosingCosts: number | null;
  /** Edm.String(200) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ConcessionsComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionsFinancingCosts: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionsOtherCosts: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ConcessionsPropertyImprovementCosts: number | null;
  /** Enums.Multi.ConstructionMaterials · multi-enum (comma-joined member names) · Lookup 87 members (RLS-listed 14) · filterable · populated 45 · not an RLS field · members: CotalityEnum_ConstructionMaterials */
  ConstructionMaterials: string | null;
  /** Edm.String(150) · filterable · populated 0 · not an RLS field */
  ContinentRegion: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  Contingency: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  ContingentDate: string | null;
  /** Edm.Date(10) · filterable · populated 591,607 · RLS field */
  ContractStatusChangeDate: string | null;
  /** Enums.Multi.Cooling · multi-enum (comma-joined member names) · Lookup 41 members (RLS-listed 19) · filterable · populated 205,151 · RLS field · members: CotalityEnum_Cooling */
  Cooling: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 233,886 · RLS field · string with Lookup (see lookups.live.json) */
  CoolingYN: boolean | null;
  /** Edm.String(500) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CopyrightNotice: string | null;
  /** Enums.Country · Lookup 246 members (RLS-listed 1) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  Country: CotalityEnum_Country | null;
  /** Edm.String(150) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CountryRegion: string | null;
  /** Edm.String(128) · filterable · populated 591,582 · not an RLS field · non-RESO */
  CountrySubdivision: string | null;
  /** Edm.String(50) · Lookup 4423 members (RLS-listed 5) · filterable · populated 591,607 · RLS field · string with Lookup (see lookups.live.json) */
  CountyOrParish: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  CoveredSpaces: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  CropsIncludedYN: boolean | null;
  /** Edm.String(50) · filterable · populated 396,743 · RLS field */
  CrossStreet: string | null;
  /** Edm.Decimal(14,2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  CultivatedArea: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  CumulativeDaysOnMarket: number | null;
  /** Enums.Multi.CurrentFinancing · multi-enum (comma-joined member names) · Lookup 24 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_CurrentFinancing */
  CurrentFinancing: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 591,607 · not an RLS field · non-RESO */
  CurrentPrice: number | null;
  /** Enums.Multi.CurrentOrPossibleUse · multi-enum (comma-joined member names) · Lookup 66 members (RLS-listed 10) · filterable · populated 786 · not an RLS field · members: CotalityLookup_Property_CurrentUse */
  CurrentUse: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  DOH1: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  DOH2: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  DOH3: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  DaysOnMarket: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  DaysOnMarketReplication: number | null;
  /** Edm.Date(10) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  DaysOnMarketReplicationDate: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  DaysOnMarketReplicationIncreasingYN: boolean | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field · non-RESO */
  DelayedMarketingDate: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  DelayedMarketingYN: boolean | null;
  /** Enums.Multi.DevelopmentStatus · multi-enum (comma-joined member names) · Lookup 19 members (RLS-listed 7) · filterable · populated 462 · not an RLS field · members: CotalityEnum_DevelopmentStatus */
  DevelopmentStatus: string | null;
  /** Enums.DirectionFaces · Lookup 9 members (RLS-listed 6) · filterable · populated 1,382 · not an RLS field */
  DirectionFaces: CotalityEnum_DirectionFaces | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  Directions: string | null;
  /** Edm.String(500) · filterable · populated 0 · not an RLS field */
  Disclaimer: string | null;
  /** Enums.Multi.Disclosures · multi-enum (comma-joined member names) · Lookup 119 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_Disclosures */
  Disclosures: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToBusComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToBusNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToBusUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToElectricComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToElectricNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToElectricUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToFreewayComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToFreewayNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToFreewayUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToGasComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToGasNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToGasUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPhoneServiceComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPhoneServiceNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPhoneServiceUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPlaceofWorshipComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPlaceofWorshipNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToPlaceofWorshipUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolBusComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolBusNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolBusUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolsComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolsNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSchoolsUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSewerComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSewerNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToSewerUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToShoppingComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToShoppingNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToShoppingUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToStreetComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToStreetNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToStreetUnits: CotalityEnum_LinearUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToWaterComments: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToWaterNumeric: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  DistanceToWaterUnits: CotalityEnum_LinearUnits | null;
  /** Enums.Multi.DocumentsAvailable · multi-enum (comma-joined member names) · Lookup 94 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_DocumentsAvailable */
  DocumentsAvailable: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 366,181 · RLS field */
  DocumentsChangeTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 591,607 · RLS field */
  DocumentsCount: number | null;
  /** Enums.Multi.DoorFeatures · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 5) · filterable · populated 32 · not an RLS field · members: CotalityEnum_DoorFeatures */
  DoorFeatures: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  DownPaymentAssistanceAmount: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  DownPaymentAssistanceCount: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  DownPaymentAssistanceYN: boolean | null;
  /** Edm.Boolean · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  DualOrVariableRateCommissionYN: boolean | null;
  /** Enums.Multi.Electric · multi-enum (comma-joined member names) · Lookup 46 members (RLS-listed 4) · filterable · populated 10 · not an RLS field · members: CotalityEnum_Electric */
  Electric: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  ElectricExpense: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 118 · not an RLS field · string with Lookup (see lookups.live.json) */
  ElectricOnPropertyYN: boolean | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  ElementarySchool: string | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  ElementarySchoolDistrict: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  Elevation: number | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ElevationUnits: CotalityEnum_LinearUnits | null;
  /** Edm.Int32 · filterable · populated 424,420 · RLS field */
  EntryLevel: number | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  EntryLocation: string | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field · non-RESO */
  EstimatedCloseDate: string | null;
  /** Edm.String(1024) · filterable · populated 111,787 · RLS field */
  Exclusions: string | null;
  /** Enums.Multi.ExistingLeaseType · multi-enum (comma-joined member names) · Lookup 23 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_ExistingLeaseType */
  ExistingLeaseType: string | null;
  /** Edm.Date(10) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ExpirationDate: string | null;
  /** Enums.Multi.Exposures · multi-enum (comma-joined member names) · Lookup 9 members (RLS-listed 4) · filterable · populated 338,278 · not an RLS field · non-RESO · members: CotalityEnum_DirectionFaces */
  Exposures: string | null;
  /** Enums.Multi.ExteriorFeatures · multi-enum (comma-joined member names) · Lookup 152 members (RLS-listed 50) · filterable · populated 238,927 · RLS field · members: CotalityEnum_ExteriorFeatures */
  ExteriorFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  FarmCreditServiceInclYN: boolean | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  FarmLandAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  FarmLandAreaUnits: CotalityEnum_AreaUnits | null;
  /** Enums.Multi.Fencing · multi-enum (comma-joined member names) · Lookup 56 members (RLS-listed 17) · filterable · populated 44 · not an RLS field · members: CotalityEnum_Fencing */
  Fencing: string | null;
  /** Enums.FhaEligibility · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  FhaEligibility: CotalityEnum_FhaEligibility | null;
  /** Enums.Multi.FinancialDataSource · multi-enum (comma-joined member names) · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_FinancialDataSource */
  FinancialDataSource: string | null;
  /** Enums.Multi.FireplaceFeatures · multi-enum (comma-joined member names) · Lookup 79 members (RLS-listed 32) · filterable · populated 18,576 · RLS field · members: CotalityEnum_FireplaceFeatures */
  FireplaceFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 96,628 · RLS field · string with Lookup (see lookups.live.json) */
  FireplaceYN: boolean | null;
  /** Edm.Int32 · filterable · populated 29,172 · RLS field */
  FireplacesTotal: number | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 0 · not an RLS field · non-RESO */
  FloorPlansChangeTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  FloorPlansCount: number | null;
  /** Enums.Multi.Flooring · multi-enum (comma-joined member names) · Lookup 62 members (RLS-listed 23) · filterable · populated 25,863 · RLS field · members: CotalityEnum_Flooring */
  Flooring: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 802 · not an RLS field */
  FoundationArea: number | null;
  /** Enums.Multi.FoundationDetails · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 8) · filterable · populated 13 · not an RLS field · members: CotalityEnum_FoundationDetails */
  FoundationDetails: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field · non-RESO */
  FrontageLength: string | null;
  /** Edm.String(500) · filterable · populated 0 · not an RLS field */
  FrontageLengthRemarks: string | null;
  /** Enums.FrontageLengthUnit · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  FrontageLengthUnit: CotalityEnum_FrontageLengthUnit | null;
  /** Enums.Multi.FrontageType · multi-enum (comma-joined member names) · Lookup 14 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_FrontageType */
  FrontageType: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  FuelExpense: number | null;
  /** Enums.Furnished · Lookup 5 members (RLS-listed 5) · filterable · populated 95,091 · RLS field */
  Furnished: CotalityEnum_Furnished | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  FurnitureReplacementExpense: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 66,660 · not an RLS field */
  GarageSpaces: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 547,220 · RLS field · string with Lookup (see lookups.live.json) */
  GarageYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  GardenerExpense: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  GrazingPermitsBlmYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  GrazingPermitsForestServiceYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  GrazingPermitsPrivateYN: boolean | null;
  /** Enums.Multi.GreenBuildingVerificationType · multi-enum (comma-joined member names) · Lookup 29 members (RLS-listed 2) · filterable · populated 5 · not an RLS field · members: CotalityEnum_GreenBuildingVerificationType */
  GreenBuildingVerificationType: string | null;
  /** Enums.Multi.GreenEnergyEfficient · multi-enum (comma-joined member names) · Lookup 25 members (RLS-listed 8) · filterable · populated 416 · not an RLS field · members: CotalityEnum_GreenEnergyEfficient */
  GreenEnergyEfficient: string | null;
  /** Enums.Multi.GreenEnergyGeneration · multi-enum (comma-joined member names) · Lookup 8 members (RLS-listed 1) · filterable · populated 2 · not an RLS field · members: CotalityEnum_GreenEnergyGeneration */
  GreenEnergyGeneration: string | null;
  /** Enums.Multi.GreenIndoorAirQuality · multi-enum (comma-joined member names) · Lookup 8 members (RLS-listed 1) · filterable · populated 1 · not an RLS field · members: CotalityEnum_GreenIndoorAirQuality */
  GreenIndoorAirQuality: string | null;
  /** Enums.Multi.GreenLocation · multi-enum (comma-joined member names) · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_GreenLocation */
  GreenLocation: string | null;
  /** Enums.Multi.GreenSustainability · multi-enum (comma-joined member names) · Lookup 9 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_GreenSustainability */
  GreenSustainability: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  GreenVerificationYN: boolean | null;
  /** Enums.Multi.GreenWaterConservation · multi-enum (comma-joined member names) · Lookup 12 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_GreenWaterConservation */
  GreenWaterConservation: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  GrossIncome: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  GrossScheduledIncome: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  HabitableResidenceYN: boolean | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  HeadBrokerMemberKey: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  HeadBrokerMemberMlsId: string | null;
  /** Enums.Multi.Heating · multi-enum (comma-joined member names) · Lookup 96 members (RLS-listed 39) · filterable · populated 22,920 · RLS field · members: CotalityEnum_Heating */
  Heating: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 38,477 · RLS field · string with Lookup (see lookups.live.json) */
  HeatingYN: boolean | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  HighSchool: string | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  HighSchoolDistrict: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 6 · not an RLS field · string with Lookup (see lookups.live.json) */
  HomeWarrantyYN: boolean | null;
  /** Enums.Multi.HorseAmenities · multi-enum (comma-joined member names) · Lookup 41 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_HorseAmenities */
  HorseAmenities: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  HorseYN: boolean | null;
  /** Enums.Multi.HoursDaysOfOperation · multi-enum (comma-joined member names) · Lookup 9 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_HoursDaysOfOperation */
  HoursDaysOfOperation: string | null;
  /** Edm.String(255) · filterable · populated 0 · not an RLS field */
  HoursDaysOfOperationDescription: string | null;
  /** Edm.Boolean · filterable · populated 591,607 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.String(1024) · filterable · populated 111,868 · RLS field */
  Inclusions: string | null;
  /** Enums.Multi.IncomeIncludes · multi-enum (comma-joined member names) · Lookup 7 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_IncomeIncludes */
  IncomeIncludes: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  InsuranceExpense: number | null;
  /** Enums.Multi.InteriorOrRoomFeatures · multi-enum (comma-joined member names) · Lookup 299 members (RLS-listed 55) · filterable · populated 144,434 · RLS field · members: CotalityLookup_Property_InteriorFeatures */
  InteriorFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · string with Lookup (see lookups.live.json) */
  InternetAddressDisplayYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 591,607 · RLS field · string with Lookup (see lookups.live.json) */
  InternetAutomatedValuationDisplayYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 591,607 · RLS field · string with Lookup (see lookups.live.json) */
  InternetConsumerCommentYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.Multi.IrrigationSource · multi-enum (comma-joined member names) · Lookup 21 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_IrrigationSource */
  IrrigationSource: string | null;
  /** Edm.Decimal(16,4) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  IrrigationWaterRightsAcres: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  IrrigationWaterRightsYN: boolean | null;
  /** Enums.Multi.LaborInformation · multi-enum (comma-joined member names) · Lookup 3 members (RLS-listed 3) · filterable · populated 5 · not an RLS field · members: CotalityEnum_LaborInformation */
  LaborInformation: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  LandLeaseAmount: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 2) · filterable · populated 1 · not an RLS field */
  LandLeaseAmountFrequency: CotalityEnum_FeeFrequency | null;
  /** Edm.Date(10) · filterable · populated 325 · not an RLS field */
  LandLeaseExpirationDate: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 70,069 · RLS field · string with Lookup (see lookups.live.json) */
  LandLeaseYN: boolean | null;
  /** Edm.Decimal(14,8) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  Latitude: number | null;
  /** Enums.Multi.LaundryFeatures · multi-enum (comma-joined member names) · Lookup 50 members (RLS-listed 38) · filterable · populated 393,328 · RLS field · members: CotalityEnum_LaundryFeatures */
  LaundryFeatures: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  LeasableArea: number | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  LeasableAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  LeaseAmount: number | null;
  /** Enums.FeeFrequency · Lookup 16 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  LeaseAmountFrequency: CotalityEnum_FeeFrequency | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  LeaseAssignableYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  LeaseConsideredYN: boolean | null;
  /** Edm.Date(10) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  LeaseExpiration: string | null;
  /** Enums.Multi.LeaseRenewalCompensation · multi-enum (comma-joined member names) · Lookup 5 members (RLS-listed 5) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_LeaseRenewalCompensation */
  LeaseRenewalCompensation: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  LeaseRenewalOptionYN: boolean | null;
  /** Enums.LeaseTerm · Lookup 26 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  LeaseTerm: CotalityLookup_Property_LeaseTerm | null;
  /** Enums.Multi.LeaseTerm · multi-enum (comma-joined member names) · Lookup 26 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_Property_LeaseTerm */
  LeaseTermOptions: string | null;
  /** Enums.Multi.Levels · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 6) · filterable · populated 5,755 · RLS field · members: CotalityEnum_Levels */
  Levels: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  License1: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  License2: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  License3: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  LicensesExpense: number | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · filterable · populated 585,917 · RLS field */
  ListAgentAOR: CotalityLookup_Member_MemberAOR | null;
  /** Enums.Multi.ListAgentDesignation · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_BuyerAgentDesignation */
  ListAgentDesignation: string | null;
  /** Edm.String(16) · filterable · populated 580,228 · RLS field */
  ListAgentDirectPhone: string | null;
  /** Edm.String(80) · filterable · populated 591,607 · RLS field */
  ListAgentEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListAgentFax: string | null;
  /** Edm.String(50) · filterable · populated 585,957 · RLS field */
  ListAgentFirstName: string | null;
  /** Edm.String(150) · filterable · populated 591,607 · RLS field */
  ListAgentFullName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  ListAgentHomePhone: string | null;
  /** Edm.String(20) · filterable · populated 587,315 · RLS field */
  ListAgentKey: string | null;
  /** Edm.Int64 · filterable · populated 587,315 · RLS field · non-RESO */
  ListAgentKeyNumeric: number | null;
  /** Edm.String(50) · filterable · populated 585,980 · RLS field */
  ListAgentLastName: string | null;
  /** Edm.String(50) · filterable · populated 250,636 · RLS field */
  ListAgentMiddleName: string | null;
  /** Edm.String(25) · filterable · populated 591,197 · RLS field */
  ListAgentMlsId: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ListAgentMobilePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListAgentNamePrefix: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListAgentNameSuffix: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  ListAgentNationalAssociationId: string | null;
  /** Edm.String(100) · filterable · populated 585,639 · not an RLS field · non-RESO */
  ListAgentNickname: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListAgentOfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListAgentOfficePhoneExt: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListAgentPager: string | null;
  /** Edm.String(16) · filterable · populated 578,578 · RLS field */
  ListAgentPreferredPhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListAgentPreferredPhoneExt: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ListAgentStateLicense: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListAgentTollFreePhone: string | null;
  /** Edm.String(8000) · filterable · populated 61,122 · RLS field */
  ListAgentURL: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListAgentVoiceMail: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListAgentVoiceMailExt: string | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 1) · filterable · populated 591,537 · RLS field */
  ListOfficeAOR: CotalityLookup_Member_MemberAOR | null;
  /** Edm.String(80) · filterable · populated 52,567 · RLS field */
  ListOfficeEmail: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ListOfficeFax: string | null;
  /** Edm.String(20) · filterable · populated 591,607 · RLS field */
  ListOfficeKey: string | null;
  /** Edm.Int64 · filterable · populated 591,607 · RLS field · non-RESO */
  ListOfficeKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 591,607 · RLS field */
  ListOfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 591,607 · RLS field */
  ListOfficeName: string | null;
  /** Edm.String(30) · filterable · populated 0 · not an RLS field */
  ListOfficeNationalAssociationId: string | null;
  /** Edm.String(16) · filterable · populated 591,538 · RLS field */
  ListOfficePhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ListOfficePhoneExt: string | null;
  /** Edm.String(8000) · filterable · populated 585,251 · RLS field */
  ListOfficeURL: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 591,607 · RLS field */
  ListPrice: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  ListPriceLow: number | null;
  /** Edm.String(20) · filterable · populated 0 · not an RLS field */
  ListTeamKey: string | null;
  /** Edm.Int64 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ListTeamKeyNumeric: number | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field · non-RESO */
  ListTeamMlsId: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  ListTeamName: string | null;
  /** Enums.ListingAgreement · Lookup 11 members (RLS-listed 6) · filterable · populated 591,607 · RLS field */
  ListingAgreement: CotalityEnum_ListingAgreement | null;
  /** Edm.Date(10) · filterable · populated 581,836 · RLS field */
  ListingContractDate: string | null;
  /** Edm.String(255) · filterable · populated 591,607 · RLS field */
  ListingId: string | null;
  /** Edm.String(20) · filterable · populated 591,607 · RLS field */
  ListingKey: string;
  /** Edm.Int64 · filterable · populated 591,607 · RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Enums.ListingService · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ListingService: CotalityEnum_ListingService | null;
  /** Enums.Multi.ListingTerms · multi-enum (comma-joined member names) · Lookup 67 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_ListingTerms */
  ListingTerms: string | null;
  /** Edm.String(8000) · filterable · populated 582,804 · not an RLS field */
  ListingURL: string | null;
  /** Enums.ListingURLDescription · Lookup 7 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  ListingURLDescription: CotalityEnum_ListingURLDescription | null;
  /** Edm.Decimal(14,2) · filterable · populated 417,652 · RLS field */
  LivingArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  LivingAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 1) · filterable · populated 446,923 · RLS field */
  LivingAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  LockBoxLocation: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  LockBoxSerialNumber: string | null;
  /** Enums.Multi.LockBoxType · multi-enum (comma-joined member names) · Lookup 11 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_LockBoxType */
  LockBoxType: string | null;
  /** Edm.Decimal(14,8) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  Longitude: number | null;
  /** Enums.LotDimensionsSource · Lookup 14 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  LotDimensionsSource: CotalityEnum_LotDimensionsSource | null;
  /** Enums.Multi.LotFeatures · multi-enum (comma-joined member names) · Lookup 207 members (RLS-listed 27) · filterable · populated 1,714 · not an RLS field · members: CotalityEnum_LotFeatures */
  LotFeatures: string | null;
  /** Edm.Decimal(16,4) · filterable · populated 0 · not an RLS field */
  LotSizeAcres: number | null;
  /** Edm.Decimal(16,4) · filterable · populated 60,046 · RLS field */
  LotSizeArea: number | null;
  /** Edm.String(150) · filterable · populated 237,288 · RLS field */
  LotSizeDimensions: string | null;
  /** Enums.LotSizeSource · Lookup 15 members (RLS-listed 10) · filterable · populated 341 · not an RLS field */
  LotSizeSource: CotalityEnum_LotSizeSource | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  LotSizeSquareFeet: number | null;
  /** Enums.LotSizeUnits · Lookup 4 members (RLS-listed 3) · filterable · populated 35,362 · RLS field */
  LotSizeUnits: CotalityEnum_LotSizeUnits | null;
  /** Edm.String(150) · Lookup 1 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  MLSAreaMajor: string | null;
  /** Edm.String(150) · Lookup 1 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  MLSAreaMinor: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  MainLevelBathrooms: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  MainLevelBedrooms: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 10 · not an RLS field */
  MaintenanceExpense: number | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,607 · RLS field */
  MajorChangeTimestamp: string | null;
  /** Enums.ChangeType · Lookup 14 members (RLS-listed 13) · filterable · populated 588,497 · RLS field */
  MajorChangeType: CotalityLookup_Property_MajorChangeType | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  Make: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  ManagerExpense: number | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MapCoordinate: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MapCoordinateSource: string | null;
  /** Edm.String(8000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MapURL: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  MaximumNumberOfPets: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  MaximumPetWeight: number | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  MiddleOrJuniorSchool: string | null;
  /** Edm.String(50) · Lookup 1 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  MiddleOrJuniorSchoolDistrict: string | null;
  /** Enums.MlsStatus · Lookup 26 members (RLS-listed 9) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  MlsStatus: CotalityLookup_Property_MlsStatus | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MobileDimUnits: CotalityEnum_LinearUnits | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  MobileHomeRemainsYN: boolean | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MobileLength: number | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  MobileWidth: number | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  Model: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,607 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Enums.Multi.MoveInCosts · multi-enum (comma-joined member names) · Lookup 13 members (RLS-listed 13) · filterable · populated 375 · not an RLS field · non-RESO · members: CotalityEnum_MoveInCosts */
  MoveInCosts: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 108 · not an RLS field · non-RESO */
  MoveInCostsAmount: number | null;
  /** Edm.String(1024) · filterable · populated 381 · not an RLS field · non-RESO */
  MoveInCostsComments: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 218 · not an RLS field */
  NetOperatingIncome: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 576,590 · RLS field · string with Lookup (see lookups.live.json) */
  NewConstructionYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  NewTaxesExpense: number | null;
  /** Edm.Int32 · filterable · populated 74 · not an RLS field */
  NumberOfBuildings: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfFullTimeEmployees: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfLots: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfPads: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfPartTimeEmployees: number | null;
  /** Edm.Int32 · filterable · populated 9 · not an RLS field */
  NumberOfSeparateElectricMeters: number | null;
  /** Edm.Int32 · filterable · populated 10 · not an RLS field */
  NumberOfSeparateGasMeters: number | null;
  /** Edm.Int32 · filterable · populated 8 · not an RLS field */
  NumberOfSeparateWaterMeters: number | null;
  /** Edm.Int32 · filterable · populated 8 · not an RLS field */
  NumberOfUnitsInCommunity: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfUnitsLeased: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  NumberOfUnitsMoMo: number | null;
  /** Edm.Int32 · filterable · populated 591,607 · RLS field */
  NumberOfUnitsTotal: number | null;
  /** Edm.Int32 · filterable · populated 7,941 · RLS field */
  NumberOfUnitsVacant: number | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OccupantName: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OccupantPhone: string | null;
  /** Enums.OccupantType · Lookup 7 members (RLS-listed 3) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  OccupantType: CotalityEnum_OccupantType | null;
  /** Edm.Date(10) · filterable · populated 578,868 · RLS field */
  OffMarketDate: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 579,587 · RLS field */
  OffMarketTimestamp: string | null;
  /** Edm.Date(10) · filterable · populated 119,571 · RLS field */
  OnMarketDate: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 265,702 · RLS field */
  OnMarketTimestamp: string | null;
  /** Enums.Multi.OngoingFees · multi-enum (comma-joined member names) · Lookup 5 members (RLS-listed 1) · filterable · populated 28 · not an RLS field · non-RESO · members: CotalityEnum_OngoingFees */
  OngoingFees: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 0 · not an RLS field · non-RESO */
  OpenHouseModificationTimestamp: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 16 · not an RLS field */
  OpenParkingSpaces: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 126 · not an RLS field · string with Lookup (see lookups.live.json) */
  OpenParkingYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  OperatingExpense: number | null;
  /** Enums.Multi.OperatingExpenseIncludes · multi-enum (comma-joined member names) · Lookup 39 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_OperatingExpenseIncludes */
  OperatingExpenseIncludes: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,607 · RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 375,691 · RLS field */
  OriginalListPrice: number | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  OriginatingSystemBuyerAgentMemberKey: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  OriginatingSystemBuyerOfficeKey: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OriginatingSystemBuyerTeamKey: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OriginatingSystemCoBuyerAgentMemberKey: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OriginatingSystemCoBuyerOfficeKey: string | null;
  /** Edm.String(255) · filterable · populated 50,998 · not an RLS field · non-RESO */
  OriginatingSystemCoListAgent2MemberKey: string | null;
  /** Edm.String(255) · filterable · populated 7,993 · not an RLS field · non-RESO */
  OriginatingSystemCoListAgent3MemberKey: string | null;
  /** Edm.String(255) · filterable · populated 207,472 · RLS field · non-RESO */
  OriginatingSystemCoListAgentMemberKey: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  OriginatingSystemCoListOffice2Key: string | null;
  /** Edm.String(255) · filterable · populated 21,227 · RLS field · non-RESO */
  OriginatingSystemCoListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 546,550 · RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterable · populated 591,607 · RLS field */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterable · populated 587,646 · RLS field · non-RESO */
  OriginatingSystemListAgentMemberKey: string | null;
  /** Edm.String(255) · filterable · populated 589,675 · RLS field · non-RESO */
  OriginatingSystemListOfficeKey: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  OriginatingSystemListTeamKey: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,607 · not an RLS field · non-RESO */
  OriginatingSystemModificationTimestamp: string | null;
  /** Edm.String(255) · filterable · populated 591,607 · RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 1) · filterable · populated 591,607 · RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.OtherEquipment · multi-enum (comma-joined member names) · Lookup 35 members (RLS-listed 7) · filterable · populated 72,586 · RLS field · members: CotalityEnum_OtherEquipment */
  OtherEquipment: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  OtherExpense: number | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  OtherParking: string | null;
  /** Enums.Multi.OtherStructures · multi-enum (comma-joined member names) · Lookup 59 members (RLS-listed 12) · filterable · populated 1,632 · not an RLS field · members: CotalityEnum_OtherStructures */
  OtherStructures: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OwnerName: string | null;
  /** Edm.String(100) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  OwnerName2: string | null;
  /** Enums.Multi.OwnerPays · multi-enum (comma-joined member names) · Lookup 39 members (RLS-listed 24) · filterable · populated 7,915 · RLS field · members: CotalityEnum_OwnerPays */
  OwnerPays: string | null;
  /** Edm.String(16) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  OwnerPhone: string | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  Ownership: string | null;
  /** Enums.OwnershipType · Lookup 13 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  OwnershipType: CotalityEnum_OwnershipType | null;
  /** Edm.String(50) · filterable · populated 380,705 · not an RLS field */
  ParcelNumber: string | null;
  /** Edm.String(128) · filterable · populated 0 · not an RLS field · non-RESO */
  ParcelSubcomponent: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  ParkManagerName: string | null;
  /** Edm.String(16) · filterable · populated 0 · not an RLS field */
  ParkManagerPhone: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  ParkName: string | null;
  /** Enums.Multi.ParkingFeatures · multi-enum (comma-joined member names) · Lookup 204 members (RLS-listed 54) · filterable · populated 10,376 · RLS field · members: CotalityEnum_ParkingFeatures */
  ParkingFeatures: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 237 · not an RLS field */
  ParkingTotal: number | null;
  /** Edm.Decimal(14,2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  PastureArea: number | null;
  /** Enums.Multi.PatioAndPorchFeatures · multi-enum (comma-joined member names) · Lookup 53 members (RLS-listed 27) · filterable · populated 156,521 · RLS field · members: CotalityEnum_PatioAndPorchFeatures */
  PatioAndPorchFeatures: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 143,221 · RLS field */
  PendingTimestamp: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 3) · filterable · populated 591,607 · RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  PestControlExpense: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  PetDeposit: number | null;
  /** Enums.Multi.PetsAllowed · multi-enum (comma-joined member names) · Lookup 31 members (RLS-listed 14) · filterable · populated 586,565 · RLS field · members: CotalityEnum_PetsAllowed */
  PetsAllowed: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  PetsAllowedYN: boolean | null;
  /** Edm.String(500) · filterable · populated 591,607 · not an RLS field · non-RESO */
  PetsComments: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,597 · RLS field */
  PhotosChangeTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 591,607 · RLS field */
  PhotosCount: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  PoolExpense: number | null;
  /** Enums.Multi.PoolFeatures · multi-enum (comma-joined member names) · Lookup 88 members (RLS-listed 43) · filterable · populated 10,669 · not an RLS field · members: CotalityEnum_PoolFeatures */
  PoolFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  PoolPrivateYN: boolean | null;
  /** Enums.Multi.Possession · multi-enum (comma-joined member names) · Lookup 39 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_Possession */
  Possession: string | null;
  /** Enums.Multi.CurrentOrPossibleUse · multi-enum (comma-joined member names) · Lookup 66 members (RLS-listed 1) · filterable · populated 1 · not an RLS field · members: CotalityLookup_Property_CurrentUse */
  PossibleUse: string | null;
  /** Edm.String(50) · Lookup 20098 members (RLS-listed 65) · filterable · populated 591,064 · RLS field · string with Lookup (see lookups.live.json) */
  PostalCity: string | null;
  /** Edm.String(10) · filterable · populated 591,607 · RLS field */
  PostalCode: string | null;
  /** Edm.String(4) · filterable · populated 545,701 · RLS field */
  PostalCodePlus4: string | null;
  /** Enums.Multi.PowerProductionType · multi-enum (comma-joined member names) · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_PowerProductionType */
  PowerProductionType: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  PowerProductionYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 219,895 · RLS field */
  PreviousListPrice: number | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  PreviousStandardStatus: CotalityEnum_StandardStatus | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 361,678 · RLS field */
  PriceChangeTimestamp: string | null;
  /** Edm.String(4000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  PrivateOfficeRemarks: string | null;
  /** Edm.String(4000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  PrivateRemarks: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  ProfessionalManagementExpense: number | null;
  /** Edm.Boolean · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  PropertyAttachedYN: boolean | null;
  /** Enums.Multi.PropertyCondition · multi-enum (comma-joined member names) · Lookup 27 members (RLS-listed 4) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · members: CotalityEnum_PropertyCondition */
  PropertyCondition: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 10) · filterable · populated 591,591 · RLS field */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 6) · filterable · populated 553,713 · RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 3) · filterable · populated 591,607 · RLS field */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.String(12000) · filterable · populated 579,433 · not an RLS field */
  PublicRemarks: string | null;
  /** Edm.String(20) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  PublicSurveyRange: string | null;
  /** Edm.String(20) · filterable · populated 0 · not an RLS field */
  PublicSurveySection: string | null;
  /** Edm.String(20) · filterable · populated 0 · not an RLS field */
  PublicSurveyTownship: string | null;
  /** Edm.Date(10) · filterable · populated 179,612 · RLS field */
  PurchaseContractDate: string | null;
  /** Edm.String(50) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  RVParkingDimensions: string | null;
  /** Edm.Decimal(14,2) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  RangeArea: number | null;
  /** Edm.Int32 · filterable · populated 591,607 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  RentControlYN: boolean | null;
  /** Enums.Multi.RentIncludes · multi-enum (comma-joined member names) · Lookup 33 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_RentIncludes */
  RentIncludes: string | null;
  /** Enums.Multi.RoadFrontageType · multi-enum (comma-joined member names) · Lookup 29 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_RoadFrontageType */
  RoadFrontageType: string | null;
  /** Enums.Multi.RoadResponsibility · multi-enum (comma-joined member names) · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_RoadResponsibility */
  RoadResponsibility: string | null;
  /** Enums.Multi.RoadSurfaceType · multi-enum (comma-joined member names) · Lookup 16 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_RoadSurfaceType */
  RoadSurfaceType: string | null;
  /** Enums.Multi.Roof · multi-enum (comma-joined member names) · Lookup 51 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityLookup_Property_Roof */
  Roof: string | null;
  /** Enums.Multi.RoomType · multi-enum (comma-joined member names) · Lookup 122 members (RLS-listed 7) · filterable · populated 8,296 · RLS field · members: CotalityLookup_Property_RoomType */
  RoomType: string | null;
  /** Edm.Int32 · filterable · populated 587,737 · RLS field */
  RoomsTotal: number | null;
  /** Enums.SaleOrLeaseIndicator · Lookup 6 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  SaleOrLeaseIndicator: CotalityEnum_SaleOrLeaseIndicator | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  SeatingCapacity: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 161,522 · RLS field · non-RESO */
  SecurityDeposit: number | null;
  /** Enums.Multi.SecurityFeatures · multi-enum (comma-joined member names) · Lookup 84 members (RLS-listed 10) · filterable · populated 1,890 · not an RLS field · members: CotalityEnum_SecurityFeatures */
  SecurityFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  SellerConsiderConcessionYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 8 · not an RLS field · string with Lookup (see lookups.live.json) */
  SeniorCommunityYN: boolean | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  SerialU: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  SerialX: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  SerialXX: string | null;
  /** Enums.Multi.Sewer · multi-enum (comma-joined member names) · Lookup 55 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_Sewer */
  Sewer: string | null;
  /** Edm.Int32 · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  ShowingAdvanceNotice: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · string with Lookup (see lookups.live.json) */
  ShowingAttendedYN: boolean | null;
  /** Enums.Multi.ShowingConsiderations · multi-enum (comma-joined member names) · Lookup 14 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ShowingConsiderations */
  ShowingConsiderations: string | null;
  /** Edm.String(40) · filterable · populated 1,130 · not an RLS field */
  ShowingContactName: string | null;
  /** Edm.String(16) · filterable · populated 1,102 · not an RLS field */
  ShowingContactPhone: string | null;
  /** Edm.String(10) · filterable · populated 0 · not an RLS field */
  ShowingContactPhoneExt: string | null;
  /** Enums.Multi.ShowingContactType · multi-enum (comma-joined member names) · Lookup 15 members (RLS-listed 1) · filterable · populated 15 · not an RLS field · members: CotalityEnum_ShowingContactType */
  ShowingContactType: string | null;
  /** Enums.Multi.ShowingDays · multi-enum (comma-joined member names) · Lookup 7 members (RLS-listed 7) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_ShowingDays */
  ShowingDays: string | null;
  /** Edm.DateTimeOffset(27) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ShowingEndTime: string | null;
  /** Edm.String(4000) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ShowingInstructions: string | null;
  /** Enums.Multi.ShowingRequirements · multi-enum (comma-joined member names) · Lookup 40 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityLookup_Property_ShowingRequirements */
  ShowingRequirements: string | null;
  /** Enums.ShowingServiceName · Lookup 11 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  ShowingServiceName: CotalityEnum_ShowingServiceName | null;
  /** Edm.DateTimeOffset(27) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  ShowingStartTime: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  SignOnPropertyYN: boolean | null;
  /** Enums.Multi.Skirt · multi-enum (comma-joined member names) · Lookup 25 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_Skirt */
  Skirt: string | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field · non-RESO */
  SourceMlsUrl: string | null;
  /** Edm.String(25) · filterable · populated 591,607 · RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  SourceSystemKey: string | null;
  /** Edm.String(255) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field */
  SourceSystemName: string | null;
  /** Enums.Multi.SpaFeatures · multi-enum (comma-joined member names) · Lookup 24 members (RLS-listed 1) · filterable · populated 5,639 · RLS field · members: CotalityEnum_SpaFeatures */
  SpaFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 2,208 · not an RLS field · string with Lookup (see lookups.live.json) */
  SpaYN: boolean | null;
  /** Enums.Multi.SpecialLicenses · multi-enum (comma-joined member names) · Lookup 19 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_SpecialLicenses */
  SpecialLicenses: string | null;
  /** Enums.Multi.SpecialListingConditions · multi-enum (comma-joined member names) · Lookup 34 members (RLS-listed 8) · filterable · populated 114,397 · RLS field · members: CotalityEnum_SpecialListingConditions */
  SpecialListingConditions: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 9) · filterable · populated 591,607 · RLS field */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Edm.Date(10) · filterable · populated 0 · not an RLS field */
  StartShowingDate: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 7) · filterable · populated 591,604 · RLS field */
  StateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Edm.String(150) · filterable · populated 0 · not an RLS field */
  StateRegion: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 591,419 · RLS field */
  StatusChangeTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 1,612 · not an RLS field */
  Stories: number | null;
  /** Edm.Int32 · filterable · populated 533,803 · RLS field */
  StoriesTotal: number | null;
  /** Edm.String(50) · filterable · populated 394,632 · RLS field */
  StreetAdditionalInfo: string | null;
  /** Enums.StreetDirection · Lookup 10 members (RLS-listed 4) · filterable · populated 266,957 · RLS field */
  StreetDirPrefix: CotalityEnum_StreetDirection | null;
  /** Enums.StreetDirection · Lookup 10 members (RLS-listed 5) · filterable · populated 13,415 · RLS field */
  StreetDirSuffix: CotalityEnum_StreetDirection | null;
  /** Edm.String(50) · filterable · populated 591,607 · RLS field */
  StreetName: string | null;
  /** Edm.String(25) · filterable · populated 591,607 · RLS field */
  StreetNumber: string | null;
  /** Edm.Int32 · filterable · populated 561,696 · RLS field */
  StreetNumberNumeric: number | null;
  /** Enums.StreetSuffix · Lookup 298 members (RLS-listed 31) · filterable · populated 580,305 · RLS field */
  StreetSuffix: CotalityEnum_StreetSuffix | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  StreetSuffixModifier: string | null;
  /** Enums.Multi.StructureType · multi-enum (comma-joined member names) · Lookup 23 members (RLS-listed 11) · filterable · populated 97,624 · RLS field · members: CotalityEnum_StructureType */
  StructureType: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SubAgencyCompensation: string | null;
  /** Enums.CompensationType · Lookup 5 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SubAgencyCompensationType: CotalityEnum_CompensationType | null;
  /** Edm.String(150) · filterable · populated 591,607 · RLS field */
  SubdivisionName: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  SuppliesExpense: number | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
  /** Edm.String(4000) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  SyndicationRemarks: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 97,625 · RLS field */
  TaxAnnualAmount: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  TaxAssessedValue: number | null;
  /** Edm.String(25) · filterable · populated 591,607 · RLS field */
  TaxBlock: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  TaxBookNumber: string | null;
  /** Edm.String(6000) · filterable · populated 0 · not an RLS field */
  TaxLegalDescription: string | null;
  /** Edm.String(25) · filterable · populated 266,897 · RLS field */
  TaxLot: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  TaxMapNumber: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  TaxOtherAnnualAssessmentAmount: number | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  TaxParcelLetter: string | null;
  /** Enums.Multi.TaxStatusCurrent · multi-enum (comma-joined member names) · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_TaxStatusCurrent */
  TaxStatusCurrent: string | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  TaxTract: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  TaxYear: number | null;
  /** Enums.Multi.TenantPays · multi-enum (comma-joined member names) · Lookup 61 members (RLS-listed 16) · filterable · populated 261 · not an RLS field · members: CotalityEnum_TenantPays */
  TenantPays: string | null;
  /** Edm.String(1024) · filterable · populated 276 · not an RLS field · non-RESO */
  TenantPaysDescription: string | null;
  /** Edm.String(768) · Lookup 26 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  Topography: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  TotalActualRent: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  TotalFloorPlansCount: number | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  Township: string | null;
  /** Edm.String(25) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  TransactionBrokerCompensation: string | null;
  /** Enums.CompensationType · Lookup 5 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  TransactionBrokerCompensationType: CotalityEnum_CompensationType | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  TrashExpense: number | null;
  /** Edm.String(25) · filterable · populated 582,428 · RLS field */
  UnitNumber: string | null;
  /** Enums.Multi.UnitTypeType · multi-enum (comma-joined member names) · Lookup 22 members (RLS-listed 2) · filterable · populated 148 · not an RLS field · members: CotalityEnum_UnitTypeType */
  UnitTypeType: string | null;
  /** Enums.UnitsFurnished · Lookup 7 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  UnitsFurnished: CotalityEnum_UnitsFurnished | null;
  /** Edm.String(255) · filterable · populated 545,161 · not an RLS field · non-RESO */
  UniversalParcelId: string | null;
  /** Edm.String(128) · filterable · populated 380,699 · not an RLS field */
  UniversalPropertyId: string | null;
  /** Edm.String(128) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  UniversalPropertySubId: string | null;
  /** Edm.String(255) · filterable · populated 591,607 · RLS field */
  UnparsedAddress: string | null;
  /** Enums.Multi.Utilities · multi-enum (comma-joined member names) · Lookup 41 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_Utilities */
  Utilities: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  UtilitiesExpense: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  VacancyAllowance: number | null;
  /** Edm.Decimal(5,2) · filterable · populated 0 · not an RLS field */
  VacancyAllowanceRate: number | null;
  /** Enums.Multi.Vegetation · multi-enum (comma-joined member names) · Lookup 19 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · members: CotalityEnum_Vegetation */
  Vegetation: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 329,062 · RLS field */
  VideosChangeTimestamp: string | null;
  /** Edm.Int32 · filterable · populated 485,075 · not an RLS field */
  VideosCount: number | null;
  /** Enums.Multi.View · multi-enum (comma-joined member names) · Lookup 85 members (RLS-listed 29) · filterable · populated 138,934 · RLS field · members: CotalityEnum_View */
  View: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 1) · filterable · populated 163,138 · RLS field · string with Lookup (see lookups.live.json) */
  ViewYN: boolean | null;
  /** Edm.String(8000) · filterable · populated 13,879 · RLS field */
  VirtualTourURLBranded: string | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field · non-RESO */
  VirtualTourURLBranded2: string | null;
  /** Edm.String(8000) · filterable · populated 0 · not an RLS field · non-RESO */
  VirtualTourURLBranded3: string | null;
  /** Edm.String(8000) · filterable · populated 26,372 · RLS field */
  VirtualTourURLUnbranded: string | null;
  /** Edm.String(8000) · filterable · populated 2,382 · not an RLS field · non-RESO */
  VirtualTourURLUnbranded2: string | null;
  /** Edm.String(8000) · filterable · populated 354 · not an RLS field · non-RESO */
  VirtualTourURLUnbranded3: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  WalkScore: number | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  WaterBodyName: string | null;
  /** Enums.Multi.WaterHeater · multi-enum (comma-joined member names) · Lookup 25 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_WaterHeater */
  WaterHeater: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 10,392 · not an RLS field */
  WaterSewerExpense: number | null;
  /** Enums.Multi.WaterSource · multi-enum (comma-joined member names) · Lookup 39 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityEnum_WaterSource */
  WaterSource: string | null;
  /** Enums.Multi.WaterfrontFeatures · multi-enum (comma-joined member names) · Lookup 77 members (RLS-listed 1) · filterable · populated 5 · not an RLS field · members: CotalityEnum_WaterfrontFeatures */
  WaterfrontFeatures: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 98 · not an RLS field · string with Lookup (see lookups.live.json) */
  WaterfrontYN: boolean | null;
  /** Enums.Multi.WindowFeatures · multi-enum (comma-joined member names) · Lookup 55 members (RLS-listed 17) · filterable · populated 15,977 · RLS field · members: CotalityEnum_WindowFeatures */
  WindowFeatures: string | null;
  /** Edm.Date(10) · filterable · populated 22 · RLS field */
  WithdrawnDate: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  WoodedArea: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 8 · not an RLS field */
  WorkmansCompensationExpense: number | null;
  /** Enums.GeocodeSource · Lookup 10 members (RLS-listed 4) · NOT filterable (provider-suppressed) · population unmeasurable · RLS field · non-RESO */
  X_GeocodeSource: CotalityEnum_GeocodeSource | null;
  /** Edm.Int32 · filterable · populated 485,638 · RLS field */
  YearBuilt: number | null;
  /** Edm.String(1024) · filterable · populated 0 · not an RLS field */
  YearBuiltDetails: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  YearBuiltEffective: number | null;
  /** Enums.YearBuiltSource · Lookup 8 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  YearBuiltSource: CotalityEnum_YearBuiltSource | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  YearEstablished: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  YearsCurrentOwner: number | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field */
  Zoning: string | null;
  /** Edm.String(255) · filterable · populated 27,455 · RLS field */
  ZoningDescription: string | null;
}

/** Property navigation properties (present on a row only under $expand). */
export interface CotalityPropertyNavigations {
  /** → Building[] · $expand SUPPORTED */
  Building?: CotalityBuilding[];
  /** → Member[] · $expand SUPPORTED */
  BuyerAgent?: CotalityMember[];
  /** → Office[] · $expand SUPPORTED */
  BuyerOffice?: CotalityOffice[];
  /** → Member[] · $expand SUPPORTED */
  CoBuyerAgent?: CotalityMember[];
  /** → Office[] · $expand SUPPORTED */
  CoBuyerOffice?: CotalityOffice[];
  /** → Member[] · $expand SUPPORTED */
  CoListAgent?: CotalityMember[];
  /** → Office[] · $expand SUPPORTED */
  CoListOffice?: CotalityOffice[];
  /** → CustomProperty[] · $expand SUPPORTED */
  CustomProperty?: CotalityCustomProperty[];
  /** → Member[] · $expand SUPPORTED */
  ListAgent?: CotalityMember[];
  /** → Office[] · $expand SUPPORTED */
  ListOffice?: CotalityOffice[];
  /** → Media[] · $expand SUPPORTED */
  Media?: CotalityMedia[];
  /** → OpenHouse[] · $expand SUPPORTED */
  OpenHouse?: CotalityOpenHouse[];
  /** → PropertyRooms[] · $expand SUPPORTED */
  Rooms?: CotalityPropertyRooms[];
  /** → PropertyUnitTypes[] · $expand SUPPORTED */
  UnitTypes?: CotalityPropertyUnitTypes[];
}

/** PropertyGreenVerification · Cotality.DataStandard.RESO.DD.PropertyGreenVerification · 39 fields · REJECTED on this subscription (HTTP 404: "Page not found") */
export interface CotalityPropertyGreenVerification {
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  GreenBuildingVerificationKey: string;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  GreenBuildingVerificationKeyNumeric: number | null;
  /** Enums.GreenBuildingVerificationType · Lookup 29 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  GreenBuildingVerificationType: CotalityEnum_GreenBuildingVerificationType | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationBody: string | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationMetric: number | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationRating: string | null;
  /** Enums.GreenVerificationSource · Lookup 10 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationSource: CotalityEnum_GreenVerificationSource | null;
  /** Enums.GreenVerificationStatus · Lookup 4 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationStatus: CotalityEnum_GreenVerificationStatus | null;
  /** Edm.String(8000) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationURL: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationVersion: string | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  GreenVerificationYear: number | null;
  /** Edm.Boolean · filterability unmeasured · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  InputEntryOrder: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterability unmeasured · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field · non-RESO */
  ListAgentKey: string | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field · non-RESO */
  ListOfficeMlsId: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  ListingId: string | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field · non-RESO */
  ListingKey: string | null;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  ListingPermission: string | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Date(10) · filterability unmeasured · not an RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Edm.String(60) · filterability unmeasured · not an RLS field · non-RESO */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemGreenBuildingVerificationKey: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemListingKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field · non-RESO */
  SourceSystemID: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterability unmeasured · not an RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
}

/** PropertyGreenVerification navigation properties (present on a row only under $expand). */
export interface CotalityPropertyGreenVerificationNavigations {
}

/** PropertyRooms · Cotality.DataStandard.RESO.DD.PropertyRooms · 39 fields · accessible */
export interface CotalityPropertyRooms {
  /** Edm.Boolean · filterable · populated 86 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Int32 · filterable · populated 86 · RLS field · non-RESO */
  InputEntryOrder: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 86 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterable · populated 86 · not an RLS field · non-RESO */
  ListAgentKey: string | null;
  /** Edm.String(20) · filterable · populated 86 · not an RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 86 · not an RLS field · non-RESO */
  ListOfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 86 · RLS field */
  ListingId: string | null;
  /** Edm.String(20) · filterable · populated 86 · RLS field */
  ListingKey: string | null;
  /** Edm.Int64 · filterable · populated 86 · RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterable · populated 86 · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  ListingPermission: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 86 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Date(10) · filterable · populated 81 · not an RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Edm.String(255) · filterable · populated 86 · RLS field · non-RESO */
  OriginatingSystemListingKey: string | null;
  /** Edm.String(255) · filterable · populated 86 · not an RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterable · populated 86 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterable · populated 86 · not an RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterable · populated 21 · not an RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterable · populated 86 · not an RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 44 · not an RLS field */
  RoomArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 1) · filterable · populated 44 · not an RLS field */
  RoomAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 1) · filterable · populated 44 · not an RLS field */
  RoomAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.String(1024) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  RoomDescription: string | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field */
  RoomDimensions: string | null;
  /** Enums.Multi.InteriorOrRoomFeatures · multi-enum (comma-joined member names) · Lookup 303 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · members: CotalityLookup_PropertyRooms_RoomFeatures */
  RoomFeatures: string | null;
  /** Enums.Multi.Flooring · multi-enum (comma-joined member names) · Lookup 62 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_Flooring */
  RoomFlooring: string | null;
  /** Edm.String(20) · filterable · populated 86 · RLS field */
  RoomKey: string;
  /** Edm.Int64 · filterable · populated 86 · RLS field · non-RESO */
  RoomKeyNumeric: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  RoomLength: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  RoomLengthWidthSource: CotalityEnum_AreaSource | null;
  /** Enums.LinearUnits · Lookup 4 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  RoomLengthWidthUnits: CotalityEnum_LinearUnits | null;
  /** Enums.RoomLevel · Lookup 15 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  RoomLevel: CotalityEnum_RoomLevel | null;
  /** Enums.RoomType · Lookup 122 members (RLS-listed 6) · filterable · populated 74 · not an RLS field */
  RoomType: CotalityLookup_Property_RoomType | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  RoomWidth: number | null;
  /** Edm.String(25) · filterable · populated 86 · RLS field · non-RESO */
  SourceSystemID: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterable · populated 86 · not an RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
}

/** PropertyRooms navigation properties (present on a row only under $expand). */
export interface CotalityPropertyRoomsNavigations {
  /** → Property[] · $expand SUPPORTED */
  Property?: CotalityProperty[];
}

/** PropertyUnitTypes · Cotality.DataStandard.RESO.DD.PropertyUnitTypes · 52 fields · accessible */
export interface CotalityPropertyUnitTypes {
  /** Edm.Boolean · filterable · populated 1 · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.Int32 · filterable · populated 1 · RLS field · non-RESO */
  InputEntryOrder: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 2) · filterable · populated 1 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  InternetEntireListingDisplayYN: boolean | null;
  /** Enums.AOR · Lookup 1127 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  ListAOR: CotalityLookup_CustomProperty_ListAOR | null;
  /** Edm.String(20) · filterable · populated 1 · not an RLS field · non-RESO */
  ListAgentKey: string | null;
  /** Edm.String(20) · filterable · populated 1 · not an RLS field · non-RESO */
  ListOfficeKey: string | null;
  /** Edm.String(25) · filterable · populated 1 · not an RLS field · non-RESO */
  ListOfficeMlsId: string | null;
  /** Edm.String(255) · filterable · populated 1 · RLS field */
  ListingId: string | null;
  /** Edm.String(20) · filterable · populated 1 · RLS field */
  ListingKey: string | null;
  /** Edm.Int64 · filterable · populated 1 · RLS field · non-RESO */
  ListingKeyNumeric: number | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterable · populated 1 · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  ListingPermission: string | null;
  /** Edm.DateTimeOffset(27) · filterable · populated 1 · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.Date(10) · filterable · populated 1 · not an RLS field · non-RESO */
  OffMarketDate: string | null;
  /** Edm.String(255) · filterable · populated 1 · RLS field · non-RESO */
  OriginatingSystemListingKey: string | null;
  /** Edm.String(255) · filterable · populated 1 · not an RLS field · non-RESO */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 880 members (RLS-listed 0) · filterable · populated 1 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Enums.PropertySubType · Lookup 76 members (RLS-listed 0) · filterable · populated 1 · not an RLS field · non-RESO */
  PropertySubType: CotalityLookup_CustomProperty_PropertySubType | null;
  /** Enums.Multi.PropertySubTypeAdditional · multi-enum (comma-joined member names) · Lookup 76 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_CustomProperty_PropertySubType */
  PropertySubTypeAdditional: string | null;
  /** Enums.PropertyType · Lookup 13 members (RLS-listed 0) · filterable · populated 1 · not an RLS field · non-RESO */
  PropertyType: CotalityEnum_PropertyType | null;
  /** Edm.Int32 · filterable · populated 1 · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.String(25) · filterable · populated 1 · RLS field · non-RESO */
  SourceSystemID: string | null;
  /** Enums.StandardStatus · Lookup 11 members (RLS-listed 11) · filterable · populated 1 · not an RLS field · non-RESO */
  StandardStatus: CotalityEnum_StandardStatus | null;
  /** Enums.Multi.SyndicateTo · multi-enum (comma-joined member names) · Lookup 28 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityLookup_HistoryTransactional_SyndicateTo */
  SyndicateTo: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  UnitTypeActualRent: number | null;
  /** Edm.String(50) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeActualRentRange: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeArea: number | null;
  /** Enums.AreaSource · Lookup 18 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeAreaSource: CotalityEnum_AreaSource | null;
  /** Enums.AreaUnits · Lookup 3 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeAreaUnits: CotalityEnum_AreaUnits | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  UnitTypeBathsTotal: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  UnitTypeBedsTotal: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeDeposit: number | null;
  /** Edm.String(1024) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field */
  UnitTypeDescription: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  UnitTypeFireplaceYN: boolean | null;
  /** Enums.Furnished · Lookup 5 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  UnitTypeFurnished: CotalityEnum_Furnished | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · string with Lookup (see lookups.live.json) */
  UnitTypeGarageAttachedYN: boolean | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  UnitTypeGarageSpaces: number | null;
  /** Edm.String(20) · filterable · populated 1 · RLS field */
  UnitTypeKey: string;
  /** Edm.Int64 · filterable · populated 1 · RLS field · non-RESO */
  UnitTypeKeyNumeric: number | null;
  /** Edm.DateTimeOffset(27) · NOT filterable (provider-suppressed) · population unmeasurable · not an RLS field · non-RESO */
  UnitTypeLeaseExpires: string | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  UnitTypeLeasedYN: boolean | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  UnitTypeMonthToMonthYN: boolean | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeNumFullBaths: number | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeNumHalfBaths: number | null;
  /** Enums.Multi.UnitTypeOccupantType · multi-enum (comma-joined member names) · Lookup 7 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · members: CotalityEnum_OccupantType */
  UnitTypeOccupantType: string | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypePetDeposit: number | null;
  /** Edm.Boolean · Lookup 2 members (RLS-listed 0) · filterable · populated 0 · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  UnitTypePetDepositPerPetYN: boolean | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  UnitTypeProForma: number | null;
  /** Edm.Decimal(14,2) · filterable · populated 0 · not an RLS field */
  UnitTypeTotalRent: number | null;
  /** Enums.UnitTypeType · Lookup 22 members (RLS-listed 0) · filterable · populated 0 · not an RLS field */
  UnitTypeType: CotalityEnum_UnitTypeType | null;
  /** Edm.String(25) · filterable · populated 0 · not an RLS field · non-RESO */
  UnitTypeUnitNum: string | null;
  /** Edm.Int32 · filterable · populated 0 · not an RLS field */
  UnitTypeUnitsTotal: number | null;
}

/** PropertyUnitTypes navigation properties (present on a row only under $expand). */
export interface CotalityPropertyUnitTypesNavigations {
  /** → Property[] · $expand SUPPORTED */
  Property?: CotalityProperty[];
}

/** TeamMembers · Cotality.DataStandard.RESO.DD.TeamMembers · 29 fields · REJECTED on this subscription (HTTP 400: {"error":{"code":"BadRequest[400]. TraceId: 8163a982-8722-44ce-b3ee-cfe56e1830d8","message":"No OriginatingSystemNames available for querying given request! This is an indication that you do not have ) */
export interface CotalityTeamMembers {
  /** Edm.Boolean · filterability unmeasured · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field */
  MemberKey: string | null;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  MemberKeyNumeric: number | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  MemberLoginId: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  MemberMlsId: string | null;
  /** Enums.MemberStatus · Lookup 3 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO */
  MemberStatus: CotalityLookup_TeamMembers_MemberStatus | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field · non-RESO */
  OfficeKey: string | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · not an RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemMemberKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 34 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemTeamKey: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  SourceSystemKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  SourceSystemName: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  StandardName: string | null;
  /** Enums.TeamImpersonationLevel · Lookup 2 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  TeamImpersonationLevel: CotalityEnum_TeamImpersonationLevel | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field */
  TeamKey: string | null;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  TeamKeyNumeric: number | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field */
  TeamMemberKey: string;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  TeamMemberKeyNumeric: number | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  TeamMemberNationalAssociationId: string | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field */
  TeamMemberStateLicense: string | null;
  /** Enums.TeamMemberType · Lookup 11 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  TeamMemberType: CotalityEnum_TeamMemberType | null;
}

/** TeamMembers navigation properties (present on a row only under $expand). */
export interface CotalityTeamMembersNavigations {
}

/** Teams · Cotality.DataStandard.RESO.DD.Teams · 48 fields · REJECTED on this subscription (HTTP 400: {"error":{"code":"BadRequest[400]. TraceId: 5f9d1669-28eb-4c20-ae9c-2aaf9aff2e4a","message":"No OriginatingSystemNames available for querying given request! This is an indication that you do not have ) */
export interface CotalityTeams {
  /** Edm.Boolean · filterability unmeasured · not an RLS field · non-RESO */
  HumanModifiedYN: boolean | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · not an RLS field · non-RESO */
  ModificationTimestamp: string | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field · non-RESO */
  OfficeKey: string | null;
  /** Edm.DateTimeOffset(27) · filterability unmeasured · not an RLS field */
  OriginalEntryTimestamp: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  OriginatingSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  OriginatingSystemKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  OriginatingSystemName: string | null;
  /** Edm.String(255) · Lookup 34 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · string with Lookup (see lookups.live.json) */
  OriginatingSystemSubName: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  OriginatingSystemTeamLeadKey: string | null;
  /** Enums.Multi.ListingPermission · multi-enum (comma-joined member names) · Lookup 18 members (RLS-listed 0) · filterability unmeasured · not an RLS field · non-RESO · members: CotalityEnum_ListingPermission */
  Permission: string | null;
  /** Edm.Int32 · filterability unmeasured · not an RLS field · non-RESO */
  RecordSignature: number | null;
  /** Enums.SocialMediaType · Lookup 17 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  SocialMediaType: CotalityEnum_SocialMediaType | null;
  /** Edm.String(8000) · filterability unmeasured · not an RLS field · non-RESO */
  SocialMediaTypeUrl: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  SourceSystemID: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field · non-RESO */
  SourceSystemKey: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  SourceSystemName: string | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field */
  TeamAddress1: string | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field */
  TeamAddress2: string | null;
  /** Edm.String(9) · filterability unmeasured · not an RLS field */
  TeamCarrierRoute: string | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field */
  TeamCity: string | null;
  /** Enums.Country · Lookup 246 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  TeamCountry: CotalityEnum_Country | null;
  /** Edm.String(50) · Lookup 4423 members (RLS-listed 0) · filterability unmeasured · not an RLS field · string with Lookup (see lookups.live.json) */
  TeamCountyOrParish: string | null;
  /** Edm.String(1024) · filterability unmeasured · not an RLS field */
  TeamDescription: string | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamDirectPhone: string | null;
  /** Edm.String(80) · filterability unmeasured · not an RLS field */
  TeamEmail: string | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamFax: string | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field */
  TeamKey: string;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  TeamKeyNumeric: number | null;
  /** Edm.String(20) · filterability unmeasured · not an RLS field */
  TeamLeadKey: string | null;
  /** Edm.Int64 · filterability unmeasured · not an RLS field · non-RESO */
  TeamLeadKeyNumeric: number | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  TeamLeadLoginId: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  TeamLeadMlsId: string | null;
  /** Edm.String(25) · filterability unmeasured · not an RLS field */
  TeamLeadNationalAssociationId: string | null;
  /** Edm.String(50) · filterability unmeasured · not an RLS field */
  TeamLeadStateLicense: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  TeamLeadStateLicenseState: CotalityEnum_StateOrProvince | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamMobilePhone: string | null;
  /** Edm.String(255) · filterability unmeasured · not an RLS field */
  TeamName: string | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamOfficePhone: string | null;
  /** Edm.String(10) · filterability unmeasured · not an RLS field */
  TeamOfficePhoneExt: string | null;
  /** Edm.String(10) · filterability unmeasured · not an RLS field */
  TeamPostalCode: string | null;
  /** Edm.String(4) · filterability unmeasured · not an RLS field */
  TeamPostalCodePlus4: string | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamPreferredPhone: string | null;
  /** Edm.String(10) · filterability unmeasured · not an RLS field */
  TeamPreferredPhoneExt: string | null;
  /** Enums.StateOrProvince · Lookup 100 members (RLS-listed 0) · filterability unmeasured · not an RLS field */
  TeamStateOrProvince: CotalityEnum_StateOrProvince | null;
  /** Enums.TeamStatus · Lookup 2 members (RLS-listed 2) · filterability unmeasured · not an RLS field */
  TeamStatus: CotalityEnum_OfficeStatus | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamTollFreePhone: string | null;
  /** Edm.String(16) · filterability unmeasured · not an RLS field */
  TeamVoiceMail: string | null;
  /** Edm.String(10) · filterability unmeasured · not an RLS field */
  TeamVoiceMailExt: string | null;
}

/** Teams navigation properties (present on a row only under $expand). */
export interface CotalityTeamsNavigations {
}

export interface CotalityResourceMap {
  Building: CotalityBuilding;
  CustomProperty: CotalityCustomProperty;
  Enumeration: CotalityEnumeration;
  Field: CotalityField;
  HistoryTransactional: CotalityHistoryTransactional;
  Lookup: CotalityLookup;
  Media: CotalityMedia;
  Member: CotalityMember;
  Model: CotalityModel;
  Office: CotalityOffice;
  OpenHouse: CotalityOpenHouse;
  Property: CotalityProperty;
  PropertyGreenVerification: CotalityPropertyGreenVerification;
  PropertyRooms: CotalityPropertyRooms;
  PropertyUnitTypes: CotalityPropertyUnitTypes;
  TeamMembers: CotalityTeamMembers;
  Teams: CotalityTeams;
}

export interface CotalityNavigationMap {
  Building: CotalityBuildingNavigations;
  CustomProperty: CotalityCustomPropertyNavigations;
  Enumeration: CotalityEnumerationNavigations;
  Field: CotalityFieldNavigations;
  HistoryTransactional: CotalityHistoryTransactionalNavigations;
  Lookup: CotalityLookupNavigations;
  Media: CotalityMediaNavigations;
  Member: CotalityMemberNavigations;
  Model: CotalityModelNavigations;
  Office: CotalityOfficeNavigations;
  OpenHouse: CotalityOpenHouseNavigations;
  Property: CotalityPropertyNavigations;
  PropertyGreenVerification: CotalityPropertyGreenVerificationNavigations;
  PropertyRooms: CotalityPropertyRoomsNavigations;
  PropertyUnitTypes: CotalityPropertyUnitTypesNavigations;
  TeamMembers: CotalityTeamMembersNavigations;
  Teams: CotalityTeamsNavigations;
}

export const COTALITY_RESOURCES = ["Building", "CustomProperty", "Enumeration", "Field", "HistoryTransactional", "Lookup", "Media", "Member", "Model", "Office", "OpenHouse", "Property", "PropertyGreenVerification", "PropertyRooms", "PropertyUnitTypes", "TeamMembers", "Teams"] as const;
export type CotalityResource = (typeof COTALITY_RESOURCES)[number];

/** Entitlement of THIS subscription per resource, measured live (a resource is accessible iff at least one field probe succeeded). */
export const COTALITY_ACCESS = {
  Building: { state: "rejected", http: 403 },
  CustomProperty: { state: "accessible", http: 200 },
  Enumeration: { state: "rejected", http: 404 },
  Field: { state: "accessible", http: 200 },
  HistoryTransactional: { state: "rejected", http: 400 },
  Lookup: { state: "accessible", http: 200 },
  Media: { state: "accessible", http: 200 },
  Member: { state: "accessible", http: 200 },
  Model: { state: "accessible", http: 200 },
  Office: { state: "accessible", http: 200 },
  OpenHouse: { state: "accessible", http: 200 },
  Property: { state: "accessible", http: 200 },
  PropertyGreenVerification: { state: "rejected", http: 404 },
  PropertyRooms: { state: "accessible", http: 200 },
  PropertyUnitTypes: { state: "accessible", http: 200 },
  TeamMembers: { state: "rejected", http: 400 },
  Teams: { state: "rejected", http: 400 },
} as const satisfies Record<CotalityResource, { state: CotalityAccessState; http: number | null }>;

/** Declared navigation properties with the live $expand verdict (SUPPORTED / PROVIDER_REJECTED / null = unmeasured). */
export const COTALITY_NAVIGATIONS = {
  Building: {
    Media: { target: "Media", collection: true, expand: "PROVIDER_REJECTED", http: 403 },
    Property: { target: "Property", collection: true, expand: "PROVIDER_REJECTED", http: 403 },
  },
  CustomProperty: {
    Property: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
  },
  Enumeration: {},
  Field: {},
  HistoryTransactional: {},
  Lookup: {},
  Media: {
    Property: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
  },
  Member: {
    BuyerAgentProperties: { target: "Property", collection: true, expand: "PROVIDER_REJECTED", http: 400 },
    CoBuyerAgentProperties: { target: "Property", collection: true, expand: "PROVIDER_REJECTED", http: 400 },
    CoListAgentProperties: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
    ListAgentProperties: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
    Media: { target: "Media", collection: true, expand: "SUPPORTED", http: 200 },
  },
  Model: {},
  Office: {
    BuyerOfficeProperties: { target: "Property", collection: true, expand: "PROVIDER_REJECTED", http: 400 },
    CoBuyerOfficeProperties: { target: "Property", collection: true, expand: "PROVIDER_REJECTED", http: 400 },
    CoListOfficeProperties: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
    ListOfficeProperties: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
    Media: { target: "Media", collection: true, expand: "SUPPORTED", http: 200 },
  },
  OpenHouse: {
    Property: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
  },
  Property: {
    Building: { target: "Building", collection: true, expand: "SUPPORTED", http: 200 },
    BuyerAgent: { target: "Member", collection: true, expand: "SUPPORTED", http: 200 },
    BuyerOffice: { target: "Office", collection: true, expand: "SUPPORTED", http: 200 },
    CoBuyerAgent: { target: "Member", collection: true, expand: "SUPPORTED", http: 200 },
    CoBuyerOffice: { target: "Office", collection: true, expand: "SUPPORTED", http: 200 },
    CoListAgent: { target: "Member", collection: true, expand: "SUPPORTED", http: 200 },
    CoListOffice: { target: "Office", collection: true, expand: "SUPPORTED", http: 200 },
    CustomProperty: { target: "CustomProperty", collection: true, expand: "SUPPORTED", http: 200 },
    ListAgent: { target: "Member", collection: true, expand: "SUPPORTED", http: 200 },
    ListOffice: { target: "Office", collection: true, expand: "SUPPORTED", http: 200 },
    Media: { target: "Media", collection: true, expand: "SUPPORTED", http: 200 },
    OpenHouse: { target: "OpenHouse", collection: true, expand: "SUPPORTED", http: 200 },
    Rooms: { target: "PropertyRooms", collection: true, expand: "SUPPORTED", http: 200 },
    UnitTypes: { target: "PropertyUnitTypes", collection: true, expand: "SUPPORTED", http: 200 },
  },
  PropertyGreenVerification: {},
  PropertyRooms: {
    Property: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
  },
  PropertyUnitTypes: {
    Property: { target: "Property", collection: true, expand: "SUPPORTED", http: 200 },
  },
  TeamMembers: {},
  Teams: {},
} as const;

/** Every declared field of every resource with its measured facts. Keys are exhaustive: `satisfies` fails the build if a field is missing. */
export const COTALITY_FIELD_FACTS = {
  Building: {
    BuildingKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: true },
  } satisfies Record<keyof CotalityBuilding, CotalityFieldFact>,
  CustomProperty: {
    AboveGradeBedrooms: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeFinishedAreaRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeFinishedAreaRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeFinishedAreaRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeUnfinishedAreaRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeUnfinishedAreaRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    AboveGradeUnfinishedAreaRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    AdditionalFee: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 90, rlsField: false, reso: false },
    AdditionalFeeDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 317956, rlsField: false, reso: false },
    AdditionalFeeFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 34, rlsField: false, reso: false },
    AdditionalFeeYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 591609, rlsField: false, reso: false },
    AdditionalInfo1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 29, rlsField: true, reso: false },
    AdditionalInfo2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    AdditionalInfo3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    ApplicationFee: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    AssociationFeeTotal: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AssociationFeeTotalFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 0, rlsField: false, reso: false },
    Attic: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Attic", nullable: true, enum: "Attic", multi: true, lookup: 22, filterable: true, populated: 0, rlsField: false, reso: false },
    AvailabilityType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.AvailabilityType", nullable: true, enum: "AvailabilityType", multi: true, lookup: 12, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeBedrooms: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeFinishedAreaRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeFinishedAreaRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeFinishedAreaRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeUnfinishedAreaRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeUnfinishedAreaRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    BelowGradeUnfinishedAreaRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatDockAccommodates: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatDockHeight: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatDockSlipDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatDockSlipFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BoatDockSlipFeatures", nullable: true, enum: "BoatDockSlipFeatures", multi: true, lookup: 32, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatDockYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    BoatSlipYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    BonusAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BuildingAreaTotalRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BuildingAreaTotalRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    BuildingAreaTotalRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    BuildingSizeDimensions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 9394, rlsField: true, reso: false },
    CommunityDevelopmentDistrictYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    ComplexName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    ConsumerRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    CustomFields: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: false },
    DevelopmentName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    FractionalShare: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 192124, rlsField: true, reso: false },
    GarageArea: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    GarageAreaUnits: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    GarageDimensions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    GuestHouseAreaTotal: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    GuestHouseAreaTotalSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    GuestHouseAreaTotalUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    GuestHouseDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    GuestHouseYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    GulfAccessType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GulfAccessType", nullable: true, enum: "GulfAccessType", multi: true, lookup: 8, filterable: false, populated: null, rlsField: false, reso: false },
    GulfAccessYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 591649, rlsField: false, reso: true },
    LakeChainName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    LakeId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    LakeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    LakeSize: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    LandTenure: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LandTenure", nullable: true, enum: "LandTenure", multi: true, lookup: 4, filterable: false, populated: null, rlsField: false, reso: false },
    Lang2_Type: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    Lang3_Type: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LastMonthRentReqYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    LeaseAmountPerArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LeaseAmountPerAreaUnit: { type: "Cotality.DataStandard.RESO.DD.Enums.LeaseAmountPerAreaUnit", nullable: true, enum: "LeaseAmountPerAreaUnit", multi: false, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: false },
    LeaseTermsDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: true },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    ListingKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: false },
    LivingAreaRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LivingAreaRangeHigh: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LivingAreaRangeLow: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LivingAreaRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    LivingAreaRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    Location: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LotSizeAreaRangeHigh: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LotSizeAreaRangeLow: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LotSizeRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    LotSizeRangeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.LotSizeSource", nullable: true, enum: "LotSizeSource", multi: false, lookup: 15, filterable: true, populated: 0, rlsField: false, reso: false },
    LotSizeRangeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LotSizeUnits", nullable: true, enum: "LotSizeUnits", multi: false, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: false },
    Membership: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Membership", nullable: true, enum: "Membership", multi: true, lookup: 1, filterable: false, populated: null, rlsField: false, reso: false },
    MembershipDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MembershipFee: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    MembershipFeeFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 0, rlsField: false, reso: false },
    MembershipRequiredYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    MineralRights: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.MineralRights", nullable: true, enum: "MineralRights", multi: true, lookup: 20, filterable: false, populated: null, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: false },
    MonthlyRate: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    NumberOfBoatDocks: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    NumberOfBoatSlips: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OffSeasonRate: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OffersDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OffersReviewDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591649, rlsField: false, reso: true },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 591649, rlsField: false, reso: false },
    OtherExpenseDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: false, reso: false },
    PotentialShortSale: { type: "Cotality.DataStandard.RESO.DD.Enums.PotentialShortSale", nullable: true, enum: "PotentialShortSale", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    PricePerArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    PricePerAreaUnit: { type: "Cotality.DataStandard.RESO.DD.Enums.PricePerAreaUnit", nullable: true, enum: "PricePerAreaUnit", multi: false, lookup: 5, filterable: true, populated: 12, rlsField: false, reso: false },
    PrivateShowingInstructions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ProjectName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    PropertyAccess: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertyAccess", nullable: true, enum: "PropertyAccess", multi: true, lookup: 10, filterable: true, populated: 0, rlsField: false, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 591633, rlsField: null, reso: null },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 553713, rlsField: null, reso: null },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 591649, rlsField: false, reso: true },
    PublicRemarks_lang2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    PublicRemarks_lang3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    RentSpreeURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    RentSpreeYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    Restrictions: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Restrictions", nullable: true, enum: "Restrictions", multi: true, lookup: 106, filterable: true, populated: 24129, rlsField: true, reso: false },
    RiverName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    SaleOrLeaseIncludes: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    SeasonRate: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    SecurityDepositDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    SecurityDepositYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    SourceFloorPlansCount: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11316, rlsField: false, reso: false },
    SourceSupplementPublicCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    SourceSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 591649, rlsField: false, reso: true },
    StoriesPartial: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    StoriesPartialTotal: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    StormProtection: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.StormProtection", nullable: true, enum: "StormProtection", multi: true, lookup: 25, filterable: true, populated: 0, rlsField: false, reso: false },
    TaxAssessedValueImprovement: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TaxAssessedValueLand: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 14, rlsField: false, reso: false },
    TaxAuthority: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TaxRate: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TaxYearRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ThirdPartyIntegrationType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ThirdPartyIntegrationType", nullable: true, enum: "ThirdPartyIntegrationType", multi: true, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: false },
    TitleCompanyAddress: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TitleCompanyName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TitleCompanyPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    TitleCompanyPreferred: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitLocation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    WaterAccessDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    WaterAccessYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    WeeklyRate: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
  } satisfies Record<keyof CotalityCustomProperty, CotalityFieldFact>,
  Enumeration: {
    EnumerationLongValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    EnumerationName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    EnumerationValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    ID: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    ParentEnumerationName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
    ParentEnumerationValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: null, reso: null },
  } satisfies Record<keyof CotalityEnumeration, CotalityFieldFact>,
  Field: {
    Definition: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    DisplayName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    FieldKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    FieldName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    Length: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2152, rlsField: true, reso: false },
    LookupName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 619, rlsField: true, reso: false },
    ModelKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    NumOccurrences: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: true, reso: false },
    Precision: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 136, rlsField: true, reso: false },
    RESOStandardYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    ResourceName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    SystemReferenceCount: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2249, rlsField: true, reso: false },
    SystemReferences: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1178, rlsField: true, reso: false },
    Type: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 9, filterable: true, populated: 2249, rlsField: true, reso: false },
  } satisfies Record<keyof CotalityField, CotalityFieldFact>,
  HistoryTransactional: {
    ChangeType: { type: "Cotality.DataStandard.RESO.DD.Enums.ChangeType", nullable: true, enum: "ChangeType", multi: false, lookup: 15, filterable: null, populated: null, rlsField: true, reso: false },
    ChangedByMemberID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ChangedByMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    FieldKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    FieldName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    HistoryTransactionalKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: null, populated: null, rlsField: true, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: null, populated: null, rlsField: true, reso: false },
    ListAgentKey: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ListingPermission: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    NewValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    OriginatingSystemHistoryKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: null, populated: null, rlsField: true, reso: false },
    PreviousValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: null, populated: null, rlsField: true, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: null, populated: null, rlsField: true, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: null, populated: null, rlsField: true, reso: false },
    ResourceName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ResourceRecordID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    ResourceRecordKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    SourceSystemHistoryKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: true, reso: false },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: null, populated: null, rlsField: true, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: null, populated: null, rlsField: true, reso: false },
  } satisfies Record<keyof CotalityHistoryTransactional, CotalityFieldFact>,
  Lookup: {
    Definition: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    FieldKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    FieldName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    LegacyODataValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    LookupKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    LookupName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    LookupValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    ModelKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    OdataOverride: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: true, reso: false },
    RESOStandardYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    ResourceName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    StandardLookupValue: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    SystemReferenceCount: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 191912, rlsField: true, reso: false },
    SystemReferences: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 81777, rlsField: true, reso: false },
  } satisfies Record<keyof CotalityLookup, CotalityFieldFact>,
  Media: {
    ChangedByMemberID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ChangedByMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ChangedByMemberKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ClassName: { type: "Cotality.DataStandard.RESO.DD.Enums.ClassName", nullable: true, enum: "ClassName", multi: false, lookup: 17, filterable: true, populated: 0, rlsField: false, reso: true },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ImageHeight: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ImageOf: { type: "Cotality.DataStandard.RESO.DD.Enums.ImageOf", nullable: true, enum: "ImageOf", multi: false, lookup: 92, filterable: true, populated: 1, rlsField: false, reso: true },
    ImageSizeDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    ImageWidth: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 2000836, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: false },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1987830, rlsField: false, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000750, rlsField: false, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000836, rlsField: false, reso: false },
    ListingPermission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: true, populated: 1699794, rlsField: false, reso: false },
    LongDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 31738, rlsField: true, reso: true },
    MediaAlteration: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.MediaAlteration", nullable: true, enum: "MediaAlteration", multi: true, lookup: 10, filterable: false, populated: null, rlsField: false, reso: false },
    MediaCategory: { type: "Cotality.DataStandard.RESO.DD.Enums.MediaCategory", nullable: true, enum: "MediaCategory", multi: false, lookup: 18, filterable: true, populated: 2000897, rlsField: true, reso: true },
    MediaClassification: { type: "Cotality.DataStandard.RESO.DD.Enums.MediaClassification", nullable: true, enum: "MediaClassification", multi: false, lookup: 4, filterable: true, populated: 2000898, rlsField: false, reso: false },
    MediaHTML: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MediaKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    MediaKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: false },
    MediaModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    MediaObjectID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1562623, rlsField: true, reso: true },
    MediaStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.MediaStatus", nullable: true, enum: "MediaStatus", multi: false, lookup: 3, filterable: true, populated: 2000898, rlsField: true, reso: true },
    MediaStatusDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    MediaType: { type: "Cotality.DataStandard.RESO.DD.Enums.MediaType", nullable: true, enum: "MediaType", multi: false, lookup: 22, filterable: true, populated: 2000898, rlsField: true, reso: true },
    MediaURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 589848, rlsField: false, reso: true },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1362225, rlsField: false, reso: false },
    Order: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    OriginalMediaUrl: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1318099, rlsField: true, reso: true },
    OriginatingSystemMediaKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: false, reso: false },
    OriginatingSystemResourceRecordId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OriginatingSystemResourceRecordKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 2000836, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Permission", nullable: true, enum: "Permission", multi: true, lookup: 7, filterable: false, populated: null, rlsField: false, reso: true },
    PreferredPhotoYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 71570, rlsField: true, reso: true },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 2000293, rlsField: false, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 1821445, rlsField: false, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 2000836, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: false, reso: false },
    ResourceName: { type: "Cotality.DataStandard.RESO.DD.Enums.ResourceName", nullable: true, enum: "ResourceName", multi: false, lookup: 5, filterable: true, populated: 2000898, rlsField: true, reso: true },
    ResourceRecordID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000888, rlsField: true, reso: true },
    ResourceRecordKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    ResourceRecordKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: false },
    ShortDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 133895, rlsField: false, reso: true },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2000898, rlsField: true, reso: true },
    SourceSystemMediaKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1840948, rlsField: true, reso: true },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    SourceSystemResourceRecordKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 2000836, rlsField: false, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: true, populated: 0, rlsField: false, reso: false },
    X_MediaStream: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: null, reso: null },
  } satisfies Record<keyof CotalityMedia, CotalityFieldFact>,
  Member: {
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: false, reso: false },
    JobTitle: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    LastLoginTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberAORMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberAORkey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberAORkeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MemberAddress1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10472, rlsField: true, reso: true },
    MemberAddress2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberAlternateId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberAssociationComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberBillingPreference: { type: "Cotality.DataStandard.RESO.DD.Enums.BillingPreference", nullable: true, enum: "BillingPreference", multi: false, lookup: 3, filterable: false, populated: null, rlsField: false, reso: true },
    MemberBio: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1042, rlsField: true, reso: false },
    MemberCarrierRoute: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberCity: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10462, rlsField: true, reso: true },
    MemberCityRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MemberCommitteeCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberCountry: { type: "Cotality.DataStandard.RESO.DD.Enums.Country", nullable: true, enum: "Country", multi: false, lookup: 246, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberCountyOrParish: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 4423, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberDesignation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.MemberDesignation", nullable: true, enum: "MemberDesignation", multi: true, lookup: 93, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11064, rlsField: true, reso: true },
    MemberEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11186, rlsField: true, reso: true },
    MemberFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11190, rlsField: true, reso: true },
    MemberFullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberHomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberIsAssistantTo: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: false },
    MemberLanguages: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Languages", nullable: true, enum: "Languages", multi: true, lookup: 212, filterable: true, populated: 816, rlsField: true, reso: true },
    MemberLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberLoginId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberMailOptOutYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberMiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 4281, rlsField: true, reso: true },
    MemberMlsAccessYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberMlsSecurityClass: { type: "Cotality.DataStandard.RESO.DD.Enums.MemberMlsSecurityClass", nullable: true, enum: "MemberMlsSecurityClass", multi: false, lookup: 9, filterable: false, populated: null, rlsField: true, reso: true },
    MemberMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10114, rlsField: true, reso: true },
    MemberNamePrefix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberNameSuffix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberNationalAssociationEntryDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberNickname: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 9890, rlsField: true, reso: true },
    MemberOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberOtherPhoneType: { type: "Cotality.DataStandard.RESO.DD.Enums.MemberOtherPhoneType", nullable: true, enum: "MemberOtherPhoneType", multi: false, lookup: 14, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberPager: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberPhoneTTYTDD: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberPostalCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10474, rlsField: true, reso: true },
    MemberPostalCodePlus4: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 141, rlsField: true, reso: true },
    MemberPreferredMail: { type: "Cotality.DataStandard.RESO.DD.Enums.PreferredMail", nullable: true, enum: "PreferredMail", multi: false, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberPreferredMedia: { type: "Cotality.DataStandard.RESO.DD.Enums.PreferredMedia", nullable: true, enum: "PreferredMedia", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11064, rlsField: true, reso: true },
    MemberPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 29, rlsField: true, reso: true },
    MemberPreferredPublication: { type: "Cotality.DataStandard.RESO.DD.Enums.PreferredPublication", nullable: true, enum: "PreferredPublication", multi: false, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberPrimaryAorId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    MemberStateLicenseExpirationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberStateLicenseState: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: false, populated: null, rlsField: true, reso: true },
    MemberStateLicenseType: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MemberStateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: true, populated: 10459, rlsField: true, reso: true },
    MemberStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.MemberStatus", nullable: true, enum: "MemberStatus", multi: false, lookup: 4, filterable: true, populated: 11191, rlsField: true, reso: true },
    MemberStreetAdditionalInfo: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MemberTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberTransferDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberType: { type: "Cotality.DataStandard.RESO.DD.Enums.MemberType", nullable: true, enum: "MemberType", multi: false, lookup: 23, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberUrl: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 773, rlsField: false, reso: false },
    MemberVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MemberVotingPrecinct: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: false, reso: false },
    OfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: false },
    OfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OriginatingSystemMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OriginatingSystemMemberMlsSecurityClass: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    OriginatingSystemOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 11191, rlsField: true, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: false, reso: false },
    SocialMediaType: { type: "Cotality.DataStandard.RESO.DD.Enums.SocialMediaType", nullable: true, enum: "SocialMediaType", multi: false, lookup: 17, filterable: false, populated: null, rlsField: false, reso: true },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    SourceSystemMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 11191, rlsField: true, reso: true },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: false, populated: null, rlsField: false, reso: true },
    UniqueLicenseeIdentifier: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
  } satisfies Record<keyof CotalityMember, CotalityFieldFact>,
  Model: {
    Definition: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    ModelKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    ModelName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    ModelTimestampFieldKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: true, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    PrimaryKeyFieldKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    SystemReferenceCount: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
    SystemReferences: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 17, rlsField: true, reso: false },
  } satisfies Record<keyof CotalityModel, CotalityFieldFact>,
  Office: {
    BillingOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    FranchiseAffiliation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    FranchiseNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: false, reso: false },
    IDXOfficeParticipationYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 578, rlsField: true, reso: true },
    MainOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 576, rlsField: true, reso: true },
    MainOfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 576, rlsField: true, reso: false },
    MainOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 576, rlsField: true, reso: true },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: false, reso: false },
    NumberOfBranches: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfNonMemberSalespersons: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 577, rlsField: true, reso: true },
    OfficeAORMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeAORkey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeAORkeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OfficeAddress1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 546, rlsField: true, reso: true },
    OfficeAddress2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeAlternateId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 14, rlsField: false, reso: true },
    OfficeAssociationComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OfficeBio: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OfficeBranchType: { type: "Cotality.DataStandard.RESO.DD.Enums.OfficeBranchType", nullable: true, enum: "OfficeBranchType", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeBrokerKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 530, rlsField: true, reso: true },
    OfficeBrokerKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 530, rlsField: true, reso: false },
    OfficeBrokerMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 530, rlsField: true, reso: true },
    OfficeBrokerNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OfficeCity: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 546, rlsField: true, reso: true },
    OfficeCityRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OfficeCorporateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OfficeCountry: { type: "Cotality.DataStandard.RESO.DD.Enums.Country", nullable: true, enum: "Country", multi: false, lookup: 246, filterable: true, populated: 577, rlsField: true, reso: true },
    OfficeCountyOrParish: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 4423, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 42, rlsField: false, reso: true },
    OfficeFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    OfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: false },
    OfficeMailAddress1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailAddress2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailCareOf: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailCity: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailCountry: { type: "Cotality.DataStandard.RESO.DD.Enums.Country", nullable: true, enum: "Country", multi: false, lookup: 246, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailCountyOrParish: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 4423, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailPostalCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailPostalCodePlus4: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeMailStateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeManagerKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    OfficeManagerKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    OfficeManagerMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    OfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    OfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    OfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeNationalAssociationIdInsertDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 546, rlsField: true, reso: true },
    OfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7, rlsField: false, reso: true },
    OfficePostalCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 546, rlsField: true, reso: true },
    OfficePostalCodePlus4: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 25, rlsField: true, reso: true },
    OfficePreferredMedia: { type: "Cotality.DataStandard.RESO.DD.Enums.PreferredMedia", nullable: true, enum: "PreferredMedia", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficePrimaryAorId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficePrimaryStateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeStateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: true, populated: 546, rlsField: true, reso: true },
    OfficeStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.OfficeStatus", nullable: true, enum: "OfficeStatus", multi: false, lookup: 2, filterable: true, populated: 578, rlsField: true, reso: true },
    OfficeStreetAdditionalInfo: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OfficeType: { type: "Cotality.DataStandard.RESO.DD.Enums.OfficeType", nullable: true, enum: "OfficeType", multi: false, lookup: 12, filterable: true, populated: 0, rlsField: false, reso: true },
    OfficeUrl: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 383, rlsField: false, reso: false },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: true },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 577, rlsField: true, reso: true },
    OriginatingSystemMainOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 576, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    OriginatingSystemOfficeBrokerKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 530, rlsField: true, reso: false },
    OriginatingSystemOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    OriginatingSystemOfficeManagerKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 412, rlsField: true, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 577, rlsField: true, reso: false },
    OtherPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: true, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: false, reso: false },
    SocialMediaType: { type: "Cotality.DataStandard.RESO.DD.Enums.SocialMediaType", nullable: true, enum: "SocialMediaType", multi: false, lookup: 17, filterable: false, populated: null, rlsField: false, reso: true },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 577, rlsField: true, reso: true },
    SourceSystemOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578, rlsField: true, reso: true },
    SyndicateAgentOption: { type: "Cotality.DataStandard.RESO.DD.Enums.SyndicateAgentOption", nullable: true, enum: "SyndicateAgentOption", multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: false, populated: null, rlsField: false, reso: true },
    VirtualOfficeWebsiteYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
  } satisfies Record<keyof CotalityOffice, CotalityFieldFact>,
  OpenHouse: {
    AppointmentRequiredYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 1474, rlsField: true, reso: true },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 1483, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: false },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    ListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: false },
    ListingPermission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: true, populated: 604, rlsField: false, reso: false },
    LivestreamOpenHouseURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 100, rlsField: false, reso: false },
    OpenHouseAttendedBy: { type: "Cotality.DataStandard.RESO.DD.Enums.Attended", nullable: true, enum: "Attended", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    OpenHouseDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseEndTime: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: false },
    OpenHouseRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    OpenHouseStartTime: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.OpenHouseStatus", nullable: true, enum: "OpenHouseStatus", multi: false, lookup: 3, filterable: true, populated: 1483, rlsField: true, reso: true },
    OpenHouseType: { type: "Cotality.DataStandard.RESO.DD.Enums.OpenHouseType", nullable: true, enum: "OpenHouseType", multi: false, lookup: 9, filterable: true, populated: 613, rlsField: true, reso: true },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 14, rlsField: true, reso: true },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    OriginatingSystemListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 1483, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: false, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 1483, rlsField: false, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 1430, rlsField: false, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 1483, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: false, reso: false },
    Refreshments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ShowingAgentFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1196, rlsField: true, reso: true },
    ShowingAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1373, rlsField: true, reso: true },
    ShowingAgentKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ShowingAgentLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1196, rlsField: true, reso: true },
    ShowingAgentMlsID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1373, rlsField: true, reso: true },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    SourceSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    SourceSystemListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1483, rlsField: true, reso: true },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 1483, rlsField: false, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: true, populated: 0, rlsField: false, reso: false },
  } satisfies Record<keyof CotalityOpenHouse, CotalityFieldFact>,
  Property: {
    AboveGradeFinishedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AboveGradeFinishedAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    AboveGradeFinishedAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 76, rlsField: false, reso: true },
    AboveGradeUnfinishedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AboveGradeUnfinishedAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    AboveGradeUnfinishedAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    AccessCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    AccessibilityFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.AccessibilityFeatures", nullable: true, enum: "AccessibilityFeatures", multi: true, lookup: 76, filterable: true, populated: 4802, rlsField: true, reso: true },
    ActivationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 46105, rlsField: true, reso: false },
    AdditionalParcelsDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AdditionalParcelsYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    AnchorsCoTenants: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Appliances: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Appliances", nullable: true, enum: "Appliances", multi: true, lookup: 129, filterable: true, populated: 202134, rlsField: true, reso: true },
    ArchitecturalStyle: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ArchitecturalStyle", nullable: true, enum: "ArchitecturalStyle", multi: true, lookup: 135, filterable: true, populated: 248763, rlsField: true, reso: true },
    AssociationAmenities: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.AssociationAmenities", nullable: true, enum: "AssociationAmenities", multi: true, lookup: 137, filterable: true, populated: 0, rlsField: false, reso: true },
    AssociationFee: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 243779, rlsField: true, reso: true },
    AssociationFee2: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 60, rlsField: false, reso: true },
    AssociationFee2Frequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 178, rlsField: false, reso: true },
    AssociationFee3: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AssociationFee3Frequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 0, rlsField: false, reso: false },
    AssociationFeeFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 81884, rlsField: true, reso: true },
    AssociationFeeIncludes: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.AssociationFeeIncludes", nullable: true, enum: "AssociationFeeIncludes", multi: true, lookup: 63, filterable: true, populated: 4552, rlsField: true, reso: true },
    AssociationName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 200, rlsField: false, reso: true },
    AssociationName2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AssociationName3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AssociationPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AssociationPhone2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    AssociationPhone3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AssociationYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 40139, rlsField: true, reso: true },
    AttachedGarageYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 21379, rlsField: true, reso: true },
    AttributionContact: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    AvailabilityDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 373040, rlsField: true, reso: true },
    AvailableLeaseType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ExistingLeaseType", nullable: true, enum: "ExistingLeaseType", multi: true, lookup: 23, filterable: true, populated: 0, rlsField: false, reso: true },
    BackOnMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 4354, rlsField: false, reso: true },
    BackOnMarketTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 4353, rlsField: false, reso: false },
    Basement: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Basement", nullable: true, enum: "Basement", multi: true, lookup: 43, filterable: true, populated: 59659, rlsField: true, reso: true },
    BasementYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 65252, rlsField: true, reso: true },
    BathroomsFull: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 481482, rlsField: true, reso: true },
    BathroomsHalf: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 409765, rlsField: true, reso: true },
    BathroomsOneQuarter: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 323, rlsField: false, reso: true },
    BathroomsPartial: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BathroomsThreeQuarter: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 258, rlsField: false, reso: true },
    BathroomsTotalInteger: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587684, rlsField: true, reso: true },
    BedroomsPossible: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BedroomsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587737, rlsField: true, reso: true },
    BelowGradeFinishedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BelowGradeFinishedAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    BelowGradeFinishedAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 16, rlsField: false, reso: true },
    BelowGradeUnfinishedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BelowGradeUnfinishedAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    BelowGradeUnfinishedAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    BodyType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BodyType", nullable: true, enum: "BodyType", multi: true, lookup: 7, filterable: true, populated: 0, rlsField: false, reso: true },
    BuilderModel: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BuilderName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 79, rlsField: false, reso: true },
    BuildingAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    BuildingAreaTotal: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 15003, rlsField: true, reso: true },
    BuildingAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 12674, rlsField: true, reso: true },
    BuildingFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BuildingFeatures", nullable: true, enum: "BuildingFeatures", multi: true, lookup: 123, filterable: true, populated: 65882, rlsField: true, reso: true },
    BuildingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    BuildingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    BuildingName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 221140, rlsField: true, reso: true },
    BusinessName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BusinessType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BusinessType", nullable: true, enum: "BusinessType", multi: true, lookup: 139, filterable: true, populated: 0, rlsField: false, reso: true },
    BuyerAgentAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentDesignation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BuyerAgentDesignation", nullable: true, enum: "BuyerAgentDesignation", multi: true, lookup: 27, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentFullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentHomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    BuyerAgentLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentMiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 100112, rlsField: true, reso: true },
    BuyerAgentMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentNamePrefix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentNameSuffix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentPager: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerAgentVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerAgentVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerBrokerageCompensation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    BuyerBrokerageCompensationType: { type: "Cotality.DataStandard.RESO.DD.Enums.CompensationType", nullable: true, enum: "CompensationType", multi: false, lookup: 5, filterable: false, populated: null, rlsField: true, reso: false },
    BuyerFinancing: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.BuyerFinancing", nullable: true, enum: "BuyerFinancing", multi: true, lookup: 42, filterable: true, populated: 184, rlsField: false, reso: true },
    BuyerOfficeAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerOfficeEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerOfficeFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerOfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    BuyerOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 100463, rlsField: true, reso: true },
    BuyerOfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerOfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    BuyerOfficeURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    BuyerTeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    BuyerTeamKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    BuyerTeamMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    BuyerTeamName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CLIP: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 539492, rlsField: false, reso: false },
    CableTvExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    CancellationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CapRate: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 44, rlsField: false, reso: true },
    CarportSpaces: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 5, rlsField: false, reso: true },
    CarportYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 144, rlsField: false, reso: true },
    CarrierRoute: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    City: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 24514, filterable: true, populated: 591607, rlsField: true, reso: true },
    CityRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    CloseDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578417, rlsField: true, reso: true },
    ClosePrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 508931, rlsField: true, reso: true },
    CoBuyerAgentAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentDesignation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CoBuyerAgentDesignation", nullable: true, enum: "CoBuyerAgentDesignation", multi: true, lookup: 27, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentFullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentHomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    CoBuyerAgentLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentMiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 3168, rlsField: false, reso: true },
    CoBuyerAgentMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentNamePrefix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentNameSuffix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentPager: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerAgentVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    CoBuyerOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 3173, rlsField: false, reso: true },
    CoBuyerOfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoBuyerOfficeURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoListAgent2AOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 50821, rlsField: false, reso: false },
    CoListAgent2DirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50831, rlsField: false, reso: false },
    CoListAgent2Email: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50916, rlsField: false, reso: false },
    CoListAgent2FirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50931, rlsField: false, reso: false },
    CoListAgent2FullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50995, rlsField: false, reso: false },
    CoListAgent2HomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent2Key: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50994, rlsField: false, reso: false },
    CoListAgent2LastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50931, rlsField: false, reso: false },
    CoListAgent2MiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 19072, rlsField: false, reso: false },
    CoListAgent2MlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 51234, rlsField: false, reso: false },
    CoListAgent2MobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 48785, rlsField: false, reso: false },
    CoListAgent2NationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent2Nickname: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50677, rlsField: false, reso: false },
    CoListAgent2OfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent2PreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50779, rlsField: false, reso: false },
    CoListAgent2StateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50697, rlsField: false, reso: false },
    CoListAgent2URL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 3861, rlsField: false, reso: false },
    CoListAgent3AOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 7868, rlsField: false, reso: false },
    CoListAgent3DirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7962, rlsField: false, reso: false },
    CoListAgent3Email: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7987, rlsField: false, reso: false },
    CoListAgent3FirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7957, rlsField: false, reso: false },
    CoListAgent3FullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7993, rlsField: false, reso: false },
    CoListAgent3HomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent3Key: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7993, rlsField: false, reso: false },
    CoListAgent3LastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7957, rlsField: false, reso: false },
    CoListAgent3MiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 3101, rlsField: false, reso: false },
    CoListAgent3MlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7994, rlsField: false, reso: false },
    CoListAgent3MobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7493, rlsField: false, reso: false },
    CoListAgent3NationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent3Nickname: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7828, rlsField: false, reso: false },
    CoListAgent3OfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    CoListAgent3PreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7937, rlsField: false, reso: false },
    CoListAgent3StateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7880, rlsField: false, reso: false },
    CoListAgent3URL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 716, rlsField: false, reso: false },
    CoListAgentAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 207368, rlsField: true, reso: true },
    CoListAgentDesignation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CoListAgentDesignation", nullable: true, enum: "CoListAgentDesignation", multi: true, lookup: 27, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 206739, rlsField: true, reso: true },
    CoListAgentEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 208274, rlsField: true, reso: true },
    CoListAgentFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207355, rlsField: true, reso: true },
    CoListAgentFullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 208274, rlsField: true, reso: true },
    CoListAgentHomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: true },
    CoListAgentKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: false },
    CoListAgentLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207360, rlsField: true, reso: true },
    CoListAgentMiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 84950, rlsField: true, reso: true },
    CoListAgentMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 208023, rlsField: true, reso: true },
    CoListAgentMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    CoListAgentNamePrefix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentNameSuffix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentNickname: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 206954, rlsField: false, reso: false },
    CoListAgentOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentPager: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 206467, rlsField: true, reso: true },
    CoListAgentPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    CoListAgentTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    CoListAgentVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListAgentVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListOffice2AOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 50884, rlsField: false, reso: false },
    CoListOffice2Email: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 6411, rlsField: false, reso: false },
    CoListOffice2Key: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50994, rlsField: false, reso: false },
    CoListOffice2MlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50994, rlsField: false, reso: false },
    CoListOffice2Name: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50994, rlsField: false, reso: false },
    CoListOffice2Phone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50927, rlsField: false, reso: false },
    CoListOffice2URL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 48800, rlsField: false, reso: false },
    CoListOfficeAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 207183, rlsField: true, reso: true },
    CoListOfficeEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 21683, rlsField: true, reso: true },
    CoListOfficeFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: true },
    CoListOfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: false },
    CoListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: true },
    CoListOfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207401, rlsField: true, reso: true },
    CoListOfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CoListOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207248, rlsField: true, reso: true },
    CoListOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CoListOfficeURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 199749, rlsField: true, reso: true },
    CommonInterest: { type: "Cotality.DataStandard.RESO.DD.Enums.CommonInterest", nullable: true, enum: "CommonInterest", multi: false, lookup: 13, filterable: true, populated: 435273, rlsField: true, reso: true },
    CommonWalls: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CommonWalls", nullable: true, enum: "CommonWalls", multi: true, lookup: 6, filterable: true, populated: 0, rlsField: false, reso: true },
    CommunityFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CommunityFeatures", nullable: true, enum: "CommunityFeatures", multi: true, lookup: 141, filterable: true, populated: 5999, rlsField: true, reso: true },
    CompSaleYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    CompensationComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionInPrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionInPriceType: { type: "Cotality.DataStandard.RESO.DD.Enums.ConcessionInPriceType", nullable: true, enum: "ConcessionInPriceType", multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    Concessions: { type: "Cotality.DataStandard.RESO.DD.Enums.Concessions", nullable: true, enum: "Concessions", multi: false, lookup: 3, filterable: false, populated: null, rlsField: true, reso: true },
    ConcessionsAmount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ConcessionsBuyerBrokerFee: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionsClosingCosts: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionsComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ConcessionsFinancingCosts: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionsOtherCosts: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConcessionsPropertyImprovementCosts: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ConstructionMaterials: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ConstructionMaterials", nullable: true, enum: "ConstructionMaterials", multi: true, lookup: 87, filterable: true, populated: 45, rlsField: false, reso: true },
    ContinentRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Contingency: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ContingentDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ContractStatusChangeDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    Cooling: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Cooling", nullable: true, enum: "Cooling", multi: true, lookup: 41, filterable: true, populated: 205151, rlsField: true, reso: true },
    CoolingYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 233886, rlsField: true, reso: true },
    CopyrightNotice: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    Country: { type: "Cotality.DataStandard.RESO.DD.Enums.Country", nullable: true, enum: "Country", multi: false, lookup: 246, filterable: false, populated: null, rlsField: true, reso: true },
    CountryRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CountrySubdivision: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591582, rlsField: false, reso: false },
    CountyOrParish: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 4423, filterable: true, populated: 591607, rlsField: true, reso: true },
    CoveredSpaces: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    CropsIncludedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    CrossStreet: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 396743, rlsField: true, reso: true },
    CultivatedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    CumulativeDaysOnMarket: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    CurrentFinancing: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CurrentFinancing", nullable: true, enum: "CurrentFinancing", multi: true, lookup: 24, filterable: true, populated: 0, rlsField: false, reso: true },
    CurrentPrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    CurrentUse: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CurrentOrPossibleUse", nullable: true, enum: "CurrentOrPossibleUse", multi: true, lookup: 66, filterable: true, populated: 786, rlsField: false, reso: true },
    DOH1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    DOH2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    DOH3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    DaysOnMarket: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    DaysOnMarketReplication: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    DaysOnMarketReplicationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    DaysOnMarketReplicationIncreasingYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: true, reso: false },
    DelayedMarketingDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    DelayedMarketingYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    DevelopmentStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.DevelopmentStatus", nullable: true, enum: "DevelopmentStatus", multi: true, lookup: 19, filterable: true, populated: 462, rlsField: false, reso: true },
    DirectionFaces: { type: "Cotality.DataStandard.RESO.DD.Enums.DirectionFaces", nullable: true, enum: "DirectionFaces", multi: false, lookup: 9, filterable: true, populated: 1382, rlsField: false, reso: true },
    Directions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Disclaimer: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Disclosures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Disclosures", nullable: true, enum: "Disclosures", multi: true, lookup: 119, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToBusComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToBusNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToBusUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToElectricComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToElectricNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToElectricUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToFreewayComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToFreewayNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToFreewayUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToGasComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToGasNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToGasUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPhoneServiceComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPhoneServiceNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPhoneServiceUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPlaceofWorshipComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPlaceofWorshipNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToPlaceofWorshipUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolBusComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolBusNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolBusUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolsComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolsNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSchoolsUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSewerComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSewerNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToSewerUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToShoppingComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToShoppingNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToShoppingUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToStreetComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToStreetNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToStreetUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToWaterComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToWaterNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    DistanceToWaterUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    DocumentsAvailable: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.DocumentsAvailable", nullable: true, enum: "DocumentsAvailable", multi: true, lookup: 94, filterable: true, populated: 0, rlsField: false, reso: true },
    DocumentsChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 366181, rlsField: true, reso: true },
    DocumentsCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    DoorFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.DoorFeatures", nullable: true, enum: "DoorFeatures", multi: true, lookup: 18, filterable: true, populated: 32, rlsField: false, reso: true },
    DownPaymentAssistanceAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    DownPaymentAssistanceCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    DownPaymentAssistanceYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    DualOrVariableRateCommissionYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    Electric: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Electric", nullable: true, enum: "Electric", multi: true, lookup: 46, filterable: true, populated: 10, rlsField: false, reso: true },
    ElectricExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    ElectricOnPropertyYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 118, rlsField: false, reso: true },
    ElementarySchool: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    ElementarySchoolDistrict: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    Elevation: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ElevationUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: true },
    EntryLevel: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 424420, rlsField: true, reso: true },
    EntryLocation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    EstimatedCloseDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    Exclusions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 111787, rlsField: true, reso: true },
    ExistingLeaseType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ExistingLeaseType", nullable: true, enum: "ExistingLeaseType", multi: true, lookup: 23, filterable: true, populated: 0, rlsField: false, reso: true },
    ExpirationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    Exposures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Exposures", nullable: true, enum: "Exposures", multi: true, lookup: 9, filterable: true, populated: 338278, rlsField: false, reso: false },
    ExteriorFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ExteriorFeatures", nullable: true, enum: "ExteriorFeatures", multi: true, lookup: 152, filterable: true, populated: 238927, rlsField: true, reso: true },
    FarmCreditServiceInclYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    FarmLandAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: false, populated: null, rlsField: false, reso: true },
    FarmLandAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: false, populated: null, rlsField: false, reso: true },
    Fencing: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Fencing", nullable: true, enum: "Fencing", multi: true, lookup: 56, filterable: true, populated: 44, rlsField: false, reso: true },
    FhaEligibility: { type: "Cotality.DataStandard.RESO.DD.Enums.FhaEligibility", nullable: true, enum: "FhaEligibility", multi: false, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    FinancialDataSource: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.FinancialDataSource", nullable: true, enum: "FinancialDataSource", multi: true, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    FireplaceFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.FireplaceFeatures", nullable: true, enum: "FireplaceFeatures", multi: true, lookup: 79, filterable: true, populated: 18576, rlsField: true, reso: true },
    FireplaceYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 96628, rlsField: true, reso: true },
    FireplacesTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 29172, rlsField: true, reso: true },
    FloorPlansChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    FloorPlansCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    Flooring: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Flooring", nullable: true, enum: "Flooring", multi: true, lookup: 62, filterable: true, populated: 25863, rlsField: true, reso: true },
    FoundationArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 802, rlsField: false, reso: true },
    FoundationDetails: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.FoundationDetails", nullable: true, enum: "FoundationDetails", multi: true, lookup: 27, filterable: true, populated: 13, rlsField: false, reso: true },
    FrontageLength: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    FrontageLengthRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    FrontageLengthUnit: { type: "Cotality.DataStandard.RESO.DD.Enums.FrontageLengthUnit", nullable: true, enum: "FrontageLengthUnit", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    FrontageType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.FrontageType", nullable: true, enum: "FrontageType", multi: true, lookup: 14, filterable: true, populated: 0, rlsField: false, reso: true },
    FuelExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    Furnished: { type: "Cotality.DataStandard.RESO.DD.Enums.Furnished", nullable: true, enum: "Furnished", multi: false, lookup: 5, filterable: true, populated: 95091, rlsField: true, reso: true },
    FurnitureReplacementExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    GarageSpaces: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 66660, rlsField: false, reso: true },
    GarageYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 547220, rlsField: true, reso: true },
    GardenerExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    GrazingPermitsBlmYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    GrazingPermitsForestServiceYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    GrazingPermitsPrivateYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    GreenBuildingVerificationType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenBuildingVerificationType", nullable: true, enum: "GreenBuildingVerificationType", multi: true, lookup: 29, filterable: true, populated: 5, rlsField: false, reso: true },
    GreenEnergyEfficient: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenEnergyEfficient", nullable: true, enum: "GreenEnergyEfficient", multi: true, lookup: 25, filterable: true, populated: 416, rlsField: false, reso: true },
    GreenEnergyGeneration: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenEnergyGeneration", nullable: true, enum: "GreenEnergyGeneration", multi: true, lookup: 8, filterable: true, populated: 2, rlsField: false, reso: true },
    GreenIndoorAirQuality: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenIndoorAirQuality", nullable: true, enum: "GreenIndoorAirQuality", multi: true, lookup: 8, filterable: true, populated: 1, rlsField: false, reso: true },
    GreenLocation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenLocation", nullable: true, enum: "GreenLocation", multi: true, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    GreenSustainability: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenSustainability", nullable: true, enum: "GreenSustainability", multi: true, lookup: 9, filterable: true, populated: 0, rlsField: false, reso: true },
    GreenVerificationYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    GreenWaterConservation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.GreenWaterConservation", nullable: true, enum: "GreenWaterConservation", multi: true, lookup: 12, filterable: true, populated: 0, rlsField: false, reso: true },
    GrossIncome: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    GrossScheduledIncome: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    HabitableResidenceYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    HeadBrokerMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    HeadBrokerMemberMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    Heating: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Heating", nullable: true, enum: "Heating", multi: true, lookup: 96, filterable: true, populated: 22920, rlsField: true, reso: true },
    HeatingYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 38477, rlsField: true, reso: true },
    HighSchool: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    HighSchoolDistrict: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    HomeWarrantyYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 6, rlsField: false, reso: true },
    HorseAmenities: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.HorseAmenities", nullable: true, enum: "HorseAmenities", multi: true, lookup: 41, filterable: false, populated: null, rlsField: false, reso: true },
    HorseYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    HoursDaysOfOperation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.HoursDaysOfOperation", nullable: true, enum: "HoursDaysOfOperation", multi: true, lookup: 9, filterable: true, populated: 0, rlsField: false, reso: true },
    HoursDaysOfOperationDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    Inclusions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 111868, rlsField: true, reso: true },
    IncomeIncludes: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.IncomeIncludes", nullable: true, enum: "IncomeIncludes", multi: true, lookup: 7, filterable: true, populated: 0, rlsField: false, reso: true },
    InsuranceExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    InteriorFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.InteriorOrRoomFeatures", nullable: true, enum: "InteriorOrRoomFeatures", multi: true, lookup: 299, filterable: true, populated: 144434, rlsField: true, reso: true },
    InternetAddressDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: true, reso: true },
    InternetAutomatedValuationDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 591607, rlsField: true, reso: true },
    InternetConsumerCommentYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 591607, rlsField: true, reso: true },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: true, reso: true },
    IrrigationSource: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.IrrigationSource", nullable: true, enum: "IrrigationSource", multi: true, lookup: 21, filterable: false, populated: null, rlsField: false, reso: true },
    IrrigationWaterRightsAcres: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    IrrigationWaterRightsYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    LaborInformation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LaborInformation", nullable: true, enum: "LaborInformation", multi: true, lookup: 3, filterable: true, populated: 5, rlsField: false, reso: true },
    LandLeaseAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LandLeaseAmountFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 1, rlsField: false, reso: true },
    LandLeaseExpirationDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 325, rlsField: false, reso: true },
    LandLeaseYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 70069, rlsField: true, reso: true },
    Latitude: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    LaundryFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LaundryFeatures", nullable: true, enum: "LaundryFeatures", multi: true, lookup: 50, filterable: true, populated: 393328, rlsField: true, reso: true },
    LeasableArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LeasableAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseAmountFrequency: { type: "Cotality.DataStandard.RESO.DD.Enums.FeeFrequency", nullable: true, enum: "FeeFrequency", multi: false, lookup: 16, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseAssignableYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseConsideredYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseExpiration: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    LeaseRenewalCompensation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LeaseRenewalCompensation", nullable: true, enum: "LeaseRenewalCompensation", multi: true, lookup: 5, filterable: false, populated: null, rlsField: false, reso: true },
    LeaseRenewalOptionYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseTerm: { type: "Cotality.DataStandard.RESO.DD.Enums.LeaseTerm", nullable: true, enum: "LeaseTerm", multi: false, lookup: 26, filterable: true, populated: 0, rlsField: false, reso: true },
    LeaseTermOptions: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LeaseTerm", nullable: true, enum: "LeaseTerm", multi: true, lookup: 26, filterable: true, populated: 0, rlsField: false, reso: false },
    Levels: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Levels", nullable: true, enum: "Levels", multi: true, lookup: 18, filterable: true, populated: 5755, rlsField: true, reso: true },
    License1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    License2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    License3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LicensesExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 585917, rlsField: true, reso: true },
    ListAgentDesignation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListAgentDesignation", nullable: true, enum: "ListAgentDesignation", multi: true, lookup: 27, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 580228, rlsField: true, reso: true },
    ListAgentEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListAgentFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentFirstName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 585957, rlsField: true, reso: true },
    ListAgentFullName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListAgentHomePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587315, rlsField: true, reso: true },
    ListAgentKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587315, rlsField: true, reso: false },
    ListAgentLastName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 585980, rlsField: true, reso: true },
    ListAgentMiddleName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 250636, rlsField: true, reso: true },
    ListAgentMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591197, rlsField: true, reso: true },
    ListAgentMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ListAgentNamePrefix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentNameSuffix: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentNickname: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 585639, rlsField: false, reso: false },
    ListAgentOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentPager: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578578, rlsField: true, reso: true },
    ListAgentPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ListAgentTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 61122, rlsField: true, reso: true },
    ListAgentVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListAgentVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListOfficeAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 591537, rlsField: true, reso: true },
    ListOfficeEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 52567, rlsField: true, reso: true },
    ListOfficeFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListOfficeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListOfficeName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListOfficeNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591538, rlsField: true, reso: true },
    ListOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListOfficeURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 585251, rlsField: true, reso: true },
    ListPrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListPriceLow: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListTeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListTeamKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    ListTeamMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ListTeamName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ListingAgreement: { type: "Cotality.DataStandard.RESO.DD.Enums.ListingAgreement", nullable: true, enum: "ListingAgreement", multi: false, lookup: 11, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListingContractDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 581836, rlsField: true, reso: true },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListingKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: false },
    ListingService: { type: "Cotality.DataStandard.RESO.DD.Enums.ListingService", nullable: true, enum: "ListingService", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    ListingTerms: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingTerms", nullable: true, enum: "ListingTerms", multi: true, lookup: 67, filterable: true, populated: 0, rlsField: false, reso: true },
    ListingURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 582804, rlsField: false, reso: true },
    ListingURLDescription: { type: "Cotality.DataStandard.RESO.DD.Enums.ListingURLDescription", nullable: true, enum: "ListingURLDescription", multi: false, lookup: 7, filterable: true, populated: 0, rlsField: false, reso: true },
    LivingArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 417652, rlsField: true, reso: true },
    LivingAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    LivingAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 446923, rlsField: true, reso: true },
    LockBoxLocation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    LockBoxSerialNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    LockBoxType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LockBoxType", nullable: true, enum: "LockBoxType", multi: true, lookup: 11, filterable: false, populated: null, rlsField: false, reso: true },
    Longitude: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    LotDimensionsSource: { type: "Cotality.DataStandard.RESO.DD.Enums.LotDimensionsSource", nullable: true, enum: "LotDimensionsSource", multi: false, lookup: 14, filterable: true, populated: 0, rlsField: false, reso: true },
    LotFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.LotFeatures", nullable: true, enum: "LotFeatures", multi: true, lookup: 207, filterable: true, populated: 1714, rlsField: false, reso: true },
    LotSizeAcres: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LotSizeArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 60046, rlsField: true, reso: true },
    LotSizeDimensions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 237288, rlsField: true, reso: true },
    LotSizeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.LotSizeSource", nullable: true, enum: "LotSizeSource", multi: false, lookup: 15, filterable: true, populated: 341, rlsField: false, reso: true },
    LotSizeSquareFeet: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    LotSizeUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LotSizeUnits", nullable: true, enum: "LotSizeUnits", multi: false, lookup: 4, filterable: true, populated: 35362, rlsField: true, reso: true },
    MLSAreaMajor: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: false, populated: null, rlsField: false, reso: true },
    MLSAreaMinor: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: false, populated: null, rlsField: false, reso: true },
    MainLevelBathrooms: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MainLevelBedrooms: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    MaintenanceExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10, rlsField: false, reso: true },
    MajorChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    MajorChangeType: { type: "Cotality.DataStandard.RESO.DD.Enums.ChangeType", nullable: true, enum: "ChangeType", multi: false, lookup: 14, filterable: true, populated: 588497, rlsField: true, reso: true },
    Make: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ManagerExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    MapCoordinate: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MapCoordinateSource: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MapURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MaximumNumberOfPets: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MaximumPetWeight: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    MiddleOrJuniorSchool: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    MiddleOrJuniorSchoolDistrict: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 1, filterable: true, populated: 0, rlsField: false, reso: true },
    MlsStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.MlsStatus", nullable: true, enum: "MlsStatus", multi: false, lookup: 26, filterable: false, populated: null, rlsField: true, reso: true },
    MobileDimUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: false, populated: null, rlsField: false, reso: true },
    MobileHomeRemainsYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    MobileLength: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    MobileWidth: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    Model: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    MoveInCosts: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.MoveInCosts", nullable: true, enum: "MoveInCosts", multi: true, lookup: 13, filterable: true, populated: 375, rlsField: false, reso: false },
    MoveInCostsAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 108, rlsField: false, reso: false },
    MoveInCostsComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 381, rlsField: false, reso: false },
    NetOperatingIncome: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 218, rlsField: false, reso: true },
    NewConstructionYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 576590, rlsField: true, reso: true },
    NewTaxesExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    NumberOfBuildings: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 74, rlsField: false, reso: true },
    NumberOfFullTimeEmployees: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfLots: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfPads: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfPartTimeEmployees: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfSeparateElectricMeters: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 9, rlsField: false, reso: true },
    NumberOfSeparateGasMeters: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10, rlsField: false, reso: true },
    NumberOfSeparateWaterMeters: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    NumberOfUnitsInCommunity: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    NumberOfUnitsLeased: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfUnitsMoMo: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    NumberOfUnitsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    NumberOfUnitsVacant: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7941, rlsField: true, reso: true },
    OccupantName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OccupantPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OccupantType: { type: "Cotality.DataStandard.RESO.DD.Enums.OccupantType", nullable: true, enum: "OccupantType", multi: false, lookup: 7, filterable: false, populated: null, rlsField: true, reso: true },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 578868, rlsField: true, reso: true },
    OffMarketTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 579587, rlsField: true, reso: true },
    OnMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 119571, rlsField: true, reso: true },
    OnMarketTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 265702, rlsField: true, reso: true },
    OngoingFees: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.OngoingFees", nullable: true, enum: "OngoingFees", multi: true, lookup: 5, filterable: true, populated: 28, rlsField: false, reso: false },
    OpenHouseModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OpenParkingSpaces: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 16, rlsField: false, reso: true },
    OpenParkingYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 126, rlsField: false, reso: true },
    OperatingExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    OperatingExpenseIncludes: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.OperatingExpenseIncludes", nullable: true, enum: "OperatingExpenseIncludes", multi: true, lookup: 39, filterable: true, populated: 0, rlsField: false, reso: true },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    OriginalListPrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 375691, rlsField: true, reso: true },
    OriginatingSystemBuyerAgentMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    OriginatingSystemBuyerOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: false },
    OriginatingSystemBuyerTeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OriginatingSystemCoBuyerAgentMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OriginatingSystemCoBuyerOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OriginatingSystemCoListAgent2MemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 50998, rlsField: false, reso: false },
    OriginatingSystemCoListAgent3MemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 7993, rlsField: false, reso: false },
    OriginatingSystemCoListAgentMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 207472, rlsField: true, reso: false },
    OriginatingSystemCoListOffice2Key: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OriginatingSystemCoListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 21227, rlsField: true, reso: false },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 546550, rlsField: true, reso: true },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    OriginatingSystemListAgentMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587646, rlsField: true, reso: false },
    OriginatingSystemListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 589675, rlsField: true, reso: false },
    OriginatingSystemListTeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    OriginatingSystemModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 591607, rlsField: true, reso: false },
    OtherEquipment: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.OtherEquipment", nullable: true, enum: "OtherEquipment", multi: true, lookup: 35, filterable: true, populated: 72586, rlsField: true, reso: true },
    OtherExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    OtherParking: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OtherStructures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.OtherStructures", nullable: true, enum: "OtherStructures", multi: true, lookup: 59, filterable: true, populated: 1632, rlsField: false, reso: true },
    OwnerName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    OwnerName2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    OwnerPays: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.OwnerPays", nullable: true, enum: "OwnerPays", multi: true, lookup: 39, filterable: true, populated: 7915, rlsField: true, reso: true },
    OwnerPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    Ownership: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    OwnershipType: { type: "Cotality.DataStandard.RESO.DD.Enums.OwnershipType", nullable: true, enum: "OwnershipType", multi: false, lookup: 13, filterable: true, populated: 0, rlsField: false, reso: true },
    ParcelNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 380705, rlsField: false, reso: true },
    ParcelSubcomponent: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    ParkManagerName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ParkManagerPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ParkName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ParkingFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ParkingFeatures", nullable: true, enum: "ParkingFeatures", multi: true, lookup: 204, filterable: true, populated: 10376, rlsField: true, reso: true },
    ParkingTotal: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 237, rlsField: false, reso: true },
    PastureArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    PatioAndPorchFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PatioAndPorchFeatures", nullable: true, enum: "PatioAndPorchFeatures", multi: true, lookup: 53, filterable: true, populated: 156521, rlsField: true, reso: true },
    PendingTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 143221, rlsField: true, reso: true },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: true, populated: 591607, rlsField: true, reso: false },
    PestControlExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    PetDeposit: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    PetsAllowed: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PetsAllowed", nullable: true, enum: "PetsAllowed", multi: true, lookup: 31, filterable: true, populated: 586565, rlsField: true, reso: true },
    PetsAllowedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    PetsComments: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    PhotosChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591597, rlsField: true, reso: true },
    PhotosCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    PoolExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    PoolFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PoolFeatures", nullable: true, enum: "PoolFeatures", multi: true, lookup: 88, filterable: true, populated: 10669, rlsField: false, reso: true },
    PoolPrivateYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    Possession: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Possession", nullable: true, enum: "Possession", multi: true, lookup: 39, filterable: true, populated: 0, rlsField: false, reso: true },
    PossibleUse: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.CurrentOrPossibleUse", nullable: true, enum: "CurrentOrPossibleUse", multi: true, lookup: 66, filterable: true, populated: 1, rlsField: false, reso: true },
    PostalCity: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 20098, filterable: true, populated: 591064, rlsField: true, reso: true },
    PostalCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    PostalCodePlus4: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 545701, rlsField: true, reso: true },
    PowerProductionType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PowerProductionType", nullable: true, enum: "PowerProductionType", multi: true, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    PowerProductionYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    PreviousListPrice: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 219895, rlsField: true, reso: true },
    PreviousStandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: false, populated: null, rlsField: false, reso: false },
    PriceChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 361678, rlsField: true, reso: true },
    PrivateOfficeRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    PrivateRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ProfessionalManagementExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    PropertyAttachedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: true },
    PropertyCondition: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertyCondition", nullable: true, enum: "PropertyCondition", multi: true, lookup: 27, filterable: false, populated: null, rlsField: true, reso: true },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 591591, rlsField: true, reso: true },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 553713, rlsField: true, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 591607, rlsField: true, reso: true },
    PublicRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 579433, rlsField: false, reso: true },
    PublicSurveyRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    PublicSurveySection: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    PublicSurveyTownship: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    PurchaseContractDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 179612, rlsField: true, reso: true },
    RVParkingDimensions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    RangeArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: false, reso: false },
    RentControlYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    RentIncludes: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.RentIncludes", nullable: true, enum: "RentIncludes", multi: true, lookup: 33, filterable: true, populated: 0, rlsField: false, reso: true },
    RoadFrontageType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.RoadFrontageType", nullable: true, enum: "RoadFrontageType", multi: true, lookup: 29, filterable: true, populated: 0, rlsField: false, reso: true },
    RoadResponsibility: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.RoadResponsibility", nullable: true, enum: "RoadResponsibility", multi: true, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    RoadSurfaceType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.RoadSurfaceType", nullable: true, enum: "RoadSurfaceType", multi: true, lookup: 16, filterable: true, populated: 0, rlsField: false, reso: true },
    Roof: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Roof", nullable: true, enum: "Roof", multi: true, lookup: 51, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.RoomType", nullable: true, enum: "RoomType", multi: true, lookup: 122, filterable: true, populated: 8296, rlsField: true, reso: true },
    RoomsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 587737, rlsField: true, reso: true },
    SaleOrLeaseIndicator: { type: "Cotality.DataStandard.RESO.DD.Enums.SaleOrLeaseIndicator", nullable: true, enum: "SaleOrLeaseIndicator", multi: false, lookup: 6, filterable: true, populated: 0, rlsField: false, reso: false },
    SeatingCapacity: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    SecurityDeposit: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 161522, rlsField: true, reso: false },
    SecurityFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SecurityFeatures", nullable: true, enum: "SecurityFeatures", multi: true, lookup: 84, filterable: true, populated: 1890, rlsField: false, reso: true },
    SellerConsiderConcessionYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: false },
    SeniorCommunityYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 8, rlsField: false, reso: true },
    SerialU: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    SerialX: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    SerialXX: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Sewer: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Sewer", nullable: true, enum: "Sewer", multi: true, lookup: 55, filterable: true, populated: 0, rlsField: false, reso: true },
    ShowingAdvanceNotice: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    ShowingAttendedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: false, populated: null, rlsField: false, reso: true },
    ShowingConsiderations: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ShowingConsiderations", nullable: true, enum: "ShowingConsiderations", multi: true, lookup: 14, filterable: false, populated: null, rlsField: false, reso: false },
    ShowingContactName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1130, rlsField: false, reso: true },
    ShowingContactPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1102, rlsField: false, reso: true },
    ShowingContactPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ShowingContactType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ShowingContactType", nullable: true, enum: "ShowingContactType", multi: true, lookup: 15, filterable: true, populated: 15, rlsField: false, reso: true },
    ShowingDays: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ShowingDays", nullable: true, enum: "ShowingDays", multi: true, lookup: 7, filterable: false, populated: null, rlsField: false, reso: true },
    ShowingEndTime: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ShowingInstructions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    ShowingRequirements: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ShowingRequirements", nullable: true, enum: "ShowingRequirements", multi: true, lookup: 40, filterable: false, populated: null, rlsField: false, reso: true },
    ShowingServiceName: { type: "Cotality.DataStandard.RESO.DD.Enums.ShowingServiceName", nullable: true, enum: "ShowingServiceName", multi: false, lookup: 11, filterable: false, populated: null, rlsField: false, reso: false },
    ShowingStartTime: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    SignOnPropertyYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    Skirt: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Skirt", nullable: true, enum: "Skirt", multi: true, lookup: 25, filterable: true, populated: 0, rlsField: false, reso: true },
    SourceMlsUrl: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    SourceSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: true, reso: true },
    SpaFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SpaFeatures", nullable: true, enum: "SpaFeatures", multi: true, lookup: 24, filterable: true, populated: 5639, rlsField: true, reso: true },
    SpaYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 2208, rlsField: false, reso: true },
    SpecialLicenses: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SpecialLicenses", nullable: true, enum: "SpecialLicenses", multi: true, lookup: 19, filterable: true, populated: 0, rlsField: false, reso: true },
    SpecialListingConditions: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SpecialListingConditions", nullable: true, enum: "SpecialListingConditions", multi: true, lookup: 34, filterable: true, populated: 114397, rlsField: true, reso: true },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 591607, rlsField: true, reso: true },
    StartShowingDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    StateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: true, populated: 591604, rlsField: true, reso: true },
    StateRegion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    StatusChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591419, rlsField: true, reso: true },
    Stories: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1612, rlsField: false, reso: true },
    StoriesTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 533803, rlsField: true, reso: true },
    StreetAdditionalInfo: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 394632, rlsField: true, reso: true },
    StreetDirPrefix: { type: "Cotality.DataStandard.RESO.DD.Enums.StreetDirection", nullable: true, enum: "StreetDirection", multi: false, lookup: 10, filterable: true, populated: 266957, rlsField: true, reso: true },
    StreetDirSuffix: { type: "Cotality.DataStandard.RESO.DD.Enums.StreetDirection", nullable: true, enum: "StreetDirection", multi: false, lookup: 10, filterable: true, populated: 13415, rlsField: true, reso: true },
    StreetName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    StreetNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    StreetNumberNumeric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 561696, rlsField: true, reso: true },
    StreetSuffix: { type: "Cotality.DataStandard.RESO.DD.Enums.StreetSuffix", nullable: true, enum: "StreetSuffix", multi: false, lookup: 298, filterable: true, populated: 580305, rlsField: true, reso: true },
    StreetSuffixModifier: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    StructureType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType", nullable: true, enum: "StructureType", multi: true, lookup: 23, filterable: true, populated: 97624, rlsField: true, reso: true },
    SubAgencyCompensation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    SubAgencyCompensationType: { type: "Cotality.DataStandard.RESO.DD.Enums.CompensationType", nullable: true, enum: "CompensationType", multi: false, lookup: 5, filterable: false, populated: null, rlsField: false, reso: true },
    SubdivisionName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    SuppliesExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: true, populated: 0, rlsField: false, reso: true },
    SyndicationRemarks: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    TaxAnnualAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 97625, rlsField: true, reso: true },
    TaxAssessedValue: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxBlock: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    TaxBookNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxLegalDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxLot: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 266897, rlsField: true, reso: true },
    TaxMapNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxOtherAnnualAssessmentAmount: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxParcelLetter: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxStatusCurrent: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.TaxStatusCurrent", nullable: true, enum: "TaxStatusCurrent", multi: true, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxTract: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TaxYear: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TenantPays: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.TenantPays", nullable: true, enum: "TenantPays", multi: true, lookup: 61, filterable: true, populated: 261, rlsField: false, reso: true },
    TenantPaysDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 276, rlsField: false, reso: false },
    Topography: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 26, filterable: true, populated: 0, rlsField: false, reso: true },
    TotalActualRent: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TotalFloorPlansCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    Township: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    TransactionBrokerCompensation: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    TransactionBrokerCompensationType: { type: "Cotality.DataStandard.RESO.DD.Enums.CompensationType", nullable: true, enum: "CompensationType", multi: false, lookup: 5, filterable: false, populated: null, rlsField: false, reso: true },
    TrashExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    UnitNumber: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 582428, rlsField: true, reso: true },
    UnitTypeType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.UnitTypeType", nullable: true, enum: "UnitTypeType", multi: true, lookup: 22, filterable: true, populated: 148, rlsField: false, reso: true },
    UnitsFurnished: { type: "Cotality.DataStandard.RESO.DD.Enums.UnitsFurnished", nullable: true, enum: "UnitsFurnished", multi: false, lookup: 7, filterable: true, populated: 0, rlsField: false, reso: true },
    UniversalParcelId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 545161, rlsField: false, reso: false },
    UniversalPropertyId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 380699, rlsField: false, reso: true },
    UniversalPropertySubId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    UnparsedAddress: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 591607, rlsField: true, reso: true },
    Utilities: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Utilities", nullable: true, enum: "Utilities", multi: true, lookup: 41, filterable: true, populated: 0, rlsField: false, reso: true },
    UtilitiesExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    VacancyAllowance: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    VacancyAllowanceRate: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Vegetation: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Vegetation", nullable: true, enum: "Vegetation", multi: true, lookup: 19, filterable: false, populated: null, rlsField: false, reso: true },
    VideosChangeTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 329062, rlsField: true, reso: true },
    VideosCount: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 485075, rlsField: false, reso: true },
    View: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.View", nullable: true, enum: "View", multi: true, lookup: 85, filterable: true, populated: 138934, rlsField: true, reso: true },
    ViewYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 163138, rlsField: true, reso: true },
    VirtualTourURLBranded: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 13879, rlsField: true, reso: true },
    VirtualTourURLBranded2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    VirtualTourURLBranded3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    VirtualTourURLUnbranded: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 26372, rlsField: true, reso: true },
    VirtualTourURLUnbranded2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 2382, rlsField: false, reso: false },
    VirtualTourURLUnbranded3: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 354, rlsField: false, reso: false },
    WalkScore: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    WaterBodyName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    WaterHeater: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.WaterHeater", nullable: true, enum: "WaterHeater", multi: true, lookup: 25, filterable: true, populated: 0, rlsField: false, reso: false },
    WaterSewerExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 10392, rlsField: false, reso: true },
    WaterSource: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.WaterSource", nullable: true, enum: "WaterSource", multi: true, lookup: 39, filterable: true, populated: 0, rlsField: false, reso: true },
    WaterfrontFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.WaterfrontFeatures", nullable: true, enum: "WaterfrontFeatures", multi: true, lookup: 77, filterable: true, populated: 5, rlsField: false, reso: true },
    WaterfrontYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 98, rlsField: false, reso: true },
    WindowFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.WindowFeatures", nullable: true, enum: "WindowFeatures", multi: true, lookup: 55, filterable: true, populated: 15977, rlsField: true, reso: true },
    WithdrawnDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 22, rlsField: true, reso: true },
    WoodedArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    WorkmansCompensationExpense: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 8, rlsField: false, reso: true },
    X_GeocodeSource: { type: "Cotality.DataStandard.RESO.DD.Enums.GeocodeSource", nullable: true, enum: "GeocodeSource", multi: false, lookup: 10, filterable: false, populated: null, rlsField: true, reso: false },
    YearBuilt: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 485638, rlsField: true, reso: true },
    YearBuiltDetails: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    YearBuiltEffective: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    YearBuiltSource: { type: "Cotality.DataStandard.RESO.DD.Enums.YearBuiltSource", nullable: true, enum: "YearBuiltSource", multi: false, lookup: 8, filterable: true, populated: 0, rlsField: false, reso: true },
    YearEstablished: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    YearsCurrentOwner: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    Zoning: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    ZoningDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 27455, rlsField: true, reso: true },
  } satisfies Record<keyof CotalityProperty, CotalityFieldFact>,
  PropertyGreenVerification: {
    GreenBuildingVerificationKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenBuildingVerificationKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenBuildingVerificationType: { type: "Cotality.DataStandard.RESO.DD.Enums.GreenBuildingVerificationType", nullable: true, enum: "GreenBuildingVerificationType", multi: false, lookup: 29, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationBody: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationMetric: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationRating: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationSource: { type: "Cotality.DataStandard.RESO.DD.Enums.GreenVerificationSource", nullable: true, enum: "GreenVerificationSource", multi: false, lookup: 10, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.GreenVerificationStatus", nullable: true, enum: "GreenVerificationStatus", multi: false, lookup: 4, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationURL: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationVersion: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    GreenVerificationYear: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    InputEntryOrder: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: null, populated: null, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: null, populated: null, rlsField: false, reso: false },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ListingPermission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: null, populated: null, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginalEntryTimestamp: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemGreenBuildingVerificationKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: null, populated: null, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: null, populated: null, rlsField: false, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: null, populated: null, rlsField: false, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: null, populated: null, rlsField: false, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: null, populated: null, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: null, populated: null, rlsField: false, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: null, populated: null, rlsField: false, reso: false },
  } satisfies Record<keyof CotalityPropertyGreenVerification, CotalityFieldFact>,
  PropertyRooms: {
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    InputEntryOrder: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 86, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: false },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: true },
    ListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: true },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: false },
    ListingPermission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: true, populated: 86, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 81, rlsField: false, reso: false },
    OriginatingSystemListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: false, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 86, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: false, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 86, rlsField: false, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 21, rlsField: false, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 86, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    RoomArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 44, rlsField: false, reso: true },
    RoomAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 44, rlsField: false, reso: true },
    RoomAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 44, rlsField: false, reso: true },
    RoomDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    RoomDimensions: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomFeatures: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.InteriorOrRoomFeatures", nullable: true, enum: "InteriorOrRoomFeatures", multi: true, lookup: 303, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomFlooring: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.Flooring", nullable: true, enum: "Flooring", multi: true, lookup: 62, filterable: true, populated: 0, rlsField: false, reso: false },
    RoomKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: true },
    RoomKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: false },
    RoomLength: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomLengthWidthSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomLengthWidthUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.LinearUnits", nullable: true, enum: "LinearUnits", multi: false, lookup: 4, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomLevel: { type: "Cotality.DataStandard.RESO.DD.Enums.RoomLevel", nullable: true, enum: "RoomLevel", multi: false, lookup: 15, filterable: true, populated: 0, rlsField: false, reso: true },
    RoomType: { type: "Cotality.DataStandard.RESO.DD.Enums.RoomType", nullable: true, enum: "RoomType", multi: false, lookup: 122, filterable: true, populated: 74, rlsField: false, reso: true },
    RoomWidth: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 86, rlsField: true, reso: false },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 86, rlsField: false, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: true, populated: 0, rlsField: false, reso: false },
  } satisfies Record<keyof CotalityPropertyRooms, CotalityFieldFact>,
  PropertyUnitTypes: {
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    InputEntryOrder: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: false },
    InternetEntireListingDisplayYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 1, rlsField: false, reso: false },
    ListAOR: { type: "Cotality.DataStandard.RESO.DD.Enums.AOR", nullable: true, enum: "AOR", multi: false, lookup: 1127, filterable: true, populated: 0, rlsField: false, reso: false },
    ListAgentKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    ListOfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    ListOfficeMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    ListingId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: true },
    ListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: true },
    ListingKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: false },
    ListingPermission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: true, populated: 1, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    OffMarketDate: { type: "Edm.Date", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    OriginatingSystemListingKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 880, filterable: true, populated: 1, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: false, populated: null, rlsField: false, reso: false },
    PropertySubType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertySubType", nullable: true, enum: "PropertySubType", multi: false, lookup: 76, filterable: true, populated: 1, rlsField: false, reso: false },
    PropertySubTypeAdditional: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.PropertySubTypeAdditional", nullable: true, enum: "PropertySubTypeAdditional", multi: true, lookup: 76, filterable: true, populated: 0, rlsField: false, reso: false },
    PropertyType: { type: "Cotality.DataStandard.RESO.DD.Enums.PropertyType", nullable: true, enum: "PropertyType", multi: false, lookup: 13, filterable: true, populated: 1, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: false, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: false },
    StandardStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.StandardStatus", nullable: true, enum: "StandardStatus", multi: false, lookup: 11, filterable: true, populated: 1, rlsField: false, reso: false },
    SyndicateTo: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.SyndicateTo", nullable: true, enum: "SyndicateTo", multi: true, lookup: 28, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeActualRent: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeActualRentRange: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeArea: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeAreaSource: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaSource", nullable: true, enum: "AreaSource", multi: false, lookup: 18, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeAreaUnits: { type: "Cotality.DataStandard.RESO.DD.Enums.AreaUnits", nullable: true, enum: "AreaUnits", multi: false, lookup: 3, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeBathsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeBedsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeDeposit: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: true },
    UnitTypeFireplaceYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeFurnished: { type: "Cotality.DataStandard.RESO.DD.Enums.Furnished", nullable: true, enum: "Furnished", multi: false, lookup: 5, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeGarageAttachedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeGarageSpaces: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: true },
    UnitTypeKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 1, rlsField: true, reso: false },
    UnitTypeLeaseExpires: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: false, populated: null, rlsField: false, reso: false },
    UnitTypeLeasedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeMonthToMonthYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeNumFullBaths: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeNumHalfBaths: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeOccupantType: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.UnitTypeOccupantType", nullable: true, enum: "UnitTypeOccupantType", multi: true, lookup: 7, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypePetDeposit: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypePetDepositPerPetYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: 2, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeProForma: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeTotalRent: { type: "Edm.Decimal", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeType: { type: "Cotality.DataStandard.RESO.DD.Enums.UnitTypeType", nullable: true, enum: "UnitTypeType", multi: false, lookup: 22, filterable: true, populated: 0, rlsField: false, reso: true },
    UnitTypeUnitNum: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: false },
    UnitTypeUnitsTotal: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: true, populated: 0, rlsField: false, reso: true },
  } satisfies Record<keyof CotalityPropertyUnitTypes, CotalityFieldFact>,
  TeamMembers: {
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    MemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    MemberKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    MemberLoginId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    MemberMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    MemberStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.MemberStatus", nullable: true, enum: "MemberStatus", multi: false, lookup: 3, filterable: null, populated: null, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemMemberKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 34, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemTeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: null, populated: null, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    SourceSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    StandardName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    TeamImpersonationLevel: { type: "Cotality.DataStandard.RESO.DD.Enums.TeamImpersonationLevel", nullable: true, enum: "TeamImpersonationLevel", multi: false, lookup: 2, filterable: null, populated: null, rlsField: false, reso: true },
    TeamKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    TeamMemberKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamMemberKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    TeamMemberNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamMemberStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamMemberType: { type: "Cotality.DataStandard.RESO.DD.Enums.TeamMemberType", nullable: true, enum: "TeamMemberType", multi: false, lookup: 11, filterable: null, populated: null, rlsField: false, reso: true },
  } satisfies Record<keyof CotalityTeamMembers, CotalityFieldFact>,
  Teams: {
    HumanModifiedYN: { type: "Edm.Boolean", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    ModificationTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OfficeKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    OriginalEntryTimestamp: { type: "Edm.DateTimeOffset", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    OriginatingSystemSubName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 34, filterable: null, populated: null, rlsField: false, reso: false },
    OriginatingSystemTeamLeadKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    Permission: { type: "Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission", nullable: true, enum: "ListingPermission", multi: true, lookup: 18, filterable: null, populated: null, rlsField: false, reso: false },
    RecordSignature: { type: "Edm.Int32", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    SocialMediaType: { type: "Cotality.DataStandard.RESO.DD.Enums.SocialMediaType", nullable: true, enum: "SocialMediaType", multi: false, lookup: 17, filterable: null, populated: null, rlsField: false, reso: true },
    SocialMediaTypeUrl: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    SourceSystemID: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    SourceSystemKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    SourceSystemName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamAddress1: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamAddress2: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamCarrierRoute: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamCity: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamCountry: { type: "Cotality.DataStandard.RESO.DD.Enums.Country", nullable: true, enum: "Country", multi: false, lookup: 246, filterable: null, populated: null, rlsField: false, reso: true },
    TeamCountyOrParish: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: 4423, filterable: null, populated: null, rlsField: false, reso: true },
    TeamDescription: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamDirectPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamEmail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamFax: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamKey: { type: "Edm.String", nullable: false, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    TeamLeadKey: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamLeadKeyNumeric: { type: "Edm.Int64", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: false },
    TeamLeadLoginId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamLeadMlsId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamLeadNationalAssociationId: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamLeadStateLicense: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamLeadStateLicenseState: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: null, populated: null, rlsField: false, reso: true },
    TeamMobilePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamName: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamOfficePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamOfficePhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamPostalCode: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamPostalCodePlus4: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamPreferredPhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamPreferredPhoneExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamStateOrProvince: { type: "Cotality.DataStandard.RESO.DD.Enums.StateOrProvince", nullable: true, enum: "StateOrProvince", multi: false, lookup: 100, filterable: null, populated: null, rlsField: false, reso: true },
    TeamStatus: { type: "Cotality.DataStandard.RESO.DD.Enums.TeamStatus", nullable: true, enum: "TeamStatus", multi: false, lookup: 2, filterable: null, populated: null, rlsField: false, reso: true },
    TeamTollFreePhone: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamVoiceMail: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
    TeamVoiceMailExt: { type: "Edm.String", nullable: true, enum: null, multi: false, lookup: null, filterable: null, populated: null, rlsField: false, reso: true },
  } satisfies Record<keyof CotalityTeams, CotalityFieldFact>,
} as const;

