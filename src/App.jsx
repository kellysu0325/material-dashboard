import { useState, useEffect } from "react";

const USAGE_DB_ID = "6c067af5f31c4efb8e1e017509bf9c0a";
const MATERIAL_DB_ID = "1838d04e81b34e95b035999ee73e60d9";

const CATEGORY_STYLE = {
  석재: { bg: "#e8f4f0", text: "#2a7a5f", accent: "#3aaa80" },
  수지: { bg: "#eef2fb", text: "#3557b0", accent: "#4f75d4" },
  부자재: { bg: "#fef6e4", text: "#9c6c1a", accent: "#e6a82e" },
  기타: { bg: "#f3f3f3", text: "#666", accent: "#aaa" },
};

async function fetchAllPages(dbId, filter = null) {
  const results = [];
  let cursor = null;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Notion API 오류");
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

function getProp(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  if (p.type === "title") return p.title?.[0]?.plain_text || null;
  if (p.type === "rich_text") return p.rich_text?.[0]?.plain_text || null;
  if (p.type === "select") return p.select?.name || null;
  if (p.type === "number") return p.number ?? null;
  if (p.type === "formula") {
    const f = p.formula;
    if (f.type === "string") return f.string;
    if (f.type === "number") return f.number;
    return null;
  }
  if (p.type === "date") return p.date?.start || null;
  if (p.type === "relation") return p.relation?.map((r) => r.id) || [];
  return null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pivot, setPivot] = useState({}); // { matId: { name, category, months: { "YYYY-MM": total } } }
  const [months, setMonths] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("전체");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // 1. 자재 목록
      const matPages = await fetchAllPages(MATERIAL_DB_ID);
      const matMap = {};
      for (const p of matPages) {
        matMap[p.id] = {
          name: getProp(p, "자재명") || "알 수 없음",
          category: getProp(p, "자재분류") || "기타",
          unit: getProp(p, "단위") || "",
        };
      }

      // 2. 사용 내역 (프로젝트사용 + 자체 + 반출/폐기)
      const usagePages = await fetchAllPages(USAGE_DB_ID, {
        or: [
          { property: "구분", select: { equals: "프로젝트사용" } },
          { property: "구분", select: { equals: "자체" } },
          { property: "구분", select: { equals: "반출/폐기" } },
        ],
      });

      // 3. 피벗 집계
      const pivotData = {};
      const monthSet = new Set();

      for (const p of usagePages) {
        const matIds = getProp(p, "자재");
        const qty = getProp(p, "수량") || 0;
        const date = getProp(p, "일자");
        if (!matIds?.length || !qty || !date) continue;
        const month = date.slice(0, 7);
        monthSet.add(month);
        const matId = matIds[0];
        if (!pivotData[matId]) {
          pivotData[matId] = {
            ...(matMap[matId] || { name: matId.slice(0, 8), category: "기타", unit: "" }),
            months: {},
          };
        }
        pivotData[matId].months[month] = (pivotData[matId].months[month] || 0) + qty;
      }

      const sortedMonths = [...monthSet].sort();
      setPivot(pivotData);
      setMonths(sortedMonths);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const categories = ["전체", "석재", "수지", "부자재"];

  const filteredRows = Object.entries(pivot)
    .filter(([, v]) => selectedCategory === "전체" || v.category === selectedCategory)
    .sort((a, b) => {
      const totalA = Object.values(a[1].months).reduce((s, n) => s + n, 0);
      const totalB = Object.values(b[1].months).reduce((s, n) => s + n, 0);
      return totalB - totalA;
    });

  return (
    <div style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif", background: "#f0f2f8", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        padding: "32px 40px 24px",
        color: "#fff",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#64b5f6", textTransform: "uppercase", marginBottom: 6 }}>
          Material Usage · Monthly Pivot
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>
            📦 월별 · 자재별 사용량
          </h1>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 20px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              backdropFilter: "blur(8px)",
            }}
          >
            {loading ? "⟳ 불러오는 중…" : "↺ 새로고침"}
          </button>
        </div>

        {/* Category filter */}
        <div style={{ display: "flex", gap: 6, marginTop: 20 }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              style={{
                padding: "5px 16px",
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: selectedCategory === c ? "#fff" : "rgba(255,255,255,0.12)",
                color: selectedCategory === c ? "#0f172a" : "rgba(255,255,255,0.75)",
                transition: "all 0.15s",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "28px 40px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 12, animation: "spin 1s linear infinite" }}>⟳</div>
            <div>Notion에서 데이터를 불러오는 중…</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 20, background: "#fff0f0", borderRadius: 12, border: "1px solid #fca5a5", color: "#dc2626", marginBottom: 20 }}>
            <strong>오류:</strong> {error}
            <br />
            <small>Notion 토큰과 DB 연결을 확인해주세요.</small>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "총 자재 수", value: filteredRows.length + "종", icon: "📋" },
                { label: "집계 월 수", value: months.length + "개월", icon: "📅" },
                {
                  label: "전체 사용량 합계",
                  value: filteredRows.reduce((s, [, v]) => s + Object.values(v.months).reduce((a, b) => a + b, 0), 0).toFixed(1),
                  icon: "📊",
                },
                {
                  label: "이번 달 사용량",
                  value: months.length
                    ? filteredRows.reduce((s, [, v]) => s + (v.months[months[months.length - 1]] || 0), 0).toFixed(1)
                    : "—",
                  icon: "🗓️",
                },
              ].map((c) => (
                <div key={c.label} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 20 }}>{c.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Pivot Table */}
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{
                      padding: "14px 20px", textAlign: "left", background: "#f8fafc",
                      color: "#475569", fontWeight: 700, fontSize: 12, minWidth: 180,
                      position: "sticky", left: 0, zIndex: 1,
                    }}>
                      자재명
                    </th>
                    <th style={{ padding: "14px 12px", textAlign: "center", background: "#f8fafc", color: "#475569", fontWeight: 700, fontSize: 12, minWidth: 60 }}>
                      분류
                    </th>
                    {months.map((m) => (
                      <th key={m} style={{
                        padding: "14px 12px", textAlign: "right", background: "#f8fafc",
                        color: "#475569", fontWeight: 700, fontSize: 12, minWidth: 80,
                      }}>
                        {m}
                      </th>
                    ))}
                    <th style={{ padding: "14px 16px", textAlign: "right", background: "#f0f2f8", color: "#0f172a", fontWeight: 800, fontSize: 12, minWidth: 80 }}>
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(([id, v], i) => {
                    const style = CATEGORY_STYLE[v.category] || CATEGORY_STYLE["기타"];
                    const total = Object.values(v.months).reduce((s, n) => s + n, 0);
                    return (
                      <tr
                        key={id}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={(e) => e.currentTarget.style.background = ""}
                      >
                        <td style={{
                          padding: "11px 20px", fontWeight: 600, color: "#1e293b",
                          position: "sticky", left: 0, background: "inherit", zIndex: 1,
                          backgroundColor: "#fff",
                        }}>
                          <span style={{ color: "#cbd5e1", fontSize: 11, marginRight: 8 }}>#{i + 1}</span>
                          {v.name}
                          {v.unit && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 4 }}>({v.unit})</span>}
                        </td>
                        <td style={{ padding: "11px 12px", textAlign: "center" }}>
                          <span style={{
                            background: style.bg, color: style.text,
                            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                          }}>
                            {v.category}
                          </span>
                        </td>
                        {months.map((m) => {
                          const val = v.months[m];
                          return (
                            <td key={m} style={{
                              padding: "11px 12px", textAlign: "right",
                              color: val ? "#1e293b" : "#e2e8f0",
                              fontWeight: val ? 600 : 400,
                              background: val ? `${style.bg}44` : "",
                            }}>
                              {val != null && val > 0 ? val.toFixed(1) : "—"}
                            </td>
                          );
                        })}
                        <td style={{
                          padding: "11px 16px", textAlign: "right",
                          fontWeight: 800, color: style.text,
                          background: style.bg,
                        }}>
                          {total.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer totals */}
                <tfoot>
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                    <td style={{
                      padding: "12px 20px", fontWeight: 800, color: "#0f172a",
                      position: "sticky", left: 0, background: "#f8fafc",
                    }}>
                      월별 합계
                    </td>
                    <td />
                    {months.map((m) => {
                      const sum = filteredRows.reduce((s, [, v]) => s + (v.months[m] || 0), 0);
                      return (
                        <td key={m} style={{ padding: "12px 12px", textAlign: "right", fontWeight: 800, color: "#0f172a" }}>
                          {sum.toFixed(1)}
                        </td>
                      );
                    })}
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: "#0f172a", background: "#e2e8f0" }}>
                      {filteredRows.reduce((s, [, v]) => s + Object.values(v.months).reduce((a, b) => a + b, 0), 0).toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
