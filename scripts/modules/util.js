export const STACKS = process.env.MAGMA_STACKS || "/stacks";
export const DATA = process.env.MAGMA_DATA || "/data";

export async function run(cmd, args = [], input) {
  const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe", stdin: input != null ? "pipe" : "ignore" });
  input != null && (proc.stdin.write(input), proc.stdin.end());
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}
export const docker = (args, input) => run("docker", args, input);
export const lines = (t) => t.split("\n").map((l) => l.trim()).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
export const need = async (args, err, input) => {
  const { code, stdout, stderr } = await docker(args, input);
  return code === 0 ? stdout : Promise.reject(new Error(stderr.trim() || err));
};
export const readJson = async (p, fallback) => {
  const f = Bun.file(p);
  return await f.exists() ? f.json().catch(() => fallback) : fallback;
};
export const writeJson = (p, data) => Bun.write(p, JSON.stringify(data, null, 2));
export const json = (data, status = 200) => Response.json(data, { status });

let gate = Promise.resolve();
export const locked = (fn) => (gate = gate.then(fn, fn));
