# A turntable: one object in the brand's accent colour, turning, on a
# transparent background, rendered as a PNG sequence that the scene shows with
# GFX.clip. Run by npm run clips for a clips.json entry such as
#
#   { "id": "gpu", "blender": "blender/turntable.py", "frames": 120, "size": [1080, 1080],
#     "args": { "shape": "cube", "turns": 1, "tilt": 22 } }
#
# clips.mjs passes the brand's colours as linear RGB (--accent, --ground), so
# the object is the brand's own accent, not an approximation. Copy this file to
# make another object: model it in make_object(), keep the arguments.
#
# Blender 3.6 or later, in the background: blender -b --factory-startup -P turntable.py -- --out DIR --frames N ...
import argparse
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
p = argparse.ArgumentParser()
p.add_argument("--out", required=True)
p.add_argument("--frames", type=int, required=True)
p.add_argument("--fps", type=int, default=30)
p.add_argument("--width", type=int, default=1080)
p.add_argument("--height", type=int, default=1080)
p.add_argument("--accent", default="0.1,0.4,0.8")
p.add_argument("--ground", default="0.01,0.01,0.012")
p.add_argument("--args", default="{}")
a = p.parse_args(argv)
opts = json.loads(a.args)
accent = [float(x) for x in a.accent.split(",")] + [1.0]

# An empty scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, a.frames
scene.render.fps = a.fps
scene.render.resolution_x, scene.render.resolution_y = a.width, a.height
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = os.path.join(a.out, "#####")
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 32


def make_object(shape):
    """The object on the turntable. Replace this to model something else."""
    if shape == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.1, segments=64, ring_count=32)
        bpy.ops.object.shade_smooth()
    elif shape == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.38, major_segments=96, minor_segments=32)
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.mesh.primitive_cube_add(size=1.6)
        bevel = bpy.context.object.modifiers.new("bevel", "BEVEL")
        bevel.width, bevel.segments = 0.12, 6
    return bpy.context.object


obj = make_object(opts.get("shape", "cube"))
mat = bpy.data.materials.new("accent")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = accent
bsdf.inputs["Roughness"].default_value = 0.35
if "Metallic" in bsdf.inputs:
    bsdf.inputs["Metallic"].default_value = float(opts.get("metallic", 0.2))
obj.data.materials.append(mat)

# Turn it: `turns` full turns over the clip, at constant speed, tilted toward the camera.
tilt = math.radians(float(opts.get("tilt", 22)))
obj.rotation_euler = (tilt, 0.0, 0.0)
obj.keyframe_insert("rotation_euler", frame=1)
obj.rotation_euler = (tilt, 0.0, 2 * math.pi * float(opts.get("turns", 1)))
obj.keyframe_insert("rotation_euler", frame=a.frames + 1)
action = obj.animation_data.action
curves = getattr(action, "fcurves", None)
if curves is None:  # Blender 5: layered actions
    curves = [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
for fc in curves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"

# A camera framing the object, and three lights: key, fill, rim.
bpy.ops.object.camera_add(location=(0, -6.2, 1.6))
cam = bpy.context.object
cam.rotation_euler = (math.radians(77), 0, 0)
cam.data.lens = 50
scene.camera = cam
for name, loc, energy in (("key", (4, -4, 5), 900), ("fill", (-5, -3, 2), 300), ("rim", (0, 5, 4), 600)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = 4
    direction = obj.location - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = [float(x) for x in a.ground.split(",")] + [1.0]
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world

bpy.ops.render.render(animation=True)
