#!/usr/bin/env python3
"""Checks all translation files against en.json for:
   100% key parity, no missing {placeholder} vars, no empty values, valid JSON.
   Exit 0 = pass, 1 = issues found."""
import argparse, json, re, sys
from pathlib import Path


def flatten_keys(obj: dict, prefix: str = "") -> dict:
    result = {}
    for key, value in obj.items():
        full_key = f"{prefix}{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten_keys(value, f"{full_key}."))
        else:
            result[full_key] = value
    return result


def extract_placeholders(text: str) -> set:
    return set(re.findall(r"\{(\w+)\}", str(text)))


def validate_locale(en_flat: dict, locale_path: Path, keys_only: bool = False) -> list[str]:
    issues, locale = [], locale_path.stem
    try:
        with open(locale_path) as f:
            data = json.loads(f.read())
    except json.JSONDecodeError as e:
        return [f"[{locale}] Invalid JSON: {e}"]

    tr_flat = flatten_keys(data)
    en_keys, tr_keys = set(en_flat.keys()), set(tr_flat.keys())

    for key in sorted(en_keys - tr_keys):
        issues.append(f"[{locale}] Missing key: {key}")
    for key in sorted(tr_keys - en_keys):
        issues.append(f"[{locale}] Extra key: {key}")
    if keys_only:
        return issues

    for key in sorted(en_keys & tr_keys):
        en_val, tr_val = en_flat[key], tr_flat[key]
        if isinstance(tr_val, str) and tr_val.strip() == "":
            issues.append(f"[{locale}] Empty value: {key}")
        if isinstance(en_val, str) and isinstance(tr_val, str):
            miss = extract_placeholders(en_val) - extract_placeholders(tr_val)
            extra = extract_placeholders(tr_val) - extract_placeholders(en_val)
            if miss:  issues.append(f"[{locale}] Missing placeholder(s) in '{key}': {', '.join(sorted(miss))}")
            if extra: issues.append(f"[{locale}] Extra placeholder(s) in '{key}': {', '.join(sorted(extra))}")
    return issues


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--messages-dir", type=Path, required=True)
    p.add_argument("--locale", nargs="*")
    p.add_argument("--keys-only", action="store_true")
    args = p.parse_args()

    en_path = args.messages_dir / "en.json"
    if not en_path.exists():
        print(f"Error: {en_path} not found"); sys.exit(1)
    en_flat = flatten_keys(json.load(open(en_path)))
    print(f"English source: {len(en_flat)} keys")

    if args.locale:
        locale_paths = [args.messages_dir / f"{l}.json" for l in args.locale]
        locale_paths = [p for p in locale_paths if p.exists()]
    else:  # every *.json except en.json and dotfiles
        locale_paths = sorted(p for p in args.messages_dir.glob("*.json")
                              if p.name != "en.json" and not p.name.startswith("."))

    all_issues = []
    for lp in locale_paths:
        issues = validate_locale(en_flat, lp, keys_only=args.keys_only)
        all_issues.extend(issues)
        print(f"  {lp.stem}: {'OK' if not issues else str(len(issues)) + ' issue(s)'}")

    if all_issues:
        print(f"\n{len(all_issues)} issue(s):")
        for i in all_issues: print(f"  {i}")
        sys.exit(1)
    print(f"\nAll {len(locale_paths)} locale(s) passed validation."); sys.exit(0)


if __name__ == "__main__":
    main()
