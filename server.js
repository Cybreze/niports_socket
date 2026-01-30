/**
 * Niports Tracking Socket Server (GPS51)
 * --------------------------------------
 * - POST login (JSON body)
 * - Browser field set as requested
 * - Token reused safely
 * - Polling every 30s
 * - Emits JSON to Flutter
 * - Graceful handling when no lastposition data
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const crypto = require("crypto");

// ================== CONFIG ==================
//const PORT = 3000;
const PORT = process.env.PORT || 3000;

// GPS51 credentials
const GPS51_USERNAME = "Niports";
const GPS51_PASSWORD = "Aa1357";
const POLL_INTERVAL = 30000; // 30 seconds
// ============================================

// MD5 password (32 digits, lowercase)
const MD5_PASSWORD = crypto
  .createHash("md5")
  .update(GPS51_PASSWORD)
  .digest("hex");

// ================== APP SETUP ==================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ================== GPS51 STATE ==================
let gpsToken = null;
let gpsServerId = null;
let loginInProgress = false;
let pollingStarted = false;

// ================== GPS51 LOGIN ==================
async function loginGPS51() {
  if (loginInProgress || gpsToken) return;

  loginInProgress = true;

  const loginUrl = "https://api.gps51.com/openapi?action=login";

  try {
    const res = await axios.post(
      loginUrl,
      {
        type: "USER",
        from: "web",
        username: GPS51_USERNAME,
        password: MD5_PASSWORD,
        browser: "Chrome/104.0.0.0",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
        timeout: 15000,
      },
    );

    console.log("Login response:", res.data);

    if (res.data && res.data.token) {
      gpsToken = res.data.token;
      gpsServerId = res.data.serverid;
      console.log("GPS51 login successful");

      startPolling();
    } else {
      console.error("GPS51 login failed");
    }
  } catch (err) {
    console.error("GPS51 login error:", err.message);
  } finally {
    loginInProgress = false;
  }
}

// ================== POLLING ==================
function startPolling() {
  if (pollingStarted || !gpsToken) return;

  pollingStarted = true;

  setInterval(async () => {
    try {
      const url = `https://gps51.com/openapi?action=lastposition&token=${gpsToken}&serverid=${gpsServerId}`;
      const res = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
        timeout: 15000,
      });

      // Graceful handling of empty lastposition
      let dataToEmit;
      if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
        dataToEmit = { lat: null, lng: null, status: "no data" };
      } else {
        dataToEmit = res.data;
      }

      console.log("Last position:", dataToEmit);
      io.emit("gps:update", dataToEmit);
    } catch (err) {
      console.error("GPS51 polling error:", err.message);
      io.emit("gps:update", { lat: null, lng: null, status: "error" });
    }
  }, POLL_INTERVAL);
}

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {
  console.log("Flutter client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ================== START SERVER ==================
server.listen(PORT, () => {
  console.log(`Niports Socket Server running on port ${PORT}`);
  loginGPS51(); // login ONCE at startup
});
