"""Import visually reviewed source, with explicit per-blank mapping and fail-closed uncertainty."""
from pathlib import Path
import json,hashlib,re
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT.parent/'开发证据'
questions=[]
for name in ['1.1','2.1','2.2','3.2']:questions+=json.loads((SOURCE/f'verified-code-{name}.json').read_text())
# These screenshot whitespace regions were not independently confirmed. No inference may score them.
uncertain={
 '2.1.2-M5',
 '2.2.3-M3','2.2.3-M6','2.2.3-M8','2.2.3-M9','2.2.3-M10','2.2.3-M14','2.2.3-M15',
 '2.2.4-M4','2.2.4-M10a','2.2.4-M10b','2.2.4-M14',
 '2.2.5-M3','2.2.5-M6','2.2.5-M9','2.2.5-M10','2.2.5-M11','2.2.5-M12',
}
# Original Notebook blank boundaries, and only PDF expressions inside each blank.
maps={
'1.1.2-M5':("sensor_stats = _____________(_____________)['Value']._____________",["data.groupby","'SensorType'","agg(['count', 'mean'])"]),
'1.1.2-M7':("data['is_abnormal'] = _____________(\n    ((_____________) & ((data['Value'] < -10) | (data['Value'] > 50))) |\n    ((_____________) & ((data['Value'] < 0) | (data['Value'] > 100))),\n    True, False\n)",["np.where","data['SensorType'] == 'Temperature'","data['SensorType'] == 'Humidity'"]),
'1.1.2-M9':("data['Value']._____________(_____________, inplace=True)\ndata['Value']._____________(_____________, inplace=True)",["fillna","method='ffill'","fillna","method='bfill'"]),
'1.1.2-M10':("cleaned_data = _____________(_____________=['is_abnormal'])\n_____________('cleaned_sensor_data.csv', _____________)",["data.drop","columns","cleaned_data.to_csv","index=False"]),
'1.1.5-M14':("data['AgeGroup'] = _____________(_____________,_____________,_____________, right=False)\nage_group_counts = _____________",["pd.cut","data['Age']","bins=age_bins","labels=age_labels","data['AgeGroup'].value_counts()"]),
}
for q in questions:
 q['compiled']=True;q['review_method']='visual_pdf';out=[]
 for item in q['items']:
  i=dict(item);i['rubric_id']=i['id'];i['enabled']=i['id'] not in uncertain and i.get('verified') is not False
  if i['id']=='2.1.1-M3':i['expected']=i['expected'].replace(", errors='coerce'",",errors='coerce'")
  if i['id']=='2.2.4-M11':i['expected']=i['expected'].replace('n_estimators=1000, learning_rate=0.05, max_depth=5','n_estimators=1000,learning_rate=0.05,max_depth=5')
  if i['id']=='3.2.5-M8':i['label']='增加batch维度'
  if i['id'] in maps:
   template,values=maps[i['id']];assert len(re.findall('_{3,}',template))==len(values)==i['blank_count']
   # Each expected value must be an exact contiguous substring of the visual-PDF expression.
   for v in values:assert v in i['expected'],(i['id'],v)
   notebook=json.loads((ROOT.parent/'刷题工具数据/assets/practical'/q['question_id']/(q['question_id']+'.ipynb')).read_text())
   assert template in '\n'.join(''.join(c['source']) for c in notebook['cells']),i['id']
   for n,value in enumerate(values):
    part={k:v for k,v in i.items() if k not in ['expected','blank_count','points_per_blank','scoring_mode']}
    part.update(id=i['id']+f'-blank{n+1}',label=i['label']+f' · 第{n+1}空',expected=value,points=i['points_per_blank'],input_mode='blank',blank_number=n+1,template=template)
    out.append(part)
  else:
   i['input_mode']='statement';out.append(i)
 q['items']=out;q['verified']=all(i['enabled'] for i in out);q['review_limit']='仅enabled条目自动计分；未能确认的源图字符保留人工PDF核对，不使用推断字符串。'
 q['source_sha256']=hashlib.sha256((SOURCE/f"verified-code-{q['question_id'][:3]}.json").read_bytes()).hexdigest()
(ROOT/'verified-answers/scoring.json').write_text(json.dumps(questions,ensure_ascii=False,indent=2))
print('questions',len(questions),'auto_items',sum(i['enabled'] for q in questions for i in q['items']),'manual_items',sum(not i['enabled'] for q in questions for i in q['items']))
