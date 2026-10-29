Avatars — one per mode
======================

Each mode has its own avatar. Selecting a mode in the app switches to its avatar,
and the voice changes with it (male / female).

File name -> mode (voice)
  non-stop.glb    Non-stop    (male)
  executive.glb   Executive   (male)
  coder.glb       Coder       (male)
  architect.glb   Architect   (male)
  security.glb    Security    (male)
  researcher.glb  Researcher  (male)
  writer.glb      Writer      (female)

To replace an avatar: drop a new .glb here with the SAME file name. To change a
voice gender or add a mode: edit src/lib/avatars.js (and src/lib/modes.js).

What the app does with any humanoid model
  - scales it to one common height and frames it head-and-torso
  - gives it a relaxed professional posture (arms down, elbows slightly bent)
  - adds breathing, head and eye movement, blinks and hand gestures while speaking
  - animates the mouth from the real voice when the model has mouth morph targets
Models are not modified on disk. If a file is missing or is not a valid .glb, the
app shows an animated "AI core" instead and keeps working.
