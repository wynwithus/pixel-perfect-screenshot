import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { analyze, type Analysis } from "@/lib/analyze";
import { searchRecentWarnings, type SearchResult } from "@/lib/search.functions";

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

const EXAMPLES = [
  { label: "Unpaid toll", text: "Georgia Peach Pass: Your toll account has an unpaid balance of $4.35. Pay today at peachpass-pay.top to avoid a late fee and license suspension." },
  { label: "Code request", text: "Amazon Security: We noticed a new login to your account. Reply with the 6-digit code we just sent you to keep your account open." },
  { label: "Appointment reminder", text: "Reminder: You have a dental appointment with Dr. Lee on Thursday at 2pm. Reply C to confirm or R to reschedule." },
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

  function reset() { setText(""); setResult(null); setError(""); }

  const high = result?.a.risk === "high_concern";
  const match = result?.s.results[0];

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-3xl font-bold leading-tight">Does this text look suspicious?</h1>
      <p className="mt-3">Paste the message below. We'll point out warning signs, check for recent scam reports, and show you how to contact the real organization.</p>
      <p className="mt-3 rounded-lg bg-secondary p-3 text-base">Remove passwords, account numbers, verification codes, Social Security numbers, and other private information before continuing.</p>

      {!result && (
        <div className="mt-6">
          <p className="mb-2 font-bold">Or try an example</p>
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => { setText(ex.text); setError(""); }}
                className="rounded-lg border-2 border-input bg-card px-3 py-3 text-left text-base font-bold"
              >
                {ex.label}
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
