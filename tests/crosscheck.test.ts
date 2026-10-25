// cshogi（tools/rules_crosscheck.py が作った JSON）と src/rules の合法手を突き合わせる。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { illegalReason, legalMoves, parseSfen, type Position } from '../src/rules';

interface Fixture {
  seed: number;
  positions: { sfen: string; moves: string[] }[];
}

const FILES = ['crosscheck-500.json', 'crosscheck-10000.json'];

function load(name: string): Fixture | undefined {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as Fixture) : undefined;
}

interface Mismatch {
  sfen: string;
  onlyTs: string[];
  onlyCshogi: string[];
}

function compare(fx: Fixture): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const { sfen, moves } of fx.positions) {
    const ts = new Set(legalMoves(parseSfen(sfen)));
    const py = new Set(moves);
    const onlyTs = [...ts].filter((m) => !py.has(m));
    const onlyCshogi = [...py].filter((m) => !ts.has(m));
    if (onlyTs.length || onlyCshogi.length || ts.size !== moves.length) {
      mismatches.push({ sfen, onlyTs, onlyCshogi });
    }
  }
  return mismatches;
}

const FILES_AB = 'abcdefghi';
/** 全ての「書式上ありうる手」（盤上の移動 81×81×成/不成、7種×81升の打ち） */
function allCandidateUsis(pos: Position): string[] {
  const squares: string[] = [];
  for (let f = 1; f <= 9; f++) for (const r of FILES_AB) squares.push(`${f}${r}`);
  const out: string[] = [];
  for (const sq of pos.board.byColor(pos.turn)) {
    const from = `${(sq & 15) + 1}${FILES_AB[sq >>> 4]}`;
    for (const to of squares) {
      if (to !== from) out.push(`${from}${to}`, `${from}${to}+`);
    }
  }
  for (const p of 'RBGSNLP') for (const to of squares) out.push(`${p}*${to}`);
  return out;
}

describe('cshogi とのルール照合', () => {
  for (const name of FILES) {
    const fx = load(name);
    it.runIf(fx !== undefined)(`${name}: 合法手が完全一致する`, () => {
      if (!fx) return;
      const mismatches = compare(fx);
      // 不一致があれば先頭数件の SFEN と差分を表示する
      expect(mismatches.slice(0, 5)).toEqual([]);
      expect(fx.positions.length).toBeGreaterThan(0);
    });
  }

  it('crosscheck-500.json: illegalReason() は合法手とそれ以外を正しく分ける', () => {
    const fx = load('crosscheck-500.json');
    expect(fx).toBeDefined();
    for (const { sfen } of (fx?.positions ?? []).slice(0, 150)) {
      const pos = parseSfen(sfen);
      const legal = new Set(legalMoves(pos));
      for (const usi of allCandidateUsis(pos)) {
        const reason = illegalReason(pos, usi);
        if (legal.has(usi) !== (reason === null)) {
          expect({ sfen, usi, reason, legal: legal.has(usi) }).toBeNull();
        }
      }
    }
  });
});
