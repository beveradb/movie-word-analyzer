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


# Frequent discourse words whose WordNet entries are misleading (abbreviations
# like OH/US, or noun-ified interjections like "hello, an expression of
# greeting"). In dialogue these are interjections/function words → 'x'.
_DISCOURSE_X = {
    "oh", "yes", "no", "yeah", "yep", "nope", "hey", "hi", "hello", "wow",
    "ah", "aw", "ooh", "oh-oh", "whoa", "huh", "um", "uh", "er", "hmm", "mm",
    "okay", "ok", "bye", "goodbye", "gee", "gosh", "ugh", "oops", "ouch",
    "phew", "shh", "yay", "yikes", "yo", "ha", "haha", "wham", "bam",
}


def dominant_pos(word: str, zipf: float = 0.0) -> str:
    """The single part of speech a word is most often used as.

    n/v/a/r from WordNet, choosing the POS with the highest summed lemma sense
    counts (SemCor-derived usage frequencies). Inflected forms are resolved
    per-POS with morphy so 'going'/'got' inherit go.v's counts; adjective
    satellites fold into 'a'. When every sense count is zero the word's real
    usage is unattested: rare words fall back to WordNet's first-listed synset,
    but *common* words (zipf ≥ 5) become 'x' — if a top-2,000 English word has
    zero SemCor sense hits, WordNet only knows a niche homograph of it
    (oh→Ohio, us→United States). Words WordNet doesn't know at all (names,
    contractions, invented words) are 'x'.
    """
    wn = _wordnet()
    if word in _DISCOURSE_X:
        return "x"
    synsets = wn.synsets(word)
    if not synsets:
        return "x"

    def fold(p: str) -> str:
        return "a" if p == "s" else p

    counts: dict[str, int] = {}
    for letter in "nvar":
        pos_synsets = wn.synsets(word, pos=letter)
        if not pos_synsets:
            continue
        base = (wn.morphy(word, letter) or word).lower()
        c = 0
        for s in pos_synsets:
            for lemma in s.lemmas():
                # case-sensitive: 'US'/'God' lemma counts must not attach to
                # the dialogue words 'us'/'god'... (proper-noun homographs)
                if lemma.name() == base:
                    c += lemma.count()
        counts[letter] = counts.get(letter, 0) + c
    best = max(counts.values(), default=0)
    if best > 0:
        # break ties by WordNet's overall first-synset (frequency) ordering
        for s in synsets:
            p = fold(s.pos())
            if counts.get(p, 0) == best:
                return p
        return max(counts, key=lambda k: counts[k])
    if zipf >= 5.0:
        return "x"
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
