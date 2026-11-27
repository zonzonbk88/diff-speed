// Fast reimplementation of makefun-diff 1.0.0, written from its spec
// (RULES.txt / vendor/makefun-diff/index.js header). Dependency-free ES module.
// run(input) returns make.fun's patch of {old, new} as one JSON string.
//
// Shape of the algorithm (identical to the spec):
//  - lines are cut after every '\n' only; a trailing line without '\n' is a line;
//    two lines are equal only as the same code units, '\n' (or its absence) included.
//  - common prefix kept, then common suffix of what is left; between them Myers's
//    greedy search, deletion preferred on ties, no edge-diagonal pruning, snakes.
//  - patch header + hunks with up to 3 context lines, runs <= 6 kept lines apart
//    share a hunk, deletions before insertions, '%' after a line with no newline.
//
// Speed: lines are interned to integer ids (one Map), the middle is diffed on
// Int32Arrays, Myers keeps its V rows as Int32Arrays (no per-step objects) and
// reuses them across calls (every entry of a row is rewritten on each run, so
// reuse needs no clearing), and the patch is built as pieces joined once.

const KEEP = 0;
const DEL = 1;
const INS = 2;
const CONTEXT = 3;

/** Myers V rows, reused across calls: Vs[d] is an Int32Array of length >= 2d+1. */
const Vs = [];

/** Intern the lines of `text` to integer ids; `ids` maps line -> id, `strs` id -> line. */
function tokenize(text, ids, strs) {
  const out = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) {
      if (start < text.length) {
        const line = text.slice(start);
        let id = ids.get(line);
        if (id === undefined) { id = strs.length; ids.set(line, id); strs.push(line); }
        out.push(id);
      }
      break;
    }
    const line = text.slice(start, nl + 1);
    let id = ids.get(line);
    if (id === undefined) { id = strs.length; ids.set(line, id); strs.push(line); }
    out.push(id);
    start = nl + 1;
  }
  return Int32Array.from(out);
}

/**
 * The edit runs of the middle slices a[0..n) into b[0..m), as [kind, count] pairs
 * in order. Myers's greedy search exactly as the spec states it: for d = 0, 1, ...
 * and k = -d..d step 2, the furthest x on k is the deletion from k-1 (x+1) or the
 * insertion from k+1 (same x), whichever reaches further into the old text, the
 * deletion on a tie; a candidate past either text's end is no candidate; then the
 * snake over equal lines. The first path to reach both ends is the script.
 * Backtracking replays the same choice from the stored V rows.
 */
function myersRuns(a, b, n, m) {
  // Vs[d][k+d] = furthest x on diagonal k after d edits and its snake, or -1
  // when no path reaches k. Rows are reused across calls (see Vs above).
  let D = 0;
  let kFinal = 0;
  outer: for (let d = 0; d <= n + m; d++) {
    let row = Vs[d];
    if (row === undefined || row.length < 2 * d + 1) {
      row = new Int32Array(2 * d + 1);
      Vs[d] = row;
    }
    if (d === 0) {
      let x = 0;
      let y = 0;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      row[0] = x;
      if (x >= n && y >= m) { D = 0; kFinal = 0; break outer; }
      continue;
    }
    const prev = Vs[d - 1];
    // k = -d: only the insertion from k+1 = -(d-1) can reach it.
    {
      const xq = prev[0];
      let x = -1;
      if (xq !== -1 && xq + d - 1 < m) x = xq;
      if (x !== -1) {
        let y = x + d;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        row[0] = x;
        if (x >= n && y >= m) { D = d; kFinal = -d; break outer; }
      } else {
        row[0] = -1;
      }
    }
    // Middle k = -d+2 .. d-2 step 2: both candidates; running prev indices,
    // unrolled by 2 (k and k+2 share one loop-control step; both read prev only).
    let iDel = 0;
    let iIns = 2;
    let k = -d + 2;
    const kEnd = d - 2;
    for (; k + 2 <= kEnd; k += 4, iDel += 4, iIns += 4) {
      {
        const xp = prev[iDel];
        const xq = prev[iIns];
        const delOk = xp !== -1 && xp < n;
        const insOk = xq !== -1 && xq - k - 1 < m;
        let x = -1;
        if (delOk && (!insOk || xp + 1 >= xq)) x = xp + 1;
        else if (insOk) x = xq;
        if (x === -1) { row[k + d] = -1; }
        else {
          let y = x - k;
          while (x < n && y < m && a[x] === b[y]) { x++; y++; }
          row[k + d] = x;
          if (x >= n && y >= m) { D = d; kFinal = k; break outer; }
        }
      }
      {
        const k2 = k + 2;
        const xp = prev[iDel + 2];
        const xq = prev[iIns + 2];
        const delOk = xp !== -1 && xp < n;
        const insOk = xq !== -1 && xq - k2 - 1 < m;
        let x = -1;
        if (delOk && (!insOk || xp + 1 >= xq)) x = xp + 1;
        else if (insOk) x = xq;
        if (x === -1) { row[k2 + d] = -1; }
        else {
          let y = x - k2;
          while (x < n && y < m && a[x] === b[y]) { x++; y++; }
          row[k2 + d] = x;
          if (x >= n && y >= m) { D = d; kFinal = k2; break outer; }
        }
      }
    }
    for (; k <= kEnd; k += 2, iDel += 2, iIns += 2) {
      const xp = prev[iDel];
      const xq = prev[iIns];
      const delOk = xp !== -1 && xp < n;
      const insOk = xq !== -1 && xq - k - 1 < m;
      let x = -1;
      if (delOk && (!insOk || xp + 1 >= xq)) x = xp + 1;
      else if (insOk) x = xq;
      if (x === -1) { row[k + d] = -1; continue; }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      row[k + d] = x;
      if (x >= n && y >= m) { D = d; kFinal = k; break outer; }
    }
    // k = d: only the deletion from k-1 = d-1 can reach it.
    {
      const xp = prev[2 * d - 2];
      let x = -1;
      if (xp !== -1 && xp < n) x = xp + 1;
      if (x !== -1) {
        let y = x - d;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        row[2 * d] = x;
        if (x >= n && y >= m) { D = d; kFinal = d; break outer; }
      } else {
        row[2 * d] = -1;
      }
    }
  }

  // Backtrack from (D, kFinal) to (0, 0), collecting runs in reverse order.
  const kinds = [];
  const counts = [];
  const push = (kind, count) => {
    if (count <= 0) return;
    const last = kinds.length - 1;
    if (last >= 0 && kinds[last] === kind) counts[last] += count;
    else { kinds.push(kind); counts.push(count); }
  };
  let x = n;
  let k = kFinal;
  for (let d = D; d >= 1; d--) {
    const prev = Vs[d - 1];
    let bd = -2;
    let bi = -2;
    let xp = 0;
    let xq = 0;
    if (k > -d) {
      xp = prev[k + d - 2];
      if (xp !== -1 && xp < n) bd = xp;
    }
    if (k < d) {
      xq = prev[k + d];
      if (xq !== -1 && xq - (k + 1) < m) bi = xq - 1;
    }
    let isDel;
    let px;
    if (bd >= bi) { isDel = true; px = xp + 1; }
    else { isDel = false; px = xq; }
    push(KEEP, x - px);
    push(isDel ? DEL : INS, 1);
    if (isDel) { x = xp; k = k - 1; }
    else { x = xq; k = k + 1; }
  }
  push(KEEP, x); // the d=0 snake from (0,0)
  kinds.reverse();
  counts.reverse();
  return { kinds, counts };
}

/** make.fun's own patch of input.old into input.new. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const ids = new Map();
  const strs = [];
  const A = tokenize(input.old, ids, strs);
  const B = tokenize(input.new, ids, strs);
  const n = A.length;
  const m = B.length;

  // Common prefix, then common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;

  const mid = myersRuns(A.subarray(prefix, n - suffix), B.subarray(prefix, m - suffix), n - prefix - suffix, m - prefix - suffix);

  // Runs over the whole texts: prefix keep, middle runs, suffix keep.
  const kinds = [];
  const counts = [];
  const pushRun = (kind, count) => {
    if (count <= 0) return;
    const last = kinds.length - 1;
    if (last >= 0 && kinds[last] === kind) counts[last] += count;
    else { kinds.push(kind); counts.push(count); }
  };
  pushRun(KEEP, prefix);
  for (let i = 0; i < mid.kinds.length; i++) pushRun(mid.kinds[i], mid.counts[i]);
  pushRun(KEEP, suffix);

  // Change runs: stretches of deletions/insertions between kept lines.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const count = counts[i];
    if (kind === KEEP) { o += count; p += count; continue; }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DEL) { c.dels += count; o += count; deleted += count; }
    else { c.ins += count; p += count; inserted += count; }
  }

  // Hunks: change runs at most 2*CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const lastOldNoNL = n > 0 && strs[A[n - 1]].charCodeAt(strs[A[n - 1]].length - 1) !== 10;
  const lastNewNoNL = m > 0 && strs[B[m - 1]].charCodeAt(strs[B[m - 1]].length - 1) !== 10;
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) {
        const line = strs[A[at]];
        out.push(at === n - 1 && lastOldNoNL ? `=${line}\n%\n` : `=${line}`);
      }
      for (let i = 0; i < c.dels; i++) {
        const line = strs[A[c.o + i]];
        out.push(c.o + i === n - 1 && lastOldNoNL ? `-${line}\n%\n` : `-${line}`);
      }
      for (let i = 0; i < c.ins; i++) {
        const line = strs[B[c.p + i]];
        out.push(c.p + i === m - 1 && lastNewNoNL ? `+${line}\n%\n` : `+${line}`);
      }
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) {
      const line = strs[A[at]];
      out.push(at === n - 1 && lastOldNoNL ? `=${line}\n%\n` : `=${line}`);
    }
  }
  return out.join('');
}
