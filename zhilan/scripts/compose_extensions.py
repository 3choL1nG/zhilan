from pathlib import Path
import json,collections,hashlib,argparse
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--status',choices=['review_pending','verified'],default='review_pending');p.add_argument('--review-id');args=p.parse_args()
if args.status=='verified' and not args.review_id:p.error('verified requires a recorded independent review ID')
numeric_path=ROOT/'question-bank/extensions.draft.json';concept_path=ROOT/'question-bank/concepts.draft.json'
numeric=json.loads(numeric_path.read_text())['questions'];concept=json.loads(concept_path.read_text())['questions']
selected=[q for q in numeric if q['type']=='s'][:100]+[q for q in numeric if q['type']=='j'][25:]+[q for q in numeric if q['type']=='m'][:25]+concept
for q in selected:
 if q.get('oracle'):q['explanation']+=' '+q['oracle']['rule']
 if q.get('fact_id')=='CON-07':
  q['question']='本题目标是评估对未见过的用户或设备的泛化能力。'+q['question']
  q['fact_basis']='在评估对未见实体的泛化能力时，同一用户或设备的相关记录应按实体分组，避免该实体跨训练和测试分区。'
  q['explanation']=q['fact_basis']
assert len(selected)==300
assert collections.Counter(q['type'] for q in selected)=={'s':200,'j':50,'m':50}
assert len({q['id'] for q in selected})==300
assert len({q['question'] for q in selected})==300
original=json.loads((ROOT.parent/'刷题工具数据/data/theory_questions.json').read_text());assert not {q['question'] for q in selected}&{q['question'] for q in original}
for q in selected:
 assert q['origin']=='extension' and q['answer_values'] and q['explanation'] and q['knowledge_point']
 if q['type']!='j':assert len(set(q['options'].values()))==len(q['options'])
source_sha={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (numeric_path,concept_path)}
result={'status':args.status,'version':'extensions-20261029-v1','composition':{'numerical':150,'conceptual':150},'source_sha256':source_sha,'review_id':args.review_id,'questions':selected}
(ROOT/'question-bank/extensions.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'status':args.status,'count':len(selected),'types':dict(collections.Counter(q['type'] for q in selected)),'judges':dict(collections.Counter(q['answer'] for q in selected if q['type']=='j'))}))
