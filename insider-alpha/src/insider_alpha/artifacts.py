"""Validate-then-write for the dashboard artifact contract.

The JSON files in ``artifacts/`` are the only interface the Next.js dashboard
reads. Schemas set ``additionalProperties: false``, so an unexpected key is a
build error rather than a silent drop. Validating before the write is what
keeps a bad payload from reaching Vercel.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from insider_alpha.config import ARTIFACTS

log = logging.getLogger(__name__)


def _to_builtin(obj: Any) -> Any:
    """Convert numpy/pandas scalars so ``json.dumps(..., allow_nan=False)`` succeeds."""
    if isinstance(obj, dict):
        return {k: _to_builtin(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_builtin(v) for v in obj]
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        value = float(obj)
        if not math.isfinite(value):
            raise ValueError(f"non-finite float cannot be serialized: {value}")
        return value
    if isinstance(obj, pd.Timestamp):
        return str(obj.date())
    if isinstance(obj, float) and not math.isfinite(obj):
        raise ValueError(f"non-finite float cannot be serialized: {obj}")
    return obj


def write_artifact(name: str, payload: dict) -> Path:
    """Validate against the matching schema and write ``artifacts/{name}.json``."""
    schema_path = ARTIFACTS / "schema" / f"{name}.schema.json"
    schema = json.loads(schema_path.read_text())
    clean = _to_builtin(payload)

    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:
        log.warning("jsonschema is not installed; writing %s.json without schema validation", name)
    else:
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(clean)

    path = ARTIFACTS / f"{name}.json"
    path.write_text(json.dumps(clean, indent=2, allow_nan=False) + "\n")
    log.info("wrote %s (%s)", path.name, clean.get("data_status", "?"))
    return path


def merge_pipeline_stage(
    milestone: int,
    *,
    status: str,
    artifact: str | None = None,
) -> None:
    """Update one ``pipeline_stages`` row in ``meta.json`` without touching other fields.

    A previous run lost real classifier data by rewriting sibling artifacts; this
    only patches the matching milestone entry.
    """
    path = ARTIFACTS / "meta.json"
    if not path.exists():
        log.warning("meta.json missing; skipping pipeline_stages merge")
        return
    payload = json.loads(path.read_text())
    stages = payload.get("pipeline_stages")
    if not isinstance(stages, list):
        log.warning("meta.json has no pipeline_stages; skipping merge")
        return
    found = False
    for stage in stages:
        if stage.get("milestone") == milestone:
            stage["status"] = status
            if artifact is not None:
                stage["artifact"] = artifact
            found = True
            break
    if not found:
        log.warning("meta.json has no milestone %d row; skipping merge", milestone)
        return
    write_artifact("meta", payload)
