"""Independent numerical recomputation; never imports the generator."""
import json,math,re,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def numbers(s):return [float(x) for x in re.findall(r'(?<![A-Za-z])[-+]?\d+(?:\.\d+)?',s)]
def same(a,b):return abs(round(float(a),3)-float(b))<1e-8

def single(q):
 x=q['oracle']['inputs'];s=q['question'];k=q['knowledge_point']
 if k=='二分类混淆矩阵指标':
  tp,fp,fn,tn=[x[a] for a in ['TP','FP','FN','TN']];return {'精确率':tp/(tp+fp),'召回率':tp/(tp+fn),'特异度':tn/(tn+fp),'准确率':(tp+tn)/(tp+fp+fn+tn),'F1值':2*tp/(2*tp+fp+fn)}[x['metric']]
 if k=='训练集与测试集划分':
  n=x['N'];t=round(n*x['test_fraction']);return t if '测试集应有' in s else n-t if '训练集有' in s else (n-t)/n if '训练集占' in s else n
 if k=='标注一致率与Cohen κ':
  n=x['N'];pa=(x['both_positive']+x['both_negative'])/n;p1=(x['both_positive']+x['a_only_positive'])/n;p2=(x['both_positive']+x['b_only_positive'])/n;pe=p1*p2+(1-p1)*(1-p2)
  return (pa-pe)/(1-pe) if 'Cohen κ约' in s else pe if '偶然一致率约' in s else 1-pa if '不一致率约' in s else pa
 if k=='描述性统计量':
  v=x['values'];return statistics.mean(sorted(v)[:-1]) if '去掉最大值' in s else statistics.mean(v) if '均值' in s else statistics.median(v) if '中位数' in s else max(v)-min(v)
 if k=='缺失数据统计':
  n=x['rows']*x['columns'];m=x['missing_cells'];return m/n if '总体单元格缺失率' in s else n-m if '完整单元格数' in s else m if '缺失单元格数' in s else 1-m/n
 if k=='数值特征归一化与标准化':return (x['value']-x['mean'])/x['population_std'] if 'z分数' in s else x['minimum']+x['normalized_value']*(x['maximum']-x['minimum']) if ('反归一化' in s or '还原' in s) else (x['value']-x['minimum'])/(x['maximum']-x['minimum'])
 if k=='信息检索评价指标':
  p=x['relevant_in_top_k']/x['k'];r=x['relevant_in_top_k']/x['total_relevant'];return p if 'Precision@k约' in s else r if 'Recall@k约' in s else 2*p*r/(p+r) if 'F1@k约' in s else 1-p
 if k=='聚类样本距离':
  dx=abs(x['A'][0]-x['B'][0]);dy=abs(x['A'][1]-x['B'][1]);return dx*dx+dy*dy if '欧氏距离平方' in s else dx+dy if '曼哈顿' in s else dx if '横坐标差' in s else math.hypot(dx,dy)
 if k=='类别不平衡处理':
  a,b=x['majority_count'],x['minority_count'];return b/(a+b) if '少数类占比' in s else a/b if '数量比' in s else a-b if '需增加' in s else 2*b
 if k=='向量范数与归一化':
  v=x['vector'];a=sum(map(abs,v));b=math.sqrt(sum(t*t for t in v));return v[1]/a if 'L1归一化' in s else v[0]/b if 'L2归一化' in s else a if 'L1范数' in s else b
 raise ValueError(q['id'])

def judge(q):
 x=q['oracle']['inputs'];k=q['knowledge_point']
 if k=='二分类混淆矩阵指标':v=x['tp']/(x['tp']+x['fp'])
 elif k=='训练集与测试集划分':v=x['train']+x['test']
 elif k=='标注一致率与Cohen κ':v=x['agree']/x['n']
 elif k=='描述性统计量':v=statistics.mean(x['values'])
 elif k=='缺失数据统计':v=x['missing']/x['cells']
 elif k=='数值特征归一化与标准化':v=(x['v']-x['lo'])/(x['hi']-x['lo'])
 elif k=='信息检索评价指标':v=x['hit']/x['allrel']
 elif k=='聚类样本距离':v=abs(x['x1']-x['x2'])+abs(x['y1']-x['y2'])
 elif k=='类别不平衡处理':v=x['minor']/(x['major']+x['minor'])
 elif k=='向量范数与归一化':v=sum(map(abs,x['vec']))
 else:raise ValueError(q['id'])
 stated=numbers(q['question'])[-1]
 assert same(q['oracle']['stated_value'],stated),(q['id'],'stem claim changed')
 assert abs(v-q['oracle']['true_value'])<1e-5,(q['id'],'oracle truth wrong')
 return 'T' if same(v,stated) else 'F'

def multi(q):
 x=q['oracle']['inputs'];k=q['knowledge_point'];expected=[]
 for letter,s in q['options'].items():
  actual=numbers(s)[-1] if numbers(s) else None;value=None;truth=None
  if k=='二分类混淆矩阵指标':
   tp,fp,fn,tn=[x[a] for a in ['TP','FP','FN','TN']]
   if s.startswith('精确率'):value=tp/(tp+fp)
   elif s.startswith('召回率'):value=tp/(tp+fn)
   elif s.startswith('准确率'):value=(tp+tn)/(tp+fp+fn+tn)
   elif s.startswith('特异度'):value=tn/(tn+fp)
   elif s.startswith('F1'):value=2*tp/(2*tp+fp+fn)
  elif k=='训练集与测试集划分':
   if '条数之和' in s:value=x['N']
   elif s.startswith('测试集条数'):value=x['N']/5
   elif s.startswith('训练集条数'):value=x['N']*4/5
   elif s.startswith('训练集占'):value=.8
   elif s.startswith('测试集比例'):value=.2
  elif k=='标注一致率与Cohen κ':
   p=x['agree']/x['N'];kap=(p-x['chance_agreement'])/(1-x['chance_agreement'])
   if s=='观察一致率等于κ':truth=abs(p-kap)<1e-8
   elif s.startswith('观察一致率'):value=p
   elif s.startswith('不一致率'):value=1-p
   elif 'κ为' in s:value=kap
   elif s.startswith('一致条数'):value=x['agree']
  elif k=='描述性统计量':
   v=x['values'];value=statistics.mean(sorted(v)[:-1]) if '去掉最大值' in s else statistics.mean(v) if s.startswith('均值') else statistics.median(v) if s.startswith('中位数') else max(v)-min(v) if s.startswith('极差') else sum(v)
  elif k=='缺失数据统计':
   n=x['rows']*x['columns'];m=x['missing'];value=n if s.startswith('单元格总数') else m/n if s.startswith('缺失率') else n-m if s.startswith('完整单元格') else 1-m/n
  elif k=='数值特征归一化与标准化':value=(x['x']-x['min'])/(x['max']-x['min']) if s.startswith('当前观测值') else 0 if s.startswith('最小值') else 1 if s.startswith('最大值') else x['x']-x['min'] if s.startswith('该值') else x['max']-x['min']
  elif k=='信息检索评价指标':
   p=x['hits']/x['k'];r=x['hits']/x['total_relevant'];value=p if s.startswith('Precision') else r if s.startswith('Recall') else 2*p*r/(p+r) if s.startswith('F1') else 1-p
  elif k=='聚类样本距离':
   a=x['absolute_dx'];b=x['absolute_dy']
   if '不小于' in s:truth=a+b>=math.hypot(a,b)
   elif '距离平方' in s:value=a*a+b*b
   elif s.startswith('曼哈顿'):value=a+b
   else:value=math.hypot(a,b)
  elif k=='类别不平衡处理':
   a,b=x['majority'],x['minority'];index=q['oracle']['semantic_index'][letter];value=[b/(a+b),a/b,a-b,2*b,b/(a+b)][index]
  elif k=='向量范数与归一化':
   v=x['vector'];value=1 if '分量和' in s else sum(t*t for t in v) if '平方' in s else math.sqrt(sum(t*t for t in v)) if s.startswith('L2') else sum(map(abs,v))
  if truth is None:
   assert value is not None,(q['id'],s);truth=same(value,actual)
  if truth:expected.append(letter)
 return ''.join(expected)

def main():
 questions=json.loads((ROOT/'question-bank/extensions.draft.json').read_text())['questions'];fail=[]
 for q in questions:
  try:
   if q['type']=='s':
    v=single(q);assert same(v,float(q['options'][q['answer']])),(v,q['options']);assert sum(same(v,float(t)) for t in q['options'].values())==1
   elif q['type']=='j':assert judge(q)==q['answer']
   else:assert multi(q)==q['answer'],(multi(q),q['answer'])
  except Exception as e:fail.append({'id':q['id'],'error':str(e),'question':q['question']})
 result={'count':len(questions),'passed':len(questions)-len(fail),'failures':fail};out=ROOT.parent/'开发证据/extensions-independent.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));assert not fail
if __name__=='__main__':main()
