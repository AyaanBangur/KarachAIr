import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export interface LstInfo {
  day: number;                 // hot-season afternoon land-surface temperature, °C (area-weighted unit mean)
  night: number;               // hot-season night-time LST, °C
  dayP90: number | null;       // 90th-percentile 1 km pixel inside the unit
  dayHottestPixel: number | null;
  dayPopWeighted: number | null; // LST experienced by the average resident (population-weighted)
  peak8Day: { value: number; date: string } | null; // hottest 8-day composite (unit mean)
  byYear: Record<string, number | null>;
  coverage: number;            // share of unit area with valid satellite observations
  meanComposites: number;      // mean valid composites per pixel
  nPixels: number;
}
export interface AirInfo { hotSeasonTmax: number; hotSeasonTmin: number; days40PerYear: number | null; maxTmax: number; gridLat: number; gridLon: number }
export interface InfraInfo {
  hospitals: number; clinics: number; healthFacilities: number; healthPer100k: number | null;
  drinkingWater: number; greenKm2: number; greenShare: number; greenM2PerPerson: number | null;
}
export interface UnitProps {
  id: string; name: string; short: string; type: 'town' | 'cantonment';
  areaKm2: number; centroid: [number, number];
  population: number | null; popDensity: number | null;
  lst: LstInfo | null; ndvi: number | null; air: AirInfo | null; infra: InfraInfo | null;
}
export type UnitFeature = Feature<Polygon | MultiPolygon, UnitProps>;
export type UnitCollection = FeatureCollection<Polygon | MultiPolygon, UnitProps>;

export interface GridRaster {
  west: number; north: number; step?: number; dx?: number; dy?: number;
  cols: number; rows: number; scale?: number; nodata?: number; values: number[];
}
export interface Rasters { lstDay?: GridRaster; lstNight?: GridRaster; ndvi?: GridRaster; pop?: GridRaster }

export interface Facility { lat: number; lon: number; name: string; kind: 'hospital' | 'clinic' }

export interface SourceInfo { id: string; name: string; provider: string; license: string; url: string; detail?: string; limits?: string }

export interface Regression { n: number; slopePerNdvi: number; slopePer0p1Ndvi: number; intercept: number; r2: number; se: number; ci95Per0p1: number; popDensityMin: number }

export interface ClimateYear {
  year: number; complete: boolean; meanTmax: number; meanTmin: number | null; hotSeasonTmax: number | null;
  days40: number; daysAboveP95: number; maxTmax: number; anomaly: number | null;
}
export interface ProfileRow { md: string; normal: number; p10: number; p90: number; [k: string]: number | string | null }
export interface ClimateCity {
  lat: number; lon: number; gridLat: number; gridLon: number; start: string; end: string; baseline: [number, number];
  baselineMeanTmax: number; p95Tmax: number; distinctGridCells: number;
  trend: { from: number; to: number; annualMeanTmaxPerDecade: number; annualCi95: number; annualR2: number; hotSeasonTmaxPerDecade: number; hotSeasonCi95: number; hotSeasonR2: number };
}
export interface ClimateFile { city: ClimateCity; years: ClimateYear[]; profile: ProfileRow[]; pickYears: number[] }

export interface MetaFile {
  generatedAt: string; bbox: [number, number, number, number]; unitCount: number;
  totalPopulation: number | null; medianPopulation: number | null;
  lst: { lstDayRange: [number, number]; lstNightRange: [number, number]; medianViewTimeDay: number | null; composites: number; ndviComposites: number; seasons: number[]; regression: Regression } | null;
  exposure: { lst: number; people: number }[];
  climateCity: ClimateCity | null;
  sources: SourceInfo[];
}

export interface TerraData {
  units: UnitFeature[];
  collection: UnitCollection;
  rasters: Rasters;
  facilities: Facility[];
  climate: ClimateFile | null;
  meta: MetaFile;
}
