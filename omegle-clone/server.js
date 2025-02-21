const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());
app.use(bodyParser.json());

let waitingUsers = [];
const adminSecretCode = "biggestboybusiness8";
const admins = new Map();
const bannedIPs = new Set();
const REPORT_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL";

app.post('/admin/signup', (req, res) => {
    const { username, password, secretCode } = req.body;
    if (secretCode !== adminSecretCode) {
        return res.status(403).json({ error: "Invalid secret code." });
    }
    admins.set(username, password);
    res.json({ success: true, message: "Signup successful! Please login to continue." });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (admins.has(username) && admins.get(username) === password) {
        res.json({ success: true, username });
    } else {
        res.status(403).json({ error: "Invalid credentials." });
    }
});

app.post('/admin/ban', (req, res) => {
    const { ip } = req.body;
    bannedIPs.add(ip);
    res.json({ success: true, message: "User has been banned." });
});

app.post('/report', async (req, res) => {
    const { reportedIP, reporterIP, reason } = req.body;
    const reportData = {
        content: "",
        embeds: [
            {
                title: "New User Report",
                fields: [
                    { name: "Reported IP", value: reportedIP, inline: true },
                    { name: "Reporter IP", value: reporterIP, inline: true },
                    { name: "Reason", value: reason }
                ],
                color: 16711680
            }
        ]
    };
    await fetch(REPORT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData)
    });
    res.json({ success: true, message: "Report submitted successfully." });
});

io.on('connection', (socket) => {
    const userIP = socket.handshake.address;
    if (bannedIPs.has(userIP)) {
        socket.disconnect();
        return;
    }

    socket.on('findMatch', ({ type, tags }) => {
        const matchIndex = waitingUsers.findIndex(user => user.type === type && user.tags.some(tag => tags.includes(tag)));
        
        if (matchIndex !== -1) {
            const match = waitingUsers.splice(matchIndex, 1)[0];
            socket.partner = match;
            match.partner = socket;
            socket.emit('chatStart');
            match.emit('chatStart');
            socket.emit('statusUpdate', 'Connected to a stranger');
            match.emit('statusUpdate', 'Connected to a stranger');
        } else {
            socket.type = type;
            socket.tags = tags;
            socket.partner = null;
            waitingUsers.push(socket);
            socket.emit('statusUpdate', 'Waiting for a stranger...');
        }
    });

    socket.on('disconnectChat', () => {
        if (socket.partner) {
            socket.partner.emit('partnerDisconnect');
            socket.partner.emit('statusUpdate', 'Stranger disconnected. Waiting for a new match...');
            socket.partner.partner = null;
        }
        socket.partner = null;
    });

    socket.on('disconnect', () => {
        waitingUsers = waitingUsers.filter(user => user !== socket);
        if (socket.partner) {
            socket.partner.emit('partnerDisconnect');
            socket.partner.emit('statusUpdate', 'Stranger disconnected. Waiting for a new match...');
            socket.partner.partner = null;
        }
    });
});

server.listen(3000, () => console.log('Server running on port 3000'));
