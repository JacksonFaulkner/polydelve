export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/npm", '[data-tour="pkg-row-0"]');
    await hold(1500);
  },
};
