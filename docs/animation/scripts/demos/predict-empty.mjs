export default {
  kind: "still",
  async run({ page, hold, goto, vis, click, type, annotate }) {
    await goto("/predict", '[data-tour="predict-search"]');
    await hold(1500);
  },
};
