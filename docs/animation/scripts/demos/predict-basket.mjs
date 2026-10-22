export default {
  kind: "still",
  async run({ page, click, type, hold, goto }) {
    await goto("/predict", '[data-tour="predict-search"]');
    for (const pkg of ["axios", "express", "lodash"]) {
      await click(page.locator('[data-tour="predict-search"]'), 150);
      await type(pkg);
      await hold(600);
      await click(page.locator('[data-tour="predict-add-result"]', { hasText: pkg }).first(), 0);
      await hold(900);
    }
    await hold(1500);
    await page.mouse.move(1100, 700);
    await page.getByText(/Buy slip for/).waitFor({ timeout: 5000 });
  },
};
