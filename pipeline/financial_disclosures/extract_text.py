"""Text-extraction layer: the swappable part of the pipeline.

Per the architecture doc, Phase 2 (House OCR) reuses everything downstream of
this module -- only the function that turns a PDF into per-page words changes
(embedded text layer here; an OCR pass in Phase 2). Downstream code
(``columns.py``) only depends on the ``Word`` / ``PageWords`` shapes below,
never on how they were produced.
"""

from __future__ import annotations

from dataclasses import dataclass

import pdfplumber

SCANNED_CHAR_THRESHOLD = 50  # near-zero chars => no embedded text layer


@dataclass
class Word:
    text: str
    x0: float
    x1: float
    top: float


@dataclass
class PageWords:
    page_index: int
    width: float
    text: str  # raw extract_text(), for literal-phrase section detection
    words: list[Word]


@dataclass
class DocWords:
    pages: list[PageWords]
    total_chars: int

    @property
    def is_scanned(self) -> bool:
        return self.total_chars < SCANNED_CHAR_THRESHOLD


def extract_digital_text(pdf_path: str) -> DocWords:
    """Extraction method: ``digital_text`` -- pdfplumber's embedded text layer.

    This is the one function Phase 2 (OCR) would replace with an
    OCR-backed equivalent returning the same ``DocWords`` shape.
    """
    pages: list[PageWords] = []
    total_chars = 0
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            total_chars += len(text.strip())
            words = [
                Word(
                    text=w["text"],
                    x0=w["x0"],
                    x1=w["x1"],
                    top=w["top"],
                )
                for w in page.extract_words(use_text_flow=False, keep_blank_chars=False)
            ]
            pages.append(PageWords(page_index=i, width=float(page.width), text=text, words=words))
    return DocWords(pages=pages, total_chars=total_chars)
