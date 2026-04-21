// ==============================================================================
// llama-server Translation Tool (LSTT) V 0.1.0
// ==============================================================================
// This Proxy bridges local Llama-Server environments to OpenCode.
// It dynamically loads rules from proxy_config.json.
// Normal chat is streamed natively (High-Speed Bypass)
// Tool calls are safely buffered and surgically reformatted!

const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'proxy_config.json');
let config = {};

// CONFIGURATION ENGINE
function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        config = JSON.parse(data);
        console.log(`[Proxy-Core] 🟢 Loaded LSTT config (proxy_config.json)`);
    } catch (e) {
        console.error(`[Proxy-Core] 🔴 LSTT config Error:`, e.message);
    }
}

// Initial Load & Hot-Reloading Watcher
loadConfig();
fs.watchFile(CONFIG_PATH, (curr, prev) => {
    console.log(`\n[Proxy-Core] 🔄 Config Change Detected! Reloading...`);
    loadConfig();
});

const getModelConfig = (modelName) => {
    if (!config.models) return {};
    return config.models[modelName] || config.models["default"] || {};
};

// SYNTHETIC CHUNK CONSTRUCTOR (Prevents undefined crashes)
const buildChunk = (template, deltaPayload, finishReason = null) => {
    return {
        id: template?.id || `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: template?.created || Math.floor(Date.now() / 1000),
        model: template?.model || "proxy-model",
        choices: [{
            index: 0,
            delta: deltaPayload,
            finish_reason: finishReason
        }]
    };
};

// TOOL PARSER
function processAndEmitToolCalls(buffer, templateChunk, res, modelConfig) {
    let matchStr = "";

    // Attempt 1: Standard Markdown JSON Scaffold (Qwen/Llama Pattern)
    const blockMatch = buffer.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (blockMatch) {
        matchStr = blockMatch[1];
    } else {
        // Attempt 2: Naked JSON boundaries
        const inlineMatch = buffer.match(/(\[\s*\{\s*"name"[\s\S]*\]|\{\s*"name"[\s\S]*\})/);
        if (inlineMatch) matchStr = inlineMatch[1];
    }

    if (matchStr) {
        try {
            console.log(`[Proxy-Engine] 🎯 Tool Signature Intact! Synthesizing Payload...`);
            let parsedData = JSON.parse(matchStr);
            const parsedTools = Array.isArray(parsedData) ? parsedData : [parsedData];

            // Matrix Tool Translator & Data Cleaner (The "Slop-Scrubber")
            parsedTools.forEach(t => {
                // Layer 1: OUTBOUND TRANSLATOR (LLM Name -> IDE Name)
                let ideToolName = t.name;
                if (modelConfig.tool_translator) {
                    const map = modelConfig.tool_translator.find(m => m.tool_llm === t.name);
                    if (map) {
                        ideToolName = map.tool_ide;
                        t.name = ideToolName;
                    }
                }

                // Layer 2: SLOP-SCRUBBER (Only apply if config allows AND tool is 'edit')
                if (modelConfig.scrub_line_numbers && ideToolName === 'edit' && t.arguments) {
                    let args = t.arguments;
                    let isStr = false;
                    if (typeof args === 'string') {
                        try { args = JSON.parse(args); isStr = true; } catch (e) { }
                    }

                    if (args && typeof args === 'object') {
                        const stripLineNumbers = (val) => {
                            if (typeof val !== 'string') return val;
                            // Safely strip OpenCode's injected line prefixes added by opencode (e.g. "9:     " -> "    ")
                            return val.split('\n').map(line => line.replace(/^\d+:\s?/, '')).join('\n');
                        };

                        if (args.oldString) args.oldString = stripLineNumbers(args.oldString);
                        if (args.newString) args.newString = stripLineNumbers(args.newString);

                        t.arguments = isStr ? JSON.stringify(args) : args;
                        console.log(`[Proxy-Engine] 🧼 Slop-Scrubber: Cleaned hallucinated line numbers from edit payload.`);
                    }
                }
            });

            // Format to rigid OpenAI Schema for OpenCode
            const toolCalls = parsedTools.map((t, idx) => ({
                id: `call_oc_${Date.now()}_${idx}`,
                type: 'function',
                function: {
                    name: t.name,
                    arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments)
                }
            }));

            // Wipe the raw tool logic from the text output
            let leftoverText = buffer.replace(matchStr, '').trim();
            leftoverText = leftoverText.replace(/```(?:json)?\s*```/g, '').trim();

            // If the model spoke BEFORE doing the tool call, preserve it!
            if (leftoverText) {
                const textChunkObj = buildChunk(templateChunk, { role: "assistant", content: leftoverText });
                res.write(`data: ${JSON.stringify(textChunkObj)}\n\n`);
            }

            // Inject the Tool Call chunk
            if (toolCalls.length > 0) {
                const toolChunkObj = buildChunk(templateChunk, { role: "assistant", tool_calls: toolCalls }, modelConfig.finishReasonOverride || "tool_calls");
                res.write(`data: ${JSON.stringify(toolChunkObj)}\n\n`);
            }
            return true; // Success
        } catch (e) {
            console.log(`[Proxy-Engine] ⚠️ Payload Corrupted (Failed Parse):`, e.message);
        }
    }
    return false; // Failed
}

// THE PROXY SERVER
const server = http.createServer((req, res) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
        });
        return res.end();
    }

    const targetUrl = config.server?.targetUrl || 'http://127.0.0.1:8080';

    // 2. Intercept Completions Logic
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                const modelConfig = getModelConfig(requestData.model);

                // Log the fusion to the console
                console.log(`[Proxy-Router] 🕵️ Client: ${detectedIde.toUpperCase()} | Model: ${requestData.model}`);

                // SMART BYPASS MATRIX
                const hasTools = requestData.tools && requestData.tools.length > 0;
                const shouldBypass = !hasTools || modelConfig.bypass_proxy === true;

                if (shouldBypass) {
                    console.log(`[Proxy-Router] ⚡ Native Bypass: ${requestData.model} (Tools: ${hasTools ? 'Active' : 'Empty'})`);

                    const fetchRes = await fetch(`${targetUrl}/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                    });

                    fetchRes.headers.forEach((val, key) => res.setHeader(key, val));
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.writeHead(fetchRes.status);

                    if (requestData.stream) {
                        const reader = fetchRes.body.getReader();
                        async function nativePump() {
                            const { done, value } = await reader.read();
                            if (done) return res.end();
                            res.write(value);
                            nativePump();
                        }
                        return nativePump();
                    } else {
                        const data = await fetchRes.text();
                        return res.end(data);
                    }
                }

                // If we reach here, we are doing a SURGICAL INTERCEPT
                console.log(`[Proxy-Router] 🛡️ Guardian Active for: ${requestData.model}`);

                // INBOUND TRANSLATOR (IDE Name -> LLM Name)
                if (requestData.tools && modelConfig.tool_translator) {
                    let translatedCount = 0;
                    requestData.tools.forEach(tool => {
                        const map = modelConfig.tool_translator.find(m => m.tool_ide === tool.function.name);
                        if (map && tool.function.name) {
                            tool.function.name = map.tool_llm;
                            translatedCount++;
                        }
                    });
                    if (translatedCount > 0) {
                        console.log(`[Proxy-Router] 🔄 Translated ${translatedCount} tool schemas to LLM format.`);
                    }
                }

                // We ALWAYS want the backend to give us a stream so we can intercept dynamically
                const isClientExpectingStream = requestData.stream === true;
                requestData.stream = true;

                const fetchRes = await fetch(`${targetUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });

                // Set headers for True Streaming back to OpenCode
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });

                const reader = fetchRes.body.getReader();
                const decoder = new TextDecoder('utf-8');

                // Buffer State Variables
                let isBuffering = false;
                let textAccumulator = "";
                let exactToolBuffer = "";
                let latestTemplateChunk = null;

                async function streamPump() {
                    const { done, value } = await reader.read();

                    if (done) {
                        // End of stream logic: Process whatever is in the buffer
                        // Pass modelConfig into processAndEmitToolCalls correctly!
                        if (isBuffering && exactToolBuffer.trim().length > 0) {
                            const success = processAndEmitToolCalls(exactToolBuffer, latestTemplateChunk, res, modelConfig);
                            if (!success) {
                                // Fallback: Flush the raw strings using Safe Chunk Builder
                                const chunkObj = buildChunk(latestTemplateChunk, { role: "assistant", content: exactToolBuffer });
                                res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
                            }
                        } else if (textAccumulator.length > 0) {
                            // Flush remaining regular text
                            const chunkObj = buildChunk(latestTemplateChunk, { role: "assistant", content: textAccumulator });
                            res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
                        }

                        // Seal the stream
                        res.write(`data: [DONE]\n\n`);
                        return res.end();
                    }

                    const chunkStr = decoder.decode(value, { stream: true });
                    const lines = chunkStr.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                const payload = JSON.parse(line.substring(6));
                                if (payload.id) latestTemplateChunk = payload; // Only update if it's a valid chunk with ID

                                const content = payload.choices?.[0]?.delta?.content || "";

                                if (!content) continue;

                                if (isBuffering) {
                                    // Heavy Buffering - Collect everything for the toolkit
                                    exactToolBuffer += content;
                                } else {
                                    // Light Accumulation - Check to see if a tool logic is starting
                                    textAccumulator += content;

                                    // Trigger recognition matrix:
                                    if (textAccumulator.includes('```json') || textAccumulator.includes('```') || textAccumulator.includes('{"name"') || textAccumulator.includes('[{"name"')) {
                                        console.log(`[Proxy-Engine] 🚨 Neural Trigger detected! Entering Silent Buffer...`);
                                        isBuffering = true;
                                        exactToolBuffer = textAccumulator; // Transition data
                                        textAccumulator = "";
                                    } else if (textAccumulator.length > 60) {
                                        // Safe length reached without a Tool Trigger. Flush to maintain conversation speed via Safe Builder.
                                        const chunkObj = buildChunk(latestTemplateChunk, { role: "assistant", content: textAccumulator });
                                        res.write(`data: ${JSON.stringify(chunkObj)}\n\n`);
                                        textAccumulator = "";
                                    }
                                }
                            } catch (e) {
                                // Fragmented JSON chunk, ignore until next pass
                            }
                        }
                    }
                    streamPump(); // Recurse
                }

                streamPump(); // Start the engine

            } catch (err) {
                console.error(`[Proxy-Core] Critical Failure:`, err.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        // 3. Generic Passthrough (e.g. /v1/models)
        let reqHeaders = { ...req.headers };
        delete reqHeaders.host;

        (async () => {
            try {
                const fetchRes = await fetch(`${targetUrl}${req.url}`, {
                    method: req.method,
                    headers: reqHeaders
                });
                const data = await fetchRes.text();
                res.writeHead(fetchRes.status, { 'Content-Type': fetchRes.headers.get('content-type') || 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(data);
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: "Backend disconnected" }));
            }
        })();
    }
});

setTimeout(() => {
    const listenPort = config.server?.listenPort || 3000;
    const target = config.server?.targetUrl || 'http://127.0.0.1:8080';
    server.listen(listenPort, () => {
        console.log(`\n============================================`);
        console.log(` 🚀 LSTT PROXY ONLINE (STREAMING) 🚀`);
        console.log(`============================================`);
        console.log(` 🔌 Port: ${listenPort}`);
        console.log(` 🎯 Target: ${target}`);
        console.log(` 🛡️ Status: Bidirectional Tool Mapping Active`);
        console.log(`============================================\n`);
    });
}, 200);
