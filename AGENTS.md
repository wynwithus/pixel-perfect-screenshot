<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Message analysis runs in the browser (rules + Transformers.js all-MiniLM-L6-v2 in src/lib/analyze.ts); only the redacted search query goes to the server, to keep private text off the server.
- Recent-warning search is one server function using Firecrawl (direct API, last-30-days filter); undated results are dropped so no date is ever invented.
- Screenshot uploads are read in the browser with tesseract.js (lazy-loaded) and fill the message box; images never leave the device.
