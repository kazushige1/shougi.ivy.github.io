// ai-worker-golden.js
// Web Worker 内で動く簡易 Golden 将棋AI
// ミニマックス + αβ + 評価関数強化
// メッセージ:
// { type:'think', board:..., hands:..., turn:'b'|'w', depth: N }

self.onmessage = (e) => {
  const data = e.data;
  if (data.type === 'think') {
    const board = data.board;
    const hands = data.hands;
    const turn = data.turn;
    const depth = data.depth || 3;

    const move = findBestMove(board, hands, turn, depth);
    if (move) {
      postMessage({ type: 'bestmove', move });
    } else {
      postMessage({ type: 'log', msg: '手なし／投了の可能性' });
    }
  }
};

/* --- 定数 --- */
const PIECE_VALUE = { FU:100, KE:300, GI:500, KI:600, KA:800, HI:1000, OU:100000 };

/* --- 評価関数 --- */
function evaluate(board, hands, side){
  let score = 0;

  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const p = board[r][c];
      if(!p) continue;
      const base = PIECE_VALUE[p.type] || 100;
      const promBonus = p.promoted ? Math.floor(base*0.6) : 0;

      // 前進ボーナス（歩・香・桂）
      let advanceBonus = 0;
      if(['FU','KY','KE'].includes(p.type)){
        advanceBonus = p.owner==='b' ? (8-r)*10 : r*10;
      }

      const s = (p.owner===side) ? (base + promBonus + advanceBonus) : -(base + promBonus + advanceBonus);
      score += s;
    }
  }

  // 玉の囲いボーナス
  ['b','w'].forEach(owner=>{
    const kingPos = board.flatMap((row,r)=>row.map((p,c)=>p && p.owner===owner && p.type==='OU'?{r,c}:null)).filter(Boolean)[0];
    if(kingPos){
      let defendCount = 0;
      for(let dr=-1;dr<=1;dr++){
        for(let dc=-1;dc<=1;dc++){
          if(dr===0 && dc===0) continue;
          const rr=kingPos.r+dr, cc=kingPos.c+dc;
          if(rr>=0 && rr<=8 && cc>=0 && cc<=8){
            const p = board[rr][cc];
            if(p && p.owner===owner) defendCount++;
          }
        }
      }
      score += (owner===side ? 20*defendCount : -20*defendCount);
    }
  });

  // 持ち駒評価
  ['b','w'].forEach(owner=>{
    Object.keys(hands[owner]||{}).forEach(type=>{
      const cnt = hands[owner][type] || 0;
      const val = (PIECE_VALUE[type]||100)*cnt;
      score += (owner===side ? val : -val);
    });
  });

  return score;
}

/* --- ヘルパー --- */
function inBounds(r,c){ return r>=0 && r<=8 && c>=0 && c<=8; }
function promotedType(t){ if(['GI','KE','KY','FU'].includes(t)) return 'KI'; return t; }
function demote(type){ return ['FU','KE','KY','GI','KI','KA','HI'].includes(type)?type:type; }

function canPromoteMoveLocal(p,from,to){
  if(!p) return false;
  if(p.type==='OU'||p.type==='KI') return false;
  const enemyZone = p.owner==='b'? [0,1,2]:[6,7,8];
  return !p.promoted && (enemyZone.includes(from.r) || enemyZone.includes(to.r));
}
function isPromotionForced(piece, from, to){
  if(!piece) return false;
  if(piece.type==='FU') return (piece.owner==='b'?to.r===0:to.r===8);
  if(piece.type==='KY') return (piece.owner==='b'?to.r===0:to.r===8);
  if(piece.type==='KE') return (piece.owner==='b'?to.r<=1:to.r>=7);
  return false;
}

/* --- 合法手生成 --- */
function generateLegalMovesFor(board, r, c){
  const piece = board[r][c]; if(!piece) return [];
  const dir = piece.owner==='b'? -1 : 1;
  const moves=[];

  const push=(rr,cc)=>{
    if(!inBounds(rr,cc)) return;
    const t = board[rr][cc];
    if(!t || t.owner!==piece.owner) moves.push({from:{r,c},to:{r:rr,c:cc}});
  };
  const addSlide=(dr,dc)=>{
    let rr=r+dr, cc=c+dc;
    while(inBounds(rr,cc)){
      if(!board[rr][cc]) moves.push({from:{r,c},to:{r:rr,c:cc}});
      else { if(board[rr][cc].owner!==piece.owner) moves.push({from:{r,c},to:{r:rr,c:cc}}); break; }
      rr+=dr; cc+=dc;
    }
  };

  const type = piece.promoted? promotedType(piece.type) : piece.type;
  switch(type){
    case 'OU': for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr!==0||dc!==0) push(r+dr,c+dc); break;
    case 'FU': push(r+dir,c); break;
    case 'KY': addSlide(dir,0); break;
    case 'KE': push(r+2*dir,c-1); push(r+2*dir,c+1); break;
    case 'GI': [[dir,-1],[dir,0],[dir,1],[-dir,-1],[-dir,1]].forEach(([dr,dc])=>push(r+dr,c+dc)); break;
    case 'KI': [[dir,-1],[dir,0],[dir,1],[0,-1],[0,1],[-dir,0]].forEach(([dr,dc])=>push(r+dr,c+dc)); break;
    case 'KA': addSlide(1,1); addSlide(1,-1); addSlide(-1,1); addSlide(-1,-1);
      if(piece.promoted) [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>push(r+dr,c+dc)); break;
    case 'HI': addSlide(1,0); addSlide(-1,0); addSlide(0,1); addSlide(0,-1);
      if(piece.promoted) [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc])=>push(r+dr,c+dc)); break;
  }
  return moves;
}

/* --- 持ち駒生成 --- */
function generateDrops(board, hands, owner){
  const drops=[];
  const myHands = hands[owner] || {};
  Object.keys(myHands).forEach(type=>{
    if(!myHands[type]) return;
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        if(board[r][c]) continue;
        if(type==='FU'){
          let hasFu=false;
          for(let rr=0;rr<9;rr++){ const p=board[rr][c]; if(p && p.owner===owner && p.type==='FU' && !p.promoted) hasFu=true; }
          if(hasFu) continue;
        }
        if(type==='KE' && ((owner==='b' && r<=1) || (owner==='w' && r>=7))) continue;
        if(type==='KY' && ((owner==='b' && r===0) || (owner==='w' && r===8))) continue;
        drops.push({type:'drop', piece:type, to:{r,c}});
      }
    }
  });
  return drops;
}

/* --- 全手生成（成り展開＋捕獲優先ソート） --- */
function generateAllMoves(board,hands,owner){
  const moves=[];
  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const p=board[r][c];
      if(p && p.owner===owner){
        const basic = generateLegalMovesFor(board,r,c);
        basic.forEach(m=>{
          const piece = board[r][c];
          const canProm = canPromoteMoveLocal(piece,m.from,m.to);
          const forced = isPromotionForced(piece,m.from,m.to);
          if(canProm && !forced){
            moves.push({type:'move', from:m.from, to:m.to, promote:false});
            moves.push({type:'move', from:m.from, to:m.to, promote:true});
          } else if(canProm && forced){
            moves.push({type:'move', from:m.from, to:m.to, promote:true});
          } else moves.push({type:'move', from:m.from, to:m.to, promote:false});
        });
      }
    }
  }
  moves.push(...generateDrops(board,hands,owner));

  // 捕獲・成り優先ソート
  moves.sort((a,b)=>{
    const va=(a.type==='move' && board[a.to.r][a.to.c]?PIECE_VALUE[board[a.to.r][a.to.c].type]||0:0)+(a.promote?30:0);
    const vb=(b.type==='move' && board[b.to.r][b.to.c]?PIECE_VALUE[board[b.to.r][b.to.c].type]||0:0)+(b.promote?30:0);
    return vb-va;
  });

  return moves;
}

/* --- 盤面コピー --- */
function cloneBoard(board){ return board.map(row=>row.map(cell=>cell?{type:cell.type,promoted:cell.promoted,owner:cell.owner}:null)); }
function cloneHands(hands){ return {b:{...(hands.b||{})}, w:{...(hands.w||{})}}; }

/* --- 指し手適用 --- */
function applyMoveTo(board,hands,move,owner){
  if(move.type==='drop'){
    board[move.to.r][move.to.c]={type:move.piece,promoted:false,owner};
    hands[owner][move.piece]--; if(hands[owner][move.piece]<=0) delete hands[owner][move.piece];
  } else {
    const from=move.from, to=move.to;
    const p=board[from.r][from.c];
    const target=board[to.r][to.c];
    if(target){
      const capturedType=target.promoted? demote(target.type):target.type;
      hands[owner][capturedType]=(hands[owner][capturedType]||0)+1;
    }
    if(move.promote) p.promoted=true;
    board[to.r][to.c]=p; board[from.r][from.c]=null;
  }
}

/* --- ミニマックス + αβ --- */
function findBestMove(board,hands,side,depth){
  const maximizing=side==='w';
  let best=null;
  let alpha=-Infinity, beta=Infinity;
  const moves=generateAllMoves(board,hands,side);
  if(moves.length===0) return null;

  for(const m of moves){
    const b2=cloneBoard(board);
    const h2=cloneHands(hands);
    applyMoveTo(b2,h2,m,side);
    const score=minimax(b2,h2,depth-1,alpha,beta,side==='b'?'w':'b',side);
    if(maximizing){
      if(score>alpha){ alpha=score; best=m; }
    } else {
      if(score<beta){ beta=score; best=m; }
    }
  }
  return best;
}

function minimax(board,hands,depth,alpha,beta,turnPlayer,rootSide){
  if(depth===0) return evaluate(board,hands,rootSide);
  const moves=generateAllMoves(board,hands,turnPlayer);
  if(moves.length===0) return turnPlayer===rootSide?-10000000:10000000;

  if(turnPlayer===rootSide){
    let value=-Infinity;
    for(const m of moves){
      const b2=cloneBoard(board), h2=cloneHands(hands);
      applyMoveTo(b2,h2,m,turnPlayer);
      value=Math.max(value,minimax(b2,h2,depth-1,alpha,beta,turnPlayer==='b'?'w':'b',rootSide));
      alpha=Math.max(alpha,value);
      if(alpha>=beta) break;
    }
    return value;
  } else {
    let value=Infinity;
    for(const m of moves){
      const b2=cloneBoard(board), h2=cloneHands(hands);
      applyMoveTo(b2,h2,m,turnPlayer);
      value=Math.min(value,minimax(b2,h2,depth-1,alpha,beta,turnPlayer==='b'?'w':'b',rootSide));
      beta=Math.min(beta,value);
      if(alpha>=beta) break;
    }
    return value;
  }
}
