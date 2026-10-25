"""cshogi でランダムな局面を作り、SFEN と合法手（USI）を JSON に書き出す。

TypeScript 側の tests/crosscheck.test.ts がこの JSON を読み、src/rules の legalMoves() と
cshogi の合法手が完全に一致するかを確かめる。

使い方（tools/.venv に cshogi を入れておく）:
  tools/.venv/Scripts/python tools/rules_crosscheck.py --count 10000 --seed 1 \
      --out tests/fixtures/crosscheck-10000.json

局面の作り方:
  平手から乱数で指し進め、途中の局面をときどき記録する。駒を取る手・王手・打つ手を
  選びやすくして、持ち駒・成駒・王手・詰み（合法手 0）の局面が多く出るようにする。
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import cshogi

MAX_PLIES = 300
RECORD_PROB = 0.12


def choose_move(board: cshogi.Board, moves: list[int], rng: random.Random, style: float) -> int:
    """style が大きいほど、取る手・王手・打つ手を好む（0 なら一様乱数）"""
    if style <= 0 or rng.random() > style:
        return rng.choice(moves)
    weights = []
    for m in moves:
        w = 1.0
        if cshogi.move_is_drop(m):
            w += 1.0
        if board.piece(cshogi.move_to(m)) != cshogi.NONE:
            w += 3.0
        board.push(m)
        if board.is_check():
            w += 3.0
        board.pop()
        weights.append(w)
    return rng.choices(moves, weights=weights, k=1)[0]


def record(board: cshogi.Board) -> dict:
    moves = sorted(cshogi.move_to_usi(m) for m in board.legal_moves)
    return {"sfen": board.sfen(), "moves": moves}


def generate(count: int, seed: int) -> tuple[list[dict], dict]:
    rng = random.Random(seed)
    positions: list[dict] = []
    seen: set[str] = set()
    stats = {"games": 0, "inCheck": 0, "noMoves": 0, "withHands": 0}

    while len(positions) < count:
        stats["games"] += 1
        board = cshogi.Board()
        style = rng.choice([0.0, 0.5, 0.9])
        for _ in range(rng.randint(20, MAX_PLIES)):
            moves = list(board.legal_moves)
            # 合法手 0（詰みなど）の局面は必ず記録する
            if not moves or rng.random() < RECORD_PROB:
                key = " ".join(board.sfen().split(" ")[:3])
                if key not in seen:
                    seen.add(key)
                    positions.append(record(board))
                    stats["inCheck"] += int(board.is_check())
                    stats["noMoves"] += int(not moves)
                    stats["withHands"] += int(board.sfen().split(" ")[2] != "-")
                    if len(positions) >= count:
                        break
            if not moves:
                break
            board.push(choose_move(board, moves, rng, style))

    return positions, stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--count", type=int, default=10000, help="局面の数")
    parser.add_argument("--seed", type=int, default=1, help="乱数の種")
    parser.add_argument(
        "--out", type=Path, default=Path("tests/fixtures/crosscheck-10000.json"), help="出力先"
    )
    args = parser.parse_args()

    positions, stats = generate(args.count, args.seed)
    data = {
        "generator": "tools/rules_crosscheck.py",
        "cshogi": getattr(cshogi, "__version__", "unknown"),
        "seed": args.seed,
        "stats": stats,
        "positions": positions,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{len(positions)} 局面を書き出しました: {args.out}  {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
