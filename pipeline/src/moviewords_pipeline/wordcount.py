import re
import unicodedata
from collections import Counter

# Hyphenated words are deliberately split into separate tokens (e.g. "well-known" ->
# ["well", "known"]) since hyphens aren't part of this character class; this is intentional
# corpus-tokenization behavior, not an oversight.
TOKEN_RE = re.compile(r"[a-z']+")

# Matches an apostrophe-quoted span that is functioning as a quotation mark rather than as
# part of a word, e.g. "she said 'no way' to him". The (?<!\w)/(?!\w) boundary checks mean an
# apostrophe directly touching a word character never qualifies as an opening or closing
# quote, so contractions ("don't") and elisions ("goin'", "'tis") are left untouched. Spans
# can't nest since the inner group excludes apostrophes, so a single pass is sufficient.
QUOTE_PAIR_RE = re.compile(r"(?<!\w)'([^'\n]+)'(?!\w)")


def tokenize(text):
    text = text.lower()
    # Curly (typographic) apostrophes are common in subtitle/script sources; normalize them
    # to the ASCII apostrophe so contractions like "don't" tokenize consistently regardless
    # of which apostrophe character the source used.
    text = text.replace("’", "'").replace("‘", "'")
    # Strip quote-functioning apostrophe pairs down to their inner span before extracting
    # tokens, so quoted phrases don't distort word counts with leading/trailing apostrophes.
    text = QUOTE_PAIR_RE.sub(r"\1", text)
    # Normalize accented Latin letters to their unaccented ASCII form (café -> cafe, naïve ->
    # naive) for consistent word-frequency aggregation; this is standard practice for word
    # frequency corpora. Non-Latin scripts still drop out via the [a-z'] token regex below.
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))

    tokens = []
    for tok in TOKEN_RE.findall(text):
        if tok.startswith("'") and tok.endswith("'") and len(tok) > 1:
            tok = tok.strip("'")
        if tok.strip("'"):  # drop bare apostrophes
            tokens.append(tok)
    return tokens


def count_words(text):
    return Counter(tokenize(text))
