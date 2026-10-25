import React, { useState, useMemo, useRef, useEffect } from "react";
import { Shuffle, RotateCcw, Check, Trophy, Flag, Plus, Minus, X, Trash2, History, Lock, Unlock, Settings, Undo2, Share2 } from "lucide-react";
import { APP_URL, QR_SIZE, QR_PATH } from "./qr.js";

// ---- Flitzepfeil-Farbpalette ----
const COLORS = {
  gold: "#F0A500",
  green: "#0F3D12",
  brown: "#3E1F0A",
  purple: "#AD1457",
  cream: "#FAF6EC",
  greenSoft: "#E7F0E4",
};

const DEFAULT_NAME_A = "Moarschaft A";
const DEFAULT_NAME_B = "Moarschaft B";
const DEFAULT_SAVED_NAMES = ["Mit Ringen", "Glotzerte"];
const MAX_SAVED_NAMES = 24;
const INITIAL_GAME = { kehreNr: 1, raw: { A: 0, B: 0 }, kp: { A: 0, B: 0 }, stones: [] };
const STORAGE_PREFIX = "stockheil:";

function formatDate(d) {
  return new Date(d).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---- Persistenter State (localStorage) ----
function usePersistentState(key, initial, sanitize) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        return sanitize ? sanitize(parsed) : parsed;
      }
    } catch {
      // localStorage nicht verfügbar oder Inhalt defekt: Startwert verwenden
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      // z. B. privater Modus: App läuft trotzdem, nur ohne Speichern
    }
  }, [key, value]);
  return [value, setValue];
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Display anlassen (Screen Wake Lock) ----
// Rückgabe: "an" (Display bleibt an), "aus" (nicht aktiv) oder "nicht-moeglich" (Gerät/Browser unterstützt es nicht)
function useWakeLock(active) {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [status, setStatus] = useState("aus");

  useEffect(() => {
    if (!active) return undefined;
    if (!supported) return undefined;
    let lock = null;
    let cancelled = false;

    async function request() {
      if (lock && !lock.released) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        lock = sentinel;
        setStatus("an");
        sentinel.addEventListener("release", () => {
          if (!cancelled) setStatus("aus");
        });
      } catch {
        // z. B. Energiesparmodus: Display geht dann normal aus
        if (!cancelled) setStatus("aus");
      }
    }
    function onVisible() {
      // Beim Zurückkehren in die App wird die Sperre vom System aufgehoben, daher neu anfordern
      if (document.visibilityState === "visible") request();
    }

    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, [active, supported]);

  if (!supported) return "nicht-moeglich";
  return active ? status : "aus";
}

export default function Stockheil() {
  const [screen, setScreen] = usePersistentState("screen", "start", (s) => (["start", "kehre", "ende"].includes(s) ? s : "start"));
  // Menüs (Setup, Verlauf) liegen über dem Match und werden nicht gespeichert
  const [menu, setMenu] = useState(null);
  const [menuBack, setMenuBack] = useState(null);

  const [nameA, setNameA] = usePersistentState("nameA", DEFAULT_NAME_A);
  const [nameB, setNameB] = usePersistentState("nameB", DEFAULT_NAME_B);
  const [savedNames, setSavedNames] = usePersistentState("savedNames", DEFAULT_SAVED_NAMES);
  const [stonesPerTeam, setStonesPerTeam] = usePersistentState("stonesPerTeam", 4);
  const [targetPoints, setTargetPoints] = usePersistentState("targetPoints", 6);

  const [game, setGame] = usePersistentState("game", INITIAL_GAME);
  const [snapshots, setSnapshots] = usePersistentState("snapshots", []);
  const [ended, setEnded] = usePersistentState("ended", null);
  const [matchHistory, setMatchHistory] = usePersistentState("history", []);

  const [groupNames, setGroupNames] = usePersistentState("groupNames", "");
  const [groups, setGroups] = usePersistentState("groups", null);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [locked, setLocked] = useState(false);

  // Falls ein defekter Zwischenstand geladen wurde (Ende ohne Ergebnis)
  const baseScreen = screen === "ende" && !ended ? "start" : screen;
  const activeScreen = menu ?? baseScreen;
  const totalStones = stonesPerTeam * 2;
  // Display bleibt während des laufenden Matches an
  const displayStatus = useWakeLock(baseScreen === "kehre");

  // ---- Punktelogik ----
  const kehreScore = useMemo(() => {
    const stones = game.stones;
    if (stones.length === 0) return { A: 0, B: 0, complete: false };
    const first = stones[0];
    let count = 0;
    for (const t of stones) {
      if (t === first) count++;
      else break;
    }
    const pts = Math.min(count, 3) * 3;
    const maxCountable = Math.min(3, totalStones);
    const broken = stones.length > count;
    const capped = count === maxCountable;
    const allIn = stones.length === totalStones;
    const reichtSchon = game.raw[first] + pts >= 9;
    return {
      A: first === "A" ? pts : 0,
      B: first === "B" ? pts : 0,
      complete: broken || capped || allIn || reichtSchon,
    };
  }, [game.stones, game.raw, totalStones]);

  function addStone(team) {
    if (kehreScore.complete) return;
    setGame({ ...game, stones: [...game.stones, team] });
  }
  function undoStone() {
    setGame({ ...game, stones: game.stones.slice(0, -1) });
  }

  function speichereMatch(id, scoreA, scoreB, siegerName) {
    setMatchHistory((h) => [
      { id, date: new Date().toISOString(), teamA: nameA, teamB: nameB, scoreA, scoreB, sieger: siegerName },
      ...h,
    ]);
  }

  function auswerten() {
    const newRaw = { A: game.raw.A + kehreScore.A, B: game.raw.B + kehreScore.B };
    const newKp = { ...game.kp };
    let matchWinner = null;
    let punktErreicht = false;
    ["A", "B"].forEach((t) => {
      if (newRaw[t] >= 9) {
        newKp[t] += 1;
        punktErreicht = true;
        newRaw.A = 0;
        newRaw.B = 0;
        if (newKp[t] >= targetPoints) matchWinner = t;
      }
    });
    // Stand vor dieser Wertung merken, damit sie korrigiert werden kann
    setSnapshots([...snapshots, game]);
    setGame({ kehreNr: punktErreicht ? 1 : game.kehreNr + 1, raw: newRaw, kp: newKp, stones: [] });
    if (matchWinner) {
      const id = Date.now();
      speichereMatch(id, newKp.A, newKp.B, matchWinner === "A" ? nameA : nameB);
      setEnded({ matchId: id, auto: true, winner: matchWinner });
      setScreen("ende");
    }
  }

  // Letzte Wertung zurücknehmen: Stand und Stöcke dieser Kehre kommen zurück
  function korrigiereLetzteKehre() {
    if (snapshots.length === 0) return;
    setGame(snapshots[snapshots.length - 1]);
    setSnapshots(snapshots.slice(0, -1));
  }

  function beendeManuell() {
    const { A, B } = game.kp;
    const winner = A === B ? "unentschieden" : A > B ? "A" : "B";
    const id = Date.now();
    speichereMatch(id, A, B, winner === "A" ? nameA : winner === "B" ? nameB : null);
    setEnded({ matchId: id, auto: false, winner });
    setScreen("ende");
  }

  // Vom Ergebnis-Bildschirm zurück ins Match (Match wird wieder aus dem Verlauf entfernt)
  function korrigiereEnde() {
    if (!ended) return;
    setMatchHistory((h) => h.filter((m) => m.id !== ended.matchId));
    if (ended.auto && snapshots.length > 0) {
      setGame(snapshots[snapshots.length - 1]);
      setSnapshots(snapshots.slice(0, -1));
    }
    setEnded(null);
    setScreen("kehre");
  }

  function neuesMatch() {
    setGame(INITIAL_GAME);
    setSnapshots([]);
    setEnded(null);
    setScreen("start");
  }

  // Namen merken, damit sie beim nächsten Mal mit einem Klick wählbar sind
  function merkeNamen(names) {
    setSavedNames((list) => {
      const result = [...list];
      names.forEach((raw) => {
        const n = raw.trim();
        if (!n || n === DEFAULT_NAME_A || n === DEFAULT_NAME_B) return;
        if (result.some((x) => x.toLowerCase() === n.toLowerCase())) return;
        result.push(n);
      });
      return result.slice(-MAX_SAVED_NAMES);
    });
  }

  function startMatch() {
    const a = nameA.trim() || DEFAULT_NAME_A;
    const b = nameB.trim() || DEFAULT_NAME_B;
    setNameA(a);
    setNameB(b);
    merkeNamen([a, b]);
    setGame(INITIAL_GAME);
    setSnapshots([]);
    setEnded(null);
    setScreen("kehre");
  }

  function shuffleGroups() {
    const names = groupNames.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length < 2) return;
    const mixed = shuffled(names);
    const half = Math.ceil(mixed.length / 2);
    setGroups({ A: mixed.slice(0, half), B: mixed.slice(half) });
  }

  function loescheMatch(id) {
    setMatchHistory(matchHistory.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
  }

  function oeffneMenu(zu) {
    setMenuBack(menu);
    setMenu(zu);
  }
  function menueZurueck() {
    setMenu(menuBack);
    setMenuBack(null);
  }

  // ---- Styles ----
  const bigBtn = (bg, color = "#fff") => ({
    background: bg,
    color,
    border: "none",
    borderRadius: 20,
    padding: "22px 18px",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 0.3,
    boxShadow: "0 4px 0 rgba(0,0,0,0.25)",
    cursor: "pointer",
    touchAction: "manipulation",
  });

  const card = {
    background: "#fff",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 2px 10px rgba(15,61,18,0.08)",
    border: `1px solid ${COLORS.greenSoft}`,
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.cream, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {locked && <LockOverlay onUnlock={() => setLocked(false)} />}
      {/* Header */}
      <div style={{ background: COLORS.green, padding: "18px 14px 24px", position: "relative", overflow: "hidden" }}>
        <DaubeMark />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button onClick={() => setLocked(true)} aria-label="Sperren" style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 16, width: 56, height: 56,
            color: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <Lock size={26} />
          </button>

          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ color: COLORS.gold, fontWeight: 900, fontSize: 23, letterSpacing: 0.5, lineHeight: 1.1 }}>STOCKHEIL</div>
            <div style={{ color: "#cfe0cf", fontSize: 11 }}>Moarschafts-Wertung</div>
          </div>

          {activeScreen !== "verlauf" ? (
            <button onClick={() => oeffneMenu("verlauf")} aria-label="Verlauf" style={{
              background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 16, width: 56, height: 56,
              color: COLORS.gold, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, flexShrink: 0
            }}>
              <History size={24} />
              {matchHistory.length > 0 && <span style={{ fontSize: 10, fontWeight: 800 }}>{matchHistory.length}</span>}
            </button>
          ) : (
            <div style={{ width: 56, height: 56, flexShrink: 0 }} />
          )}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 520, margin: "0 auto" }}>
        {activeScreen === "start" && (
          <StartScreen
            {...{ nameA, setNameA, nameB, setNameB, savedNames, stonesPerTeam, targetPoints, card, bigBtn }}
            onStart={startMatch}
            onSetup={() => oeffneMenu("setup")}
          />
        )}

        {activeScreen === "setup" && (
          <SetupScreen
            {...{ stonesPerTeam, setStonesPerTeam, targetPoints, setTargetPoints, savedNames, setSavedNames, merkeNamen, groupNames, setGroupNames, groups, setGroups, shuffleGroups, nameA, nameB, card, bigBtn }}
            onFertig={menueZurueck}
          />
        )}

        {activeScreen === "kehre" && (
          <KehreScreen
            {...{ nameA, nameB, game, targetPoints, kehreScore, totalStones, displayStatus, card, bigBtn }}
            kannKorrigieren={snapshots.length > 0}
            addStone={addStone}
            undoStone={undoStone}
            auswerten={auswerten}
            korrigiereLetzteKehre={korrigiereLetzteKehre}
            beendeManuell={beendeManuell}
          />
        )}

        {activeScreen === "ende" && (
          <EndeScreen {...{ nameA, nameB, kp: game.kp, winner: ended.winner, auto: ended.auto, card, bigBtn }} onNeu={neuesMatch} onKorrigieren={korrigiereEnde} />
        )}

        {activeScreen === "verlauf" && (
          <VerlaufScreen
            {...{ matchHistory, card, bigBtn, confirmDeleteId, setConfirmDeleteId }}
            onLoeschen={loescheMatch}
            onZurueck={menueZurueck}
          />
        )}
      </div>
    </div>
  );
}

function LockOverlay({ onUnlock }) {
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const HOLD_MS = 1800;

  function start() {
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - startTime) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        clearInterval(timerRef.current);
        onUnlock();
      }
    }, 30);
  }
  function stop() {
    clearInterval(timerRef.current);
    setProgress(0);
  }
  useEffect(() => () => clearInterval(timerRef.current), []);

  const r = 54;
  const circumference = 2 * Math.PI * r;

  return (
    <div style={{
      position: "fixed", inset: 0, background: COLORS.green, zIndex: 999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
      touchAction: "none", userSelect: "none",
    }}>
      <div style={{ color: COLORS.gold, fontWeight: 900, fontSize: 26, letterSpacing: 1 }}>GESPERRT</div>
      <div style={{ color: "#cfe0cf", fontSize: 14, textAlign: "center", padding: "0 30px" }}>
        Knopf {(HOLD_MS / 1000).toFixed(1)} Sekunden halten zum Entsperren
      </div>
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        style={{
          width: 140, height: 140, borderRadius: "50%", border: "none", background: "transparent",
          position: "relative", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none",
        }}
      >
        <svg width="140" height="140" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
          <circle cx="70" cy="70" r={r} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
          <circle
            cx="70" cy="70" r={r} fill="none" stroke={COLORS.gold} strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.03s linear" }}
          />
        </svg>
        {progress > 0 ? <Unlock size={40} color={COLORS.gold} /> : <Lock size={40} color={COLORS.gold} />}
      </button>
    </div>
  );
}

function DaubeMark() {
  return (
    <svg style={{ position: "absolute", right: -30, top: -30, opacity: 0.15 }} width="160" height="160" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="78" fill="none" stroke={COLORS.gold} strokeWidth="4" />
      <circle cx="80" cy="80" r="52" fill="none" stroke={COLORS.gold} strokeWidth="4" />
      <circle cx="80" cy="80" r="26" fill={COLORS.gold} />
    </svg>
  );
}

// ---- Start: nur Mannschaftsnamen + Match starten ----
function StartScreen({ nameA, setNameA, nameB, setNameB, savedNames, stonesPerTeam, targetPoints, card, bigBtn, onStart, onSetup }) {
  const gleich = nameA.trim() !== "" && nameA.trim().toLowerCase() === nameB.trim().toLowerCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TeamNameCard label="Moarschaft 1" name={nameA} setName={setNameA} savedNames={savedNames} color={COLORS.gold} card={card} />
      <TeamNameCard label="Moarschaft 2" name={nameB} setName={setNameB} savedNames={savedNames} color={COLORS.purple} card={card} />

      {gleich && (
        <div style={{ textAlign: "center", color: COLORS.purple, fontWeight: 700, fontSize: 13 }}>
          Beide Moarschaften heißen gleich. Bitte einen Namen ändern.
        </div>
      )}

      <button onClick={onStart} disabled={gleich} style={{ ...bigBtn(COLORS.green), width: "100%", fontSize: 20, opacity: gleich ? 0.4 : 1 }}>
        Match starten
      </button>

      <div style={{ textAlign: "center", color: "#7a6a5a", fontSize: 13 }}>
        {stonesPerTeam} Stöcke je Moarschaft · Ziel {targetPoints} Kehrenpunkte
      </div>

      <button onClick={onSetup} style={{ ...bigBtn("#e9e4d8", COLORS.brown), width: "100%", fontSize: 16, padding: "14px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Settings size={20} /> Setup
      </button>
    </div>
  );
}

function TeamNameCard({ label, name, setName, savedNames, color, card }) {
  return (
    <div style={{ ...card, borderTop: `5px solid ${color}` }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#7a6a5a", marginBottom: 6, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.target.select()}
        maxLength={24}
        aria-label={label}
        style={{ fontWeight: 900, fontSize: 20, color: COLORS.brown, width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${COLORS.greenSoft}`, padding: "10px 12px", background: COLORS.cream }}
      />
      {savedNames.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {savedNames.map((n) => {
            const aktiv = n.toLowerCase() === name.trim().toLowerCase();
            return (
              <button key={n} onClick={() => setName(n)} style={{
                border: `1px solid ${aktiv ? color : COLORS.greenSoft}`,
                background: aktiv ? color : COLORS.greenSoft,
                color: aktiv && color === COLORS.purple ? "#fff" : COLORS.brown,
                borderRadius: 999, padding: "9px 14px", fontSize: 14, fontWeight: 700, touchAction: "manipulation",
              }}>
                {n}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Setup-Menü: Regeln, gespeicherte Namen, Zufalls-Gruppen ----
function SetupScreen({ stonesPerTeam, setStonesPerTeam, targetPoints, setTargetPoints, savedNames, setSavedNames, merkeNamen, groupNames, setGroupNames, groups, setGroups, shuffleGroups, nameA, nameB, card, bigBtn, onFertig }) {
  const [neuerName, setNeuerName] = useState("");
  const sectionTitle = { fontWeight: 800, color: COLORS.brown, marginBottom: 10, fontSize: 15 };

  function neuenNamenHinzufuegen() {
    merkeNamen([neuerName]);
    setNeuerName("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: 18, color: COLORS.green }}>Setup</div>

      <div style={card}>
        <div style={sectionTitle}>SPIELREGELN</div>
        <Stepper label="Stöcke je Moarschaft" value={stonesPerTeam} setValue={setStonesPerTeam} min={1} max={6} />
        <div style={{ height: 10 }} />
        <Stepper label="Ziel Kehrenpunkte" value={targetPoints} setValue={setTargetPoints} min={1} max={10} />
      </div>

      <div style={card}>
        <div style={sectionTitle}>GESPEICHERTE MOARSCHAFTS-NAMEN</div>
        <div style={{ fontSize: 13, color: "#7a6a5a", marginBottom: 10 }}>
          Namen aus gestarteten Matches werden automatisch gemerkt und auf dem Startbildschirm zur Auswahl angezeigt.
        </div>
        {savedNames.length === 0 && <div style={{ color: "#999", fontSize: 14, marginBottom: 10 }}>Noch keine Namen gespeichert.</div>}
        {savedNames.map((n) => (
          <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: COLORS.brown, fontSize: 15 }}>{n}</span>
            <button onClick={() => setSavedNames(savedNames.filter((x) => x !== n))} aria-label={`${n} löschen`} style={{ border: "none", background: "#f2f2f2", borderRadius: 10, width: 38, height: 38, color: "#a33", flexShrink: 0 }}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={neuerName}
            onChange={(e) => setNeuerName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") neuenNamenHinzufuegen(); }}
            maxLength={24}
            placeholder="Neuer Name"
            style={{ flex: 1, minWidth: 0, borderRadius: 10, border: `1px solid ${COLORS.greenSoft}`, padding: "10px 12px", fontSize: 15, boxSizing: "border-box" }}
          />
          <button onClick={neuenNamenHinzufuegen} disabled={neuerName.trim() === ""} aria-label="Name hinzufügen" style={{ border: "none", background: COLORS.green, color: "#fff", borderRadius: 10, width: 46, opacity: neuerName.trim() === "" ? 0.4 : 1 }}>
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>ZUFALLS-GRUPPEN</div>
        <textarea
          value={groupNames}
          onChange={(e) => setGroupNames(e.target.value)}
          placeholder={"Namen, einer pro Zeile\nz.B.\nSepp\nMoni\nSusi\nValentin"}
          rows={4}
          style={{ width: "100%", borderRadius: 12, border: `1px solid ${COLORS.greenSoft}`, padding: 10, fontSize: 15, boxSizing: "border-box" }}
        />
        <button onClick={shuffleGroups} style={{ ...bigBtn(COLORS.purple), width: "100%", marginTop: 10, fontSize: 16, padding: "14px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Shuffle size={20} /> Gruppen mischen
        </button>

        {groups && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <GruppenListe titel={nameA} namen={groups.A} color={COLORS.gold} textColor={COLORS.brown} />
            <GruppenListe titel={nameB} namen={groups.B} color={COLORS.purple} textColor="#fff" />
          </div>
        )}
        {groups && (
          <button onClick={() => setGroups(null)} style={{ border: "none", background: "transparent", color: "#7a6a5a", fontSize: 13, width: "100%", marginTop: 8 }}>
            Ergebnis ausblenden
          </button>
        )}
      </div>

      <ShareCard card={card} bigBtn={bigBtn} sectionTitle={sectionTitle} />

      <button onClick={onFertig} style={{ ...bigBtn(COLORS.green), width: "100%" }}>Fertig</button>
    </div>
  );
}

// ---- App weitergeben: QR-Code + Link teilen ----
function QrBild({ size }) {
  const quiet = 4; // Ruhezone um den Code, damit Kameras ihn sicher erkennen
  const total = QR_SIZE + quiet * 2;
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${total} ${total}`}
      role="img"
      aria-label="QR-Code zur Stockheil-App"
      shapeRendering="crispEdges"
      style={{ width: size, height: size, display: "block", borderRadius: 12 }}
    >
      <rect x={-quiet} y={-quiet} width={total} height={total} fill="#fff" />
      <path d={QR_PATH} fill="#000" />
    </svg>
  );
}

function ShareCard({ card, bigBtn, sectionTitle }) {
  const [gross, setGross] = useState(false);
  const [hinweis, setHinweis] = useState("");

  async function teilen() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Stockheil", text: "Stockheil: Moarschafts-Wertung für Eisstockschießen", url: APP_URL });
      } catch {
        // Teilen abgebrochen: nichts zu tun
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(APP_URL);
      setHinweis("Link kopiert");
    } catch {
      setHinweis("Kopieren nicht möglich");
    }
    setTimeout(() => setHinweis(""), 2500);
  }

  return (
    <div style={card}>
      <div style={sectionTitle}>APP WEITERGEBEN</div>
      <div style={{ fontSize: 13, color: "#7a6a5a", marginBottom: 12 }}>
        Zum Scannen mit der Handykamera. Antippen vergrößert den Code.
      </div>
      <button onClick={() => setGross(true)} aria-label="QR-Code vergrößern" style={{ border: `1px solid ${COLORS.greenSoft}`, background: "#fff", borderRadius: 14, padding: 8, display: "block", margin: "0 auto", touchAction: "manipulation" }}>
        <QrBild size={190} />
      </button>
      <div style={{ textAlign: "center", fontSize: 13, color: COLORS.brown, fontWeight: 700, marginTop: 10, wordBreak: "break-all" }}>{APP_URL}</div>
      <button onClick={teilen} style={{ ...bigBtn(COLORS.purple), width: "100%", marginTop: 12, fontSize: 16, padding: "14px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Share2 size={20} /> Link teilen
      </button>
      <div style={{ textAlign: "center", fontSize: 13, color: COLORS.green, fontWeight: 700, minHeight: 18, marginTop: 8 }}>{hinweis}</div>
      <div style={{ fontSize: 12, color: "#7a6a5a", marginTop: 4, lineHeight: 1.5 }}>
        Installieren: Android (Chrome) Menü ⋮ → „App installieren". iPhone (Safari) Teilen → „Zum Home-Bildschirm".
      </div>

      {gross && <QrVollbild onClose={() => setGross(false)} />}
    </div>
  );
}

// Vollbild-QR-Code zum Scannen durch andere (auch während des Matches erreichbar)
function QrVollbild({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 900, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 16, boxSizing: "border-box" }}
    >
      <div style={{ color: COLORS.green, fontWeight: 900, fontSize: 24 }}>STOCKHEIL</div>
      <QrBild size="min(86vw, 70vh, 460px)" />
      <div style={{ color: COLORS.brown, fontWeight: 700, fontSize: 14, textAlign: "center", wordBreak: "break-all" }}>{APP_URL}</div>
      <div style={{ color: "#7a6a5a", fontSize: 13 }}>Zum Schließen irgendwo tippen</div>
    </div>
  );
}

// Kleines QR-Symbol (ohne Icon-Bibliothek gezeichnet)
function QrSymbol({ size = 26, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3h-3z" />
    </svg>
  );
}

function GruppenListe({ titel, namen, color, textColor }) {
  return (
    <div style={{ background: color, color: textColor, borderRadius: 14, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titel}</div>
      {namen.map((n, i) => (
        <div key={i} style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div>
      ))}
    </div>
  );
}

function Stepper({ label, value, setValue, min, max }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: COLORS.brown, fontSize: 15, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setValue(Math.max(min, value - 1))} aria-label={`${label} weniger`} style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: COLORS.greenSoft, color: COLORS.green, fontSize: 18 }}><Minus size={18} /></button>
        <span style={{ fontWeight: 900, fontSize: 20, color: COLORS.green, minWidth: 24, textAlign: "center" }}>{value}</span>
        <button onClick={() => setValue(Math.min(max, value + 1))} aria-label={`${label} mehr`} style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: COLORS.greenSoft, color: COLORS.green, fontSize: 18 }}><Plus size={18} /></button>
      </div>
    </div>
  );
}

function KehreScreen({ nameA, nameB, game, targetPoints, kehreScore, totalStones, displayStatus, kannKorrigieren, addStone, undoStone, auswerten, korrigiereLetzteKehre, beendeManuell, card, bigBtn }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [qrOffen, setQrOffen] = useState(false);
  const stones = game.stones;
  const tile = { height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        <Scoreboard name={nameA} color={COLORS.gold} kp={game.kp.A} target={targetPoints} raw={game.raw.A} />
        <Scoreboard name={nameB} color={COLORS.purple} kp={game.kp.B} target={targetPoints} raw={game.raw.B} />
      </div>

      <div style={{ textAlign: "center", color: COLORS.brown, fontWeight: 800, fontSize: 15 }}>
        KEHRE {game.kehreNr} — Stock {stones.length} / {totalStones}
      </div>

      {stones.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", minHeight: 40 }}>
            {stones.map((t, i) => (
              <div key={i} style={{
                width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: t === "A" ? COLORS.gold : COLORS.purple, color: t === "A" ? COLORS.brown : "#fff", fontWeight: 800, fontSize: 13
              }}>{i + 1}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        <button onClick={() => addStone("A")} disabled={kehreScore.complete}
          style={{ ...bigBtn(COLORS.gold, COLORS.brown), ...tile, fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: kehreScore.complete ? 0.4 : 1 }}>
          {nameA}
        </button>
        <button onClick={() => addStone("B")} disabled={kehreScore.complete}
          style={{ ...bigBtn(COLORS.purple), ...tile, fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: kehreScore.complete ? 0.4 : 1 }}>
          {nameB}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        <button onClick={undoStone} disabled={stones.length === 0}
          style={{ ...bigBtn("#e9e4d8", COLORS.brown), ...tile, fontSize: 16, gap: 6, opacity: stones.length === 0 ? 0.4 : 1 }}>
          <RotateCcw size={20} /> Zurück
        </button>
        <button onClick={auswerten} disabled={stones.length === 0}
          style={{ ...bigBtn(COLORS.green), ...tile, fontSize: 16, gap: 6, opacity: stones.length === 0 ? 0.4 : 1 }}>
          <Check size={20} /> Kehre werten
        </button>
      </div>

      {kehreScore.complete && stones.length > 0 && (
        <div style={{ textAlign: "center", fontWeight: 800, color: COLORS.green }}>
          Diese Kehre: {nameA} +{kehreScore.A} · {nameB} +{kehreScore.B}
        </div>
      )}

      {kannKorrigieren && (
        <button onClick={korrigiereLetzteKehre} style={{ border: `2px solid ${COLORS.brown}`, background: "transparent", color: COLORS.brown, borderRadius: 16, padding: "14px 10px", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, touchAction: "manipulation" }}>
          <Undo2 size={18} /> Letzte Kehre korrigieren
        </button>
      )}
      {kannKorrigieren && stones.length > 0 && (
        <div style={{ textAlign: "center", fontSize: 12, color: "#7a6a5a", marginTop: -6 }}>
          Die Stöcke der laufenden Kehre werden dabei durch die der letzten Kehre ersetzt.
        </div>
      )}

      {!confirmEnd ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <button onClick={() => setQrOffen(true)} aria-label="QR-Code zum Weitergeben der App anzeigen" style={{ width: 48, height: 48, flexShrink: 0, border: `1px solid ${COLORS.greenSoft}`, background: "#fff", color: COLORS.green, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
            <QrSymbol />
          </button>
          <button onClick={() => setConfirmEnd(true)} style={{ border: "none", background: "transparent", color: "#a33", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 10 }}>
            <Flag size={14} /> Match jetzt beenden
          </button>
          <div style={{ width: 48, flexShrink: 0 }} />
        </div>
      ) : (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: COLORS.brown, fontWeight: 700, fontSize: 14, textAlign: "center" }}>Match wirklich beenden?</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirmEnd(false)} style={{ flex: 1, border: `1px solid ${COLORS.greenSoft}`, background: "#fff", borderRadius: 12, padding: "12px 0", fontWeight: 700, color: COLORS.brown }}>
              Abbrechen
            </button>
            <button onClick={beendeManuell} style={{ flex: 1, border: "none", background: "#a33", color: "#fff", borderRadius: 12, padding: "12px 0", fontWeight: 700 }}>
              Beenden
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 12, color: "#7a6a5a" }}>
        {displayStatus === "an" && "☀ Display bleibt an"}
        {displayStatus === "aus" && "Display-Timeout des Handys gilt"}
        {displayStatus === "nicht-moeglich" && "Display anlassen wird hier nicht unterstützt"}
      </div>

      {qrOffen && <QrVollbild onClose={() => setQrOffen(false)} />}
    </div>
  );
}

function Scoreboard({ name, color, kp, target, raw }) {
  return (
    <div style={{ height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, background: color, borderRadius: 20, padding: "10px", textAlign: "center", color: color === COLORS.gold ? COLORS.brown : "#fff", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>{kp}<span style={{ fontSize: 15, opacity: 0.7 }}> / {target}</span></div>
      <div style={{ fontSize: 22, fontWeight: 800, opacity: 0.9 }}>{raw} <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.75 }}>/ 9</span></div>
    </div>
  );
}

function EndeScreen({ nameA, nameB, kp, winner, auto, card, bigBtn, onNeu, onKorrigieren }) {
  const winnerName = winner === "A" ? nameA : winner === "B" ? nameB : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center", paddingTop: 20 }}>
      <Trophy size={54} color={COLORS.gold} />
      <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.green }}>
        {winnerName ? `${winnerName} gewinnt!` : "Unentschieden"}
      </div>
      <div style={{ ...card, width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.brown }}>{nameA}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.gold }}>{kp.A}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.brown }}>{nameB}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.purple }}>{kp.B}</div>
          </div>
        </div>
      </div>
      <button onClick={onNeu} style={{ ...bigBtn(COLORS.green), width: "100%" }}>Neues Match</button>
      <button onClick={onKorrigieren} style={{ border: `2px solid ${COLORS.brown}`, background: "transparent", color: COLORS.brown, borderRadius: 16, padding: "14px 10px", fontSize: 15, fontWeight: 800, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, touchAction: "manipulation" }}>
        <Undo2 size={18} /> {auto ? "Letzte Kehre korrigieren" : "Match fortsetzen"}
      </button>
    </div>
  );
}

function VerlaufScreen({ matchHistory, card, bigBtn, confirmDeleteId, setConfirmDeleteId, onLoeschen, onZurueck }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: 18, color: COLORS.green }}>Verlauf</div>

      {matchHistory.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "#888" }}>Noch keine Matches gespielt.</div>
      )}

      {matchHistory.map((m) => (
        <div key={m.id} style={card}>
          {confirmDeleteId === m.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: COLORS.brown, fontWeight: 700, fontSize: 14, textAlign: "center" }}>Match wirklich löschen?</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmDeleteId(null)} style={{ flex: 1, border: `1px solid ${COLORS.greenSoft}`, background: "#fff", borderRadius: 12, padding: "10px 0", fontWeight: 700, color: COLORS.brown }}>
                  Abbrechen
                </button>
                <button onClick={() => onLoeschen(m.id)} style={{ flex: 1, border: "none", background: "#a33", color: "#fff", borderRadius: 12, padding: "10px 0", fontWeight: 700 }}>
                  Löschen
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{formatDate(m.date)}</div>
                <div style={{ fontWeight: 800, color: COLORS.brown, fontSize: 15 }}>
                  {m.sieger ? `${m.sieger} hat ${m.scoreA}:${m.scoreB} gewonnen` : `Unentschieden ${m.scoreA}:${m.scoreB}`}
                </div>
                <div style={{ fontSize: 12, color: "#999" }}>{m.teamA} vs. {m.teamB}</div>
              </div>
              <button onClick={() => setConfirmDeleteId(m.id)} aria-label="Match löschen" style={{ border: "none", background: "#f2f2f2", borderRadius: 10, width: 38, height: 38, color: "#a33", flexShrink: 0 }}>
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
      ))}

      <button onClick={onZurueck} style={{ ...bigBtn(COLORS.green), width: "100%" }}>Zurück</button>
    </div>
  );
}
