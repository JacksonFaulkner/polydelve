# Polydelve Twitter/X banner

Remotion **still** project. Renders a 1500x500 (3:1) header image.

```bash
npm install
npm run studio    # live edit headline/tagline/handle in the browser
npm run render    # -> out/banner.png
```

## Customizing

Edit props live in studio, or override at render time:

```bash
npx remotion still src/index.ts TwitterBanner out/banner.png \
  --props='{"headline":"Predict the next *CVE* spike","handle":"@polydelve","showChart":true}'
```

- `headline` — wrap one word in `*asterisks*` to paint it yellow.
- `tagline`, `handle`, `showChart` — see `bannerDefaultProps` in `src/TwitterBanner.tsx`.

Brand: bg `#15191D`, accent `#FDE832`. Logo from `public/logo.png`.
