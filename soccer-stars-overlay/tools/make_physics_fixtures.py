"""Run the ORIGINAL bot's environment.py (pymunk) on many shots and save the results,
so the Kotlin port can be checked against it (core/src/test/.../PhysicsParityTest.kt).

usage: python make_physics_fixtures.py <path-to-Soccer-Stars-Game-Bot> <out.json>
"""
import json, random, sys, types

bot_dir, out = sys.argv[1], sys.argv[2]
sys.modules['pygame'] = types.ModuleType('pygame')          # only used for drawing
pu = types.ModuleType('pymunk.pygame_util'); sys.modules['pymunk.pygame_util'] = pu
sys.path.insert(0, bot_dir)
import pymunk
pymunk.pygame_util = pu
from environment import Environment

params = [23.713254694135834, 27.087892946690758, 0.6477491352956183, 11.856627347067917, 12.463283589269098,
          0.9031891633692508, 2.59820555075832, 0.7839959399142863, 1600.5011199624246]
states = [
    ([(267, 243), (422, 318), (147, 363), (421, 411), (269, 487)], [(792, 240), (606, 363), (884, 363), (699, 365), (790, 487)], (512.4279937744141, 368.6336669921875), (58, 259, 60, 201), (917, 258, 48, 200), (116, 142, 797, 461)),
    ([(240, 247), (210, 346), (148, 361), (298, 407), (242, 494)], [(789, 243), (429, 273), (881, 366), (697, 367), (704, 487)], (676.8642272949219, 422.5126495361328), (58, 261, 60, 201), (917, 259, 48, 200), (116, 143, 797, 461)),
    ([(239, 241), (363, 347), (145, 364), (227, 372), (239, 488)], [(881, 367)], (730.9111633300781, 452.31719970703125), (58, 259, 60, 201), (917, 258, 48, 200), (116, 142, 797, 461)),
]
rnd = random.Random(1234)
cases = []
for si, st in enumerate(states):
    for k in range(60):
        pid = rnd.randint(1, len(st[0]))
        angle = round(rnd.uniform(0, 360))
        force = round(rnd.uniform(10, 10000))
        env = Environment(st, *params)
        env.simulate()
        Environment.shoot(env.players_shapes[pid - 1], angle, force)
        snaps = []
        for i in range(1, 501):
            env.space.step(1 / 120)
            if i in (1, 10, 50, 120, 250, 500):
                snaps.append({'step': i, 'bodies': [list(s.body.position) for s in [env.soccer_ball_shape] + env.players_shapes + env.opponent_shapes]})
        cases.append({'state': si, 'player': pid, 'angle': angle, 'force': force, 'snaps': snaps,
                      'playerGoal': env.check_player_goal_scored(), 'opponentGoal': env.check_opponent_goal_scored()})
json.dump({'params': params, 'states': states, 'cases': cases}, open(out, 'w'))
print(len(cases), 'cases, pymunk', pymunk.version)
