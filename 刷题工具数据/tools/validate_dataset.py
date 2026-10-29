"""Check completeness and strict preservation of the selected answer sources."""
from pathlib import Path
import collections
import hashlib
import json
import sys
import openpyxl
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from load_data import load_theory, load_practical, load_manifest, load_exam_config

theory, practical, manifest = load_theory(), load_practical(), load_manifest()
assert len(theory) == 900 and len({q['id'] for q in theory}) == 900
for t in ('j', 's', 'm'):
    assert sorted(q['number'] for q in theory if q['type'] == t) == list(range(1, 301))
book = openpyxl.load_workbook(ROOT / 'sources/theory_answers.xlsx', read_only=True, data_only=True)
for q in theory:
    ref = q['answer_source']
    value = book[ref['sheet']][ref['cell']].value
    expected = 'F' if q['type'] == 'j' and value is None else str(value).strip().replace('√', 'T').replace('×', 'F')
    assert q['answer'] == expected, q['id']
    if q['type'] == 'j':
        assert q['answer'] in ('T', 'F')
    else:
        assert set(q['answer']) <= set(q['options'])
        assert len(q['answer']) >= 1
        if q['type'] == 's':
            assert len(q['answer']) == 1
    assert q['explanation'] is None

assert len(practical) == len({q['id'] for q in practical}) == 40
assert len([q for q in practical if q['contains_code_answer']]) == 20
pages = []
native_text_chars = 0
for q in practical:
    assert q['id'] in q['question_text']
    assert q['answer_source_id'] == 'practical_answer_pdf'
    assert (ROOT / q['answer_text_file']).is_file()
    assert (ROOT / q['ocr_reading_aid_file']).is_file()
    assert q['answer_pdf_pages'] == [p['pdf_page'] for p in q['answer_pages']]
    pages.extend(q['answer_pdf_pages'])
    native_text_chars += sum(len(p['native_text']) for p in q['answer_pages'])
    if not q['contains_code_answer']:
        assert sum(len(p['native_text']) for p in q['answer_pages']) > 100, q['id']
    for page in q['answer_pages']:
        img_path = ROOT / page['image']
        with Image.open(img_path) as image:
            assert min(image.size) >= 1000
            image.verify()
    for filename in q['material_files'] + q['answer_template_text_files']:
        assert (ROOT / filename).is_file(), filename
    assert not any((ROOT / f).is_symlink() for f in q['material_files'])
assert sorted(pages) == list(range(4, 90))

for source in manifest['sources'].values():
    path = ROOT / source['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256']
    if 'original_path' in source and Path(source['original_path']).exists() and path.suffix in ('.pdf', '.xlsx'):
        assert hashlib.sha256(Path(source['original_path']).read_bytes()).hexdigest() == source['sha256']

mock = json.loads((ROOT / 'data/official_theory_mock.json').read_text(encoding='utf8'))
assert len(mock) == 190
assert collections.Counter(q['type'] for q in mock) == {'j': 40, 's': 140, 'm': 10}
assert all(q['question_id'] in {t['id'] for t in theory} for q in mock)
assert all('answer' not in q for q in mock)
assert sum(g['points'] for g in load_exam_config()['practical']['groups']) == 100
report = {
    'status': 'passed',
    'theory_questions': 900,
    'theory_answers_exactly_match_selected_excel': 900,
    'practical_questions': 40,
    'code_tasks': 20,
    'answer_pages_present_and_readable': 86,
    'native_answer_text_characters': native_text_chars,
    'tasks_with_original_materials': sum(bool(q['materials_directory']) for q in practical),
    'copied_material_files': sum(len(q['material_files']) for q in practical),
    'original_mock_question_references': 190,
    'selected_source_files_hash_verified': True,
    'answer_source_policy_checked': True,
    'limitations': [
        '代码OCR未逐字符确认，不作为自动判分答案。',
        '本次校验数据归档完整性及答案来源一致性，不重新评判用户选定答案。',
        '保留用户原参考答案，不承诺实际考试阅卷接受哪些等价写法。'
    ]
}
(ROOT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))
