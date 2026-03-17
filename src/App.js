import { useState, useEffect } from "react";
import liff from "@line/liff";

const LIFF_ID = "2009492341-pX7zYyb0";
const CHANNEL_ACCESS_TOKEN = "YOUR_CHANNEL_ACCESS_TOKEN_HERE";
const SUPABASE_URL = "https://mdvjorchwyceozkmiude.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kdmpvcmNod3ljZW96a21pdWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjEzMTEsImV4cCI6MjA4ODkzNzMxMX0.HpoMVzZwhGtHW8vCsGQRw3oFjmVag-B1ygEBCwQkXXE";

// ========== Supabase APIヘルパー ==========
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// DBのeventをアプリ形式に変換
function dbToEvent(e) {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    mountain: e.mountain,
    date: e.date,
    time: e.time,
    place: e.place,
    difficulty: e.difficulty,
    distance: e.distance,
    elevation: e.elevation,
    duration: e.duration,
    memo: e.memo,
    result: e.result_distance != null ? {
      distance: e.result_distance,
      maxElevation: e.result_max_elevation,
      duration: e.result_duration,
    } : null,
    attendance: e.attendance || {},
    logs: e.logs || [],
  };
}

// DBのmemberをアプリ形式に変換
function dbToMember(m) {
  return {
    id: m.id,
    name: m.name,
    pictureUrl: m.picture_url,
    experience: m.experience,
    position: m.position,
    emoji: m.emoji,
    joinedAt: m.joined_at,
    totalHikes: m.total_hikes || 0,
    totalDistance: m.total_distance || 0,
  };
}

// ========== Supabase CRUD ==========
async function fetchMembers() {
  const data = await sbFetch("hiking_members?select=*&order=joined_at.asc");
  return data.map(dbToMember);
}

async function fetchEvents() {
  const data = await sbFetch("hiking_events?select=*&order=date.asc");
  return data.map(dbToEvent);
}

async function upsertMember(m) {
  await sbFetch("hiking_members", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: m.id, name: m.name, picture_url: m.pictureUrl,
      experience: m.experience, position: m.position, emoji: m.emoji,
    }),
  });
}

async function updateMember(id, changes) {
  await sbFetch(`hiking_members?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(changes.position !== undefined && { position: changes.position }),
      ...(changes.experience !== undefined && { experience: changes.experience }),
      ...(changes.emoji !== undefined && { emoji: changes.emoji }),
    }),
  });
}

async function deleteMember(id) {
  await sbFetch(`hiking_members?id=eq.${id}`, { method: "DELETE" });
}

async function upsertEvent(ev) {
  await sbFetch("hiking_events", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: ev.id, type: ev.type, title: ev.title,
      mountain: ev.mountain || null,
      date: ev.date, time: ev.time, place: ev.place,
      difficulty: ev.difficulty || null,
      distance: ev.distance || null,
      elevation: ev.elevation || null,
      duration: ev.duration || null,
      memo: ev.memo || null,
      result_distance: ev.result?.distance ?? null,
      result_max_elevation: ev.result?.maxElevation ?? null,
      result_duration: ev.result?.duration ?? null,
      attendance: ev.attendance || {},
      logs: ev.logs || [],
    }),
  });
}

async function deleteEvent(id) {
  await sbFetch(`hiking_events?id=eq.${id}`, { method: "DELETE" });
}

async function updateAttendance(eventId, attendance) {
  await sbFetch(`hiking_events?id=eq.${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ attendance }),
  });
}

async function updateLog(eventId, logs, result) {
  await sbFetch(`hiking_events?id=eq.${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      logs,
      result_distance: result?.distance ?? null,
      result_max_elevation: result?.maxElevation ?? null,
      result_duration: result?.duration ?? null,
    }),
  });
}

async function sendLineNotification(message) {
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ to: "YOUR_GROUP_ID", messages: [{ type: "text", text: message }] }),
    });
  } catch (e) { console.log("通知エラー:", e); }
}

// ========== 定数 ==========
const POSITION_OPTIONS = ["リーダー", "サブリーダー", "会計", "記録係", "一般メンバー", "見習い"];
const DIFFICULTY_OPTIONS = ["初級", "中級", "上級", "エキスパート"];
const EMOJI_OPTIONS = ["🏔️","⛰️","🧗","🥾","🎒","🌲","🌿","🍃","🦅","🌄","🌅","☀️","🌸","❄️","🌊","🍂","🦋","🐦","🌺","💪","😤","😎","🔥","⚡","🌟"];
const ATT_COLOR = { "○": "#22c55e", "×": "#ef4444", "△": "#f59e0b" };
const ATT_LABEL = { "○": "参加", "×": "欠席", "△": "未定" };
const DIFF_COLOR = { "初級": "#22c55e", "中級": "#f59e0b", "上級": "#ef4444", "エキスパート": "#7c3aed" };

const THEME = {
  bg: "#f0f4f0", dark: "#1a2e1a", mid: "#2d4a2d",
  accent: "#4a7c59", accentLight: "#6aab7a",
  card: "#ffffff", text: "#1a2e1a", textLight: "#5a7a5a", border: "#d4e4d4",
};
const commonStyles = {
  fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
  background: THEME.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto",
};

function formatDate(d) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}(${["日","月","火","水","木","金","土"][dt.getDay()]})`;
}

// ========== ローディング ==========
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${THEME.dark}, ${THEME.mid}, #1a3a2a)`, color: "#fff", fontFamily: "'Noto Sans JP', sans-serif" }}>
      <div style={{ fontSize: 64, marginBottom: 20, animation: "float 2s ease-in-out infinite" }}>🏔️</div>
      <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 2 }}>読み込み中...</div>
      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }`}</style>
    </div>
  );
}

// ========== 初回登録画面 ==========
function ProfileSetupView({ user, onComplete }) {
  const [position, setPosition] = useState("一般メンバー");
  const [experience, setExperience] = useState("");
  const [emoji, setEmoji] = useState("🏔️");

  const handleDone = () => {
    onComplete({ id: user.userId, name: user.displayName, pictureUrl: user.pictureUrl || null, experience: experience || "未設定", position, emoji, joinedAt: new Date().toISOString() });
  };

  return (
    <div style={{ ...commonStyles }}>
      <div style={{ background: `linear-gradient(160deg, ${THEME.dark}, ${THEME.mid})`, padding: "40px 20px 32px", color: "#fff", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 48, marginBottom: 8, opacity: 0.15, position: "absolute", top: 10, right: 20 }}>⛰️</div>
        {user.pictureUrl ? (
          <img src={user.pictureUrl} alt="" style={{ width: 84, height: 84, borderRadius: "50%", border: `3px solid ${THEME.accentLight}`, marginBottom: 14 }} />
        ) : (
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: `linear-gradient(135deg,${THEME.accent},${THEME.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 14px" }}>🧗</div>
        )}
        <div style={{ fontSize: 22, fontWeight: 900 }}>ようこそ！{user.displayName}さん</div>
        <div style={{ opacity: 0.6, fontSize: 13, marginTop: 6 }}>東大阪支部山登り同好会への参加登録</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ background: THEME.card, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", border: `1px solid ${THEME.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text, marginBottom: 18 }}>プロフィールを設定</div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>登山歴・経験（任意）</div>
            <input type="text" placeholder="例：3年、初心者、百名山20座など" value={experience} onChange={e => setExperience(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `2px solid ${THEME.border}`, fontSize: 15, boxSizing: "border-box", outline: "none", background: THEME.bg, color: THEME.text }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 8 }}>役割</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {POSITION_OPTIONS.map(p => (
                <button key={p} onClick={() => setPosition(p)} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: position === p ? THEME.accent : "#f1f5f1", color: position === p ? "#fff" : THEME.textLight, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 8 }}>アイコン絵文字</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setEmoji(e)} style={{ width: 44, height: 44, borderRadius: 10, border: emoji === e ? `2px solid ${THEME.accent}` : `2px solid ${THEME.border}`, background: emoji === e ? "#e8f5e9" : "#fff", fontSize: 22, cursor: "pointer" }}>{e}</button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={handleDone} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${THEME.mid}, ${THEME.accent})`, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: `0 4px 14px rgba(74,124,89,0.4)` }}>
          🏔️ 東大阪支部山登り同好会に参加する！
        </button>
      </div>
    </div>
  );
}

// ========== ホーム画面 ==========
function HomeView({ events, members, user, onSelectEvent, onAddEvent, onGoMembers }) {
  const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
  const upcoming = sortedEvents.filter(e => new Date(e.date) >= new Date());
  const past = sortedEvents.filter(e => new Date(e.date) < new Date() && e.result);
  const currentMember = members.find(m => m.id === user?.userId);
  const totalDist = past.reduce((s, e) => s + (e.result?.distance || 0), 0);

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(160deg, ${THEME.dark} 0%, ${THEME.mid} 60%, #2a4a3a 100%)`, padding: "28px 20px 24px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: 120, opacity: 0.05 }}>⛰️</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 2, marginBottom: 4 }}>HIGASHI-OSAKA BRANCH</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>🏔️ 東大阪支部山登り同好会</div>
            <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>全{members.length}名のメンバー</div>
          </div>
          {currentMember && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32 }}>{currentMember.emoji}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{currentMember.name}</div>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 20 }}>
          {[
            { label: "登山回数", value: past.length, unit: "回" },
            { label: "累計距離", value: totalDist.toFixed(1), unit: "km" },
            { label: "最高標高", value: Math.max(0, ...past.map(e => e.result?.maxElevation || 0)).toLocaleString(), unit: "m" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 8px", textAlign: "center", backdropFilter: "blur(4px)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: THEME.accentLight }}>{s.value}<span style={{ fontSize: 11 }}>{s.unit}</span></div>
              <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px 16px 0" }}>
        <button onClick={onAddEvent} style={{ width: "100%", padding: "14px", borderRadius: 14, border: `2px dashed ${THEME.accent}`, background: "rgba(74,124,89,0.06)", color: THEME.accent, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>＋</span> 登山・イベントを追加
        </button>
        {upcoming.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.textLight, letterSpacing: 1, marginBottom: 10 }}>📅 今後の登山</div>
            {upcoming.map(ev => {
              const myAtt = ev.attendance[user?.userId];
              const attCount = Object.values(ev.attendance).filter(v => v === "○").length;
              return (
                <div key={ev.id} onClick={() => onSelectEvent(ev)} style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `1px solid ${THEME.border}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ background: ev.type === "hiking" ? "#e8f5e9" : "#fff3e0", color: ev.type === "hiking" ? THEME.accent : "#e65100", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                          {ev.type === "hiking" ? "🏔️ 登山" : "🏃 トレーニング"}
                        </span>
                        {ev.difficulty && (
                          <span style={{ background: DIFF_COLOR[ev.difficulty] + "20", color: DIFF_COLOR[ev.difficulty], borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{ev.difficulty}</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text, marginBottom: 4 }}>{ev.title}</div>
                      <div style={{ fontSize: 13, color: THEME.textLight }}>📅 {formatDate(ev.date)} {ev.time}〜</div>
                      <div style={{ fontSize: 13, color: THEME.textLight }}>📍 {ev.place}</div>
                      {ev.elevation && <div style={{ fontSize: 13, color: THEME.textLight }}>🏔️ 標高 {ev.elevation.toLocaleString()}m / {ev.distance}km</div>}
                    </div>
                    <div style={{ textAlign: "center", marginLeft: 12 }}>
                      {myAtt ? (
                        <div style={{ background: ATT_COLOR[myAtt] + "20", color: ATT_COLOR[myAtt], borderRadius: 10, padding: "4px 10px", fontWeight: 800, fontSize: 13 }}>{ATT_LABEL[myAtt]}</div>
                      ) : (
                        <div style={{ background: "#f1f5f1", color: THEME.textLight, borderRadius: 10, padding: "4px 10px", fontWeight: 700, fontSize: 12 }}>未回答</div>
                      )}
                      <div style={{ fontSize: 11, color: THEME.textLight, marginTop: 6 }}>👤 {attCount}名参加</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {past.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.textLight, letterSpacing: 1, margin: "20px 0 10px" }}>✅ 過去の登山</div>
            {[...past].reverse().slice(0, 3).map(ev => (
              <div key={ev.id} onClick={() => onSelectEvent(ev)} style={{ background: THEME.card, borderRadius: 16, padding: 14, marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}`, cursor: "pointer", opacity: 0.85 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>{ev.title}</div>
                    <div style={{ fontSize: 12, color: THEME.textLight }}>{formatDate(ev.date)} ・ {ev.place}</div>
                  </div>
                  {ev.result && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: THEME.accent }}>🏔️ {ev.result.maxElevation?.toLocaleString()}m</div>
                      <div style={{ fontSize: 11, color: THEME.textLight }}>{ev.result.distance}km</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ========== イベント詳細画面 ==========
function EventDetailView({ event: ev, members, user, onBack, onUpdateAttendance, onEdit, onDelete, onLogInput }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  if (!ev) return null;
  const myAtt = ev.attendance[user?.userId];
  const attCounts = { "○": 0, "×": 0, "△": 0 };
  Object.values(ev.attendance).forEach(v => { if (attCounts[v] !== undefined) attCounts[v]++; });

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(160deg, ${THEME.dark}, ${THEME.mid})`, padding: "20px 16px 24px", color: "#fff" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 16px", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>← 戻る</button>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{ev.type === "hiking" ? "🏔️ 登山" : "🏃 トレーニング"}</span>
          {ev.difficulty && <span style={{ background: DIFF_COLOR[ev.difficulty] + "40", color: "#fff", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{ev.difficulty}</span>}
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{ev.title}</div>
        <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 4 }}>📅 {formatDate(ev.date)} {ev.time}〜</div>
        <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 4 }}>📍 {ev.place}</div>
        {ev.mountain && <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 4 }}>⛰️ 目標：{ev.mountain}</div>}
        {ev.elevation && <div style={{ opacity: 0.75, fontSize: 14 }}>📏 標高 {ev.elevation.toLocaleString()}m / 距離 {ev.distance}km / 想定 {Math.floor(ev.duration / 60)}時間{ev.duration % 60 > 0 ? ev.duration % 60 + "分" : ""}</div>}
        {ev.result && (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 8 }}>✅ 登山実績</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 900, color: THEME.accentLight }}>{ev.result.distance}<span style={{ fontSize: 11 }}>km</span></div><div style={{ fontSize: 10, opacity: 0.65 }}>距離</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 900, color: THEME.accentLight }}>{ev.result.maxElevation?.toLocaleString()}<span style={{ fontSize: 11 }}>m</span></div><div style={{ fontSize: 10, opacity: 0.65 }}>最高標高</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 900, color: THEME.accentLight }}>{Math.floor((ev.result.duration || 0) / 60)}<span style={{ fontSize: 11 }}>時間</span>{(ev.result.duration || 0) % 60 > 0 && <span>{(ev.result.duration || 0) % 60}<span style={{ fontSize: 11 }}>分</span></span>}</div><div style={{ fontSize: 10, opacity: 0.65 }}>所要時間</div></div>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {ev.memo && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>📝 メモ</div>
            <div style={{ fontSize: 14, color: "#78350f" }}>{ev.memo}</div>
          </div>
        )}
        {!ev.result && (
          <div style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text, marginBottom: 12 }}>あなたの出欠</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["○", "△", "×"].map(att => (
                <button key={att} onClick={() => onUpdateAttendance(ev.id, user?.userId, att)} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: myAtt === att ? ATT_COLOR[att] : "#f1f5f1", color: myAtt === att ? "#fff" : THEME.textLight, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  {att} {ATT_LABEL[att]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text, marginBottom: 12 }}>出欠状況</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["○", "△", "×"].map(att => (
              <div key={att} style={{ flex: 1, textAlign: "center", background: ATT_COLOR[att] + "15", borderRadius: 10, padding: "10px 0" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: ATT_COLOR[att] }}>{attCounts[att]}</div>
                <div style={{ fontSize: 11, color: THEME.textLight }}>{ATT_LABEL[att]}</div>
              </div>
            ))}
          </div>
          {members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 22, marginRight: 10 }}>{m.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>{m.name}</div>
                <div style={{ fontSize: 12, color: THEME.textLight }}>{m.position}</div>
              </div>
              <div style={{ background: ev.attendance[m.id] ? ATT_COLOR[ev.attendance[m.id]] + "20" : "#f1f5f1", color: ev.attendance[m.id] ? ATT_COLOR[ev.attendance[m.id]] : THEME.textLight, borderRadius: 8, padding: "3px 10px", fontWeight: 700, fontSize: 13 }}>
                {ev.attendance[m.id] ? ev.attendance[m.id] + " " + ATT_LABEL[ev.attendance[m.id]] : "未回答"}
              </div>
            </div>
          ))}
        </div>
        {ev.logs && ev.logs.length > 0 && (
          <div style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}` }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text, marginBottom: 12 }}>📍 登山ログ</div>
            {ev.logs.map((log, i) => (
              <div key={i} style={{ borderBottom: i < ev.logs.length - 1 ? `1px solid ${THEME.border}` : "none", paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>{log.title}</div>
                  <div style={{ fontSize: 12, color: THEME.textLight }}>{log.time}</div>
                </div>
                {log.elevation && <div style={{ fontSize: 13, color: THEME.accent, marginBottom: 4 }}>🏔️ {log.elevation.toLocaleString()}m</div>}
                {log.memo && <div style={{ fontSize: 13, color: THEME.textLight }}>{log.memo}</div>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <button onClick={() => onLogInput(ev)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${THEME.mid}, ${THEME.accent})`, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>📝 記録を入力</button>
          <button onClick={() => onEdit(ev)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${THEME.accent}`, background: "#fff", color: THEME.accent, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✏️ 編集</button>
        </div>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "2px solid #ef4444", background: "#fff", color: "#ef4444", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>🗑️ 削除</button>
        ) : (
          <div style={{ background: "#fff5f5", border: "2px solid #ef4444", borderRadius: 12, padding: 14 }}>
            <div style={{ textAlign: "center", fontWeight: 700, color: "#ef4444", marginBottom: 10 }}>本当に削除しますか？</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${THEME.border}`, background: "#fff", color: THEME.textLight, fontWeight: 700, cursor: "pointer" }}>キャンセル</button>
              <button onClick={() => onDelete(ev.id)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}>削除する</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 日本の山データ ==========
const JAPAN_MOUNTAINS = [
  // 関西
  { name: "生駒山",     elev: 642,  area: "大阪・奈良", cat: "関西", diff: "初級",  desc: "東大阪市のシンボル。ケーブルカーもあり気軽に登れる。" },
  { name: "信貴山",     elev: 437,  area: "奈良",       cat: "関西", diff: "初級",  desc: "朝護孫子寺で有名。ハイキングコースが整備されている。" },
  { name: "六甲山",     elev: 931,  area: "兵庫",       cat: "関西", diff: "初級",  desc: "神戸市街地を見下ろす。多彩なコースが楽しめる。" },
  { name: "金剛山",     elev: 1125, area: "大阪・奈良", cat: "関西", diff: "初級",  desc: "大阪府最高峰。四季折々の自然が美しい。" },
  { name: "大和葛城山", elev: 959,  area: "奈良・大阪", cat: "関西", diff: "初級",  desc: "春のツツジが有名。金剛山とセットで縦走も人気。" },
  { name: "比叡山",     elev: 848,  area: "京都・滋賀", cat: "関西", diff: "初級",  desc: "延暦寺の霊山。京都・琵琶湖を一望できる。" },
  { name: "愛宕山",     elev: 924,  area: "京都",       cat: "関西", diff: "初級",  desc: "京都市最高峰。愛宕神社への参拝登山が人気。" },
  { name: "高見山",     elev: 1248, area: "奈良・三重", cat: "関西", diff: "初級",  desc: "「関西のマッターホルン」。霧氷が美しい冬山。" },
  { name: "武奈ヶ岳",   elev: 1214, area: "滋賀",       cat: "関西", diff: "中級",  desc: "比良山系の最高峰。展望が素晴らしい。" },
  { name: "伊吹山",     elev: 1377, area: "滋賀",       cat: "関西", diff: "中級",  desc: "花の百名山。夏は高山植物が咲き乱れる。" },
  { name: "大峰山",     elev: 1915, area: "奈良",       cat: "関西", diff: "上級",  desc: "修験道の聖地・山上ヶ岳。近畿最高峰エリア。" },
  { name: "八経ヶ岳",   elev: 1915, area: "奈良",       cat: "関西", diff: "上級",  desc: "近畿最高峰。世界遺産・大峯奥駈道の一部。" },
  { name: "三輪山",     elev: 467,  area: "奈良",       cat: "関西", diff: "初級",  desc: "大神神社の御神体。神聖な雰囲気の山。" },
  { name: "岩湧山",     elev: 897,  area: "大阪",       cat: "関西", diff: "初級",  desc: "大阪南部の人気ハイキング山。山頂のススキが絶景。" },
  { name: "交野山",     elev: 341,  area: "大阪",       cat: "関西", diff: "初級",  desc: "交野市の低山。巨岩・観音岩が名所。" },
  { name: "飯盛山",     elev: 314,  area: "大阪",       cat: "関西", diff: "初級",  desc: "四條畷市の里山。楠木正行ゆかりの地。" },
  // 近畿周辺
  { name: "大台ヶ原",   elev: 1695, area: "奈良・三重", cat: "近畿周辺", diff: "初級",  desc: "日本有数の多雨地帯。原生林が広がる。" },
  { name: "三峰山",     elev: 1235, area: "奈良・三重", cat: "近畿周辺", diff: "初級",  desc: "霧氷が美しい冬山として人気。" },
  { name: "那岐山",     elev: 1255, area: "岡山・鳥取", cat: "近畿周辺", diff: "初級",  desc: "中国地方百名山。展望が素晴らしい。" },
  { name: "大山",       elev: 1729, area: "鳥取",       cat: "近畿周辺", diff: "中級",  desc: "中国地方最高峰。伯耆富士とも呼ばれる。" },
  // 百名山
  { name: "富士山",     elev: 3776, area: "静岡・山梨", cat: "百名山", diff: "上級",  desc: "日本最高峰。7〜8月が登山シーズン。" },
  { name: "北岳",       elev: 3193, area: "山梨",       cat: "百名山", diff: "上級",  desc: "日本第二位の高峰。南アルプス。" },
  { name: "奥穂高岳",   elev: 3190, area: "長野・岐阜", cat: "百名山", diff: "エキスパート", desc: "北アルプス最高峰。岩稜帯が続く。" },
  { name: "槍ヶ岳",     elev: 3180, area: "長野・岐阜", cat: "百名山", diff: "上級",  desc: "特徴的な穂先が有名。北アルプス。" },
  { name: "燕岳",       elev: 2763, area: "長野",       cat: "百名山", diff: "中級",  desc: "花崗岩の白い山頂と高山植物が美しい。" },
  { name: "蓼科山",     elev: 2531, area: "長野",       cat: "百名山", diff: "中級",  desc: "八ヶ岳の北端。山頂が広い。" },
  { name: "高尾山",     elev: 599,  area: "東京",       cat: "関東",   diff: "初級",  desc: "年間登山者数世界一。複数コースあり。" },
  { name: "塔ノ岳",     elev: 1491, area: "神奈川",     cat: "関東",   diff: "中級",  desc: "丹沢の主峰。富士山の眺望が素晴らしい。" },
];

const MOUNTAIN_CATS = ["すべて", "関西", "近畿周辺", "百名山", "関東"];

// ========== 山ピッカーコンポーネント ==========
function MountainPicker({ selectedName, onSelect }) {
  const [cat, setCat] = useState("関西");
  const [search, setSearch] = useState("");

  const filtered = JAPAN_MOUNTAINS.filter(m => {
    const catOk = cat === "すべて" || m.cat === cat;
    const searchOk = !search.trim() || m.name.includes(search.trim()) || m.area.includes(search.trim());
    return catOk && searchOk;
  });

  const selected = JAPAN_MOUNTAINS.find(m => m.name === selectedName);

  return (
    <div>
      {selected && (
        <div style={{ background: "#e8f5e9", borderRadius: 12, padding: 12, marginBottom: 12, border: `2px solid ${THEME.accent}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: THEME.text }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: THEME.textLight }}>📍 {selected.area} ・ {selected.diff}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 900, fontSize: 22, color: THEME.accent }}>{selected.elev.toLocaleString()}<span style={{ fontSize: 11 }}>m</span></div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: THEME.textLight, marginTop: 4 }}>{selected.desc}</div>
        </div>
      )}
      <input type="text" placeholder="山の名前・地域で検索..." value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", outline: "none", background: THEME.bg, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
        {MOUNTAIN_CATS.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: "none", background: cat === c ? THEME.accent : "#f1f5f1", color: cat === c ? "#fff" : THEME.textLight, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{c}</button>
        ))}
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(m => (
          <div key={m.name} onClick={() => onSelect(m)} style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: 12, border: selectedName === m.name ? `2px solid ${THEME.accent}` : `1px solid ${THEME.border}`, background: selectedName === m.name ? "#e8f5e9" : "#fff", cursor: "pointer" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: THEME.text }}>{m.name}</span>
                <span style={{ fontSize: 11, background: DIFF_COLOR[m.diff] + "20", color: DIFF_COLOR[m.diff], borderRadius: 6, padding: "1px 7px", fontWeight: 700 }}>{m.diff}</span>
              </div>
              <div style={{ fontSize: 11, color: THEME.textLight }}>📍 {m.area}</div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, color: THEME.accent }}>{m.elev.toLocaleString()}<span style={{ fontSize: 10 }}>m</span></div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: 20, color: THEME.textLight, fontSize: 13 }}>該当する山が見つかりません</div>}
      </div>
    </div>
  );
}

// ========== イベントフォーム ==========
function EventFormView({ onBack, onSave, editEvent }) {
  const [form, setForm] = useState(editEvent ? {
    title: editEvent.title, mountain: editEvent.mountain || "", type: editEvent.type,
    date: editEvent.date, time: editEvent.time, place: editEvent.place,
    difficulty: editEvent.difficulty || "初級", distance: editEvent.distance || "",
    elevation: editEvent.elevation || "", duration: editEvent.duration || "", memo: editEvent.memo || "",
  } : { title: "", mountain: "", type: "hiking", date: "", time: "08:00", place: "", difficulty: "初級", distance: "", elevation: "", duration: "", memo: "" });

  const [showPicker, setShowPicker] = useState(false);

  const handleSelectMountain = (m) => {
    setForm(p => ({
      ...p,
      mountain: m.name,
      elevation: m.elev,
      difficulty: m.diff,
      title: p.title || m.name,
    }));
    setShowPicker(false);
  };

  const handleSave = () => {
    if (!form.title || !form.date || !form.place) return alert("タイトル・日付・集合場所を入力してください");
    onSave({
      id: editEvent ? editEvent.id : "ev" + Date.now(),
      ...form,
      distance: form.distance ? parseFloat(form.distance) : null,
      elevation: form.elevation ? parseInt(form.elevation) : null,
      duration: form.duration ? parseInt(form.duration) : null,
      result: editEvent ? editEvent.result : null,
      attendance: editEvent ? editEvent.attendance : {},
      logs: editEvent ? editEvent.logs : [],
    });
  };

  const field = (label, key, type = "text", placeholder = "") => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>{label}</div>
      <input type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `2px solid ${THEME.border}`, fontSize: 15, boxSizing: "border-box", outline: "none", background: THEME.bg, color: THEME.text }} />
    </div>
  );

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(135deg, ${THEME.dark}, ${THEME.mid})`, padding: "20px 16px", color: "#fff" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 16px", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← 戻る</button>
        <div style={{ fontSize: 22, fontWeight: 900 }}>{editEvent ? "✏️ 登山を編集" : "＋ 登山を追加"}</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ background: THEME.card, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `1px solid ${THEME.border}` }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 8 }}>種別</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ v: "hiking", l: "🏔️ 登山" }, { v: "training", l: "🏃 トレーニング" }].map(t => (
                <button key={t.v} onClick={() => setForm(p => ({ ...p, type: t.v }))} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "none", background: form.type === t.v ? THEME.accent : "#f1f5f1", color: form.type === t.v ? "#fff" : THEME.textLight, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{t.l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight }}>目標の山</div>
              <button onClick={() => setShowPicker(v => !v)} style={{ background: showPicker ? THEME.accent : THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: showPicker ? "#fff" : THEME.textLight, cursor: "pointer" }}>
                {showPicker ? "閉じる" : "山を選ぶ 🏔️"}
              </button>
            </div>
            {showPicker && <MountainPicker selectedName={form.mountain} onSelect={handleSelectMountain} />}
            {!showPicker && (
              <input type="text" placeholder="例：生駒山" value={form.mountain} onChange={e => setForm(p => ({ ...p, mountain: e.target.value }))}
                style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `2px solid ${THEME.border}`, fontSize: 15, boxSizing: "border-box", outline: "none", background: THEME.bg, color: THEME.text }} />
            )}
          </div>
          {field("タイトル *", "title", "text", "例：生駒山ハイキング")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>{field("日付 *", "date", "date")}</div>
            <div>{field("集合時間", "time", "time")}</div>
          </div>
          {field("集合場所 *", "place", "text", "例：近鉄生駒駅")}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 8 }}>難易度</div>
            <div style={{ display: "flex", gap: 6 }}>
              {DIFFICULTY_OPTIONS.map(d => (
                <button key={d} onClick={() => setForm(p => ({ ...p, difficulty: d }))} style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: form.difficulty === d ? DIFF_COLOR[d] : "#f1f5f1", color: form.difficulty === d ? "#fff" : THEME.textLight, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{d}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[{ label: "距離(km)", key: "distance", placeholder: "6.0" }, { label: "標高(m)", key: "elevation", placeholder: "642" }, { label: "想定(分)", key: "duration", placeholder: "180" }].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>{f.label}</div>
                <input type="number" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", padding: "10px", borderRadius: 10, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", background: THEME.bg, outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>メモ</div>
            <textarea placeholder="コース概要・注意事項など" value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} rows={3}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 11, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", resize: "vertical", outline: "none", background: THEME.bg, color: THEME.text }} />
          </div>
        </div>
        <button onClick={handleSave} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${THEME.mid}, ${THEME.accent})`, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: `0 4px 14px rgba(74,124,89,0.4)` }}>
          {editEvent ? "💾 変更を保存" : "🏔️ 登山を登録"}
        </button>
      </div>
    </div>
  );
}

// ========== 登山ログ入力 ==========
function LogInputView({ event: ev, onBack, onSave }) {
  const [result, setResult] = useState(ev.result || { distance: ev.distance || "", maxElevation: ev.elevation || "", duration: ev.duration || "" });
  const [logs, setLogs] = useState(ev.logs || []);
  const [newLog, setNewLog] = useState({ title: "", elevation: "", time: "", memo: "" });
  const [showLogForm, setShowLogForm] = useState(false);

  const handleAddLog = () => {
    if (!newLog.title) return;
    setLogs(prev => [...prev, { ...newLog, elevation: newLog.elevation ? parseInt(newLog.elevation) : null }]);
    setNewLog({ title: "", elevation: "", time: "", memo: "" });
    setShowLogForm(false);
  };

  const handleSave = () => {
    onSave(ev.id, logs, {
      distance: parseFloat(result.distance) || null,
      maxElevation: parseInt(result.maxElevation) || null,
      duration: parseInt(result.duration) || null,
    });
    onBack();
  };

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(135deg, ${THEME.dark}, ${THEME.mid})`, padding: "20px 16px", color: "#fff" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 16px", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← 戻る</button>
        <div style={{ fontSize: 22, fontWeight: 900 }}>📝 登山記録</div>
        <div style={{ opacity: 0.65, fontSize: 14, marginTop: 4 }}>{ev.title}</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ background: THEME.card, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `1px solid ${THEME.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text, marginBottom: 16 }}>🏆 実績を記録</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[{ label: "距離(km)", key: "distance", placeholder: "6.0" }, { label: "最高標高(m)", key: "maxElevation", placeholder: "599" }, { label: "所要時間(分)", key: "duration", placeholder: "195" }].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.textLight, marginBottom: 5 }}>{f.label}</div>
                <input type="number" placeholder={f.placeholder} value={result[f.key]} onChange={e => setResult(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", padding: "10px", borderRadius: 10, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", background: THEME.bg, outline: "none" }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: THEME.card, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `1px solid ${THEME.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text }}>📍 チェックポイント</div>
            <button onClick={() => setShowLogForm(true)} style={{ background: THEME.accent, border: "none", color: "#fff", borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>＋ 追加</button>
          </div>
          {logs.map((log, i) => (
            <div key={i} style={{ background: THEME.bg, borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700, color: THEME.text }}>{log.title}</div>
                <div style={{ fontSize: 12, color: THEME.textLight }}>{log.time}</div>
              </div>
              {log.elevation && <div style={{ fontSize: 13, color: THEME.accent }}>🏔️ {log.elevation.toLocaleString()}m</div>}
              {log.memo && <div style={{ fontSize: 13, color: THEME.textLight, marginTop: 4 }}>{log.memo}</div>}
              <button onClick={() => setLogs(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", padding: "4px 0 0" }}>削除</button>
            </div>
          ))}
          {showLogForm && (
            <div style={{ background: "#f0f7f0", border: `2px solid ${THEME.border}`, borderRadius: 14, padding: 14 }}>
              {[{ label: "地点名 *", key: "title", placeholder: "山頂・○合目など" }, { label: "標高(m)", key: "elevation", placeholder: "例：599", type: "number" }, { label: "時刻", key: "time", placeholder: "例：10:30" }, { label: "メモ", key: "memo", placeholder: "景色・状況など" }].map(f => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textLight, marginBottom: 4 }}>{f.label}</div>
                  <input type={f.type || "text"} placeholder={f.placeholder} value={newLog[f.key]} onChange={e => setNewLog(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", background: "#fff", outline: "none" }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowLogForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${THEME.border}`, background: "#fff", color: THEME.textLight, fontWeight: 700, cursor: "pointer" }}>キャンセル</button>
                <button onClick={handleAddLog} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: THEME.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>追加</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={handleSave} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${THEME.mid}, ${THEME.accent})`, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: `0 4px 14px rgba(74,124,89,0.4)` }}>
          💾 記録を保存
        </button>
      </div>
    </div>
  );
}

// ========== メンバー管理 ==========
function MembersView({ members, currentUser, onBack, onUpdateMember, onRemoveMember }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showDeleteId, setShowDeleteId] = useState(null);

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(135deg, ${THEME.dark}, ${THEME.mid})`, padding: "20px 16px", color: "#fff" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 16px", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← 戻る</button>
        <div style={{ fontSize: 22, fontWeight: 900 }}>👥 メンバー管理</div>
        <div style={{ opacity: 0.6, fontSize: 13 }}>全{members.length}名</div>
      </div>
      <div style={{ padding: 16, paddingBottom: 80 }}>
        {members.map(m => {
          const isMe = m.id === currentUser?.userId;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: isMe ? `2px solid ${THEME.accent}` : `2px solid ${THEME.border}` }}>
              {!isEditing ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 36 }}>{m.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text }}>{m.name}</div>
                      {isMe && <span style={{ background: THEME.accent, color: "#fff", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>自分</span>}
                    </div>
                    <div style={{ fontSize: 13, color: THEME.textLight }}>{m.position} ・ 登山歴：{m.experience || "未設定"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isMe && <button onClick={() => { setEditingId(m.id); setEditForm({ position: m.position, experience: m.experience, emoji: m.emoji }); }} style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 13, color: THEME.textLight, cursor: "pointer" }}>編集</button>}
                    <button onClick={() => setShowDeleteId(m.id)} style={{ background: "#fee2e2", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "#dc2626" }}>🗑️</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>役割</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {POSITION_OPTIONS.map(p => <button key={p} onClick={() => setEditForm(prev => ({ ...prev, position: p }))} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: editForm.position === p ? THEME.accent : "#f1f5f1", color: editForm.position === p ? "#fff" : THEME.textLight, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{p}</button>)}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>登山歴</div>
                    <input value={editForm.experience || ""} onChange={e => setEditForm(p => ({ ...p, experience: e.target.value }))} placeholder="例：3年、百名山20座"
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: `2px solid ${THEME.border}`, fontSize: 14, boxSizing: "border-box", background: THEME.bg, outline: "none" }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textLight, marginBottom: 6 }}>アイコン</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {EMOJI_OPTIONS.map(e => <button key={e} onClick={() => setEditForm(p => ({ ...p, emoji: e }))} style={{ width: 38, height: 38, borderRadius: 9, border: editForm.emoji === e ? `2px solid ${THEME.accent}` : `2px solid ${THEME.border}`, background: editForm.emoji === e ? "#e8f5e9" : "#fff", fontSize: 20, cursor: "pointer" }}>{e}</button>)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${THEME.border}`, background: "#fff", color: THEME.textLight, fontWeight: 700, cursor: "pointer" }}>キャンセル</button>
                    <button onClick={() => { onUpdateMember(m.id, editForm); setEditingId(null); }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: THEME.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>保存</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showDeleteId && (() => {
        const m = members.find(m => m.id === showDeleteId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🗑️</div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>{m?.name}さんを削除しますか？</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowDeleteId(null)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${THEME.border}`, background: "#fff", color: THEME.textLight, fontWeight: 700, cursor: "pointer" }}>キャンセル</button>
                <button onClick={() => { onRemoveMember(showDeleteId); setShowDeleteId(null); }} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}>削除する</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ========== 累計標高マイルストーン ==========
const ELEVATION_MILESTONES = [
  { name: "高尾山",   elev: 599,  emoji: "🌲" },
  { name: "筑波山",   elev: 877,  emoji: "⛩️" },
  { name: "大山",     elev: 1252, emoji: "🍂" },
  { name: "塔ノ岳",   elev: 1491, emoji: "🌿" },
  { name: "蓼科山",   elev: 2531, emoji: "🌾" },
  { name: "燕岳",     elev: 2763, emoji: "🪨" },
  { name: "北岳",     elev: 3193, emoji: "❄️" },
  { name: "富士山",   elev: 3776, emoji: "🗻" },
  { name: "エベレスト", elev: 8849, emoji: "👑" },
];

function getMilestoneInfo(totalElev) {
  let reached = ELEVATION_MILESTONES[0];
  for (const m of ELEVATION_MILESTONES) {
    if (totalElev >= m.elev) reached = m;
    else break;
  }
  const nextIdx = ELEVATION_MILESTONES.findIndex(m => m.elev > totalElev);
  const next = nextIdx >= 0 ? ELEVATION_MILESTONES[nextIdx] : ELEVATION_MILESTONES[ELEVATION_MILESTONES.length - 1];
  const prevElev = nextIdx > 0 ? ELEVATION_MILESTONES[nextIdx - 1].elev : 0;
  const pct = nextIdx >= 0
    ? Math.min(100, Math.round(((totalElev - prevElev) / (next.elev - prevElev)) * 100))
    : 100;
  return { reached, next, pct, remaining: Math.max(0, next.elev - totalElev) };
}

// ========== 統計画面 ==========
function StatsView({ events, members, onBack }) {
  const [tab, setTab] = useState("elevation"); // "elevation" | "record"
  const completedEvents = events.filter(e => e.result);

  const memberStats = members.map(m => {
    const attended = completedEvents.filter(e => e.attendance[m.id] === "○");
    const totalDist = attended.reduce((s, e) => s + (e.result?.distance || 0), 0);
    const totalElev = attended.reduce((s, e) => s + (e.result?.maxElevation || 0), 0);
    const maxElev = Math.max(0, ...attended.map(e => e.result?.maxElevation || 0));
    return { ...m, attended: attended.length, totalDist, totalElev, maxElev };
  }).sort((a, b) => b.totalElev - a.totalElev);

  const RANK_COLORS = ["#c9a84c", "#8b9da8", "#8b5e3c", THEME.accent, THEME.textLight];

  return (
    <div style={{ ...commonStyles, paddingBottom: 80 }}>
      {/* ヘッダー */}
      <div style={{ background: `linear-gradient(160deg, ${THEME.dark}, ${THEME.mid})`, padding: "20px 16px 24px", color: "#fff" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 16px", fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← 戻る</button>
        <div style={{ fontSize: 22, fontWeight: 900 }}>📊 登山統計</div>
        <div style={{ opacity: 0.6, fontSize: 13 }}>全{completedEvents.length}回の登山記録</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
          {[
            { label: "総登山", value: completedEvents.length, unit: "回" },
            { label: "累計距離", value: completedEvents.reduce((s, e) => s + (e.result?.distance || 0), 0).toFixed(1), unit: "km" },
            { label: "最高峰", value: Math.max(0, ...completedEvents.map(e => e.result?.maxElevation || 0)).toLocaleString(), unit: "m" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: THEME.accentLight }}>{s.value}<span style={{ fontSize: 11 }}>{s.unit}</span></div>
              <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* タブ切り替え */}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
        {[{ key: "elevation", label: "🏔️ 累計標高ランキング" }, { key: "record", label: "📋 登山履歴" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "11px 8px", borderRadius: 12, border: "none",
            background: tab === t.key ? THEME.accent : "#f1f5f1",
            color: tab === t.key ? "#fff" : THEME.textLight,
            fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {/* ===== 累計標高ランキング ===== */}
        {tab === "elevation" && (
          <>
            {/* マイルストーン一覧 */}
            <div style={{ background: THEME.card, borderRadius: 16, padding: 14, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: THEME.textLight, marginBottom: 10 }}>🗺️ マイルストーン</div>
              <div style={{ display: "flex", overflowX: "auto", gap: 8, paddingBottom: 4 }}>
                {ELEVATION_MILESTONES.map((ms, i) => {
                  const anyReached = memberStats.some(m => m.totalElev >= ms.elev);
                  return (
                    <div key={ms.name} style={{ flexShrink: 0, textAlign: "center", opacity: anyReached ? 1 : 0.35 }}>
                      <div style={{ fontSize: 22, marginBottom: 2 }}>{ms.emoji}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: THEME.text, whiteSpace: "nowrap" }}>{ms.name}</div>
                      <div style={{ fontSize: 9, color: THEME.textLight }}>{ms.elev.toLocaleString()}m</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* メンバーランキング */}
            {memberStats.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: THEME.textLight }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🏔️</div>
                <div style={{ fontWeight: 700 }}>登山記録を入力するとランキングが表示されます</div>
              </div>
            ) : (
              memberStats.map((m, i) => {
                const { reached, next, pct, remaining } = getMilestoneInfo(m.totalElev);
                const rankColor = RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)];
                return (
                  <div key={m.id} style={{ background: THEME.card, borderRadius: 16, padding: 16, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: i === 0 ? `2px solid ${THEME.gold}` : `1px solid ${THEME.border}` }}>
                    {/* 名前・ランク行 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: rankColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#fff", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ fontSize: 28, flexShrink: 0 }}>{m.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: THEME.textLight }}>{m.position} ・ {m.attended}回参加</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900, fontSize: 18, color: THEME.accent }}>{m.totalElev.toLocaleString()}<span style={{ fontSize: 11 }}>m</span></div>
                        <div style={{ fontSize: 10, color: THEME.textLight }}>累計標高</div>
                      </div>
                    </div>

                    {/* 進捗バー */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: THEME.textLight, marginBottom: 4 }}>
                        <span>{reached.emoji} {reached.name} 到達済み</span>
                        <span>次: {next.emoji} {next.name} まで {remaining.toLocaleString()}m</span>
                      </div>
                      <div style={{ background: "#e8f5e9", borderRadius: 6, height: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${THEME.accent}, ${THEME.accentLight})`, borderRadius: 6, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ fontSize: 10, color: THEME.textLight, marginTop: 3, textAlign: "right" }}>{pct}%</div>
                    </div>

                    {/* 小統計 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <div style={{ background: "#e8f5e9", borderRadius: 8, padding: "6px 0", textAlign: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: THEME.accent }}>{m.attended}</div>
                        <div style={{ fontSize: 9, color: THEME.textLight }}>登山回数</div>
                      </div>
                      <div style={{ background: "#e8f5e9", borderRadius: 8, padding: "6px 0", textAlign: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: THEME.accent }}>{m.totalDist.toFixed(1)}</div>
                        <div style={{ fontSize: 9, color: THEME.textLight }}>累計km</div>
                      </div>
                      <div style={{ background: "#e8f5e9", borderRadius: 8, padding: "6px 0", textAlign: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: THEME.accent }}>{m.maxElev > 0 ? m.maxElev.toLocaleString() : "---"}</div>
                        <div style={{ fontSize: 9, color: THEME.textLight }}>最高標高m</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ===== 登山履歴 ===== */}
        {tab === "record" && (
          completedEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: THEME.textLight }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
              <div style={{ fontWeight: 700 }}>まだ記録がありません</div>
            </div>
          ) : (
            [...completedEvents].reverse().map(ev => (
              <div key={ev.id} style={{ background: THEME.card, borderRadius: 14, padding: 14, marginBottom: 8, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: `1px solid ${THEME.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>{ev.title}</div>
                    <div style={{ fontSize: 12, color: THEME.textLight }}>{formatDate(ev.date)} ・ {ev.place}</div>
                    <div style={{ fontSize: 11, color: THEME.textLight, marginTop: 2 }}>
                      参加 {Object.values(ev.attendance).filter(v => v === "○").length}名
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: THEME.accent, fontSize: 15 }}>🏔️ {ev.result.maxElevation?.toLocaleString()}m</div>
                    <div style={{ fontSize: 12, color: THEME.textLight }}>{ev.result.distance}km</div>
                    <div style={{ fontSize: 11, color: THEME.textLight }}>{Math.floor((ev.result.duration || 0) / 60)}h{(ev.result.duration || 0) % 60 > 0 ? (ev.result.duration % 60) + "m" : ""}</div>
                  </div>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

// ========== MAIN APP ==========
export default function App() {
  const [liffReady, setLiffReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isNewMember, setIsNewMember] = useState(false);
  const [view, setView] = useState("home");
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [logEvent, setLogEvent] = useState(null);

  useEffect(() => {
    liff.init({ liffId: LIFF_ID })
      .then(() => { if (liff.isLoggedIn()) return liff.getProfile(); else liff.login(); })
      .then(async profile => {
        if (profile) {
          setUser(profile);
          const [ms, es] = await Promise.all([fetchMembers(), fetchEvents()]);
          setMembers(ms);
          setEvents(es);
          if (!ms.find(m => m.id === profile.userId)) setIsNewMember(true);
        }
        setLoading(false);
        setLiffReady(true);
      })
      .catch(async () => {
        const mockUser = { userId: "UTEST001", displayName: "テストユーザー", pictureUrl: null };
        setUser(mockUser);
        const [ms, es] = await Promise.all([fetchMembers(), fetchEvents()]);
        setMembers(ms);
        setEvents(es);
        if (!ms.find(m => m.id === mockUser.userId)) setIsNewMember(true);
        setLoading(false);
        setLiffReady(true);
      });
  }, []);

  const handleProfileComplete = async (newMember) => {
    await upsertMember(newMember);
    const ms = await fetchMembers();
    setMembers(ms);
    setIsNewMember(false);
  };

  const handleUpdateMember = async (id, changes) => {
    await updateMember(id, changes);
    const ms = await fetchMembers();
    setMembers(ms);
  };

  const handleRemoveMember = async (id) => {
    await deleteMember(id);
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateAttendance = async (eventId, userId, status) => {
    const ev = events.find(e => e.id === eventId);
    const newAtt = { ...(ev?.attendance || {}), [userId]: status };
    await updateAttendance(eventId, newAtt);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, attendance: newAtt } : e));
    if (selectedEvent?.id === eventId) setSelectedEvent(prev => ({ ...prev, attendance: newAtt }));
    await sendLineNotification(`${status === "○" ? "✅" : status === "×" ? "❌" : "🤔"} ${user?.displayName}さんが「${ev?.title}」の出欠を回答：${ATT_LABEL[status]}`);
  };

  const handleSaveEvent = async (ev) => {
    await upsertEvent(ev);
    const es = await fetchEvents();
    setEvents(es);
    if (editEvent) { setSelectedEvent(ev); setView("event"); }
    else setView("home");
    setEditEvent(null);
  };

  const handleSaveLog = async (eventId, logs, result) => {
    await updateLog(eventId, logs, result);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, logs, result } : e));
    if (selectedEvent?.id === eventId) setSelectedEvent(prev => ({ ...prev, logs, result }));
    if (logEvent?.id === eventId) setLogEvent(prev => ({ ...prev, logs, result }));
  };

  const handleDeleteEvent = async (eventId) => {
    await deleteEvent(eventId);
    setEvents(prev => prev.filter(e => e.id !== eventId));
    setView("home");
  };

  if (!liffReady || loading) return <LoadingScreen />;
  if (isNewMember && user) return <ProfileSetupView user={user} onComplete={handleProfileComplete} />;

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif", background: THEME.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 72 }}>
      <div style={{ overflowY: "auto" }}>
        {view === "home" && <HomeView events={events} members={members} user={user} onSelectEvent={ev => { setSelectedEvent(ev); setView("event"); }} onAddEvent={() => { setEditEvent(null); setView("form"); }} onGoMembers={() => setView("members")} />}
        {view === "event" && selectedEvent && <EventDetailView event={events.find(e => e.id === selectedEvent.id)} members={members} user={user} onBack={() => setView("home")} onUpdateAttendance={handleUpdateAttendance} onEdit={ev => { setEditEvent(ev); setView("form"); }} onDelete={handleDeleteEvent} onLogInput={ev => { setLogEvent(ev); setView("logInput"); }} />}
        {view === "logInput" && logEvent && <LogInputView event={events.find(e => e.id === logEvent.id)} members={members} onBack={() => setView("event")} onSave={handleSaveLog} />}
        {view === "form" && <EventFormView onBack={() => { setView(editEvent ? "event" : "home"); setEditEvent(null); }} onSave={handleSaveEvent} editEvent={editEvent} />}
        {view === "stats" && <StatsView events={events} members={members} onBack={() => setView("home")} />}
        {view === "members" && <MembersView members={members} currentUser={user} onBack={() => setView("home")} onUpdateMember={handleUpdateMember} onRemoveMember={handleRemoveMember} />}
      </div>
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: `1px solid ${THEME.border}`, display: "flex", zIndex: 100, boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}>
        {[{ v: "home", icon: "🏠", label: "ホーム" }, { v: "members", icon: "👥", label: "メンバー" }, { v: "stats", icon: "📊", label: "統計" }].map(tab => (
          <button key={tab.v} onClick={() => setView(tab.v)} style={{ flex: 1, padding: "10px 0", background: "none", border: "none", cursor: "pointer", color: view === tab.v ? THEME.accent : "#94a3b8", fontWeight: view === tab.v ? 800 : 500, borderTop: view === tab.v ? `2px solid ${THEME.accent}` : "2px solid transparent" }}>
            <div style={{ fontSize: 22 }}>{tab.icon}</div>
            <div style={{ fontSize: 11 }}>{tab.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
