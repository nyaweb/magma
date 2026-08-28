# Ronda 00 — tests `pruneLineage`

Archivos completos de los empatados: `archive/02-tags.test.js`, `14-tags.test.js`, `17-tags.test.js`.

El ganador y los empates añadieron un `describe("pruneLineage")` de 4 casos sobre las mismas 2 filas de `matchLineage`. 02 usa `toHaveLength`. 14 y 17 asertan la fila que queda.

## Ganador — slot 02

```js
describe("pruneLineage", () => {
  const rows = [
    { container: "lab", repository: "magma/lab:1", imageId: "sha256:abcd1234" },
    { container: "other", repository: "magma/x:2", imageId: "sha256:ffff" },
  ];
  test("match", () => expect(pruneLineage(rows, "lab")).toHaveLength(1));
  test("no match", () => expect(pruneLineage(rows, "missing")).toHaveLength(2));
  test("empty", () => expect(pruneLineage(null, "lab")).toEqual([]));
  test("prefix", () => expect(pruneLineage(rows, "sha256:abcd")).toHaveLength(1));
});
```

Import: `bumpSeq, makeEntry, matchLineage, peekSeq, pruneLineage`. Suite completa: 79 pass (75 previos + 4).

## Empate 14 — same 4 tests, aserción más fuerte

```js
  test("match", () => expect(pruneLineage(rows, "lab")).toEqual([rows[1]]));
  test("no match", () => expect(pruneLineage(rows, "missing")).toEqual(rows));
  test("empty", () => expect(pruneLineage(null, "lab")).toEqual([]));
  test("prefix", () => expect(pruneLineage(rows, "sha256:abcd")).toEqual([rows[1]]));
```

## Empate 17 — mismos 4, nombres distintos

```js
  test("removes matching container", () => expect(pruneLineage(rows, "lab")).toEqual([rows[1]]));
  test("no match keeps all", () => expect(pruneLineage(rows, "nomatch")).toEqual(rows));
  test("empty", () => expect(pruneLineage(null, "lab")).toEqual([]));
  test("prefix removes by imageId", () => expect(pruneLineage(rows, "sha256:abcd")).toEqual([rows[1]]));
```

## Familias de `tags.test.js` (hash sha256[:12])

`prune` = número de `test(` dentro del describe prune. Baseline sin prune: hash `41afa70d976c`.

| hash | n | prune tests | slots |
|---|---:|---:|---|
| e1832e09f555 | 14 | 5 | 14, 22–25, 28–31, 41, 42, 44, 48, 49 |
| 41afa70d976c | 9 | 0 | 01, 03–06, 18, 19, 37, 38 |
| b4ba13e61d78 | 3 | 5 | **02**, 20, 39 |
| db7f77e93d26 | 3 | 5 | 10, 45, 47 |
| 1098b9415ff6 | 2 | 5 | 07, 46 |
| aafe4f5d2bc1 | 1 | 5 | 08 |
| 8f9388295e16 | 1 | 5 | 09 |
| be0697463932 | 1 | 5 | 11 |
| afac45e9f4d8 | 1 | 5 | 12 |
| 9218bf243a59 | 1 | 5 | 13 |
| 92f54de1b100 | 1 | 6 | 15 |
| c1ba793ae7b0 | 1 | 5 | 16 |
| c00213f1eb2d | 1 | 4 | **17** |
| 219fd9618438 | 1 | 5 | 21 |
| fd684acb611b | 1 | 5 | 26 |
| 21d0cc84e5aa | 1 | 5 | 27 |
| 20e21d017115 | 1 | 5 | 32 |
| 0ff315ffe1c4 | 1 | 6 | 33 |
| 659aeec238d9 | 1 | 5 | 34 |
| 33ccef1fc4a8 | 1 | 6 | 35 |
| 312caa8e5d6b | 1 | 4 | 36 (3 filas; prefix deja 1) |
| 91d61fb7d91f | 1 | 5 | 40 |
| 30777294237d | 1 | 4 | 43 |
| 0d9e8e104223 | 1 | 4 | 50 |

La familia más copiada (14 slots, hash `e1832e09f555`) es la de 14: `toEqual([rows[1]])` + un 5.º test extra en varios (empty array). 02 no es la familia modal; es la más corta que cubre el contrato.

## 36 (muse-spark 2.ª) — 3 filas, prefix más estricto

```js
  const rows = [
    { container: "lab", repository: "magma/lab:1", imageId: "sha256:abcd1234" },
    { container: "other", repository: "magma/x:2", imageId: "sha256:ffff" },
    { container: "lab2", repository: "magma/lab:2", imageId: "sha256:abcd9999" },
  ];
  test("match removes matching entries", () => expect(pruneLineage(rows, "lab")).toHaveLength(2));
  test("no match keeps all", () => expect(pruneLineage(rows, "nomatch")).toHaveLength(3));
  test("empty returns empty", () => expect(pruneLineage(null, "lab")).toEqual([]));
  test("prefix removes by imageId prefix", () => expect(pruneLineage(rows, "sha256:abcd")).toHaveLength(1));
```

Mejor cobertura de prefix (dos imageId `sha256:abcd*`). Costó 2 líneas extra → score 44, no ganó.

## Qué se exigía vs qué se añadió

Contrato: match, no match, empty, prefix. Cuatro tests. Quien añadió 5–6 (empty array, by repo, no mutate) pagó diff y no ganó. 17 y 02 cubren exactamente 4.
