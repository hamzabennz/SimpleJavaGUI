#!/usr/bin/env bash
# Re-create app/src/main/assets/models/*.onnx from the bot's YOLOv5 weights.
# usage: tools/export_models.sh <path-to-Soccer-Stars-Game-Bot>
set -euo pipefail
BOT=$(realpath "$1")
OUT=$(realpath "$(dirname "$0")/../app/src/main/assets/models")
WORK=$(mktemp -d)
git clone --depth 1 https://github.com/ultralytics/yolov5.git "$WORK/yolov5"
python -m pip install -r "$WORK/yolov5/requirements.txt" onnx onnxslim
for m in soccer_ball arrow; do
  cp "$BOT/YOLO Model/$m/best.pt" "$WORK/$m.pt"
  (cd "$WORK/yolov5" && python export.py --weights "../$m.pt" --include onnx --dynamic --opset 12 --simplify)
  cp "$WORK/$m.onnx" "$OUT/$m.onnx"
done
echo "Models written to $OUT"
