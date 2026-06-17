/*
  Avatar registry — the single place to add or swap avatars.

  Each entry points at a GLB model (place files in frontend/public/avatars/)
  and declares a voice "gender" hint used to auto-pick a matching TTS voice.
  Adding a third avatar later = one more object here.

  You can also load ANY hosted GLB without downloading anything: set a custom
  URL in Settings (e.g. a Ready Player Me "models.readyplayer.me/<id>.glb" link
  or any URL serving a .glb). resolveAvatarUrl() prefers that custom URL.

  HOW TO CREATE A MODEL (free, and yours):
    Ready Player Me, Avaturn, or any tool that exports a GLB with ARKit/Oculus
    morph targets. Example RPM export URL:
      https://models.readyplayer.me/<ID>.glb?morphTargets=ARKit,Oculus%20Visemes&textureAtlas=1024&pose=A
*/
export const AVATARS = {
  female: {
    id: "female",
    label: "Aria",
    role: "Female · Professional",
    url: "/avatars/female.glb",
    gender: "female",
    voiceHints: [
      "zira", "aria", "jenny", "samantha", "eva", "hazel", "susan", "linda",
      "catherine", "female", "google uk english female", "google us english female",
    ],
  },
  male: {
    id: "male",
    label: "Atlas",
    role: "Male · Professional",
    url: "/avatars/male.glb",
    gender: "male",
    voiceHints: [
      "david", "mark", "guy", "daniel", "george", "james", "fred",
      "male", "google uk english male", "google us english male",
    ],
  },
};

export const DEFAULT_AVATAR = "female";

export function getAvatar(id) {
  return AVATARS[id] || AVATARS[DEFAULT_AVATAR];
}

// Returns the GLB URL to load: a user-provided custom URL if set, else the
// bundled local file under public/avatars/.
export function resolveAvatarUrl(settings, avatar) {
  const custom =
    avatar.id === "male" ? settings.customAvatarMale : settings.customAvatarFemale;
  return (custom && custom.trim()) || avatar.url;
}