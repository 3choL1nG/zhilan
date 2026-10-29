import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runtime } from '../src/runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourceRoot = path.join(root, '刷题工具数据', 'assets', 'practical');
const questionFile = path.join(root, '刷题工具数据', 'data', 'practical_questions.json');
const outDir = path.join(root, '开发证据', 'runtime');
const qids = [
  '1.1.1','1.1.2','1.1.3','1.1.4','1.1.5',
  '2.1.1','2.1.2','2.1.3','2.1.4','2.1.5',
  '2.2.1','2.2.2','2.2.3','2.2.4','2.2.5',
  '3.2.1','3.2.2','3.2.3','3.2.4','3.2.5'
];
const now = () => new Date().toISOString();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const quotePy = value => JSON.stringify(value);
const collectImports = notebook => {
  const found = [];
  for (const cell of notebook.cells ?? []) {
    if (cell.cell_type !== 'code') continue;
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*(?:import\s+|from\s+)/.test(line)) found.push(line.trim());
    }
  }
  return found;
};
const sourceDataCount = qid => {
  const dir = path.join(sourceRoot, qid);
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const walk = current => {
        for (const child of fs.readdirSync(current, { withFileTypes: true })) {
          const childPath = path.join(current, child.name);
          if (child.isDirectory()) walk(childPath);
          else if (/\.(csv|xlsx|xls)$/i.test(child.name)) count++;
        }
      };
      walk(full);
    } else if (/\.(csv|xlsx|xls)$/i.test(entry.name)) count++;
  }
  return count;
};
const readError = error => String(error?.stack || error?.message || error).slice(0, 12000);
const eventSummary = result => {
  const events = result?.events ?? [];
  return {
    ok: result?.ok === true,
    events: events.map(event => event.type === 'stream'
      ? { type: event.type, name: event.name, text: String(event.text ?? '').slice(0, 12000) }
      : event.type === 'error'
        ? { type: event.type, name: event.name, message: String(event.message ?? '').slice(0, 3000), traceback: String(event.traceback ?? '').slice(0, 6000) }
        : { type: event.type, mimeTypes: Object.keys(event.data ?? {}) })
  };
};
const runProbe = async (id, code) => {
  let timer;
  try {
    const result = await Promise.race([
      runtime('execute', id, { code }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('execute deadline exceeded (60s)'), { suiteTimeout: true })), 60000); })
    ]);
    return eventSummary(result);
  } catch (error) {
    if (error?.suiteTimeout) {
      await runtime('interrupt', id).catch(() => {});
      return { ok: false, timed_out: true, events: [], raw_error: readError(error) };
    }
    throw error;
  } finally { clearTimeout(timer); }
};
const requireExecutionSuccess = (result, stage) => {
  if (result?.ok !== true) {
    const error = new Error(`${stage}: execute.ok=false${result?.timed_out ? ' (60s timeout)' : ''}`);
    error.suiteStage = stage;
    error.suiteRaw = result?.raw_error ?? JSON.stringify(result).slice(0, 12000);
    throw error;
  }
};
const pythonImportsCode = lines => `import json, traceback\n_lines = ${quotePy(lines)}\n_results = []\nfor _line in _lines:\n    try:\n        exec(_line, globals())\n        _results.append({'line': _line, 'ok': True})\n    except Exception as _e:\n        _results.append({'line': _line, 'ok': False, 'error': type(_e).__name__ + ': ' + str(_e), 'traceback': traceback.format_exc()[-3000:]})\nprint('SUITE_IMPORTS ' + json.dumps(_results, ensure_ascii=False))\n`;
const pythonMaterialsCode = qid => `import json, pathlib, pandas as pd\n_root = pathlib.Path('/bank/${qid}')\nif not _root.is_dir(): raise FileNotFoundError('shared material directory missing: ' + str(_root))\n_rows = []\nfor _p in sorted(_root.rglob('*')):\n    if not _p.is_file(): continue\n    _suffix = _p.suffix.lower()\n    if _suffix == '.csv':\n        try:\n            _df = pd.read_csv(_p, encoding='utf-8')\n            _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'csv', 'encoding': 'utf-8', 'shape': list(_df.shape)})\n        except UnicodeDecodeError:\n            try:\n                _df = pd.read_csv(_p, encoding='gbk')\n                _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'csv', 'encoding': 'gbk', 'shape': list(_df.shape)})\n            except Exception as _e:\n                _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'csv', 'ok': False, 'error': type(_e).__name__ + ': ' + str(_e)})\n        except Exception as _e:\n            _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'csv', 'ok': False, 'error': type(_e).__name__ + ': ' + str(_e)})\n    elif _suffix in ('.xlsx', '.xls'):\n        try:\n            _sheets = pd.read_excel(_p, sheet_name=None)\n            _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'xlsx', 'sheets': {str(_k): list(_v.shape) for _k, _v in _sheets.items()}})\n        except Exception as _e:\n            _rows.append({'file': str(_p.relative_to(_root)), 'kind': 'xlsx', 'ok': False, 'error': type(_e).__name__ + ': ' + str(_e)})\nprint('SUITE_MATERIALS ' + json.dumps(_rows, ensure_ascii=False))\n`;
const pythonPlotCode = (qid) => {
  const name = `runtime-suite-${qid.replaceAll('.', '-')}.png`;
  if (qid === '2.1.4') return `import matplotlib.pyplot as plt\nfrom matplotlib.font_manager import FontProperties\n_font = FontProperties(fname='C:/Windows/Fonts/simhei.ttf')\n_fig, _ax = plt.subplots()\n_ax.plot([0,1],[0,1])\n_ax.set_title('中文字体运行检查', fontproperties=_font)\n_fig.savefig('/tmp/${name}')\nplt.close(_fig)\nfrom PIL import Image\n_im = Image.open('/tmp/${name}')\n_im.verify()\n_im = Image.open('/tmp/${name}')\nprint('SUITE_PNG ' + str(_im.format) + ' ' + str(_im.size) + ' ${name}')\n`;
  return `import matplotlib.pyplot as plt\nfrom PIL import Image\n_fig, _ax = plt.subplots()\n_ax.plot([0,1],[0,1])\n_ax.set_title('运行环境图表检查')\n_fig.savefig('/tmp/${name}')\nplt.close(_fig)\n_im = Image.open('/tmp/${name}')\n_im.verify()\n_im = Image.open('/tmp/${name}')\nprint('SUITE_PNG ' + str(_im.format) + ' ' + str(_im.size) + ' ${name}')\n`;
};
const pythonVisionCode = `import sys, pathlib, json\nsys.path.insert(0, '/bank/3.2.5')\nimport vision.utils.box_utils_numpy as box_utils\nprint('SUITE_VISION_MODULE ' + str(pathlib.Path(box_utils.__file__).resolve()))\n`;
const pythonOnnxCode = qid => `import json, pathlib, numpy as np, onnxruntime as ort\nfrom PIL import Image\n_root = pathlib.Path('/bank/${qid}')\nif not _root.is_dir(): raise FileNotFoundError('shared material directory missing: ' + str(_root))\n_models = sorted(_root.rglob('*.onnx'))\n_images = [p for p in sorted(_root.rglob('*')) if p.is_file() and p.suffix.lower() in ('.png','.jpg','.jpeg','.bmp')]\nif not _models: raise FileNotFoundError('no ONNX model found under ' + str(_root))\nif not _images: raise FileNotFoundError('no image found under ' + str(_root))\n_model, _image = _models[0], _images[0]\n_sess = ort.InferenceSession(str(_model), providers=['CPUExecutionProvider'])\n_inp = _sess.get_inputs()[0]\n_shape = list(_inp.shape)\n_dtype = _inp.type\nif _dtype not in ('tensor(float)', 'tensor(uint8)'): raise TypeError('unsupported ONNX input dtype: ' + _dtype)\nif len(_shape) != 4: raise ValueError('expected rank-4 image tensor, got ' + repr(_shape))\n# Use static ONNX dimensions; use a documented compatibility size for dynamic spatial dimensions.\n_dims = [int(x) if isinstance(x, int) and x > 0 else None for x in _shape]\n_nchw = _dims[1] in (1,3) or (_dims[1] is None and _dims[-1] not in (1,3))\n_c = _dims[1] if _nchw else _dims[-1]\n_h = _dims[2] if _nchw else _dims[1]\n_w = _dims[3] if _nchw else _dims[2]\nif _c not in (1,3): raise ValueError('cannot resolve image channel dimension: ' + repr(_shape))\n_h = _h or 224; _w = _w or 224\n_img = Image.open(_image).convert('RGB' if _c == 3 else 'L').resize((_w,_h))\n_arr = np.asarray(_img)\nif _c == 1: _arr = _arr[...,None]\nif _dtype == 'tensor(float)': _arr = _arr.astype(np.float32) / np.float32(255.0)\nelse: _arr = _arr.astype(np.uint8)\nif _nchw: _arr = np.transpose(_arr, (2,0,1))\n_arr = _arr[None,...]\n_outputs = _sess.run(None, {_inp.name: _arr})\n_summary = []\nfor _o in _outputs:\n    _a = np.asarray(_o)\n    _summary.append({'shape': list(_a.shape), 'finite': bool(np.isfinite(_a).all()) if np.issubdtype(_a.dtype, np.number) else None, 'dtype': str(_a.dtype)})\nprint('SUITE_ONNX ' + json.dumps({'model': str(_model.relative_to(_root)), 'image': str(_image.relative_to(_root)), 'provider': _sess.get_providers()[0], 'input_shape': _shape, 'input_dtype': _dtype, 'prepared_shape': list(_arr.shape), 'outputs': _summary}, ensure_ascii=False))\n`;
const parseTagged = summary => {
  const texts = (summary?.events ?? []).filter(e => e.type === 'stream').map(e => e.text);
  const parsed = {};
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      for (const tag of ['SUITE_IMPORTS ', 'SUITE_MATERIALS ', 'SUITE_PNG ', 'SUITE_ONNX ', 'SUITE_VISION_MODULE ']) {
        if (line.startsWith(tag)) {
          const value = line.slice(tag.length);
          if (tag === 'SUITE_PNG ' || tag === 'SUITE_VISION_MODULE ') parsed[tag.trim()] = value;
          else {
            try { parsed[tag.trim()] = JSON.parse(value); }
            catch { parsed[tag.trim()] = { parse_error: value.slice(0, 1000) }; }
          }
        }
      }
    }
  }
  return parsed;
};
const validateImports = (values, expectedCount) => Array.isArray(values) && values.length === expectedCount && values.every(item => item?.ok === true);
const validateMaterials = (values, expectedCount) => Array.isArray(values) && values.length === expectedCount && values.every(item => item?.ok !== false && (item.kind === 'csv' ? Boolean(item.encoding && Array.isArray(item.shape)) : item.kind === 'xlsx' && item.sheets && Object.keys(item.sheets).length > 0));
const validateOnnx = value => Boolean(value && Array.isArray(value.outputs) && value.outputs.length > 0 && value.outputs.every(output => output?.finite === true && Array.isArray(output.shape)));

const questions = JSON.parse(fs.readFileSync(questionFile, 'utf8'));
const report = { schema: 'runtime-suite-v1', created_at: now(), image_id: 'sha256:acc0a872e5ccd6afc4f00e43ddbcd130baa66613a8a4082af626b26bbec8391e', execution_status: 'running', constraints: { worker_concurrency: 1, start_deadline_seconds: 60, execute_deadline_seconds: 60, execute_ok_false_is_failure: true, close_in_finally: true, mnist_end_to_end_rerun: false }, questions: [] };
const currentOutput = path.join(outDir, 'suite-current.json');
const persistCurrent = () => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(currentOutput, JSON.stringify(report, null, 2));
};
persistCurrent();

for (const qid of qids) {
  const record = { question_id: qid, coverage: [], checks: {}, elapsed_ms: null, worker_id: null, failure: null };
  const startedAt = Date.now();
  const workerId = randomUUID();
  record.worker_id = workerId;
  let wasStarted = false;
  try {
    const qdir = path.join(sourceRoot, qid);
    const question = questions.find(q => q.contains_code_answer && (q.id ?? q.question_id) === qid);
    if (!question) throw new Error(`question ${qid} missing or not marked contains_code_answer`);
    const nbPath = path.join(qdir, `${qid}.ipynb`);
    const notebook = JSON.parse(fs.readFileSync(nbPath, 'utf8'));
    const imports = collectImports(notebook);
    const expectedMaterialCount = sourceDataCount(qid);
    record.notebook = path.relative(root, nbPath);
    record.notebook_import_line_count = imports.length;
    record.source_data_file_count = expectedMaterialCount;
    record.checks.start = await runtime('start', workerId, { qid, quota: 268435456 });
    wasStarted = true;
    let state = record.checks.start;
    const deadline = Date.now() + 60000;
    while (state?.status !== 'ready' && state?.status !== 'failed' && Date.now() < deadline) {
      await pause(500);
      state = await runtime('status', workerId);
    }
    record.checks.status = state;
    if (state?.status !== 'ready') {
      record.failure = { stage: 'start', error: state?.error ?? `startup deadline exceeded; last status=${state?.status ?? 'unknown'}` };
      record.coverage.push('worker startup failed; remaining probes skipped');
      continue;
    }

    record.checks.png = await runProbe(workerId, pythonPlotCode(qid));
    requireExecutionSuccess(record.checks.png, 'png');
    record.checks.png_parsed = parseTagged(record.checks.png)['SUITE_PNG'];
    if (typeof record.checks.png_parsed !== 'string' || !record.checks.png_parsed.startsWith('PNG ')) {
      record.failure ??= { stage: 'png', error: 'SUITE_PNG tag missing or image read-back was not reported' };
    }
    record.coverage.push(qid === '2.1.4' ? 'Chinese font render with specified SimHei path; PNG saved and opened/verified by PIL' : 'runtime-only plot saved as PNG and opened/verified by PIL');

    record.checks.files = await runtime('list', workerId);
    record.checks.listed_file_count = record.checks.files?.files?.length ?? null;

    record.checks.imports = await runProbe(workerId, pythonImportsCode(imports));
    requireExecutionSuccess(record.checks.imports, 'imports');
    record.checks.imports_parsed = parseTagged(record.checks.imports)['SUITE_IMPORTS'];
    record.checks.imports_valid = validateImports(record.checks.imports_parsed, imports.length);
    record.coverage.push('Notebook import/from lines executed independently; no answer cells executed');
    if (!record.checks.imports_valid) {
      record.failure ??= { stage: 'imports', error: JSON.stringify(record.checks.imports_parsed ?? record.checks.imports).slice(0, 12000) };
    }

    record.checks.materials = await runProbe(workerId, pythonMaterialsCode(qid));
    requireExecutionSuccess(record.checks.materials, 'materials');
    record.checks.materials_parsed = parseTagged(record.checks.materials)['SUITE_MATERIALS'];
    record.checks.materials_valid = validateMaterials(record.checks.materials_parsed, expectedMaterialCount);
    record.coverage.push('all mounted CSV and Excel files read for encoding/sheet shape; no answer data inferred');
    if (record.checks.materials?.ok !== true || !record.checks.materials_valid) {
      record.failure ??= { stage: 'materials', error: JSON.stringify(record.checks.materials_parsed ?? record.checks.materials).slice(0, 12000) };
    }

    if (qid.startsWith('2.2.')) {
      record.coverage.push('training full flow not verified: no extraction of complete original X/y feature selection; no synthetic labels or truncated samples used');
      record.checks.training = { status: 'not_run', reason: 'requires complete, exact original Notebook X/y selection to be transcribed and checked before training' };
    }

    if (qid === '3.2.2') {
      record.coverage.push('MNIST end-to-end inference not rerun; prior probe evidence exists at 开发证据/runtime/mnist-probe.json');
      record.checks.onnx = { status: 'skipped', reason: 'explicit instruction not to rerun passed MNIST end-to-end' };
    } else if (qid.startsWith('3.2.')) {
      if (qid === '3.2.5') {
        record.checks.vision_import = await runProbe(workerId, pythonVisionCode);
        requireExecutionSuccess(record.checks.vision_import, 'vision_import');
        record.checks.vision_import_parsed = parseTagged(record.checks.vision_import)['SUITE_VISION_MODULE'];
        if (typeof record.checks.vision_import_parsed !== 'string' || !record.checks.vision_import_parsed.includes('box_utils_numpy')) throw Object.assign(new Error('3.2.5 vision import tag missing'), { suiteStage: 'vision_import', suiteRaw: JSON.stringify(record.checks.vision_import) });
        record.coverage.push('3.2.5 custom vision module import attempted');
        if (record.checks.vision_import?.ok !== true) record.failure ??= { stage: 'vision_import', error: JSON.stringify(record.checks.vision_import).slice(0, 12000) };
      }
      record.checks.onnx = await runProbe(workerId, pythonOnnxCode(qid));
      requireExecutionSuccess(record.checks.onnx, 'onnx');
      record.checks.onnx_parsed = parseTagged(record.checks.onnx)['SUITE_ONNX'];
      record.checks.onnx_valid = validateOnnx(record.checks.onnx_parsed);
      record.coverage.push('ONNX CPU inference run with one original image; records only shapes and finite-value status, not prediction correctness');
      if (record.checks.onnx?.ok !== true || !record.checks.onnx_valid) record.failure ??= { stage: 'onnx', error: JSON.stringify(record.checks.onnx_parsed ?? record.checks.onnx).slice(0, 12000) };
    }

    if (record.failure) record.coverage.push('one or more probes failed; see checks and raw error details');
  } catch (error) {
    record.failure ??= { stage: error?.suiteStage ?? 'probe', error: error?.suiteRaw ?? readError(error) };
    record.coverage.push('probe aborted after exception; remaining questions continue independently');
  } finally {
    if (wasStarted) {
      try { record.checks.close = await runtime('close', workerId); }
      catch (error) { record.checks.close = { error: readError(error) }; record.failure ??= { stage: 'close', error: readError(error) }; }
    }
    record.elapsed_ms = Date.now() - startedAt;
    report.questions.push(record);
    if (record.failure) report.failed_count = (report.failed_count ?? 0) + 1;
    persistCurrent();
    console.log(JSON.stringify({ progress: `${report.questions.length}/${qids.length}`, question_id: qid, status: record.failure ? 'failed' : 'probed', failure_stage: record.failure?.stage ?? null, elapsed_ms: record.elapsed_ms }));
  }
}
report.execution_status = 'completed';
report.finished_at = now();
fs.mkdirSync(outDir, { recursive: true });
persistCurrent();
const outputPath = path.join(outDir, `suite-${new Date().toISOString().replaceAll(':','-')}.json`);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output: path.relative(root, outputPath), execution_status: report.execution_status, question_count: report.questions.length, failed_count: report.failed_count ?? 0 }));
