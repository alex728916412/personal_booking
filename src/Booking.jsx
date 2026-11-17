import { useState, useEffect, useMemo } from "react";
import "./Booking.css";

// ── 設定區（填入你的值）──────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = "service_yjxuema";
const EMAILJS_TEMPLATE_ID = "template_7pdl7ke";
const EMAILJS_PUBLIC_KEY  = "4MLpxzqfSjiCYNVmR";
const RECIPIENT_EMAIL     = "wangchianyun@gmail.com";

// Google Apps Script 部署後的網址（以 /exec 結尾）
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbydd1OfO5n-PsGs0tPUNx7B9TgobJ9DP2dTzhHmlmounT5KHbzxIdcgYw6xotSTpANg/exec";

// ── 預約項目（可自行增減）────────────────────────────────────────────────────
const SERVICES = [
  { id: "basic",  name: "5 步驟基礎保養", desc: "完整五步驟，體驗專業保養流程" },
  { id: "muscle", name: "臉部經絡撥筋",   desc: "舒緩臉部緊繃，促進循環與放鬆" },
];

// ── 可預約時段 ────────────────────────────────────────────────────────────────
const SLOTS = [
  { id: "1219-1400", label: "12/19（六）14:00" },
  { id: "1219-1600", label: "12/19（六）16:00" },
  { id: "0109-1400", label: "01/09（六）14:00" },
  { id: "0109-1600", label: "01/09（六）16:00" },
];
const OTHER_SLOT = "other";

// ── 選項 ──────────────────────────────────────────────────────────────────────
const SKIN_CONCERNS = [
  "痘痘", "粉刺", "毛孔粗大", "敏感", "泛紅", "黯沉", "鬆弛", "黑眼圈",
  "細紋", "乾燥", "油水不平衡", "色素沉澱", "斑點", "粗糙", "亮白", "眼周舒緩",
];

const NONE_ALLERGY = "以上皆無";
const ALLERGY_ITEMS = [
  "曾對保養品過敏",
  "曾做過醫美（雷射、果酸換膚等）",
  "懷孕或哺乳中（會影響部分成分的建議）",
  "正在看皮膚科或使用醫師處方藥（如 A 酸）",
  "配戴隱形眼鏡（眼周產品需留意）",
  "有特殊膚況（酒糟肌、異位性皮膚炎等）",
  NONE_ALLERGY,
];

const NONE_HABIT = "沒有保養";
const HABITS = ["洗面乳", "化妝水", "精華", "乳液", "面霜", "防曬", "面膜", NONE_HABIT];

const POLICY_TEXT = "如需更改或取消預約，請於 24 小時前告知。";
const POLICY_OPTIONS = [
  "我已了解並同意取消與改期政策",
  "我還有疑問，希望先與您確認",
];

// ── Utils ─────────────────────────────────────────────────────────────────────
const sheetReady = () => SHEET_API_URL && !SHEET_API_URL.startsWith("YOUR_");

function loadEmailJS() {
  return new Promise((resolve, reject) => {
    if (window.emailjs) return resolve(window.emailjs);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload = () => { window.emailjs.init(EMAILJS_PUBLIC_KEY); resolve(window.emailjs); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 多選切換（含互斥選項）
function toggleMulti(list, item, exclusive) {
  if (item === exclusive) return list.includes(item) ? [] : [item];
  const without = list.filter(x => x !== exclusive);
  return without.includes(item) ? without.filter(x => x !== item) : [...without, item];
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Stepper({ step }) {
  const labels = ["基本資料", "預約時段", "膚況資訊", "確認送出"];
  return (
    <div className="bk-stepper">
      {labels.map((l, i) => (
        <div key={l} className={`bk-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
          <span className="bk-step-dot">{i < step ? "✓" : i + 1}</span>
          <span className="bk-step-label">{l}</span>
        </div>
      ))}
    </div>
  );
}

function Chips({ items, selected, onToggle }) {
  return (
    <div className="bk-chips">
      {items.map(it => (
        <button type="button" key={it}
          className={`bk-chip ${selected.includes(it) ? "on" : ""}`}
          onClick={() => onToggle(it)}>
          {it}
        </button>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Booking() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", ig: "",
    service: "", slot: "", otherNote: "",
    skin: [], allergy: [], habits: [],
    policy: "",
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // 已被預約的時段（來自 Google Sheets）
  const [booked, setBooked] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const bookedSet = useMemo(() => new Set(booked), [booked]);

  const fetchBooked = async () => {
    if (!sheetReady()) return [];
    setSlotsLoading(true);
    try {
      const res = await fetch(SHEET_API_URL);
      const data = await res.json();
      const list = data.ok ? data.booked : [];
      setBooked(list);
      return list;
    } catch (e) {
      console.error("讀取時段失敗：", e);
      return [];
    } finally {
      setSlotsLoading(false);
    }
  };

  // 進入「預約時段」那一步時，重新讀取最新的已預約狀態
  useEffect(() => {
    if (step === 1) fetchBooked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 若使用者選的時段剛好被別人約走，自動取消選取
  useEffect(() => {
    if (form.slot && form.slot !== OTHER_SLOT && bookedSet.has(form.slot)) upd("slot", "");
  }, [bookedSet, form.slot]);

  const validPhone = /^[0-9+\-\s()]{8,15}$/.test(form.phone.trim());
  const valid = [
    form.name.trim().length >= 2 && validPhone && form.ig.trim().length >= 2,
    !!form.service && !!form.slot,
    form.skin.length > 0 && form.allergy.length > 0 && form.habits.length > 0,
    !!form.policy,
  ];

  const slotLabel = form.slot === OTHER_SLOT
    ? `想討論其他時段${form.otherNote ? `：${form.otherNote}` : ""}`
    : SLOTS.find(s => s.id === form.slot)?.label || "";
  const serviceName = SERVICES.find(s => s.id === form.service)?.name || "";

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    const payload = {
      slotId:    form.slot,
      slotLabel,
      name:      form.name.trim(),
      phone:     form.phone.trim(),
      ig:        form.ig.trim(),
      service:   serviceName,
      skin:      form.skin.join("、"),
      allergy:   form.allergy.join("、"),
      habits:    form.habits.join("、"),
      policy:    form.policy,
    };

    // 1) 先寫入 Google Sheets（同時檢查時段是否還在）
    if (sheetReady()) {
      try {
        const res = await fetch(SHEET_API_URL, {
          method: "POST",
          body: JSON.stringify(payload), // 不加 headers，避免跨網域預檢請求
        });
        const data = await res.json();
        if (!data.ok) {
          if (data.error === "SLOT_TAKEN") {
            await fetchBooked();
            setError("這個時段剛剛已被預約，請重新選擇其他時段。");
            setStep(1);
          } else {
            setError("預約系統暫時無法使用，請稍後再試。");
          }
          setSubmitting(false);
          return;
        }
      } catch (e) {
        console.error("寫入 Sheets 失敗：", e);
        setError("連線失敗，請檢查網路後再試一次。");
        setSubmitting(false);
        return;
      }
    }

    // 2) 寄 Email 通知（預約已成功寫入，Email 失敗不影響預約結果）
    try {
      const ejs = await loadEmailJS();
      await ejs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:    RECIPIENT_EMAIL,
        name:        payload.name,
        phone:       payload.phone,
        ig:          payload.ig,
        service:     payload.service,
        slot:        slotLabel,
        skin:        payload.skin,
        allergy:     payload.allergy,
        habits:      payload.habits,
        policy:      payload.policy,
        submit_time: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
      });
    } catch (e) {
      console.error("EmailJS error:", e);
    }

    setSubmitting(false);
    setDone(true);
  };

  // ── 成功頁 ──
  if (done) {
    return (
      <div className="bk-root">
        <div className="bk-card bk-success">
          <div className="bk-success-icon">✓</div>
          <h2 className="bk-title">預約已送出</h2>
          <p className="bk-desc">
            感謝 {form.name}，我們已收到您的預約申請。<br />
            會透過 IG 與您確認，並於行前再次提醒。
          </p>
          <div className="bk-summary">
            <div><span>預約項目</span><b>{serviceName}</b></div>
            <div><span>預約時段</span><b>{slotLabel}</b></div>
            <div><span>IG 帳號</span><b>{form.ig}</b></div>
          </div>
          <p className="bk-note">{POLICY_TEXT}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bk-root">
      <div className="bk-card">
        <div className="bk-head">
          <p className="bk-eyebrow">KEEPGOIN 2026</p>
          <h1 className="bk-title">專屬體驗預約</h1>
        </div>
        <Stepper step={step} />

        {/* Step 1：基本資料 */}
        {step === 0 && (
          <div className="bk-body">
            <div className="bk-field">
              <label>真實姓名 <i>*</i></label>
              <input value={form.name} placeholder="請輸入真實姓名"
                onChange={e => upd("name", e.target.value)} />
            </div>
            <div className="bk-field">
              <label>聯絡電話 <i>*</i></label>
              <input type="tel" inputMode="tel" value={form.phone} placeholder="例如 0912345678"
                onChange={e => upd("phone", e.target.value)} />
              <small>僅於緊急狀況時使用</small>
              {form.phone && !validPhone && <small className="bk-err">請輸入正確的電話格式</small>}
            </div>
            <div className="bk-field">
              <label>IG 帳號 <i>*</i></label>
              <input value={form.ig} placeholder="例如 @your_account"
                onChange={e => upd("ig", e.target.value)} />
              <small>用於行前聯絡與追蹤關心</small>
            </div>
          </div>
        )}

        {/* Step 2：項目與時段 */}
        {step === 1 && (
          <div className="bk-body">
            <div className="bk-field">
              <label>預約項目 <i>*</i></label>
              <div className="bk-options">
                {SERVICES.map(s => (
                  <button type="button" key={s.id}
                    className={`bk-option ${form.service === s.id ? "on" : ""}`}
                    onClick={() => upd("service", s.id)}>
                    <span className="bk-radio" />
                    <span>
                      <b>{s.name}</b>
                      <em>{s.desc}</em>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bk-field">
              <label>預約日期與時段 <i>*</i></label>
              {slotsLoading && <small>正在確認可預約時段…</small>}
              {error && <p className="bk-alert">{error}</p>}
              <div className="bk-options">
                {SLOTS.map(s => {
                  const taken = bookedSet.has(s.id);
                  return (
                    <button type="button" key={s.id} disabled={taken || slotsLoading}
                      className={`bk-option ${form.slot === s.id ? "on" : ""} ${taken ? "taken" : ""}`}
                      onClick={() => upd("slot", s.id)}>
                      <span className="bk-radio" />
                      <span><b>{s.label}</b></span>
                      {taken && <span className="bk-tag">已被預約</span>}
                    </button>
                  );
                })}
                <button type="button"
                  className={`bk-option ${form.slot === OTHER_SLOT ? "on" : ""}`}
                  onClick={() => upd("slot", OTHER_SLOT)}>
                  <span className="bk-radio" />
                  <span><b>想討論其他的體驗時段</b></span>
                </button>
              </div>
              {form.slot === OTHER_SLOT && (
                <input className="bk-other" value={form.otherNote}
                  placeholder="方便的日期與時段（選填）"
                  onChange={e => upd("otherNote", e.target.value)} />
              )}
            </div>
          </div>
        )}

        {/* Step 3：客製化資訊 */}
        {step === 2 && (
          <div className="bk-body">
            <div className="bk-field">
              <label>膚質狀況 / 當前肌膚困擾 <i>*</i></label>
              <small>可複選</small>
              <Chips items={SKIN_CONCERNS} selected={form.skin}
                onToggle={it => upd("skin", toggleMulti(form.skin, it))} />
            </div>
            <div className="bk-field">
              <label>過敏史或特殊禁忌 <i>*</i></label>
              <small>符合者請勾選，若都沒有請選「以上皆無」</small>
              <Chips items={ALLERGY_ITEMS} selected={form.allergy}
                onToggle={it => upd("allergy", toggleMulti(form.allergy, it, NONE_ALLERGY))} />
            </div>
            <div className="bk-field">
              <label>過往保養習慣 <i>*</i></label>
              <small>協助我們現場提供更精準的建議</small>
              <Chips items={HABITS} selected={form.habits}
                onToggle={it => upd("habits", toggleMulti(form.habits, it, NONE_HABIT))} />
            </div>
          </div>
        )}

        {/* Step 4：政策與確認 */}
        {step === 3 && (
          <div className="bk-body">
            <div className="bk-field">
              <label>取消與改期政策 <i>*</i></label>
              <p className="bk-policy">{POLICY_TEXT}</p>
              <div className="bk-options">
                {POLICY_OPTIONS.map(p => (
                  <button type="button" key={p}
                    className={`bk-option ${form.policy === p ? "on" : ""}`}
                    onClick={() => upd("policy", p)}>
                    <span className="bk-radio" />
                    <span><b>{p}</b></span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bk-summary">
              <div><span>姓名</span><b>{form.name}</b></div>
              <div><span>電話</span><b>{form.phone}</b></div>
              <div><span>IG</span><b>{form.ig}</b></div>
              <div><span>項目</span><b>{serviceName}</b></div>
              <div><span>時段</span><b>{slotLabel}</b></div>
            </div>
            {error && <p className="bk-alert">{error}</p>}
          </div>
        )}

        {/* Nav */}
        <div className="bk-nav">
          {step > 0 && (
            <button type="button" className="bk-btn ghost"
              onClick={() => { setError(""); setStep(step - 1); }}>← 上一步</button>
          )}
          {step < 3 ? (
            <button type="button" className="bk-btn primary" disabled={!valid[step]}
              onClick={() => { setError(""); setStep(step + 1); }}>下一步 →</button>
          ) : (
            <button type="button" className="bk-btn primary"
              disabled={!valid[3] || submitting} onClick={handleSubmit}>
              {submitting ? "送出中…" : "確認送出預約"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
