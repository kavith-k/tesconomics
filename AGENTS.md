# Private receipt tests

This is a public repository. `test-receipts/` contains personal emails and is deliberately ignored. Never add receipt emails, `test-receipts/expected.json`, or details copied from them to tracked files, commits, pull requests, or chat replies.

Only read `test-receipts/` when the user asks you to prepare or run receipt tests. If there are no receipts, ask them to put their own final Tesco `.eml` receipts in that folder. Each filename must start with a unique `YYYY-MM-DD` date, since the test uses those first ten characters as its key.

When asked to prepare the local tests:

1. Compare `parseTescoReceiptEmail`'s extracted items with each source email. Check delivered items, quantities, substitutions, unavailable items and charged totals. Do not treat the parser's own output as independent proof that it is correct.
2. Create or update only the ignored `test-receipts/expected.json`. It is one object keyed by filename date. Each value has `lines` (number of extracted items), `quantity` (sum of item quantities), `cents` (sum of `Math.round(item.cost * 100)`) and `sha256` (SHA-256 of `JSON.stringify(items)` in parser order). Use independently checked values for the counts and total; the hash records the reviewed parser output.
3. Run `npm test`. If it fails later, investigate the difference rather than automatically replacing the expected values.
