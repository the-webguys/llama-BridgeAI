
# llama-BridgeAI: Bridging the Gap in Local AI Tooling

<br />

![llama-bridgeAI_gr.svg](https://the-webguys.com/assets/public/git/llama-bridge_ai/llama-bridgeAI_gr.svg)

<br />

> To act as a bridge between **OpenCode Desktop IDE** or VS Code **OpenCode Ext** to **local LLM** via **llama-server**

<br />

## The Problem: Architectural Decoupling

If you are running powerful local LLMs (like Qwen or Llama) via `llama-server` and attempting to integrate them with IDEs like OpenCode or VS Code extensions, you will inevitably hit a wall. Local LLMs struggle with rigid JSON schema, hallucinated line numbers, and inconsistent tool calling—a consequence of the **architectural decoupling** between the LLM and the IDE. The result is a functional, but perpetually incomplete, conversation.


Lost json in translation:
*  **[Show Image of JSON Failure]**[^01]
*  **[Show Image of Extension Failure]**[^02]


[^01]: Example of a Qwen sending json to the OpenCode Desktop IDE and lacking the final steps:
	
    ![opencode_desktop_json_01.png](https://the-webguys.com/assets/public/git/llama-bridge_ai/opencode_desktop_json_01.png)

[^02]: Example of a Qwen sending json to the OpenCode VS Code Extension and lacking the final steps:
	![opencode_ide_json_01.png](https://the-webguys.com/assets/public/git/llama-bridge_ai/opencode_ide_json_01.png)


Llama-BridgeAI was engineered to intercept this data stream, providing a unified, reliable communication layer that allows for seamless, persistent operation.

---

## How It Works: The Mediation Layer
Llama-BridgeAI functions as a **proxy bridge,** sitting between the IDE and the LLM. It actively intercepts, cleans, and translates the data stream in real-time. It scrubs hallucinated line numbers and translates mismatched tool names, ensuring that the IDE receives perfectly formatted data, while the LLM maintains its context and intent.


```json
"models": {
  "qwen2.5-coder-14b-instruct-q4_K_M": {
    "targetModel": "qwen2.5-coder-14b-instruct-q4_K_M",
    "bypass_proxy": false,
    "scrub_line_numbers": true,
    "tool_translator": [
      {
        "tool_ide": "edit",
        "tool_llm": "edit"
      }
    ]
  }
}
```

<br />


| Setting                  | Description                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`listenPort`**         | By default, the proxy listens on port `3000` - Point your IDE                                                                                                                                                                                      |
| **`targetUrl`**          | Forward address for llama-server, local IP this points to yourorwards requests to your local backend on `8080`                                                                                                                                     |
| `ide_settings`           | Future plan to detect the IDE so make changes based on the IDE and their specifications. Idea for users who use different IDE's. Currently                                                                                                         |
| **`bypass_proxy`**       | Set this to `true` for models that are natively brilliant at tool calling. It tells the proxy to get out of the way and just stream chat data directly, keeping latency to an absolute minimum.  You could of course bypass the LSTT completely... |
| **`scrub_line_numbers`** | If your model keeps failing file edits because it spits out `9: ` or `14:` at the start of every line, set this to `true`. The proxy will surgically strip those numbers out before the IDE ever sees them so the file patch actually works.       |
| **`tool_translator`**    | IDEs sometimes change what they call their tools (e.g., changing `edit` to `modify_file`), but your hardcoded LLM prompt might only understand `edit`. This array lets you translate them back and forth automatically.                            |


<br />

Llama-BridgeAI was engineered to intercept this data stream, providing a unified, reliable communication layer that allows for seamless, persistent operation.

<br />

---

<br />

### Tested On:
* **OS:**: Windows 11
* **IDE:**: Opencode Desktop (v1.14.18) & VS Code Extension (v1.115.0)
* **Core Backend:**: llama-server (v8762)
* **Models Tested:**:  Qwen-2.5-32B, Gemma-4-E4B, Qwen3-14B, Granite-4.0-Tiny, etc.
   
---


<br />


## Quick Setup Guide:
1.  **Prerequisites:** Install Node.js and ensure `llama-server` is operational on port 8080.
2.  **Configuration:** Edit `proxy_config.json` to map your specific models and desired features (e.g., enable `scrub_line_numbers: true` for better file integrity).
3.  **Execution:** Run the proxy via `start_proxy.bat`.
4.  **Connection:** Point your IDE's API URL to the proxy's port: `http://127.0.0.1:3000/v1`

<br />

---

<br />

## Future Plans & The Bigger Picture
This is a v0.1.0 proof-of-concept. The current scope validates the core architectural necessity. Future development aims to expand model family compatibility, Exploring other use cases and configurations.

---

<br />

<br />


> If this saves even one person the time and frustration, and from giving up... Then it was all worth it!
> 
> This is my first Public Repo - Suggestions and Constructive feedback are very welcome. 


<br />
