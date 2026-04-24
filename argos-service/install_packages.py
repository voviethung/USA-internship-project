"""
Run during Docker build to pre-download Argos language packages.
This avoids downloading at runtime which can cause startup failures.
"""
import os
import sys

import argostranslate.package
import argostranslate.translate

LANG_PAIRS = os.getenv("ARGOS_LANG_PAIRS", "en-vi,vi-en")


def parse_pairs(raw: str) -> list[tuple[str, str]]:
    pairs = []
    for item in raw.split(","):
        item = item.strip()
        if "-" not in item:
            continue
        src, dst = item.split("-", 1)
        src, dst = src.strip().lower(), dst.strip().lower()
        if src and dst:
            pairs.append((src, dst))
    return pairs


def main() -> None:
    pairs = parse_pairs(LANG_PAIRS)
    if not pairs:
        print("No language pairs configured, skipping.")
        return

    print(f"Updating Argos package index...")
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    print(f"Found {len(available)} available packages.")

    for src, dst in pairs:
        # Check if already installed
        installed = argostranslate.translate.get_installed_languages()
        installed_codes = {lang.code for lang in installed}
        if src in installed_codes and dst in installed_codes:
            src_lang = next((l for l in installed if l.code == src), None)
            dst_lang = next((l for l in installed if l.code == dst), None)
            if src_lang and dst_lang and src_lang.get_translation(dst_lang):
                print(f"  [{src}->{dst}] already installed, skipping.")
                continue

        match = next(
            (pkg for pkg in available if pkg.from_code.lower() == src and pkg.to_code.lower() == dst),
            None,
        )
        if not match:
            print(f"  [{src}->{dst}] ERROR: package not found in Argos index!", file=sys.stderr)
            sys.exit(1)

        print(f"  [{src}->{dst}] downloading...")
        path = match.download()
        argostranslate.package.install_from_path(path)
        print(f"  [{src}->{dst}] installed successfully.")

    print("All language packages installed.")


if __name__ == "__main__":
    main()
