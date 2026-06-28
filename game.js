/* =====================================================================
 * Memory (Card Match)
 * Flip cards, find pairs. Final score = max(0, 1000 - moves*10 - seconds*5).
 * ===================================================================== */

(() => {
  "use strict";

  const PAIRS = ["\uD83D\uDC0D", "\uD83C\uDFAE", "\uD83D\uDE80", "\uD83C\uDF55", "\uD83C\uDF1F", "\uD83C\uDFB2", "\uD83E\uDD8A", "\uD83C\uDF08"];
  const SIZE = 4;
  const MAX_LEADERS = 3;
  const MISMATCH_MS = 700;

  const LS_KEYS = {
    name: "memory.player",
    leaderboard: "memory.leaderboard",
  };

  const els = {
    movesValue: document.getElementById("movesValue"),
    timeValue:  document.getElementById("timeValue"),
    bestValue:  document.getElementById("bestValue"),
    playerName: document.getElementById("playerName"),
    changePlayerBtn: document.getElementById("changePlayerBtn"),

    boardEl: document.getElementById("board"),
    gridEl:  document.getElementById("grid"),

    overlayStart:  document.getElementById("overlayStart"),
    overlayPaused: document.getElementById("overlayPaused"),
    overlayOver:   document.getElementById("overlayOver"),
    overScore: document.getElementById("overScore"),
    overBest:  document.getElementById("overBest"),
    overTitle: document.getElementById("overTitle"),
    overMsg:   document.getElementById("overMsg"),
    startBtn:  document.getElementById("startBtn"),
    playAgainBtn: document.getElementById("playAgainBtn"),

    leaderboardList: document.getElementById("leaderboardList"),
    resetScoresBtn:  document.getElementById("resetScoresBtn"),

    nameModal:     document.getElementById("nameModal"),
    nameForm:      document.getElementById("nameForm"),
    nameInput:     document.getElementById("nameInput"),
    nameCancelBtn: document.getElementById("nameCancelBtn"),

    touchPause:   document.getElementById("touchPause"),
    touchRestart: document.getElementById("touchRestart"),
  };

  const PLAY_ICON  = "\u25B6";
  const PAUSE_ICON = "\u275A\u275A";

  /** @typedef {{id:number,emoji:string,element:HTMLElement,flipped:boolean,matched:boolean}} Card */

  const state = {
    /** @type {"idle"|"playing"|"paused"|"over"} */
    status: "idle",
    /** @type {Card[]} */
    cards: [],
    /** @type {Card|null} */
    first: null,
    lock: false,
    moves: 0,
    matchedPairs: 0,
    startedAt: 0,
    elapsedAtPause: 0,
    timerId: 0,
    player: "",
    leaders: /** @type {{name:string,score:number,at:number}[]} */ ([]),
    bestScore: 0,
    nextId: 0,
  };

  // -------------------- Audio --------------------
  /** @type {AudioContext|null} */
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audio = null; }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function beep(freq = 660, dur = 0.08, type = "triangle", gain = 0.04) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const sfx = {
    flip()     { beep(620, 0.04, "square", 0.025); },
    match()    { beep(880, 0.09, "triangle", 0.05); setTimeout(() => beep(1320, 0.11, "triangle", 0.05), 70); },
    mismatch() { beep(180, 0.16, "sawtooth", 0.05); setTimeout(() => beep(140, 0.18, "sawtooth", 0.05), 60); },
    win()      { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.13, "triangle", 0.055), i * 100)); },
    pause()    { beep(440, 0.05); },
    resume()   { beep(660, 0.05); },
    high()     { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.10, "triangle", 0.05), i * 90)); },
  };

  // -------------------- Storage --------------------
  function loadPlayer() {
    try { return localStorage.getItem(LS_KEYS.name) || ""; }
    catch (_) { return ""; }
  }
  function savePlayer(name) {
    try { localStorage.setItem(LS_KEYS.name, name); } catch (_) {}
  }
  function loadLeadersLocal() {
    try {
      const raw = localStorage.getItem(LS_KEYS.leaderboard);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(e => e && typeof e.score === "number" && typeof e.name === "string")
        .slice(0, MAX_LEADERS);
    } catch (_) { return []; }
  }
  function saveLeadersLocal(list) {
    try { localStorage.setItem(LS_KEYS.leaderboard, JSON.stringify(list.slice(0, MAX_LEADERS))); }
    catch (_) {}
  }
  function setLeaders(list) {
    state.leaders = (list || []).slice(0, MAX_LEADERS);
    saveLeadersLocal(state.leaders);
    renderLeaderboard();
    updateHud();
  }
  function getTopScore() {
    return state.leaders.length ? state.leaders[0].score : 0;
  }

  // -------------------- Deck --------------------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildDeck() {
    const deck = shuffle(PAIRS.concat(PAIRS).slice());
    els.gridEl.innerHTML = "";
    state.cards.length = 0;
    state.first = null;
    state.lock = false;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const emoji = deck[i];
      const cardEl = document.createElement("div");
      cardEl.className = "card";
      cardEl.setAttribute("role", "button");
      cardEl.setAttribute("aria-label", "Card");
      cardEl.innerHTML = `
        <div class="card__inner">
          <div class="card__face card__back" aria-hidden="true"></div>
          <div class="card__face card__front">${emoji}</div>
        </div>
      `;
      els.gridEl.appendChild(cardEl);
      /** @type {Card} */
      const card = { id: ++state.nextId, emoji, element: cardEl, flipped: false, matched: false };
      cardEl.addEventListener("click", () => onCardClick(card));
      state.cards.push(card);
    }
  }

  // -------------------- Click handling --------------------
  function onCardClick(card) {
    ensureAudio();
    if (state.status !== "playing") return;
    if (state.lock) return;
    if (card.matched || card.flipped) return;

    flipUp(card);
    sfx.flip();

    if (!state.first) {
      state.first = card;
      return;
    }

    state.moves += 1;
    updateHud();
    bumpStat(els.movesValue.parentElement);

    if (state.first.emoji === card.emoji) {
      const a = state.first, b = card;
      state.first = null;
      setTimeout(() => {
        a.matched = true;
        b.matched = true;
        a.element.classList.add("is-matched");
        b.element.classList.add("is-matched");
        sfx.match();
        state.matchedPairs += 1;
        if (state.matchedPairs >= PAIRS.length) {
          endGame(true);
        }
      }, 240);
    } else {
      const a = state.first, b = card;
      state.first = null;
      state.lock = true;
      els.gridEl.classList.add("grid--locked");
      a.element.classList.add("is-wrong");
      b.element.classList.add("is-wrong");
      setTimeout(() => {
        sfx.mismatch();
      }, 180);
      setTimeout(() => {
        flipDown(a);
        flipDown(b);
        a.element.classList.remove("is-wrong");
        b.element.classList.remove("is-wrong");
        state.lock = false;
        els.gridEl.classList.remove("grid--locked");
      }, MISMATCH_MS);
    }
  }

  function flipUp(card) {
    card.flipped = true;
    card.element.classList.add("is-flipped");
  }
  function flipDown(card) {
    card.flipped = false;
    card.element.classList.remove("is-flipped");
  }

  // -------------------- Timer --------------------
  function startTimer() {
    state.startedAt = performance.now();
    state.elapsedAtPause = 0;
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (state.status === "playing") updateHud();
    }, 250);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = 0; }
  }
  function getElapsedMs() {
    if (state.status === "idle") return 0;
    if (state.status === "paused" || state.status === "over") return state.elapsedAtPause;
    return state.elapsedAtPause + (performance.now() - state.startedAt);
  }
  function pauseTimer() {
    state.elapsedAtPause = getElapsedMs();
  }
  function resumeTimer() {
    state.startedAt = performance.now();
  }
  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" + s : s}`;
  }

  // -------------------- Scoring --------------------
  function computeScore() {
    const secs = Math.floor(getElapsedMs() / 1000);
    return Math.max(0, 1000 - state.moves * 10 - secs * 5);
  }

  function bumpStat(node) {
    if (!node) return;
    node.classList.remove("stat--bump");
    void node.offsetWidth;
    node.classList.add("stat--bump");
  }

  // -------------------- Lifecycle --------------------
  function resetGame() {
    stopTimer();
    state.moves = 0;
    state.matchedPairs = 0;
    state.first = null;
    state.lock = false;
    state.elapsedAtPause = 0;
    els.gridEl.classList.remove("grid--locked", "grid--paused");
    buildDeck();
    updateHud();
  }

  function startGame() {
    if (state.status === "playing") return;
    if (state.status === "over" || state.status === "idle") {
      resetGame();
      startTimer();
    } else if (state.status === "paused") {
      resumeTimer();
    }
    state.status = "playing";
    hideAllOverlays();
    els.gridEl.classList.remove("grid--paused");
    updateTouchPauseIcon();
  }

  function pauseGame() {
    if (state.status !== "playing") return;
    pauseTimer();
    state.status = "paused";
    els.gridEl.classList.add("grid--paused");
    showOverlay("paused");
    sfx.pause();
    updateTouchPauseIcon();
  }

  function resumeGame() {
    if (state.status !== "paused") return;
    resumeTimer();
    state.status = "playing";
    els.gridEl.classList.remove("grid--paused");
    hideOverlay("paused");
    sfx.resume();
    updateTouchPauseIcon();
  }

  function togglePause() {
    if (state.status === "idle" || state.status === "over") startGame();
    else if (state.status === "playing") pauseGame();
    else if (state.status === "paused")  resumeGame();
  }

  function restart() {
    state.status = "idle";
    resetGame();
    state.status = "playing";
    hideAllOverlays();
    startTimer();
    updateTouchPauseIcon();
  }

  function endGame(/*win*/) {
    const finalScore = computeScore();
    pauseTimer();
    state.status = "over";
    stopTimer();
    updateTouchPauseIcon();

    const topBefore = getTopScore();
    submitToLeaderboard(state.player, finalScore);
    const topAfter = getTopScore();
    const isHigh = finalScore > 0 && topAfter > topBefore && topAfter === finalScore;
    if (isHigh) setTimeout(() => sfx.high(), 700);
    setTimeout(() => sfx.win(), 200);

    els.overScore.textContent = String(finalScore);
    els.overBest.textContent  = String(topAfter);
    els.overTitle.textContent = pickOverTitle(finalScore, isHigh);
    els.overMsg.innerHTML = isHigh
      ? `New high score in <strong>${state.moves}</strong> moves &middot; <strong>${formatTime(getElapsedMs())}</strong>`
      : `Finished in <strong>${state.moves}</strong> moves &middot; <strong>${formatTime(getElapsedMs())}</strong>`;
    showOverlay("over");
    updateHud();
    renderLeaderboard();
  }

  function pickOverTitle(score, isHigh) {
    if (isHigh)        return "New high score!";
    if (score >= 800)  return "Sharp memory!";
    if (score >= 600)  return "Nicely done.";
    if (score >= 400)  return "All matched.";
    if (score >= 200)  return "Got there in the end.";
    return "Whew, that took a while.";
  }

  // -------------------- Leaderboard --------------------
  function submitToLeaderboard(name, score) {
    if (!name || score <= 0) return;
    const merged = state.leaders.concat([{ name, score, at: Date.now() }]);
    merged.sort((a, b) => b.score - a.score || a.at - b.at);
    setLeaders(merged);
  }
  function renderLeaderboard() {
    const list = state.leaders;
    els.leaderboardList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "No scores yet.";
      els.leaderboardList.appendChild(li);
      return;
    }
    list.forEach((entry, idx) => {
      const li = document.createElement("li");
      if (entry.name === state.player) li.classList.add("you");
      li.innerHTML = `
        <span class="lb-rank">${idx + 1}</span>
        <span class="lb-name">${escapeHtml(entry.name)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      els.leaderboardList.appendChild(li);
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // -------------------- HUD / overlays --------------------
  function updateHud() {
    els.movesValue.textContent = String(state.moves);
    els.timeValue.textContent  = formatTime(getElapsedMs());
    els.bestValue.textContent  = String(getTopScore());
    els.playerName.textContent = state.player || "Guest";
  }
  function showOverlay(which) {
    if (which === "start")  els.overlayStart.classList.remove("hidden");
    if (which === "paused") els.overlayPaused.classList.remove("hidden");
    if (which === "over")   els.overlayOver.classList.remove("hidden");
  }
  function hideOverlay(which) {
    if (which === "start")  els.overlayStart.classList.add("hidden");
    if (which === "paused") els.overlayPaused.classList.add("hidden");
    if (which === "over")   els.overlayOver.classList.add("hidden");
  }
  function hideAllOverlays() {
    hideOverlay("start"); hideOverlay("paused"); hideOverlay("over");
  }
  function updateTouchPauseIcon() {
    if (!els.touchPause) return;
    const playing = state.status === "playing";
    els.touchPause.textContent = playing ? PAUSE_ICON : PLAY_ICON;
    els.touchPause.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  // -------------------- Input --------------------
  function onKeyDown(e) {
    if (document.activeElement === els.nameInput) return;
    const k = e.key;
    if (k === " " || k === "Spacebar") {
      e.preventDefault(); ensureAudio(); togglePause();
    } else if (k === "r" || k === "R") {
      e.preventDefault(); ensureAudio(); restart();
    } else if (k === "Enter" && state.status === "idle") {
      e.preventDefault(); ensureAudio(); startGame();
    }
  }

  function bindTouchControls() {
    if (els.touchPause) {
      els.touchPause.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        togglePause();
        updateTouchPauseIcon();
      });
      els.touchPause.addEventListener("click", (e) => e.preventDefault());
    }
    if (els.touchRestart) {
      els.touchRestart.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        restart();
      });
      els.touchRestart.addEventListener("click", (e) => e.preventDefault());
    }
  }

  // -------------------- Name modal --------------------
  function openNameModal(canCancel) {
    els.nameModal.classList.remove("hidden");
    els.nameModal.setAttribute("aria-hidden", "false");
    els.nameInput.value = state.player || "";
    if (state.status === "playing") pauseGame();
    if (canCancel) els.nameCancelBtn.classList.remove("hidden");
    else els.nameCancelBtn.classList.add("hidden");
    setTimeout(() => { els.nameInput.focus(); els.nameInput.select(); }, 30);
  }
  function closeNameModal() {
    els.nameModal.classList.add("hidden");
    els.nameModal.setAttribute("aria-hidden", "true");
  }

  els.nameForm.addEventListener("submit", e => {
    e.preventDefault();
    const clean = els.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 14);
    if (!clean) return;
    state.player = clean;
    savePlayer(clean);
    updateHud();
    renderLeaderboard();
    closeNameModal();
  });
  els.nameCancelBtn.addEventListener("click", () => {
    if (!state.player) return;
    closeNameModal();
  });
  els.changePlayerBtn.addEventListener("click", e => {
    e.stopPropagation();
    openNameModal(true);
  });
  els.startBtn.addEventListener("click", () => { ensureAudio(); startGame(); });
  els.playAgainBtn.addEventListener("click", () => { ensureAudio(); restart(); });
  els.resetScoresBtn.addEventListener("click", () => {
    if (confirm("Clear the Top 3 leaderboard?")) setLeaders([]);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.nameModal.classList.contains("hidden") && state.player) closeNameModal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "playing") pauseGame();
  });

  // -------------------- Init --------------------
  // [fit-board] Desktop: fit the square board into the stage's available area
  // so it never overflows and the footer stays visible. Touch keeps CSS sizing.
  function fitBoard() {
    const board = els.boardEl;
    if (!board) return;
    if (document.documentElement.classList.contains("is-touch")) {
      board.style.width = "";
      board.style.height = "";
      return;
    }
    const wrap = board.parentElement;
    const stage = wrap.parentElement;
    const cs = getComputedStyle(wrap);
    const gap = parseFloat(getComputedStyle(stage).rowGap) || 0;
    const wr = wrap.getBoundingClientRect();
    let budget = stage.clientHeight;
    for (const sib of stage.children) {
      if (sib === wrap) continue;
      const r = sib.getBoundingClientRect();
      if (r.top >= wr.bottom - 2) budget -= r.height + gap;
    }
    const availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = budget
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    const side = Math.floor(Math.min(availW, availH));
    if (side > 0) {
      board.style.width = side + "px";
      board.style.height = side + "px";
    }
  }
  window.addEventListener("resize", fitBoard);

  function init() {
    document.addEventListener("keydown", onKeyDown);
    bindTouchControls();
    fitBoard();

    state.player = loadPlayer();
    state.leaders = loadLeadersLocal();
    buildDeck();
    renderLeaderboard();
    updateHud();
    updateTouchPauseIcon();
    showOverlay("start");

    if (!state.player) openNameModal(false);
  }

  init();
})();
