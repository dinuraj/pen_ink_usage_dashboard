import type { RatingFilterValue } from '../components/FilterSortControls';

export type PenSortKey =
  | 'brand'
  | 'model'
  | 'color_variant'
  | 'tags'
  | 'rating'
  | 'nib_size'
  | 'nib_material'
  | 'filling_mechanism'
  | 'status_ink'
  | 'times_inked'
  | 'total_refills'
  | 'total_days_inked'
  | 'last_cleaned_date'
  | 'sample_count';

export interface PenCabinetState {
  companyFilter: string;
  companyExact: boolean;
  nameQuery: string;
  tagFilters: string[];
  tagMatchMode: 'any' | 'all';
  ratingFilter: RatingFilterValue;
  statusFilter: 'all' | 'inked' | 'clean';
  nibFilter: string;
  mechanismFilter: string;
  sortKey: PenSortKey;
  sortDir: 'asc' | 'desc';
  viewMode: 'table' | 'grid';
  scrollY: number;
  filteredPenIds: number[];
}

export type InkSortKey =
  | 'brand'
  | 'name'
  | 'rating'
  | 'color_family'
  | 'format'
  | 'volume_ml'
  | 'remaining_level'
  | 'total_fills'
  | 'total_days_inked'
  | 'has_review';

export interface InkLibraryState {
  companyFilter: string;
  companyExact: boolean;
  nameQuery: string;
  colorFilter: string;
  ratingFilter: RatingFilterValue;
  formatFilter: string;
  levelFilter: string;
  sortKey: InkSortKey;
  sortDir: 'asc' | 'desc';
  viewMode: 'table' | 'swatches';
  scrollY: number;
  filteredInkIds: number[];
}

const PEN_STATE_KEY = 'pen_cabinet_state_v1';
const INK_STATE_KEY = 'ink_library_state_v1';

const defaultPenState: PenCabinetState = {
  companyFilter: '',
  companyExact: false,
  nameQuery: '',
  tagFilters: [],
  tagMatchMode: 'any',
  ratingFilter: 'all',
  statusFilter: 'all',
  nibFilter: 'all',
  mechanismFilter: 'all',
  sortKey: 'brand',
  sortDir: 'asc',
  viewMode: 'table',
  scrollY: 0,
  filteredPenIds: [],
};

const defaultInkState: InkLibraryState = {
  companyFilter: '',
  companyExact: false,
  nameQuery: '',
  colorFilter: 'all',
  ratingFilter: 'all',
  formatFilter: 'all',
  levelFilter: 'all',
  sortKey: 'brand',
  sortDir: 'asc',
  viewMode: 'table',
  scrollY: 0,
  filteredInkIds: [],
};

// In-memory cache for fast lookups
let inMemoryPenState: PenCabinetState | null = null;
let inMemoryInkState: InkLibraryState | null = null;

export function getPenCabinetState(): PenCabinetState {
  if (inMemoryPenState) return inMemoryPenState;
  try {
    const raw = sessionStorage.getItem(PEN_STATE_KEY);
    if (raw) {
      inMemoryPenState = { ...defaultPenState, ...JSON.parse(raw) };
      return inMemoryPenState!;
    }
  } catch (err) {
    console.warn('Could not read pen cabinet state from sessionStorage:', err);
  }
  inMemoryPenState = { ...defaultPenState };
  return inMemoryPenState;
}

export function savePenCabinetState(state: Partial<PenCabinetState>): void {
  const current = getPenCabinetState();
  const merged: PenCabinetState = { ...current, ...state };
  inMemoryPenState = merged;
  try {
    sessionStorage.setItem(PEN_STATE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Could not write pen cabinet state to sessionStorage:', err);
  }
}

export function getInkLibraryState(): InkLibraryState {
  if (inMemoryInkState) return inMemoryInkState;
  try {
    const raw = sessionStorage.getItem(INK_STATE_KEY);
    if (raw) {
      inMemoryInkState = { ...defaultInkState, ...JSON.parse(raw) };
      return inMemoryInkState!;
    }
  } catch (err) {
    console.warn('Could not read ink library state from sessionStorage:', err);
  }
  inMemoryInkState = { ...defaultInkState };
  return inMemoryInkState;
}

export function saveInkLibraryState(state: Partial<InkLibraryState>): void {
  const current = getInkLibraryState();
  const merged: InkLibraryState = { ...current, ...state };
  inMemoryInkState = merged;
  try {
    sessionStorage.setItem(INK_STATE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Could not write ink library state to sessionStorage:', err);
  }
}
