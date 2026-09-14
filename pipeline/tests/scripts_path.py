"""Puts pipeline/scripts on sys.path so tests can import script modules."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
add_scripts_to_path = True
