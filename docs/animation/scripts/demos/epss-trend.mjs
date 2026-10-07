// Open a package and read its EPSS trend.
export default {
  kind: "video",
  async run({ page, click, hold, goto, vis, focus }) {
    await goto("/pypi", '[data-tour="pkg-row-0"]');
    // The table opens the top row on first load; click the next one to show it switching.
    await vis('[data-tour="pkg-expanded"]').waitFor({ timeout: 30000 });
    await page.locator("svg.recharts-surface").locator("visible=true").first().waitFor({ timeout: 15000 });
    await focus('[data-tour="pkg-expanded"]', 30);
    await hold(1800);
    await click(page.locator("tbody tr.cursor-pointer").locator("visible=true").nth(1), 0);
    await hold(500);
    await page.locator("svg.recharts-surface").locator("visible=true").first().waitFor({ timeout: 15000 });
    await hold(2600);
  },
};
