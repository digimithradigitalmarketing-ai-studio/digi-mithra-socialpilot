import { lookup } from "node:dns/promises";
import net from "node:net";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Fetches public page metadata (title, description, image) for a pasted link.
// Guards against SSRF: http(s) only, public IPs only, re-checked on each redirect.

function isPrivateIp(ip: string) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) links are supported");
  if (url.username || url.password) throw new Error("Links with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address is not reachable");
}

function meta(html: string, names: string[]) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return null;
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function detectPlatform(host: string) {
  const h = host.replace(/^www\./, "");
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("youtube.com") || h === "youtu.be") return "youtube";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("facebook.com") || h === "fb.watch") return "facebook";
  if (h === "x.com" || h.includes("twitter.com")) return "x";
  if (h.includes("threads.net")) return "threads";
  if (h.includes("drive.google.com")) return "google_drive";
  return "website";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { url: raw } = (await request.json().catch(() => ({}))) as { url?: string };
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return Response.json({ error: "Enter a valid link" }, { status: 400 });
  }
  const platform = detectPlatform(url.hostname);
  const fallback = { url: url.toString(), platform, title: null as string | null, description: null as string | null, image: null as string | null };

  try {
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(current);
      res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; SocialPilotBot/1.0)", accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        continue;
      }
      break;
    }
    if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return Response.json(fallback);
    const reader = res.body?.getReader();
    let html = "";
    const dec = new TextDecoder();
    while (reader && html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
    }
    reader?.cancel().catch(() => {});
    const title = meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null);
    const image = meta(html, ["og:image", "twitter:image"]);
    return Response.json({
      ...fallback,
      title: title?.slice(0, 200) ?? null,
      description: meta(html, ["og:description", "description", "twitter:description"])?.slice(0, 600) ?? null,
      image: image && /^https?:\/\//.test(image) ? image : null,
    });
  } catch {
    // unreachable or blocked: still let the user save the link
    return Response.json(fallback);
  }
}
