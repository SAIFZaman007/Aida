Avatars — one per mode (video)
==============================

Each mode has its own avatar. Selecting a mode switches to its avatar, and the
voice changes with it (male / female — see src/lib/avatars.js).

  stills/<mode>.webp        portrait shown on the "Meet your AI specialists" cards
  video/<name>-idle.mp4     the avatar waiting: welcoming, smiling. Loops.
  video/<name>-talk.mp4     the avatar speaking: lip movement, expressions. Loops
                            while a reply is being read, then the idle clip returns.
  video/<name>-poster.jpg   first frame of the idle clip (shown while the video loads)

  <name> = the mode id (coder, executive, architect, security, researcher, writer),
  except Non-stop, which is "non-stop".

All seven modes have clips. Six are 16:9 office scenes ("wide"); Non-stop's idle is a 9:16
portrait ("tall") and its talk clip is 16:9. Whatever the shape, EVERY avatar (idle or talking)
is shown in the same frame: a 9:16 portrait as tall as the screen (534 x 954 px on a 954 px-tall
window), centred, over a blurred copy of the avatar's own picture. A 16:9 clip is cropped to that
frame around the person: "focus" in CLIPS (src/lib/avatars.js) is where the person stands across
the 16:9 picture. The Maktech logo is behind the person only where the clip itself has it there
(Non-stop idle); for the 16:9 office scenes it sits beside the person, so it shows in the blurred
backdrop. To have it behind the person in every avatar, render the clips as 9:16 (like Non-stop idle).

Adding or replacing the clips of a mode
  scripts/encode-avatar-clips.sh <mode-id> <idle-source.mp4> <talk-source.mp4>
  It writes the three files above into video/: 24 fps, 1920 px wide, H.264, NO audio
  track (the voice comes from the speech engine), +faststart, about 0.3-1.5 MB each,
  and it cross-fades the last 0.5 s into the first 0.5 s so the loop has no jump.
  Then make sure the mode id is in VIDEO_READY and CLIPS (src/lib/avatars.js).

Authoring tips (the clips are AI-generated; these make the result look better)
  - the idle and the talk clip of one mode must share framing, position and lighting
    (the switch is a cross-fade, so any difference shows as a ghost for a moment)
  - keep every clip of a mode in the same shape (all 16:9 or all 9:16)

Voice gender per mode (the person on screen and the voice must match):
  Non-stop female · Executive female · Coder male · Architect male
  Security male · Researcher female · Writer female
