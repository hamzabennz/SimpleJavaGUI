# Stars Bot Overlay (Android)

An Android app that runs the [Soccer-Stars-Game-Bot](https://github.com/parissashahabi/Soccer-Stars-Game-Bot)
directly on the phone, as an overlay on top of the game.

| Bot (Python, Windows + BlueStacks) | This app (Kotlin, Android) |
|---|---|
| `WindowCapture` (win32) screenshots | MediaProjection screen capture |
| `rect_detection.get_rectangle` – pitch | `Vision.getRectangle` (same HSV mask; trims goal mouths when they join the pitch) |
| `ObjectDetection` template matching + `groupRectangles` – goals, pieces | `TemplateDetector` (same OpenCV calls) |
| `save_element_screenshot` Hough circles – piece templates | `Vision.captureCircleTemplate` (limits scaled to the screen) |
| `is_players_turn` white-pixel check | `Vision.isPlayersTurn` (same) |
| YOLOv5 `soccer_ball/best.pt` via torch.hub | same weights exported to ONNX, ONNX Runtime, same AutoShape letterbox + NMS |
| YOLOv5 `arrow/best.pt` + `get_arrow_angle` | `ArrowDetector` (same PIL-HSV mask, angle, length, force = length × 100) |
| `environment.py` (pymunk / Chipmunk2D) | `physics/Space.kt` – line-by-line port of the Chipmunk solver |
| `simulation_report_3.txt` parameters | `SimParameters.REPORT_3` |
| `chromosome.py` / `evolutionary.py` / `ChooseAction` | `ai/ChooseAction.kt` (same GA, fitness evaluated in parallel) |
| `perform_drag_action` (pyautogui) | `GestureService` (Accessibility swipe, 0.5 s) |
| "Action Result" window | trajectories drawn on the overlay |

The physics parameters were fitted on the author's 1071×621 window (pitch at 116,142 797×461).
To keep the simulation identical on any phone, detected positions are mapped into that reference
frame (`RefFrame`) before simulating and mapped back for drawing and swiping.

## Verified against the original

`./gradlew :core:test` checks the port against the Python bot:

* **Physics**: 180 random shots from three real game states give the same positions as pymunk
  after 500 steps (max difference 1.6e-7 px).
* **Vision, on the bot's own screenshot** (`images/angle.png`): pitch, both goals, turn check,
  all 10 piece positions, ball box, and arrow angle / length / force are identical to the
  Python pipeline. The predicted final positions match pymunk to 2e-5 px.
* **1920×1080 screenshot**: pitch, goals (scaled templates), 5 + 5 pieces and ball are found.
  The evolutionary search finds a scoring shot in under a second on a desktop CPU.

The reference data comes from `tools/make_physics_fixtures.py` and `tools/reference_pipeline.py`,
which run the original Python code.

## Modes (floating panel)

* **Predict** – what `main.py` does: aim with your finger, and the overlay shows where the ball and
  pieces will go (cyan = ball and the piece you shoot).
* **Suggest** – runs the bot's evolutionary search (`ChooseAction(50, 50, 0.9, 0.5, 10, 10000)`)
  at the start of your turn and draws the best shot (violet).
* **Auto** – Suggest, then performs the swipe like `perform_drag_action`. Needs the app's
  Accessibility service. The swipe length can be calibrated in the app (multiplier of force/60).

Panel buttons: **Analyze** (force analysis now, e.g. if the turn check misses), **Re-init**
(re-detect pitch, goals and piece templates, e.g. for a new match or another table), **Draw**
(toggle detection boxes), **Stop**.

## Install

Every push builds an APK on GitHub Actions (`.github/workflows/overlay-apk.yml`). It is published
as the **overlay-latest** pre-release in this repository's Releases. Open it on the phone, download
`stars-bot-overlay.apk`, and allow installing unknown apps.

Then in the app:

1. Allow **draw over other apps**.
2. (Auto mode only) enable **Stars Bot Overlay – auto shot** in Accessibility settings.
3. Pick a mode, tap **Start overlay**, choose **Entire screen** when Android asks, and open the game.

## Build locally

```
cd soccer-stars-overlay
./gradlew :core:test            # any JVM, no Android SDK needed
./gradlew :app:assembleRelease  # needs ANDROID_HOME / local.properties
```

## Notes

* The overlay is captured together with the game, so it never draws in colours the detectors use:
  no pure white, no red/orange/yellow, no pitch green.
* The turn check is the bot's: any pure-white pixel in the top-left score area means it is your
  turn. If your game version differs, use **Analyze**.
* Auto-playing online matches against other people may break the game's terms of service.
  Use offline or friend modes.
