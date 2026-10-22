export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/settings", "main");
    await hold(1500);
  },
};
