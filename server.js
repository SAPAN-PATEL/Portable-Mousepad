const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');
const qrcode = require('qrcode-terminal');

const PORT = 3000;

// 1. Detect local IPv4 address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Check for IPv4 and make sure it's not internal (loopback)
            if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// 2. Spawn Swift driver process
console.log('Launching native Swift input driver...');
const driver = spawn('./mouse-driver', [], { stdio: ['pipe', 'inherit', 'inherit'] });

driver.on('exit', (code) => {
    console.log(`Swift input driver exited with code ${code}`);
    process.exit(code || 0);
});

driver.on('error', (err) => {
    console.error('Failed to start Swift input driver:', err);
    console.log('Please ensure the driver is compiled by running: swiftc -o mouse-driver driver.swift');
    process.exit(1);
});

// 3. Setup Express app & HTTP Server
const app = express();
app.use(express.static('public'));

const server = http.createServer(app);

// 4. Setup WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Mobile client connected from ${ip}`);

    ws.on('message', (message) => {
        const commandStr = message.toString().trim();
        if (!commandStr) return;

        // Pipe directly to the driver stdin
        try {
            driver.stdin.write(`${commandStr}\n`);
        } catch (err) {
            console.error('Error writing command to driver stdin:', err);
        }
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Mobile client disconnected`);
    });

    ws.on('error', (err) => {
        console.error('[WebSocket] Connection error:', err);
    });
});

// 5. Start server and display URL + QR code
server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    const serverUrl = `http://${localIP}:${PORT}`;

    console.log('\n==================================================');
    console.log('         PORTABLE TRACKPAD SERVER RUNNING         ');
    console.log(`  Access URL: ${serverUrl}`);
    console.log('==================================================\n');

    qrcode.generate(serverUrl, { small: true }, (qrCodeText) => {
        console.log(qrCodeText);
        console.log('Scan the QR code above with your Android phone to open the trackpad UI!\n');
    });
});

// 6. Handle graceful shutdown
const shutdown = () => {
    console.log('\nShutting down server and driver...');
    driver.kill('SIGTERM');
    server.close(() => {
        console.log('Server stopped.');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
