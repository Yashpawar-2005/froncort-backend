import * as Y from "yjs";
import WebSocket from "ws";
const docs = new Map();

export const setupWSConnection = (conn, req, { docName = "default-room" } = {}) => {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docName, doc);
  }

  const awareness = new Map();

  conn.on("message", (message) => {
    const update = new Uint8Array(message);
    Y.applyUpdate(doc, update);
    for (const client of Array.from(docs.get(docName).connections || [])) {
      if (client !== conn && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  conn.on("close", () => {
    console.log(`❌ Connection closed for room: ${docName}`);
  });

  console.log(`🧠 New client joined room: ${docName}`);
};
