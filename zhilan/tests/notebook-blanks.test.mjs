import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankRanges,restoreBlankRanges} from '../public/notebook-blanks.mjs';
import {practicalAnswer} from '../src/validation.mjs';
test('notebook placeholders exclude Python identifiers and comment separators',()=>{
 const code="__name__ = 'test'\nsome___variable = 1\n测试___变量 = 2\n# __________\ndata = ______\nf('____')";
 const ranges=blankRanges(code);assert.equal(ranges.length,2);assert.deepEqual(ranges.map(r=>code.slice(r.from,r.to)),['______','____']);
});
test('old saved code restores fields without rewriting quotes, whitespace or multiline answers',()=>{
 const template="data = ______\nresult = fn(____, ____)\n",code="data = pd.read_csv('file.csv')\nresult = fn('A', ['a',\n    'b'])\n";
 const ranges=restoreBlankRanges(template,code);assert.deepEqual(ranges.map(r=>code.slice(r.from,r.to)),["pd.read_csv('file.csv')","'A'","['a',\n    'b']"]);
 const restored=restoreBlankRanges(template,code,ranges);assert.deepEqual(restored,ranges);
});
test('blank range metadata is bounded and cannot escape notebook code',()=>{
 const valid={notebook:['x = 1'],notebookBlanks:[[{id:0,from:4,to:5}]]};assert.deepEqual(practicalAnswer(valid).notebookBlanks,valid.notebookBlanks);
 for(const notebookBlanks of [[[{id:0,from:-1,to:2}]],[[{id:0,from:4,to:99}]],[[{id:0,from:4,to:3}]],[[{id:0,from:4,to:5},{id:0,from:4,to:5}]],[[{id:999,from:4,to:5}]]])assert.throws(()=>practicalAnswer({...valid,notebookBlanks}));
 assert.throws(()=>practicalAnswer({notebook:[],notebookBlanks:[[]]}));
});
