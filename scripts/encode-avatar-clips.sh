#!/usr/bin/env bash
# Encode one avatar's clips for the web and write its three files into public/avatars/video/.
#
#   scripts/encode-avatar-clips.sh <mode-id> <idle-source.mp4> <talk-source.mp4> [width]
#   e.g.  scripts/encode-avatar-clips.sh coder Coder_IDLE.mp4 Coder_TALK.mp4
#   Use "-" as the idle source to re-encode only the talk clip of a mode.
#   (width is for 16:9 clips; a 9:16 clip is better kept as it is.)
#
# What it does to each clip (needs ffmpeg + python3):
#   - 24 fps, 1920 px wide by default (the stage is full-bleed; the face is a small part of it),
#     H.264 yuv420p, +faststart, NO audio track (the voice comes from the speech engine)
#   - makes the clip loop WITHOUT A JUMP: the last 0.5 s is cross-faded into the first 0.5 s
#     (AI-generated clips rarely end where they began)
#   - poster  = first frame of the idle clip (shown while the video loads)
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,14p' "$0"; exit 1; }
mode="$1"; idle="$2"; talk="$3"; w="${4:-1920}"; crf=27; d=0.5
dest="$(cd "$(dirname "$0")/.." && pwd)/public/avatars/video"; mkdir -p "$dest"

loop() { # in out
  local T; T=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
  local E; E=$(python3 -c "print(round($T-$d,3))")
  ffmpeg -v error -y -i "$1" -filter_complex "
    [0:v]fps=24,scale=${w}:-2:flags=lanczos,split=3[v1][v2][v3];
    [v1]trim=start=${d}:end=${E},setpts=PTS-STARTPTS[A];
    [v2]trim=start=${E}:end=${T},setpts=PTS-STARTPTS[tail];
    [v3]trim=start=0:end=${d},setpts=PTS-STARTPTS[head];
    [tail][head]xfade=transition=fade:duration=${d}:offset=0[B];
    [A][B]concat=n=2:v=1:a=0,format=yuv420p[o]" \
    -map "[o]" -an -c:v libx264 -preset slow -crf "$crf" -movflags +faststart "$2"
}

loop "$talk" "$dest/${mode}-talk.mp4"
if [ "$idle" != "-" ]; then
  loop "$idle" "$dest/${mode}-idle.mp4"
  ffmpeg -v error -y -i "$dest/${mode}-idle.mp4" -frames:v 1 -q:v 3 "$dest/${mode}-poster.jpg"
fi
ls -l "$dest/${mode}"-* | awk '{printf "%8.2f MB  %s\n", $5/1048576, $9}'
