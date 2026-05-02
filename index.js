const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const events = require('events');
const fs = require('fs');
const pairRouter = require('./pair.js');

const app = express();
const PORT = process.env.PORT || 2001;

events.EventEmitter.defaultMaxListeners = 500;

// =====================================================
// 🔧 MIDDLEWARE
// =====================================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =====================================================
// 🌐 ROUTES WEB
// =====================================================
app.use('/code', pairRouter);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pair.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'qr.html'));
});

app.get('/delete', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'delete.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'main.html'));
});

app.use('/dashboard', express.static(path.join(process.cwd(), 'dashboard_static')));

// =====================================================
// 🔐 ADMIN MIDDLEWARE
// =====================================================
function requireAdminPass(req, res, next) {
  const pass = req.headers['x-admin-pass'] || req.body?.adminPass;
  if (pass === 'adminowner') return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// =====================================================
// 🧹 DELETE SESSION API
// =====================================================
app.post('/api/session/delete', requireAdminPass, async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });

    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    console.log(`🗑️ Session supprimée: ${sanitized}`);

    return res.json({ ok: true, message: `Session ${sanitized} removed` });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// =====================================================
// 🤖 BOT HANDLER
// =====================================================
function initBotHandler(sock) {

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];

    // ===== SAFE CHECK (ANTI CRASH) =====
    if (!m || !m.message || !m.key) return;

    const chat = m.key.remoteJid;

    const body =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      "";

    const prefix = "/";
    if (!body.startsWith(prefix)) return;

    const command = body.slice(prefix.length).trim().toLowerCase();

    // =====================================================
    // 📌 COMMAND LIST
    // =====================================================
    const validCommands = [
      "menu","allmenu","ping","aide","help","owner","repo",
      "hidetag","tagall","wanted","wasted","pair","hd","code",
      "mode","menu2","tech",

      "kick","add","leave","mute","unmute","swgc","setgpp",
      "listadmin","creategroup","acceptall","revokeall",
      "listactive","listinactive","kickinactive","kickall",
      "kickall2","poll","demoteall","promoteall",
      "antilink","antistatusmention",

      "sticker","take","trt","tovn","save","vv","bible",
      "upch","img","jid","cjid","rch","getpp","setpp",
      "setpath","getpath","ssweb","checkban","shazam",
      "mediafire",

      "play","play2","tiktok","facebook","ig","modapk",
      "ytmp4","alive","test",

      "config show","config autoview","config autolike",
      "config autorec","config setemoji","config setprefix"
    ];

    const isCommand = validCommands.includes(command);

    // =====================================================
    // ❌ UNKNOWN COMMAND
    // =====================================================
    if (!isCommand) {

      const imagePath = "./menu2.jpg";

      const buffer = fs.existsSync(imagePath)
        ? fs.readFileSync(imagePath)
        : null;

      const unknownText = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ❓ 𝐔𝐍𝐊𝐍𝐎𝐖𝐍 𝐂𝐎𝐌𝐌𝐀𝐍𝐃
│ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ *${prefix}${command}* ᴅᴏᴇs ɴᴏᴛ ᴇxɪsᴛ.
│
│ᴛʏᴘᴇ *${prefix}menu* ᴛᴏ sᴇᴇ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs.
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim();

      if (buffer) {
        await sock.sendMessage(chat, {
          image: buffer,
          caption: unknownText,
          buttons: [
            {
              buttonId: `${prefix}menu`,
              buttonText: { displayText: "📜 MENU" },
              type: 1
            }
          ],
          headerType: 4
        }, { quoted: m });

      } else {
        await sock.sendMessage(chat, {
          text: unknownText
        }, { quoted: m });
      }

      return;
    }

    // =====================================================
    // ✅ COMMAND SYSTEM
    // =====================================================
    switch (command) {

      case "menu":
        await sock.sendMessage(chat, {
          text: "📜 MENU DU BOT"
        }, { quoted: m });
        break;

      case "ping":
        await sock.sendMessage(chat, {
          text: "🏓 Pong!"
        }, { quoted: m });
        break;

      case "help":
      case "aide":
        await sock.sendMessage(chat, {
          text: "📌 Utilise /menu"
        }, { quoted: m });
        break;
    }

  });
}

// =====================================================
// 🚀 SERVER START
// =====================================================
app.listen(PORT, () => {
  console.log(`
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│  YOU WEB BOT SERVER
│
│  http://localhost:${PORT}
│  Dashboard: /dashboard
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`);
});

// =====================================================
// 📦 EXPORT
// =====================================================
module.exports = { app, initBotHandler };
