"""Text-extraction layer (Phase 2): OCR-backed alternative to
``extract_text.extract_digital_text`` for scanned filings (no embedded text
layer -- ``parse_confidence: "unparseable_scanned"``).

Per the architecture doc, this module's only job is to produce the same
``DocWords`` shape (``Word``/``PageWords``/``DocWords`` from ``extract_text``)
so that ``columns.extract()`` runs completely unchanged on OCR'd pages. The
one thing this module must get right that the digital-text path doesn't have
to worry about: converting Tesseract's pixel-space word boxes back into the
same PDF point-space (72 points/inch) that ``pdfplumber`` reports, since
``columns.py``'s header-position detection and column x-range derivation
assume point-space geometry.

Design intent (see architecture doc): "the value-payload code should not need
to know whether its input text came from pdfplumber's text layer or an OCR
pass." Nothing in this module changes columns.py or bands.py.
"""

from __future__ import annotations

import gc
from dataclasses import dataclass

import pytesseract
from pdf2image import convert_from_path, pdfinfo_from_path
from PIL import Image

from extract_text import DocWords, PageWords, Word

# Rasterization DPI. Empirically verified against this dataset (see README's
# OCR section): at 300 DPI, Tesseract reliably misreads the small header text
# these forms use for column labels -- e.g. "Value of Asset" -> "Value of
# Asnot" on a real 2015 filing (Vern Buchanan, doc 9109482), which breaks
# columns.py's literal header-word matching even though the value cells
# themselves OCR fine. At 400 DPI the same page's header reads correctly.
# 400 is the sweet spot: high enough for the small printed table/header text
# on these government forms, without the much larger time cost of 600+.
# PDF points are always 72/inch, so the pixel->point conversion factor is
# 72.0 / OCR_DPI.
OCR_DPI = 400
_POINTS_PER_PIXEL = 72.0 / OCR_DPI

# Tesseract's image_to_data() gives a 0-100 confidence per recognized word
# (-1 for non-word layout blocks, e.g. line/block separators, which we skip).
# Below this, a word is dropped from the geometry-bearing `words` list used
# for column-position/band-string matching -- consistent with this pipeline's
# "flag rather than guess" philosophy (see columns.py's module docstring):
# a low-confidence misread token (e.g. "$1O0,0OO" for "$100,000") would
# silently corrupt band counting rather than just being absent from it.
# Chosen empirically against the sanity-check sample (see README's OCR
# section): 90%+ of words on clean scans land above 60; below that, error
# rate rises sharply on this document type (small serif text, tables).
MIN_WORD_CONFIDENCE = 60

# Page-level average confidence (over words that pass MIN_WORD_CONFIDENCE)
# below this marks the whole document worth flagging as low-confidence OCR
# (`parse_confidence: "ocr_low_confidence"`) rather than trusting its band
# counts at the same level as a clean OCR read or a digital-text extraction.
DOC_LOW_CONFIDENCE_THRESHOLD = 75

# Hard cap on pages OCR'd per document. `convert_from_path` used to be called
# with no first_page/last_page, which rasterizes the WHOLE document into a
# list of full-resolution PIL images before any processing starts -- at
# OCR_DPI=400 a letter page is ~45MB uncompressed, so a real filing in this
# dataset (Khanna's 2024 annual report: 333 image-only pages) blew up to
# ~15GB for that one document, and with several such filings landing on
# different worker processes at once, the machine hit 88GB and died. Two
# fixes: (1) extract_ocr_text now rasterizes one page at a time and discards
# each image before moving to the next, so memory no longer scales with
# page count; (2) this cap is a belt-and-suspenders guard -- a filing this
# long is itself an outlier worth a human look (e.g. a scanned brokerage
# statement dump) rather than a 300-page Tesseract run, so it's flagged
# `ocr_skipped_oversized` instead of processed.
MAX_OCR_PAGES = 60


@dataclass
class OcrDocWords(DocWords):
    """Same shape as ``DocWords`` plus OCR-specific confidence metadata that
    ``build_ocr.py`` needs to decide ``parse_confidence`` -- kept off the base
    ``DocWords``/``PageWords``/``Word`` dataclasses so ``columns.py`` (which
    only reads ``pages``/``total_chars``/``text``/``words``/``x0``/``x1``/
    ``top``) never has to know this field exists.
    """

    mean_word_confidence: float = 0.0
    low_confidence_word_count: int = 0
    total_word_count: int = 0
    oversized: bool = False
    page_count: int = 0


def _deskew_orientation(image: Image.Image) -> Image.Image:
    """Correct whole-page 90/180/270-degree rotation before OCR.

    Confirmed on real filings (e.g. Vern Buchanan's 2015 filing, doc
    9109482): the Clerk's scanner sometimes captures a landscape-oriented
    physical page into a portrait-oriented PDF page, so the *image content*
    is sideways even though the PDF page itself reports no `/Rotate` (the
    page is genuinely just a raster image with no such metadata to read).
    Left uncorrected, this doesn't just garble the text -- it transposes
    word x/y geometry, which would corrupt every downstream column-position
    calculation in columns.py silently rather than obviously. Tesseract's
    own OSD (orientation and script detection) reads this correctly even at
    low confidence (observed ~4 on real samples -- OSD confidence is
    calibrated differently than word confidence and stays low on these
    forms even when the rotation call itself is correct), so the *presence*
    of a detected non-zero rotation is trusted; only a failure to run OSD at
    all (e.g. a near-blank page) falls back to leaving the page unrotated.
    """
    try:
        osd = pytesseract.image_to_osd(image, output_type=pytesseract.Output.DICT)
    except pytesseract.TesseractError:
        return image
    rotate = osd.get("rotate", 0) or 0
    if rotate % 360 == 0:
        return image
    # Tesseract's `rotate` is the clockwise correction angle; PIL's
    # Image.rotate() turns counter-clockwise for a positive angle, so the
    # sign flips. expand=True keeps the full rotated canvas (dimensions
    # swap for a 90/270 correction) rather than cropping to the original box.
    return image.rotate(-rotate, expand=True)


def extract_ocr_text(pdf_path: str, dpi: int = OCR_DPI) -> OcrDocWords:
    """Extraction method: ``ocr`` -- rasterize each page and run Tesseract.

    Returns the same ``DocWords`` shape ``extract_digital_text`` does (as an
    ``OcrDocWords``, a strict superset), so ``columns.extract()`` runs
    unchanged. Word pixel boxes from ``pytesseract.image_to_data`` are
    converted to PDF point-space via ``72.0 / dpi`` -- the same scale factor
    used to rasterize, so this is an exact inverse, not an approximation.

    Rasterizes and OCRs ONE page at a time (via `first_page`/`last_page`,
    not a bare `convert_from_path(pdf_path, dpi=dpi)`) so peak memory stays
    roughly constant regardless of document length -- see MAX_OCR_PAGES'
    docstring for why this matters on this dataset.
    """
    page_count = pdfinfo_from_path(pdf_path).get("Pages", 0)
    if page_count > MAX_OCR_PAGES:
        return OcrDocWords(pages=[], total_chars=0, oversized=True, page_count=page_count)

    pages: list[PageWords] = []
    total_chars = 0
    conf_sum = 0.0
    conf_n = 0
    low_conf_n = 0
    scale = 72.0 / dpi

    for i in range(page_count):
        page_num = i + 1  # convert_from_path's first_page/last_page are 1-indexed
        raw_image = convert_from_path(pdf_path, dpi=dpi, first_page=page_num, last_page=page_num)[0]
        image = _deskew_orientation(raw_image)
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        n = len(data["text"])
        words: list[Word] = []
        page_text_parts: list[str] = []

        for j in range(n):
            raw_text = data["text"][j]
            text = raw_text.strip()
            if not text:
                continue
            try:
                conf = float(data["conf"][j])
            except (TypeError, ValueError):
                conf = -1.0
            if conf < 0:
                # Tesseract emits conf=-1 for structural (non-word) rows in
                # image_to_data's flat table -- not a low-confidence word,
                # just not a word at all. Skip, don't count against the doc.
                continue

            # Full-page text (for columns.py's literal-phrase page
            # classification, e.g. "Value of Asset") includes every
            # recognized word regardless of confidence -- a low-confidence
            # header word is still useful for "is this an asset-schedule
            # page", even if it's excluded from the word-geometry list used
            # for column position + band counting below.
            page_text_parts.append(text)

            conf_sum += conf
            conf_n += 1
            if conf < MIN_WORD_CONFIDENCE:
                low_conf_n += 1
                continue

            left = float(data["left"][j])
            top = float(data["top"][j])
            width = float(data["width"][j])

            words.append(
                Word(
                    text=text,
                    x0=left * scale,
                    x1=(left + width) * scale,
                    top=top * scale,
                )
            )

        page_text = " ".join(page_text_parts)
        total_chars += len(page_text.strip())
        page_width_pts = image.width * scale
        pages.append(PageWords(page_index=i, width=page_width_pts, text=page_text, words=words))

        # Drop the raster images now, rather than waiting for the whole
        # `for` loop (and its full pages list) to go out of scope -- this is
        # the crux of the memory fix, so don't let `raw_image`/`image` linger
        # across iterations. `pytesseract.image_to_data` above already holds
        # its own reference to the pixel data via a temp file, not `image`.
        del data, image, raw_image
        gc.collect()

    mean_conf = (conf_sum / conf_n) if conf_n else 0.0

    return OcrDocWords(
        pages=pages,
        total_chars=total_chars,
        mean_word_confidence=mean_conf,
        low_confidence_word_count=low_conf_n,
        total_word_count=conf_n,
    )
