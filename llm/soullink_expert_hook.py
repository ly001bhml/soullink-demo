# -*- coding: utf-8 -*-
"""Updated SoulLink hook: user_id + dialog_id session keys, optional character skin."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def expert_enabled() -> bool:
    return os.environ.get("CLINICAL_EXPERT_MODE", "1").strip() in {"1", "true", "TRUE", "yes"}


def expert_base_url() -> str:
    return (os.environ.get("CLINICAL_EXPERT_URL") or "http://127.0.0.1:18765").rstrip("/")


def call_expert_turn(
    username: str,
    utterance: str,
    timeout: float = 60.0,
    *,
    dialog_id: str | None = None,
    character_skin: str | None = None,
    interaction_mode: str | None = None,
) -> dict[str, Any] | None:
    if not expert_enabled():
        return None
    url = f"{expert_base_url()}/v1/expert/turn"
    did = dialog_id or os.environ.get("CLINICAL_DIALOG_ID") or "default"
    skin = character_skin or os.environ.get("CLINICAL_CHARACTER_SKIN") or "guangtouqiang"
    mode = interaction_mode or os.environ.get("CLINICAL_INTERACTION_MODE") or "consultation"
    user_id = username or "anonymous"
    payload = json.dumps(
        {
            "user_id": user_id,
            "dialog_id": did,
            "session_id": f"{user_id}::{did}",
            "character_skin": skin,
            "interaction_mode": mode,
            "utterance": utterance,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("ok"):
        return None
    return data


def spoken_from_expert(result: dict[str, Any] | None) -> str | None:
    if not result:
        return None
    text = str(result.get("spoken_text") or "").strip()
    return text or None
