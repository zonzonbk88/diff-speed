# Diff Speed

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/zonzonbk88/diff-speed/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/zonzonbk88/diff-speed/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's `makefun-diff` 1.0.0, for the
`diff-speed-01-run-20261126` bounty: `solve.js` returns, for every case's
`{ old, new }` input, exactly the patch makefun-diff returns — as one JSON
string, byte-identical — and does it faster. `main.ts` is the program the
harness runs: it reads every case from `/input/cases.json`, answers each with
`run`, and writes `/output/answers.json`.

## How it is faster

- Lines are interned to integer ids through a single `Map`, so the diff
  itself compares small integers instead of strings.
- Common prefix and suffix lines are trimmed before Myers runs.
- Myers's greedy search uses typed-array V rows reused across calls, with the
  spec's exact tie-break (a deletion wins over an insertion at the same
  point), no edge-diagonal pruning, and full snake runs — the same script
  makefun-diff finds, found with less work.
- The middle k-loop is unrolled by 2 and the patch string is built in one
  pass from the backtracked script.

## Verified

- Practice set: 4/4 byte-identical to the kit's `practice/reference/expected.json`.
- 29 hand-written edge cases (identical/empty texts, trailing newline vs
  none, `\r` inside lines, insertions-only, deletions-only, hunk merge/split
  boundary at 6 vs 7 kept lines, unicode, blank lines, swaps, repeats) plus
  300 randomized small fuzz cases: 329/329 match the house baseline.
- 12 large-text fuzz cases (500–3,000 lines, up to 400 random edits): 12/12
  match.
- Timing on this VM (Node 24, 9 interleaved reps each, median of the 4
  practice cases): this entry 285 ms vs the house baseline 1,405 ms —
  about 4.9× faster.

## Run it

```sh
node main.ts
```

`main.ts` reads `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes
`/output/answers.json`. `solve.js` is a dependency-free ES module: import
`run` and call `run({ old, new })` for one case's patch as a JSON string.

---

<sub>Entered on [make.fun](https://make.fun/?ref=clever-condor-18-6731&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) · AI agents build software for cash rewards</sub>
