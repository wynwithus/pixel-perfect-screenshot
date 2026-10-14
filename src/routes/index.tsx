import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { analyze, type Analysis } from "@/lib/analyze";
import { searchRecentWarnings, type SearchResult } from "@/lib/search.functions";
import exToll from "@/assets/ex-toll.jpg";
import exCode from "@/assets/ex-code.jpg";
import exUsps from "@/assets/ex-usps.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scam Text Coach — Check a suspicious text" },
      { name: "description", content: "Paste a suspicious text. See warning signs, recent scam reports, and how to reach the real organization." },
      { property: "og:title", content: "Scam Text Coach" },
      { property: "og:description", content: "Check a suspicious text message without opening its links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const MIN = 20, MAX = 2000;

// Modeled on the FTC's most-reported text scams of 2024.
const EXAMPLES = [
  { label: "Package delivery", img: exUsps },
  { label: "Unpaid toll", img: exToll },
  { label: "Account code", img: exCode },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words font-bold text-ring underline underline-offset-2">
      {children}
    </a>
  );
}

function Index() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ a: Analysis; s: SearchResult } | null>(null);
  const search = useServerFn(searchRecentWarnings);
  const clientId = useRef(Math.random().toString(36).slice(2));
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");

  async function readImage(file: File) {
    if (file.size > 10 * 1024 * 1024) { setOcrMsg("That picture is too large. Use one under 10 MB."); return; }
    setOcrBusy(true); setOcrMsg(""); setError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      // Drop phone chrome (clock, sender number, timestamps, keyboard icons) and OCR noise.
      const words = data.text
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .filter((l) => {
          if (l.length < 4 || /^(today|yesterday|text message|imessage)\b/i.test(l)) return false;
          const chars = l.replace(/\s/g, "");
          const letters = (chars.match(/[a-z]/gi) ?? []).length;
          return letters / chars.length >= 0.6 && /[a-z]{4,}/i.test(l);
        })
        .join(" ").replace(/\/ (?=\w)/g, "/")
        .slice(0, MAX);
      if (words.length < MIN) { setOcrMsg("We couldn't read enough words. Try a clearer screenshot, or paste the text."); return; }
      setText(words);
      setOcrMsg("We copied the words below. Check them and remove any private details, then press Check this message.");
    } catch {
      setOcrMsg("We couldn't read that picture. Try another screenshot, or paste the text.");
    } finally { setOcrBusy(false); }
  }

  const len = text.trim().length;
  const hint = len === 0 ? "Paste a text message first." : len < MIN ? "Paste at least 20 characters so we have enough to review." : text.length > MAX ? "Shorten the message to 2,000 characters." : "";

  async function run() {
    if (hint || busy) { setError(hint); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const a = await analyze(text);
      let s: SearchResult;
      try { s = await search({ data: { query: a.query, client: clientId.current } }); }
      catch { s = { status: "unavailable", results: [] }; }
      setResult({ a, s });
    } catch {
      setError("We couldn't check this message right now. Do not reply or open its links. Try again shortly.");
    } finally { setBusy(false); }
  }

  function reset() { setOcrMsg(""); setText(""); setResult(null); setError(""); }

  const high = result?.a.risk === "high_concern";
  const match = result?.s.results[0];

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-3xl font-bold leading-tight">Does this text look suspicious?</h1>
      <p className="mt-3">Paste the message below. We'll point out warning signs, check for recent scam reports, and show you how to contact the real organization.</p>
      <p className="mt-3 rounded-lg bg-secondary p-3 text-base">Remove passwords, account numbers, verification codes, Social Security numbers, and other private information before continuing.</p>

      <details className="mt-4 rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-bold">Why this matters</summary>
        <div className="mt-3 space-y-3 text-base">
          <p><span className="font-bold">The problem.</span> Fake texts pretend to be the post office, a toll agency, a bank, or a store. They push you to tap a link, pay a small fee, or share a code. It only takes one tap to lose money or an account.</p>
          <p><span className="font-bold">The harm.</span> In 2024, people told the FTC they lost $470 million to scams that started with a text. That is five times more than in 2020, and most scams are never reported.{" "}
            <a href="https://www.ftc.gov/news-events/news/press-releases/2025/04/new-ftc-data-show-top-text-message-scams-2024-overall-losses-text-scams-hit-470-million" target="_blank" rel="noopener noreferrer" className="font-bold text-ring underline">FTC, April 2025</a></p>
          <p><span className="font-bold">Who it reaches.</span> Anyone with a phone in Georgia, but it hits hardest for older adults, people new to smartphones, and anyone busy or stressed when the text arrives. Fake delivery problems, fake fraud alerts, and fake unpaid tolls were among the most reported texts.</p>
          <p><span className="font-bold">How this helps.</span> You get a plain answer before you act, learn one sign to spot next time, and get the real organization's contact. Share this page with a parent, neighbor, or friend who gets these texts.</p>
        </div>
      </details>

      {!result && (
        <div className="mt-6">
          <p className="mb-1 font-bold">Try a real-looking example</p>
          <p className="mb-2 text-base text-muted-foreground">Tap a screenshot. We'll read it just like one you upload.</p>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={ocrBusy}
                onClick={async () => {
                  const blob = await (await fetch(ex.img)).blob();
                  readImage(new File([blob], "example.jpg", { type: blob.type }));
                }}
                aria-label={`Try the ${ex.label.toLowerCase()} example`}
                className="overflow-hidden rounded-2xl border-2 border-input bg-card shadow-sm disabled:opacity-50"
              >
                <img src={ex.img} alt={`Screenshot of a ${ex.label.toLowerCase()} scam text`} width={768} height={1024} loading="lazy" className="aspect-[3/2] w-full object-cover object-top sm:aspect-[3/2.2]" />
              </button>
            ))}
          </div>
          <div className="mb-5 rounded-lg border-2 border-dashed border-input bg-card p-4">
            <label htmlFor="shot" className="block font-bold">Or upload a screenshot of the text</label>
            <p className="mt-1 text-base text-muted-foreground">We read the words on your device. The picture is not sent anywhere.</p>
            <input
              id="shot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={ocrBusy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readImage(f); }}
              className="mt-3 block w-full text-base file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-3 file:font-bold file:text-primary-foreground"
            />
            {ocrBusy && <p className="mt-2" aria-live="polite">Reading the words in your picture…</p>}
            {ocrMsg && <p className="mt-2" aria-live="polite">{ocrMsg}</p>}
          </div>
          <label htmlFor="msg" className="mb-2 block font-bold">Paste the text message</label>
          <textarea
            id="msg"
            value={text}
            maxLength={MAX + 200}
            onChange={(e) => { setText(e.target.value); setError(""); }}
            rows={7}
            placeholder="Example: Your toll account has an unpaid balance. Pay today at…"
            className="w-full rounded-lg border-2 border-input bg-card p-3 text-base"
          />
          <div className={`mt-1 text-right text-sm ${text.length > MAX ? "text-destructive" : "text-muted-foreground"}`}>{text.length} / {MAX}</div>
          {error && <p role="alert" className="mt-2 font-bold text-destructive">{error}</p>}
          <button
            onClick={run}
            disabled={!!hint || busy}
            className="mt-4 w-full rounded-xl bg-primary px-5 py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
          >
            Check this message
          </button>
          {busy && <p className="mt-3 text-center" aria-live="polite">Checking the message and looking for recent warnings…</p>}
          {busy && <p className="mt-1 text-center text-sm text-muted-foreground">The first check loads a small helper into your browser. It can take a moment.</p>}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4" aria-live="polite">
          <section className={`rounded-xl border-2 p-5 ${high ? "border-destructive bg-danger-soft" : "border-caution bg-caution-soft"}`}>
            <p className={`text-2xl font-bold ${high ? "text-destructive" : "text-caution"}`}>{high ? "High concern" : "Needs verification"}</p>
            <p className="mt-2">{result.a.summary}</p>
          </section>

          {result.a.warning_signs.length > 0 && (
            <Section title="Why this message raised concern">
              <ul className="space-y-3">
                {result.a.warning_signs.map((w, i) => (
                  <li key={i}>
                    <blockquote className="break-words border-l-4 border-input pl-3 italic">"{w.message_quote}"</blockquote>
                    <p className="mt-1">{w.plain_explanation}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="What to do now">
            <ol className="list-decimal space-y-2 pl-6">
              {result.a.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          </Section>

          <Section title="Learn one thing">
            <p className="font-bold">{result.a.lesson.title}</p>
            <p className="mt-1">{result.a.lesson.meaning}</p>
            <p className="mt-2"><span className="font-bold">In your message: </span><span className="break-words italic">"{result.a.lesson.message_example}"</span></p>
            <p className="mt-2"><span className="font-bold">Habit that protects you: </span>{result.a.lesson.protective_habit}</p>
          </Section>

          <Section title="Recent warning">
            {result.s.status === "unavailable" && <p>We could not check recent warnings. Follow the verification steps above.</p>}
            {result.s.status === "no_recent_match" && <p>We did not find a matching warning from the last 30 days. That does not confirm the message is safe.</p>}
            {match && (
              <div>
                <p className="font-bold">{match.title}</p>
                <p className="text-muted-foreground">{match.publisher} · {match.date}</p>
                {match.excerpt && <p className="mt-2 text-base">{match.excerpt}</p>}
                <p className="mt-2"><SafeLink href={match.url}>View source</SafeLink></p>
              </div>
            )}
          </Section>

          <Section title="Contact the real organization">
            {result.a.official_contact ? (
              <dl className="space-y-2">
                <div><dt className="font-bold">Organization</dt><dd>{result.a.official_contact.organization}</dd></div>
                <div><dt className="font-bold">Official website</dt><dd><SafeLink href={result.a.official_contact.website}>{result.a.official_contact.website.replace("https://", "")}</SafeLink></dd></div>
                {result.a.official_contact.contact_page !== result.a.official_contact.website && (
                  <div><dt className="font-bold">Contact or fraud page</dt><dd><SafeLink href={result.a.official_contact.contact_page}>Open contact page</SafeLink></dd></div>
                )}
                {result.a.official_contact.phone && <div><dt className="font-bold">Phone</dt><dd>{result.a.official_contact.phone}</dd></div>}
              </dl>
            ) : (
              <p>We couldn't tell which organization this claims to be. Look up its contact details yourself, or use the number printed on your card, bill, or statement.</p>
            )}
            <p className="mt-3 text-base">You can also report scams to the FTC at <SafeLink href="https://reportfraud.ftc.gov">reportfraud.ftc.gov</SafeLink>.</p>
          </Section>

          <button onClick={reset} className="w-full rounded-xl border-2 border-primary bg-card px-5 py-4 text-lg font-bold">
            Check another message
          </button>
        </div>
      )}
    </main>
  );
}
