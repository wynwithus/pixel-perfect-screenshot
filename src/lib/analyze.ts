// @ts-nocheck -- loosely-typed regex/embedding helpers; behavior verified in browser tests.
// Browser-only analysis: rule-based signs + all-MiniLM-L6-v2 embeddings to pick the lesson.

export function redact(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[CARD]")
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[PHONE]")
    .replace(/\b(code|pin|otp|passcode)(\s*(is|:))?\s*\d{4,8}\b/gi, "$1 [CODE]")
    .replace(/\b\d{4,8}\b(?=[^.]*\b(code|verification)\b)/gi, "[CODE]")
    .replace(/\b(acct|account|acc)(\s*(no\.?|number|#))?\s*[:#]?\s*[A-Z0-9-]{4,}/gi, "$1 [ACCOUNT]")
    .replace(/\b\d{8,}\b/g, "[ACCOUNT]");
}

export type Org = { name: string; website: string; contact_page: string; phone: string | null; domains: string[]; keys: RegExp };

// Contacts typed from the organizations' own sites. Phones only where clearly published.
export const ORGS: Org[] = [
  { name: "Peach Pass (State Road and Tollway Authority)", website: "https://www.peachpass.com", contact_page: "https://www.peachpass.com", phone: null, domains: ["peachpass.com", "georgia.gov"], keys: /peach\s*pass|georgia toll|srta|toll/i },
  { name: "U.S. Postal Service", website: "https://www.usps.com", contact_page: "https://www.uspis.gov/report", phone: "1-800-275-8777", domains: ["usps.com", "uspis.gov"], keys: /usps|postal|post office|package|parcel|delivery/i },
  { name: "Internal Revenue Service (IRS)", website: "https://www.irs.gov", contact_page: "https://www.irs.gov/help/tax-scams/report-phishing", phone: "1-800-829-1040", domains: ["irs.gov"], keys: /\birs\b|tax refund|internal revenue/i },
  { name: "Georgia Department of Driver Services", website: "https://dds.georgia.gov", contact_page: "https://dds.georgia.gov", phone: null, domains: ["dds.georgia.gov", "georgia.gov"], keys: /\bdds\b|driver.?s license|driver services|dmv/i },
  { name: "Georgia Power", website: "https://www.georgiapower.com", contact_page: "https://www.georgiapower.com", phone: null, domains: ["georgiapower.com"], keys: /georgia power|power bill|electric/i },
  { name: "Amazon", website: "https://www.amazon.com", contact_page: "https://www.amazon.com/gp/help/customer/contact-us", phone: null, domains: ["amazon.com"], keys: /amazon/i },
  { name: "Social Security Administration", website: "https://www.ssa.gov", contact_page: "https://oig.ssa.gov/report/", phone: "1-800-772-1213", domains: ["ssa.gov"], keys: /social security|\bssa\b/i },
];

const CONCEPTS = {
  "Suspicious domains": { meaning: "A domain is the main part of a web address, like peachpass.com. Scammers use names that look close but belong to someone else.", habit: "Type the organization's address yourself instead of tapping a link in a text.", ex: "pay your toll at peachpass-billing.com" },
  "Shortened links": { meaning: "A shortened link hides the real address behind a short code, so you can't see where it goes.", habit: "Don't tap short links in unexpected texts. Go to the official site on your own.", ex: "click bit.ly/abc to confirm" },
  "One-time verification codes": { meaning: "A verification code is a short number sent to you to prove it's really you. Anyone who has it can get into your account.", habit: "Never share a code with anyone who contacts you. Real companies won't ask for it.", ex: "reply with the 6-digit code we sent you" },
  "Password requests": { meaning: "Your password is the key to your account. Real companies never ask for it by text.", habit: "Never send a password by text, email, or phone.", ex: "confirm your password to keep your account" },
  "Gift-card payments": { meaning: "Gift cards work like cash. Once you share the numbers, the money is gone.", habit: "No real agency or company asks you to pay a bill with gift cards.", ex: "buy Apple gift cards and send the numbers" },
  "Cryptocurrency payments": { meaning: "Cryptocurrency, like Bitcoin, is digital money that is hard to trace or get back.", habit: "Don't pay anyone who demands crypto, especially to fix a problem.", ex: "send payment in Bitcoin to this wallet" },
  "False urgency": { meaning: "False urgency is pressure to act right now so you don't stop and check.", habit: "Slow down. A real bill or notice will still be there after you check it yourself.", ex: "pay today or your license will be suspended" },
  "Sender spoofing": { meaning: "Spoofing is when a scammer makes a text look like it came from a real company or person.", habit: "Don't trust the sender name. Contact the organization using a number you find yourself.", ex: "this is your bank fraud department" },
  "Unexpected attachments": { meaning: "An unexpected file can install harmful software on your phone.", habit: "Don't open files you weren't expecting.", ex: "open the attached invoice" },
  "Remote-access requests": { meaning: "Remote access lets another person control your phone or computer from far away.", habit: "Never install an app because a stranger asks you to.", ex: "download this app so our technician can help" },
} as const;
export type ConceptName = keyof typeof CONCEPTS;

type Sign = { message_quote: string; plain_explanation: string; concept: ConceptName; strong: boolean };

function quoteAround(text: string, re: RegExp) {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, m.index - 30)) + 1);
  const end = Math.min(text.length, (text.indexOf(" ", m.index + m[0].length + 30) + 1 || text.length + 1) - 1);
  return text.slice(start, end).trim();
}

function findSigns(text: string, org: Org | null): Sign[] {
  const signs: Sign[] = [];
  const add = (re: RegExp, concept: ConceptName, why: string, strong: boolean) => {
    const q = quoteAround(text, re);
    if (q && !signs.some((s) => s.concept === concept)) signs.push({ message_quote: q, plain_explanation: why, concept, strong });
  };
  add(/\b(code|passcode|otp|pin)\b/i, "One-time verification codes", "This asks for a code. That code can unlock your account for whoever has it.", /send|reply|share|give|tell|provide/i.test(text));
  add(/password/i, "Password requests", "It asks for your password. Real companies never ask for it by text.", true);
  add(/gift\s*card|itunes|google play card/i, "Gift-card payments", "It asks for gift cards. Gift cards are a common way scammers take money.", true);
  add(/bitcoin|crypto|usdt|wallet address/i, "Cryptocurrency payments", "It asks for crypto. That money is very hard to get back.", true);
  add(/anydesk|teamviewer|remote access|download (this|the) app/i, "Remote-access requests", "It asks you to let someone control your device.", true);
  add(/(today|immediately|within \d+ ?(hours?|hrs?)|final notice|suspen|late fee|penalt|arrest|closed|disconnect|avoid|unpaid|overdue)/i, "False urgency", "It rushes you and threatens a penalty. Scammers do this so you act before you check.", /arrest|suspen|penalt|late fee|closed|disconnect|unpaid|overdue|pay (now|today)|\$\d/i.test(text));

  const urls = [...text.matchAll(/\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi)].map((m) => m[1]);
  for (const u of urls) {
    const host = u.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase().replace(/^www\./, "");
    if (/^(bit\.ly|tinyurl\.com|t\.co|rb\.gy|is\.gd|cutt\.ly|shorturl\.at)$/.test(host)) {
      add(new RegExp(host.replace(/\./g, "\\.")), "Shortened links", `The link "${host}" hides where it really goes.`, true);
    } else if (org && !org.domains.some((d) => host === d || host.endsWith("." + d))) {
      add(new RegExp(host.replace(/\./g, "\\."), "i"), "Suspicious domains", `The link goes to "${host}". That is not ${org.name}'s website.`, true);
    } else if (!org && /pay|bill|toll|verify|confirm|login|update/i.test(text)) {
      add(new RegExp(host.replace(/\./g, "\\."), "i"), "Suspicious domains", `The link "${host}" asks you to act, and we can't tie it to a known organization.`, false);
    }
  }
  const order = ["One-time verification codes","Password requests","Suspicious domains","Shortened links","Gift-card payments","Cryptocurrency payments","Remote-access requests","False urgency"];
  return signs.sort((a, b) => order.indexOf(a.concept) - order.indexOf(b.concept));
}

let embedderPromise: Promise<any> | null = null;
export function loadEmbedder() {
  if (!embedderPromise) {
    embedderPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" } as any),
    );
  }
  return embedderPromise;
}

async function pickConcept(text: string): Promise<ConceptName> {
  const embed = await loadEmbedder();
  const names = Object.keys(CONCEPTS) as ConceptName[];
  const inputs = [text, ...names.map((n) => `${n}: ${CONCEPTS[n].ex}. ${CONCEPTS[n].meaning}`)];
  const out = await embed(inputs, { pooling: "mean", normalize: true });
  const v: number[][] = out.tolist();
  let best = 0, bestScore = -1;
  for (let i = 1; i < v.length; i++) {
    const s = v[0].reduce((acc, x, j) => acc + x * v[i][j], 0);
    if (s > bestScore) { bestScore = s; best = i - 1; }
  }
  return names[best];
}

export type Analysis = {
  risk: "high_concern" | "needs_verification";
  headline: string;
  summary: string;
  warning_signs: { message_quote: string; plain_explanation: string }[];
  actions: [string, string, string];
  lesson: { title: string; meaning: string; message_example: string; protective_habit: string };
  official_contact: { organization: string; website: string; contact_page: string; phone: string | null } | null;
  query: string;
};

export async function analyze(raw: string): Promise<Analysis> {
  const text = redact(raw);
  const org = ORGS.find((o) => o.keys.test(text)) ?? null;
  const signs = findSigns(text, org);
  const high = signs.some((s) => s.strong);
  const top = signs.slice(0, 3);

  const concept: ConceptName = top[0] ? top[0].concept : await pickConcept(text);
  const lessonQuote = top.find((s) => s.concept === concept)?.message_quote ?? top[0]?.message_quote ?? text.slice(0, 80);
  const c = CONCEPTS[concept];

  const asksCode = signs.some((s) => s.concept === "One-time verification codes");
  const first = asksCode
    ? "Do not share the code. Do not reply to the message."
    : "Do not reply, tap the link, pay, or share any information.";
  const second = org
    ? `Contact ${org.name} yourself using the website below or the number on your bill or card.`
    : "Contact the organization yourself. Use its official website or the number printed on your card, bill, or statement.";
  const third = high
    ? "Report the text by forwarding it to 7726 (SPAM), then delete it."
    : "If it turns out to be fake, forward it to 7726 (SPAM) and delete it.";

  const phrase = text.replace(/\[[A-Z]+\]|https?:\/\/\S+|\S+\.\w{2,}\/\S*/g, "").split(/[.!?]/).find((s) => s.trim().length > 15)?.trim().split(/\s+/).slice(0, 6).join(" ") ?? "";
  const query = `${org ? org.name.split(" (")[0] : ""} ${concept === "False urgency" || concept === "Suspicious domains" ? "text" : concept} scam warning ${phrase} Georgia`.replace(/\s+/g, " ").trim();

  return {
    risk: high ? "high_concern" : "needs_verification",
    headline: high ? "High concern" : "Needs verification",
    summary: high
      ? `This text has ${top.length === 1 ? "a strong warning sign" : "strong warning signs"} common in scams. That does not prove it is fraud, but treat it with care.`
      : "We could not confirm this message. Do not reply or use its links. Contact the organization through its official website or the number printed on your card, bill, or statement.",
    warning_signs: top.map(({ message_quote, plain_explanation }) => ({ message_quote, plain_explanation })),
    actions: [first, second, third],
    lesson: { title: concept, meaning: c.meaning, message_example: lessonQuote, protective_habit: c.habit },
    official_contact: org ? { organization: org.name, website: org.website, contact_page: org.contact_page, phone: org.phone } : null,
    query,
  };
}
