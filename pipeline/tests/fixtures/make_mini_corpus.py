"""Build a tiny OPUS-layout zip in valid OPUS XML for tests."""
import zipfile

BASIC_LINES = [
    "You know what they call a Quarter Pounder with Cheese in Paris?",
    "They call it a Royale with Cheese.",
]
NOISY_LINES = [
    "Previously on the show...",
    "Hello there.",
    "General Kenobi!",
]


def make_xml(lines, times=1):
    body = "".join(f'<s id="{i}">{line}</s>'
                   for i, line in enumerate(lines * times, 1))
    return (f'<?xml version="1.0" encoding="utf-8"?>'
            f'<document id="1">{body}</document>').encode()


def build(zip_path):
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr("OpenSubtitles/raw/en/1994/110912/1.xml",
                   make_xml(BASIC_LINES, 200))
        z.writestr("OpenSubtitles/raw/en/1994/110912/2.xml",
                   make_xml(BASIC_LINES))                    # too small
        z.writestr("OpenSubtitles/raw/en/2001/9999999/3.xml",
                   make_xml(NOISY_LINES, 200))
        z.writestr("OpenSubtitles/raw/en/1894/1/4.xml",
                   make_xml(BASIC_LINES))                    # not curated
    return zip_path
