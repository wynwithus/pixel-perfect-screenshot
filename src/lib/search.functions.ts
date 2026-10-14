import { createServerFn } from "@tanstack/react-start";

export type RecentMatch = { title: string; publisher: string; date: string; url: string; excerpt: string };
export type SearchResult = { status: "complete" | "no_recent_match" | "unavailable"; results: RecentMatch[] };

const hits = new Map<string, number[]>();

function preferScore(host: string) {
  if (host.endsWith(".gov") || host.endsWith(".ga.us")) return 3;
  if (/(ftc|fbi|consumer|bbb|aarp)/.test(host)) return 2;
  return 1;
}

export const searchRecentWarnings = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; client: string }) => {
    if (typeof input?.query !== "string" || input.query.length < 3 || input.query.length > 300) throw new Error("Bad query");
    return { query: input.query, client: String(input.client ?? "").slice(0, 64) };
  })
  .handler(async ({ data }): Promise<SearchResult> => {
    const now = Date.now();
    const list = (hits.get(data.client) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= 6) return { status: "unavailable", results: [] };
    list.push(now);
    hits.set(data.client, list);

    const key = process.env['FIRECRAWL_API_KEY'];
    if (!key) return { status: "unavailable", results: [] };
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: data.query,
          limit: 6,
          tbs: "qdr:m",
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
      });
      if (!res.ok) {
        console.error("Search failed", res.status);
        return { status: "unavailable", results: [] };
      }
      const json = (await res.json()) as { data?: { web?: any[] } | any[] };
      const web: any[] = Array.isArray(json.data) ? json.data : json.data?.web ?? [];
      const cutoff = now - 31 * 86400_000;
      const out: (RecentMatch & { s: number })[] = [];
      for (const r of web) {
        const m = r.metadata ?? {};
        const raw =
          m.publishedTime ?? m["article:published_time"] ?? m.modifiedTime ?? m["article:modified_time"] ?? m.datePublished ?? m.date;
        const d = raw ? new Date(Array.isArray(raw) ? raw[0] : raw) : null;
        if (!d || isNaN(d.getTime()) || d.getTime() < cutoff || d.getTime() > now + 86400_000) continue;
        const blob = `${r.title ?? ""} ${r.description ?? ""} ${String(r.markdown ?? "").slice(0, 3000)}`.toLowerCase();
        if (!/(scam|fraud|phishing|smishing)/.test(blob)) continue;
        const terms = data.query.toLowerCase().split(/\W+/).filter((w) => w.length > 4 && !/(scam|warning|georgia|text)/.test(w));
        if (terms.length && !terms.some((t) => blob.includes(t))) continue;
        let url: URL;
        try { url = new URL(r.url ?? m.sourceURL); } catch { continue; }
        if (url.protocol !== "https:") continue;
        const host = url.hostname.replace(/^www\./, "");
        out.push({
          title: String(r.title ?? m.title ?? host).slice(0, 200),
          publisher: String(m["og:site_name"] ?? m.ogSiteName ?? host).slice(0, 100),
          date: d.toISOString().slice(0, 10),
          url: url.toString(),
          excerpt: String(r.description ?? m.description ?? "").slice(0, 280),
          s: preferScore(host),
        });
      }
      out.sort((a, b) => b.s - a.s);
      const results = out.slice(0, 3).map(({ s, ...rest }) => rest);
      return { status: results.length ? "complete" : "no_recent_match", results };
    } catch {
      console.error("Search error");
      return { status: "unavailable", results: [] };
    }
  });
