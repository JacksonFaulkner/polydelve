// Search a package and add it to the slip.
export default {
  kind: "video",
  async run({ page, click, type, hold, goto, focus }) {
    await goto("/predict", '[data-tour="predict-search"]');
    await focus('[data-tour="predict-search"]', 120);
    await click(page.locator('[data-tour="predict-search"]'), 200);
    await type("axios");
    await hold(700);
    await click(page.locator('[data-tour="predict-add-result"]', { hasText: "axios" }).first(), 0);
    await hold(600);
    await focus(['[data-tour="predict-search"]', '[data-tour="stake-chips"]'], 60);
    await hold(2200);
    await page.getByText(/Buy slip for/).waitFor({ timeout: 5000 });
  },
};
