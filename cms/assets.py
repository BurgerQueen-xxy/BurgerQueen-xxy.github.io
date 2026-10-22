"""Private typed assets and immutable LAN music deployments. Files remain reserved."""
import hashlib,json,os,re,secrets,shutil,uuid,subprocess,sys
from pathlib import Path
from .content import fail
from .guard import check_capacity
from .store import digest,encode,now

FORMATS={'MP3':('mp3','audio/mpeg'),'WAVE':('wav','audio/wav'),'FLAC':('flac','audio/flac'),
         'OggVorbis':('ogg','audio/ogg'),'OggOpus':('ogg','audio/ogg'),'MP4':('m4a','audio/mp4')}

def initialize(store):
    (store.data/'audio').mkdir(exist_ok=True,mode=0o700)
    with store.connect() as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,kind TEXT,extension TEXT,mime TEXT,
           bytes INTEGER,title TEXT,artist TEXT,duration REAL,version INTEGER,created REAL);
          CREATE TABLE IF NOT EXISTS music_deployments(id TEXT PRIMARY KEY,snapshot TEXT,created REAL);
          CREATE TABLE IF NOT EXISTS music_pointers(name TEXT PRIMARY KEY,deployment TEXT);''')
        db.execute('CREATE TABLE IF NOT EXISTS media_usage(media TEXT,kind TEXT,PRIMARY KEY(media,kind))')
        db.execute('CREATE TABLE IF NOT EXISTS media_sources(media TEXT PRIMARY KEY,original_hash TEXT)')

def current(store):
    with store.connect() as db:
        row=db.execute("SELECT snapshot FROM music_deployments JOIN music_pointers ON music_deployments.id=music_pointers.deployment WHERE name='current'").fetchone()
    return json.loads(row['snapshot']) if row else None

def file_path(store,item):
    if not re.fullmatch(r'[a-f0-9]{64}',item['id']) or item['extension'] not in ('mp3','wav','flac','ogg','m4a'):fail('音乐对象无效',409)
    return store.data/'audio'/(item['id']+'.'+item['extension'])

def metadata(path):
    try:
        result=subprocess.run([sys.executable,'-m','cms.audio_probe',str(path)],check=True,capture_output=True,timeout=12)
        return json.loads(result.stdout)
    except Exception:fail('不是有效的 MP3、WAV、FLAC、Ogg 或 M4A 音频')

def save(store,path,title,minimum_free):
    size=path.stat().st_size
    if size<=0:fail('音乐文件不能为空',400)
    extension,mime,duration=metadata(path)
    checksum=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
    destination=store.data/'audio'/(checksum+'.'+extension)
    check_capacity(store.data,minimum_free,0 if destination.exists() else size)
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT * FROM assets WHERE id=?',(checksum,)).fetchone()
        if old:return dict(old)|{'duplicate':True}
        path.replace(destination)
        try:db.execute('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?)',(checksum,'music',extension,mime,size,title[:160] or '未命名音乐','',duration,1,now()))
        except BaseException:destination.unlink(missing_ok=True);raise
        return dict(db.execute('SELECT * FROM assets WHERE id=?',(checksum,)).fetchone())|{'duplicate':False}

def deploy(store,root,request_id,versions,minimum_free=0):
    try:uuid.UUID(request_id)
    except (ValueError,TypeError,AttributeError):fail('需要稳定部署编号')
    if root is None:fail('音乐部署目录尚未配置',409)
    with store.connect() as db:
        previous=db.execute('SELECT snapshot FROM music_deployments WHERE id=?',(request_id,)).fetchone()
        if previous:
            snapshot=json.loads(previous['snapshot'])
            if snapshot['versions']!=versions:fail('部署编号已用于不同音乐版本',409)
            return snapshot
        if not isinstance(versions,dict) or len(versions)>100:fail('音乐选择无效')
        tracks=[]
        for identity,version in versions.items():
            row=db.execute("SELECT * FROM assets WHERE id=? AND kind='music'",(identity,)).fetchone()
            if not row or row['version']!=version:fail('音乐已修改，请刷新后部署',409)
            item=dict(row);path=file_path(store,item)
            if not path.is_file() or hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!=identity:fail('音乐内容哈希不符',409)
            tracks.append(item)
    root=Path(root);root.mkdir(exist_ok=True,parents=True)
    added=sum(t['bytes'] for t in tracks if not (root/(t['id']+'.'+t['extension'])).exists())
    check_capacity(root,max(minimum_free,128*1024*1024),added)
    for item in tracks:
        target=root/(item['id']+'.'+item['extension'])
        if not target.exists():
            temporary=root/(secrets.token_hex(16)+'.part')
            try:
                with file_path(store,item).open('rb') as source,temporary.open('xb') as output:
                    shutil.copyfileobj(source,output,1024*1024);output.flush();os.fsync(output.fileno())
                temporary.replace(target)
            finally:temporary.unlink(missing_ok=True)
        if hashlib.file_digest(target.open('rb'),'sha256').hexdigest()!=item['id']:fail('NAS 音乐校验失败，上一部署保留',409)
    snapshot={'id':request_id,'versions':versions,'tracks':tracks}
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT INTO music_deployments VALUES(?,?,?)',(request_id,encode(snapshot),now()))
        old=db.execute("SELECT deployment FROM music_pointers WHERE name='current'").fetchone()
        if old:db.execute("INSERT OR REPLACE INTO music_pointers VALUES('previous',?)",(old['deployment'],))
        db.execute("INSERT OR REPLACE INTO music_pointers VALUES('current',?)",(request_id,))
    return snapshot

def public_snapshot(snapshot):
    return {'version':snapshot['id'] if snapshot else None,'tracks':[
        {'title':t['title'],'artist':t['artist'] or '未知歌手','src':'/site-music/'+t['id']+'.'+t['extension'],'cover':None}
        for t in snapshot['tracks']] if snapshot else []}
