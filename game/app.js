//------------------------------------------------------
// app.js（詰み判定 + 勝敗表示 完全版）
// ベースはユーザー提供コードを踏襲し、必要な補助関数を追加
//------------------------------------------------------

//------------------------------------------------------
// グローバル
//------------------------------------------------------
let board = [];
let hands = { b: {}, w: {} };
let turn = 'b';           // 'b' || 'w' || null(ゲーム終了)
let selected = null;
let aiWorker = null;

// タイマー
let blackTime = 900;
let whiteTime = 900;
let timer = null;

// 漢字変換
const KANJI = {
  FU: "歩", KY: "香", KE: "桂", GI: "銀",
  KI: "金", KA: "角", HI: "飛", OU: "玉"
};

// 成り駒の一文字表記
const PROMOTED_KANJI = {
  HI: "竜",
  KA: "馬",
  FU: "と",
  KY: "杏",
  KE: "圭",
  GI: "全"
};

//------------------------------------------------------
// 初期配置（飛車と角を入れ替え済）
//------------------------------------------------------
function initBoard() {
  board = Array.from({ length: 9 }, () => Array(9).fill(null));

  const place = (r, c, type, owner) =>
    board[r][c] = { type, promoted: false, owner };

  // --- 後手 ---
  place(0, 4, 'OU', 'w');
  place(0, 3, 'KI', 'w'); place(0, 5, 'KI', 'w');
  place(0, 2, 'GI', 'w'); place(0, 6, 'GI', 'w');
  place(0, 1, 'KE', 'w'); place(0, 7, 'KE', 'w');
  place(0, 0, 'KY', 'w'); place(0, 8, 'KY', 'w');

  // 飛 ↔ 角 入れ替え（後手）
  place(1, 1, 'HI', 'w'); // 飛
  place(1, 7, 'KA', 'w'); // 角

  for (let c = 0; c < 9; c++) place(2, c, 'FU', 'w');

  // --- 先手 ---
  place(8, 4, 'OU', 'b');
  place(8, 3, 'KI', 'b'); place(8, 5, 'KI', 'b');
  place(8, 2, 'GI', 'b'); place(8, 6, 'GI', 'b');
  place(8, 1, 'KE', 'b'); place(8, 7, 'KE', 'b');
  place(8, 0, 'KY', 'b'); place(8, 8, 'KY', 'b');

  // 飛 ↔ 角 入れ替え（先手）
  place(7, 1, 'KA', 'b'); // 角
  place(7, 7, 'HI', 'b'); // 飛

  for (let c = 0; c < 9; c++) place(6, c, 'FU', 'b');

  hands = { b: {}, w: {} };
  blackTime = 900;
  whiteTime = 900;
}

//------------------------------------------------------
// タイマー
//------------------------------------------------------
function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (turn === "b") {
      blackTime--;
      document.getElementById("blackTimer").textContent = fmt(blackTime);
      if (blackTime <= 0) showResult("後手の勝ち（先手時間切れ）");
    } else if (turn === "w") {
      whiteTime--;
      document.getElementById("whiteTimer").textContent = fmt(whiteTime);
      if (whiteTime <= 0) showResult("先手の勝ち（後手時間切れ）");
    }
  }, 1000);
}
// 秒を MM:SS に変換
function fmt(t) {
  t = Math.max(0, t);
  const m = String(Math.floor(t / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${m}:${s}`;
}



function fmt(t) {
  const m = String(Math.floor(t / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return `${m}:${s}`;
}

//------------------------------------------------------
// 盤面描画
//------------------------------------------------------
function drawBoard() {
  const boardDiv = document.getElementById("board");
  boardDiv.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if ((r + c) % 2 === 1) cell.classList.add("dark");
      cell.dataset.r = r;
      cell.dataset.c = c;

      const p = board[r][c];
      if (p) {
        const d = document.createElement("div");
        d.className = "piece";

        // 成り駒表示
        let text = "";
        if (p.promoted) {
          text = PROMOTED_KANJI[p.type] || KANJI[p.type];
        } else {
          text = KANJI[p.type];
        }

        d.textContent = text;

        if (p.owner === 'w') d.classList.add("rotated");
        if (selected && selected.r === r && selected.c === c)
          d.classList.add("selected");

        cell.appendChild(d);
      }

      cell.addEventListener("click", () => onCellClick(r, c));
      boardDiv.appendChild(cell);
    }
  }

  drawHands();
  updateTurnDisplay();
}

//------------------------------------------------------
// 持ち駒表示
//------------------------------------------------------
function drawHands() {
  const bDiv = document.getElementById("blackKomadai");
  const wDiv = document.getElementById("whiteKomadai");
  bDiv.innerHTML = "";
  wDiv.innerHTML = "";

  // createPieceBtn: 持ち駒1種分の DOM を作る
  const createPieceBtn = (owner, type, count) => {
    const btn = document.createElement("div");
    btn.className = "piece";
    btn.textContent = KANJI[type] + (count > 1 ? `(${count})` : "");
    if (owner === 'w') btn.classList.add("rotated");

    // クリックで選択（トグル）する
    btn.addEventListener("click", () => {
      if (turn !== owner) return;
      if (turn === null) return; // ゲーム終了時は無効

      // 同じ駒をもう一度クリックしたら解除 (トグル)
      if (selected && selected.drop && selected.owner === owner && selected.type === type) {
        selected = null;
        drawBoard();
        return;
      }

      // それ以外は選択状態にする（ドロップモード）
      selected = { drop: true, owner, type };
      drawBoard();
    });

    // 選択状態ならクラス追加（視覚的ハイライト）
    if (selected && selected.drop && selected.owner === owner && selected.type === type) {
      btn.classList.add("selected-hand");
    }

    return btn;
  };

  // 先手側の持ち駒（黒）
  Object.keys(hands.b).forEach(type =>
    bDiv.appendChild(createPieceBtn('b', type, hands.b[type]))
  );
  // 後手側の持ち駒（白）
  Object.keys(hands.w).forEach(type =>
    wDiv.appendChild(createPieceBtn('w', type, hands.w[type]))
  );
}

//------------------------------------------------------
// 手番表示
//------------------------------------------------------
function updateTurnDisplay() {
  const tElem = document.getElementById("turn");
  if (!tElem) return;
  tElem.textContent = (turn === 'b' ? "先手" : (turn === 'w' ? "後手" : "終了"));
}

//------------------------------------------------------
// 手番切り替え
//------------------------------------------------------
function nextTurn() {
  if (turn === null) return;
  turn = (turn === 'b' ? 'w' : 'b');
  updateTurnDisplay();
  drawBoard();
  startTimer();

  const aiEnable = document.getElementById("aiEnable").checked;
  if (aiEnable && turn === 'w') {
    thinkAI();
  }
}

//------------------------------------------------------
// セルクリック
//------------------------------------------------------
function onCellClick(r, c) {
  // ゲーム終了時は何もしない
  if (turn === null) return;

  const p = board[r][c];

  // --- 持ち駒ドロップ ---
  if (selected && selected.drop) {
    if (turn !== selected.owner) return;
    if (board[r][c]) return;

    // 打ち駒の簡易チェック（二歩・桂・香の打ち場所制限）
    if (selected.type === 'FU') {
      // 二歩チェック：同じ列に自分の(非成)歩があるか
      for (let rr = 0; rr < 9; rr++) {
        const pp = board[rr][c];
        if (pp && pp.owner === turn && pp.type === 'FU' && !pp.promoted) {
          // 二歩になる -> 拒否
          return;
        }
      }
    }
    if (selected.type === 'KE') {
      if ((turn === 'b' && r <= 1) || (turn === 'w' && r >= 7)) return;
    }
    if (selected.type === 'KY') {
      if ((turn === 'b' && r === 0) || (turn === 'w' && r === 8)) return;
    }

    // 実際にドロップ
    board[r][c] = { type: selected.type, promoted: false, owner: turn };
    hands[turn][selected.type]--;
    if (hands[turn][selected.type] <= 0) delete hands[turn][selected.type];

    // 選択解除してハイライト消す
    selected = null;

    // ドロップのあとに詰み判定（相手が詰むかどうか）
    drawBoard();
    // ドロップによる打ち歩詰めチェックは省略（高度ルール）。必要なら追加可能。

    // 相手の詰みを判定（例：先手が指して相手が詰み）
    const opponent = (turn === 'b') ? 'w' : 'b';
    if (isMate(board, hands, opponent)) {
      // 現在手番のプレイヤーが勝ち
      showResult(turn === 'b' ? '先手の勝ち' : '後手の勝ち');
      return;
    }

    nextTurn();
    return;
  }

  // --- 選択 ---
  if (!selected) {
    if (!p) return;
    if (p.owner !== turn) return;
    selected = { r, c };
    drawBoard();
    return;
  }

  // --- 移動 ---
  if (selected.r !== undefined) {
    movePiece(selected.r, selected.c, r, c);
    return;
  }
}

//------------------------------------------------------
// 移動ロジック
//------------------------------------------------------
function movePiece(fr, fc, tr, tc) {
  if (turn === null) return; // 終了後は無効

  const p = board[fr][fc];
  if (!p) return;

  const legal = generateLegalMoves(fr, fc);
  const ok = legal.some(m => m.to.r === tr && m.to.c === tc);
  if (!ok) {
    selected = null;
    drawBoard();
    return;
  }

  const cap = board[tr][tc];
  if (cap) {
    const capType = cap.promoted ? demote(cap.type) : cap.type;
    hands[turn][capType] = (hands[turn][capType] || 0) + 1;
  }

  // 成り（自動成り - 現状は自動）
  if (canPromote(p, fr, tr)) {
    p.promoted = true;
  }

  board[tr][tc] = p;
  board[fr][fc] = null;

  selected = null;

  // 着手後に相手が詰んでいるかを判定
  const opponent = (turn === 'b') ? 'w' : 'b';
  drawBoard();
  if (isMate(board, hands, opponent)) {
    showResult(turn === 'b' ? '先手の勝ち' : '後手の勝ち');
    return;
  }

  nextTurn();
}

//------------------------------------------------------
// 以下、合法手生成（個別）
//------------------------------------------------------
function inBounds(r, c) { return r >= 0 && r <= 8 && c >= 0 && c <= 8; }

function promotedType(t) {
  if (['FU', 'KY', 'KE', 'GI'].includes(t)) return 'KI';
  return t;
}

function canPromote(p, fr, tr) {
  if (!p) return false;
  if (p.promoted) return false;
  if (['OU', 'KI'].includes(p.type)) return false;

  const zone = p.owner === 'b' ? [0, 1, 2] : [6, 7, 8];
  return (zone.includes(fr) || zone.includes(tr));
}

function demote(t) { return t; /* 表現上 p.type は常に素の型なのでこれでOK */ }

function generateLegalMoves(r, c) {
  const p = board[r][c];
  if (!p) return [];

  const dir = (p.owner === 'b') ? -1 : 1;
  const t = p.promoted ? promotedType(p.type) : p.type;
  const moves = [];

  const push = (rr, cc) => {
    if (!inBounds(rr, cc)) return;
    const t2 = board[rr][cc];
    if (!t2 || t2.owner !== p.owner)
      moves.push({ from: { r, c }, to: { r: rr, c: cc } });
  };

  const slide = (dr, dc) => {
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      if (!board[rr][cc])
        moves.push({ from: { r, c }, to: { r: rr, c: cc } });
      else {
        if (board[rr][cc].owner !== p.owner)
          moves.push({ from: { r, c }, to: { r: rr, c: cc } });
        break;
      }
      rr += dr; cc += dc;
    }
  };

  switch (t) {
    case 'OU':
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (dr || dc) push(r + dr, c + dc);
      break;

    case 'FU': push(r + dir, c); break;

    case 'KY': slide(dir, 0); break;

    case 'KE': push(r + 2 * dir, c - 1); push(r + 2 * dir, c + 1); break;

    case 'GI':
      [[dir, -1], [dir, 0], [dir, 1], [-dir, -1], [-dir, 1]]
        .forEach(d => push(r + d[0], c + d[1]));
      break;

    case 'KI':
      [[dir, -1], [dir, 0], [dir, 1], [0, -1], [0, 1], [-dir, 0]]
        .forEach(d => push(r + d[0], c + d[1]));
      break;

    case 'KA':
      slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
      if (p.promoted)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => push(r + d[0], c + d[1]));
      break;

    case 'HI':
      slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
      if (p.promoted)
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(d => push(r + d[0], c + d[1]));
      break;
  }

  return moves;
}

//------------------------------------------------------
// 盤面操作・コピー（シミュレーション用）
//------------------------------------------------------
function cloneBoard(src) {
  return src.map(row => row.map(cell => cell ? { type: cell.type, promoted: cell.promoted, owner: cell.owner } : null));
}
function cloneHands(srcHands) {
  return { b: { ...(srcHands.b || {}) }, w: { ...(srcHands.w || {}) } };
}

function applyMoveTo(simBoard, simHands, move, owner) {
  // move は { type:'drop', piece, to } か { from, to, promote? }
  if (!move) return;
  if (move.type === 'drop') {
    const t = move.piece;
    simBoard[move.to.r][move.to.c] = { type: t, promoted: false, owner: owner };
    simHands[owner][t] = (simHands[owner][t] || 0) - 1;
    if (simHands[owner][t] <= 0) delete simHands[owner][t];
    return;
  } else {
    const from = move.from;
    const to = move.to;
    const p = simBoard[from.r][from.c];
    if (!p) return;
    const target = simBoard[to.r][to.c];
    if (target) {
      const capturedType = target.promoted ? demote(target.type) : target.type;
      simHands[owner][capturedType] = (simHands[owner][capturedType] || 0) + 1;
    }
    if (move.promote) p.promoted = true;
    simBoard[to.r][to.c] = p;
    simBoard[from.r][from.c] = null;
  }
}

//------------------------------------------------------
// 全手（移動 + 打ち）の生成（簡易版）
//  ※ AI Worker と同様のロジックをここに実装している
//------------------------------------------------------
function generateDropsFor(owner, handsObj) {
  const drops = [];
  const myHands = handsObj[owner] || {};
  Object.keys(myHands).forEach(type => {
    const cnt = myHands[type];
    if (!cnt) return;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]) continue;
        if (type === 'FU') {
          let hasFu = false;
          for (let rr = 0; rr < 9; rr++) {
            const p = board[rr][c];
            if (p && p.owner === owner && p.type === 'FU' && !p.promoted) hasFu = true;
          }
          if (hasFu) continue;
        }
        if (type === 'KE' && ((owner === 'b' && r <= 1) || (owner === 'w' && r >= 7))) continue;
        if (type === 'KY' && ((owner === 'b' && r === 0) || (owner === 'w' && r === 8))) continue;
        drops.push({ type: 'drop', piece: type, to: { r, c } });
      }
    }
  });
  return drops;
}

function generateAllMovesFor(owner, handsObj) {
  const moves = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.owner === owner) {
        const basic = generateLegalMoves(r, c);
        basic.forEach(m => {
          const piece = board[r][c];
          const canProm = canPromote(piece, m.from.r, m.to.r);
          const forced = (piece && piece.type === 'FU' && ((piece.owner === 'b' && m.to.r === 0) || (piece.owner === 'w' && m.to.r === 8)))
                      || (piece && piece.type === 'KY' && ((piece.owner === 'b' && m.to.r === 0) || (piece.owner === 'w' && m.to.r === 8)))
                      || (piece && piece.type === 'KE' && ((piece.owner === 'b' && m.to.r <= 1) || (piece.owner === 'w' && m.to.r >= 7)));
          if (canProm && !forced) {
            moves.push({ type: 'move', from: m.from, to: m.to, promote: false });
            moves.push({ type: 'move', from: m.from, to: m.to, promote: true });
          } else if (canProm && forced) {
            moves.push({ type: 'move', from: m.from, to: m.to, promote: true });
          } else {
            moves.push({ type: 'move', from: m.from, to: m.to, promote: false });
          }
        });
      }
    }
  }
  // 持ち駒
  moves.push(...generateDropsFor(owner, handsObj));
  return moves;
}

//------------------------------------------------------
// --- 詰み関連（王手・合法手フィルタ）
//------------------------------------------------------
function kingInCheck(boardState, owner) {
  // owner の王の位置を探す
  let kr = -1, kc = -1;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = boardState[r][c];
      if (p && p.owner === owner && p.type === 'OU') {
        kr = r; kc = c;
      }
    }
  }
  if (kr < 0) return true; // 王が盤上にいない -> チェック（敗勢扱い）

  // 敵の指し手を生成して王に取れる手があるか確認
  const enemy = owner === 'b' ? 'w' : 'b';
  // 敵の全手を作るために一時的に board を差し替え利用するが
  // ここでは簡易に直接走査：敵の各駒の generateLegalMoves を使う
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = boardState[r][c];
      if (!p || p.owner !== enemy) continue;
      // generateLegalMoves はグローバル board を参照するため、
      // kingInCheck の使用時は board が current boardState であることが必要。
      // そのため、ここでは board を一時的に差し替える（安全に行う）
    }
  }

  // 安全策：board を一時的に置き換えて generateLegalMoves を利用する
  const origBoard = board;
  try {
    // 参照置換（浅い代入で OK）
    board = boardState;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = boardState[r][c];
        if (!p || p.owner !== (enemy)) continue;
        const moves = generateLegalMoves(r, c);
        for (const m of moves) {
          if (m.to.r === kr && m.to.c === kc) {
            return true;
          }
        }
      }
    }
  } finally {
    board = origBoard;
  }

  return false;
}

function filterLegalMoves(boardState, handsState, owner) {
  // generateAllMovesFor はグローバル board / hands を参照しているため
  // シミュレーション時は clone を使って applyMoveTo を呼ぶ
  const rawMoves = generateAllMovesFor(owner, handsState);
  const legal = [];

  for (const m of rawMoves) {
    const b2 = cloneBoard(boardState);
    const h2 = cloneHands(handsState);
    applyMoveTo(b2, h2, m, owner);
    if (!kingInCheck(b2, owner)) {
      legal.push(m);
    }
  }
  return legal;
}

function isMate(boardState, handsState, owner) {
  // owner の合法手が 0 なら詰み（または投了）
  const legal = filterLegalMoves(boardState, handsState, owner);
  return legal.length === 0;
}

//------------------------------------------------------
// AI
//------------------------------------------------------
function thinkAI() {
  const depth = Number(document.getElementById("aiDepth").value);

  if (!aiWorker) setupWorker();
  aiWorker.postMessage({
    type: 'think',
    board: board,
    hands: hands,
    turn: 'w',
    depth: depth
  });
}

function setupWorker() {
  aiWorker = new Worker("ai-worker.js");

  aiWorker.onmessage = e => {
    if (e.data.type === 'bestmove') {
      applyAIMove(e.data.move);
    } else if (e.data.type === 'log') {
      console.log('AI log:', e.data.msg);
    }
  };
}

function applyAIMove(move) {
  if (turn === null) return; // 終了済みは無効

  if (move.type === 'drop') {
    const t = move.piece;
    board[move.to.r][move.to.c] = { type: t, promoted: false, owner: 'w' };
    hands.w[t]--;
    if (hands.w[t] <= 0) delete hands.w[t];

    drawBoard();

    // AI の着手後に先手が詰んでいないか判定
    if (isMate(board, hands, 'b')) {
      showResult('後手の勝ち');
      return;
    }

    nextTurn();
    return;
  }

  // 通常移動
  const p = board[move.from.r][move.from.c];
  const cap = board[move.to.r][move.to.c];

  if (cap) {
    const capType = cap.promoted ? demote(cap.type) : cap.type;
    hands.w[capType] = (hands.w[capType] || 0) + 1;
  }

  if (canPromote(p, move.from.r, move.to.r)) {
    // respect promote flag if provided by AI move
    if (move.promote) p.promoted = true;
    else p.promoted = p.promoted || false;
  }

  board[move.to.r][move.to.c] = p;
  board[move.from.r][move.from.c] = null;

  drawBoard();

  // AI着手後に先手が詰んでいないか判定
  if (isMate(board, hands, 'b')) {
    showResult('後手の勝ち');
    return;
  }

  nextTurn();
}

//------------------------------------------------------
// 結果表示
//------------------------------------------------------
function showResult(msg) {
  // result 要素は index.html に配置してください（下部参照）
  const div = document.getElementById('result');
  if (div) {
    div.textContent = msg;
    div.style.display = 'block';
  } else {
    alert(msg); // フォールバック
  }
  turn = null; // 操作不可にする
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  updateTurnDisplay();
}

//------------------------------------------------------
// ボタン
//------------------------------------------------------
document.getElementById("reset").addEventListener("click", () => {
  // result を隠す
  const div = document.getElementById('result');
  if (div) { div.style.display = 'none'; div.textContent = ''; }

  initBoard();
  turn = 'b';
  selected = null;
  drawBoard();
  updateTurnDisplay();
  startTimer();
});

//------------------------------------------------------
// 初期化
//------------------------------------------------------
initBoard();
setupWorker();
drawBoard();
updateTurnDisplay();
startTimer();　タイマーを減る方向に直して