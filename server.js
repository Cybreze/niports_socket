const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const crypto = require("crypto");
const os = require("os");

// ================= CONFIG =================
const PORT = process.env.PORT || 3000;

// GPS51 credentials
const GPS51_USERNAME = "Niports";
const GPS51_PASSWORD = "Aa1357"; // plain password
const POLL_INTERVAL = 30000; // 30 seconds
// =========================================

// MD5 (32 chars, lowercase)
const MD5_PASSWORD = crypto
  .createHash("md5")
  .update(GPS51_PASSWORD)
  .digest("hex");

// ================= APP SETUP =================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ================= GPS51 STATE =================
let gpsToken = null;
let gpsServerId = null;
let lastKnownPositions = [];
let lastServerIP = null;

// ================= GET SERVER IP =================
function getServerIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "UNKNOWN";
}

// ================= LOGIN GPS51 =================
async function loginGPS51() {
  try {
    const res = await axios.post(
      "https://api.gps51.com/openapi?action=login",
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
          Accept: "application/json",
        },
        timeout: 15000,
      },
    );

    if (res.data?.token) {
      gpsToken = res.data.token;
      gpsServerId = res.data.serverid;

      console.log("GPS51 login successful");
      startPolling();
    } else {
      console.error("GPS51 login failed:", res.data);
    }
  } catch (err) {
    console.error("GPS51 login error:", err.message);
  }
}

// ================= POLLING =================
function startPolling() {
  setInterval(async () => {
    if (!gpsToken) return;

    // ---- IP CHANGE CHECK ----
    const currentIP = getServerIP();
    if (currentIP !== lastServerIP) {
      lastServerIP = currentIP;

      console.log("SERVER IP CHANGED:", currentIP);

      io.emit("gps:status", {
        message: "Server IP changed – whitelist this IP on GPS51",
        ip: currentIP,
        changed: true,
      });
    }

    try {
      const url = `https://gps51.com/openapi?action=lastposition&token=${gpsToken}&serverid=${gpsServerId}`;
      const res = await axios.get(url, { timeout: 15000 });

      lastKnownPositions = Array.isArray(res.data?.data) ? res.data.data : [];
    } catch (err) {
      console.error("GPS51 polling error:", err.message);
    }
  }, POLL_INTERVAL);
}

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("📱 Flutter client connected:", socket.id);

  // Send server IP immediately
  socket.emit("gps:status", {
    message: "Socket connected",
    ip: getServerIP(),
    changed: false,
  });

  // Track devices (single or multiple)
  socket.on("track:devices", ({ deviceids }) => {
    if (!Array.isArray(deviceids) || deviceids.length === 0) {
      socket.emit("gps:error", {
        message: "deviceids must be a non-empty array",
      });
      return;
    }

    const results = lastKnownPositions.filter((d) =>
      deviceids.includes(d.deviceid),
    );

    if (results.length === 0) {
      socket.emit("gps:error", {
        message: "No matching device found",
        deviceids,
      });
      return;
    }

    socket.emit("gps:update", {
      changed: true,
      count: results.length,
      data: results,
    });
  });

  socket.on("disconnect", () => {
    console.log("Flutter client disconnected:", socket.id);
  });
});

// ================= START SERVER =================
server.listen(PORT, () => {
  console.log(`Niports Socket Server running on port ${PORT}`);
  console.log("Server IP:", getServerIP());
  loginGPS51();
});

// /**
//  * Niports Tracking Socket Server (GPS51)
//  * --------------------------------------
//  * - POST login (JSON body)
//  * - Browser field set as requested
//  * - Token reused safely
//  * - Polling every 30s
//  * - Emits JSON to Flutter
//  * - Graceful handling when no lastposition data
//  */

// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const axios = require("axios");
// const crypto = require("crypto");

// // ================== CONFIG ==================
// //const PORT = 3000;
// const PORT = process.env.PORT || 3000;

// // GPS51 credentials
// const GPS51_USERNAME = "Niports";
// const GPS51_PASSWORD = "Aa1357";
// const POLL_INTERVAL = 30000; // 30 seconds
// // ============================================

// // MD5 password (32 digits, lowercase)
// const MD5_PASSWORD = crypto
//   .createHash("md5")
//   .update(GPS51_PASSWORD)
//   .digest("hex");

// // ================== APP SETUP ==================
// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: { origin: "*" },
// });

// // ================== GPS51 STATE ==================
// let gpsToken = null;
// let gpsServerId = null;
// let loginInProgress = false;
// let pollingStarted = false;

// // ================== GPS51 LOGIN ==================
// async function loginGPS51() {
//   if (loginInProgress || gpsToken) return;

//   loginInProgress = true;

//   const loginUrl = "https://api.gps51.com/openapi?action=login";

//   try {
//     const res = await axios.post(
//       loginUrl,
//       {
//         type: "USER",
//         from: "web",
//         username: GPS51_USERNAME,
//         password: MD5_PASSWORD,
//         browser: "Chrome/104.0.0.0",
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           "User-Agent": "Mozilla/5.0",
//           Accept: "application/json",
//         },
//         timeout: 15000,
//       },
//     );

//     console.log("Login response:", res.data);

//     if (res.data && res.data.token) {
//       gpsToken = res.data.token;
//       gpsServerId = res.data.serverid;
//       console.log("GPS51 login successful");

//       startPolling();
//     } else {
//       console.error("GPS51 login failed");
//     }
//   } catch (err) {
//     console.error("GPS51 login error:", err.message);
//   } finally {
//     loginInProgress = false;
//   }
// }

// // ================== POLLING ==================
// function startPolling() {
//   if (pollingStarted || !gpsToken) return;

//   pollingStarted = true;

//   setInterval(async () => {
//     try {
//       const url = `https://gps51.com/openapi?action=lastposition&token=${gpsToken}&serverid=${gpsServerId}`;
//       const res = await axios.get(url, {
//         headers: {
//           "User-Agent": "Mozilla/5.0",
//           Accept: "application/json",
//         },
//         timeout: 15000,
//       });

//       // Graceful handling of empty lastposition
//       let dataToEmit;
//       if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
//         dataToEmit = { lat: null, lng: null, status: "no data" };
//       } else {
//         dataToEmit = res.data;
//       }

//       console.log("Last position:", dataToEmit);
//       io.emit("gps:update", dataToEmit);
//     } catch (err) {
//       console.error("GPS51 polling error:", err.message);
//       io.emit("gps:update", { lat: null, lng: null, status: "error" });
//     }
//   }, POLL_INTERVAL);
// }

// // ================== SOCKET.IO ==================
// io.on("connection", (socket) => {
//   console.log("Flutter client connected:", socket.id);

//   socket.on("disconnect", () => {
//     console.log("Client disconnected:", socket.id);
//   });
// });

// // ================== START SERVER ==================
// server.listen(PORT, () => {
//   console.log(`Niports Socket Server running on port ${PORT}`);
//   loginGPS51(); // login ONCE at startup
// });
