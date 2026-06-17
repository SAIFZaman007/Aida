const API =
  (typeof window !== "undefined" && window.avatar?.apiBase) ||
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000/api";

async function json(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => json("/health"),

  listProjects: () => json("/projects"),
  createProject: (name, description = "") =>
    json("/projects", { method: "POST", body: JSON.stringify({ name, description }) }),
  updateProject: (id, patch) =>
    json(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProject: (id) => json(`/projects/${id}`, { method: "DELETE" }),

  listConversations: (projectId) => json(`/projects/${projectId}/conversations`),
  createConversation: (projectId, title, persona = "executive") =>
    json("/conversations", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, title, persona }),
    }),
  updateConversation: (id, patch) =>
    json(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteConversation: (id) => json(`/conversations/${id}`, { method: "DELETE" }),
  listMessages: (conversationId) => json(`/conversations/${conversationId}/messages`),

  async streamChat({ conversationId, content, remember = true }, onToken, signal, onSentence) {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, content, remember }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data = line.slice(5).trim();
        }
        if (!data) continue;
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (event === "error" || parsed.error) throw new Error(parsed.error || "stream error");
        if (event === "token" && parsed.t) {
          full += parsed.t;
          onToken?.(parsed.t, full);
        } else if (event === "sentence") {
          onSentence?.(parsed);
        }
      }
    }
    return full;
  },

  async transcribe(blob) {
    const form = new FormData();
    form.append("file", blob, "speech.webm");
    const res = await fetch(`${API}/voice/transcribe`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Transcription failed");
    return res.json();
  },

  async speak(text, gender = "female") {
    const res = await fetch(`${API}/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
    });
    if (!res.ok) throw new Error("TTS unavailable");
    return res.blob();
  },

  async speakMarks(text, gender = "female") {
    const res = await fetch(`${API}/voice/speak_marks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, gender }),
    });
    if (!res.ok) throw new Error("TTS unavailable");
    const data = await res.json();
    const binary = atob(data.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ...data, audio: bytes.buffer };
  },
};