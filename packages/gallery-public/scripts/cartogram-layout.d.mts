import type { Country } from '../../gallery-core/src/countries.ts';
export const STEP: number;
export const COLS: number;
export const ROWS: number;
export function buildCartogram(countries: Country[]): {owners: Map<number, string>};
