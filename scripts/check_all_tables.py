import sqlite3
from sqlalchemy import create_engine, text

cloud_url = "postgresql+pg8000://postgres.zjxyhhgrcvensgeyihnp:datgePhBb5kz2e2e@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
cloud_engine = create_engine(cloud_url)

local_conn = sqlite3.connect("data/pen_ink.db")
local_conn.row_factory = sqlite3.Row

tables = [
    "pens",
    "inks",
    "notebooks",
    "pen_photos",
    "pen_merge_records",
    "scan_batches",
    "scan_pages",
    "usage_sessions",
    "writing_samples",
    "lifecycle_events",
    "app_settings"
]

print("=== TABLE ROW COUNTS ===")
with cloud_engine.connect() as c_conn:
    for t in tables:
        c_count = c_conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
        l_count = local_conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t:20s}: local={l_count:4d}  cloud={c_count:4d}  diff={c_count - l_count:4d}")

# Check usage sessions diffs
print("\n=== CHECKING USAGE SESSIONS ===")
with cloud_engine.connect() as c_conn:
    cloud_sessions = {r._mapping['id']: dict(r._mapping) for r in c_conn.execute(text("SELECT * FROM usage_sessions"))}
local_sessions = {r['id']: dict(r) for r in local_conn.execute("SELECT * FROM usage_sessions")}
print(f"Cloud sessions: {len(cloud_sessions)}, Local sessions: {len(local_sessions)}")
sess_diffs = []
for sid, c_sess in cloud_sessions.items():
    l_sess = local_sessions.get(sid)
    if not l_sess:
        sess_diffs.append((sid, "NEW_SESSION", c_sess))
        continue
    ch = {}
    for k, v in c_sess.items():
        if k in ('created_at', 'updated_at'): continue
        if l_sess.get(k) != v:
            ch[k] = (l_sess.get(k), v)
    if ch:
        sess_diffs.append((sid, ch))

print(f"Usage sessions with differences: {len(sess_diffs)}")
for sid, ch in sess_diffs:
    print(f"  Session #{sid}: {ch}")

# Check writing samples diffs
print("\n=== CHECKING WRITING SAMPLES ===")
with cloud_engine.connect() as c_conn:
    cloud_samples = {r._mapping['id']: dict(r._mapping) for r in c_conn.execute(text("SELECT * FROM writing_samples"))}
local_samples = {r['id']: dict(r) for r in local_conn.execute("SELECT * FROM writing_samples")}
print(f"Cloud samples: {len(cloud_samples)}, Local samples: {len(local_samples)}")
samp_diffs = []
for sid, c_samp in cloud_samples.items():
    l_samp = local_samples.get(sid)
    if not l_samp:
        samp_diffs.append((sid, "NEW_SAMPLE", c_samp))
        continue
    ch = {}
    for k, v in c_samp.items():
        if k in ('created_at', 'updated_at'): continue
        if l_samp.get(k) != v:
            ch[k] = (l_samp.get(k), v)
    if ch:
        samp_diffs.append((sid, ch))

print(f"Writing samples with differences: {len(samp_diffs)}")
for sid, ch in samp_diffs:
    print(f"  Sample #{sid}: {ch}")

# Check inks diffs
print("\n=== CHECKING INKS DIFFS ===")
with cloud_engine.connect() as c_conn:
    cloud_inks = {r._mapping['id']: dict(r._mapping) for r in c_conn.execute(text("SELECT * FROM inks"))}
local_inks = {r['id']: dict(r) for r in local_conn.execute("SELECT * FROM inks")}
local_only_inks = set(local_inks.keys()) - set(cloud_inks.keys())
print(f"Local only inks: {local_only_inks}")
for iid in local_only_inks:
    print(f"  Local only ink #{iid}: {local_inks[iid]['brand']} {local_inks[iid]['name']}")
ink_diffs = []
for iid, c_ink in cloud_inks.items():
    l_ink = local_inks.get(iid)
    if not l_ink: continue
    ch = {k: (l_ink.get(k), v) for k, v in c_ink.items() if k not in ('created_at', 'updated_at') and l_ink.get(k) != v}
    if ch: ink_diffs.append((iid, c_ink['brand'] + ' ' + c_ink['name'], ch))
print(f"Inks with differences: {len(ink_diffs)}")
for iid, name, ch in ink_diffs:
    print(f"  Ink #{iid} ({name}): {ch}")

