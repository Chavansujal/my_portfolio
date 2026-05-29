from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.request import urlretrieve

import cv2
import mediapipe as mp
import numpy as np
from aiohttp import WSMsgType, web


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)


def count_raised_fingers(hand: list[dict[str, float]]) -> dict[str, object]:
    count = 0
    raised = {
        "thumb": False,
        "index": False,
        "middle": False,
        "ring": False,
        "pinky": False,
    }

    thumb_tip = hand[4]
    thumb_ip = hand[3]
    wrist = hand[0]
    if abs(thumb_tip["x"] - wrist["x"]) > abs(thumb_ip["x"] - wrist["x"]):
        count += 1
        raised["thumb"] = True

    for tip_idx, pip_idx, name in (
        (8, 6, "index"),
        (12, 10, "middle"),
        (16, 14, "ring"),
        (20, 18, "pinky"),
    ):
        if hand[tip_idx]["y"] < hand[pip_idx]["y"]:
            count += 1
            raised[name] = True

    return {"count": count, "raised": raised}


def ensure_model() -> Path:
    MODEL_DIR.mkdir(exist_ok=True)
    if not MODEL_PATH.exists():
        urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def create_landmarker():
    model_path = ensure_model()
    options = mp.tasks.vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return mp.tasks.vision.HandLandmarker.create_from_options(options)


def to_landmarks(result) -> tuple[list[list[dict[str, float]]], dict[str, object] | None]:
    if not result.hand_landmarks:
        return [], None

    hands: list[list[dict[str, float]]] = []
    finger_info = None

    for hand_landmarks in result.hand_landmarks[:1]:
        hand = [
            {"x": lm.x, "y": lm.y, "z": lm.z}
            for lm in hand_landmarks
        ]
        hands.append(hand)
        finger_info = count_raised_fingers(hand)

    return hands, finger_info


async def gesture_socket(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(max_msg_size=4 * 1024 * 1024)
    await ws.prepare(request)

    hand_landmarker = create_landmarker()

    try:
        async for msg in ws:
            if msg.type != WSMsgType.BINARY:
                if msg.type == WSMsgType.ERROR:
                    break
                continue

            frame_bytes = np.frombuffer(msg.data, dtype=np.uint8)
            frame = cv2.imdecode(frame_bytes, cv2.IMREAD_COLOR)
            if frame is None:
                await ws.send_str(json.dumps({"landmarks": [], "fingerInfo": None}))
                continue

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            result = hand_landmarker.detect(mp_image)
            landmarks, finger_info = to_landmarks(result)

            await ws.send_str(
                json.dumps(
                    {
                        "landmarks": landmarks,
                        "fingerInfo": finger_info,
                    }
                )
            )
    finally:
        hand_landmarker.close()

    return ws


async def health_check(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", health_check)
    app.router.add_get("/ws/gesture", gesture_socket)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    web.run_app(create_app(), host="0.0.0.0", port=port)
