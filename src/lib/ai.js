// The browser never holds the Gemini key: requests go to /api/ai with the
// signed-in user's Firebase ID token, and the answer streams back as plain text.
export async function streamAI(user, payload, onText) {
  const token = await user.getIdToken();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = "The AI request failed. Try again in a moment.";
    try { message = (await response.json()).error || message; } catch { /* keep the default */ }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}
