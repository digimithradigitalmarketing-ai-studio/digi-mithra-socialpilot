// Renders a marketing email exactly as it is sent (used by the preview and the send route).

export interface RenderEmailInput {
  subject: string;
  preheader?: string | null;
  body: string;
  businessName: string;
  name?: string | null;
  unsubscribeUrl: string;
  accent?: string;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function merge(text: string, name?: string | null) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return text.replace(/\{\{\s*name\s*\}\}/gi, first || "there");
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ kind: "p", lines: para });
      if (list.length) blocks.push({ kind: "ul", items: list });
      para = [];
      list = [];
    };
    for (const l of lines) {
      const m = l.match(/^\s*[-*•]\s+(.*)$/);
      if (m) {
        if (para.length) {
          blocks.push({ kind: "p", lines: para });
          para = [];
        }
        list.push(m[1]);
      } else {
        if (list.length) {
          blocks.push({ kind: "ul", items: list });
          list = [];
        }
        para.push(l.trim());
      }
    }
    flush();
  }
  return blocks;
}

const safeColor = (c?: string) => (c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#3b7a0c");

export function renderEmail(input: RenderEmailInput): { html: string; text: string } {
  const accent = safeColor(input.accent);
  const body = merge(input.body, input.name);
  const blocks = parseBlocks(body);
  const biz = escapeHtml(input.businessName);
  const unsub = escapeHtml(input.unsubscribeUrl);

  const content = blocks
    .map((b) =>
      b.kind === "p"
        ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${b.lines.map(escapeHtml).join("<br>")}</p>`
        : `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#1f2937;">${b.items
            .map((i) => `<li style="margin:0 0 6px;">${escapeHtml(i)}</li>`)
            .join("")}</ul>`,
    )
    .join("\n");

  const pre = input.preheader ? merge(input.preheader, input.name) : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(merge(input.subject, input.name))}</title></head>
<body style="margin:0;padding:0;background:#f4f7fe;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fe;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7ecf6;">
<tr><td style="height:6px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:bold;color:#0e1630;">${biz}</td></tr>
<tr><td style="padding:8px 28px 12px;">
${content}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:16px 28px;font-size:12px;line-height:1.5;color:#8b94a9;text-align:center;">
You are receiving this email because you opted in to hear from ${biz}.<br>
<a href="${unsub}" style="color:${accent};text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    input.businessName,
    "",
    ...blocks.map((b) => (b.kind === "p" ? b.lines.join("\n") : b.items.map((i) => `- ${i}`).join("\n"))).flatMap((t) => [t, ""]),
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}
