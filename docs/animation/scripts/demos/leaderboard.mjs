export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/leaderboard", "main");
    await hold(2500);
  },
};
