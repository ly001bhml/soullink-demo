import json
import os
import re
import shutil
import sqlite3
import time
from typing import Dict, List, Optional, Tuple


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT_DIR, "memory", "user_profiles.db")
MODELS_ROOT = os.path.join(ROOT_DIR, "models")
REPORTS_DIR = os.path.join(ROOT_DIR, "logs", "migration_reports")

FIELDS: List[Tuple[str, str]] = [
    ("model3d_url", "source"),
    ("idle_model_url", "idle"),
    ("talking_model_url", "talking"),
    ("wave_model_url", "wave"),
]

NAME_ALIASES = {
    "孔子": "confucius",
    "老子": "laozi",
    "孟子": "mencius",
    "光头强": "guangtouqiang",
    "拉布布": "labubu",
    "奥特曼": "ultraman",
}


def sanitize_segment(value: str) -> Optional[str]:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip()).strip("._")
    return cleaned or None


def slugify_model_name(name: Optional[str]) -> str:
    raw = str(name or "").strip()
    if not raw:
        return "model"
    if raw in NAME_ALIASES:
        return NAME_ALIASES[raw]
    ascii_only = raw.encode("ascii", "ignore").decode("ascii")
    ascii_only = re.sub(r"[^A-Za-z0-9]+", "_", ascii_only).strip("_").lower()
    return ascii_only or "model"


def build_model_dir_name(model_id: str, model_name: Optional[str]) -> str:
    model_segment = sanitize_segment(model_id)
    if not model_segment:
        raise ValueError(f"invalid model_id: {model_id}")
    alias = sanitize_segment(slugify_model_name(model_name)) or "model"
    return f"{alias}__{model_segment}"


def normalize_model_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    normalized = str(url).strip()
    if normalized.startswith("http://") or normalized.startswith("https://"):
        normalized = "/" + "/".join(normalized.split("/")[3:])
    return normalized


def url_to_relative_path(url: Optional[str]) -> Optional[str]:
    normalized = normalize_model_url(url)
    if not normalized:
        return None
    if normalized.startswith("/models/"):
        relative_path = normalized[len("/models/") :]
    elif normalized.startswith("models/"):
        relative_path = normalized[len("models/") :]
    else:
        return None
    relative_path = relative_path.replace("\\", "/").strip("/")
    if not relative_path or ".." in relative_path.split("/"):
        return None
    return relative_path


def relative_path_to_url(relative_path: str) -> str:
    return f"/models/{relative_path.replace(os.sep, '/').strip('/')}"


def ensure_model_dir(model_id: str) -> Tuple[str, str]:
    return ensure_named_model_dir(model_id, None)


def ensure_named_model_dir(model_id: str, model_name: Optional[str]) -> Tuple[str, str]:
    segment = build_model_dir_name(model_id, model_name)
    model_dir = os.path.join(MODELS_ROOT, segment)
    os.makedirs(model_dir, exist_ok=True)
    return segment, model_dir


def copy_asset_to_slot(model_id: str, model_name: Optional[str], slot_name: str, src_path: str) -> str:
    model_segment, model_dir = ensure_named_model_dir(model_id, model_name)
    ext = os.path.splitext(src_path)[1].lower() or ".glb"
    slot_base = sanitize_segment(slot_name) or "asset"
    dst_path = os.path.join(model_dir, f"{slot_base}{ext}")
    shutil.copy2(src_path, dst_path)
    return relative_path_to_url(f"{model_segment}/{os.path.basename(dst_path)}")


def main() -> int:
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(DB_PATH)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(MODELS_ROOT, exist_ok=True)

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(REPORTS_DIR, f"user_profiles_{timestamp}.db.bak")
    shutil.copy2(DB_PATH, backup_path)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT model_id, name, model3d_url, idle_model_url, talking_model_url, wave_model_url
        FROM T_Model
        WHERE is_active = 1
        ORDER BY updated_at DESC
        """
    )
    rows = cur.fetchall()

    report: Dict[str, object] = {
        "timestamp": timestamp,
        "backup_db": backup_path,
        "migrated_models": [],
        "skipped_models": [],
        "counts": {
            "models_total": len(rows),
            "models_migrated": 0,
            "models_skipped": 0,
            "fields_migrated": 0,
            "fields_skipped": 0,
        },
    }

    for row in rows:
        model_id = row["model_id"]
        model_name = row["name"]
        desired_dir_name = build_model_dir_name(model_id, model_name)
        old_plain_dir = os.path.join(MODELS_ROOT, sanitize_segment(model_id) or model_id)
        desired_dir = os.path.join(MODELS_ROOT, desired_dir_name)
        if os.path.isdir(old_plain_dir) and not os.path.exists(desired_dir):
            os.rename(old_plain_dir, desired_dir)
        updates: Dict[str, str] = {}
        field_results: List[Dict[str, str]] = []

        for field_name, slot_name in FIELDS:
            original_url = row[field_name]
            if not original_url:
                continue

            relative_path = url_to_relative_path(original_url)
            if not relative_path:
                field_results.append(
                    {
                        "field": field_name,
                        "status": "skipped",
                        "reason": "invalid_url",
                        "url": str(original_url),
                    }
                )
                report["counts"]["fields_skipped"] += 1
                continue

            parts = relative_path.split("/")
            if len(parts) >= 2 and parts[0] == desired_dir_name:
                field_results.append(
                    {
                        "field": field_name,
                        "status": "skipped",
                        "reason": "already_migrated",
                        "url": str(original_url),
                    }
                )
                continue

            if len(parts) >= 2 and parts[0] == (sanitize_segment(model_id) or model_id):
                current_filename = parts[-1]
                updates[field_name] = relative_path_to_url(f"{desired_dir_name}/{current_filename}")
                field_results.append(
                    {
                        "field": field_name,
                        "status": "migrated",
                        "from": str(original_url),
                        "to": updates[field_name],
                    }
                )
                report["counts"]["fields_migrated"] += 1
                continue

            src_path = os.path.join(MODELS_ROOT, relative_path.replace("/", os.sep))
            if not os.path.exists(src_path):
                field_results.append(
                    {
                        "field": field_name,
                        "status": "skipped",
                        "reason": "missing_file",
                        "url": str(original_url),
                    }
                )
                report["counts"]["fields_skipped"] += 1
                continue

            new_url = copy_asset_to_slot(model_id, model_name, slot_name, src_path)
            updates[field_name] = new_url
            field_results.append(
                {
                    "field": field_name,
                    "status": "migrated",
                    "from": str(original_url),
                    "to": new_url,
                }
            )
            report["counts"]["fields_migrated"] += 1

        if updates:
            set_clause = ", ".join(f"{field} = ?" for field in updates.keys())
            params = list(updates.values()) + [int(time.time()), model_id]
            cur.execute(
                f"UPDATE T_Model SET {set_clause}, updated_at = ? WHERE model_id = ?",
                params,
            )
            report["migrated_models"].append(
                {
                    "model_id": model_id,
                    "name": model_name,
                    "updates": updates,
                    "details": field_results,
                }
            )
            report["counts"]["models_migrated"] += 1
        else:
            report["skipped_models"].append(
                {
                    "model_id": model_id,
                    "name": model_name,
                    "details": field_results,
                }
            )
            report["counts"]["models_skipped"] += 1

    conn.commit()
    conn.close()

    report_path = os.path.join(REPORTS_DIR, f"model_asset_migration_{timestamp}.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(json.dumps({"report": report_path, "backup_db": backup_path, "counts": report["counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
