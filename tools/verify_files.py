"""Check the final distribution, including SQLite and all offline resources."""
import json,re,sqlite3,hashlib
from pathlib import Path

app=Path(__file__).resolve().parents[1]/'app'
bank=json.loads((app/'bank.json').read_text(encoding='utf-8'))
database=sqlite3.connect(app/'bank.sqlite')
assert database.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert database.execute('SELECT count(*) FROM tasks').fetchone()[0]==529
assert database.execute('SELECT count(*) FROM topics').fetchone()[0]==10
for payload, in database.execute('SELECT payload_json FROM tasks'):
    task=json.loads(payload)
    assert task==next(t for t in bank['tasks'] if t['id']==task['id'])
for path,data in database.execute('SELECT path,data FROM assets'):
    assert (app/path).read_bytes()==data,path
for t in bank['topics']+bank['tasks']:
    for ref in re.findall(r'!\[\[([^\]]+)\]\]',t.get('theory',t.get('solution',''))):
        folder='slides' if 'Иллюстрации' in ref else 'tasks'
        assert (app/'assets'/folder/ref.split('/')[-1]).exists(),ref
offline=json.loads((app/'precache.json').read_text(encoding='utf-8'))
assert 'index.html' in offline and 'bank.js' in offline and 'bank.sqlite' in offline
for name in offline:assert (app/name).is_file(),name
css=(app/'vendor/katex.min.css').read_text(encoding='utf-8')
for font in set(re.findall(r'url\((fonts/[^)]+\.woff2)\)',css)):
    assert (app/'vendor'/font).is_file(),font
print(f'PASS: SQLite integrity, 529 identical records, all image BLOBs, note images, fonts, {len(offline)} offline resources.')
