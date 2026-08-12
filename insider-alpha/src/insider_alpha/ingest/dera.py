"""Download SEC DERA quarterly Insider Transactions Data Sets.

The SEC publishes the XML-derived contents of every Form 3/4/5 filing as quarterly
tab-delimited bulk archives going back to 2006Q1. Each archive is roughly 8-16 MB.

This matters enormously for feasibility: fetching Form 4 filings individually from
EDGAR would mean millions of requests against a 10 requests/second ceiling — days of
continuous downloading. The bulk archives cover the same ground in ~60 requests.

Source: https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import requests

from insider_alpha.config import DATA_RAW, SEC_USER_AGENT

log = logging.getLogger(__name__)

# The SEC has relocated this dataset between directories over time and has not
# backfilled the old paths, so recent quarters and historical quarters live under
# different prefixes. Try each in order.
_BASE_PATHS = (
    "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets",
    "https://www.sec.gov/files/datastandardsinnovation/data/insider-transactions-data-sets",
    "https://www.sec.gov/files/node/add/data_distribution/insider-transactions-data-sets",
)

_REQUEST_HEADERS = {
    "User-Agent": SEC_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
}

# Well under the 10 req/s ceiling. These are large files fetched a few dozen times,
# so throughput is bound by bandwidth rather than request count.
_SLEEP_BETWEEN_REQUESTS = 0.5
_MAX_RETRIES = 4


@dataclass(frozen=True)
class Quarter:
    year: int
    quarter: int

    def __str__(self) -> str:
        return f"{self.year}Q{self.quarter}"

    @property
    def filename(self) -> str:
        return f"{self.year}q{self.quarter}_form345.zip"


def quarters_between(start_year: int, end_year: int) -> list[Quarter]:
    """Every quarter from start_year Q1 through end_year Q4, inclusive."""
    return [Quarter(y, q) for y in range(start_year, end_year + 1) for q in (1, 2, 3, 4)]


def _get_with_retry(url: str, *, timeout: int = 120) -> requests.Response | None:
    """GET with exponential backoff. Returns None on a definitive 404."""
    delay = 1.0
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = requests.get(url, headers=_REQUEST_HEADERS, timeout=timeout)
        except requests.RequestException as exc:
            log.warning("request error for %s (attempt %d): %s", url, attempt, exc)
            time.sleep(delay)
            delay *= 2
            continue

        if response.status_code == 200:
            return response
        if response.status_code == 404:
            return None
        # 403 here usually means rate limiting rather than true forbidden.
        log.warning("HTTP %d for %s (attempt %d)", response.status_code, url, attempt)
        time.sleep(delay)
        delay *= 2

    return None


def download_quarter(quarter: Quarter, *, dest_dir: Path | None = None, force: bool = False) -> Path | None:
    """Download one quarterly archive, skipping the fetch if already cached.

    Returns the local path, or None if the SEC has not published that quarter.
    """
    dest_dir = dest_dir or (DATA_RAW / "dera")
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / quarter.filename

    if target.exists() and not force:
        log.info("%s already cached (%.1f MB)", quarter, target.stat().st_size / 1e6)
        return target

    for base in _BASE_PATHS:
        url = f"{base}/{quarter.filename}"
        response = _get_with_retry(url)
        time.sleep(_SLEEP_BETWEEN_REQUESTS)
        if response is None:
            continue

        # Write to a temp file first so an interrupted download never leaves a
        # truncated archive that looks cached on the next run.
        tmp = target.with_suffix(".zip.partial")
        tmp.write_bytes(response.content)
        tmp.replace(target)
        log.info("downloaded %s (%.1f MB)", quarter, target.stat().st_size / 1e6)
        return target

    log.warning("%s not available at any known SEC path", quarter)
    return None


def download_range(
    start_year: int,
    end_year: int,
    *,
    dest_dir: Path | None = None,
    force: bool = False,
) -> list[Path]:
    """Download every published quarterly archive in the range."""
    paths: list[Path] = []
    for quarter in quarters_between(start_year, end_year):
        path = download_quarter(quarter, dest_dir=dest_dir, force=force)
        if path is not None:
            paths.append(path)
    return paths
