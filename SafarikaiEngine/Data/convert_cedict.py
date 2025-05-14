import json
import re
from typing import Dict, Tuple


def parse_cedict_entry(line: str) -> Tuple[str, str, str, str]:
    # Format: traditional simplified [pinyin] /definition/
    match = re.match(r'([^ ]+) ([^ ]+) \[([^\]]+)\] /(.+)/', line)
    if match:
        return match.groups()
    return None


def convert_cedict():
    entries = []
    indexes = {}

    with open('cedict_ts.u8', 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                result = parse_cedict_entry(line)
                if result:
                    trad, simp, pinyin, definition = result
                    entry_id = str(len(entries))
                    entries.append(definition)

                    # Add traditional characters to index
                    indexes[trad] = [entry_id, pinyin]

                    # Add simplified characters to index if different
                    if simp != trad:
                        indexes[simp] = [entry_id, pinyin]

    # Write output files
    with open('entries.json', 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False)

    with open('indexes.json', 'w', encoding='utf-8') as f:
        json.dump(indexes, f, ensure_ascii=False)


if __name__ == "__main__":
    convert_cedict()
