import React, { useState, useMemo, useRef, useEffect } from "react";
import { Shuffle, RotateCcw, Check, Trophy, Flag, Plus, Minus, X, Trash2, History, Lock, Unlock } from "lucide-react";

// ---- Flitzepfeil-Farbpalette ----
const COLORS = {
  gold: "#F0A500",
  green: "#0F3D12",
  brown: "#3E1F0A",
  purple: "#AD1457",
  cream: "#FAF6EC",
  greenSoft: "#E7F0E4",
};

const emptyTeam = (name) => ({ name, shooters: ["", "", "", ""] });

function formatDate(d) {
  return new Date(d).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Stockheil() {
  const [screen, setScreen] = useState("setup");
  const [screenVorVerlauf, setScreenVorVerlauf] = useState("setup");
  const [teamA, setTeamA] = useState(emptyTeam("Moarschaft A"));
  const [teamB, setTeamB] = useState(emptyTeam("Moarschaft B"));
  const [stonesPerTeam, setStonesPerTeam] = useState(4);
  const [targetPoints, setTargetPoints] = useState(6);

  const [kehreNr, setKehreNr] = useState(1);
  const [rawPoints, setRawPoints] = useState({ A: 0, B: 0 });
  const [kehrenpunkte, setKehrenpunkte] = useState({ A: 0, B: 0 });
  const [currentStones, setCurrentStones] = useState([]);
  const [winner, setWinner] = useState(null);

  const [groupNames, setGroupNames] = useState("");
  const [matchHistory, setMatchHistory] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [locked, setLocked] = useState(false);

  const totalStones = stonesPerTeam * 2;

  // ---- Punktelogik ----
  const kehreScore = useMemo(() => {
    if (currentStones.length === 0) return { A: 0, B: 0, complete: false };
    const first = currentStones[0];
    let count = 0;
    for (const t of currentStones) {
      if (t === first) count++;
      else break;
    }
    const pts = Math.min(count, 3) * 3;
    const maxCountable = Math.min(3, totalStones);
    const broken = currentStones.length > count;
    const capped = count === maxCountable;
    const allIn = currentStones.length === totalStones;
    const reichtSchon = rawPoints[first] + pts >= 9;
    return {
      A: first === "A" ? pts : 0,
      B: first === "B" ? pts : 0,
      complete: broken || capped || allIn || reichtSchon,
    };
  }, [currentStones, totalStones, rawPoints]);

  function addStone(team) {
    if (kehreScore.complete) return;
    setCurrentStones([...currentStones, team]);
  }
  function undoStone() {
    setCurrentStones(currentStones.slice(0, -1));
  }

  function speichereMatch(scoreA, scoreB, siegerName) {
    setMatchHistory([
      { id: Date.now(), date: new Date().toISOString(), teamA: teamA.name, teamB: teamB.name, scoreA, scoreB, sieger: siegerName },
      ...matchHistory,
    ]);
  }

  function auswerten() {
    const newRaw = { ...rawPoints, A: rawPoints.A + kehreScore.A, B: rawPoints.B + kehreScore.B };
    const newKp = { ...kehrenpunkte };
    let matchWinner = null;
    let punktErreicht = false;
    (["A", "B"]).forEach((t) => {
      if (newRaw[t] >= 9) {
        newKp[t] += 1;
        punktErreicht = true;
        newRaw.A = 0;
        newRaw.B = 0;
        if (newKp[t] >= targetPoints) matchWinner = t;
      }
    });
    setRawPoints(newRaw);
    setKehrenpunkte(newKp);
    setCurrentStones([]);
    setKehreNr(punktErreicht ? 1 : kehreNr + 1);
    if (matchWinner) {
      setWinner(matchWinner);
      speichereMatch(newKp.A, newKp.B, matchWinner === "A" ? teamA.name : teamB.name);
      setScreen("ende");
    }
  }

  function beendeManuell() {
    const siegerName = kehrenpunkte.A === kehrenpunkte.B ? null : kehrenpunkte.A > kehrenpunkte.B ? teamA.name : teamB.name;
    setWinner(kehrenpunkte.A === kehrenpunkte.B ? "unentschieden" : kehrenpunkte.A > kehrenpunkte.B ? "A" : "B");
    speichereMatch(kehrenpunkte.A, kehrenpunkte.B, siegerName);
    setScreen("ende");
  }

  function neuesMatch() {
    setKehreNr(1);
    setRawPoints({ A: 0, B: 0 });
    setKehrenpunkte({ A: 0, B: 0 });
    setCurrentStones([]);
    setWinner(null);
    setScreen("setup");
  }

  function shuffleGroups() {
    const names = groupNames.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length < 2) return;
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    const gA = shuffled.slice(0, half);
    const gB = shuffled.slice(half);
    setTeamA({ ...teamA, shooters: gA });
    setTeamB({ ...teamB, shooters: gB });
  }

  function loescheMatch(id) {
    setMatchHistory(matchHistory.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
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
          <button onClick={() => setLocked(true)} style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 16, width: 56, height: 56,
            color: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <Lock size={26} />
          </button>

          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ color: COLORS.gold, fontWeight: 900, fontSize: 23, letterSpacing: 0.5, lineHeight: 1.1 }}>STOCKHEIL</div>
            <div style={{ color: "#cfe0cf", fontSize: 11 }}>Moarschafts-Wertung</div>
          </div>

          {screen !== "verlauf" ? (
            <button onClick={() => { setScreenVorVerlauf(screen); setScreen("verlauf"); }} style={{
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
        {screen === "setup" && (
          <SetupScreen
            {...{ teamA, setTeamA, teamB, setTeamB, stonesPerTeam, setStonesPerTeam, targetPoints, setTargetPoints, groupNames, setGroupNames, shuffleGroups, card, bigBtn }}
            onStart={() => setScreen("kehre")}
          />
        )}

        {screen === "kehre" && (
          <KehreScreen
            {...{ teamA, teamB, kehreNr, rawPoints, kehrenpunkte, targetPoints, currentStones, kehreScore, totalStones, card, bigBtn }}
            addStone={addStone}
            undoStone={undoStone}
            auswerten={auswerten}
            beendeManuell={beendeManuell}
          />
        )}

        {screen === "ende" && (
          <EndeScreen {...{ teamA, teamB, kehrenpunkte, winner, card, bigBtn }} onNeu={neuesMatch} />
        )}

        {screen === "verlauf" && (
          <VerlaufScreen
            {...{ matchHistory, card, bigBtn, confirmDeleteId, setConfirmDeleteId }}
            onLoeschen={loescheMatch}
            onZurueck={() => setScreen(screenVorVerlauf)}
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

function SetupScreen({ teamA, setTeamA, teamB, setTeamB, stonesPerTeam, setStonesPerTeam, targetPoints, setTargetPoints, groupNames, setGroupNames, shuffleGroups, card, bigBtn, onStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 800, color: COLORS.brown, marginBottom: 10, fontSize: 15 }}>ZUFALLS-GRUPPEN</div>
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
      </div>

      <TeamCard team={teamA} setTeam={setTeamA} color={COLORS.gold} textColor={COLORS.brown} card={card} />
      <TeamCard team={teamB} setTeam={setTeamB} color={COLORS.purple} textColor="#fff" card={card} />

      <div style={card}>
        <div style={{ fontWeight: 800, color: COLORS.brown, marginBottom: 10, fontSize: 15 }}>EINSTELLUNGEN</div>
        <Stepper label="Stöcke je Moarschaft" value={stonesPerTeam} setValue={setStonesPerTeam} min={1} max={6} />
        <div style={{ height: 10 }} />
        <Stepper label="Ziel Kehrenpunkte" value={targetPoints} setValue={setTargetPoints} min={1} max={10} />
      </div>

      <button onClick={onStart} style={{ ...bigBtn(COLORS.green), width: "100%", fontSize: 20 }}>
        Match starten
      </button>
    </div>
  );
}

function Stepper({ label, value, setValue, min, max }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: COLORS.brown, fontSize: 15, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setValue(Math.max(min, value - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: COLORS.greenSoft, color: COLORS.green, fontSize: 18 }}><Minus size={18} /></button>
        <span style={{ fontWeight: 900, fontSize: 20, color: COLORS.green, minWidth: 24, textAlign: "center" }}>{value}</span>
        <button onClick={() => setValue(Math.min(max, value + 1))} style={{ width: 40, height: 40, borderRadius: 10, border: "none", background: COLORS.greenSoft, color: COLORS.green, fontSize: 18 }}><Plus size={18} /></button>
      </div>
    </div>
  );
}

function TeamCard({ team, setTeam, color, textColor, card }) {
  const updateName = (i, val) => {
    const s = [...team.shooters];
    s[i] = val;
    setTeam({ ...team, shooters: s });
  };
  const addShooter = () => {
    if (team.shooters.length >= 14) return;
    setTeam({ ...team, shooters: [...team.shooters, ""] });
  };
  const removeShooter = (i) => {
    setTeam({ ...team, shooters: team.shooters.filter((_, idx) => idx !== i) });
  };
  return (
    <div style={{ ...card, borderTop: `5px solid ${color}` }}>
      <input
        value={team.name}
        onChange={(e) => setTeam({ ...team, name: e.target.value })}
        style={{ fontWeight: 900, fontSize: 17, color: COLORS.brown, border: "none", background: "transparent", width: "100%", marginBottom: 8 }}
      />
      {team.shooters.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={s}
            onChange={(e) => updateName(i, e.target.value)}
            placeholder={`Schütze ${i + 1}${i === 0 ? " (Moar)" : ""}`}
            style={{ flex: 1, borderRadius: 10, border: `1px solid ${COLORS.greenSoft}`, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" }}
          />
          <button onClick={() => removeShooter(i)} style={{ border: "none", background: "#f2f2f2", borderRadius: 10, width: 34, color: "#888" }}><X size={16} /></button>
        </div>
      ))}
      <button onClick={addShooter} style={{ border: `1px dashed ${color}`, background: "transparent", color: COLORS.brown, borderRadius: 10, padding: "8px 10px", fontSize: 13, width: "100%", marginTop: 2 }}>
        + Schütze hinzufügen (max. 14)
      </button>
      {team.shooters.length < 4 && (
        <div style={{ fontSize: 12, color: COLORS.purple, marginTop: 6, fontWeight: 600 }}>
          Unterbesetzt: Moar (Schütze 1) schießt 1. und letzten Stock.
        </div>
      )}
    </div>
  );
}

function KehreScreen({ teamA, teamB, kehreNr, rawPoints, kehrenpunkte, targetPoints, currentStones, kehreScore, totalStones, addStone, undoStone, auswerten, beendeManuell, card, bigBtn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        <Scoreboard name={teamA.name} color={COLORS.gold} kp={kehrenpunkte.A} target={targetPoints} raw={rawPoints.A} />
        <Scoreboard name={teamB.name} color={COLORS.purple} kp={kehrenpunkte.B} target={targetPoints} raw={rawPoints.B} />
      </div>

      <div style={{ textAlign: "center", color: COLORS.brown, fontWeight: 800, fontSize: 15 }}>
        KEHRE {kehreNr} — Stock {currentStones.length} / {totalStones}
      </div>

      {currentStones.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", minHeight: 40 }}>
            {currentStones.map((t, i) => (
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
          style={{ ...bigBtn(COLORS.gold, COLORS.brown), height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: kehreScore.complete ? 0.4 : 1 }}>
          {teamA.name}
        </button>
        <button onClick={() => addStone("B")} disabled={kehreScore.complete}
          style={{ ...bigBtn(COLORS.purple), height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: kehreScore.complete ? 0.4 : 1 }}>
          {teamB.name}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%" }}>
        <button onClick={undoStone} disabled={currentStones.length === 0}
          style={{ ...bigBtn("#e9e4d8", COLORS.brown), height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 16, gap: 6, opacity: currentStones.length === 0 ? 0.4 : 1 }}>
          <RotateCcw size={20} /> Zurück
        </button>
        <button onClick={auswerten} disabled={currentStones.length === 0}
          style={{ ...bigBtn(COLORS.green), height: 110, width: "100%", boxSizing: "border-box", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 16, gap: 6, opacity: currentStones.length === 0 ? 0.4 : 1 }}>
          <Check size={20} /> Kehre werten
        </button>
      </div>

      {kehreScore.complete && currentStones.length > 0 && (
        <div style={{ textAlign: "center", fontWeight: 800, color: COLORS.green }}>
          Diese Kehre: {teamA.name} +{kehreScore.A} · {teamB.name} +{kehreScore.B}
        </div>
      )}

      <button onClick={beendeManuell} style={{ border: "none", background: "transparent", color: "#a33", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Flag size={14} /> Match jetzt beenden
      </button>
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

function EndeScreen({ teamA, teamB, kehrenpunkte, winner, card, bigBtn, onNeu }) {
  const winnerName = winner === "A" ? teamA.name : winner === "B" ? teamB.name : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center", paddingTop: 20 }}>
      <Trophy size={54} color={COLORS.gold} />
      <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.green }}>
        {winnerName ? `${winnerName} gewinnt!` : "Unentschieden"}
      </div>
      <div style={{ ...card, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.brown }}>{teamA.name}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.gold }}>{kehrenpunkte.A}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.brown }}>{teamB.name}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.purple }}>{kehrenpunkte.B}</div>
          </div>
        </div>
      </div>
      <button onClick={onNeu} style={{ ...bigBtn(COLORS.green), width: "100%" }}>Neues Match</button>
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
              <button onClick={() => setConfirmDeleteId(m.id)} style={{ border: "none", background: "#f2f2f2", borderRadius: 10, width: 38, height: 38, color: "#a33", flexShrink: 0 }}>
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
