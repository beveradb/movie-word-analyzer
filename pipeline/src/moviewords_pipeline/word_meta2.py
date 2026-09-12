"""Second-generation per-word metadata: one dominant part of speech per word
plus a movie-distinctiveness score. Fixes the v1 `classes` filter problem where
every word carried all of its possible WordNet senses ('know' counted as a
noun), making POS filters nearly useless.
"""

import math

_WN = None


def _wordnet():
    global _WN
    if _WN is None:
        import nltk

        try:
            from nltk.corpus import wordnet as wn

            wn.synsets("test")
        except LookupError:
            nltk.download("wordnet", quiet=True)
            from nltk.corpus import wordnet as wn
        _WN = wn
    return _WN


def dominant_pos(word: str) -> str:
    """The single part of speech a word is most often used as.

    n/v/a/r from WordNet, choosing the POS with the highest summed lemma sense
    counts (SemCor-derived usage frequencies); adjective satellites fold into
    'a'. When all counts are zero (rare words), fall back to the POS of
    WordNet's first-listed synset, which WordNet orders by frequency. Words
    WordNet doesn't know (names, interjections, contractions) are 'x'.
    """
    wn = _wordnet()
    synsets = wn.synsets(word)
    if not synsets:
        return "x"

    def fold(p: str) -> str:
        return "a" if p == "s" else p

    counts: dict[str, int] = {}
    target = word.lower()
    for s in synsets:
        pos = fold(s.pos())
        for lemma in s.lemmas():
            if lemma.name().lower() == target:
                counts[pos] = counts.get(pos, 0) + lemma.count()
    best = max(counts.values(), default=0)
    if best > 0:
        # break ties by WordNet's first-synset (frequency) ordering
        for s in synsets:
            p = fold(s.pos())
            if counts.get(p, 0) == best:
                return p
    return fold(synsets[0].pos())


def distinctiveness(rate_per_million: float, zipf: float) -> float:
    """How over-represented a word is in film dialogue vs everyday English.

    log2(corpus rate / general-English rate), where the English rate comes from
    the wordfreq Zipf scale (zipf = log10(uses per million) + 3). Words unknown
    to wordfreq (zipf 0) are floored to zipf 1.0 so they don't produce
    infinities — they simply score as very movie-distinctive.
    """
    english_per_million = 10 ** (max(zipf, 1.0) - 3.0)
    return round(math.log2(rate_per_million / english_per_million), 2)
