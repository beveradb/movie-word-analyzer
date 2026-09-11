import re
from xml.etree import ElementTree

TAG_RE = re.compile(r"<[^>]+>")
BRACKET_RE = re.compile(r"[\[(][^\])]*[\])]")   # [door slams], (sighs)
CREDIT_RE = re.compile(
    r"subtitles?\s+by|subs\s+by|sync(ed)?\b.*\bby|corrections?\s+by|"
    r"encoded\s+by|opensubtitles|addic7ed|www\.|https?://",
    re.IGNORECASE,
)
MUSIC_RE = re.compile(r"[♪♫#]")


def extract_text(xml_bytes):
    try:
        root = ElementTree.fromstring(xml_bytes)
    except ElementTree.ParseError:
        return ""
    lines = []
    for s in root.iter("s"):
        raw = " ".join("".join(s.itertext()).split())
        raw = TAG_RE.sub(" ", raw)          # literal <i> etc. embedded as text
        if CREDIT_RE.search(raw) or MUSIC_RE.search(raw):
            continue
        raw = BRACKET_RE.sub(" ", raw)
        raw = raw.lstrip("- ").strip()
        if raw:
            lines.append(raw)
    return "\n".join(lines)
