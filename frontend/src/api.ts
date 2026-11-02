import type {
  AppSettingsStatus,
  AuthStatus,
  BackupRecord,
  CropBox,
  DashboardAnalytics,
  InkDetailResponse,
  InkOut,
  NotebookOut,
  PenDetailResponse,
  PenOut,
  ScanBatchOut,
  SessionOut,
  SyncResult,
  SyncStatus,
  WritingSampleOut,
} from './types';

const ADMIN_TOKEN_KEY = 'atelier_admin_token';

export function getStoredAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {}
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredAdminToken();
  const baseHeaders: Record<string, string> = {};
  if (!(init?.body instanceof FormData)) {
    baseHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    baseHeaders['X-Admin-Token'] = token;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...baseHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getDashboard: () => requestJson<DashboardAnalytics>('/api/analytics/dashboard'),

  // Pens
  listPens: () => requestJson<PenOut[]>('/api/pens'),
  getPenDetail: (id: number) => requestJson<PenDetailResponse>(`/api/pens/${id}`),
  createPen: (data: Partial<PenOut>) =>
    requestJson<PenOut>('/api/pens', { method: 'POST', body: JSON.stringify(data) }),
  updatePen: (id: number, data: Partial<PenOut>) =>
    requestJson<PenOut>(`/api/pens/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePen: (id: number) => requestJson<{ status: string }>(`/api/pens/${id}`, { method: 'DELETE' }),
  mergePen: (sourceId: number, targetId: number) =>
    requestJson<PenOut>(`/api/pens/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId }),
    }),
  mergePensBulk: (payload: {
    target_pen_id: number;
    source_pen_ids: number[];
    updated_target?: Partial<PenOut>;
  }) =>
    requestJson<PenOut>('/api/pens/merge-bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  undoPenMerge: (mergeId: number) =>
    requestJson<{ restored_pen: PenOut; target_pen: PenOut }>(`/api/pens/merges/${mergeId}/undo`, {
      method: 'POST',
    }),
  splitPenSessions: (
    penId: number,
    payload: {
      session_ids: number[];
      standalone_sample_ids?: number[];
      target_pen_id?: number | null;
      new_pen?: Partial<PenOut> | null;
    },
  ) =>
    requestJson<{ destination_pen: PenOut; source_pen: PenOut }>(`/api/pens/${penId}/split`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadPenPhoto: (penId: number, file: File, caption = '') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('caption', caption);
    fd.append('set_primary', 'true');
    return requestJson<{ id: number; url: string; primary_photo_url: string }>(
      `/api/pens/${penId}/photos`,
      { method: 'POST', body: fd },
    );
  },

  // Inks
  listInks: () => requestJson<InkOut[]>('/api/inks'),
  getInkDetail: (id: number) => requestJson<InkDetailResponse>(`/api/inks/${id}`),
  createInk: (data: Partial<InkOut>) =>
    requestJson<InkOut>('/api/inks', { method: 'POST', body: JSON.stringify(data) }),
  updateInk: (id: number, data: Partial<InkOut>) =>
    requestJson<InkOut>(`/api/inks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInk: (id: number) => requestJson<{ status: string }>(`/api/inks/${id}`, { method: 'DELETE' }),
  mergeInk: (sourceId: number, targetId: number) =>
    requestJson<InkOut>(`/api/inks/${sourceId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId }),
    }),

  // Notebooks
  listNotebooks: () => requestJson<NotebookOut[]>('/api/notebooks'),
  createNotebook: (data: Partial<NotebookOut>) =>
    requestJson<NotebookOut>('/api/notebooks', { method: 'POST', body: JSON.stringify(data) }),
  updateNotebook: (id: number, data: Partial<NotebookOut>) =>
    requestJson<NotebookOut>(`/api/notebooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteNotebook: (id: number) =>
    requestJson<{ status: string }>(`/api/notebooks/${id}`, { method: 'DELETE' }),

  // Usage Sessions & Lifecycle
  listSessions: (params?: { status?: string; pen_id?: number; ink_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.pen_id) qs.set('pen_id', String(params.pen_id));
    if (params?.ink_id) qs.set('ink_id', String(params.ink_id));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson<SessionOut[]>(`/api/sessions${suffix}`);
  },
  createSession: (data: {
    pen_id: number;
    ink_id: number;
    date_inked: string;
    date_cleaned?: string | null;
    end_status?: 'active' | 'cleaned' | 'emptied';
    session_notes?: string;
    close_previous_active?: boolean;
  }) => requestJson<SessionOut>('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),

  refillSession: (sessionId: number, event_date: string, notes = '') =>
    requestJson<SessionOut>(`/api/sessions/${sessionId}/refill`, {
      method: 'POST',
      body: JSON.stringify({ event_date, notes }),
    }),

  cleanSession: (
    sessionId: number,
    event_date: string,
    end_status: 'cleaned' | 'emptied' = 'cleaned',
    notes = '',
  ) =>
    requestJson<SessionOut>(`/api/sessions/${sessionId}/clean`, {
      method: 'POST',
      body: JSON.stringify({ event_date, end_status, notes }),
    }),

  reopenSession: (sessionId: number) =>
    requestJson<SessionOut>(`/api/sessions/${sessionId}/reopen`, { method: 'POST' }),

  updateSession: (
    sessionId: number,
    data: {
      pen_id?: number;
      ink_id?: number;
      date_inked?: string;
      date_cleaned?: string | null;
      end_status?: 'active' | 'cleaned' | 'emptied';
      session_notes?: string;
    },
  ) =>
    requestJson<SessionOut>(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSession: (sessionId: number) =>
    requestJson<{ status: string }>(`/api/sessions/${sessionId}`, { method: 'DELETE' }),

  // Scans & Vision Studio
  listScans: () => requestJson<ScanBatchOut[]>('/api/scans'),
  getScan: (batchId: number) => requestJson<ScanBatchOut>(`/api/scans/${batchId}`),
  uploadScan: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return requestJson<ScanBatchOut>('/api/scans/upload', { method: 'POST', body: fd });
  },
  analyzeScan: (batchId: number, pageNumbers?: number[]) =>
    requestJson<{ mode_used: string; batch: ScanBatchOut }>(`/api/scans/${batchId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ page_numbers: pageNumbers ?? null }),
    }),
  samplePageInkColor: (pageId: number, box: CropBox) =>
    requestJson<{ hex_color: string; color_family: string }>(
      `/api/scans/pages/${pageId}/sample-color`,
      { method: 'POST', body: JSON.stringify(box) },
    ),
  addEntryOnScanPage: (
    pageId: number,
    payload: {
      date_inked: string;
      date_cleaned?: string | null;
      pen_id?: number | null;
      new_pen?: Partial<PenOut> | null;
      ink_id?: number | null;
      new_ink?: Partial<InkOut> | null;
      end_status?: 'active' | 'cleaned' | 'emptied';
      crop_box: CropBox;
      transcription?: string;
      caption?: string;
      session_notes?: string;
    },
  ) =>
    requestJson<ScanBatchOut>(`/api/scans/pages/${pageId}/entries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  commitScan: (batchId: number, entries: unknown[]) =>
    requestJson<{
      created_sessions: number;
      created_pens: number;
      created_inks: number;
      batch: ScanBatchOut;
    }>(`/api/scans/${batchId}/commit`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),
  deleteScan: (batchId: number) =>
    requestJson<{ status: string }>(`/api/scans/${batchId}`, { method: 'DELETE' }),

  // Writing Samples
  listSamples: (filters?: {
    pen_id?: number;
    ink_id?: number;
    color_family?: string;
    nib_size?: string;
  }) => {
    const qs = new URLSearchParams();
    if (filters?.pen_id) qs.set('pen_id', String(filters.pen_id));
    if (filters?.ink_id) qs.set('ink_id', String(filters.ink_id));
    if (filters?.color_family) qs.set('color_family', filters.color_family);
    if (filters?.nib_size) qs.set('nib_size', filters.nib_size);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson<WritingSampleOut[]>(`/api/samples${suffix}`);
  },
  uploadStandaloneSample: (formData: FormData) =>
    requestJson<WritingSampleOut>('/api/samples/upload', { method: 'POST', body: formData }),
  updateSample: (
    sampleId: number,
    payload: {
      pen_id?: number | null;
      new_pen?: Partial<PenOut> | null;
      ink_id?: number | null;
      new_ink?: Partial<InkOut> | null;
      sample_date?: string;
      date_cleaned?: string | null;
      clear_date_cleaned?: boolean;
      end_status?: 'active' | 'cleaned' | 'emptied';
      transcription?: string;
      caption?: string;
      session_notes?: string;
      crop_box?: CropBox;
    },
  ) =>
    requestJson<WritingSampleOut>(`/api/samples/${sampleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSample: (id: number, deleteSession = false) =>
    requestJson<{ status: string }>(
      `/api/samples/${id}?delete_session=${deleteSession ? 'true' : 'false'}`,
      { method: 'DELETE' },
    ),

  // Settings
  getSettings: () => requestJson<AppSettingsStatus>('/api/settings'),
  updateSettings: (gemini_api_key: string) =>
  requestJson<AppSettingsStatus>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ gemini_api_key }),
  }),
  reseedDemo: () =>
    requestJson<{ status: string }>('/api/settings/reseed-demo', { method: 'POST' }),

  // Auth & Permissions
  auth: {
    getStatus: () => requestJson<AuthStatus>('/api/auth/status'),
    login: async (passcode: string) => {
      const res = await requestJson<AuthStatus>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      if (res.is_admin) {
        setStoredAdminToken(passcode);
      }
      return res;
    },
    logout: async () => {
      setStoredAdminToken(null);
      return requestJson<AuthStatus>('/api/auth/logout', { method: 'POST' });
    },
  },

  // Cloud Synchronization & Backups
  sync: {
    getStatus: () => requestJson<SyncStatus>('/api/sync/status'),
    createBackup: () => requestJson<{ status: string; backup: BackupRecord }>('/api/sync/backup', { method: 'POST' }),
    push: () => requestJson<SyncResult>('/api/sync/push', { method: 'POST' }),
    pull: () => requestJson<SyncResult>('/api/sync/pull', { method: 'POST' }),
  },
};
