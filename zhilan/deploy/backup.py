import sqlite3,os,gzip,shutil
from pathlib import Path
from datetime import datetime,timezone
root=Path('/var/backups/zhilan');root.mkdir(mode=0o700,parents=True,exist_ok=True)
name='zhilan-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.sqlite'
raw=root/name
with sqlite3.connect('/var/lib/zhilan/zhilan.sqlite') as source,sqlite3.connect(raw) as target:
 source.backup(target)
os.chmod(raw,0o600)
with raw.open('rb') as source,gzip.open(str(raw)+'.gz','wb') as target:shutil.copyfileobj(source,target)
os.chmod(str(raw)+'.gz',0o600);raw.unlink()
for old in sorted(root.glob('zhilan-*.sqlite.gz'),reverse=True)[14:]:old.unlink()
