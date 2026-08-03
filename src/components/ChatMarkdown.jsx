/**
 * Lightweight chat markdown: headings, bullets, tables, paragraphs.
 * Avoids a full markdown dependency for strategy section handoff.
 */

function looksLikeMarkdown(text) {
  if (!text || typeof text !== "string") return false;
  return /(^|\n)\s{0,3}#{1,3}\s+\S|(^|\n)\s*([-*•]|•)\s+\S|(^|\n)\s*\|.+\|/.test(text);
}

function isTableSeparator(line) {
  const t = String(line || "").trim();
  if (!t.includes("|")) return false;
  // |---|:---| or ---|---
  return /^[\s|:\-]+$/.test(t) && /-/.test(t);
}

function splitTableRow(line) {
  let t = String(line || "").trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function renderInline(text) {
  // **bold** and `code` only — keep it simple and safe
  const parts = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] != null) {
      parts.push(
        <strong key={`b-${key++}`} style={{ fontWeight: 700 }}>
          {m[2]}
        </strong>
      );
    } else if (m[3] != null) {
      parts.push(
        <code
          key={`c-${key++}`}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.92em",
            padding: "1px 4px",
            background: "color-mix(in srgb, var(--color-text) 8%, transparent)",
          }}
        >
          {m[3]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function ChatTable({ headers, rows }) {
  const cellPad = { padding: "8px 10px", borderBottom: "1px solid var(--color-divider)", textAlign: "left", verticalAlign: "top" };
  return (
    <div
      style={{
        overflowX: "auto",
        margin: "8px 0 12px",
        border: "1px solid var(--color-divider)",
        borderRadius: 6,
        background: "color-mix(in srgb, var(--color-surface) 92%, var(--color-text))",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--color-text)",
        }}
      >
        {headers?.length ? (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    ...cellPad,
                    fontFamily: "var(--font-heading)",
                    fontWeight: 700,
                    fontSize: 12,
                    background: "color-mix(in srgb, var(--color-text) 6%, transparent)",
                    borderBottom: "1px solid var(--color-divider)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={cellPad}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChatMarkdown({ text, style }) {
  const raw = String(text || "");
  if (!looksLikeMarkdown(raw)) {
    return (
      <p
        className="card-body"
        style={{
          opacity: 1,
          fontSize: 14,
          margin: 0,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          ...style,
        }}
      >
        {raw}
      </p>
    );
  }

  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Markdown pipe table
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(trimmed);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes("|") || isTableSeparator(rowLine)) break;
        const cells = splitTableRow(rowLine);
        // pad/truncate to header width
        while (cells.length < headers.length) cells.push("");
        rows.push(cells.slice(0, Math.max(headers.length, cells.length)));
        i += 1;
      }
      blocks.push(<ChatTable key={`tbl-${key++}`} headers={headers} rows={rows} />);
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const fontSize = level === 1 ? 18 : level === 2 ? 16 : 14;
      const isFirst = blocks.length === 0;
      blocks.push(
        <div
          key={`h-${key++}`}
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize,
            lineHeight: 1.3,
            marginTop: isFirst ? 0 : 12,
            marginBottom: 6,
            color: "var(--color-text)",
          }}
        >
          {renderInline(hMatch[2])}
        </div>
      );
      i += 1;
      continue;
    }

    const bulletMatch = trimmed.match(/^([-*•]|•)\s+(.+)$/);
    if (bulletMatch) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const bm = t.match(/^([-*•]|•)\s+(.+)$/);
        if (!bm) break;
        items.push(bm[2]);
        i += 1;
      }
      blocks.push(
        <ul
          key={`ul-${key++}`}
          style={{
            margin: "6px 0 8px",
            paddingLeft: 18,
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--color-text)",
          }}
        >
          {items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (/^#{1,3}\s+/.test(t) || /^([-*•]|•)\s+/.test(t)) break;
      // Don't swallow table starts into paragraphs
      if (
        t.includes("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        break;
      }
      para.push(t);
      i += 1;
    }
    blocks.push(
      <p
        key={`p-${key++}`}
        style={{
          margin: "0 0 8px",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--color-text)",
          opacity: 1,
        }}
      >
        {renderInline(para.join(" "))}
      </p>
    );
  }

  return (
    <div className="card-body" style={{ opacity: 1, margin: 0, ...style }}>
      {blocks}
    </div>
  );
}
