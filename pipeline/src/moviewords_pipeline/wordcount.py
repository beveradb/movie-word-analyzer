import re
from collections import Counter

TOKEN_RE = re.compile(r"[a-z']+")


def tokenize(text):
    tokens = []
    for tok in TOKEN_RE.findall(text.lower()):
        if tok.startswith("'") and tok.endswith("'") and len(tok) > 1:
            tok = tok.strip("'")
        if tok.strip("'"):  # drop bare apostrophes
            tokens.append(tok)
    return tokens


def count_words(text):
    return Counter(tokenize(text))
