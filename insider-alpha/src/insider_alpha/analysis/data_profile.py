"""Descriptive statistics on the parsed Form 4 table (milestone 1 leftover)."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from insider_alpha.config import CODE_OPEN_MARKET_BUY, TRANSACTION_CODE_LABELS
from insider_alpha.utils import with_columns

# Amendment dedup has already been applied to the committed trade table.
# SPEC §5.2 measured 59,480 superseded rows removed of ~4.55M.
SUPERSEDED_ROWS_REMOVED = 59_480


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _business_day_lag(transaction: pd.Series, filing: pd.Series) -> np.ndarray:
    """Weekday count from transaction date to filing date, floored at zero."""
    start = pd.to_datetime(transaction).to_numpy(dtype="datetime64[D]")
    end = pd.to_datetime(filing).to_numpy(dtype="datetime64[D]")
    lag = np.busday_count(start, end).astype("int64")
    return np.maximum(lag, 0)


def build_data_profile_artifact(
    trades: pd.DataFrame,
    *,
    notes: str | None = None,
    generated_at: str | None = None,
) -> dict[str, object]:
    """Build ``data_profile.json`` from ``insider_trades.parquet``."""
    n = len(trades)
    purchases = trades[trades["transaction_code"].eq(CODE_OPEN_MARKET_BUY)]
    price = pd.to_numeric(purchases["price_per_share"], errors="coerce")
    dropped_missing_price = int((~price.gt(0)).sum())

    code_counts = trades["transaction_code"].astype(str).value_counts()
    transaction_codes = []
    for code, count in code_counts.items():
        code = str(code)
        if not code or len(code) > 2:
            continue
        transaction_codes.append(
            {
                "code": code,
                "label": TRANSACTION_CODE_LABELS.get(code, f"Code {code}"),
                "count": int(count),
                "share": float(count / n) if n else 0.0,
                "included_in_signal": code == CODE_OPEN_MARKET_BUY,
            }
        )
    transaction_codes.sort(key=lambda row: row["count"], reverse=True)

    purch = purchases.copy()
    value = pd.to_numeric(purch["dollar_value"], errors="coerce")
    fallback = pd.to_numeric(purch["shares"], errors="coerce") * pd.to_numeric(
        purch["price_per_share"], errors="coerce"
    )
    value = value.where(value.gt(0), fallback)
    purch = with_columns(purch, trade_value=value)
    purch = with_columns(
        purch, month=pd.to_datetime(purch["filing_date"]).dt.strftime("%Y-%m")
    )
    density_rows = []
    if not purch.empty:
        grouped = purch.groupby("month", sort=True)
        for month, grp in grouped:
            vals = pd.to_numeric(grp["trade_value"], errors="coerce")
            vals = vals[vals.gt(0)]
            density_rows.append(
                {
                    "month": str(month),
                    "qualifying_purchases": int(len(grp)),
                    "distinct_issuers": int(grp["issuer_cik"].nunique()),
                    "distinct_insiders": int(grp["owner_cik"].nunique()),
                    "median_trade_value_usd": float(vals.median()) if len(vals) else 0.0,
                }
            )

    lag = _business_day_lag(purchases["transaction_date"], purchases["filing_date"])
    n_p = int(lag.size)
    hist = []
    if n_p:
        for days in range(0, 11):
            count = int((lag == days).sum())
            hist.append({"lag_days": days, "count": count, "share": float(count / n_p)})
        tail = int((lag >= 11).sum())
        hist.append({"lag_days": 30, "count": tail, "share": float(tail / n_p)})
        median_days = float(np.median(lag))
        mean_days = float(np.mean(lag))
        p95_days = float(np.quantile(lag, 0.95))
        within = float(np.mean(lag <= 2))
    else:
        median_days = mean_days = p95_days = within = 0.0
    flagged = (
        float(purchases["is_late_filing"].fillna(False).mean()) if n_p else 0.0
    )

    vals = pd.to_numeric(purch["trade_value"], errors="coerce") if not purch.empty else pd.Series(dtype=float)
    vals = vals[vals.gt(0)]
    if vals.empty:
        trade_value = {"p25": 0.0, "median": 0.0, "mean": 0.0, "p75": 0.0, "p95": 0.0}
    else:
        trade_value = {
            "p25": float(vals.quantile(0.25)),
            "median": float(vals.median()),
            "mean": float(vals.mean()),
            "p75": float(vals.quantile(0.75)),
            "p95": float(vals.quantile(0.95)),
        }

    indirect = trades["is_indirect"].fillna(False).astype(bool)
    filings = trades.drop_duplicates("accession")
    multi = filings["n_reporting_owners"].gt(1)
    n_filings = int(len(filings))

    return {
        "schema_version": "1.0.0",
        "artifact": "data_profile",
        "generated_at": generated_at or _now(),
        "data_status": "real",
        "notes": notes,
        "coverage": {
            "start": pd.Timestamp(trades["filing_date"].min()).strftime("%Y-%m-%d"),
            "end": pd.Timestamp(trades["filing_date"].max()).strftime("%Y-%m-%d"),
        },
        "totals": {
            "transactions": int(n),
            "filings": n_filings,
            "distinct_issuers": int(trades["issuer_cik"].nunique()),
            "distinct_insiders": int(trades["owner_cik"].nunique()),
            "open_market_purchases": int(len(purchases)),
            "superseded_rows_removed": SUPERSEDED_ROWS_REMOVED,
            "dropped_missing_price": dropped_missing_price,
        },
        "transaction_codes": transaction_codes,
        "event_density": density_rows,
        "filing_lag": {
            "histogram": hist,
            "median_days": median_days,
            "mean_days": mean_days,
            "p95_days": p95_days,
            "share_within_statutory_window": within,
            "share_flagged_late": flagged,
        },
        "trade_value_usd": trade_value,
        "ownership": {
            "direct_count": int((~indirect).sum()),
            "indirect_count": int(indirect.sum()),
            "indirect_share": float(indirect.mean()) if n else 0.0,
        },
        "joint_filings": {
            "filings_with_multiple_owners": int(multi.sum()),
            "share": float(multi.mean()) if n_filings else 0.0,
        },
        "schema_drift_notes": [
            "AFF10B5ONE is absent from DERA archives 2011Q1–2022Q4 and present from 2023Q1 onward, matching the effective date of the 2022 Rule 10b5-1 amendments. Requested columns are treated as optional and absent ones filled with nulls.",
            "The committed trade table is post-dedup; superseded_rows_removed is the SPEC §5.2 count of 59,480 originals dropped when a later Form 4/A restated the same (owner, issuer, date, code, security).",
            "Purchases filed without a usable price remain in the table and are dropped at signal construction rather than imputed (SPEC 5.2).",
            "DERA's late-filing flag is unpopulated in this extract (share_flagged_late = 0). The statutory-window share uses computed business-day lag from transaction date to filing date.",
        ],
    }
