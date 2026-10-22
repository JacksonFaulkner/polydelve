export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/pypi", '[data-tour="pkg-row-0"]');
    await vis('[data-tour="pkg-expanded"]').waitFor({ timeout: 30000 });
    await page.locator("svg.recharts-surface").locator("visible=true").first().waitFor({ timeout: 15000 });
    await hold(2000);
    await page.mouse.move(1200, 780);
  },
};
