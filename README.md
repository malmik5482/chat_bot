# LLM Playground

This project is a minimalistic web application for interacting with Large Language Models (LLMs).  It is built with **Node.js** and **Express** and is designed to be deployed on hosting services such as [Timeweb Apps](https://timeweb.com/).  Users can register and log in using only a phone number (no verification step) and then chat with different models.  The site includes a basic subscription system to unlock premium models.

## Features

### 🔐 Phone‑based registration

Users create an account by providing a phone number.  There is no SMS/OTP verification, so the flow remains simple.  Logging in works the same way—enter your phone number and if an account exists you are signed in.

### 🧠 Model selection

Two LLMs are configured out of the box:

| Model ID              | Name                    | Subscription | Description |
|-----------------------|-------------------------|-------------|-------------|
| `tinyllama`           | TinyLlama              | Free        | A lightweight model for quick, simple tasks |
| `deepseek-r1:1.5b`    | DeepSeek R1 (1.5 b)    | Premium     | A more capable model with better reasoning ability |

**Model source**: These models are served through the `mlvoca.com` free API.  The base URL is `https://mlvoca.com` and requests are made via `POST /api/generate`【683258989666543†L10-L21】.  You can choose between the `TinyLlama` or `DeepSeek R1 (1.5b)` models【683258989666543†L23-L27】.  A sample request looks like this:

```bash
curl -X POST https://mlvoca.com/api/generate -d '{
  "model": "tinyllama",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

The API currently works without any API key or rate limits【683258989666543†L105-L110】, but commercial use is **not** allowed【683258989666543†L111-L116】.  If you plan to monetise the application you should obtain permission from the provider.

### 💳 Subscription system

Users can toggle a subscription flag from the *Subscription* page.  Subscribing unlocks premium models (e.g. **DeepSeek R1**).  Currently the subscription does not process actual payments—clicking the button simply flips the `subscribed` flag on your account.  Pricing is set at **100 ₽ per month** (not enforced in code).

### 💬 Chat interface

Authenticated users see a simple chat UI where they can:

* select a model (locked options are disabled if the user is not subscribed);
* type a prompt and send it by clicking **Send** or pressing **Enter**;
* view the conversation transcript, with messages aligned to left (model) or right (user).

### 🪜 Extensibility

The `MODELS` array in `server.js` controls which models are offered.  You can extend this list to include other providers.  For example, the [free LLM API resources list](https://github.com/cheahjs/free-llm-api-resources) outlines many services—OpenRouter, Google AI Studio, HuggingFace Inference, Groq and others【800894833501477†L235-L260】—that offer free tiers (typically with an API key).  You can add entries here and modify `callLLM()` to call the appropriate API.

## Project structure

```
llm-website/
├── data/
│   └── users.json      # Persistent storage for users
├── public/
│   ├── css/styles.css  # Main stylesheet
│   └── js/chat.js      # Front‑end chat logic
├── views/
│   ├── partials/
│   │   ├── header.ejs  # Shared header + navigation
│   │   └── footer.ejs  # Closing HTML tags
│   ├── index.ejs       # Chat page
│   ├── login.ejs       # Log‑in page
│   ├── register.ejs    # Registration page
│   └── subscribe.ejs   # Subscription management page
├── package.json        # NPM metadata and dependencies
├── server.js           # Express application
└── README.md           # This documentation
```

## Running locally

1. Install dependencies:
   ```bash
   cd llm-website
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Deploying to Timeweb

Once you push this project to GitHub, you can connect it to Timeweb Apps.  Configure the build command (`npm install`) and the start command (`npm start`).  Make sure to specify Node.js as the runtime.

## Important notes

* **No verification**: Registration and login are purely based on the phone number.  Anyone who knows your number can impersonate you.  For a production system you should implement proper authentication and verification.
* **Commercial use**: The free API used here (`mlvoca.com`) is intended for educational and research purposes; commercial use requires permission【683258989666543†L111-L116】.  You should replace it with an appropriate provider if you plan to charge users.
* **Data privacy**: User data is stored in a local JSON file (`data/users.json`).  This is not secure or scalable; consider using a proper database for real deployments.

Enjoy experimenting with LLMs!