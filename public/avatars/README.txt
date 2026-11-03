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
  except the Aida mode (id "nonstop", formerly "Non-stop"), whose files are named "non-stop".

All seven modes have clips, and every clip is a 9:16 portrait (810 x 1440 px) with the person centred
and the Maktech logo behind them. EVERY avatar (idle or talking) is shown in the same frame: a 9:16
portrait as tall as the screen (534 x 954 px on a 954 px-tall window), centred, over a blurred copy
of the avatar's own picture. A 9:16 clip needs no horizontal crop (focus 50 in CLIPS, src/lib/avatars.js);
a 16:9 clip would still work ("wide" + focus = where the person stands across the picture).

Adding or replacing the clips of a mode
  scripts/encode-avatar-clips.sh <mode-id> <idle-source.mp4> <talk-source.mp4>
  It writes the three files above into video/: 24 fps, H.264 (pass the width as 4th argument: 810 for 9:16 clips, 1920 default for 16:9), NO audio
  track (the voice comes from the speech engine), +faststart, about 0.2-1.3 MB each,
  and it cross-fades the last 0.5 s into the first 0.5 s so the loop has no jump.
  Then make sure the mode id is in VIDEO_READY and CLIPS (src/lib/avatars.js).

Authoring tips (the clips are AI-generated; these make the result look better)
  - the idle and the talk clip of one mode must share framing, position and lighting
    (the switch is a cross-fade, so any difference shows as a ghost for a moment)
  - keep every clip of a mode in the same shape (all 16:9 or all 9:16)

Voice gender per mode (the person on screen and the voice must match):
  Aida female · Executive female · Coder male · Architect male
  Security male · Researcher female · Writer female
