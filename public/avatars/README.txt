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

All seven modes have clips. Six are 16:9 office scenes that fill the screen
("wide"); Non-stop is the older 9:16 portrait ("tall", centred and blended into a
blurred backdrop). The shape and the person's horizontal position ("focus") of each
avatar are listed in CLIPS in src/lib/avatars.js.

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
