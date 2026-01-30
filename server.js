const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const crypto = require("crypto");

// ================= CONFIG =================
const PORT = process.env.PORT || 3000; // Render or any host port
const GPS51_USERNAME = "Niports"; // your GPS51 username
const GPS51_PASSWORD = "Aa1357"; // your plain password
const GPS51_BROWSER = "Chrome/104.0.0.0";
// =========================================

// MD5 password required by GPS51
const MD5_PASSWORD = crypto
  .createHash("md5")
  .update(GPS51_PASSWORD)
  .digest("hex");

// ================= APP ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ================= GPS51 STATE ============
let gpsToken = null;
let gpsServerId = null;
let loginInProgress = false;

// ================= PUBLIC IP LOGGING =======
async function getPublicIP() {
  try {
    const res = await axios.get("https://api.ipify.org?format=json");
    console.log("Server public IP (for GPS51 whitelist):", res.data.ip);
  } catch (err) {
    console.error("Could not fetch public IP:", err.message);
  }
}
getPublicIP();

// ================= GPS51 LOGIN ============
async function loginGPS51() {
  if (gpsToken || loginInProgress) return;

  loginInProgress = true;

  try {
    const res = await axios.post(
      "https://api.gps51.com/openapi?action=login",
      {
        type: "USER",
        from: "web",
        username: GPS51_USERNAME,
        password: MD5_PASSWORD,
        browser: GPS51_BROWSER,
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

    if (res.data && res.data.token) {
      gpsToken = res.data.token;
      gpsServerId = res.data.serverid;
      console.log("GPS51 login successful");
    } else {
      console.error("GPS51 login failed:", res.data);
    }
  } catch (err) {
    console.error("GPS51 login error:", err.message);
  } finally {
    loginInProgress = false;
  }
}

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("📱 Flutter client connected:", socket.id);

  // Flutter sends a list of deviceIds
  socket.on("get:last_position", async ({ deviceIds }) => {
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      socket.emit("gps:error", {
        message: "deviceIds must be a non-empty array",
      });
      return;
    }

    // Ensure GPS51 login
    if (!gpsToken) {
      await loginGPS51();
    }

    const results = [];

    for (const deviceId of deviceIds) {
      try {
        const url =
          `https://gps51.com/openapi?action=lastposition` +
          `&token=${gpsToken}` +
          `&serverid=${gpsServerId}` +
          `&deviceid=${deviceId}`;

        const res = await axios.get(url, { timeout: 15000 });

        results.push({
          deviceId,
          response: res.data,
        });
      } catch (err) {
        results.push({
          deviceId,
          error: err.message,
        });
      }
    }

    // Emit results only to the requesting client
    socket.emit("gps:last_position", results);
  });

  socket.on("disconnect", () => {
    console.log("Flutter client disconnected:", socket.id);
  });
});

// ================= START SERVER ===========
server.listen(PORT, async () => {
  console.log(`Niports Socket Server running on port ${PORT}`);
  await loginGPS51();
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
