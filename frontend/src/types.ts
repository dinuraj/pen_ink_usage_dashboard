export interface ActivePairingSummary {
  session_id: number;
  ink_id: number;
  ink_brand: string;
  ink_name: string;
  ink_hex: string;
  date_inked: string;
  days_inked: number;
  refill_count: number;
}

export interface PenOut {
  id: number;
  brand: string;
  model: string;
  color_variant: string;
  nib_size: string;
  nib_material: string;
  filling_mechanism: string;
  status: string;
  tags: string[];
  rating: number | null;
  primary_photo_url: string | null;
  custom_notes: string;
  is_currently_inked: boolean;
  active_pairing: ActivePairingSummary | null;
  times_inked: number;
  total_refills: number;
  total_days_inked: number;
  avg_days_inked: number;
  last_used_date: string | null;
  last_cleaned_date: string | null;
  sample_count: number;
}

export interface PenBrief {
  id: number;
  brand: string;
  model: string;
  color_variant: string;
  nib_size: string;
  nib_material: string;
  filling_mechanism: string;
  tags?: string[];
  primary_photo_url: string | null;
}

export interface InkOut {
  id: number;
  brand: string;
  name: string;
  color_family: string;
  hex_color: string;
  format: 'bottle' | 'sample_vial' | 'cartridge' | string;
  volume_ml: number;
  remaining_level: 'full' | '75_pct' | 'half' | 'low' | 'empty' | string;
  quantity: number;
  rating: number | null;
  mountain_of_ink_url: string;
  properties_tags: string;
  custom_notes: string;
  currently_in_pens_count: number;
  times_inked: number;
  total_refills: number;
  distinct_pens_count: number;
  total_days_inked: number;
  last_used_date: string | null;
  sample_count: number;
}

export interface InkBrief {
  id: number;
  brand: string;
  name: string;
  color_family: string;
  hex_color: string;
  format: string;
  remaining_level: string;
  mountain_of_ink_url: string;
}

export interface LifecycleEventOut {
  id: number;
  session_id: number;
  event_type: 'inked' | 'refilled' | 'cleaned' | 'emptied' | string;
  event_date: string;
  source: string;
  notes: string;
}

export interface WritingSampleOut {
  id: number;
  session_id: number | null;
  pen_id: number;
  ink_id: number;
  scan_page_id: number | null;
  scan_batch_id: number | null;
  scan_page_number: number | null;
  image_url: string;
  crop_box_json: string;
  sample_date: string;
  transcription: string;
  caption: string;
  pen: PenBrief;
  ink: InkBrief;
}

export interface SessionOut {
  id: number;
  pen_id: number;
  ink_id: number;
  date_inked: string;
  date_cleaned: string | null;
  end_status: 'active' | 'cleaned' | 'emptied' | string;
  days_active: number;
  refill_count: number;
  session_notes: string;
  pen: PenBrief;
  ink: InkBrief;
  events: LifecycleEventOut[];
  samples: WritingSampleOut[];
}

export interface PenPhotoOut {
  id: number;
  url: string;
  caption: string;
  created_at: string;
}

export interface PenMergeRecordOut {
  id: number;
  target_pen_id: number;
  source_label: string;
  source_brand: string;
  source_model: string;
  source_color_variant: string;
  source_nib_size: string;
  moved_sessions_count: number;
  moved_samples_count: number;
  created_at: string;
}

export interface PenDetailResponse {
  pen: PenOut;
  photos: PenPhotoOut[];
  favorite_ink: { id: number; name: string; hex_color: string; count: number } | null;
  sessions: SessionOut[];
  samples: WritingSampleOut[];
  merge_history: PenMergeRecordOut[];
}

export interface InkDetailResponse {
  ink: InkOut;
  favorite_pen: { id: number; name: string; nib_size: string; count: number } | null;
  sessions: SessionOut[];
  samples: WritingSampleOut[];
}

export interface CurrentlyInkedRow {
  session_id: number;
  pen_id: number;
  pen_brand: string;
  pen_model: string;
  pen_color: string;
  nib_size: string;
  filling_mechanism: string;
  ink_id: number;
  ink_brand: string;
  ink_name: string;
  ink_hex: string;
  ink_color_family: string;
  date_inked: string;
  days_inked: number;
  aging: 'fresh' | 'moderate' | 'attention';
  refill_count: number;
  sample_url: string | null;
  session_notes: string;
}

export interface DashboardAnalytics {
  kpis: {
    total_pens: number;
    active_collection_pens: number;
    currently_inked_count: number;
    rotation_pct: number;
    total_inks: number;
    bottles_count: number;
    samples_vial_count: number;
    cartridges_count: number;
    low_or_empty_inks: number;
    total_sessions: number;
    ytd_sessions: number;
    total_refills: number;
    total_cleanings: number;
    total_writing_samples: number;
    avg_fill_days: number;
    due_for_flush_count: number;
  };
  currently_inked: CurrentlyInkedRow[];
  monthly_activity: Array<{
    month: string;
    label: string;
    inked: number;
    refilled: number;
    cleaned: number;
  }>;
  top_pens: Array<{
    id: number;
    label: string;
    brand: string;
    model: string;
    color_variant: string;
    nib_size: string;
    times_inked: number;
    total_refills: number;
    total_fills: number;
    total_days_inked: number;
    is_currently_inked: boolean;
    last_used_date: string | null;
    days_since_used: number | null;
  }>;
  top_inks: Array<{
    id: number;
    label: string;
    brand: string;
    name: string;
    hex_color: string;
    color_family: string;
    format: string;
    remaining_level: string;
    times_inked: number;
    total_refills: number;
    total_fills: number;
    total_days_inked: number;
    in_rotation: boolean;
    last_used_date: string | null;
    days_since_used: number | null;
  }>;
  color_distribution: Array<{
    color_family: string;
    hex: string;
    inventory_count: number;
    usage_fills: number;
  }>;
  nib_distribution: Array<{
    nib_size: string;
    pens: number;
    fills: number;
  }>;
  filling_distribution: Array<{
    mechanism: string;
    count: number;
  }>;
  neglected_pens: Array<{
    id: number;
    label: string;
    nib_size: string;
    times_inked: number;
    days_since_used: number | null;
  }>;
  neglected_inks: Array<{
    id: number;
    label: string;
    hex_color: string;
    remaining_level: string;
    times_inked: number;
    days_since_used: number | null;
  }>;
  recent_events: Array<{
    id: number;
    event_type: string;
    event_date: string;
    source: string;
    notes: string;
    pen_id: number;
    pen_label: string;
    nib_size: string;
    ink_id: number;
    ink_label: string;
    ink_hex: string;
  }>;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtractedEntryCandidate {
  entry_uid: string;
  page_id: number;
  page_number: number;
  date_inked: string;
  raw_pen_text: string;
  pen_brand: string;
  pen_model: string;
  pen_color: string;
  nib_size: string;
  matched_pen_id: number | null;
  pen_match_confidence: number;
  raw_ink_text: string;
  ink_brand: string;
  ink_name: string;
  suggested_hex: string;
  suggested_color_family: string;
  matched_ink_id: number | null;
  ink_match_confidence: number;
  transcription: string;
  crop_box: CropBox;
  is_duplicate: boolean;
  skip: boolean;
}

export interface ImportedPageEntryOut {
  sample_id: number;
  session_id: number | null;
  page_id: number;
  page_number: number;
  pen_id: number;
  ink_id: number;
  sample_date: string;
  date_cleaned: string | null;
  end_status: 'active' | 'cleaned' | 'emptied' | string;
  image_url: string;
  crop_box: CropBox;
  transcription: string;
  caption: string;
  session_notes: string;
  pen: PenBrief;
  ink: InkBrief;
}

export interface ScanPageOut {
  id: number;
  batch_id: number;
  page_number: number;
  image_url: string;
  width_px: number;
  height_px: number;
  processed: boolean;
  candidates: ExtractedEntryCandidate[];
  imported_entries: ImportedPageEntryOut[];
}

export interface ScanBatchOut {
  id: number;
  original_filename: string;
  pdf_url: string;
  page_count: number;
  status: string;
  is_demo: boolean;
  uploaded_at: string;
  pages: ScanPageOut[];
}

export interface NotebookOut {
  id: number;
  brand: string;
  name: string;
  page_count: number | null;
  binding_type: string;
  size: string;
  ruling: string;
  paper_type: string;
  paper_gsm: number | null;
  usage_type: string;
  status: 'in_use' | 'stash' | 'finished' | string;
  start_date: string | null;
  end_date: string | null;
  completion_pct: number;
  rating: number | null;
  custom_notes: string;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsStatus {
  gemini_configured: boolean;
  gemini_key_masked: string;
  from_env: boolean;
  gemini_model: string;
  storage_backend: string;
  counts: {
    pens: number;
    inks: number;
    notebooks?: number;
    sessions: number;
    samples: number;
    scans: number;
  };
}

export interface BackupRecord {
  filename: string;
  path?: string;
  relative_path?: string;
  download_url?: string;
  version: number;
  trigger: string;
  created_at?: string;
  timestamp?: string;
  created_at_formatted?: string;
  size_bytes: number;
  pens_count?: number;
  inks_count?: number;
  sessions_count?: number;
  samples_count?: number;
  counts?: {
    pens: number;
    inks: number;
    notebooks: number;
    sessions: number;
    samples: number;
    scans: number;
  };
}

export interface SyncStatus {
  is_cloud?: boolean;
  cloud_configured: boolean;
  cloud_connected: boolean;
  connection_error?: string | null;
  last_push?: string | null;
  last_pull?: string | null;
  backups_count: number;
  recent_backups: BackupRecord[];
}

export interface SyncResult {
  status: string;
  backup: BackupRecord;
  synced_tables?: Record<string, number>;
  uploaded_media_count?: number;
  message: string;
}

export interface AuthStatus {
  is_admin: boolean;
  auth_enabled: boolean;
}

