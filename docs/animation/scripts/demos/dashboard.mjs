export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/dashboard", "main");
    await hold(3000);
  },
};
