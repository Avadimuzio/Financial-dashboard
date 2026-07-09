"use client";

import React, { useState, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Sparkles, TrendingUp, TrendingDown, Landmark, FileText, Loader2, Upload, AlertTriangle, CheckCircle2, Lock } from "lucide-react";

// ---------------------------------------------------------------------------
// NIKE, Inc. (NKE) — real figures from SEC 10-K filings, FY2021–FY2025
// (fiscal year ended May 31). Figures in $ millions.
// Sources: SEC EDGAR 10-K filings FY2021–FY2025, Nike Investor Relations.
// ---------------------------------------------------------------------------
const BASE_COMPANIES = {
  nike: {
    name: "NIKE, Inc.",
    ticker: "NKE",
    sector: "Apparel & Footwear",
    years: [
      { year: 2021, revenue: 44538, cogs: 24576, opex: 13025, netIncome: 5727, currentAssets: 26291, currentLiabilities: 9674, totalDebt: 12811, totalEquity: 12767 },
      { year: 2022, revenue: 46710, cogs: 25231, opex: 14804, netIncome: 6046, currentAssets: 28213, currentLiabilities: 10730, totalDebt: 12627, totalEquity: 15281 },
      { year: 2023, revenue: 51217, cogs: 28925, opex: 16210, netIncome: 5070, currentAssets: 26846, currentLiabilities: 10900, totalDebt: 12144, totalEquity: 14004 },
      { year: 2024, revenue: 51362, cogs: 28475, opex: 16576, netIncome: 5700, currentAssets: 25382, currentLiabilities: 10593, totalDebt: 11952, totalEquity: 14430 },
      { year: 2025, revenue: 46309, cogs: 26519, opex: 16088, netIncome: 3219, currentAssets: 23362, currentLiabilities: 10566, totalDebt: 11018, totalEquity: 13213 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Auto-flagging — generic threshold logic that works on any company's ratios
// ---------------------------------------------------------------------------
function trailingDeclineStreak(arr, key) {
  let streak = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    if (arr[i][key] < arr[i - 1][key]) streak++;
    else break;
  }
  return streak;
}
function trailingIncreaseStreak(arr, key) {
  let streak = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    if (arr[i][key] > arr[i - 1][key]) streak++;
    else break;
  }
  return streak;
}

function computeFlags(data) {
  const flags = [];
  if (data.length < 2) return flags;
  const last = data[data.length - 1];
  const prior = data[data.length - 2];

  // Liquidity trend
  const crStreak = trailingDeclineStreak(data, "currentRatio");
  if (crStreak >= 3) {
    const startYear = data[data.length - 1 - crStreak].year;
    flags.push({
      severity: "warn",
      text: `Current ratio has declined every year since FY${startYear}, from ${data[data.length - 1 - crStreak].currentRatio.toFixed(2)} to ${last.currentRatio.toFixed(2)} — liquidity cushion is steadily eroding.`,
    });
  } else if (last.currentRatio > 1.5) {
    flags.push({
      severity: "good",
      text: `Current ratio of ${last.currentRatio.toFixed(2)} remains comfortably above the 1.0x threshold, indicating adequate short-term liquidity.`,
    });
  }

  // Gross margin YoY compression
  const gmChange = last.grossMargin - prior.grossMargin;
  if (gmChange <= -1.5) {
    flags.push({
      severity: "warn",
      text: `Gross margin compressed ${Math.abs(gmChange).toFixed(1)} points YoY (${prior.grossMargin.toFixed(1)}% → ${last.grossMargin.toFixed(1)}%), pointing to pricing or cost pressure.`,
    });
  } else if (gmChange >= 1.5) {
    flags.push({
      severity: "good",
      text: `Gross margin expanded ${gmChange.toFixed(1)} points YoY (${prior.grossMargin.toFixed(1)}% → ${last.grossMargin.toFixed(1)}%).`,
    });
  }

  // Net margin vs historical average
  const priorYears = data.slice(0, -1);
  const avgNetMargin = priorYears.reduce((s, d) => s + d.netMargin, 0) / priorYears.length;
  if (last.netMargin < avgNetMargin - 2) {
    flags.push({
      severity: "warn",
      text: `Net margin of ${last.netMargin.toFixed(1)}% sits well below its ${priorYears.length}-year average of ${avgNetMargin.toFixed(1)}%, signaling profitability pressure beyond a single off year.`,
    });
  }

  // ROE vs peak
  const maxRoe = Math.max(...data.map((d) => d.roe));
  const maxRoeYear = data.find((d) => d.roe === maxRoe).year;
  if (last.roe < maxRoe * 0.65 && maxRoeYear !== last.year) {
    flags.push({
      severity: "warn",
      text: `Return on equity has fallen to ${last.roe.toFixed(1)}%, down sharply from its FY${maxRoeYear} peak of ${maxRoe.toFixed(1)}%.`,
    });
  }

  // Leverage trend
  const deStreak = trailingIncreaseStreak(data, "debtToEquity");
  if (deStreak >= 2) {
    flags.push({
      severity: "warn",
      text: `Debt-to-equity has risen for ${deStreak} consecutive years, reaching ${last.debtToEquity.toFixed(2)} — leverage is building.`,
    });
  }

  // Revenue direction
  const revChange = ((last.revenue - prior.revenue) / prior.revenue) * 100;
  if (revChange <= -5) {
    flags.push({
      severity: "warn",
      text: `Revenue declined ${Math.abs(revChange).toFixed(1)}% YoY (${fmtM(prior.revenue)} → ${fmtM(last.revenue)}).`,
    });
  } else if (revChange >= 5) {
    flags.push({
      severity: "good",
      text: `Revenue grew ${revChange.toFixed(1)}% YoY (${fmtM(prior.revenue)} → ${fmtM(last.revenue)}).`,
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// PDF extraction — sends an uploaded 10-K to Claude and parses structured JSON
// ---------------------------------------------------------------------------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function extractFinancialsFromPDF(file, passcode) {
  const base64Data = await fileToBase64(file);

  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-passcode": passcode },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64Data },
            },
            {
              type: "text",
              text:
                "Extract consolidated financial data from this 10-K filing for as many fiscal years as are reported " +
                "(usually 2-3 years of income statement data and 2 years of balance sheet data; use the most recent " +
                "figures available for years where only one is given). Return ONLY valid JSON, no prose, no markdown " +
                "fences, matching exactly this shape:\n" +
                '{"name": "Company Name", "ticker": "TICK", "sector": "Sector", "years": [' +
                '{"year": 2024, "revenue": 0, "cogs": 0, "opex": 0, "netIncome": 0, "currentAssets": 0, ' +
                '"currentLiabilities": 0, "totalDebt": 0, "totalEquity": 0}]}\n' +
                "All monetary figures must be plain numbers in millions of dollars (no commas, no $ signs). " +
                "opex is total operating expenses excluding cost of goods sold. totalDebt should include both " +
                "short-term and long-term interest-bearing debt. Order years ascending (oldest first).",
            },
          ],
        },
      ],
    }),
  });

  if (response.status === 401) throw new Error("WRONG_PASSCODE");
  if (response.status === 403) throw new Error("LOCKED");

  const json = await response.json();
  const text = (json.content || [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed.years || parsed.years.length < 2) {
    throw new Error("Not enough years of data found in this filing");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------
function withRatios(row) {
  const grossProfit = row.revenue - row.cogs;
  return {
    ...row,
    grossMargin: (grossProfit / row.revenue) * 100,
    netMargin: (row.netIncome / row.revenue) * 100,
    currentRatio: row.currentAssets / row.currentLiabilities,
    debtToEquity: row.totalDebt / row.totalEquity,
    roe: (row.netIncome / row.totalEquity) * 100,
  };
}

const fmtM = (n) => `$${n.toLocaleString("en-US")}M`;
const fmtPct = (n) => `${n.toFixed(1)}%`;
const fmtRatio = (n) => n.toFixed(2);

function KPICard({ label, value, delta, deltaGood, icon: Icon }) {
  const up = delta >= 0;
  const positive = deltaGood === undefined ? up : deltaGood === up;
  return (
    <div
      className="flex-1 min-w-[150px] px-4 py-3"
      style={{ background: "#F7F3E8", borderTop: "3px solid #C9A961" }}
    >
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: "#6B6250" }}>
        <Icon size={13} strokeWidth={2} />
        <span
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-2xl leading-none mb-1.5"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1C2B22", fontWeight: 600 }}
      >
        {value}
      </div>
      {delta !== undefined && (
        <div
          className="flex items-center gap-1 text-[11px]"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            color: positive ? "#2F6B4F" : "#A8422F",
          }}
        >
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(delta).toFixed(1)}% YoY
        </div>
      )}
    </div>
  );
}

export default function FinancialDashboard() {
  const [uploadedCompanies, setUploadedCompanies] = useState({});
  const [companyKey, setCompanyKey] = useState("nike");
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");

  const allCompanies = { ...BASE_COMPANIES, ...uploadedCompanies };
  const company = allCompanies[companyKey];
  const data = useMemo(() => company.years.map(withRatios), [company]);
  const latest = data[data.length - 1];
  const prior = data[data.length - 2];
  const flags = useMemo(() => computeFlags(data), [data]);

  const pctDelta = (a, b) => ((a - b) / b) * 100;

  function switchCompany(key) {
    setCompanyKey(key);
    setInsight("");
    setError("");
  }

  function handleUnlock() {
    if (passcodeInput.trim()) {
      setPasscode(passcodeInput.trim());
      setUnlocked(true);
      setUploadError("");
      setError("");
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const parsed = await extractFinancialsFromPDF(file, passcode);
      const key = `upload_${Date.now()}`;
      setUploadedCompanies((prev) => ({ ...prev, [key]: parsed }));
      switchCompany(key);
    } catch (err) {
      if (err.message === "WRONG_PASSCODE") {
        setUploadError("That passcode was rejected by the server. Try unlocking again.");
        setUnlocked(false);
      } else if (err.message === "LOCKED") {
        setUploadError("AI features are disabled on this deployment.");
      } else {
        setUploadError("Couldn't extract financials from that PDF. Try a standard 10-K filing.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function generateInsight() {
    setLoading(true);
    setError("");
    setInsight("");
    try {
      const payload = {
        company: company.name,
        sector: company.sector,
        flaggedItems: flags.map((f) => f.text),
        years: data.map((d) => ({
          year: d.year,
          revenue: d.revenue,
          netIncome: d.netIncome,
          grossMargin: +d.grossMargin.toFixed(1),
          netMargin: +d.netMargin.toFixed(1),
          currentRatio: +d.currentRatio.toFixed(2),
          debtToEquity: +d.debtToEquity.toFixed(2),
          roe: +d.roe.toFixed(1),
        })),
      };

      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dashboard-passcode": passcode },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content:
                "You are a sell-side equity analyst writing a short note for a client. " +
                "Based on this five-year financial dataset, write a 3-4 sentence analyst commentary. " +
                "Cover: the dominant trend, one ratio worth flagging (good or bad), and one forward-looking observation. " +
                "Be specific with numbers. Write in plain analyst prose, no headers, no bullet points, no markdown.\n\n" +
                JSON.stringify(payload, null, 2),
            },
          ],
        }),
      });

      if (response.status === 401) {
        setUnlocked(false);
        throw new Error("That passcode was rejected by the server. Try unlocking again.");
      }
      if (response.status === 403) {
        throw new Error("AI features are disabled on this deployment.");
      }

      const json = await response.json();
      const text = (json.content || [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n")
        .trim();

      if (!text) throw new Error("empty response");
      setInsight(text);
    } catch (err) {
      const known = ["That passcode was rejected by the server. Try unlocking again.", "AI features are disabled on this deployment."];
      setError(known.includes(err.message) ? err.message : "Couldn't generate an insight right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-full min-h-screen"
      style={{ background: "#0E2A1F", fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Wordmark */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2" style={{ color: "#C9A961" }}>
            <Landmark size={18} strokeWidth={2} />
            <span
              className="text-sm uppercase tracking-[0.25em]"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              The Ledger
            </span>
          </div>
          <span
            className="text-[11px]"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#7C8F81" }}
          >
            AI-ASSISTED EQUITY ANALYSIS · FY2021–FY2025
          </span>
        </div>

        {/* Company tabs + upload */}
        <div className="flex items-center justify-between mb-6" style={{ borderBottom: "1px solid #24463A" }}>
          <div className="flex gap-6">
            {Object.entries(allCompanies).map(([key, c]) => (
              <button
                key={key}
                onClick={() => switchCompany(key)}
                className="pb-3 text-sm transition-colors"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  color: companyKey === key ? "#F2ECD9" : "#5F7A6C",
                  borderBottom: companyKey === key ? "2px solid #C9A961" : "2px solid transparent",
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          {unlocked ? (
            <label
              className="flex items-center gap-1.5 pb-3 text-[12px] cursor-pointer"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#C9A961" }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Reading filing…" : "Upload a 10-K PDF"}
              <input type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
          ) : (
            <div className="flex items-center gap-2 pb-3">
              <Lock size={12} style={{ color: "#5F7A6C" }} />
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="Passcode to unlock AI features"
                className="text-[12px] px-2 py-1 outline-none"
                style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#0E2A1F", border: "1px solid #3A5C4C", color: "#F2ECD9", width: 190 }}
              />
              <button
                onClick={handleUnlock}
                className="text-[12px] px-2 py-1"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#0E2A1F", background: "#C9A961" }}
              >
                Unlock
              </button>
            </div>
          )}
        </div>
        {uploadError && (
          <p className="mb-4 text-[12px]" style={{ fontFamily: "'Inter', sans-serif", color: "#A8422F" }}>
            {uploadError}
          </p>
        )}

        {/* Case study label */}
        <div className="mb-6 pb-3" style={{ borderBottom: "1px solid #24463A" }}>
          <span
            className="text-[11px] uppercase tracking-[0.14em]"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: "#C9A961" }}
          >
            Case Study — Margin Compression
          </span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-4xl mb-1"
            style={{ fontFamily: "'Source Serif 4', serif", color: "#F2ECD9", fontWeight: 600 }}
          >
            {company.name}
          </h1>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#8FA396", fontSize: "13px" }}>
            {company.ticker} · {company.sector} · Consolidated Financial Analysis
          </p>
          <p style={{ fontFamily: "'Source Serif 4', serif", color: "#B9C6BC", fontSize: "14px", fontStyle: "italic", marginTop: "10px", maxWidth: "560px", lineHeight: 1.5 }}>
            {companyKey === "nike"
              ? "Revenue peaked in FY2024 before a sharp FY2025 decline, as heavy discounting and rising inventory obsolescence charges pulled gross margin down from a FY2022 high of 46.0% to 42.7%."
              : "Financial data extracted automatically from the uploaded 10-K filing."}
          </p>
        </div>

        {/* KPI row */}
        <div className="flex flex-wrap gap-px mb-8" style={{ background: "#24463A" }}>
          <KPICard label="Revenue" value={fmtM(latest.revenue)} delta={pctDelta(latest.revenue, prior.revenue)} icon={FileText} />
          <KPICard label="Net Income" value={fmtM(latest.netIncome)} delta={pctDelta(latest.netIncome, prior.netIncome)} icon={FileText} />
          <KPICard label="Gross Margin" value={fmtPct(latest.grossMargin)} delta={latest.grossMargin - prior.grossMargin} icon={FileText} />
          <KPICard label="Current Ratio" value={fmtRatio(latest.currentRatio)} delta={pctDelta(latest.currentRatio, prior.currentRatio)} icon={FileText} />
          <KPICard label="Debt / Equity" value={fmtRatio(latest.debtToEquity)} delta={pctDelta(latest.debtToEquity, prior.debtToEquity)} deltaGood={false} icon={FileText} />
          <KPICard label="Return on Equity" value={fmtPct(latest.roe)} delta={latest.roe - prior.roe} icon={FileText} />
        </div>

        {/* Auto-flags */}
        {flags.length > 0 && (
          <div className="mb-8 px-5 py-4" style={{ background: "#F7F3E8" }}>
            <h3
              className="text-xs uppercase tracking-[0.12em] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#6B6250" }}
            >
              Flagged in this year's numbers
            </h3>
            <div className="flex flex-col gap-2.5">
              {flags.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  {f.severity === "warn" ? (
                    <AlertTriangle size={15} style={{ color: "#A8422F", flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <CheckCircle2 size={15} style={{ color: "#2F6B4F", flexShrink: 0, marginTop: 2 }} />
                  )}
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#2B2418", lineHeight: 1.5 }}>
                    {f.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue / Net Income chart */}
        <div className="mb-6 px-5 py-4" style={{ background: "#F7F3E8" }}>
          <h3
            className="text-xs uppercase tracking-[0.12em] mb-3"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#6B6250" }}
          >
            Revenue &amp; Net Income ($M)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2F6B4F" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2F6B4F" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E4DCC6" vertical={false} />
              <XAxis dataKey="year" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#6B6250" }} axisLine={{ stroke: "#D8CFB4" }} tickLine={false} />
              <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#6B6250" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1C2B22", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                labelStyle={{ color: "#C9A961" }}
                itemStyle={{ color: "#F2ECD9" }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#2F6B4F" strokeWidth={2} fill="url(#revFill)" name="Revenue" />
              <Line type="monotone" dataKey="netIncome" stroke="#A8422F" strokeWidth={2} dot={{ r: 3 }} name="Net Income" />
              <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Margin trend */}
          <div className="px-5 py-4" style={{ background: "#F7F3E8" }}>
            <h3
              className="text-xs uppercase tracking-[0.12em] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#6B6250" }}
            >
              Margin Trend
            </h3>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E4DCC6" vertical={false} />
                <XAxis dataKey="year" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#6B6250" }} axisLine={{ stroke: "#D8CFB4" }} tickLine={false} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#6B6250" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  contentStyle={{ background: "#1C2B22", border: "none", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                  labelStyle={{ color: "#C9A961" }}
                  itemStyle={{ color: "#F2ECD9" }}
                />
                <Line type="monotone" dataKey="grossMargin" stroke="#C9A961" strokeWidth={2} dot={{ r: 3 }} name="Gross Margin" />
                <Line type="monotone" dataKey="netMargin" stroke="#2F6B4F" strokeWidth={2} dot={{ r: 3 }} name="Net Margin" />
                <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ratio ledger table */}
          <div className="px-5 py-4" style={{ background: "#F7F3E8" }}>
            <h3
              className="text-xs uppercase tracking-[0.12em] mb-3"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: "#6B6250" }}
            >
              Ratio Ledger
            </h3>
            <table className="w-full" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#6B6250" }}>
                  <th className="text-left font-normal pb-2">Metric</th>
                  {data.map((d) => (
                    <th key={d.year} className="text-right font-normal pb-2">{d.year}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ color: "#1C2B22" }}>
                <tr style={{ borderTop: "1px solid #D8CFB4" }}>
                  <td className="py-2">Current Ratio</td>
                  {data.map((d) => <td key={d.year} className="text-right py-2">{fmtRatio(d.currentRatio)}</td>)}
                </tr>
                <tr style={{ borderTop: "1px solid #D8CFB4" }}>
                  <td className="py-2">Debt / Equity</td>
                  {data.map((d) => <td key={d.year} className="text-right py-2">{fmtRatio(d.debtToEquity)}</td>)}
                </tr>
                <tr style={{ borderTop: "1px solid #D8CFB4" }}>
                  <td className="py-2">Return on Equity</td>
                  {data.map((d) => <td key={d.year} className="text-right py-2">{fmtPct(d.roe)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Analyst Note — signature element */}
        <div
          className="relative px-6 py-5 mb-4"
          style={{
            background: "#FBF8EE",
            border: "1px dashed #C9A961",
            transform: "rotate(-0.4deg)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2" style={{ color: "#8A6D1F" }}>
              <Sparkles size={15} />
              <span
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                AI Analyst Note
              </span>
            </div>
            <button
              onClick={generateInsight}
              disabled={loading || !unlocked}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                background: unlocked ? "#1C2B22" : "#5F7A6C",
                color: "#F2ECD9",
                opacity: loading ? 0.6 : 1,
                cursor: loading || !unlocked ? "default" : "pointer",
              }}
              title={unlocked ? "" : "Enter the passcode above to unlock"}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : unlocked ? <Sparkles size={13} /> : <Lock size={13} />}
              {loading ? "Analyzing…" : unlocked ? "Generate insight" : "Locked"}
            </button>
          </div>

          {!unlocked && (
            <p style={{ fontFamily: "'Inter', sans-serif", color: "#8A7F5F", fontSize: 12 }}>
              AI features are passcode-protected on this deployment to prevent unexpected API costs.
              Enter the passcode in the bar above the case study to unlock.
            </p>
          )}

          {unlocked && !insight && !error && !loading && (
            <p style={{ fontFamily: "'Source Serif 4', serif", color: "#8A7F5F", fontSize: 14, fontStyle: "italic" }}>
              Click "Generate insight" for an AI-written analyst commentary on {company.name}'s five-year trend.
            </p>
          )}
          {loading && (
            <p style={{ fontFamily: "'Source Serif 4', serif", color: "#8A7F5F", fontSize: 14, fontStyle: "italic" }}>
              Reading the filings…
            </p>
          )}
          {error && (
            <p style={{ fontFamily: "'Inter', sans-serif", color: "#A8422F", fontSize: 13 }}>{error}</p>
          )}
          {insight && (
            <p style={{ fontFamily: "'Source Serif 4', serif", color: "#2B2418", fontSize: 15, lineHeight: 1.6 }}>
              {insight}
            </p>
          )}
        </div>

        <p className="text-center text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#5F7A6C" }}>
          {companyKey === "nike"
            ? "Figures sourced from NIKE, Inc. Form 10-K filings, SEC EDGAR, FY2021–FY2025."
            : "Figures extracted by AI from the uploaded 10-K filing — verify against the source before relying on them."}
        </p>
      </div>
    </div>
  );
}
