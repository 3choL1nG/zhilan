#!/usr/bin/env python3
"""Build deterministic, original level-3 theory extensions from arithmetic oracles.

Only Python's standard library is used. Running this script writes the draft bank
next to this script under ../question-bank/extensions.draft.json.
"""
from __future__ import annotations
import json
import math
import random
import re
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'question-bank' / 'extensions.draft.json'
LETTERS = 'ABCDE'
TYPE_LABEL = {'j': '判断题', 's': '单选题', 'm': '多选题'}


def f3(x):
    return f'{x:.3f}'


def fnum(x):
    if isinstance(x, int) or (isinstance(x, float) and x.is_integer()):
        return str(int(x))
    return f3(float(x))


def fmt_expected(x):
    return round(float(x), 6)


def single_options(correct, distractors, correct_letter):
    c = fnum(correct)
    vals = []
    for v in distractors:
        s = fnum(v)
        if s != c and s not in vals:
            vals.append(s)
    step = 0.071 if isinstance(correct, float) and not float(correct).is_integer() else 3
    k = 1
    while len(vals) < 4:
        v = correct + (step * k if k % 2 else -step * k)
        s = fnum(v)
        if s != c and s not in vals:
            vals.append(s)
        k += 1
    vals = vals[:4]
    result = {}
    it = iter(vals)
    for letter in LETTERS:
        result[letter] = c if letter == correct_letter else next(it)
    assert len(set(result.values())) == 5
    return result


def base_item(qid, typ, number, question, options, answer_values, explanation, point, oracle, knowledge_point):
    answer_values = list(answer_values)
    return {
        'id': qid,
        'level': 3,
        'type': typ,
        'type_label': TYPE_LABEL[typ],
        'number': number,
        'question': question,
        'options': options,
        'answer': ''.join(answer_values),
        'answer_values': answer_values,
        'explanation': explanation,
        'knowledge_point': knowledge_point,
        'origin': 'extension',
        'oracle': oracle,
    }


def single_case(topic, i):
    """Return prompt, inputs, rule, value, plausible distractors, explanation."""
    # Each cycle changes operation and presentation; values vary by question.
    context = ['门诊质检', '设备告警', '在线课程', '客服工单', '图像审核'][i % 5]
    a = i + 3
    if topic == 0:  # confusion matrix
        tp, fp, fn, tn = 11+a, 4+(i*3)%9, 3+(i*2)%8, 19+(i*5)%17
        mode = i % 5
        formulas = [
            ('精确率', tp/(tp+fp), [tp/(tp+fn), (tp+tn)/(tp+fp+fn+tn), fp/(tp+fp), fn/(tp+fn)], 'TP/(TP+FP)'),
            ('召回率', tp/(tp+fn), [tp/(tp+fp), (tp+tn)/(tp+fp+fn+tn), fn/(tp+fn), fp/(tp+fp)], 'TP/(TP+FN)'),
            ('特异度', tn/(tn+fp), [tp/(tp+fn), (tp+tn)/(tp+fp+fn+tn), fp/(tn+fp), tn/(tn+fn)], 'TN/(TN+FP)'),
            ('准确率', (tp+tn)/(tp+fp+fn+tn), [tp/(tp+fp), tp/(tp+fn), (fp+fn)/(tp+fp+fn+tn), tn/(tn+fp)], '(TP+TN)/总样本数'),
            ('F1值', 2*tp/(2*tp+fp+fn), [tp/(tp+fp), tp/(tp+fn), (tp+tn)/(tp+fp+fn+tn), (fp+fn)/(tp+fp+fn+tn)], '2TP/(2TP+FP+FN)'),
        ]
        label, val, wrong, rule = formulas[mode]
        return (f'某{context}二分类器的混淆矩阵统计为TP={tp}、FP={fp}、FN={fn}、TN={tn}。按{label}定义计算，结果约为多少？',
                {'TP':tp,'FP':fp,'FN':fn,'TN':tn,'metric':label}, rule, val, wrong,
                f'{label}按{rule}计算，代入题给计数并保留三位小数。')
    if topic == 1:  # data splitting
        n = 120 + 20*(i%10)
        pct = [0.2,0.25,0.3,0.4,0.1][i%5]
        test = int(n*pct)
        mode=i%4
        if mode==0: question=f'{context}数据共有{n}条，按{pct*100:.0f}%留作测试集且不舍弃样本，测试集应有多少条？'; val=test; rule='测试集条数=N×测试比例；本题乘积为整数。'
        elif mode==1: question=f'{context}数据共有{n}条，其中{pct*100:.0f}%分配到测试集，其余作为训练集。训练集有多少条？'; val=n-test; rule='训练集条数=N−测试集条数。'
        elif mode==2: question=f'将{n}条{context}记录按{n-test}:{test}划分训练集与测试集，训练集占总量的比例是多少？'; val=(n-test)/n; rule='训练集比例=训练集条数/总条数。'
        else: question=f'{context}数据有{n}条，采用测试集比例{pct:.2f}进行一次固定比例划分，训练集与测试集总条数是多少？'; val=n; rule='不丢弃样本时，训练集条数+测试集条数=N。'
        wrong=[n*pct, n*(1-pct), n+test, max(0,n-2*test)]
        return question, {'N':n,'test_fraction':pct,'test_count':test}, rule, val, wrong, f'划分不丢弃记录，测试集{test}条，训练集{n-test}条，总量仍为{n}条。'
    if topic == 2:  # agreement / kappa
        n=40+5*(i%8); both=12+i%9; a_only=3+(i*2)%7; b_only=4+(i*3)%6; neither=n-both-a_only-b_only
        if neither < 0: n += 20; neither=n-both-a_only-b_only
        pa=(both+neither)/n; pA=(both+a_only)/n; pB=(both+b_only)/n
        pe=pA*pB+(1-pA)*(1-pB); kap=(pa-pe)/(1-pe)
        mode=i%4
        opts=[('观察一致率',pa,[1-pa,pe,kap,pA]),('偶然一致率',pe,[pa,1-pa,kap,pB]),('Cohen κ',kap,[pa,pe,1-pa,pA]),('不一致率',1-pa,[pa,pe,kap,1-pB])]
        label,val,wrong=opts[mode]
        question=f'两名标注员对{n}条{context}样本的二分类结果中，两人均判正{both}条、仅甲判正{a_only}条、仅乙判正{b_only}条，其余均判负。{label}约为多少？'
        return question, {'N':n,'both_positive':both,'a_only_positive':a_only,'b_only_positive':b_only,'both_negative':neither}, '先由四格计数求观察一致率；边际正类率分别为pA、pB，偶然一致率=pA×pB+(1−pA)×(1−pB)；κ=(观察一致率−偶然一致率)/(1−偶然一致率)。', val, wrong, f'由给出的四格计数计算一致率；若问κ，再扣除按边际比例预期的偶然一致。'
    if topic == 3:  # central tendency
        vals=[2+i%7, 4+(i*3)%8, 5+(i*5)%9, 8+(i*2)%11, 12+(i*7)%13]
        mode=i%4
        if mode==0: label,val='均值',sum(vals)/len(vals); wrong=[sorted(vals)[2],max(vals)-min(vals),sum(vals[:-1])/4,sum(vals)/4]
        elif mode==1: label,val='中位数',sorted(vals)[2]; wrong=[sum(vals)/5,max(vals)-min(vals),sorted(vals)[1],sorted(vals)[3]]
        elif mode==2: label,val='极差',max(vals)-min(vals); wrong=[sum(vals)/5,sorted(vals)[2],max(vals),min(vals)]
        else: label,val='去掉最大值后的均值',sum(sorted(vals)[:-1])/4; wrong=[sum(vals)/5,sorted(vals)[2],sum(sorted(vals)[1:])/4,max(vals)-min(vals)]
        question=f'{context}样本记录的数值依次为{vals}。仅按题目给出的这组数据，{label}是多少？'
        return question, {'values':vals}, '根据题目指定的统计量直接对所列五个观测值排序或求和；均值采用算术平均。', val, wrong, f'{label}由题给五个数直接计算，未进行加权或抽样推断。'
    if topic == 4:  # missingness
        rows=50+5*(i%10); cols=4+(i%4); miss=3+(i*7)%20; mode=i%4
        total=rows*cols
        if mode==0: label,val='总体单元格缺失率',miss/total; wrong=[miss/rows,miss/cols,(total-miss)/total,miss/(total-miss)]
        elif mode==1: label,val='完整单元格数',total-miss; wrong=[total,miss,total-rows,total-cols]
        elif mode==2: label,val='缺失单元格数',miss; wrong=[total-miss,rows-miss,cols-miss,miss*cols]
        else: label,val='完整率',1-miss/total; wrong=[miss/total,miss/rows,(total-miss)/rows,miss/total*100]
        question=f'{context}宽表有{rows}行、{cols}列数据单元格，其中缺失{miss}个单元格。{label}是多少？'
        return question, {'rows':rows,'columns':cols,'missing_cells':miss,'total_cells':total}, '单元格总数=行数×列数；缺失率=缺失单元格/总单元格，完整率=1−缺失率。', val, wrong, f'总单元格数为{rows}×{cols}={total}，据此计算所问数量或比例。'
    if topic == 5:  # normalization
        lo=2+i%9; hi=lo+10+2*(i%8); x=lo+2+(i*3)%(hi-lo-2); mean=lo+(hi-lo)*0.45; sd=2+(i%5)
        mode=i%3
        if mode==0: label,val='最小-最大归一化值', (x-lo)/(hi-lo); rule='(x−最小值)/(最大值−最小值)'; wrong=[x/hi,(x-lo)/hi,(x-lo)/(hi-lo+1),(hi-x)/(hi-lo)]
        elif mode==1: label,val='z分数', (x-mean)/sd; rule='(x−均值)/标准差'; wrong=[(x-lo)/(hi-lo),x/mean,(mean-x)/sd,(x-mean)/(sd*sd)]
        else:
            label='反归一化后的原值'
            normalized=(i%7+1)/10
            val=normalized*(hi-lo)+lo
            rule='原值=归一化值×(最大值−最小值)+最小值'
            wrong=[normalized,lo+normalized,normalized*hi,hi-normalized]
            question=f'{context}数值特征的最小值为{lo}、最大值为{hi}，当前最小-最大归一化值为{fnum(normalized)}。反归一化后原值约为多少？'
            return question, {'minimum':lo,'maximum':hi,'normalized_value':normalized}, rule, val, wrong, f'原值={fnum(normalized)}×({hi}−{lo})+{lo}，结果保留三位小数。'
        question=f'{context}数值特征的最小值为{lo}、最大值为{hi}、均值为{fnum(mean)}、标准差为{sd}，当前观测值为{x}。按{label}定义，结果约为多少？'
        return question, {'minimum':lo,'maximum':hi,'mean':mean,'population_std':sd,'value':x}, rule, val, wrong, f'按题目指定的{label}公式代入；结果保留三位小数。'
    if topic == 6:  # IR
        relevant=5+i%8; retrieved=3+i%6; k=10+5*(i%5); retrieved=min(retrieved,k); total_rel=12+i%10
        mode=i%4
        p=retrieved/k; r=retrieved/total_rel; f=2*p*r/(p+r)
        opts=[('Precision@k',p,[r,f,(k-retrieved)/k,1-p]),('Recall@k',r,[p,f,(total_rel-retrieved)/total_rel,1-r]),('F1@k',f,[p,r,(p+r)/2,abs(p-r)]),('前k条未命中比例',1-p,[p,r,f,(k-retrieved)/k])]
        label,val,wrong=opts[mode]
        question=f'信息检索系统返回前{k}条结果，其中{retrieved}条相关；该查询共有{total_rel}条相关文档。{label}约为多少？'
        if label == 'Precision@k':
            explanation = f'Precision@k=前k条相关数/k={retrieved}/{k}={fnum(p)}；分母是返回的前k条数量k。'
        elif label == 'Recall@k':
            explanation = f'Recall@k=前k条相关数/全部相关文档数={retrieved}/{total_rel}={fnum(r)}。'
        elif label == 'F1@k':
            explanation = f'先算P={retrieved}/{k}={fnum(p)}、R={retrieved}/{total_rel}={fnum(r)}，再算F1@k=2PR/(P+R)={fnum(f)}。'
        else:
            explanation = f'前k条未命中比例=(k−前k条相关数)/k=({k}−{retrieved})/{k}={fnum(1-p)}。'
        return question, {'k':k,'relevant_in_top_k':retrieved,'total_relevant':total_rel}, 'Precision@k=前k条相关数/k；Recall@k=前k条相关数/全部相关数；F1=2PR/(P+R)。', val, wrong, explanation
    if topic == 7:  # distances
        x1=1+i%8; y1=2+(i*3)%9; x2=x1+2+(i%5); y2=y1-1-(i%4)
        dx=abs(x1-x2); dy=abs(y1-y2); eu=math.sqrt(dx*dx+dy*dy); man=dx+dy
        mode=i%4
        opts=[('欧氏距离',eu,[man,dx*dx+dy*dy,abs(dx-dy),eu*eu]),('曼哈顿距离',man,[eu,dx*dx+dy*dy,abs(dx-dy),dx*dy]),('欧氏距离平方',eu*eu,[eu,man,dx*dx,dy*dy]),('两点横坐标差的绝对值',dx,[dy,man,eu,dx+dy])]
        label,val,wrong=opts[mode]
        question=f'在二维特征空间中，样本A坐标为({x1},{y1})，样本B坐标为({x2},{y2})。{label}是多少？'
        return question, {'A':[x1,y1],'B':[x2,y2],'dx':dx,'dy':dy}, '欧氏距离=sqrt(dx²+dy²)；曼哈顿距离=|dx|+|dy|；按题目指定定义计算。', val, wrong, f'两坐标差的绝对值为{dx}和{dy}，据此按对应距离公式计算。'
    if topic == 8:  # imbalance
        maj=80+10*(i%8); minor=10+(i*3)%9; total=maj+minor; mode=i%4
        if mode==0: label,val='少数类占比',minor/total; wrong=[maj/total,maj/minor,minor/maj,(total-minor)/minor]
        elif mode==1: label,val='多数类与少数类数量比',maj/minor; wrong=[minor/maj,maj/total,minor/total,maj-minor]
        elif mode==2: label,val='随机过采样后达到多数类数量所需增加的少数类条数',maj-minor; wrong=[maj,minor,maj/minor,2*minor]
        else: label,val='多数类随机欠采样至少数类数量后保留总数',2*minor; wrong=[total-minor,maj-minor,minor,maj]
        question=f'{context}分类数据中多数类有{maj}条、少数类有{minor}条。若只按题干所说的计数规则，{label}是多少？'
        return question, {'majority_count':maj,'minority_count':minor,'total':total}, '少数类占比=少数类/总数；数量比=多数类/少数类；过采样增加量=多数类−少数类；欠采样后总数=2×少数类。', val, wrong, f'按{label}的定义直接对多数类和少数类计数计算。'
    # Topic 9: vector normalization and class weights
    vals=[2+i%6,3+(i*2)%7,4+(i*3)%5]; mode=i%4
    l1=sum(abs(x) for x in vals); l2=math.sqrt(sum(x*x for x in vals))
    opts=[('L1范数',l1,[l2,max(vals),sum(x*x for x in vals),l1/len(vals)]),('L2范数',l2,[l1,max(vals),sum(x*x for x in vals),l2*l2]),('L1归一化后第二个分量',vals[1]/l1,[vals[1]/l2,vals[1]/sum(vals),1/l1,vals[1]/max(vals)]),('L2归一化后第一个分量',vals[0]/l2,[vals[0]/l1,vals[0]/sum(vals),1/l2,vals[0]/max(vals)])]
    label,val,wrong=opts[mode]
    question=f'{context}模型输入向量为{vals}。按{label}定义计算，结果约为多少？'
    return question, {'vector':vals,'L1':l1,'L2':l2}, 'L1范数为各分量绝对值之和；L2范数为平方和开根号；归一化分量=分量/相应范数。', val, wrong, f'按向量范数或范数归一化定义计算，并保留三位小数。'


KNOWLEDGE = [
    '二分类混淆矩阵指标', '训练集与测试集划分', '标注一致率与Cohen κ',
    '描述性统计量', '缺失数据统计', '数值特征归一化与标准化',
    '信息检索评价指标', '聚类样本距离', '类别不平衡处理', '向量范数与归一化',
]


def make_singles():
    result=[]
    for i in range(200):
        topic=i%10; idx=i//10
        q,inputs,rule,val,wrong,explanation=single_case(topic,idx)
        letter=LETTERS[(idx+topic)%5]
        # Rounded-option collisions are resolved deterministically without changing the key.
        opts=single_options(val,wrong,letter)
        shown=f'结果约为{fnum(val)}' if not isinstance(val,int) else str(val)
        result.append(base_item(f'X3-S{i+1:03d}','s',i+1,q,opts,[letter],explanation,1,
            {'rule':rule,'inputs':inputs,'expected_value':fmt_expected(val)},KNOWLEDGE[topic]))
    return result


def make_judges():
    result=[]
    # Five propositions per domain; alternate within each domain. Even-numbered
    # domains receive three true items and odd-numbered domains two, for 25/25.
    templates=[
      '已知TP={tp}、FP={fp}、FN={fn}、TN={tn}。按定义，精确率TP/(TP+FP)约为{stated}。',
      '某次划分有训练集{train}条、测试集{test}条；未丢弃样本时，总样本数为{stated}条。',
      '两名标注员对{n}条记录有{agree}条完全一致，观察一致率约为{stated}。',
      '数列{values}的算术平均数为{stated}。',
      '表格共有{cells}个数据单元，其中{missing}个缺失，缺失率为{stated}。',
      '特征最小值为{lo}、最大值为{hi}，观测值{v}经最小-最大归一化后为{stated}。',
      '检索前{k}条结果有{hit}条相关，全部相关文档数为{allrel}，Recall@k约为{stated}。',
      '二维点({x1},{y1})与({x2},{y2})的曼哈顿距离为{stated}。',
      '多数类{major}条、少数类{minor}条，少数类占比约为{stated}。',
      '向量{vec}的L1范数为{stated}。',
    ]
    for i in range(50):
        topic=i%10; j=i//10
        # Generate and assert the underlying proposition before optionally negating its stated result.
        if topic==0:
            tp,fp,fn,tn=14+j*2,5+j,4+j,20+j*3; true=tp/(tp+fp); inp={'tp':tp,'fp':fp,'fn':fn,'tn':tn,'precision':f3(true)}; rule='precision=TP/(TP+FP)。'
        elif topic==1:
            train=80+10*j; test=20+2*j; true=float(train+test); inp={'train':train,'test':test,'n':int(true)}; rule='无丢弃时总量=训练集条数+测试集条数。'
        elif topic==2:
            n=30+5*j; agree=17+j*2; true=agree/n; inp={'n':n,'agree':agree,'rate':f3(true)}; rule='观察一致率=完全一致条数/总条数。'
        elif topic==3:
            values=[2+j,4+j,7+j,11+j,16+j]; true=sum(values)/5; inp={'values':values,'mean':fnum(true)}; rule='算术平均数=总和/观测值个数。'
        elif topic==4:
            cells=240+30*j; missing=12+3*j; true=missing/cells; inp={'cells':cells,'missing':missing,'rate':f3(true)}; rule='缺失率=缺失单元格/总单元格。'
        elif topic==5:
            lo=2+j; hi=12+2*j; v=lo+(hi-lo)//3; true=(v-lo)/(hi-lo); inp={'lo':lo,'hi':hi,'v':v,'scaled':f3(true)}; rule='最小-最大归一化=(x−min)/(max−min)。'
        elif topic==6:
            k=10+5*j; hit=3+j; allrel=12+2*j; true=hit/allrel; inp={'k':k,'hit':hit,'allrel':allrel,'recall':f3(true)}; rule='Recall@k=前k条相关数/全部相关数。'
        elif topic==7:
            x1,y1=1+j,5+2*j; x2,y2=x1+3,y1-2; true=5.; inp={'x1':x1,'y1':y1,'x2':x2,'y2':y2,'dist':fnum(true)}; rule='曼哈顿距离=两维坐标差绝对值之和。'
        elif topic==8:
            major=90+10*j; minor=10+2*j; true=minor/(major+minor); inp={'major':major,'minor':minor,'share':f3(true)}; rule='少数类占比=少数类数/总样本数。'
        else:
            vec=[2+j,3+j,4+j]; true=float(sum(vec)); inp={'vec':vec,'norm':fnum(true)}; rule='L1范数=各分量绝对值之和。'
        template=templates[topic]
        truth=((j+topic)%2==0)
        false_delta=1 if topic in (1,3,7,9) else 0.137
        stated=true if truth else true+false_delta
        q=template.format(**inp,stated=fnum(stated))
        result.append(base_item(f'X3-J{i+1:03d}','j',i+1,q,{},['T' if truth else 'F'],
            f'{rule}题中陈述的数值{fnum(stated)}'+('与计算结果一致。' if truth else f'与计算结果{fnum(true)}不一致。'),1,
            {'rule':rule,'inputs':inp,'stated_value':fmt_expected(stated),'true_value':fmt_expected(true),
             'expected_truths':['T' if truth else 'F']},KNOWLEDGE[topic]))
    return result


def make_multis():
    result=[]
    # Each option is an independently checkable proposition with a truth value.
    for i in range(50):
        topic=i%10; j=i//10
        if topic==0:
            tp,fp,fn,tn=12+2*j,4+j,3+j,18+2*j
            vals=[f'精确率为{f3(tp/(tp+fp))}',f'召回率为{f3(tp/(tp+fn)+0.137)}',f'准确率为{f3((tp+tn)/(tp+fp+fn+tn))}',f'特异度为{f3(tn/(tn+fp)+0.137)}',f'F1为{f3(2*tp/(2*tp+fp+fn))}']
            pick=[0,2,4]
            inputs={'TP':tp,'FP':fp,'FN':fn,'TN':tn}; rule='分别使用precision=TP/(TP+FP)、recall=TP/(TP+FN)、accuracy=(TP+TN)/N、specificity=TN/(TN+FP)、F1=2TP/(2TP+FP+FN)核算选项。'
        elif topic==1:
            n=100+20*j; test=n//5; train=n-test
            vals=[f'测试集条数为{test}',f'训练集条数为{train}',f'训练集占总量的比例为{f3(train/n)}',f'训练集与测试集条数之和为{n+1}',f'测试集比例为{f3(test/n)}']
            pick=[0,1,2,4]; inputs={'N':n,'train':train,'test':test}; rule='测试条数=N×20%；训练条数=N−测试条数；两集合之和为N。'
        elif topic==2:
            n=40+4*j; agree=22+j; a=(agree/n); pe=0.5; kap=(a-pe)/(1-pe)
            vals=[f'观察一致率为{f3(a)}',f'不一致率为{f3(1-a)}',f'随机一致率已知为0.5时κ为{f3(kap)}',f'一致条数为{agree+1}',f'观察一致率等于κ']
            pick=[0,1,2]; inputs={'N':n,'agree':agree,'chance_agreement':0.5}; rule='观察一致率=agree/N；不一致率=1−观察一致率；κ=(观察一致率−随机一致率)/(1−随机一致率)。'
        elif topic==3:
            vals0=[1+j,3+j,5+j,7+j,9+j]; mean=sum(vals0)/5; median=vals0[2]
            vals=[f'均值为{fnum(mean)}',f'中位数为{median}',f'极差为{max(vals0)-min(vals0)}',f'去掉最大值后均值为{fnum(sum(vals0[:-1])/4)}',f'数据总和为{sum(vals0)+1}']
            pick=[0,1,2,3]; inputs={'values':vals0}; rule='逐项计算均值、中位数、极差和删除最大值后的算术平均；核对各选项数值。'
        elif topic==4:
            rows=30+5*j; cols=4; miss=8+j; total=rows*cols
            vals=[f'单元格总数为{total}',f'缺失率为{f3(miss/total)}',f'完整单元格数为{total-miss}',f'完整率为{f3(1-miss/total)}',f'缺失率为{f3(miss/rows)}']
            pick=[0,1,2,3]; inputs={'rows':rows,'columns':cols,'missing':miss}; rule='单元格总数=行×列；完整数=总数−缺失数；缺失率=缺失/总数；完整率=1−缺失率。'
        elif topic==5:
            lo=j+1; hi=lo+9; x=lo+3; z=(x-lo)/(hi-lo)
            vals=[f'当前观测值归一化后为{f3(z)}',f'最大值归一化后为1.000',f'最小值归一化后为0.000',f'该值比最小值大{x-lo}',f'归一化公式分母为{hi-lo+1}']
            pick=[0,1,2,3]; inputs={'min':lo,'max':hi,'x':x}; rule='min-max归一化=(x−min)/(max−min)，min映射0，max映射1。'
        elif topic==6:
            k=10+2*j; hits=4+j%4; total_rel=9+j; p=hits/k; r=hits/total_rel; f=2*p*r/(p+r)
            vals=[f'Precision@k为{f3(p)}',f'Recall@k为{f3(r)}',f'F1@k为{f3(f)}',f'前k条未命中率为{f3(1-p)}',f'Recall@k为{f3(hits/k)}']
            pick=[0,1,2,3]; inputs={'k':k,'hits':hits,'total_relevant':total_rel}; rule='P=hits/k；R=hits/total_relevant；F1=2PR/(P+R)；未命中率=1−P。'
        elif topic==7:
            dx=2+j%5; dy=3+j%4; eu=math.sqrt(dx*dx+dy*dy); man=dx+dy
            vals=[f'曼哈顿距离为{man}',f'欧氏距离约为{f3(eu)}',f'欧氏距离平方为{dx*dx+dy*dy}',f'曼哈顿距离不小于欧氏距离',f'欧氏距离为{man}']
            pick=[0,1,2,3]; inputs={'absolute_dx':dx,'absolute_dy':dy}; rule='曼哈顿距离=dx+dy；欧氏距离=sqrt(dx²+dy²)，其平方=dx²+dy²；L1距离不小于L2距离。'
        elif topic==8:
            major=70+5*j; minor=10+j; total=major+minor
            vals=[f'少数类占全部样本的比例为{f3(minor/total)}',f'多数类/少数类之比为{f3(major/minor)}',f'过采样至多数类数量需新增{major-minor}条少数类',f'欠采样至少数类数量后总数为{2*minor}',f'少数类占全部样本的比例为{f3(minor/major)}']
            pick=[0,1,2,3]; inputs={'majority':major,'minority':minor}; rule='少数占比=minority/(majority+minority)；比值=majority/minority；新增量=majority−minority；欠采样后总量=2×minority。'
        else:
            v=[1+j,2+j,2*j+1]; l1=sum(v); l2=math.sqrt(sum(x*x for x in v))
            vals=[f'L1范数为{l1}',f'L2范数约为{f3(l2)}',f'L1归一化后的分量和为1.000',f'L2范数平方为{sum(x*x for x in v)}',f'L1范数为{l2:.3f}']
            pick=[0,1,2,3]; inputs={'vector':v}; rule='L1=sum(abs(x))；L2=sqrt(sum(x²))；按L1归一化后各分量之和为1；L2²=sum(x²)。'
        # Ensure four or fewer correct answers, and 2-4 total.
        pick=pick[:4]
        assert 2 <= len(pick) <= 4
        # Reproducibly shuffle option positions for every item. Semantic indexes
        # remain available to an auditor through the oracle mapping.
        permutation=list(range(5))
        random.Random(0x5EED ^ ((i+1)*2654435761)).shuffle(permutation)
        semantic_index={LETTERS[pos]:semantic for pos,semantic in enumerate(permutation)}
        opts={LETTERS[pos]:vals[semantic] for pos,semantic in enumerate(permutation)}
        letters=sorted(LETTERS[pos] for pos,semantic in enumerate(permutation) if semantic in pick)
        option_truths={LETTERS[pos]:(semantic in pick) for pos,semantic in enumerate(permutation)}
        if topic==0:
            question=f'某二分类模型统计TP={inputs["TP"]}、FP={inputs["FP"]}、FN={inputs["FN"]}、TN={inputs["TN"]}。以下指标陈述哪些正确？（多选）'
        elif topic==1:
            question=f'现有{inputs["N"]}条数据，按测试集20%划分为训练集和测试集。以下关于数据量与比例的陈述哪些正确？（多选）'
        elif topic==2:
            question=f'两名标注员对{inputs["N"]}条样本观察一致{inputs["agree"]}条，偶然一致率取{fnum(inputs["chance_agreement"])}。以下陈述哪些正确？（多选）'
        elif topic==3:
            question=f'给定数列{inputs["values"]}，以下关于该数列统计量的陈述哪些正确？（多选）'
        elif topic==4:
            question=f'一张表有{inputs["rows"]}行、{inputs["columns"]}列数据单元，其中缺失{inputs["missing"]}个。以下陈述哪些正确？（多选）'
        elif topic==5:
            question=f'某特征最小值为{inputs["min"]}、最大值为{inputs["max"]}，当前观测值为{inputs["x"]}。按最小-最大归一化，以下陈述哪些正确？（多选）'
        elif topic==6:
            question=f'检索系统返回前{inputs["k"]}条结果，其中{inputs["hits"]}条相关；该查询全部相关文档共{inputs["total_relevant"]}条。以下指标陈述哪些正确？（多选）'
        elif topic==7:
            question=f'二维样本间横、纵坐标差的绝对值分别为{inputs["absolute_dx"]}和{inputs["absolute_dy"]}。以下关于两点距离的陈述哪些正确？（多选）'
        elif topic==8:
            question=f'某分类数据中多数类有{inputs["majority"]}条、少数类有{inputs["minority"]}条。以下关于类别比例及采样数量的陈述哪些正确？（多选）'
        else:
            question=f'给定向量{inputs["vector"]}，以下关于向量范数和归一化的陈述哪些正确？（多选）'
        result.append(base_item(f'X3-M{i+1:03d}','m',i+1,
            question,opts,letters,
            '逐项按所列数学定义复算；各选项均只陈述一个可核验结果。',1,
            {'rule':rule,'inputs':inputs,'expected_truths':letters,'option_truths':option_truths,
             'semantic_index':semantic_index},KNOWLEDGE[topic]))
    return result


def validate(questions):
    assert len(questions)==300
    counts={t:sum(q['type']==t for q in questions) for t in TYPE_LABEL}
    assert counts=={'j':50,'s':200,'m':50}, counts
    ids=[q['id'] for q in questions]
    assert len(ids)==len(set(ids)) and all(re.fullmatch(r'X3-[JSM]\d{3}',x) for x in ids)
    assert all(q['origin']=='extension' and 'verified' not in q for q in questions)
    stems=[re.sub(r'\s+','',q['question']) for q in questions]
    assert len(stems)==len(set(stems)), 'duplicate stem'
    orig=json.loads((Path(__file__).resolve().parents[2]/'刷题工具数据'/'data'/'theory_questions.json').read_text(encoding='utf-8'))
    orig_stems={re.sub(r'\s+','',q['question']) for q in orig}
    assert not (set(stems)&orig_stems), 'stem copied from original bank'
    assert len({q['knowledge_point'] for q in questions})>=10
    for q in questions:
        assert q['level']==3 and q['number']>=1 and q['type_label']==TYPE_LABEL[q['type']]
        assert isinstance(q['question'],str) and q['question'] and isinstance(q['explanation'],str) and q['explanation']
        assert q['oracle']['rule'] and q['oracle']['inputs']
        if q['type']=='s':
            assert list(q['options'])==list(LETTERS) and len(set(q['options'].values()))==5
            assert q['answer'] in q['options'] and q['answer_values']==[q['answer']]
            assert round(float(q['options'][q['answer']]),3)==round(float(q['oracle']['expected_value']),3)
        elif q['type']=='m':
            assert list(q['options'])==list(LETTERS) and len(set(q['options'].values()))==5
            assert 2<=len(q['answer_values'])<=4 and q['answer']==''.join(q['answer_values'])
            assert all(x in q['options'] for x in q['answer_values'])
            assert q['oracle']['expected_truths']==q['answer_values']
            assert q['oracle']['option_truths']=={k:(k in q['answer_values']) for k in LETTERS}
            assert sorted(q['oracle']['semantic_index'].values())==list(range(5))
        else:
            assert q['options']=={} and q['answer'] in ('T','F')
            assert q['oracle']['expected_truths']==[q['answer']]
    single_answers=[q['answer'] for q in questions if q['type']=='s']
    assert {x:single_answers.count(x) for x in LETTERS}=={x:40 for x in LETTERS}
    for kp in KNOWLEDGE:
        keyed=[q for q in questions if q['type']=='s' and q['knowledge_point']==kp]
        assert {x:sum(q['answer']==x for q in keyed) for x in LETTERS}=={x:4 for x in LETTERS}
    ir_singles=[q for q in questions if q['type']=='s' and (q['number']-1)%10==6]
    assert len(ir_singles)==20
    for q in ir_singles:
        if q['question'].endswith('Precision@k约为多少？'):
            assert '相关数/k=' in q['explanation'] and '分母是返回的前k条数量k' in q['explanation']
        elif q['question'].endswith('Recall@k约为多少？'):
            assert '相关数/全部相关文档数=' in q['explanation']
        elif q['question'].endswith('F1@k约为多少？'):
            assert '先算P=' in q['explanation'] and 'R=' in q['explanation'] and '再算F1@k=2PR/(P+R)' in q['explanation']
        elif q['question'].endswith('前k条未命中比例约为多少？'):
            assert '未命中比例=(k−前k条相关数)/k=' in q['explanation']
        else:
            raise AssertionError(f'unrecognized information retrieval metric in {q["id"]}')
    judges=[q['answer'] for q in questions if q['type']=='j']
    assert judges.count('T')==judges.count('F')==25
    for topic,kp in enumerate(KNOWLEDGE):
        keyed=[q for q in questions if q['type']=='j' and q['knowledge_point']==kp]
        assert len({q['answer'] for q in keyed})==2
        assert sorted(sum(q['answer']==x for q in keyed) for x in ('T','F'))==[2,3]
        for q in keyed:
            data=q['oracle']['inputs']
            formulas=[
                lambda z:z['tp']/(z['tp']+z['fp']),
                lambda z:z['train']+z['test'],
                lambda z:z['agree']/z['n'],
                lambda z:sum(z['values'])/len(z['values']),
                lambda z:z['missing']/z['cells'],
                lambda z:(z['v']-z['lo'])/(z['hi']-z['lo']),
                lambda z:z['hit']/z['allrel'],
                lambda z:abs(z['x1']-z['x2'])+abs(z['y1']-z['y2']),
                lambda z:z['minor']/(z['major']+z['minor']),
                lambda z:sum(z['vec']),
            ]
            recalculated=round(float(formulas[topic](data)),6)
            stated=q['oracle']['stated_value']
            assert abs(recalculated-q['oracle']['true_value'])<1e-6
            rendered_matches=round(stated,3)==round(recalculated,3)
            assert (q['answer']=='T')==rendered_matches
            assert fnum(stated) in q['question']
    semantic_positions={i:set() for i in range(5)}
    for q in (x for x in questions if x['type']=='m'):
        for letter,semantic in q['oracle']['semantic_index'].items():
            semantic_positions[semantic].add(letter)
    assert all(len(positions)>=4 for positions in semantic_positions.values())


def main():
    questions=make_singles()+make_judges()+make_multis()
    validate(questions)
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'status':'draft','questions':questions},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'wrote {len(questions)} draft items to {OUT}')
    print('types:', {t:sum(q['type']==t for q in questions) for t in TYPE_LABEL})
    print('single answer balance:', {x:sum(q['type']=='s' and q['answer']==x for q in questions) for x in LETTERS})
    print('judge balance:', {x:sum(q['type']=='j' and q['answer']==x for q in questions) for x in ('T','F')})
    print('knowledge points:', len({q['knowledge_point'] for q in questions}))

if __name__=='__main__':
    main()
