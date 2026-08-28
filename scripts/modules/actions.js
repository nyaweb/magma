import { nextFreeNames, slug, splitRef } from "./names.js";
import { prepExec } from "./recipe.js";
import {
  buildImage, commitContainer, execIn, listContainers, nextMagmaTag, runContainer, runMany,
} from "./docker.js";
import { writeStack } from "./compose.js";

export const stamp = async ({ container, n = 1, repo, prefix, exec, message }) => {
  if (!container) throw new Error("container required");
  const command = prepExec(exec);
  const prepared = command ? await execIn(container, command) : null;
  const repository = await nextMagmaTag(repo || "magma/slim");
  const committed = await commitContainer({ container, repository, message: message || (command ? "stamp+prep" : "stamp") });
  const spawned = await runMany({ image: repository, n, prefix: prefix || container });
  return { ok: true, prepared, committed, spawned };
};

export const evolve = async ({ container, name, repo, message, spawn = true }) => {
  if (!container) throw new Error("container required");
  const repository = await nextMagmaTag(repo);
  const committed = await commitContainer({ container, repository, message: message || `evolve ${container}` });
  const wanted = slug(name || `${container}-${splitRef(repository).tag}`, "clone");
  const taken = (await listContainers()).map((c) => c.name);
  const clone = taken.includes(wanted) ? nextFreeNames(wanted, 1, taken)[0] : wanted;
  const stack = await writeStack({ name: clone, from: { service: clone, image: repository, containerName: clone } });
  const spawned = spawn !== false ? await runContainer({ image: repository, name: clone }) : null;
  return { ok: true, committed, stack, spawned };
};

export const duplicate = (body) => evolve({ ...body, message: body.message || `duplicate ${body.container}` });

export const bake = async ({ name = "slim", from = "debian:bookworm-slim", tag = "magma/slim:upgraded", n = 0, prefix, dockerfile } = {}) => {
  const built = await buildImage({ tag, from, dockerfile });
  const stack = await writeStack({ name, from: { service: name, image: tag, bake: true, from, dockerfile, containerName: name } });
  const spawned = n > 0 ? await runMany({ image: tag, n, prefix: prefix || name }) : null;
  return { ok: true, built, stack, spawned };
};
