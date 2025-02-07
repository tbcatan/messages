import cors from "cors";
import express from "express";

const app = express();
app.use(cors());
app.use(express.json());

const sseMessages = new Map<string, string>();
const messageVersions = new Map<string, number>();

const receivers = new Set<(message: string) => void>();

function initializeReceiver(receive: (message: string) => void) {
  sseMessages.forEach((message) => receive(message));
}

function notifyAllReceivers(sseMessage: string) {
  receivers.forEach((receive) => {
    try {
      receive(sseMessage);
    } catch (e) {
      console.error(e);
    }
  });
}

app.post("/message/:key/:version", (request, response) => {
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

  const currentVersion = messageVersions.get(key) ?? 0;
  const messageVersion = currentVersion + 1;
  if (version !== String(messageVersion)) {
    response.status(400).json({ error: "Wrong version" });
    return;
  }

  const messageBody = JSON.stringify(request.body ?? null);
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

  const receive = (message: string) => response.write(message);
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
