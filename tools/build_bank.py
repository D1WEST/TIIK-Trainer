"""Rebuild the portable bank from the original DOCX and the Метода notes.
Usage: python tools/build_bank.py [source_directory]
No external Python packages required.
"""
from pathlib import Path
import sys, json, re, sqlite3, shutil, hashlib, mimetypes, html
from zipfile import ZipFile
from xml.etree import ElementTree as ET

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else PROJECT.parent
APP = PROJECT / 'app'
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
DOCX = SOURCE / 'ТИиК часть2 экзамен_оценка.docx'

def text(cell, rels):
    tokens=[]
    for el in cell.iter():
        tag=el.tag.split('}')[-1]
        if tag == 't' and el.text: tokens.append(el.text)
        elif tag in ('tab','br','cr'): tokens.append(' ')
        elif tag == 'blip':
            rid=el.get('{'+NS['r']+'}embed')
            if rid: tokens.append('[IMG:'+Path(rels[rid]).name+']')
    return re.sub(r'\s+', ' ', ' '.join(tokens)).strip()

def cell_html(node, rels):
    """Preserve paragraph breaks, coordinate tables and inline formula positions."""
    tag=node.tag.split('}')[-1]
    if tag in ('tcPr','pPr','rPr','tblPr','tblGrid','trPr'): return ''
    if tag=='t':return html.escape(node.text or '')
    if tag in ('br','cr'):return '<br>'
    if tag=='tab':return ' '
    if tag=='blip':
        rid=node.get('{'+NS['r']+'}embed')
        return '<img class="task-image" src="assets/tasks/'+html.escape(Path(rels[rid]).name)+'" alt="Формула или схема из задания">' if rid else ''
    inner=''.join(cell_html(c,rels) for c in node)
    if tag=='r':
        vert=node.find('w:rPr/w:vertAlign',NS)
        if vert is not None:
            val=vert.get('{'+NS['w']+'}val');subtag='sub' if val=='subscript' else 'sup' if val=='superscript' else None
            if subtag:inner=f'<{subtag}>{inner}</{subtag}>'
    wrapper={'p':'p','tbl':'table','tr':'tr','tc':'td'}.get(tag)
    return f'<{wrapper}>{inner}</{wrapper}>' if wrapper else inner

def main():
    media=APP/'assets'/'tasks';media.mkdir(parents=True,exist_ok=True)
    with ZipFile(DOCX) as z:
        rels={r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
        root=ET.fromstring(z.read('word/document.xml'))
        raw=[]
        for table in root.findall('w:body/w:tbl',NS):
            rows=[[text(c,rels) for c in r.findall('w:tc',NS)] for r in table.findall('w:tr',NS)]
            m=re.match(r'^Задание №(\d+)\s*(.*)$',rows[0][0]) if rows and rows[0] else None
            if m:
                prompt_row=table.findall('w:tr',NS)[1]
                prompt_html=''.join(cell_html(child,rels) for c in prompt_row.findall('w:tc',NS) for child in c)
                raw.append({'id':int(m[1]),'sourceTopic':m[2],'rows':rows,'promptHtml':prompt_html})
        for name in z.namelist():
            if name.startswith('word/media/') and not name.endswith('/'):
                (media/Path(name).name).write_bytes(z.read(name))
    topics=[];solutions={}
    for p in sorted((SOURCE/'Метода').glob('*.md')):
        if p.name.startswith('00'): continue
        content=p.read_text(encoding='utf-8')
        content=re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, count=1, flags=re.S)
        sections=list(re.finditer(r'^### Задание (\d+)\s*$',content,re.M))
        assert sections, p.name
        topic_id=p.name[:2]
        intro=content[:sections[0].start()].split('<!-- GENERATED TASK BANK')[0]
        # Omit the navigation-only links; the full teaching material is retained.
        intro=re.sub(r'^.*\[\[.*?\.md.*$', '', intro, flags=re.M)
        topics.append({'id':topic_id,'title':p.stem[3:],'theory':intro.strip(),'source':p.name})
        for i,m in enumerate(sections):
            end=sections[i+1].start() if i+1<len(sections) else len(content)
            solutions[int(m[1])]={'topic':topic_id,'markdown':content[m.end():end].strip()}
    slide_src=SOURCE/'Метода'/'Иллюстрации из презентации'
    shutil.copytree(slide_src, APP/'assets'/'slides',dirs_exist_ok=True)
    replacement=PROJECT/'sources'/'Ответы с gemini.md'
    if replacement.exists():
        content=replacement.read_text(encoding='utf-8-sig')
        sections=list(re.finditer(r'^##\s+Вопрос\s+(\d+)\s*:\s*$',content,re.M))
        ids=[int(m[1]) for m in sections]
        assert len(ids)==529 and set(ids)==set(solutions), 'Gemini solutions must contain each question 1..529 exactly once'
        for i,m in enumerate(sections):
            end=sections[i+1].start() if i+1<len(sections) else len(content)
            solutions[int(m[1])]['markdown']=content[m.end():end].strip()
    tasks=[]
    for t in raw:
        rows=t.pop('rows');kind=rows[2][0];tail=rows[3:]
        t.update(prompt=rows[1][0],instruction=kind,topic=solutions[t['id']]['topic'],
                 solution=solutions[t['id']]['markdown'],sourceRows=rows)
        if 'Выберите' in kind:
            t['type']='multiple' if 'несколько' in kind else 'single'
            t['options']=[{'text':' '.join(r[2:]),'id':str(i)} for i,r in enumerate(tail)]
            t['answer']=[str(i) for i,r in enumerate(tail) if r[1]=='+']
        elif 'соответствие' in kind:
            t['type']='matching'
            t['pairs']=[{'left':r[2],'right':' '.join(r[4:])} for r in tail]
            t['answer']=[r[1] for r in tail]
        elif 'число' in kind:
            t['type']='number';t['fields']=[];t['answer']=[]
            for r in tail:
                a=r[-1].split('±')
                value=float(a[0].strip().replace(',','.'))
                tolerance=float(a[1].strip().replace(',','.')) if len(a)>1 else 0
                t['fields'].append({'label':' '.join(r[1:-1]),'value':value,'tolerance':tolerance})
                t['answer'].append(a[0].strip())
        else:
            t['type']='blanks'
            t['template']='\n'.join(' '.join(r) for r in tail)
            t['answer']=re.findall(r'\[(?!IMG:)([^\]]+)\]',t['template'])
        assert t['answer'], ('empty answer',t['id'])
        tasks.append(t)
    assert len(tasks)==529 and len({t['id'] for t in tasks})==529
    assert set(solutions)=={t['id'] for t in tasks}
    for topic in topics:topic['count']=sum(t['topic']==topic['id'] for t in tasks)
    bank={'schemaVersion':1,'title':'ТИиК Тренажёр','source':DOCX.name,
          'sourceSha256':hashlib.sha256(DOCX.read_bytes()).hexdigest(), 'topics':topics,'tasks':tasks}
    if replacement.exists():
        bank['solutionSource']=replacement.name
        bank['solutionSourceSha256']=hashlib.sha256(replacement.read_bytes()).hexdigest()
    payload=json.dumps(bank,ensure_ascii=False,separators=(',',':'))
    (APP/'bank.json').write_text(payload,encoding='utf-8')
    (APP/'bank.js').write_text('window.TIIK_BANK='+payload+';',encoding='utf-8')
    dbpath=APP/'bank.sqlite'
    if dbpath.exists():dbpath.unlink()
    db=sqlite3.connect(dbpath)
    db.executescript('''
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE topics(id TEXT PRIMARY KEY,title TEXT NOT NULL,theory_markdown TEXT NOT NULL,source TEXT NOT NULL);
    CREATE TABLE tasks(id INTEGER PRIMARY KEY,topic_id TEXT REFERENCES topics(id),type TEXT NOT NULL,prompt TEXT NOT NULL,answer_json TEXT NOT NULL,solution_markdown TEXT NOT NULL,payload_json TEXT NOT NULL);
    CREATE TABLE assets(path TEXT PRIMARY KEY,mime_type TEXT NOT NULL,data BLOB NOT NULL);
    ''')
    db.executemany('INSERT INTO metadata VALUES(?,?)',[(k,str(v)) for k,v in bank.items() if k not in ('topics','tasks')])
    db.executemany('INSERT INTO topics VALUES(?,?,?,?)',[(t['id'],t['title'],t['theory'],t['source']) for t in topics])
    db.executemany('INSERT INTO tasks VALUES(?,?,?,?,?,?,?)',[(t['id'],t['topic'],t['type'],t['prompt'],json.dumps(t['answer'],ensure_ascii=False),t['solution'],json.dumps(t,ensure_ascii=False)) for t in tasks])
    assets=list((APP/'assets').rglob('*'))
    db.executemany('INSERT INTO assets VALUES(?,?,?)',[(p.relative_to(APP).as_posix(),mimetypes.guess_type(p.name)[0] or 'application/octet-stream',p.read_bytes()) for p in assets if p.is_file()])
    db.commit();assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
    cache_files=sorted(p.relative_to(APP).as_posix() for p in APP.rglob('*') if p.is_file() and p.name not in ('bank.json','sw.js','precache.json'))
    (APP/'precache.json').write_text(json.dumps(cache_files,ensure_ascii=False),encoding='utf-8')
    worker=APP/'sw.js'
    if worker.exists():
        code=worker.read_text(encoding='utf-8')
        canonical=re.sub(r"const CACHE = '[^']+';", "const CACHE = 'BUILD_HASH';",code)
        digest=hashlib.sha256(canonical.encode())
        for name in cache_files:digest.update(name.encode());digest.update((APP/name).read_bytes())
        worker.write_text(re.sub(r"const CACHE = '[^']+';", "const CACHE = 'tiik-"+digest.hexdigest()[:16]+"';",code),encoding='utf-8')
    print(json.dumps({'tasks':len(tasks),'topics':len(topics),'solutions':len(solutions),'assets':sum(p.is_file() for p in assets),'types':{k:sum(t['type']==k for t in tasks) for k in sorted(set(t['type'] for t in tasks))}},ensure_ascii=False))

if __name__=='__main__':main()
