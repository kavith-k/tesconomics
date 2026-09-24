## Why?

My housemates and I get our groceries delivered from Tesco every week. The bill is always sent via email, and is a pain to split (_a. takes precious minutes away from our lives; b. it's boring work_). So I decided to build this SvelteKit app to help us out. This is how it works for now:

1. A user saves the final Tesco receipt email as an `.eml` file and uploads it.
2. The app reads the receipt directly from the email and pulls out the delivered items.
3. The items are shown in a simple table.
4. The user can then choose which housemate bought each item; multiple choices are allowed, but then the cost is shared evenly.
5. The final total for each housemate is calculated and shown.

The upload limit is 4 MiB. It needs to be the final receipt email rather than the earlier order confirmation. Substitutions are marked with `[SUB]`, unavailable products are skipped, and the receipt totals are checked so dodgy or unfamiliar receipts fail with a useful error instead of quietly producing the wrong bill.

## TODO

- [x] Host it as a 24/7 service on my home server.
- [x] Loading indicator while the receipt is being processed.
- [x] ~~Ability to export the final report so it can be shared in our group chat for transparency.~~ (PDF export of the page seems to work for us!)
- [ ] Storing purchaser & item records in a database for record keeping purposes and maybe some fun analytics around our grocery purchases!

---

## Quick Start

The app is publicly available as a Docker image at [ghcr.io/kavith-k/tesconomics](https://ghcr.io/kavith-k/tesconomics). You can run it using the following command:

```bash
docker run -d \
  --name tesconomics \
  -e ORIGIN=<URL>:4567 \
  -e HOUSEMATES="Alex,Sam" \
  -p 4567:3000 \
  --restart always \
  ghcr.io/kavith-k/tesconomics:latest
```

Alternatively, here's an example Docker Compose file:

```yaml
services:
  tesconomics:
    image: ghcr.io/kavith-k/tesconomics:latest
    container_name: tesconomics
    environment:
      - ORIGIN=<URL>:4567
      - HOUSEMATES=Alex,Sam
    ports:
      - 4567:3000
    restart: always
```

---

## Developing

Set `HOUSEMATES` to a comma-separated list of names. It's required when running the container and the development server; empty or repeated names aren't allowed. Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
HOUSEMATES="Alex,Sam" npm run dev

# or start the server and open the app in a new browser tab
HOUSEMATES="Alex,Sam" npm run dev -- --open
```

Run the checks with:

```bash
npm test
npm run check
npm run lint
```

The receipt tests use real emails, so the test data is deliberately not included in this public repository. Put your own final Tesco `.eml` receipts in `test-receipts/`, with filenames starting with a unique date like `2026-01-01.eml`. The emails and `test-receipts/expected.json` are ignored by Git.

If you use a coding agent, you can ask it: “Follow [AGENTS.md](AGENTS.md) to check my local receipts against the parser, create `test-receipts/expected.json`, then run `npm test`.” The file holds checked counts and totals, plus a hash of each complete item list to catch later changes to names or prices. Review the results yourself before trusting them; generating expectations from the parser alone could lock in a mistake.

Without receipts, you can still run `npm run check` and `npm run build`.

## Building

To create a production version of the app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Containerising

1. Build the image:

```bash
docker build -t tesconomics .
```

2. Test run the app locally:

**NOTE:** Make sure to specify the URL on which the app will run (e.g. `http://localhost:3000`).

```bash
docker run \
  -p 3000:3000 \
  -e ORIGIN=${URL} \
  -e HOUSEMATES="Alex,Sam" \
  tesconomics
```

3. Login to GitHub Packages (container registry):

```bash
echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
```

4. List local images:

```bash
docker images
```

**Make a note of the IMAGE ID you want to publish.**

5. Tag the latest image:

```bash
docker tag <IMAGE ID> ghcr.io/kavith-k/tesconomics:latest
```

6. Push to GitHub Packages:

```bash
docker push ghcr.io/kavith-k/tesconomics:latest
```
