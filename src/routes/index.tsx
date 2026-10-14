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
  const [step, setStep] = useState(0);
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
      setStep(0); setResult({ a, s });
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
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

      {result && (() => {
        const a = result.a;
        const sign = a.warning_signs[0];
        const c = a.official_contact;
        const steps: { title: string; body: React.ReactNode; next: string }[] = [
          {
            title: "",
            next: "Why?",
            body: (
              <section className={`rounded-xl border-2 p-6 ${high ? "border-destructive bg-danger-soft" : "border-caution bg-caution-soft"}`}>
                <p className={`text-3xl font-bold ${high ? "text-destructive" : "text-caution"}`}>{high ? "This looks like a scam" : "Treat it as fake for now"}</p>
                <p className="mt-3 text-lg">{high ? "Don't tap the link, reply, or pay." : "We can't confirm it's real. Don't use its links. Check with the company yourself."}</p>
              </section>
            ),
          },
          {
            title: "Why",
            next: "What do I do?",
            body: sign ? (
              <div>
                <blockquote className="break-words border-l-4 border-input pl-3 text-lg italic">"{sign.message_quote}"</blockquote>
                <p className="mt-3 text-lg">{sign.plain_explanation}</p>
              </div>
            ) : <p className="text-lg">It comes from a number you can't check. Real companies can be reached through their own website.</p>,
          },
          {
            title: "Do this",
            next: "Learn the trick",
            body: c ? (
              <div className="text-lg">
                <p>Go to {c.organization}'s real website yourself:</p>
                <p className="mt-2 text-xl"><SafeLink href={c.website}>{c.website.replace("https://", "")}</SafeLink></p>
                {c.phone && <p className="mt-3">Or call <span className="font-bold">{c.phone}</span></p>}
                <p className="mt-3 text-base text-muted-foreground">Then forward the text to 7726 and delete it.</p>
              </div>
            ) : (
              <p className="text-lg">Call the company using the number on your card, bill, or statement — not the one in the text. Then forward the text to 7726 and delete it.</p>
            ),
          },
          {
            title: `Learn: ${a.lesson.title}`,
            next: "Is this happening to others?",
            body: (
              <div className="text-lg">
                <p>{a.lesson.meaning}</p>
                <p className="mt-3 font-bold">Next time: {a.lesson.protective_habit}</p>
              </div>
            ),
          },
          {
            title: "Recent warning",
            next: "",
            body: match ? (
              <div className="text-lg">
                <p className="font-bold">{match.title}</p>
                <p className="text-muted-foreground">{match.publisher} · {match.date}</p>
                <p className="mt-2"><SafeLink href={match.url}>View source</SafeLink></p>
              </div>
            ) : result.s.status === "unavailable" ? (
              <p className="text-lg">We could not check recent warnings right now.</p>
            ) : (
              <p className="text-lg">We didn't find a matching warning from the last 30 days. That doesn't make the text safe.</p>
            ),
          },
        ];
        const s = steps[step];
        const last = step === steps.length - 1;
        return (
          <div className="mt-6" aria-live="polite">
            <p className="mb-2 text-base text-muted-foreground">Step {step + 1} of {steps.length}</p>
            {s.title ? <Section title={s.title}>{s.body}</Section> : s.body}
            <div className="mt-4 flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="rounded-xl border-2 border-input bg-card px-5 py-4 text-lg font-bold">Back</button>
              )}
              {last ? (
                <button onClick={reset} className="flex-1 rounded-xl bg-primary px-5 py-4 text-lg font-bold text-primary-foreground">Check another message</button>
              ) : (
                <button onClick={() => setStep(step + 1)} className="flex-1 rounded-xl bg-primary px-5 py-4 text-lg font-bold text-primary-foreground">{s.next}</button>
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
