document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('sendBtn');
  const promptInput = document.getElementById('promptInput');
  const modelSelect = document.getElementById('modelSelect');
  const messagesDiv = document.getElementById('messages');

  function appendMessage(text, sender) {
    const msg = document.createElement('div');
    msg.classList.add('message', sender);
    msg.textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function sendMessage() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    const model = modelSelect.value;
    appendMessage(prompt, 'user');
    promptInput.value = '';
    sendBtn.disabled = true;
    try {
      const response = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model })
      });
      const data = await response.json();
      if (response.ok) {
        appendMessage(data.response, 'bot');
      } else {
        appendMessage('Error: ' + (data.error || 'Unknown error'), 'bot');
      }
    } catch (err) {
      appendMessage('Network error: ' + err.message, 'bot');
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});