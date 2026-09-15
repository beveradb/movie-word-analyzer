#!/usr/bin/env python3
"""Two-pass Gemini/Vertex AI translation pipeline for moviewords message files.

Translates `en.json` (nested next-intl style message file) into every target
locale defined in `app/src/i18n/locales.json`, using:

  - Delta detection via a committed `.en-snapshot.json` (only changed/new
    English keys are re-sent to the model on incremental runs).
  - A shared GCS-backed cache (`translation_cache.TranslationCache`) keyed by
    sha256(english_string) so identical strings are translated once, ever.
  - Two Gemini passes per locale: translate, then review/polish (skippable
    via --skip-review).
  - Async concurrency across locales (bounded by a semaphore) with retry +
    backoff around each Gemini call.

Auth: Google Cloud Application Default Credentials (Vertex AI on the
`nomadkaraoke` GCP project) — no Gemini API key.
"""
import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

from google import genai
from google.genai import types

from translation_cache import TranslationCache

# --- Configuration & constants ----------------------------------------------

# Gemini Pro on Vertex AI. Known-good on the nomadkaraoke project as of this
# writing; override here (or promote to a --model flag later) if Vertex
# retires this preview id.
MODEL = "gemini-3.1-pro-preview"
PROJECT = "nomadkaraoke"  # GCP project
LOCATION = "global"  # Vertex AI location
MAX_CONCURRENT = 5
MAX_RETRIES = 3

# Informal "you" per language, injected into the prompt where it matters.
INFORMAL_YOU = {
    "es": "tú", "de": "du", "fr": "tu", "it": "tu", "pt": "você",
    "nl": "je", "pl": "ty", "ru": "ты", "uk": "ти", "cs": "ty", "sk": "ty", "hr": "ti",
    "ro": "tu", "hu": "te", "el": "εσύ", "tr": "sen", "hi": "तुम", "vi": "bạn",
    "sv": "du", "nb": "du", "da": "du", "fi": "sinä", "ca": "tu",
}

PRODUCT_CONTEXT = (
    "This is for Movie Words (moviewords.org), a website exploring the words "
    "spoken in films - it counts every word of subtitle dialogue across tens "
    "of thousands of movies and surfaces each film's, decade's, and genre's "
    "most distinctive words using log-odds. The tone is playful and "
    "cinephile, using film-script metaphors (e.g. 'Fade in:', 'Smash cut "
    "to:', 'Night shoot'). Keep that light, fun register; a slightly simpler "
    "tone is acceptable where the wordplay does not translate. IMPORTANT: "
    "use spaced hyphens ' - ' and never em-dashes (an en-dash is OK for year "
    "ranges)."
)

_LOCALES_JSON_PATH = (
    Path(__file__).resolve().parents[3] / "app" / "src" / "i18n" / "locales.json"
)


def _read_locales() -> list:
    """Load the raw locale records from app/src/i18n/locales.json."""
    return json.loads(_LOCALES_JSON_PATH.read_text())


def load_targets() -> dict:
    """Return {code: english_name} for every translation target, excluding 'en'."""
    return {loc["code"]: loc["english"] for loc in _read_locales() if loc["code"] != "en"}


# Derived once at import time, mirroring the reference's module-level constant.
RTL_LOCALES = {loc["code"] for loc in _read_locales() if loc.get("rtl") and loc["code"] != "en"}


# --- Glossary ----------------------------------------------------------------

def build_glossary_instructions(glossary: dict, target_locale: str) -> str:
    """Render per-locale glossary bullet lines for injection into both prompt passes.

    Supports Task 18's `_all` marker (one value applies to every locale) as
    well as explicit per-locale overrides. `null` -> "DO NOT translate";
    a string -> forced translation to that exact value.
    """
    lines = []
    for term, translations in glossary.get("terms", {}).items():
        if not isinstance(translations, dict):
            continue
        if target_locale in translations:
            val = translations[target_locale]
        elif "_all" in translations:
            val = translations["_all"]
        else:
            continue
        if val is None:
            lines.append(f'- "{term}" -> DO NOT translate, keep as "{term}"')
        else:
            lines.append(f'- "{term}" -> "{val}"')
    if not lines:  # fallback: at minimum protect the brand/domain
        lines.append('- "Movie Words" -> DO NOT translate, keep as "Movie Words"')
        lines.append('- "moviewords.org" -> DO NOT translate, keep as "moviewords.org"')
    return "\n".join(lines)


def load_glossary() -> dict:
    path = Path(__file__).resolve().parent / "glossary.json"
    if not path.exists():
        return {"terms": {}}
    return json.loads(path.read_text())


# --- Nested-JSON helpers (shared shape with validate-translations.py) --------

def flatten_keys(obj: dict, prefix: str = "") -> dict:
    """Nested dict -> {'a.b.c': leafValue}. Only leaves become entries."""
    result = {}
    for key, value in obj.items():
        full_key = f"{prefix}{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten_keys(value, f"{full_key}."))
        else:
            result[full_key] = value
    return result


def extract_subset(obj: dict, dot_keys: set) -> dict:
    """Rebuild a nested dict containing only the given dot-paths."""
    result = {}
    for dot_key in sorted(dot_keys):
        parts = dot_key.split(".")
        src = obj
        for part in parts:
            if isinstance(src, dict) and part in src:
                src = src[part]
            else:
                src = None
                break
        if src is None:
            continue
        dst = result
        for part in parts[:-1]:
            dst = dst.setdefault(part, {})
        dst[parts[-1]] = src
    return result


def _unflatten(flat: dict) -> dict:
    """Inverse of flatten_keys: {'a.b.c': value} -> nested dict."""
    result = {}
    for dot_key, value in flat.items():
        parts = dot_key.split(".")
        dst = result
        for part in parts[:-1]:
            dst = dst.setdefault(part, {})
        dst[parts[-1]] = value
    return result


def merge_deep(base: dict, overlay: dict) -> dict:
    """Recursive deep-merge; splices freshly-translated deltas into the existing file."""
    result = dict(base)
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = merge_deep(result[key], value)
        else:
            result[key] = value
    return result


def compute_changed_keys(current: dict, snapshot: dict) -> set:
    """Dot-keys whose value is new or changed vs the snapshot."""
    current_flat, snapshot_flat = flatten_keys(current), flatten_keys(snapshot)
    return {
        k for k, v in current_flat.items()
        if k not in snapshot_flat or snapshot_flat[k] != v
    }


# --- Prompts -------------------------------------------------------------

def _you_form_rule(target_locale: str) -> str:
    you_form = INFORMAL_YOU.get(target_locale)
    if you_form:
        return f'Use the informal form of "you" ("{you_form}") where natural for the target language.'
    return "Use a natural, friendly tone appropriate for the language."


def build_translate_prompt(target_locale: str, target_name: str, glossary_instructions: str, subset_json: str) -> str:
    return f"""Translate the following JSON message file from English to {target_name}.

## Context
{PRODUCT_CONTEXT}

## Rules
1. Preserve ALL JSON keys exactly as they are — only translate the string values
2. Preserve all placeholders like {{year}}, {{count}} etc. exactly as they appear
3. Preserve all URLs, email addresses, phone numbers, and physical addresses exactly
4. Preserve all currency amounts ($5, $10, etc.) in their original format
5. {_you_form_rule(target_locale)}

## Glossary — follow these translations exactly:
{glossary_instructions}

## JSON to translate:
```json
{subset_json}
```

Return ONLY the translated JSON, no explanation or markdown code fences."""


def build_review_prompt(target_locale: str, target_name: str, glossary_instructions: str, english_json: str, draft_json: str) -> str:
    return f"""Review and polish the following {target_name} translation of a JSON message file.

## Context
{PRODUCT_CONTEXT}

## Task
Check the translation below for naturalness, accuracy, internal consistency,
tone, and correct form of address, then return a corrected version.

## Rules
1. Preserve ALL JSON keys exactly as they are — only edit the string values
2. Preserve all placeholders like {{year}}, {{count}} etc. exactly as they appear
3. Preserve all URLs, email addresses, phone numbers, and physical addresses exactly
4. Preserve all currency amounts ($5, $10, etc.) in their original format
5. {_you_form_rule(target_locale)}

## Glossary — follow these translations exactly:
{glossary_instructions}

## Original English JSON:
```json
{english_json}
```

## Draft {target_name} translation to review:
```json
{draft_json}
```

Return ONLY the reviewed/corrected JSON, no explanation or markdown code fences."""


# --- Gemini call, wrapped for async + retry ----------------------------------

async def _call_with_retry(client, prompt: str) -> str:
    for attempt in range(MAX_RETRIES):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="medium"),
                    temperature=0.3,
                ),
            )
            return response.text
        except Exception:
            if attempt == MAX_RETRIES - 1:
                raise
            await asyncio.sleep(2 ** (attempt + 1))


def _parse_json_response(text: str):
    """Parse a Gemini JSON response, tolerating stray markdown code fences."""
    stripped = text.strip()
    fence_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fence_match:
        stripped = fence_match.group(1).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


# --- Pure decision helpers (unit-tested; no I/O) -----------------------------

def resolve_mode(full_flag: bool, snapshot_exists: bool, existing_exists: bool) -> str:
    """Pick the delta mode for a single locale (§6.4).

    - "full": force a full retranslation. Triggered by --full, OR whenever the
      per-locale file is missing (existing_exists is False) — even if a
      snapshot exists, since a delta-only write would otherwise produce a
      near-empty locale file (only the changed keys, not the whole thing).
    - "delta": snapshot exists and the locale file exists — translate only
      the keys that changed vs the snapshot.
    - "missing": no snapshot, but the locale file exists — translate only the
      keys the locale file doesn't have yet.
    """
    if full_flag or not existing_exists:
        return "full"
    if snapshot_exists:
        return "delta"
    return "missing"


def should_write_snapshot(failed: int, dry_run: bool, locales_processed, all_targets) -> bool:
    """Only refresh the shared `.en-snapshot.json` on a fully-successful,
    full-coverage run.

    Writing it after a subset run (e.g. --target es) would make
    `compute_changed_keys` see no changes for every *other* locale on the
    next run, silently starving them of translations for edited English
    keys. So the snapshot may only advance when every locale in
    `all_targets` was attempted this run.
    """
    return failed == 0 and not dry_run and set(locales_processed) == set(all_targets)


# --- Per-locale orchestration -------------------------------------------------

async def translate_locale(
    *,
    client,
    cache: TranslationCache,
    glossary: dict,
    locale: str,
    english_name: str,
    messages_dir: Path,
    en_data: dict,
    en_flat: dict,
    snapshot,
    full: bool,
    skip_review: bool,
    dry_run: bool,
) -> dict:
    locale_path = messages_dir / f"{locale}.json"
    existing = json.loads(locale_path.read_text()) if locale_path.exists() else None
    existing_flat = flatten_keys(existing) if existing else {}

    # --- Pick the delta mode (§6.4) ---
    mode = resolve_mode(full, snapshot is not None, existing is not None)
    if mode == "full":
        keys_to_translate = set(en_flat.keys())
    elif mode == "delta":
        keys_to_translate = compute_changed_keys(en_data, snapshot)
    else:  # "missing"
        keys_to_translate = set(en_flat.keys()) - set(existing_flat.keys())

    if not keys_to_translate:
        print(f"  [{locale}] ({english_name}) up to date — nothing to translate")
        return {"status": "skipped", "locale": locale, "keys": 0, "mode": mode}

    subset = extract_subset(en_data, keys_to_translate)
    subset_flat = flatten_keys(subset)

    if dry_run:
        print(
            f"  [{locale}] ({english_name}) mode={mode} "
            f"keys_to_translate={len(keys_to_translate)}/{len(en_flat)} "
            f"(cache lookup skipped in dry-run; no Gemini calls, no writes)"
        )
        return {"status": "dry-run", "locale": locale, "keys": len(keys_to_translate), "mode": mode}

    # --- Cache lookups: only misses go to Gemini ---
    cache.download(locale)
    cached_translations = {}
    uncached_english = {}
    for dot_key, value in subset_flat.items():
        if not isinstance(value, str):
            uncached_english[dot_key] = value
            continue
        hit = cache.lookup(value, locale)
        if hit is not None:
            cached_translations[dot_key] = hit
        else:
            uncached_english[dot_key] = value

    translated_flat = dict(cached_translations)
    glossary_instructions = build_glossary_instructions(glossary, locale)

    if uncached_english:
        to_translate_obj = extract_subset(subset, set(uncached_english.keys()))
        to_translate_json = json.dumps(to_translate_obj, ensure_ascii=False, indent=2)

        pass1_prompt = build_translate_prompt(locale, english_name, glossary_instructions, to_translate_json)
        pass1_text = await _call_with_retry(client, pass1_prompt)
        parsed1 = _parse_json_response(pass1_text)

        if parsed1 is None:
            raw_path = messages_dir / f"{locale}.raw.json"
            raw_path.write_text(pass1_text)
            raise RuntimeError(
                f"[{locale}] Pass 1 returned invalid JSON; wrote {raw_path.name} for inspection"
            )

        final_parsed = parsed1
        if not skip_review:
            pass2_prompt = build_review_prompt(
                locale, english_name, glossary_instructions, to_translate_json,
                json.dumps(parsed1, ensure_ascii=False, indent=2),
            )
            pass2_text = await _call_with_retry(client, pass2_prompt)
            parsed2 = _parse_json_response(pass2_text)
            if parsed2 is not None:
                final_parsed = parsed2
            else:
                print(f"  [{locale}] Pass 2 (review) returned invalid JSON — keeping Pass 1 output")

        translated_new_flat = flatten_keys(final_parsed)
        translated_flat.update(translated_new_flat)

        for dot_key, value in uncached_english.items():
            if dot_key in translated_new_flat:
                cache.store(value, locale, translated_new_flat[dot_key])
        cache.upload(locale)

    translated_nested = _unflatten(translated_flat)
    final = merge_deep(existing, translated_nested) if existing else translated_nested

    locale_path.write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n")

    stats = cache.stats(locale)
    print(
        f"  [{locale}] ({english_name}) mode={mode} translated {len(keys_to_translate)} key(s) "
        f"(cache hits={stats['hits']} misses={stats['misses']})"
    )
    return {
        "status": "translated",
        "locale": locale,
        "keys": len(keys_to_translate),
        "mode": mode,
        "cache_hits": stats["hits"],
        "cache_misses": stats["misses"],
    }


# --- CLI -----------------------------------------------------------------

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Translate moviewords message files via Gemini/Vertex AI.")
    p.add_argument("--messages-dir", type=Path, required=True, help="Directory containing en.json")
    p.add_argument("--target", nargs="+", required=True, help='Locale code(s), or "all"')
    p.add_argument("--full", action="store_true", help="Force full retranslation (ignore snapshot/delta)")
    p.add_argument("--skip-review", action="store_true", help="Skip the Pass 2 review/polish step")
    p.add_argument("--no-cache", action="store_true", help="Bypass the GCS translation cache")
    p.add_argument("--dry-run", action="store_true", help="Report cache/key counts; no Gemini calls, no writes")
    p.add_argument("--cache-bucket", default="nomadkaraoke-translation-cache", help="GCS bucket for the translation cache")
    return p


async def _run(args: argparse.Namespace) -> int:
    en_path = args.messages_dir / "en.json"
    if not en_path.exists():
        print(f"Error: {en_path} not found")
        return 1
    en_data = json.loads(en_path.read_text())
    en_flat = flatten_keys(en_data)
    print(f"English source: {len(en_flat)} keys")

    targets = load_targets()
    if args.target == ["all"]:
        locales = sorted(targets.keys())
    else:
        locales = args.target
        unknown = [l for l in locales if l not in targets]
        if unknown:
            print(f"Error: unknown target locale(s): {', '.join(unknown)}")
            return 1

    glossary = load_glossary()

    snapshot_path = args.messages_dir / ".en-snapshot.json"
    snapshot = json.loads(snapshot_path.read_text()) if snapshot_path.exists() else None

    cache = TranslationCache(bucket_name=args.cache_bucket, enabled=not args.no_cache)

    client = None
    if not args.dry_run:
        client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)

    if args.dry_run:
        print(f"Dry run: {len(locales)} target locale(s) — {', '.join(locales)}")

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def run_one(locale: str):
        async with semaphore:
            return await translate_locale(
                client=client,
                cache=cache,
                glossary=glossary,
                locale=locale,
                english_name=targets[locale],
                messages_dir=args.messages_dir,
                en_data=en_data,
                en_flat=en_flat,
                snapshot=snapshot,
                full=args.full,
                skip_review=args.skip_review,
                dry_run=args.dry_run,
            )

    outcomes = await asyncio.gather(*(run_one(l) for l in locales), return_exceptions=True)

    failed = 0
    for locale, outcome in zip(locales, outcomes):
        if isinstance(outcome, Exception):
            failed += 1
            print(f"  [{locale}] FAILED: {outcome}")

    if args.dry_run:
        print("Dry run complete — no Gemini calls made, no files written.")
    elif should_write_snapshot(failed, args.dry_run, locales, targets.keys()):
        snapshot_path.write_text(json.dumps(en_data, ensure_ascii=False, indent=2) + "\n")
        print(f"Wrote snapshot: {snapshot_path}")
    elif failed == 0:
        print(
            f"Snapshot not updated (subset run: {', '.join(locales)}); "
            "run --target all to refresh the delta baseline."
        )
    else:
        print(f"{failed} locale(s) failed — snapshot left unchanged so deltas retry next run.")

    return 1 if failed else 0


def main() -> None:
    args = build_arg_parser().parse_args()
    exit_code = asyncio.run(_run(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
