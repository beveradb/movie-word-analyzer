from pathlib import Path

from moviewords_pipeline.subtitle_parser import extract_text

FIX = Path(__file__).parent / "fixtures"


def test_extracts_dialogue_lines():
    text = extract_text((FIX / "sub_basic.xml").read_bytes())
    assert "Quarter Pounder" in text
    assert "Royale with Cheese" in text
    assert "00:00" not in text  # no timestamps


def test_strips_noise():
    text = extract_text((FIX / "sub_noisy.xml").read_bytes())
    assert "<i>" not in text and "Previously on the show" in text
    assert "Subtitles by" not in text          # credit lines dropped
    assert "corrections by" not in text
    assert "door slams" not in text            # SDH cues dropped
    assert "la la la" not in text              # song lines dropped
    assert "Hello there" in text and "General Kenobi" in text


def test_malformed_xml_returns_empty():
    assert extract_text(b"<document><s>broken") == ""
