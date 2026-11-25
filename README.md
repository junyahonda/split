# Split

Good food. Fair shares. A phone-first restaurant bill splitter at **https://split.junyahonda.com**.

Add your table, enter receipt items, tap who had each item, and see everyone’s exact share of food, tax, and tip. Shared plates are divided equally between their selected people. No accounts, ads, backend, or analytics.

## Development

Node 22+ is required. Run `npm ci`, then `npm run dev`. Run `npm test` for calculation tests and `npm run build` for a production build; `npm start` serves the production build on port 3000.

## How the math works

- Prices, totals, and final allocations use integer cents.
- Each shared item is allocated using the largest remainder method, so its shares add up exactly.
- Tax is entered as the amount on the receipt. Tip can be a pre-tax percentage or a fixed amount.
- Tax and tip follow each person’s unrounded food-and-drink share, independently rounded with the largest remainder method. A zero-share person owes nothing.
- Ties go to the earlier person in the table; no cents disappear or appear.
- All items must be assigned before the final split is shown.

## Privacy

The current bill is saved only in this browser’s local storage and survives refresh. Nothing is uploaded. “New bill” clears that draft after confirmation. “Copy the split” puts a plain-text summary on the clipboard for sharing. This does not provide a synchronized multi-device bill. Google Fonts serves the typefaces, with system fallbacks.

## Hosting

The Checks workflow runs tests and builds pull requests. After merge, the Deploy GitHub Pages workflow builds and deploys `dist/` through GitHub Actions.

Repository settings → Pages → Source must be **GitHub Actions**. Set the custom domain to `split.junyahonda.com`. In Namecheap Advanced DNS, add only CNAME host `split`, value `junyahonda.github.io`. Do not change any other records. Once GitHub provisions the certificate, enable Enforce HTTPS. `public/CNAME` carries the domain in the deployment artifact; Actions-based Pages also needs the custom domain configured in repository settings.

The home-screen manifest includes Android icons. No service worker is installed; an initial network connection is required.
