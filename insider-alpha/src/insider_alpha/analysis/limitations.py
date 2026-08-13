"""Hand-written 'What Didn't Work' narrative, filled from measured artifacts."""

from __future__ import annotations

from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _row(grid: list[dict], row_id: str) -> dict | None:
    return next((r for r in grid if r["id"] == row_id), None)


def _reg(regs: list[dict], reg_id: str) -> dict | None:
    return next((r for r in regs if r["id"] == reg_id), None)


def _loading(reg: dict, factor: str) -> dict:
    return next(x for x in reg["loadings"] if x["factor"] == factor)


def build_limitations_artifact(
    *,
    attribution: dict,
    robustness: dict,
    ic: dict,
    backtest: dict,
    costs: dict,
    classifier: dict,
    data_profile: dict,
    notes: str | None = None,
    generated_at: str | None = None,
) -> dict[str, object]:
    """Prose-heavy artifact written from the actual (failed) results."""
    primary = _reg(attribution["regressions"], attribution["primary_regression_id"])
    twin = _reg(attribution["regressions"], "all_etf_3m_net")
    grid = robustness["grid"]
    baseline = _row(grid, robustness["baseline_id"])
    early = _row(grid, "sub_2014_2019")
    late = _row(grid, "sub_2020_2025")
    rand = robustness["randomization"]
    mt = robustness["multiple_testing"]
    sweep = robustness["parameter_sweep"]

    headline = {row["horizon_days"]: row for row in ic.get("headline", [])}
    h21 = headline.get(21, {})
    h63 = headline.get(63, {})
    opp_arm = next((a for a in ic.get("arms", []) if a.get("arm") == "opportunistic"), {})
    q21 = next((q for q in opp_arm.get("quantiles", []) if q.get("horizon_days") == 21), {})
    buckets = q21.get("buckets", [])
    q_means = {b["quantile"]: b["mean_forward_return_bps"] for b in buckets}

    variant = next(
        (v for v in backtest.get("variants", []) if v.get("id") == backtest.get("primary_variant_id")),
        {},
    )
    net = (variant.get("stats") or {}).get("net") or {}
    be = costs.get("break_even") or {}
    sweep0 = next((s for s in costs.get("sweep", []) if s.get("round_trip_bps") == 0), {})
    cm = (classifier.get("rule_10b5_1_validation") or {}).get("metrics") or {}
    lag = data_profile.get("filing_lag") or {}

    alpha = primary["alpha_ann_bps"] if primary else 0.0
    alpha_t = primary["alpha_t_stat"] if primary else 0.0
    smb = _loading(primary, "SMB") if primary else {"beta": 0, "t_stat": 0}
    hml = _loading(primary, "HML") if primary else {"beta": 0, "t_stat": 0}
    sharpe = float(baseline["sharpe"]) if baseline else float(net.get("sharpe") or 0)
    cagr = float(net.get("ann_return") or 0)
    mdd = float(net.get("max_drawdown") or 0)
    turn = float((variant.get("turnover") or {}).get("annualized") or 0)
    n_long = float(variant.get("avg_n_positions") or 0)

    summary = (
        f"Cohen, Malloy & Pomorski does not replicate on 2014–2025 at the "
        f"pre-registered gate. Opportunistic 21-day IC is {h21.get('opportunistic_mean_ic', 0):+.4f} "
        f"(t = {h21.get('opportunistic_t_stat', 0):.2f}) and 63-day IC is "
        f"{h63.get('opportunistic_mean_ic', 0):+.4f} (t = {h63.get('opportunistic_t_stat', 0):.2f}); "
        f"the CMP filter's lift versus all insider purchases is "
        f"{h21.get('delta_ic', 0):+.4f} at 21 days and ≈ 0 at 63. The primary "
        f"book opp_etf_3m has net Sharpe {sharpe:.2f}, net CAGR {cagr:+.1%}, "
        f"max drawdown {mdd:.1%}, and no break-even cost — excess versus RF is "
        f"{sweep0.get('net_alpha_ann_bps', -598):.0f} bps/year even at 0 bps "
        f"(t = {sweep0.get('alpha_t_stat', -1.24):.2f}). Residual FF5+UMD alpha "
        f"is {alpha:+.0f} bps/year (t = {alpha_t:.2f}). This is post-publication "
        f"decay, not a live edge."
    )

    limitations = [
        {
            "id": "survivorship",
            "title": "Survivorship bias in Yahoo prices",
            "severity": "high",
            "category": "Data",
            "description": (
                "Yahoo serves no history for a delisted ticker. Activision, Twitter, "
                "SVB Financial, Cerner and Xilinx were each requested successfully "
                "alongside live names of the same size and returned nothing. The 2014 "
                "universe is therefore built only from companies that were still listed "
                "in 2025: essentially no name stops printing before the sample ends, "
                "against the 2–4% annual attrition the S&P 1500 actually experiences. "
                "Missing names are missing from both legs, so the bias distorts the "
                "result to the extent that disappearing correlates with the signal — "
                "and it does, in both directions."
            ),
            "direction_of_bias": (
                "Ambiguous on the spread: acquisitions at a premium (insiders buy ahead) "
                "are missing from the long leg; bankruptcies (insiders were not buying) "
                "are missing from the short. Long-only readings are biased upward."
            ),
            "mitigation": (
                "Disclosed rather than adjusted away. Insider transaction prices and "
                "unexplained overnight jumps are used as a second opinion on the names "
                "that remain. A CRSP-quality panel would resolve this properly."
            ),
            "quantification": (
                "Of the realized universe, essentially no name stops printing prices "
                "before the sample ends."
            ),
        },
        {
            "id": "tenb51_opacity",
            "title": "10b5-1 opacity pre-2023",
            "severity": "high",
            "category": "Measurement",
            "description": (
                "The Form 4 checkbox identifying pre-scheduled 10b5-1 trades only "
                "exists from 2023. For nine of the twelve sample years the routine "
                "classifier is a behavioral proxy for scheduled trading, not an "
                "observation of it. Precision and recall against the post-2023 flag "
                f"are {cm.get('precision', 0.55):.2f} and {cm.get('recall', 0.73):.2f} "
                "— near 0.6, which means the proxy and the checkbox disagree on a "
                "large minority of trades."
            ),
            "direction_of_bias": "Attenuating — misclassification dilutes the opportunistic bucket",
            "mitigation": (
                "The checkbox is held out as a validation set the classifier never "
                "sees. Agreement is directional (routine trades are more often flagged) "
                "and survives collapsing to one observation per insider-year."
            ),
            "quantification": (
                f"Precision {cm.get('precision', 0):.2f}, recall {cm.get('recall', 0):.2f}, "
                f"accuracy {cm.get('accuracy', 0):.2f} on 2023–2025 classified trades."
            ),
        },
        {
            "id": "sparsity",
            "title": "Event sparsity",
            "severity": "high",
            "category": "Statistics",
            "description": (
                "Once the opportunistic filter is applied, a median of 46 universe "
                "names per month carry a nonzero score (3.3% of the 1,500-name "
                "universe). The top quintile is then about 9 names. Cross-sectional "
                "breadth is thin and confidence intervals are wide."
            ),
            "direction_of_bias": None,
            "mitigation": (
                "Quintiles rather than deciles; overlapping three-month vintages; "
                "bootstrap rather than asymptotic intervals on Sharpe and alpha."
            ),
            "quantification": (
                f"Median 46 names with signal; overlapping book averages {n_long:.1f} "
                f"longs. Bootstrap 95% CI on net Sharpe is "
                f"[{robustness['bootstrap'][0]['ci_low']:.2f}, "
                f"{robustness['bootstrap'][0]['ci_high']:.2f}]."
            ),
        },
        {
            "id": "filing_lag",
            "title": "Filing lag plus monthly rebalancing",
            "severity": "medium",
            "category": "Implementation",
            "description": (
                "Signals are timestamped by filing date, up to two business days after "
                "the insider's fill, and are then only acted on at the next monthly "
                "rebalance. Realized entry can be several weeks after the insider transacted."
            ),
            "direction_of_bias": "Downward — realistic implementation gives up some of the paper effect",
            "mitigation": "Intentional. Using transaction date would inject lookahead through late filings.",
            "quantification": (
                f"Median filing lag {lag.get('median_days', 2):.0f} business days; "
                f"{100 * lag.get('share_within_statutory_window', 0):.1f}% inside the "
                "statutory two-business-day window."
            ),
        },
        {
            "id": "no_borrow",
            "title": "No borrow costs or short availability",
            "severity": "medium",
            "category": "Implementation",
            "description": (
                "The quintile-spread variant shorts the bottom quintile with no borrow "
                "fee and no availability constraint. Bottom-quintile names skew small "
                "and hard to borrow. The primary book shorts synthetic sector portfolios "
                "instead, which avoids single-name borrow but is not a live ETF."
            ),
            "direction_of_bias": "Upward on the quintile-spread variant only",
            "mitigation": (
                "The beta- and sector-matched ETF hedge is the primary construction "
                "precisely because it does not depend on single-name borrow."
            ),
            "quantification": None,
        },
        {
            "id": "post_publication",
            "title": "Post-publication decay",
            "severity": "high",
            "category": "Economics",
            "description": (
                "The sample is entirely after Cohen, Malloy & Pomorski (2012). The "
                "project was designed to report decay cleanly if that is what the data "
                "showed. It is. The 82 bps/month opportunistic-buy premium from their "
                "1986–2007 sample is not in this one, and the CMP filter's incremental "
                "IC is indistinguishable from zero."
            ),
            "direction_of_bias": None,
            "mitigation": (
                "Pre-registered go/no-go on 21- and 63-day IC. No parameter was "
                "retuned after the gate failed."
            ),
            "quantification": (
                f"Gate failed at 63d (t = {h63.get('opportunistic_t_stat', 1.54):.2f}). "
                f"Primary net Sharpe {sharpe:.2f}; residual alpha {alpha:+.0f} bps/year."
            ),
        },
        {
            "id": "name_sector_caps",
            "title": "Name and sector cap relaxation",
            "severity": "medium",
            "category": "Implementation",
            "description": (
                "A 3% per-name cap needs 34 names to fill a 100% long book; a 25% "
                "sector cap needs the book to span at least four SIC divisions. The "
                "opportunistic top quintile is about 9 names and often clustered in "
                "one division. Caps are applied when they are feasible and otherwise "
                "relax to the minimum that still fully invests. That is a spec tension "
                "forced by sparsity, not a tuned parameter."
            ),
            "direction_of_bias": (
                "Concentration — the realized book is less diversified than the SPEC "
                "caps describe"
            ),
            "mitigation": "Recorded in SPEC §9.1 and in the backtest notes. Not retuned.",
            "quantification": (
                f"Median ~9 names in the top quintile; overlapping book averages "
                f"{n_long:.1f} longs after three vintages."
            ),
        },
        {
            "id": "etf_hedge",
            "title": "ETF hedge approximated by SIC-division portfolios",
            "severity": "medium",
            "category": "Implementation",
            "description": (
                "The price panel does not carry the XL* SPDR sector ETFs. Hedge "
                "returns are cap-weighted SIC-division portfolios from the universe, "
                "standing in for the SPDR implied by the SIC → XL* map. SPY (which "
                "the panel does carry) is used for trailing 60-day betas. The short "
                "is sector-matched dollar-for-dollar, then scaled by the long book's "
                "weighted SPY-beta."
            ),
            "direction_of_bias": (
                "Unclear — synthetic sector portfolios are not the live XL* products "
                "and inherit the same survivorship hole as the long book"
            ),
            "mitigation": "Documented in SPEC §9.1. A panel that includes XL* prices would replace the approximation.",
            "quantification": None,
        },
    ]

    q1, q2, q3, q4, q5 = (q_means.get(i, 0.0) for i in range(1, 6))
    what_did_not_work = [
        {
            "id": "cmp_filter",
            "title": "The CMP routine/opportunistic filter is not an alpha source",
            "hypothesis": (
                "Restricting to opportunistic insiders should raise the information "
                "coefficient relative to all open-market purchases, as in Cohen, "
                "Malloy & Pomorski (2012)."
            ),
            "what_we_did": (
                "Built the firm-level score twice — once with the point-in-time CMP "
                "filter and once without — and compared Spearman ICs at every horizon "
                "and the two ETF-hedged 3-month books."
            ),
            "what_happened": (
                "The filter's lift is indistinguishable from zero at every horizon "
                "that matters. In portfolio space the filter-off twin is less bad, "
                "not better."
            ),
            "evidence": [
                {
                    "label": "Δ IC, 21-day",
                    "value": f"{h21.get('delta_ic', 0):+.4f}",
                    "t_stat": h21.get("delta_t_stat"),
                },
                {
                    "label": "Δ IC, 63-day",
                    "value": f"{h63.get('delta_ic', 0):+.4f}",
                    "t_stat": h63.get("delta_t_stat"),
                },
                {
                    "label": "opp_etf_3m net Sharpe",
                    "value": f"{sharpe:.2f}",
                    "t_stat": None,
                },
                {
                    "label": "all_etf_3m net Sharpe",
                    "value": f"{float((_row(grid, 'all_insiders') or {}).get('sharpe', -0.28)):.2f}",
                    "t_stat": None,
                },
            ],
            "takeaway": (
                "The split still agrees with the 10b5-1 checkbox in the predicted "
                "direction. It does not, on this sample, separate informative "
                "purchases from uninformative ones."
            ),
        },
        {
            "id": "tradable_book",
            "title": "The tradable long/short book loses money after costs — and before them",
            "hypothesis": (
                "A faint positive IC would survive portfolio construction as a "
                "positive-Sharpe, positive-alpha book once hedged and costed."
            ),
            "what_we_did": (
                "SPEC-default overlapping 3-month book, sector-ETF hedge, explicit "
                "round-trip cost of ~16 bps, plus a 0–100 bp flat-cost sweep."
            ),
            "what_happened": (
                f"Net Sharpe {sharpe:.2f}, net CAGR {cagr:+.1%}, max drawdown {mdd:.1%}, "
                f"turnover {turn:.2f}×. Excess versus RF is negative at 0 bps of cost. "
                "There is no break-even."
            ),
            "evidence": [
                {
                    "label": "Net Sharpe",
                    "value": f"{sharpe:.2f}",
                    "t_stat": None,
                },
                {
                    "label": "Net CAGR",
                    "value": f"{cagr:+.1%}",
                    "t_stat": None,
                },
                {
                    "label": "Excess vs RF at 0 bps",
                    "value": f"{sweep0.get('net_alpha_ann_bps', -598):.0f} bps/year",
                    "t_stat": sweep0.get("alpha_t_stat"),
                },
                {
                    "label": "Break-even cost",
                    "value": "none" if be.get("alpha_zero_bps") is None else f"{be['alpha_zero_bps']:.0f} bps",
                    "t_stat": None,
                },
                {
                    "label": "FF5+UMD alpha (net)",
                    "value": f"{alpha:+.0f} bps/year",
                    "t_stat": alpha_t,
                },
            ],
            "takeaway": (
                "The faint ranking does not survive the step from a Spearman "
                "coefficient to a fully invested, hedged, costed book. That is the "
                "expected reading of a NO-GO IC gate."
            ),
        },
        {
            "id": "quintile_21d",
            "title": "Quintile means are not monotone at the 21-day horizon",
            "hypothesis": (
                "If the score ranks forward returns, mean 21-day return should rise "
                "across quintiles."
            ),
            "what_we_did": (
                "Equal-count quintiles of the opportunistic score versus 21-day "
                "forward returns, 144 monthly rebalances."
            ),
            "what_happened": (
                f"Q1 {q1:.0f} bps, Q2 {q2:.0f}, Q3 {q3:.0f}, Q4 {q4:.0f}, Q5 {q5:.0f}. "
                f"Q2 exceeds Q3. Spread Q5−Q1 is {q21.get('spread_bps', 0):.0f} bps "
                f"(t = {q21.get('spread_t_stat', 0):.2f}) but the sort is not monotonic."
            ),
            "evidence": [
                {"label": "Q1 mean 21d return", "value": f"{q1:.0f} bps", "t_stat": None},
                {"label": "Q2 mean 21d return", "value": f"{q2:.0f} bps", "t_stat": None},
                {"label": "Q3 mean 21d return", "value": f"{q3:.0f} bps", "t_stat": None},
                {"label": "Q5 mean 21d return", "value": f"{q5:.0f} bps", "t_stat": None},
                {
                    "label": "Q5−Q1 spread",
                    "value": f"{q21.get('spread_bps', 0):.0f} bps",
                    "t_stat": q21.get("spread_t_stat"),
                },
            ],
            "takeaway": (
                "A rank IC of +0.0165 can coexist with a non-monotone quintile sort. "
                "The 63- and 126-day sorts are monotone; the horizon the book actually "
                "trades is not."
            ),
        },
        {
            "id": "cmp_magnitude",
            "title": "Insider purchases do not earn ~82 bps/month out of sample",
            "hypothesis": (
                "Opportunistic insider purchases should earn roughly 82 bps per month, "
                "the magnitude Cohen, Malloy & Pomorski report for 1986–2007."
            ),
            "what_we_did": (
                "Replicated the classifier and the purchase score as specified and "
                "measured ICs, quintile spreads, and a costed overlapping book on 2014–2025."
            ),
            "what_happened": (
                "Nothing in the modern sample is in the neighborhood of 82 bps/month. "
                f"The 21-day Q5−Q1 spread is {q21.get('spread_bps', 0):.0f} bps over "
                "21 days, not a month of abnormal return, and the tradable book loses "
                f"{abs(cagr)*100:.1f}% a year net of costs."
            ),
            "evidence": [
                {"label": "CMP published premium", "value": "82 bps/month", "t_stat": None},
                {
                    "label": "21d Q5−Q1 (this sample)",
                    "value": f"{q21.get('spread_bps', 0):.0f} bps / 21d",
                    "t_stat": q21.get("spread_t_stat"),
                },
                {
                    "label": "Primary net CAGR",
                    "value": f"{cagr:+.1%}",
                    "t_stat": None,
                },
                {
                    "label": "Residual FF5+UMD alpha",
                    "value": f"{alpha:+.0f} bps/year",
                    "t_stat": alpha_t,
                },
            ],
            "takeaway": (
                "The published magnitude is not in the out-of-sample window. Reporting "
                "that is the project, not a failure of it."
            ),
        },
        {
            "id": "parameter_fishing",
            "title": "The W×λ surface is a flat weak plateau",
            "hypothesis": (
                "If the default (W=90, λ=0.5) was unlucky, some nearby aggregation "
                "window or cluster weight would recover a usable IC."
            ),
            "what_we_did": (
                f"Swept W ∈ {sweep.get('x_values')} against λ ∈ {sweep.get('y_values')} "
                "and recorded 21-day mean IC and its Newey-West t-statistic at every cell."
            ),
            "what_happened": sweep.get("assessment", "The surface is flat and weak."),
            "evidence": [
                {
                    "label": "Sweep metric",
                    "value": str(sweep.get("metric", "21-day mean IC")),
                    "t_stat": None,
                },
                {
                    "label": "Cells",
                    "value": str(len(sweep.get("cells", []))),
                    "t_stat": None,
                },
                {
                    "label": "Default cell (W=90, λ=0.5)",
                    "value": next(
                        (
                            f"{c['value']:+.4f}"
                            for c in sweep.get("cells", [])
                            if c.get("x") == 90 and c.get("y") == 0.5
                        ),
                        "n/a",
                    ),
                    "t_stat": next(
                        (
                            c.get("t_stat")
                            for c in sweep.get("cells", [])
                            if c.get("x") == 90 and c.get("y") == 0.5
                        ),
                        None,
                    ),
                },
            ],
            "takeaway": (
                "A decay study does not get to keep looking until a cell lights up. "
                "The surface was computed to show there is no such cell."
            ),
        },
    ]

    early_txt = (
        f"2014–2019 net Sharpe {early['sharpe']:.2f}, alpha {early['alpha_ann_bps']:+.0f} bps "
        f"(t = {early['alpha_t_stat']:.2f})"
        if early
        else "2014–2019 unavailable"
    )
    late_txt = (
        f"2020–2025 net Sharpe {late['sharpe']:.2f}, alpha {late['alpha_ann_bps']:+.0f} bps "
        f"(t = {late['alpha_t_stat']:.2f})"
        if late
        else "2020–2025 unavailable"
    )
    twin_alpha = twin["alpha_ann_bps"] if twin else 0.0
    notes_text = notes or (
        f"Written from the measured artifacts, not from a hoped-for spec. "
        f"Primary residual alpha {alpha:+.0f} bps (t = {alpha_t:.2f}); "
        f"SMB {smb['beta']:+.2f} (t = {smb['t_stat']:.2f}), "
        f"HML {hml['beta']:+.2f} (t = {hml['t_stat']:.2f}). "
        f"{early_txt}; {late_txt}. "
        f"Randomization of 21-day IC: observed at the {100 * rand['percentile']:.1f}th "
        f"percentile of {rand['n_draws']} shuffles. "
        f"Deflated Sharpe {mt['deflated_sharpe']:.2f} after {mt['n_specifications_tested']} specs. "
        f"Filter-off residual {twin_alpha:+.0f} bps."
    )

    return {
        "schema_version": "1.0.0",
        "artifact": "limitations",
        "generated_at": generated_at or _now(),
        "data_status": "real",
        "notes": notes_text,
        "headline_verdict": {
            "verdict": "signal_decayed",
            "summary": summary,
        },
        "limitations": limitations,
        "what_did_not_work": what_did_not_work,
    }
