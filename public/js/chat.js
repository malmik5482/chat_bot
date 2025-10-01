document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('sendBtn');
  const promptInput = document.getElementById('promptInput');
  const modelSelect = document.getElementById('modelSelect');
  const messagesDiv = document.getElementById('messages');
  const clearBtn = document.getElementById('clearBtn');

  // Load chat history from localStorage
  function loadChatHistory() {
    try {
      const history = localStorage.getItem('chatHistory');
      if (history) {
        const messages = JSON.parse(history);
        messages.forEach(msg => {
          appendMessage(msg.text, msg.sender, msg.timestamp, false);
        });
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  }

  // Save chat history to localStorage
  function saveChatHistory() {
    try {
      const messages = Array.from(messagesDiv.querySelectorAll('.message')).map(msg => {
        const content = msg.querySelector('.message-content');
        const timestamp = msg.querySelector('.message-timestamp');
        return {
          text: content.textContent,
          sender: msg.classList.contains('user') ? 'user' : 'bot',
          timestamp: timestamp ? timestamp.textContent : new Date().toLocaleTimeString()
        };
      });
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    } catch (err) {
      console.error('Failed to save chat history:', err);
    }
  }

  // Clear chat history
  function clearChatHistory() {
    if (confirm('Are you sure you want to clear all chat history?')) {
      messagesDiv.innerHTML = '';
      localStorage.removeItem('chatHistory');
    }
  }

  // Format timestamp
  function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  }

  // Append message to chat
  function appendMessage(text, sender, timestamp = null, save = true) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.classList.add('message-timestamp');
    timeDiv.textContent = timestamp || getTimestamp();
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);
    messagesDiv.appendChild(messageDiv);
    
    // Smooth scroll to bottom
    messagesDiv.scrollTo({
      top: messagesDiv.scrollHeight,
      behavior: 'smooth'
    });
    
    if (save) {
      saveChatHistory();
    }
  }

  // Show typing indicator
  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.classList.add('message', 'bot');
    typingDiv.id = 'typing-indicator';
    
    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = '<span></span><span></span><span></span>';
    
    typingDiv.appendChild(indicator);
    messagesDiv.appendChild(typingDiv);
    
    messagesDiv.scrollTo({
      top: messagesDiv.scrollHeight,
      behavior: 'smooth'
    });
  }

  // Remove typing indicator
  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // Send message
  async function sendMessage() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.focus();
      return;
    }

    const model = modelSelect.value;
    
    // Append user message
    appendMessage(prompt, 'user');
    promptInput.value = '';
    promptInput.style.height = 'auto';
    
    // Disable input
    sendBtn.disabled = true;
    promptInput.disabled = true;
    modelSelect.disabled = true;
    
    // Change button text to show loading
    const originalText = sendBtn.textContent;
    sendBtn.innerHTML = '<span class="loading-spinner"></span>';
    
    // Show typing indicator
    showTypingIndicator();

    try {
      const response = await fetch('/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, model })
      });

      const data = await response.json();
      
      // Remove typing indicator
      removeTypingIndicator();

      if (response.ok) {
        appendMessage(data.response, 'bot');
      } else {
        appendMessage(`❌ Error: ${data.error || 'Unknown error occurred'}`, 'bot');
      }
    } catch (err) {
      removeTypingIndicator();
      appendMessage(`❌ Network error: ${err.message}. Please check your connection and try again.`, 'bot');
    } finally {
      // Re-enable input
      sendBtn.disabled = false;
      promptInput.disabled = false;
      modelSelect.disabled = false;
      sendBtn.textContent = originalText;
      promptInput.focus();
    }
  }

  // Auto-resize textarea
  function autoResizeTextarea() {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 150) + 'px';
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  
  promptInput.addEventListener('input', autoResizeTextarea);
  
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', clearChatHistory);
  }

  // Load chat history on page load
  loadChatHistory();
  
  // Focus on input
  promptInput.focus();
});