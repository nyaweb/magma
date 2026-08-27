import { db } from "./db.js";
import { createContainer } from "./resources.js";
import { runDocker } from "./docker.js";
import { getTemplate } from "./templates.js";
import { AppError, integerClamp, newId, now, parseJson, truncate } from "./utils.js";

const active = new Map();
const settleLocks = new Map();
const hydrateExperiment = row => row ? { ...row } : null;
const hydrateRun = row => row ? { ...row, config: parseJson(row.config, {}) } : null;

async function settleContainerUnlocked(experiment, id) {
  try {
    const action = experiment.mode === "ephemeral" ? ["rm", "--force", "--volumes", "--", id] : ["stop", "--time", "10", "--", id];
    await runDocker(experiment.host_id, action, { allowFailure: true, timeout: 30_000 });
    const inspect = await runDocker(experiment.host_id, ["inspect", "--format", "{{json .State.Running}}", "--", id], { allowFailure: true, timeout: 10_000, maxOutput: 1_000 });
    const notFound = inspect.exitCode !== 0 && /no such (?:object|container)/i.test(`${inspect.stdout}\n${inspect.stderr}`);
    if (inspect.exitCode !== 0 && !notFound) throw new Error(inspect.stderr.trim() || "Docker could not verify container state");
    const settled = experiment.mode === "ephemeral" ? notFound : notFound || inspect.stdout.trim() === "false";
    if (!settled) throw new Error("container remained active");
  } catch (error) {
    throw new AppError(`Could not ${experiment.mode === "ephemeral" ? "remove" : "stop"} experiment container ${id}`, 502, { cleanup: true, cause: error.message });
  }
}

function settleContainer(experiment, id) {
  const key = `${experiment.host_id}:${id}`, previous = settleLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => settleContainerUnlocked(experiment, id));
  settleLocks.set(key, current);
  return current.finally(() => { if (settleLocks.get(key) === current) settleLocks.delete(key); });
}

async function experimentContainerIds(experiment, runningOnly = false) {
  const { stdout } = await runDocker(experiment.host_id, ["ps", runningOnly ? "-q" : "-aq", "--no-trunc", "--filter", `label=io.magma.experiment=${experiment.id}`], { timeout: 10_000, maxOutput: 100_000 });
  return stdout.split(/\s+/).filter(value => /^[a-f0-9]{12,64}$/.test(value));
}

async function settleExperimentContainers(experiment, ids = []) {
  const errors = [], recorded = (experiment.runs || []).map(run => run.container_id).filter(Boolean);
  let discovered;
  try { discovered = await experimentContainerIds(experiment, experiment.mode === "persistent"); }
  catch (error) { throw new AppError("Experiment cleanup discovery failed", 502, { cleanup: true, errors: [error.message] }); }
  const queue = [...new Set([...ids, ...recorded, ...discovered])];
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      try { await settleContainer(experiment, id); } catch (error) { errors.push(error); }
    }
  });
  await Promise.all(workers);
  if (errors.length) throw new AppError("Experiment cleanup could not be verified", 502, { cleanup: true, errors: errors.map(error => error.message).slice(0, 20) });
}

export function listExperiments() {
  return db.query("SELECT * FROM experiments ORDER BY created_at DESC").all().map(hydrateExperiment);
}

export function getExperiment(id) {
  const experiment = hydrateExperiment(db.query("SELECT * FROM experiments WHERE id=?").get(id));
  if (!experiment) throw new AppError("Experiment not found", 404);
  experiment.runs = db.query("SELECT * FROM experiment_runs WHERE experiment_id=? ORDER BY case_index").all(id).map(hydrateRun);
  return experiment;
}

export function experimentCases(body) {
  const source = Array.isArray(body.cases) && body.cases.length
    ? body.cases
    : Array.from({ length: integerClamp(body.count, 1, 500, 1) }, (_, index) => ({ name: `Case ${index + 1}` }));
  if (source.length > 500) throw new AppError("An experiment supports at most 500 cases");
  return source.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new AppError(`Invalid experiment case at index ${index}`);
    return { ...item, name: String(item.name || `Case ${index + 1}`) };
  });
}

function insertExperiment(experiment, cases, timestamp) {
  db.transaction(() => {
    db.query(`INSERT INTO experiments (id,host_id,template_id,name,mode,concurrency,status,total,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(experiment.id, experiment.host_id, experiment.template_id, experiment.name, experiment.mode, experiment.concurrency, "queued", cases.length, timestamp, timestamp);
    cases.forEach((item, index) => db.query(`INSERT INTO experiment_runs (id,experiment_id,case_index,name,config,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(newId(), experiment.id, index, item.name, JSON.stringify(item), "queued", timestamp, timestamp));
  })();
}

export function createExperiment(body) {
  const template = getTemplate(String(body.templateId || "")), cases = experimentCases(body);
  const id = newId(), timestamp = now();
  const experiment = {
    id, host_id: template.host_id, template_id: template.id,
    name: String(body.name || `Experiment ${timestamp}`),
    mode: body.mode === "persistent" ? "persistent" : "ephemeral",
    concurrency: Math.min(integerClamp(body.concurrency, 1, 32, 4), cases.length),
  };
  insertExperiment(experiment, cases, timestamp);
  const state = { cancelled: false, containers: new Set(), promise: null };
  active.set(id, state);
  state.promise = executeExperiment(id, state);
  state.promise.catch(error => console.error(`Experiment ${id} failed`, error));
  return getExperiment(id);
}

async function executeRun(experiment, template, run, state) {
  if (state.cancelled) return;
  const started = Date.now(), caseConfig = run.config;
  db.query("UPDATE experiment_runs SET status='running',updated_at=? WHERE id=?").run(now(), run.id);
  let containerId = null, output = "", exitCode = null, status = "failed";
  try {
    const command = caseConfig.command ?? template.config.command;
    const env = { ...(template.config.env || {}), ...(caseConfig.env || {}) };
    const name = `magma-${experiment.id.slice(0, 8)}-${String(run.case_index + 1).padStart(3, "0")}`;
    const created = await createContainer(experiment.host_id, {
      ...template.config, ...caseConfig, name, command, env, start: false, restart: "no",
    }, { "io.magma.experiment": experiment.id, "io.magma.run": run.id, "io.magma.persistent": String(experiment.mode === "persistent") });
    containerId = created.id;
    state.containers.add(containerId);
    db.query("UPDATE experiment_runs SET container_id=? WHERE id=?").run(containerId, run.id);
    if (state.cancelled) throw new AppError("Experiment cancelled", 409);
    await runDocker(experiment.host_id, ["start", "--", containerId]);
    if (state.cancelled) throw new AppError("Experiment cancelled", 409);
    const wait = await runDocker(experiment.host_id, ["wait", "--", containerId], { timeout: integerClamp(caseConfig.timeoutMs, 1_000, 3_600_000, 300_000), maxOutput: 1_000 });
    if (state.cancelled) throw new AppError("Experiment cancelled", 409);
    exitCode = Number(wait.stdout.trim());
    const logs = await runDocker(experiment.host_id, ["logs", "--timestamps", "--", containerId], { allowFailure: true, maxOutput: 500_000 });
    output = truncate(`${logs.stdout}${logs.stderr}`, 500_000);
    status = state.cancelled ? "cancelled" : exitCode === 0 ? "passed" : "failed";
  } catch (error) {
    status = state.cancelled ? "cancelled" : "failed";
    output = truncate(error.message, 500_000);
    if (containerId && experiment.mode === "persistent" && status === "failed") {
      await settleContainer(experiment, containerId);
    }
  } finally {
    try {
      if (containerId && (experiment.mode === "ephemeral" || status === "cancelled")) await settleContainer(experiment, containerId);
    } finally {
      if (containerId) state.containers.delete(containerId);
    }
  }
  db.query(`UPDATE experiment_runs SET status=?,exit_code=?,duration_ms=?,output=?,updated_at=? WHERE id=?`)
    .run(status, exitCode, Date.now() - started, output, now(), run.id);
}

function updateExperimentTotals(id, status) {
  const totals = db.query(`SELECT COUNT(*) completed,
    SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) passed,
    SUM(CASE WHEN status IN ('failed','cancelled') THEN 1 ELSE 0 END) failed
    FROM experiment_runs WHERE experiment_id=? AND status!='queued'`).get(id);
  db.query("UPDATE experiments SET status=?,completed=?,passed=?,failed=?,updated_at=? WHERE id=?")
    .run(status, Number(totals.completed), Number(totals.passed || 0), Number(totals.failed || 0), now(), id);
}

async function executeExperiment(id, state) {
  try {
    const experiment = getExperiment(id);
    if (experiment.status === "cancelled") return;
    const template = getTemplate(experiment.template_id), queue = [...experiment.runs];
    let failure = null;
    db.query("UPDATE experiments SET status='running',updated_at=? WHERE id=?").run(now(), id);
    const workers = Array.from({ length: Math.min(experiment.concurrency, queue.length) }, async () => {
      while (queue.length && !state.cancelled) {
        try { await executeRun(experiment, template, queue.shift(), state); }
        catch (error) {
          failure ||= error;
          state.cancelled = true;
          try { await settleExperimentContainers(experiment, [...state.containers]); }
          catch (cleanupError) { failure = cleanupError; }
        }
      }
    });
    await Promise.allSettled(workers);
    if (failure) {
      try { await settleExperimentContainers(experiment, [...state.containers]); }
      catch (cleanupError) { failure = cleanupError; }
      throw failure;
    }
    updateExperimentTotals(id, state.cancelled ? "cancelled" : "completed");
  } catch (error) {
    const timestamp = now();
    db.query("UPDATE experiment_runs SET status='failed',output=?,updated_at=? WHERE experiment_id=? AND status IN ('queued','running')")
      .run(truncate(error.message, 500_000), timestamp, id);
    updateExperimentTotals(id, error.details?.cleanup ? "cleanup_failed" : "interrupted");
    throw error;
  } finally {
    active.delete(id);
  }
}

export async function cancelExperiment(id) {
  const experiment = getExperiment(id);
  const incomplete = experiment.runs.some(run => ["queued", "running"].includes(run.status));
  if (["completed", "interrupted"].includes(experiment.status) || experiment.status === "cancelled" && !incomplete) return experiment;
  const state = active.get(id);
  if (state) state.cancelled = true;
  let cleanupError = null;
  try { await settleExperimentContainers(experiment, state ? [...state.containers] : []); }
  catch (error) { cleanupError = error; }
  if (state?.promise) await state.promise.catch(() => {});
  try { await settleExperimentContainers(getExperiment(id)); cleanupError = null; }
  catch (error) { cleanupError = error; }
  if (cleanupError) { updateExperimentTotals(id, "cleanup_failed"); throw cleanupError; }
  const timestamp = now();
  db.transaction(() => {
    db.query("UPDATE experiment_runs SET status='cancelled',output=?,updated_at=? WHERE experiment_id=? AND status IN ('queued','running')")
      .run("Experiment cancelled", timestamp, id);
    db.query("UPDATE experiments SET status='cancelled',updated_at=? WHERE id=?").run(timestamp, id);
  })();
  updateExperimentTotals(id, "cancelled");
  return getExperiment(id);
}

export async function recoverExperiments(settle = settleExperimentContainers) {
  const interrupted = db.query(`SELECT * FROM experiments WHERE status IN ('queued','running','cleanup_failed')
    OR (status='cancelled' AND EXISTS (SELECT 1 FROM experiment_runs r WHERE r.experiment_id=experiments.id AND r.status IN ('queued','running')))` ).all();
  for (const experiment of interrupted) {
    experiment.runs = db.query("SELECT * FROM experiment_runs WHERE experiment_id=?").all(experiment.id);
    try {
      await settle(experiment);
    } catch (error) {
      console.error(`Could not settle interrupted experiment ${experiment.id}`, error);
      updateExperimentTotals(experiment.id, "cleanup_failed");
      continue;
    }
    const timestamp = now();
    db.query("UPDATE experiment_runs SET status='failed',output=?,updated_at=? WHERE experiment_id=? AND status IN ('queued','running')")
      .run("Interrupted by Magma restart", timestamp, experiment.id);
    updateExperimentTotals(experiment.id, "interrupted");
  }
}
