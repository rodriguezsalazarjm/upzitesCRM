// Mock mínimo de la REST API de Upstash (/pipeline) con SET NX EX + INCR.
import http from "node:http";
const store = new Map();
let calls = 0;
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/__stats") { res.end(JSON.stringify({ calls, keys: [...store.keys()] })); return; }
    if (req.headers.authorization !== "Bearer test-token") { res.statusCode = 401; res.end("{}"); return; }
    calls++;
    const out = JSON.parse(body).map(([cmd, key, ...args]) => {
      const now = Date.now();
      const e = store.get(key);
      if (e && e.exp <= now) store.delete(key);
      if (cmd === "SET") {
        if (store.has(key)) return { result: null };
        store.set(key, { v: Number(args[0]), exp: now + Number(args[2]) * 1000 });
        return { result: "OK" };
      }
      if (cmd === "INCR") {
        const cur = store.get(key) ?? { v: 0, exp: Infinity };
        cur.v += 1; store.set(key, cur); return { result: cur.v };
      }
      return { error: "unsupported" };
    });
    // Latencia para que la concurrencia sea real.
    setTimeout(() => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(out)); }, 20);
  });
}).listen(8799, () => console.log("upstash mock on 8799"));
