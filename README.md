## Why?

My housemates and I get our groceries delivered from Tesco every week. The bill is always sent via email, and is a pain to split (*a. takes precious minutes away from our lives; b. it's boring work*). So I decided to build this SvelteKit app to help us out. This is how it works for now:

  1. Let's a user upload a PDF of our latest grocery bill.
  2. Converts the PDF to a series of Base64 images and sends them to an LLM via OpenRouter (as of writing this, I've settled on Claude 3.5 Sonnet).
  3. The LLM is instructed to extract the items in the bill and respond with a JSON containing all the relevant information.
  4. The JSON is parsed and the items are shown in a simple table to the user.
  5. The user can then choose which housemate bought each item; multiple choices are allowed but then the cost is shared evenly.
  6. The final totals for each housemate is calculated and shown.

## Prompt

I spent a good while messing with different prompts and models, and I found this to be the best performing prompt with Claude 3.5 Sonnet:

```
You are a grocery receipt processing assistant that takes in image inputs. You MUST respond with ONLY a valid JSON array containing objects with exactly these fields: "product" (string), "quantity" (number), "cost" (number). Parse receipts using these rules:

    1. Extract data from "Qty", "Product", and "Total" columns:
      - Always use the exact value from the "Total" column for cost
      - Remove currency symbols from numbers

    2. Format rules for substitutions:
      - Use ONLY the substituted product name + " [SUB]"
      - Use the Total value shown between original and substituted items
      - Ignore the original product entry entirely

    3. Skip these items:
      - Products listed under "Unavailable"
      - Text about price differences (e.g., "Was €X, now €Y")
      - Department headers (e.g., "Fridge", "Freezer", "Cupboard")
      - VAT/tax explanations

    4. Stop processing at "Payment summary" section

    Example output:
    [
      {"product":"Chicken Breast Fillets","quantity":1,"cost":5.69},
      {"product":"Shannon Baking Parchment 12M [SUB]","quantity":1,"cost":1.20},
      {"product":"Sprite Zero Sugar Lemon-Lime Soft Drink 2L","quantity":1,"cost":3.50}
    ]
```

## TODO:
- [ ] Host it as a 24/7 service on my home server.
- [x] Loading indicator when waiting for LLM to respond.
- [ ] Ability to export the final report so it can be shared in our group chat for transparency.
- [ ] Storing purchaser & item records in a database for record keeping purposes and maybe some fun analytics around our grocery purchases!

---

## Run the app in a Docker container:

1. Build the image:
```bash
docker build -t tesconomics .
```

2. Run the app:

**NOTE:** Make sure to specify your OpenRouter API Key & the URL in which the app will run on (e.g.: http://localhost:3000)

```bash
docker run \
  -p 3000:3000 \
  -e OPENROUTER_API_KEY=${API_KEY} \
  -e ORIGIN=${URL} \
  tesconomics
```

---

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
