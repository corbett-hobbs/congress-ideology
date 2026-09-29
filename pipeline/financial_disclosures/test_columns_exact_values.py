"""Regression tests for columns._find_exact_values -- run with
`./.venv/bin/python -m unittest test_columns_exact_values`."""

import unittest

from columns import _find_exact_values


class ExactValueTests(unittest.TestCase):
    def test_genuine_exact_figure_is_kept(self):
        self.assertEqual(_find_exact_values("Checking $20,140", {}), {"$20,140": 1})

    def test_legend_upper_bounds_are_rejected(self):
        # Mike Rogers 2013 (doc 9102988): OCR dropped the dashes of the printed
        # tier legend, leaving each range's upper bound as a lone "figure".
        text = "$250,000 $100,000 $100,000 $50,000,000 $50,000,000 $25,000,000 $500,000"
        self.assertEqual(_find_exact_values(text, {}), {})

    def test_legend_lower_bounds_are_rejected(self):
        self.assertEqual(_find_exact_values("$15,001 $50,001 $1,001", {}), {})

    def test_sub_reportable_fragments_are_rejected(self):
        self.assertEqual(_find_exact_values("$15 $29 $50 $65 $250 $700", {}), {})

    def test_still_ignored_when_bands_matched(self):
        self.assertEqual(_find_exact_values("$20,140", {"$1,001 - $15,000": 1}), {})


if __name__ == "__main__":
    unittest.main()
