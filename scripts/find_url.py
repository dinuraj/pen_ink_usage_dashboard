import re

transcript_path = r'C:\Users\dinur\.gemini\antigravity\brain\0a3da4d7-854c-40c9-915e-4b752d1d0148\.system_generated\logs\transcript.jsonl'
urls = set()

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'onrender.com' in line:
            matches = re.findall(r'https://[^\s\"\'\\]*onrender\.com[^\s\"\'\\]*', line)
            urls.update(matches)

print("Found URLs:", urls)
