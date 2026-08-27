import { afterEach, describe, expect, test } from "bun:test";
import { db } from "../modules/db.js";
import { createExperiment, experimentCases, getExperiment, recoverExperiments } from "../modules/experiments.js";
import { createTemplate, deleteTemplate } from "../modules/templates.js";

const cleanup = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()();
});

describe("database integrity", () => {
  test("applies the current schema migration", () => {
    expect(db.query("PRAGMA user_version").get().user_version).toBe(1);
  });

  test("count-only experiments support the documented maximum", () => {
    expect(experimentCases({ count: 500 })).toHaveLength(500);
  });

  test("Compose slugs are unique per Docker host", () => {
    const first = crypto.randomUUID(), second = crypto.randomUUID(), slug = `test-${first.slice(0, 8)}`, timestamp = new Date().toISOString();
    cleanup.push(() => db.query("DELETE FROM projects WHERE id IN (?,?)").run(first, second));
    db.query("INSERT INTO projects (id,host_id,name,slug,yaml,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(first, "local", "First", slug, "services: {}", timestamp, timestamp);
    expect(() => db.query("INSERT INTO projects (id,host_id,name,slug,yaml,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run(second, "local", "Second", slug, "services: {}", timestamp, timestamp)).toThrow();
  });

  test("invalid experiment cases leave no partial rows", () => {
    const template = createTemplate({ hostId: "local", name: "Invalid cases", config: { image: "alpine" } });
    cleanup.push(() => deleteTemplate(template.id));
    const before = db.query("SELECT COUNT(*) count FROM experiments").get().count;
    expect(() => createExperiment({ templateId: template.id, cases: [{ name: "valid" }, null] })).toThrow("Invalid experiment case");
    expect(db.query("SELECT COUNT(*) count FROM experiments").get().count).toBe(before);
  });

  test("startup recovery marks persisted work as interrupted", async () => {
    const template = createTemplate({ hostId: "local", name: "Recovery", config: { image: "alpine" } });
    const experimentId = crypto.randomUUID(), runId = crypto.randomUUID(), timestamp = new Date().toISOString();
    cleanup.push(() => {
      db.query("DELETE FROM experiments WHERE id=?").run(experimentId);
      deleteTemplate(template.id);
    });
    db.query(`INSERT INTO experiments (id,host_id,template_id,name,mode,concurrency,status,total,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(experimentId, "local", template.id, "Recovery", "persistent", 1, "queued", 1, timestamp, timestamp);
    db.query(`INSERT INTO experiment_runs (id,experiment_id,case_index,name,config,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(runId, experimentId, 0, "Case", "{}", "queued", timestamp, timestamp);
    await recoverExperiments(async () => {});
    const recovered = getExperiment(experimentId);
    expect(recovered.status).toBe("interrupted");
    expect(recovered.completed).toBe(1);
    expect(recovered.runs[0].status).toBe("failed");
  });
});
