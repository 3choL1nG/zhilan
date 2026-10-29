import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runtime } from '../src/runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const preparedPath = path.join(root, '开发证据', 'runtime', 'training-prepared.json');
const outDir = path.join(root, '开发证据', 'runtime');
const qids = ['2.2.1','2.2.2','2.2.3','2.2.4','2.2.5'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const readError = error => String(error?.stack || error?.message || error);
const imageIdProvided = '2db209bd0f51';

function summarizeExecution(result) {
  const events = result?.events ?? [];
  const stdout = [];
  const stderr = [];
  const errors = [];
  const otherEvents = [];
  for (const event of events) {
    if (event.type === 'stream') {
      const target = event.name === 'stderr' ? stderr : stdout;
      target.push(String(event.text ?? ''));
    } else if (event.type === 'error') {
      errors.push({ name: event.name ?? null, message: event.message ?? null, traceback: event.traceback ?? null });
    } else {
      otherEvents.push({ type: event.type, mimeTypes: Object.keys(event.data ?? {}) });
    }
  }
  return { ok: result?.ok === true, stdout: stdout.join(''), stderr: stderr.join(''), errors, result_error: result?.error ?? result?.message ?? null, otherEvents };
}
function outputPaths(code) {
  return [...new Set([...code.matchAll(/(['"])([^'"\n]+\.(?:pkl|txt))\1/g)].map(match => match[2]))];
}
function progress(record, index) {
  console.log(JSON.stringify({ progress: `${index}/${qids.length}`, qid: record.qid, status: record.outcome, elapsed_ms: record.elapsed_ms, stage: record.failure?.stage ?? null }));
}

const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
if (!Array.isArray(prepared) || prepared.length !== qids.length || prepared.some((row, i) => row.qid !== qids[i] || row.unmatched?.length || row.syntax_error || !row.code || !row.not_student_answer)) {
  throw new Error('training-prepared.json preflight failed: expected complete, syntactically valid, engineering-only probes for five qids');
}
const byQid = new Map(prepared.map(row => [row.qid, row]));
const report = {
  schema: 'training-runtime-v1',
  created_at: now(),
  runtime_image_id: imageIdProvided,
  runtime_image_id_note: 'Short identifier prefix as supplied by the parent task; full digest was not supplied.',
  runtime_image_label: 'zhilan-python:1',
  execution_status: 'running',
  training_probe_only: true,
  answer_key_modified: false,
  constraints: { worker_concurrency: 1, execute_deadline_seconds: 120, close_in_finally: true },
  questions: []
};
const currentOutput = path.join(outDir, 'training-current.json');
function persistCurrent() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(currentOutput, JSON.stringify(report, null, 2));
}
persistCurrent();

for (const [index, qid] of qids.entries()) {
  const source = byQid.get(qid);
  const workerId = randomUUID();
  const startedAt = Date.now();
  const code = source.code;
  const record = {
    qid, worker_id: workerId, outcome: 'pending', started_at: now(), elapsed_ms: null,
    code_sha256: createHash('sha256').update(code, 'utf8').digest('hex'),
    prepared_line_count: code.split(/\r?\n/).length,
    placeholder_mapping_count: source.mapping.length,
    unmatched_templates: source.unmatched,
    syntax_error: source.syntax_error,
    fit_statement_count: code.split(/\r?\n/).filter(line => /^\s*[A-Za-z_]\w*\.fit\s*\(/.test(line)).length,
    expected_output_paths: outputPaths(code), checks: {}, failure: null,
    engineering_evidence_only: true
  };
  let started = false;
  try {
    if (!record.fit_statement_count) throw Object.assign(new Error('prepared source contains no explicit model .fit(...) call'), { suiteStage: 'preflight' });
    record.checks.start = await runtime('start', workerId, { qid, quota: 268435456 });
    started = true;
    let state = record.checks.start;
    const startDeadline = Date.now() + 60000;
    while (state?.status !== 'ready' && state?.status !== 'failed' && Date.now() < startDeadline) {
      await pause(500);
      state = await runtime('status', workerId);
    }
    record.checks.status = state;
    if (state?.status !== 'ready') {
      record.failure = { stage: 'start', error: state?.error ?? `startup deadline exceeded; last status=${state?.status ?? 'unknown'}` };
      record.outcome = 'failed';
      continue;
    }

    let timer;
    try {
      const result = await Promise.race([
        runtime('execute', workerId, { code }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('training execute deadline exceeded (120s)'), { trainingTimeout: true })), 120000); })
      ]);
      record.checks.execution = summarizeExecution(result);
      if (record.checks.execution.ok !== true) {
        record.failure = { stage: 'execute', error: JSON.stringify({ errors: record.checks.execution.errors, result_error: record.checks.execution.result_error }).slice(0, 30000) || 'execute returned ok:false' };
        record.outcome = 'failed';
      }
    } catch (error) {
      record.checks.execution = error?.trainingTimeout
        ? { ok: false, timed_out: true, stdout: '', stderr: '', errors: [{ name: error.name, message: error.message, traceback: readError(error) }] }
        : { ok: false, stdout: '', stderr: '', errors: [{ name: error.name, message: error.message, traceback: readError(error) }] };
      record.failure = { stage: error?.trainingTimeout ? 'execute_timeout' : 'execute', error: readError(error) };
      record.outcome = 'failed';
      if (error?.trainingTimeout) await runtime('interrupt', workerId).catch(interruptError => { record.checks.interrupt_error = readError(interruptError); });
    } finally { clearTimeout(timer); }

    try {
      record.checks.list = await runtime('list', workerId);
      const listed = new Map((record.checks.list?.files ?? []).map(file => [path.posix.basename(file.name), file.bytes]));
      const models = record.expected_output_paths.filter(name => name.endsWith('.pkl'));
      record.checks.model_exports = models.map(name => ({ name, bytes: listed.get(name) ?? null, present_nonempty: Number(listed.get(name) ?? 0) > 0 }));
      record.checks.all_expected_outputs = record.expected_output_paths.map(name => ({ name, bytes: listed.get(name) ?? null, present_nonempty: Number(listed.get(name) ?? 0) > 0 }));
      record.checks.training_and_export_verified = record.checks.execution?.ok === true
        && record.fit_statement_count > 0
        && models.length > 0
        && record.checks.model_exports.every(file => file.present_nonempty);
      if (!record.checks.training_and_export_verified && !record.failure) {
        record.failure = { stage: 'export_verification', error: 'execution completed but at least one required nonempty model artifact was not listed' };
        record.outcome = 'failed';
      }
    } catch (error) {
      record.checks.list = { error: readError(error) };
      record.failure ??= { stage: 'list', error: readError(error) };
      record.outcome = 'failed';
    }
    if (record.outcome === 'pending') record.outcome = record.checks.training_and_export_verified ? 'trained_and_exported' : 'executed_not_verified';
  } catch (error) {
    record.failure ??= { stage: error?.suiteStage ?? 'probe', error: readError(error) };
    record.outcome = 'failed';
  } finally {
    if (started) {
      try { record.checks.close = await runtime('close', workerId); }
      catch (error) { record.checks.close = { error: readError(error) }; record.failure ??= { stage: 'close', error: readError(error) }; record.outcome = 'failed'; }
    }
    record.closed = record.checks.close?.status === 'closed';
    record.finished_at = now();
    record.elapsed_ms = Date.now() - startedAt;
    report.questions.push(record);
    if (record.outcome !== 'trained_and_exported') report.failed_or_unverified_count = (report.failed_or_unverified_count ?? 0) + 1;
    persistCurrent();
    progress(record, report.questions.length);
  }
}
report.execution_status = 'completed';
report.finished_at = now();
persistCurrent();
const timestamp = new Date().toISOString().replaceAll(':', '-');
const finalOutput = path.join(outDir, `training-${timestamp}.json`);
fs.writeFileSync(finalOutput, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output: path.relative(root, finalOutput), status: report.execution_status, qids: report.questions.length, trained_and_exported: report.questions.filter(q => q.outcome === 'trained_and_exported').length, failed_or_unverified: report.failed_or_unverified_count ?? 0 }));
