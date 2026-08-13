"""Cross-checks of reconstructed prices against an independent observation.

The price panel is split-adjusted data run backwards through the vendor's own split
history, which only reproduces the traded price if that history is complete. For names
that have been through repeated reverse splits it is not: Cenntro Electric's
reconstructed price for January 2022 comes out at $132 against a market that was paying
about $3, and multiplied by its share count that is a $253 billion company sitting in
the top ten of the universe.

Form 4 is the check. Every open-market insider transaction reports the price per share
actually paid, filed with the SEC within two business days, unadjusted and independent
of any market data vendor. Matching those against the panel on the same day turns an
untestable assumption into a measurement.
"""

from __future__ import annotations

import logging

import pandas as pd

from insider_alpha.ingest.reference import cik_for_ticker_at
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

# Insider transactions happen at prices that are close to, but not identical to, the
# close: an open-market sale executes intraday, and a few percent of drift is normal.
# The band only needs to be tight enough to catch a missing split, and the smallest
# split anyone does is 2:1.
AGREEMENT_TOLERANCE = 2.0

# One insider print can be a wrong-way keying error or an off-market transfer, so an
# issuer needs a few before its disagreement means anything.
MIN_MATCHES = 5


def price_agreement(
    prices: pd.DataFrame, trades: pd.DataFrame, pit_map: pd.DataFrame
) -> pd.DataFrame:
    """Per-ticker agreement between reconstructed closes and Form 4 trade prices.

    Returns one row per ticker with ``n_matches``, the ``median_ratio`` of the
    reconstructed close to the reported transaction price, and ``agrees``.

    The comparison runs through the point-in-time ticker map first. A filer reports the
    symbol as they know it, and when a symbol has changed hands the trade belongs to one
    company while the price series belongs to another; comparing those measures a
    reassigned ticker rather than a broken price.
    """
    priced = trades[
        trades["price_per_share"].between(0.10, 1e5) & trades["transaction_date"].notna()
    ]
    owner = cik_for_ticker_at(
        pit_map,
        pd.DataFrame(
            {"ticker": priced["ticker"], "date": priced["transaction_date"]},
            index=priced.index,
        ),
    )
    priced = priced[owner.eq(priced["issuer_cik"]).fillna(False)]

    matched = priced.merge(
        prices[["date", "ticker", "close_raw"]],
        left_on=["ticker", "transaction_date"],
        right_on=["ticker", "date"],
        how="inner",
    )
    if matched.empty:
        return pd.DataFrame(columns=["ticker", "n_matches", "median_ratio", "agrees"])

    matched = with_columns(matched, ratio=matched["close_raw"] / matched["price_per_share"])
    stats = matched.groupby("ticker")["ratio"].agg(["size", "median"])
    stats.columns = ["n_matches", "median_ratio"]

    within = stats["median_ratio"].between(1 / AGREEMENT_TOLERANCE, AGREEMENT_TOLERANCE)
    # An issuer with too few prints is not judged: absence of evidence is not evidence
    # that the reconstruction is broken, and excluding on it would throw away good names.
    stats = with_columns(stats, agrees=within | stats["n_matches"].lt(MIN_MATCHES))
    return stats.reset_index()


# A stock that moves five-fold between two consecutive sessions has almost always had a
# corporate action, not a repricing. Legitimate one-day moves of that size exist — a
# small biotech on trial results — but they are rare enough that dropping them costs
# little against the alternative of a mispriced name near the top of the ranking.
MAX_OVERNIGHT_RATIO = 5.0

# Only consecutive sessions count. A name that stops printing for a year and comes back
# at a different price has not necessarily had a split.
MAX_GAP_DAYS = 5


def unexplained_jumps(prices: pd.DataFrame) -> set[str]:
    """Tickers whose reconstructed price jumps by a factor no recorded split explains.

    The test runs on the vendor's split-adjusted ``close``, not on the reconstructed
    raw price. A recorded split leaves the adjusted series continuous while the raw
    series steps by the split ratio exactly as it should, so testing the raw series
    flags every genuine split — Apple's 4-for-1 among them — and empties the universe
    of its largest members. A jump that survives in the adjusted series is one the
    vendor never recorded. Cenntro Electric moves one hundred-fold overnight in January
    2022, which is how a company worth a few hundred million entered the universe
    ranked twelfth by market cap.
    """
    frame = prices.sort_values(["ticker", "date"])
    prev_close = frame.groupby("ticker", sort=False)["close"].shift(1)
    gap_days = frame.groupby("ticker", sort=False)["date"].diff().dt.days

    ratio = frame["close"] / prev_close
    jumped = (
        (ratio.gt(MAX_OVERNIGHT_RATIO) | ratio.lt(1 / MAX_OVERNIGHT_RATIO))
        & gap_days.le(MAX_GAP_DAYS)
    )
    return set(frame.loc[jumped, "ticker"].unique())


def unreliable_tickers(agreement: pd.DataFrame) -> set[str]:
    """Tickers whose reconstructed prices are contradicted by insider transactions."""
    if agreement.empty:
        return set()
    return set(agreement.loc[~agreement["agrees"], "ticker"])


def verified_tickers(agreement: pd.DataFrame) -> set[str]:
    """Tickers whose prices are confirmed by enough independent insider transactions.

    These outrank the jump heuristic. A name can genuinely move five-fold overnight,
    and when insiders have been trading it at the panel's prices all along there is
    direct evidence the series is sound.
    """
    if agreement.empty:
        return set()
    confirmed = agreement["agrees"] & agreement["n_matches"].ge(MIN_MATCHES)
    return set(agreement.loc[confirmed, "ticker"])


def agreement_report(agreement: pd.DataFrame) -> pd.DataFrame:
    """Headline counts for the price cross-check, for the milestone write-up."""
    if agreement.empty:
        return pd.DataFrame()
    tested = agreement[agreement["n_matches"] >= MIN_MATCHES]
    failed = tested[~tested["agrees"]]
    return pd.DataFrame(
        [
            {
                "tickers_with_form4_prices": len(agreement),
                "tickers_testable": len(tested),
                "tickers_disagreeing": len(failed),
                "pct_disagreeing": round(100 * len(failed) / max(1, len(tested)), 2),
                "median_abs_deviation_pct": round(
                    100 * (tested["median_ratio"] - 1).abs().median(), 2
                ),
            }
        ]
    )
