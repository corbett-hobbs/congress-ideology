"""Empirical check: does `disclosure-extractor` handle a House Clerk FD PDF?

`disclosure-extractor` (freelawproject, BSD-2) was built for the federal
judiciary's AO-10 "Financial Disclosure Report". This probe runs each of its
entry points against a real House Annual Report and records what happens, so the
evaluation in docs/HOUSE_DISCLOSURE_EXTRACTOR_EVAL.md rests on observed output
rather than assumption.

Run:  python probe_disclosure_extractor.py <path-to-house-fd.pdf> [...]
"""

from __future__ import annotations

import json
import sys
import traceback

import disclosure_extractor as de


def _try(label, fn):
    try:
        out = fn()
        summary = out
        if isinstance(out, dict):
            summary = {k: out[k] for k in ("success", "msg", "checkbox_count_found")
                       if k in out}
            if "sections" in out:
                summary["section_keys"] = list(out["sections"].keys())
                summary["rows_per_section"] = {
                    k: len(v.get("rows", []) or []) for k, v in out["sections"].items()}
            if "wealth" in out:
                summary["wealth"] = out["wealth"]
        return {"entry_point": label, "result": summary}
    except Exception as e:  # noqa: BLE001 - we want every failure mode
        return {"entry_point": label, "error": f"{type(e).__name__}: {e}",
                "trace": traceback.format_exc().splitlines()[-3:]}


def probe(path: str) -> dict:
    checks = [
        ("extract_content (JEF text path)", lambda: de.jef.extraction.extract_content(path)),
        ("extract_normal_pdf (JEF text path)", lambda: de.jef.extraction.extract_normal_pdf(path)),
        ("process_jef_document", lambda: de.process_jef_document(path)),
        # image path -- needs poppler; will raise if unavailable
        ("process_financial_document (image/checkbox path)",
         lambda: de.process_financial_document(file_path=path)),
    ]
    return {"pdf": path, "checks": [_try(lbl, fn) for lbl, fn in checks]}


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(probe(p), indent=2, default=str))
