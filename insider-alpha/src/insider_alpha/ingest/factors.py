"""Fama-French 5 factors plus momentum from the Ken French Data Library.

Needed for the risk attribution in SPEC.md 11: the interesting question about an insider
signal is not whether it makes money but whether what is left after MKT, SMB, HML, RMW,
CMA and UMD is distinguishable from zero. Insider buying loads naturally on size and
value, so having the factor returns on hand from Milestone 2 keeps that regression from
being an afterthought.

The library ships zipped CSVs with a prose preamble, a data block, and — in the monthly
files — a second annual block below the monthly one. Both quirks are handled by locating
the header row and cutting at the first non-date row rather than by hard-coded skiprows,
which would break the next time Ken French edits the citation blurb.

Returns are published in percent and converted to decimals here, so every downstream
consumer works in the same units as the strategy returns.
"""

from __future__ import annotations

import io
import logging
import zipfile
from pathlib import Path

import pandas as pd
import requests

from insider_alpha.config import DATA_RAW, SEC_USER_AGENT
from insider_alpha.utils import with_columns

log = logging.getLogger(__name__)

_BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp"

_DATASETS = {
    ("ff5", "monthly"): "F-F_Research_Data_5_Factors_2x3_CSV.zip",
    ("ff5", "daily"): "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip",
    ("umd", "monthly"): "F-F_Momentum_Factor_CSV.zip",
    ("umd", "daily"): "F-F_Momentum_Factor_daily_CSV.zip",
}

_FF5_COLUMNS = ["mkt_rf", "smb", "hml", "rmw", "cma", "rf"]


def _download(name: str, *, cache_dir: Path | None = None, force: bool = False) -> Path:
    cache_dir = cache_dir or (DATA_RAW / "factors")
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / name

    if path.exists() and not force:
        return path

    url = f"{_BASE}/{name}"
    response = requests.get(url, headers={"User-Agent": SEC_USER_AGENT}, timeout=120)
    response.raise_for_status()
    path.write_bytes(response.content)
    log.info("downloaded %s (%.0f KB)", name, path.stat().st_size / 1e3)
    return path


def _parse_french_csv(text: str, *, frequency: str) -> pd.DataFrame:
    """Pull the first data block out of a Ken French CSV.

    Monthly files are keyed ``YYYYMM`` and are followed by an annual block keyed
    ``YYYY``; daily files are keyed ``YYYYMMDD``. Rows are accumulated only while the
    first field keeps the expected width, which ends the block at the blank line before
    the annual section without needing to know how long either section is.
    """
    width = 8 if frequency == "daily" else 6
    lines = text.splitlines()

    header_idx = None
    for i, line in enumerate(lines):
        fields = [f.strip() for f in line.split(",")]
        if len(fields) > 1 and fields[0] == "" and any(f for f in fields[1:]):
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("no header row found in Ken French CSV")

    header = [f.strip() for f in lines[header_idx].split(",")]
    records: list[list[str]] = []
    for line in lines[header_idx + 1 :]:
        fields = [f.strip() for f in line.split(",")]
        key = fields[0]
        if not (len(key) == width and key.isdigit()):
            if records:
                break
            continue
        records.append(fields)

    frame = pd.DataFrame(records, columns=header)
    date_format = "%Y%m%d" if frequency == "daily" else "%Y%m"
    dates = pd.to_datetime(frame[header[0]], format=date_format)

    values = frame.drop(columns=[header[0]]).apply(pd.to_numeric, errors="coerce") / 100.0
    values.columns = [
        c.strip().lower().replace("-", "_").replace(" ", "_") for c in values.columns
    ]
    return with_columns(values, date=dates).set_index("date").sort_index()


def _load_dataset(key: tuple[str, str], *, force: bool = False) -> pd.DataFrame:
    name = _DATASETS[key]
    path = _download(name, force=force)
    with zipfile.ZipFile(path) as archive:
        member = next(m for m in archive.namelist() if m.lower().endswith(".csv"))
        raw = archive.read(member)
    text = io.BytesIO(raw).read().decode("latin-1")
    return _parse_french_csv(text, frequency=key[1])


def load_factors(frequency: str = "monthly", *, force: bool = False) -> pd.DataFrame:
    """FF5 plus UMD at the requested frequency, indexed by date, in decimal returns.

    Momentum ships as a separate file and starts later than the five-factor set; it is
    joined rather than merged inner so the early rows survive with a null UMD instead of
    silently truncating the sample.
    """
    if frequency not in ("monthly", "daily"):
        raise ValueError(f"frequency must be 'monthly' or 'daily', got {frequency!r}")

    ff5 = _load_dataset(("ff5", frequency), force=force)
    ff5.columns = _FF5_COLUMNS[: len(ff5.columns)]

    umd = _load_dataset(("umd", frequency), force=force)
    umd.columns = ["umd"][: len(umd.columns)]

    joined = ff5.join(umd, how="left")

    # Monthly observations are stamped at the first of the month by the YYYYMM key;
    # move them to month end so a join against a month-end portfolio return lines up.
    if frequency == "monthly":
        joined.index = joined.index + pd.offsets.MonthEnd(0)

    log.info(
        "factors (%s): %d rows, %s to %s",
        frequency, len(joined), joined.index.min().date(), joined.index.max().date(),
    )
    return joined
