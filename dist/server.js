"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
let serverLastAccessed = performance.now();
const messageEvents = new Map();
const messageSnapshots = new Map();
const messageVersions = new Map();
function clearServerState() {
    messageEvents.clear();
    messageSnapshots.clear();
    messageVersions.clear();
}
const receivers = new Set();
function initializeReceiver(receive) {
    messageEvents.forEach((message, key) => receive(message, key));
}
function notifyReceivers(message, key) {
    receivers.forEach((receive) => {
        try {
            receive(message, key);
        }
        catch (e) {
            console.error(e);
        }
    });
}
const messageKeyRegex = /^(\w|-|\.)+$/;
app.post("/message/:key/:version", (request, response) => {
    var _a, _b;
    serverLastAccessed = performance.now();
    const key = request.params.key;
    const version = request.params.version;
    if (!messageKeyRegex.test(key)) {
        response.status(400).json({ error: "Bad key" });
        return;
    }
    if (!/^[1-9][0-9]*$/.test(version) || version.length > 15) {
        response.status(400).json({ error: "Bad version" });
        return;
    }
    if (request.headers["content-type"] !== "application/json") {
        response.status(400).json({ error: "Use content-type: application/json for JSON request bodies" });
        return;
    }
    const currentVersion = (_a = messageVersions.get(key)) !== null && _a !== void 0 ? _a : 0;
    const messageVersion = currentVersion + 1;
    if (version !== String(messageVersion)) {
        response.status(409).json({ error: "Version conflict" });
        return;
    }
    const messageId = { key: key, version: messageVersion };
    const messageData = (_b = request.body) !== null && _b !== void 0 ? _b : null;
    const messageEvent = `id: ${JSON.stringify(messageId)}\ndata: ${JSON.stringify(messageData)}\n\n`;
    const messageSnapshot = JSON.stringify({ id: messageId, data: messageData });
    messageEvents.set(key, messageEvent);
    messageSnapshots.set(key, messageSnapshot);
    messageVersions.set(key, messageVersion);
    notifyReceivers(messageEvent, key);
    response.status(200).send();
});
const messageFilterSchema = zod_1.z.object({
    matches: zod_1.z.string().regex(messageKeyRegex).array().nonempty().optional(),
    ["starts-with"]: zod_1.z.string().regex(messageKeyRegex).array().nonempty().optional(),
});
app.get("/messages", (request, response) => {
    var _a;
    serverLastAccessed = performance.now();
    const messageFilterParseResult = messageFilterSchema.safeParse(request.query);
    if (!messageFilterParseResult.success) {
        response.status(400).json({ error: "Bad filters", cause: messageFilterParseResult.error });
        return;
    }
    const messageFilters = messageFilterParseResult.data;
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    const matches = new Set(messageFilters.matches);
    const startsWith = (_a = messageFilters["starts-with"]) !== null && _a !== void 0 ? _a : [];
    const receive = messageFilters.matches || messageFilters["starts-with"]
        ? (message, key) => {
            if (matches.has(key) || startsWith.some((sw) => key.startsWith(sw))) {
                response.write(message);
            }
        }
        : (message) => response.write(message);
    initializeReceiver(receive);
    receivers.add(receive);
    request.on("close", () => {
        receivers.delete(receive);
        response.end();
    });
});
app.get("/messages/snapshot", (request, response) => {
    var _a;
    serverLastAccessed = performance.now();
    const messageFilterParseResult = messageFilterSchema.safeParse(request.query);
    if (!messageFilterParseResult.success) {
        response.status(400).json({ error: "Bad filters", cause: messageFilterParseResult.error });
        return;
    }
    const messageFilters = messageFilterParseResult.data;
    const matches = new Set(messageFilters.matches);
    const startsWith = (_a = messageFilters["starts-with"]) !== null && _a !== void 0 ? _a : [];
    const snapshots = (messageFilters.matches || messageFilters["starts-with"]
        ? [...messageSnapshots].filter(([key, _]) => matches.has(key) || startsWith.some((sw) => key.startsWith(sw)))
        : [...messageSnapshots]).map(([_, message]) => message);
    const snapshot = `[${snapshots.join(",")}]`;
    response.setHeader("Content-Type", "application/json");
    response.status(200).send(snapshot);
});
app.get("/health", (request, response) => {
    response.status(200).send("Message server running");
});
const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));
const port = process.env.PORT || 3000;
const address = process.env.ADDRESS;
const pingIntervalSeconds = process.env.PING_INTERVAL_SECONDS;
const pingIntervalMilliseconds = pingIntervalSeconds ? Number(pingIntervalSeconds) * 1000 : undefined;
const resetIntervalSeconds = process.env.RESET_INTERVAL_SECONDS;
const resetIntervalMilliseconds = resetIntervalSeconds ? Number(resetIntervalSeconds) * 1000 : undefined;
app.listen(port, () => {
    console.log(`Message server started on port ${port}`);
    if (address && pingIntervalMilliseconds) {
        const ping = () => sleep(pingIntervalMilliseconds)
            .then(() => fetch(`${address}/health`))
            .then((response) => console.log("Pinged message server", response))
            .catch((error) => console.error("Pinged message server", error))
            .then(ping);
        ping();
    }
    if (resetIntervalMilliseconds) {
        serverLastAccessed = performance.now();
        const checkIntervalMilliseconds = pingIntervalMilliseconds || resetIntervalMilliseconds;
        const reset = () => sleep(checkIntervalMilliseconds)
            .then(() => {
            if (performance.now() - serverLastAccessed > resetIntervalMilliseconds) {
                clearServerState();
            }
        })
            .then(() => console.log("Message server reset"))
            .catch((error) => console.error("Error resetting message server", error))
            .then(reset);
        reset();
    }
});
