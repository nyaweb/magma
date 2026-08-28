# Ronda 00 — tags / pruneLineage

Ganó **slot 02 `openai/gpt-5.4-mini`**. Diff más chico que cumplía el contrato (score `42`). Empate de tamaño con **14 `opencode/big-pickle`** y **17 `opencode/muse-spark-1.2-contributor-free`**. `done.log` pone a 02 primero. Shippeado en `dd9ad26`.

Farm original: `/tmp/magma-contest`. Prompt: `archive/00-PROMPT.txt`. Score crudo: `00-tags-prune-score.tsv`.

## Contrato

Cuando se borra un contenedor o imagen, Magma debe tirar las filas de lineage que matchean.

1. `pruneLineage(entries, ref)` en `scripts/modules/tags.js`: inverso de `matchLineage` (container, repository, o prefijo de `imageId`).
2. Tras `docker rm` / `docker rmi` ok: load → prune → write.
3. Tests bun: match, no match, empty, prefix.
4. Diff mínimo.

Baseline:

```js
export const matchLineage = (entries, ref) =>
  (entries || []).filter((e) => [e.container, e.repository].includes(ref) || (ref && e.imageId?.startsWith(ref)));

export const removeContainer = async (ref, { force = true } = {}) => { requireRef(ref); await assertMutable(ref); return verb(["rm"], ref, force); };
export const removeImage = (ref, { force = false } = {}) => verb(["rmi"], requireRef(ref), force);
```

50 slots, 19 modelos en ciclo `(slot-1) % 19`, timeout 420s, concurrency ~6. 41 PASS, 9 NO_RESULT.

## Empate 02 / 14 / 17

| | 02 gpt-5.4-mini | 14 big-pickle | 17 muse-spark |
|---|---|---|---|
| score `diff` | **42** | **42** | **42** |
| +/− vs 01 | 18 / 4 | 18 / 4 | 18 / 4 |
| `tags.js` | `!(A \|\| B)` | **byte-idéntico a 02** | De Morgan `!A && !B` |
| `removeImage` | `verb(["rmi"], requireRef(ref), force)` | `requireRef` aparte | igual 02, `res` vs `out` |
| tests | `toHaveLength` | `toEqual([rows[1]])` | `toEqual`, nombres largos |
| `done.log` | **1.º** | 10.º | 11.º |

`!(A||B)` y `!A && !B` son la misma función. 02 gana por llegar primero.

### Código shippeado (02)

```js
export const pruneLineage = (entries, ref) =>
  (entries || []).filter((e) => !([e.container, e.repository].includes(ref) || (ref && e.imageId?.startsWith(ref))));

export const removeContainer = async (ref, { force = true } = {}) => {
  requireRef(ref); await assertMutable(ref);
  const out = await verb(["rm"], ref, force);
  await writeJson(LINEAGE, pruneLineage(await loadLineage(), ref));
  return out;
};
export const removeImage = async (ref, { force = false } = {}) => {
  const out = await verb(["rmi"], requireRef(ref), force);
  await writeJson(LINEAGE, pruneLineage(await loadLineage(), ref));
  return out;
};
```

Carga lineage **después** del rm. Si `verb` tira, no se escribe.

## Familias de prune (8 + none)

Nadie cambió la regla de match. Solo la forma.

| Familia | n | Slots |
|---|---:|---|
| `!(A\|\|B)` | 12 | 02, 08, 14, 15, 16, 27, 28, 30, 32, 34, 39, 40 |
| `!A && !B` | 19 | 07, 09, 17, 20, 22–26, 31, 35, 36, 37 (sin wire), 41, 43, 45, 47, 49, 50 |
| helper `matchesLineage` + `entry` | 4 | 10, 11, 12, 29 |
| helper `matchesLineage` + `e` 1 línea | 3 | 21, 46, 48 |
| helper `matchesLineage` wrap | 1 | 42 |
| helper `matchesRef` | 1 | 13 |
| DRY `!matchLineage([e]).length` | 1 | 33 |
| helper `matchesLineageRef` | 1 | 44 |
| sin prune | 8 | 01, 03–06, 18, 19, 38 |

Helpers (mismo predicado):

```js
const matchesLineage = (entry, ref) =>
  [entry.container, entry.repository].includes(ref) || (ref && entry.imageId?.startsWith(ref));
export const pruneLineage = (entries, ref) => (entries || []).filter((entry) => !matchesLineage(entry, ref));

// 33 — reusa matchLineage, docker gordo (diff 64)
export const pruneLineage = (entries, ref) => (entries || []).filter((e) => !matchLineage([e], ref).length);
```

## Docker: desvíos reales

Patrón ganador: `verb` ok → `writeJson(LINEAGE, pruneLineage(await loadLineage(), ref))`.

| Quién | Qué |
|---|---|
| 09, 29 | cargan lineage **antes** del rm (write puede pisar un stamp concurrente) |
| 09, 10, 28, 39 | `locked()` extra |
| 27 | helper `removeLineage`, diff 44 |
| 15 | `await pruneLineage` (es sync) |
| 37 | prune sí, wire no |

El resto es one-liner vs `{ }`, nombre de variable, `requireRef` dentro vs fuera de `verb`.

Cercanos: **27** `gpt-5.6-luna` `44`, **36** muse-spark 2.ª vuelta `44`.

## 50 slots

| Slot | Modelo | Ronda | Status | prune | diff | Nota |
|---:|---|---:|---|---|---:|---|
| 01 | gpt-5.4-mini-fast | 1 | NO_RESULT | — | 0 | `Failed to execute statement` |
| **02** | **gpt-5.4-mini** | **1** | **PASS** | **`!(A\|\|B)`** | **42** | **ganador** |
| 03 | gpt-5.4-fast | 1 | NO_RESULT | — | 0 | mismo error 01 |
| 04 | gpt-5.4 | 1 | NO_RESULT | — | 0 | idem |
| 05 | gpt-5.5-fast | 1 | NO_RESULT | — | 0 | idem |
| 06 | gpt-5.5 | 1 | NO_RESULT | — | 0 | idem |
| 07 | gpt-5.6-luna-fast | 1 | PASS | `!A&&!B` | 64 | |
| 08 | gpt-5.6-luna | 1 | PASS | `!(A\|\|B)` | 64 | |
| 09 | gpt-5.6-sol-fast | 1 | PASS | `!A&&!B` | 78 | locked + load-before |
| 10 | gpt-5.6-sol | 1 | PASS | helper | 70 | |
| 11 | gpt-5.6-terra-fast | 1 | PASS | helper | 68 | |
| 12 | gpt-5.6-terra | 1 | PASS | helper | 68 | |
| 13 | gpt-5.3-codex-spark | 1 | PASS | `matchesRef` | 64 | |
| **14** | **big-pickle** | **1** | **PASS** | **`!(A\|\|B)`** | **42** | tags.js = 02 |
| 15 | hy3-free | 1 | PASS | `!(A\|\|B)` | 50 | await de más |
| 16 | mimo-v2.5-free | 1 | PASS | `!(A\|\|B)` | 92 | peor diff |
| **17** | **muse-spark** | **1** | **PASS** | **`!A&&!B`** | **42** | De Morgan |
| 18 | nemotron-3-ultra-free | 1 | NO_RESULT | — | 0 | cortó leyendo |
| 19 | nemotron-3.5-lightning-free | 1 | NO_RESULT | — | 0 | provider 404 |
| 20 | gpt-5.4-mini-fast | 2 | PASS | `!A&&!B` | 64 | |
| 21 | gpt-5.4-mini | 2 | PASS | helper `e` | 46 | |
| 22 | gpt-5.4-fast | 2 | PASS | `!A&&!B` | 64 | |
| 23 | gpt-5.4 | 2 | PASS | `!A&&!B` | 64 | |
| 24 | gpt-5.5-fast | 2 | PASS | `!A&&!B` | 64 | |
| 25 | gpt-5.5 | 2 | PASS | `!A&&!B` | 64 | |
| 26 | gpt-5.6-luna-fast | 2 | PASS | `!A&&!B` | 62 | |
| 27 | gpt-5.6-luna | 2 | PASS | `!(A\|\|B)` | 44 | `removeLineage` |
| 28 | gpt-5.6-sol-fast | 2 | PASS | `!(A\|\|B)` | 60 | locked |
| 29 | gpt-5.6-sol | 2 | PASS | helper | 72 | load-before |
| 30 | gpt-5.6-terra-fast | 2 | PASS | `!(A\|\|B)` | 64 | |
| 31 | gpt-5.6-terra | 2 | PASS | `!A&&!B` | 64 | |
| 32 | gpt-5.3-codex-spark | 2 | PASS | `!(A\|\|B)` | 70 | |
| 33 | big-pickle | 2 | PASS | DRY | 64 | mejor prune, docker gordo |
| 34 | hy3-free | 2 | PASS | `!(A\|\|B)` | 58 | |
| 35 | mimo-v2.5-free | 2 | PASS | `!A&&!B` | 70 | |
| 36 | muse-spark | 2 | PASS | `!A&&!B` | 44 | docker = 17 |
| 37 | nemotron-3-ultra-free | 2 | NO_RESULT | `!A&&!B` | 8 | prune sí, no wire |
| 38 | nemotron-3.5-lightning-free | 2 | NO_RESULT | — | 0 | 404 |
| 39 | gpt-5.4-mini-fast | 3 | PASS | `!(A\|\|B)` | 72 | locked |
| 40 | gpt-5.4-mini | 3 | PASS | `!(A\|\|B)` | 66 | |
| 41 | gpt-5.4-fast | 3 | PASS | `!A&&!B` | 64 | |
| 42 | gpt-5.4 | 3 | PASS | helper wrap | 70 | |
| 43 | gpt-5.5-fast | 3 | PASS | `!A&&!B` | 64 | |
| 44 | gpt-5.5 | 3 | PASS | `matchesLineageRef` | 70 | |
| 45 | gpt-5.6-luna-fast | 3 | PASS | `!A&&!B` | 64 | |
| 46 | gpt-5.6-luna | 3 | PASS | helper `e` | 66 | |
| 47 | gpt-5.6-sol-fast | 3 | PASS | `!A&&!B` | 62 | |
| 48 | gpt-5.6-sol | 3 | PASS | helper `e` | 64 | |
| 49 | gpt-5.6-terra-fast | 3 | PASS | `!A&&!B` | 64 | |
| 50 | gpt-5.6-terra | 3 | PASS | `!A&&!B` | 64 | |

Lección para las siguientes rondas: una pasada por modelo basta. Vueltas 2–3 no superaron el primer PASS mínimo. `nemotron-3.5-lightning-free` 404. OpenAI “fast/full” a veces falla la 1.ª tanda y pasa la 2.ª.

## Por modelo

| Modelo | PASS | Mejor diff |
|---|---:|---:|
| gpt-5.4-mini | 3/3 | **42** |
| big-pickle | 2/2 | **42** |
| muse-spark | 2/2 | **42** |
| gpt-5.6-luna | 3/3 | 44 |
| hy3-free | 2/2 | 50 |
| resto OpenAI 5.4–5.6 | 2/3 o 3/3 | 60–72 |
| mimo-v2.5-free | 2/2 | 70 |
| nemotron-3-ultra-free | 0/2 | — |
| nemotron-3.5-lightning-free | 0/2 | — |
