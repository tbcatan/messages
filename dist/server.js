"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const sseMessages = new Map();
const messageVersions = new Map();
const receivers = new Set();
function initializeReceiver(receive) {
    sseMessages.forEach((message) => receive(message));
}
function notifyAllReceivers(sseMessage) {
    receivers.forEach((receive) => {
        try {
            receive(sseMessage);
        }
        catch (e) {
            console.error(e);
        }
    });
}
app.post("/message/:key/:version", (request, response) => {
    var _a, _b;
    const key = request.params.key;
    const version = request.params.version;
    if (!/^(\w|-)+$/.test(key)) {
        response.status(400).json({ error: "Bad key" });
        return;
    }
    if (!/^[1-9][0-9]*$/.test(version) || version.length > 15) {
        response.status(400).json({ error: "Bad version" });
        return;
    }
    const currentVersion = (_a = messageVersions.get(key)) !== null && _a !== void 0 ? _a : 0;
    const messageVersion = currentVersion + 1;
    if (version !== String(messageVersion)) {
        response.status(400).json({ error: "Wrong version" });
        return;
    }
    const messageBody = JSON.stringify((_b = request.body) !== null && _b !== void 0 ? _b : null);
    const sseMessage = `event: ${key}\nid: ${key}/${messageVersion}\ndata: ${messageBody}\n\n`;
    sseMessages.set(key, sseMessage);
    messageVersions.set(key, messageVersion);
    notifyAllReceivers(sseMessage);
    response.status(200).send();
});
app.get("/messages", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    if (sseMessages.size === 0) {
        response.flushHeaders();
    }
    const receive = (message) => response.write(message);
    initializeReceiver(receive);
    receivers.add(receive);
    request.on("close", () => {
        receivers.delete(receive);
        response.end();
    });
});
app.get("/health", (request, response) => {
    response.status(200).send("Message server running");
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Message server started on port ${port}`);
});
