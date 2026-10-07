// Example still with overlays: the slip after adding a package.
export default {
  kind: "still",
  async run({ page, click, type, hold, goto, annotate }) {
    await goto("/predict", '[data-tour="predict-search"]');
    await click(page.locator('[data-tour="predict-search"]'), 200);
    await type("axios");
    await hold(600);
    await click(page.locator('[data-tour="predict-add-result"]', { hasText: "axios" }).first(), 0);
    await hold(2500);
    await page.mouse.move(1100, 700); // park the cursor out of the way
    await page.getByText(/Buy slip for/).waitFor({ timeout: 5000 });
    await annotate([
      { target: '[data-tour="predict-search"]', label: "Search any tracked package", n: 1 },
      { target: '[data-tour="stake-chips"]', label: "Pick a stake", n: 2, side: "top" },
      { target: '[data-tour="duration-options"]', label: "Choose how long it runs", n: 3, side: "right" },
    ]);
  },
};
