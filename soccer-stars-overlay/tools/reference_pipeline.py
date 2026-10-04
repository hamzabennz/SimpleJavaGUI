"""Run the ORIGINAL bot's detection pipeline (main.py GameAnalyzer steps) on a screenshot
and print the results as JSON, to check the Kotlin port (core/src/test/.../VisionParityTest.kt).

usage: python reference_pipeline.py <path-to-Soccer-Stars-Game-Bot> <screenshot.png> [more.png...]
"""
import json, os, sys, types
bot = os.path.abspath(sys.argv[1])
for m in ['win32gui', 'win32ui', 'win32con', 'pyautogui', 'pygame']:
    sys.modules[m] = types.ModuleType(m)
pu = types.ModuleType('pymunk.pygame_util'); sys.modules['pymunk.pygame_util'] = pu
sys.path.insert(0, bot)
os.chdir(bot)
import cv2 as cv, numpy as np, torch, tempfile, shutil
import pymunk; pymunk.pygame_util = pu
from PIL import Image
import util
from util import cv2_to_pil, pil_to_cv2, trim, compare_and_resize_images, is_players_turn, get_soccer_ball_click_point
from rect_detection import get_rectangle
from object_detection import ObjectDetection
from save_element_screenshot import save_element_screenshot
from soccer_ball_detection import get_soccer_ball_position
from angle_detection import get_arrow_angle
from environment import Environment

ball_model = torch.hub.load('yolov5', 'custom', path='YOLO Model/soccer_ball/best.pt', source='local', verbose=False)
arrow_model = torch.hub.load('yolov5', 'custom', path='YOLO Model/arrow/best.pt', source='local', verbose=False)
params = util.get_environment_parameters(3)
work = tempfile.mkdtemp()
shutil.copytree('images', os.path.join(work, 'images'))
os.chdir(work)
out = {}
for path in sys.argv[2:]:
    r = {}
    sc = cv.imread(path)[:, :, :3].copy()
    x, y, w, h = get_rectangle(sc.copy()); pg = (x, y, w, h); r['playground'] = pg
    method = 'cv.TM_CCOEFF_NORMED'
    pgr = ObjectDetection('images/player_goal.jpg', method, (0, 0, 0)).find_objects(sc, 0.7)
    ogr = ObjectDetection('images/opponent_goal.jpg', method, (0, 0, 0)).find_objects(sc, 0.7)
    r['playerGoal'] = [int(v) for v in pgr[0]] if len(pgr) else None
    r['opponentGoal'] = [int(v) for v in ogr[0]] if len(ogr) else None
    # init_players without the trim step (see GameAnalyzer.kt)
    save_element_screenshot(sc, "opponent", pg[0] + pg[2] // 2, pg[1], pg[2] // 2, pg[3])
    save_element_screenshot(sc, "player", pg[0], pg[1], pg[2] // 2, pg[3])
    compare_and_resize_images("images/player.jpg", "images/opponent.jpg")
    r['turn'] = bool(is_players_turn(sc, (pg[0], 0, pg[2] // 3, sc.shape[0] // 4)))
    pr = ObjectDetection('images/player.jpg', method, (0, 0, 0)).find_objects(sc, 0.7)
    orr = ObjectDetection('images/opponent.jpg', method, (0, 0, 0)).find_objects(sc, 0.7)
    r['players'] = ObjectDetection.get_click_points(pr)
    r['opponents'] = ObjectDetection.get_click_points(orr)
    rgb = Image.fromarray(cv.cvtColor(sc, cv.COLOR_BGR2RGB))
    br = get_soccer_ball_position(ball_model, rgb)
    r['ballBox'] = [float(v) for v in br] if br is not None else None
    a = get_arrow_angle(arrow_model, rgb, 0)
    r['arrow'] = None if a[0] is None else {'angle': float(a[0]), 'length': float(a[1]), 'force': int(a[2]), 'tail': [int(a[3][0]), int(a[3][1])]}
    if a[0] is not None and br is not None and len(pgr) and len(ogr):
        ball = get_soccer_ball_click_point(br)
        state = (r['players'], r['opponents'], ball, tuple(pgr[0]), tuple(ogr[0]), tuple(pg))
        env = Environment(state, *params[:9]); env.simulate()
        shape = env.find_closest_shape(a[3])
        Environment.shoot(shape, a[0], a[2])
        for _ in range(500): env.space.step(1 / 120)
        r['prediction'] = [list(s.body.position) for s in [env.soccer_ball_shape] + env.players_shapes + env.opponent_shapes]
    out[os.path.basename(path)] = r
print("JSON" + json.dumps(out, default=lambda o: o.tolist() if hasattr(o, 'tolist') else int(o)))
