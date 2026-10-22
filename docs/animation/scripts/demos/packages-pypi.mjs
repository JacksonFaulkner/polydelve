export default {
  kind: "still",
  async run({ page, click, hold, goto, vis }) {
    await goto("/pypi", '[data-tour="pkg-row-0"]');
    // The table opens the top row on first load; collapse it to show the plain list.
    await vis('[data-tour="pkg-expanded"]').waitFor({ timeout: 30000 });
    await click(vis('[data-tour="pkg-row-0"]'), 600);
    await page.mouse.move(1200, 780);
    await hold(800);
  },
};
