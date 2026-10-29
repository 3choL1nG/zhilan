"""Engineering validation only: mechanically fill supplied Notebook placeholders.
Not a student answer source. Unmatched fragments stop preparation, never invented.
"""
import json,re,ast
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];bank=ROOT.parent/'刷题工具数据/assets/practical';source=json.loads((ROOT.parent/'开发证据/verified-code-2.2.json').read_text());out=[]
for q in source:
 qid=q['question_id'];n=json.loads((bank/qid/(qid+'.ipynb')).read_text());candidates=[]
 for i in q['items']:
  for line in i['expected'].splitlines():
   if line.strip() and not line.strip().startswith('#'):candidates.append((i['id'],line.strip()))
 used=set();cursor=-1;mapping=[];missing=[];lines=[]
 for line in '\n'.join(''.join(c['source']) for c in n['cells'] if c['cell_type']=='code').splitlines():
  if not re.search('_{3,}',line):lines.append(line);continue
  core=line.split('  #')[0].rstrip();parts=re.split('_{3,}',core.strip())
  # Fixed non-whitespace template characters must match literally; template
  # whitespace is optional so formatting-only spacing does not block a match.
  def literal_pattern(fragment):
   return r'\s*'.join(re.escape(ch) for ch in fragment if not ch.isspace())
  pattern=r'^\s*'+r'(.+?)'.join(literal_pattern(p) for p in parts)+r'\s*$';found=[]
  for index,(iid,expected) in enumerate(candidates):
   if index in used:continue
   m=re.fullmatch(pattern,expected,flags=re.S)
   if m:found.append((index,iid,m.groups(),expected))
  if not found:missing.append(line);lines.append(line);continue
  after=[x for x in found if x[0]>=cursor];chosen=(after or found)[0];index,iid,values,source_line=chosen;used.add(index);cursor=index
  indent=core[:len(core)-len(core.lstrip())];filled=indent+source_line.strip();lines.append(filled);mapping.append({'template':line,'source_item':iid,'result':filled})
 code='\n'.join(lines)+'\n';syntax_error=None
 try:ast.parse(code)
 except SyntaxError as e:syntax_error=str(e)
 out.append({'qid':qid,'code':code,'mapping':mapping,'unmatched':missing,'syntax_error':syntax_error,'not_student_answer':True})
assert [x['qid'] for x in out]==['2.2.1','2.2.2','2.2.3','2.2.4','2.2.5']
assert all(not x['unmatched'] and not x['syntax_error'] for x in out), 'incomplete or invalid placeholder fill; no probe file written'
pipe=next(m for x in out if x['qid']=='2.2.2' for m in x['mapping'] if m['source_item']=='2.2.2-M5')
assert pipe['result']==next(i['expected'] for q in source if q['question_id']=='2.2.2' for i in q['items'] if i['id']=='2.2.2-M5')
file=ROOT.parent/'开发证据/runtime/training-prepared.json';file.write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps([{'qid':x['qid'],'filled':len(x['mapping']),'unmatched':x['unmatched'],'syntax_error':x['syntax_error']} for x in out],ensure_ascii=False))
