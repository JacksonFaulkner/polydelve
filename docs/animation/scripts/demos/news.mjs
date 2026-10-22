export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/news", "main");
    await hold(3000);
  },
};
