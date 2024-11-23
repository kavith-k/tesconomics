My housemates and I get our groceries delivered from Tesco every week. The bill is always sent via email, and is a pain to split (a. takes precious minutes away from your life; b. it's boring work). So I decided to build this SvelteKit app to help us out. This is how it works for now:
  
  1. Let's a user upload a PDF of our latest grocery bill.
  2. Converts the PDF to a series of Base64 images and sends them to an LLM via OpenRouter (as of writing this, I've settled on Claude 3.5 Sonnet).
  3. The LLM is instructed to extract the items in the bill and respond with a JSON containing all the relevant information.
  4. The JSON is parsed and the items are shown in a simple table to the user.
  5. The user can then choose which housemate bought each item; multiple choices are allowed but then the cost is shared evenly.
  6. The final totals for each housemate is calculated and shown.

TODO:
- Host it as a 24/7 service on my home server.
- Ability to export the final report so it can be shared in our group chat for transparency.
- Storing purchaser & item records in a database for record keeping purposes and maybe some fun analytics around our grocery purchases!

---

# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
