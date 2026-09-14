"""Pytest configuration and fixtures."""
import sys
from pathlib import Path

# Add tests directory to sys.path so scripts_path.py can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent))
