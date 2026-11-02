Avatars — one per mode (video)
==============================

Each mode has its own avatar. Selecting a mode switches to its avatar, and the
voice changes with it (male / female — see src/lib/avatars.js).

  stills/<mode>.webp        portrait shown on the "Meet your AI specialists" cards
                            (and on screen until that mode's videos are added)
  video/<name>-idle.mp4     the avatar waiting: welcoming, smiling. Loops.
  video/<name>-talk.mp4     the avatar speaking: lip movement, expressions. Loops
                            while a reply is being read, then the idle clip returns.
  video/<name>-poster.jpg   one frame of the idle clip (shown while the video loads)

  <name> = the mode id (coder, executive, architect, security, researcher, writer),
  except Non-stop, which is "non-stop".

Videos available now:  Non-stop.   The other six modes show their still image until
their clips are added: put the three files above into video/ and add the mode id to
VIDEO_READY in src/lib/avatars.js.

Recommended encoding (what the Non-stop clips use)
  - same framing, same position and same lighting in the idle and the talk clip, so
    the switch between them is invisible
  - portrait 9:16, 720 x 1280, 24 fps, H.264 (yuv420p), NO audio track (the voice
    comes from the speech engine), `-movflags +faststart`, about 1-2 MB each
  - the first and the last frame should match (or be cross-faded) so the loop has no jump
      ffmpeg -i in.mp4 -vf "scale=720:1280,fps=24,format=yuv420p" -an \
             -c:v libx264 -crf 25 -movflags +faststart out.mp4
  - a landscape (16:9) version of a clip would fill a wide screen edge to edge; today
    the portrait clip is centred and its sides blend into the background.

Voice gender per mode (the person on screen and the voice must match):
  Non-stop female · Executive female · Coder male · Architect male
  Security male · Researcher female · Writer female
