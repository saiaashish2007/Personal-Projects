export interface NavItem {
  href: string;
  step: string;
  label: string;
  blurb: string;
}

/** Page order follows SPEC.md section 14: the research process, start to finish. */
export const NAV: NavItem[] = [
  { href: "/", step: "01", label: "Thesis", blurb: "The claim, the mechanism, and the headline result" },
  { href: "/data/", step: "02", label: "Data & Parsing", blurb: "4.5M Form 4 transactions, and why only 11% of them matter" },
  { href: "/signal/", step: "03", label: "Signal Construction", blurb: "Routine vs. opportunistic classification and the firm-level score" },
  { href: "/ic/", step: "04", label: "IC Analysis", blurb: "Does the signal predict returns, with and without the filter" },
  { href: "/backtest/", step: "05", label: "Backtest", blurb: "Portfolio results, gross and net, with drawdowns and turnover" },
  { href: "/costs/", step: "06", label: "Cost Sensitivity", blurb: "Break-even cost and where the alpha dies" },
  { href: "/attribution/", step: "07", label: "Factor Attribution", blurb: "Is this alpha or repackaged small-cap value?" },
  { href: "/robustness/", step: "08", label: "Robustness", blurb: "Subperiods, terciles, parameter surface, randomization" },
  { href: "/what-didnt-work/", step: "09", label: "What Didn't Work", blurb: "The failures, the limitations, and the honest verdict" },
];

export const REPO_URL = "https://github.com/saiaashish2007/Personal-Projects";
export const SPEC_URL = `${REPO_URL}/blob/main/insider-alpha/SPEC.md`;
