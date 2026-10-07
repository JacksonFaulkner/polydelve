// Add several packages: the slip becomes a basket (ETF).
export default {
  kind: "video",
  async run({ page, click, type, hold, goto, focus }) {
    await goto("/predict", '[data-tour="predict-search"]');
    for (const name of ["axios", "lodash", "express"]) {
      await click(page.locator('[data-tour="predict-search"]'), 150);
      await type(name);
      await hold(500);
      await click(page.locator('[data-tour="predict-add-result"]', { hasText: name }).first(), 400);
    }
    await focus(['[data-tour="predict-search"]', '[data-tour="stake-chips"]'], 40);
    await hold(2400);
    await page.getByText(/of 3/).first().waitFor({ timeout: 5000 });
  },
};
