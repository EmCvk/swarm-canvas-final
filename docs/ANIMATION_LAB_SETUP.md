# Animation Lab Setup

## What this tab does

Animation Lab takes a still image from Swarm Canvas, uploads it to ComfyUI, injects its settings into a ComfyUI API workflow, queues the workflow, waits for completion, and displays the generated output.

The included starter is a low-VRAM AnimateDiff-style image animation workflow. It is intended as a starting point and may require node/model-name changes depending on the installed version of ComfyUI-AnimateDiff-Evolved.

## Recommended hardware preset

For an RTX 3050 Laptop GPU with 4 GB VRAM:

- Width: 384
- Height: 512
- Frames: 8
- FPS: 8
- Steps: 16
- CFG: 5
- Denoise: 0.65
- Batch size: 1

Do not start with 24+ frames or 1024px output on 4 GB VRAM.

## Install ComfyUI

Install ComfyUI through the method you already use, or use ComfyUI Desktop/portable. Start it so that the web UI/API is available at:

http://127.0.0.1:8188

Open this URL in your browser before using Animation Lab.

## Install required nodes

In ComfyUI Manager, install:

- ComfyUI-AnimateDiff-Evolved

Restart ComfyUI after installation.

The starter workflow expects AnimateDiff-related node classes supplied by that extension. Node names can change between extension versions. If ComfyUI reports a missing node class, open the workflow JSON in the Animation Lab editor and replace it with an API export from a working workflow in your own ComfyUI installation.

## Install models

You need:

1. An SD1.5 checkpoint compatible with AnimateDiff.
2. An AnimateDiff SD1.5 motion module.

Place/install them in the locations expected by your ComfyUI installation and extension.

The starter workflow uses these default names:

- Checkpoint: v1-5-pruned-emaonly.safetensors
- Motion model: mm_sd_v15_v3.safetensors

Change those names in the workflow editor to the exact filenames available in your installation.

## First generation

1. Start ComfyUI.
2. Open Swarm Canvas.
3. Generate an image using your preferred Anima model.
4. Click Animation Lab.
5. The current Canvas image should appear as a source candidate.
6. Click Test. You should see "ComfyUI is reachable."
7. Keep the low-VRAM preset for the first test.
8. Enter a motion-focused prompt, for example:

   subtle blinking, gentle breathing, slight head movement, hair moving in a light breeze, cinematic camera drift

9. Click Generate Animation.
10. The image is uploaded automatically to ComfyUI.
11. The workflow is queued automatically.
12. Wait for the result preview.

## Important: prompt style

Animation prompts should describe MOTION rather than completely redesigning the image.

Good:

- subtle blinking
- gentle head turn
- hair moving in wind
- breathing
- cloth fluttering
- slow camera push in

Bad for image consistency:

- a completely different person
- change clothes
- transform into another character
- radically change scene

## If the workflow fails

Open ComfyUI and inspect the error.

Common causes:

### Missing node class

Your ComfyUI-AnimateDiff-Evolved version uses different node names.

Fix:
Create a working AnimateDiff workflow inside your ComfyUI installation, export it as API format, and paste it into Animation Lab.

### Missing checkpoint

Change the checkpoint filename in the workflow to the exact filename installed in ComfyUI.

### Missing motion model

Change the motion model filename to the exact filename installed for AnimateDiff.

### Out of memory

Reduce:

- frames to 4 or 8
- resolution to 320x448 or 384x512
- steps to 12-16

Close other GPU-heavy applications.

## Workflow placeholders

Animation Lab replaces:

- __PROMPT__
- __NEGATIVE__
- __SEED__
- __WIDTH__
- __HEIGHT__
- __FRAMES__
- __FPS__
- __DENOISE__
- __SOURCE_IMAGE__

## Best workflow upgrade path

Once the starter works, create your preferred workflow directly in ComfyUI and export it as API format. Replace the starter JSON in Animation Lab with that export and insert the placeholders above into the appropriate node inputs.

This is more reliable than depending forever on a hardcoded graph because ComfyUI custom-node APIs evolve.
