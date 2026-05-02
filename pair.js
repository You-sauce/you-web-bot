const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const yts = require('yt-search');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const { loadPlugins } = require('./pluginLoader');
const plugins = loadPlugins();
const { sms, downloadMediaMessage } = require('./msg')
const { createStickerFromMedia, sendSticker } = require('./s-utils');
const { getGroupAdminsInfo, jidToNumber } = require('./normalize');
const { uploadFile: uploadCloudku } = require("cloudku-uploader");
const FormData = require("form-data");
const fancy = require('./lib/style');
// dans ton switch principal
const { groupStatus, buildStatusContent } = require('./status');
const { handleAntiLink } = require('./antilink');
const { toggleAntiLink, isAntiLinkEnabled } = require('./antilink');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');
const {
  toggleWelcome,
  toggleGoodbye,
  isWelcomeEnabled,
  isGoodbyeEnabled,
  setWelcomeTemplate,
  setGoodbyeTemplate,
  handleParticipantUpdate
} = require('./welcome_goodbye');
const translate = require('@vitalets/google-translate-api');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  downloadContentFromMessage,
  DisconnectReason
} = require('@ryuu-reinzz/baileys');
const { jidNormalizedUser } = require('@ryuu-reinzz/baileys')
// Au début de ton fichier, après les imports
if (!global.scheduledRestart) {
    global.scheduledRestart = null;
}
// Variable globale pour stocker la dernière traduction
let lastTranslationText = "";

// Optionnel: Sauvegarder l'état au redémarrage
process.on('exit', () => {
    if (global.scheduledRestart?.timer) {
        console.log('⏰ Schedule restart arrêté (process exit)');
    }
});
// ---------------- CONFIG ----------------

// main.js (ou handlers.js)
const BOT_NAME_FANCY = '𝒀𝑶𝑼 𝑾𝑬𝑩 𝑩𝑶𝑻 𝑰𝑺 𝑶𝑵𝑳𝑰𝑵𝑬🌟';;

function toSmallCaps(text = '') {

    const normal =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const small =
        "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

    return String(text)
        .split('')
        .map(char => {

            const index = normal.indexOf(char);

            return index !== -1
                ? small[index]
                : char;

        })
        .join('');
}

  // en haut de mongo_utils.js (ou ton helper)
const DEFAULT_SESSION_CONFIG = {
  AUTO_VIEW_STATUS: true,
  AUTO_LIKE_STATUS: true,
  AUTO_RECORDING: false,
  AUTO_LIKE_EMOJI: ['🌟','🔥','💀','👑','💪','😎','🇭🇷','⚡','🇺🇸','❤️'],
  PREFIX: '.',
  MODE: 'public',
  AUTO_ONLINE: false,
  ANTI_TAG_MODE: true
};
const config = {
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/CBRK4PokeEe9uqDeoilacn',
  RCD_IMAGE_PATH: 'https://i.postimg.cc/ryKQw2bh/file-00000000e5c8722f8c2efcc40b0a0446.png',
  NEWSLETTER_JID: '120363426341519710@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '447781508638',
  PREMIUM:'50941319791@s.whatsapp.net',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbCtUug4o7qTFq7fpX1W',
  BOT_NAME: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
  BOT_VERSION: '1.0.0',
  OWNER_NAME: '𝐘ꭷ︩︪֟፝͡υ  ƚᩬᩧ𝛆̽ɕ͛¢н᥊🌙',
  IMAGE_PATH: 'https://i.postimg.cc/HkHw5qSN/file-0000000031f871fdbb71e79065924655.png',
  BOT_FOOTER:  '*ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*',
  BUTTON_IMAGES: { ALIVE: 'https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png' }
};


// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://kaviduinduwara:kavidu2008@cluster0.bqmspdf.mongodb.net/soloBot?retryWrites=true&w=majority&appName=Cluster0'; // configure in .env
const MONGO_DB = process.env.MONGO_DB || 'basebot_db'
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

async function loadSessionConfigMerged(number) {
  const sanitized = String(number).replace(/[^0-9]/g, '');
  // charge la config brute depuis la DB
  const dbCfg = await loadUserConfigFromMongo(sanitized) || {};
  // fusionne : les valeurs en DB écrasent les defaults
  const merged = { ...DEFAULT_SESSION_CONFIG, ...dbCfg };
  return merged;
}

// Helpers Mongo pour persister le schedule
async function getRestartSchedule() {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  const doc = await col.findOne({ key: 'schedule' });
  return doc ? doc : null;
}

async function setRestartSchedule(minutes) {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  await col.updateOne(
    { key: 'schedule' },
    { $set: { minutes, active: true, updatedAt: Date.now() } },
    { upsert: true }
  );
}

async function stopRestartSchedule() {
  await initMongo();
  const col = mongoDB.collection('restart_schedule');
  await col.updateOne(
    { key: 'schedule' },
    { $set: { active: false, updatedAt: Date.now() } },
    { upsert: true }
  );
}

// Assure-toi que initMongo() initialise `mongoDB` (ex: mongoDB = client.db(process.env.MONGO_DB))

(async () => {
  const doc = await getRestartSchedule();
  if (doc && doc.active && doc.minutes > 0) {
    global.restartTimer = setInterval(() => {
      console.log(`🔄 Restart automatique (${doc.minutes} minutes)`);
      process.exit(0);
    }, doc.minutes * 60 * 1000);
    global.restartInterval = doc.minutes;
    console.log(`✅ Schedule restart restauré: toutes les ${doc.minutes} minutes`);
  }
})();

/**
 * Crée les index recommandés pour la collection status_infractions.
 * Appelle cette fonction au démarrage de l'app.
 */
async function ensureStatusInfractionsIndex() {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    // index composé pour recherches rapides et upserts uniques
    await col.createIndex({ sessionId: 1, groupId: 1, participant: 1 }, { unique: true });
    // index sur lastAt pour purge/maintenance
    await col.createIndex({ lastAt: 1 });
  } catch (e) {
    console.warn('ensureStatusInfractionsIndex error', e);
  }
}

/**
 * Récupère le document d'infraction pour une session/groupe/participant.
 * Retourne null si absent ou en cas d'erreur.
 */
async function getStatusInfractionDoc(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return null;
    return await col.findOne({ sessionId: s, groupId: g, participant: p });
  } catch (e) {
    console.error('getStatusInfractionDoc', e);
    return null;
  }
}

/**
 * Incrémente le compteur d'infractions et renvoie la valeur après incrément.
 * Si l'opération échoue, renvoie 1 par défaut.
 */
async function incrStatusInfraction(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const now = Date.now();
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return 1;

    const res = await col.findOneAndUpdate(
      { sessionId: s, groupId: g, participant: p },
      { $inc: { count: 1 }, $set: { lastAt: now } },
      { upsert: true, returnDocument: 'after' } // driver mongodb v4+
    );

    const value = res && res.value ? res.value : null;
    if (value && typeof value.count === 'number') return value.count;

    // fallback : lire explicitement
    const doc = await col.findOne({ sessionId: s, groupId: g, participant: p });
    return doc && typeof doc.count === 'number' ? doc.count : 1;
  } catch (e) {
    console.error('incrStatusInfraction', e);
    return 1;
  }
}

/**
 * Réinitialise (supprime) le document d'infraction pour la clé donnée.
 * Retourne true si OK, false sinon.
 */
async function resetStatusInfraction(sessionId, groupId, participant) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    if (!s || !g || !p) return false;
    await col.deleteOne({ sessionId: s, groupId: g, participant: p });
    return true;
  } catch (e) {
    console.error('resetStatusInfraction', e);
    return false;
  }
}

/**
 * Définit explicitement le compteur d'infractions (upsert).
 * Retourne true si OK, false sinon.
 */
async function setStatusInfractionCount(sessionId, groupId, participant, count) {
  try {
    await initMongo();
    const col = mongoDB.collection('status_infractions');
    const s = String(sessionId || '');
    const g = String(groupId || '');
    const p = String(participant || '');
    const c = Number.isFinite(Number(count)) ? Number(count) : 0;
    if (!s || !g || !p) return false;
    await col.updateOne(
      { sessionId: s, groupId: g, participant: p },
      { $set: { count: c, lastAt: Date.now() } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('setStatusInfractionCount', e);
    return false;
  }
}
// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getHaitiTimestamp() { 
  return moment().tz('America/Port-au-Prince').format('dddd D MMMM YYYY, HH:mm:ss');
}

// Résultat : "lundi 27 janvier 2025, 15:30:45"
const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();
// ============================================================
// ANTIDELETE STORE — Store en mémoire par session
// ============================================================
const messageStores = new Map(); // sessionNumber → Map<msgId, msgObject>

const STORE_MAX_PER_SESSION = 500;  // quota max par session
const STORE_CLEAN_INTERVAL  = 20 * 60 * 1000; // nettoyage toutes les 20 min

function getSessionStore(sessionNumber) {
  if (!messageStores.has(sessionNumber)) {
    messageStores.set(sessionNumber, new Map());
  }
  return messageStores.get(sessionNumber);
}

function storeMessage(sessionNumber, msg) {
  if (!msg?.key?.id || !msg?.message) return;
  const store = getSessionStore(sessionNumber);

  // Quota dépassé → vider les 100 plus anciens
  if (store.size >= STORE_MAX_PER_SESSION) {
    const keys = [...store.keys()].slice(0, 100);
    keys.forEach(k => store.delete(k));
  }

  store.set(msg.key.id, msg);
}

function getStoredMessage(sessionNumber, msgId) {
  return getSessionStore(sessionNumber).get(msgId) || null;
}

// Nettoyage automatique toutes les 20 min
setInterval(() => {
  for (const [sessionNumber, store] of messageStores.entries()) {
    store.clear();
    console.log(`[ANTIDELETE] Store nettoyé pour session ${sessionNumber}`);
  }
}, STORE_CLEAN_INTERVAL);

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
  const caption = formatMessage(botName, `📞 ɴᴜᴍʙᴇʀ: ${number}\n🩵 sᴛᴀᴛᴜᴛ: ${groupStatus}\n🕒 ᴄᴏɴɴᴇᴄᴛᴇ́ ᴀ: ${getHaitiTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.RCD_IMAGE_PATH;

    const groupStatus = groupResult.status === 'success' 
      ? `✅ Rejoint (ID: ${groupResult.gid})` 
      : `❌ Échec: ${groupResult.error}`;
    
    // Message très simple et clair
    const caption = `╭┄┄「 ⊹ ࣪ ˖𝐍𝐎𝐓𝐈𝐅𝐈𝐂𝐀𝐓𝐈𝐎𝐍 ⊹ ࣪ ˖ 」
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ: ${botName}
│. ˚˖𓍢ִ໋📱 ɴᴜᴍᴇ́ʀᴏ: ${number}
│. ˚˖𓍢ִ໋🩵 sᴛᴀᴛᴜᴛ: ${groupStatus}
│. ˚˖𓍢ִ໋🕒 ᴄᴏɴɴᴇᴄᴛᴇ́: ${getHaitiTimestamp()}
│. ˚˖𓍢ִ໋👥 sᴇssɪᴏɴs: ${activeCount}
│. ˚˖𓍢ִ໋📍 ғᴜsᴇᴀᴜ: ʙʀᴇ́sɪʟ
│. ˚˖𓍢ִ໋📊 ᴘᴇʀғᴏʀᴍᴀɴᴄᴇ: ${activeCount > 5 ? "ᴇ́ʟᴇᴠᴇ́ᴇ" : "ɴᴏʀᴍᴀʟᴇ"}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

⚠️ ɴᴏᴛɪғɪᴄᴀᴛɪᴏɴ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ
${new Date().toLocaleString('fr-FR', { 
  timeZone: 'America/Port-au-Prince',
  dateStyle: 'medium',
  timeStyle: 'short'
})}`;

    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { 
        image: { url: image }, 
        caption: caption
      });
    } else {
      try {
        const buf = fs.readFileSync(image);
        await socket.sendMessage(ownerJid, { 
          image: buf, 
          caption: caption
        });
      } catch (e) {
        await socket.sendMessage(ownerJid, { 
          image: { url: config.RCD_IMAGE_PATH }, 
          caption: caption
        });
      }
    }
    
    console.log(`✅ Notification propriétaire envoyée (${activeCount} sessions)`);
    
  } catch (err) { 
    console.error('❌ Échec notification propriétaire:', err.message || err); 
  }
}
async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

// Assure-toi d'avoir importé ton helper en haut du fichier
// const { handleParticipantUpdate } = require('./welcome_goodbye');

/**
 * Enregistre les listeners liés aux participants de groupe.
 * Appelle cette fonction une seule fois après l'initialisation du socket.
 * @param {import('baileys').AnySocket} socket
 */
async function registerGroupParticipantListener(socket) {
  // on attache l'événement une seule fois
  socket.ev.on('group-participants.update', async (update) => {
    try {
      if (!update) return;

      // Compatibilité selon versions : id ou groupId
      const from = update.id || update?.groupId || null;
      if (!from) {
        console.warn('GROUP PARTICIPANTS UPDATE: missing group id', update);
        return;
      }

      // Normaliser participants (Baileys peut renvoyer participants ou participant)
      const participants = Array.isArray(update.participants)
        ? update.participants
        : (update.participant ? [update.participant] : []);

      if (!participants.length) return;

      // Log utile pour debug
      console.log('GROUP PARTICIPANTS UPDATE -> group:', from, 'action:', update.action, 'participants:', participants);

      // Appel du handler centralisé (welcome_goodbye.js)
      await handleParticipantUpdate(socket, from, update);

    } catch (e) {
      console.error('GROUP PARTICIPANTS UPDATE ERROR', e);
    }
  });
}
// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sanitizedNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    // UTILISER sanitizedNumber (déjà nettoyé) ; fallback minimal si absent
    const sessionId = (sanitizedNumber && String(sanitizedNumber).replace(/[^0-9]/g,''))
      || (socket?.authState?.creds?.me?.id || socket?.user?.id || message.key.participant || message.key.remoteJid || '')
           .split('@')[0].replace(/[^0-9]/g,'');

    console.log('[HANDLER] status event remoteJid:', message.key.remoteJid, 'participant:', message.key.participant);
    console.log('[HANDLER] using sessionId:', sessionId);

    if (!sessionId) {
      console.warn('[HANDLER] No sessionId available for status handler; skipping session-specific config');
      return;
    }

    const cfg = await loadSessionConfigMerged(sessionId);
    console.log('[HANDLER] merged cfg for', sessionId, cfg);

    try {
      if (cfg.AUTO_ONLINE) {
        console.log('[HANDLER] AUTO_ONLINE -> sending available presence');
        await socket.sendPresenceUpdate('available', message.key.remoteJid);
        setTimeout(async () => {
          try { await socket.sendPresenceUpdate('unavailable', message.key.remoteJid); }
          catch (e) { console.warn('[HANDLER] presence revert failed', e); }
        }, 5000);
      }

      if (cfg.AUTO_RECORDING) {
        await socket.sendPresenceUpdate('recording', message.key.remoteJid);
      }

      if (cfg.AUTO_VIEW_STATUS) {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; }
          catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries === 0) throw error; }
        }
      }

      if (cfg.AUTO_LIKE_STATUS) {
        const emojis = Array.isArray(cfg.AUTO_LIKE_EMOJI) && cfg.AUTO_LIKE_EMOJI.length ? cfg.AUTO_LIKE_EMOJI : config.AUTO_LIKE_EMOJI;
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(
              message.key.remoteJid,
              { react: { text: randomEmoji, key: message.key } },
              { statusJidList: [message.key.participant] }
            );
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

    } catch (error) {
      console.error('Status handler error:', error);
    }
  });
}
// downloader robuste
async function robustDownload(messageObj, downloader) {
  // messageObj peut être quoted, quoted.viewOnceMessage, imageMessage, etc.
  if (!messageObj) throw new Error('No message object provided to downloader');

  // extraire inner message si viewOnce
  const innerFromViewOnce = messageObj.viewOnceMessage?.message || messageObj;
  // trouver le type présent
  const qTypes = ['imageMessage','videoMessage','documentMessage','stickerMessage','audioMessage'];
  let inner = null;
  for (const t of qTypes) {
    if (innerFromViewOnce[t]) { inner = innerFromViewOnce[t]; break; }
  }
  // si aucun type trouvé, peut-être que messageObj est déjà le content
  if (!inner) {
    // essayer d'utiliser messageObj.imageMessage etc.
    for (const t of qTypes) {
      if (messageObj[t]) { inner = messageObj[t]; break; }
    }
  }
  if (!inner) inner = innerFromViewOnce;

  // déterminer le type pour downloadContentFromMessage
  let type = 'image';
  if (inner.videoMessage) type = 'video';
  else if (inner.documentMessage) type = 'document';
  else if (inner.audioMessage) type = 'audio';
  else if (inner.stickerMessage) type = 'sticker';
  else if (inner.imageMessage) type = 'image';

  // downloader peut être une fonction qui renvoie Buffer ou un stream async iterable
  if (typeof downloader !== 'function') throw new Error('Downloader function required');

  const streamOrBuffer = await downloader(inner, type);
  if (!streamOrBuffer) throw new Error('Downloader returned empty');

  if (Buffer.isBuffer(streamOrBuffer)) return streamOrBuffer;

  // sinon concaténer le stream async iterable
  const chunks = [];
  for await (const chunk of streamOrBuffer) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer || buffer.length === 0) throw new Error('Buffer vide après téléchargement');
  return buffer;
}
async function handleMessageRevocation(socket, number) {
  const sanitized = String(number || '').replace(/[^0-9]/g, '');
  const ownerJid  = `${sanitized}@s.whatsapp.net`;

  // ── Listener 1 : messages.delete ──
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys?.length) return;
    for (const key of keys) {
      try {
        await processRevoke(sanitized, ownerJid, socket, key.id, key.remoteJid, key.participant);
      } catch(e) { console.error('[AD messages.delete]', e); }
    }
  });

  // ── Listener 2 : protocolMessage REVOKE ──
  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      try {
        if (m?.message?.protocolMessage?.type !== 0) continue;
        const revokedKey = m.message.protocolMessage.key;
        if (!revokedKey?.id) continue;
        await processRevoke(
          sanitized, ownerJid, socket,
          revokedKey.id,
          revokedKey.remoteJid || m.key.remoteJid,
          revokedKey.participant || m.key.participant
        );
      } catch(e) { console.error('[AD REVOKE upsert]', e); }
    }
  });
}

// ── Fonction centrale de traitement ──
async function processRevoke(sanitized, ownerJid, socket, msgId, chatId, participant) {

  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  if (!cfg.antidelete || cfg.antidelete === 'off') return;

  const mode      = cfg.antidelete;
  const isGroup   = (chatId || '').endsWith('@g.us');
  const isPrivate = (chatId || '').endsWith('@s.whatsapp.net');

  if (mode === 'g' && !isGroup)   return;
  if (mode === 'p' && !isPrivate) return;

  const deletedMsg = getStoredMessage(sanitized, msgId);
  if (!deletedMsg) {
    console.warn(`[ANTIDELETE][${sanitized}] ${msgId} absent du store`);
    return;
  }

  const senderNum    = (participant || chatId || '').split('@')[0];
  const deletionTime = getHaitiTimestamp();
  const context      = isGroup
    ? `👥 *ɢʀᴏᴜᴘᴇ :* ${chatId}\n`
    : `💬 *ᴘʀɪᴠᴇ́ :* +${senderNum}\n`;

  // ── Notification ──
  await socket.sendMessage(ownerJid, {
    text: 
          `╭┄┄「 ⊹ ࣪ ˖ *𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄* ⊹ ࣪ ˖ 」\n` +
          `│. ˚˖𓍢ִ໋👤 *ᴀᴜᴛᴇᴜʀ :* @${senderNum}\n` +
          `│. ˚˖𓍢ִ໋${context}` +
          `│. ˚˖𓍢ִ໋⏰ *ʜᴇᴜʀᴇ  :* ${deletionTime}\n` +
          `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
    mentions: [participant || chatId]
  });

  // ── Contenu ──
  const m = deletedMsg.message;
  if (!m) return;

  const internalTypes = [
    'protocolMessage', 'reactionMessage', 'pollUpdateMessage',
    'senderKeyDistributionMessage', 'messageContextInfo'
  ];

  const contentType = Object.keys(m).find(t => !internalTypes.includes(t));
  if (!contentType) return;

  // ── Texte ──
  if (contentType === 'conversation' || contentType === 'extendedTextMessage') {
    const text = m.conversation || m.extendedTextMessage?.text || '';
    if (text) {
      await socket.sendMessage(ownerJid, {
        text: `💬 *Contenu supprimé :*\n\n${text}`
      });
    }

  // ── Médias → forward direct ──
  } else if ([
    'imageMessage', 'videoMessage', 'audioMessage',
    'documentMessage', 'stickerMessage', 'gifMessage', 'ptvMessage'
  ].includes(contentType)) {
    try {
      await socket.sendMessage(ownerJid, {
        forward: deletedMsg,
        force: true
      });
    } catch(fwdErr) {
      console.error('[ANTIDELETE] forward échoué:', fwdErr.message);
      await socket.sendMessage(ownerJid, {
        text: `📎 *Média supprimé* _(${contentType.replace('Message', '')})_\n_Impossible de retransférer_`
      });
    }

  } else {
    console.log(`[ANTIDELETE][${sanitized}] type ignoré: ${contentType}`);
  }

  getSessionStore(sanitized).delete(msgId);
}
function generateTS() { return Math.floor(Date.now() / 1000); }
function generateTT(ts) { return CryptoJS.MD5(String(ts) + 'X-Fc-Pp-Ty-eZ').toString(); }

async function reelsvideo(url) {
  const ts = generateTS();
  const tt = generateTT(ts);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'hx-request': 'true',
    'hx-current-url': 'https://reelsvideo.io/',
    'hx-target': 'target',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://reelsvideo.io',
    'Referer': 'https://reelsvideo.io/'
  };

  const body = new URLSearchParams();
  body.append('id', url);
  body.append('locale', 'en');
  body.append('cf-turnstile-response', '');
  body.append('tt', tt);
  body.append('ts', ts);

  // NOTE: utiliser l'endpoint générique ; certains sites exigent l'URL exacte.
  const res = await axios.post('https://reelsvideo.io/reel/', body, { headers });

  const $ = cheerio.load(res.data);

  const username = $('.bg-white span.text-400-16-18').first().text().trim() || null;
  const thumb = $('div[data-bg]').first().attr('data-bg') || null;

  const videos = [];
  $('a.type_videos').each((i, el) => {
    const href = $(el).attr('href');
    if (href) videos.push(href);
  });

  const images = [];
  $('a.type_images').each((i, el) => {
    const href = $(el).attr('href');
    if (href) images.push(href);
  });

  const mp3 = [];
  $('a.type_audio').each((i, el) => {
    const href = $(el).attr('href');
    const id = $(el).attr('data-id');
    if (href && id) mp3.push({ id, url: href });
  });

  let type = 'unknown';
  if (videos.length && images.length) type = 'carousel';
  else if (videos.length) type = 'video';
  else if (images.length) type = 'photo';

  return { type, username, thumb, videos, images, mp3 };
}



function handleGroupStatusMention(socket, sessionId) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      if (!messages || !messages.length) return;
      const m = messages[0];
      if (!m || !m.message || !m.key) return;

      const remote = m.key.remoteJid || '';
      // Vérifier que c'est bien un groupe
      if (!remote.endsWith('@g.us')) return;

      // Charger la config de la session
      const cfg = await loadUserConfigFromMongo(sessionId) || {};
      if (!cfg.antistatusmention) return; // mode désactivé

      // Détecter le type du message
      const keys = Object.keys(m.message);
      const type = keys.length ? keys[0] : 'unknown';

      // Si c'est une mention de statut de groupe
      if (type === 'groupStatusMentionMessage') {
        const groupId = remote;
        const participant = m.key.participant || m.key.from || null;
        const participantNum = participant ? participant.split('@')[0] : 'inconnu';

        // Supprimer le message
        try {
          await socket.sendMessage(groupId, { delete: m.key });
        } catch (e) {
          console.warn('[ANTISTATUS] suppression échouée', e?.message || e);
        }

        // Avertir publiquement l’expéditeur
        try {
          await socket.sendMessage(groupId, {
            text: `⚠️ @${participantNum}, les mentions de statut sont interdites dans ce groupe. Répète et tu seras expulsé.`,
            mentions: participant ? [participant] : []
          });
        } catch (e) {
          console.warn('[ANTISTATUS] avertissement échoué', e?.message || e);
        }

        // Incrémenter le compteur d’infractions en Mongo
        let count = 1;
        try {
          count = await incrStatusInfraction(sessionId, groupId, participant);
        } catch (e) {
          console.error('[ANTISTATUS] erreur incrStatusInfraction', e);
        }

        // Seuil configurable (par défaut 2)
        const THRESHOLD = (cfg.antistatusmention_threshold && Number(cfg.antistatusmention_threshold)) || 2;

        // Si récidive >= seuil => expulsion
        if (count >= THRESHOLD) {
          try { await resetStatusInfraction(sessionId, groupId, participant); } catch(e){}

          let groupMeta = null;
          try {
            groupMeta = await socket.groupMetadata(groupId);
          } catch (e) {
            console.warn('[ANTISTATUS] impossible de récupérer groupMetadata', e?.message || e);
          }

          // Vérifier si participant est admin
          const isParticipantAdmin = groupMeta?.participants?.some(p => p.id === participant && (p.admin === 'admin' || p.admin === 'superadmin'));
          if (isParticipantAdmin) {
            await socket.sendMessage(groupId, {
              text: `⚠️ @${participantNum} a atteint le seuil d'infractions mais est administrateur, impossible de l'expulser.`,
              mentions: [participant]
            });
            return;
          }

          // Vérifier si le bot est admin
          const botJid = socket.user?.id || socket.user?.jid || null;
          const isBotAdmin = groupMeta?.participants?.some(p => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
          if (!isBotAdmin) {
            await socket.sendMessage(groupId, {
              text: `⚠️ Le bot n'est pas administrateur, impossible d'expulser @${participantNum}.`,
              mentions: [participant]
            });
            return;
          }

          // Expulser
          try {
            await socket.groupParticipantsUpdate(groupId, [participant], 'remove');
            await socket.sendMessage(groupId, {
              text: `🚫 @${participantNum} a été expulsé pour récidive (mentions de statut).`,
              mentions: [participant]
            });
          } catch (e) {
            console.error('[ANTISTATUS] erreur expulsion', e);
            await socket.sendMessage(groupId, {
              text: `⚠️ Impossible d'expulser @${participantNum}.`,
              mentions: [participant]
            });
          }
        }
      }
    } catch (err) {
      console.error('[ANTISTATUS HANDLER ERROR]', err);
    }
  });
}
// ---------------- command handlers ----------------
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    // ── STORE tous les messages pour antidelete ──
  for (const m of messages) {
    if (m?.key?.id && m?.message && !m.key.fromMe) {
      storeMessage(number, m);
    }
  }
    
    // 1. Vérifications de base
    if (!msg || !msg.message) return;
    
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;
    
    // 2. Déterminer le type de message pour extraire le body
    const type = getContentType(msg.message);
    
    // Gérer les messages éphémères
    msg.message = (type === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
    
    // 3. Extraire le texte du message
    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage?.text
      : (type === 'imageMessage') ? msg.message.imageMessage?.caption
      : (type === 'videoMessage') ? msg.message.videoMessage?.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') 
      : (type === 'interactiveResponseMessage') ? (() => {
      try {
        // quick_reply carousel → paramsJson contient { id: ".dlapk nom lien" }
        const raw = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.id) return parsed.id;        // ← ".dlapk nom lien"
        }
      } catch(_) {}
      // fallback : body text brut (autres types interactifs)
      return msg.message.interactiveResponseMessage?.body?.text || '';
    })()
  : '';
    
    // Normaliser le body
    const normalizedBody = (typeof body === 'string') ? body.trim() : '';
    
    // --- Chargement de la configuration du bot (persistante) ---
    // Utiliser le numéro passé en paramètre (identifiant de session)
    const sessionId = number || (socket.user?.id?.split(':')[0] + '@s.whatsapp.net') || socket.user?.id;
    const cfg = await loadSessionConfigMerged(sessionId);  // fourni par ton système MongoDB
    console.log('[HANDLER] merged cfg for', sessionId, cfg);
    
    // --- Traitement antilink (déjà existant) ---
    if (remoteJid && remoteJid.endsWith('@g.us')) {
      try {
        const handled = await handleAntiLink(socket, msg, remoteJid, normalizedBody);
        if (handled) return; // message supprimé/traité -> stop further processing
      } catch (e) {
        console.error('ANTILINK HANDLER ERROR', e);
      }
    }
    
    // --- DÉBUT ANTI-TAG (pour les mentions de statut de groupe) ---
    if (msg.message?.groupStatusMentionMessage) {
      try {
        const jid = remoteJid;
        // Ne pas traiter si ce n'est pas un groupe ou si c'est un message du bot
        if (!jid.endsWith('@g.us') || msg.key.fromMe) return;

        const mode = cfg.ANTI_TAG_MODE || 'off';
        if (mode === 'off' || mode === 'false') return;

        // Groupe exempté (personnalisable)
        const exemptGroup = "120363426815283643@g.us"; // Remplace par ton groupe si besoin
        if (jid === exemptGroup) return;

        // Récupérer les métadonnées du groupe pour vérifier les admins
        const groupMetadata = await socket.groupMetadata(jid).catch(() => null);
        if (!groupMetadata) return;

        const participants = groupMetadata.participants;
        const senderJid = msg.key.participant || msg.key.remoteJid;

        // Vérifier si l'expéditeur est admin
        const isSenderAdmin = participants.find(p => p.id === senderJid)?.admin === 'admin' || 
                              participants.find(p => p.id === senderJid)?.admin === 'superadmin';

        // Vérifier si le bot est admin
        const botJid = socket.user?.id?.split(':')[0] + '@s.whatsapp.net' || socket.user?.id;
        const isBotAdmin = participants.find(p => p.id === botJid)?.admin !== null;

        // Si l'utilisateur est admin : simple avertissement, pas de sanction
        if (isSenderAdmin) {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  ᴀᴅᴍɪɴ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ ᴅᴇᴛᴇᴄᴛᴇᴅ\n│ ⊹ ࣪ ˖  ᴜsᴇʀ: @${senderJid.split('@')[0]}\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs ɢᴇᴛ ᴀ ғʀᴇᴇ ᴘᴀss ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs\n│. ˚˖𓍢ִ໋  ʙᴜᴛ sᴇʀɪᴏᴜsʟʏ, ᴋᴇᴇᴘ ɪᴛ ᴍɪɴɪᴍᴀʟ! 😒\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
          return;
        }

        // Si le bot n'est pas admin : on prévient mais on ne peut pas supprimer
        if (!isBotAdmin) {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ ˖ 」\n│. ˚˖𓍢ִ໋  ᴄᴀɴ'ᴛ ᴅᴇʟᴇᴛᴇ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ! 😤\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ: @${senderJid.split('@')[0]} ᴊᴜsᴛ ᴅʀᴏᴘᴘᴇᴅ ᴀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ\n│. ˚˖𓍢ִ໋  ʙᴜᴛ ɪ'ᴍ ɴᴏᴛ ᴀᴅᴍɪɴ ʜᴇʀᴇ! ʜᴏᴡ ᴇᴍʙᴀʀʀᴀssɪɴɢ...\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs: ᴍᴀᴋᴇ ᴍᴇ ᴀᴅᴍɪɴ sᴏ ɪ ᴄᴀɴ ᴅᴇʟᴇᴛᴇ ᴛʜɪs ɴᴏɴsᴇɴsᴇ!\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
          return;
        }

        // Supprimer le message de mention de statut
        await socket.sendMessage(jid, {
          delete: {
            remoteJid: jid,
            fromMe: false,
            id: msg.key.id,
            participant: senderJid
          }
        });

        // Action selon le mode
        if (mode === 'delete') {
          await socket.sendMessage(jid, {
            text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ ᴅᴇʟᴇᴛᴇᴅ! 🗑️\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ: @${senderJid.split('@')[0]} ᴛʜᴏᴜɢʜᴛ ᴛʜᴇʏ ᴄᴏᴜʟᴅ sᴘᴀᴍ\n│ ⊹ ࣪ ˖  sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs ᴀʀᴇ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ ʜᴇʀᴇ!\n│. ˚˖𓍢ִ໋  ɴᴇxᴛ ᴠɪᴏʟᴀᴛɪᴏɴ = ɪᴍᴍᴇᴅɪᴀᴛᴇ ʀᴇᴍᴏᴠᴀʟ! ⚠️\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
            mentions: [senderJid]
          });
        } else if (mode === 'remove') {
          try {
            await socket.groupParticipantsUpdate(jid, [senderJid], 'remove');
            await socket.sendMessage(jid, {
              text: `╭──「 ⊹ ࣪ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│. ˚˖𓍢ִ໋  ᴜsᴇʀ ʀᴇᴍᴏᴠᴇᴅ ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ! 🚫\n│ ⊹ ࣪ ˖  @${senderJid.split('@')[0]} ɪɢɴᴏʀᴇᴅ ᴛʜᴇ ᴡᴀʀɴɪɴɢs\n│. ˚˖𓍢ִ໋  ɴᴏ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴs ᴀʟʟᴏᴡᴇᴅ ɪɴ ᴛʜɪs ɢʀᴏᴜᴘ!\n│. ˚˖𓍢ִ໋  ʟᴇᴀʀɴ ᴛʜᴇ ʀᴜʟᴇs ᴏʀ sᴛᴀʏ ᴏᴜᴛ! 😤\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
              mentions: [senderJid]
            });
          } catch (kickErr) {
            await socket.sendMessage(jid, {
              text: `╭┄┄「 ⊹ ࣪ ˖𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ ˖ 」\n│ ⊹ ࣪ ˖  Failed to Remove User! 😠\n│. ˚˖𓍢ִ໋  ᴛʀɪᴇᴅ ᴛᴏ ᴋɪᴄᴋ @${senderJid.split('@')[0]} ғᴏʀ sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ\n│ ⊹ ࣪ ˖  ʙᴜᴛ ɪ ᴅᴏɴ'ᴛ ʜᴀᴠᴇ ᴇɴᴏᴜɢʜ ᴘᴇʀᴍɪssɪᴏɴs!\n│. ˚˖𓍢ִ໋  ᴀᴅᴍɪɴs: ғɪx ᴍʏ ᴘᴇʀᴍɪssɪᴏɴs ᴀɴᴅ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇ ᴏʀ ᴅᴇᴀʟ ᴡɪᴛʜ sᴘᴀᴍᴍᴇʀs ʏᴏᴜʀsᴇʟғ!\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*`,
              mentions: [senderJid]
            });
          }
        }
      } catch (antitagErr) {
        console.error('[ANTITAG ERROR]', antitagErr);
      }
    }
    // --- FIN ANTI-TAG ---

    // Si pas de texte, on ne peut pas traiter de commande
    if (!body || typeof body !== 'string') return;
    
    // 4. Vérifier si c'est une commande
    const prefix = config.PREFIX || '.';
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    if (!isCmd) return; // Si ce n'est pas une commande, on arrête
    
    const command = body.slice(prefix.length).trim().split(' ').shift().toLowerCase();
    const args = body.trim().split(/ +/).slice(1);
    
    // 5. Récupérer les informations d'expéditeur
    const from = remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe 
      ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) 
      : (msg.key.participant || remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // DEBUG: Afficher les informations pour le débogage
    console.log('DEBUG Command Handler:');
    console.log('- Remote JID:', remoteJid);
    console.log('- Is group?', remoteJid.endsWith('@g.us'));
    console.log('- Command:', command);
    console.log('- Body:', body);
    console.log('- From:', from);
    console.log('- Sender:', nowsender);
    
    // 6. Maintenant, traiter les commandes
    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      switch (command) {
      // ============================================================
// BRATVIDEO — Sticker animé Brat
// ============================================================
case 'bratvid':
case 'bratvideo': {
  try {
    if (!args.length) {
      await socket.sendMessage(sender, {
        text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n` +
              `│. ˚˖𓍢ִ໋ 🎬 *𝐁𝐀𝐒𝐄𝐁𝐎𝐓 𝐒𝐓𝐈𝐂𝐊𝐄𝐑 𝐓𝐄𝐗𝐓𝐄 𝐀𝐍𝐈𝐌𝐄́*\n` +
              `│. ˚˖𓍢ִ໋ ❌ ᴀᴜᴄᴜɴ ᴛᴇxᴛᴇ ғᴏᴜʀɴɪ !\n\n` +
              `│. ˚˖𓍢ִ໋ *ᴜsᴀɢᴇ :* ${prefix}bratvideo <texte>\n` +
              `│. ˚˖𓍢ִ໋ *ᴇxᴇᴍᴘʟᴇs :*\n` +
              `│. ˚˖𓍢ִ໋  ${prefix}bratvideo you web bot\n` +
              `│. ˚˖𓍢ִ໋  ${prefix}bratvideo owner\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n` +
              `> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const text = args.join(' ').trim();

    await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });

    const mediaUrl = `https://brat.caliphdev.com/api/brat/animate?text=${encodeURIComponent(text)}`;

    // ── Télécharger le gif/webp animé ──
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 20000
    });
    const buffer = Buffer.from(response.data);

    if (!buffer || buffer.length === 0) {
      throw new Error('Téléchargement du média échoué.');
    }

    // ── Ajouter les métadonnées EXIF (packname + auteur) ──
    const webp   = require('node-webpmux');
    const crypto = require('crypto');

    async function addExif(webpSticker, packName, authorName) {
      const img           = new webp.Image();
      const stickerPackId = crypto.randomBytes(32).toString('hex');
      const json          = {
        'sticker-pack-id': stickerPackId,
        'sticker-pack-name': packName,
        'sticker-pack-publisher': authorName,
        'emojis': ['🎬']
      };
      const exifAttr   = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
      const exif       = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);
      await img.load(webpSticker);
      img.exif = exif;
      return await img.save(null);
    }

    let stickerBuffer;
    try {
      stickerBuffer = await addExif(buffer, text, 'BASEBOT-MD');
    } catch(_) {
      // Si addExif échoue (pas un webp valide) → envoyer le buffer brut
      stickerBuffer = buffer;
    }

    // ── Envoyer comme sticker ──
    await socket.sendMessage(sender, {
      sticker: stickerBuffer
    }, { quoted: msg });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[BRATVIDEO ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `❌ Échec génération brat video.\n_${e.message || e}_\n\n💡 Réessaie dans quelques secondes.`
    }, { quoted: msg });
  }
  break;
}

case 'ytmp4': 
case 'video': {
    try {

        const axios = require('axios');
        const yts = require('yt-search');

        // ===== GET QUERY =====
        const text =
            m.body ||
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            "";

        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            return sock.sendMessage(m.chat, {
                text: `
╭┄┄『 𝐘𝐓𝐌𝐏𝟒 』
│ 📌 ${toSmallCaps("give a youtube link or name")}
│ ▶️ .ytmp4 <name/url>
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim()
            }, { quoted: m });
        }

        await sock.sendMessage(m.chat, {
            react: {
                text: "🔄",
                key: m.key
            }
        });

        let videoUrl = query;
        let title = "YouTube Video";
        let thumb = null;

        // ===== SEARCH =====
        if (!query.startsWith("http")) {
            const search = await yts(query);

            if (!search?.videos?.length) {
                return sock.sendMessage(m.chat, {
                    text: `
╭┄┄『 𝐘𝐓𝐌𝐏𝟒 』
│ ❌ ${toSmallCaps("no video found")}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim()
                }, { quoted: m });
            }

            videoUrl = search.videos[0].url;
            title = search.videos[0].title;
            thumb = search.videos[0].thumbnail;
        }

        // ===== THUMB =====
        if (thumb) {
            await sock.sendMessage(m.chat, {
                image: { url: thumb },
                caption: `
╭┄┄『 𝐘𝐓𝐌𝐏𝟒 』
│ 🎬 ${toSmallCaps(title)}
│ ⏳ ${toSmallCaps("downloading...")}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim()
            }, { quoted: m });
        }

        let videoData = null;

        const apis = [
            `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(videoUrl)}&format=mp4`,
            `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`
        ];

        for (const api of apis) {
            try {
                const res = await axios.get(api, { timeout: 30000 });

                if (res.data?.downloadURL) {
                    videoData = res.data.downloadURL;
                    break;
                }

                if (res.data?.data?.download_url) {
                    videoData = res.data.data.download_url;
                    break;
                }

            } catch (e) {}
        }

        if (!videoData) {
            return sock.sendMessage(m.chat, {
                text: `
╭┄┄『 𝐘𝐓𝐌𝐏𝟒 』
│ ❌ ${toSmallCaps("download failed")}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim()
            }, { quoted: m });
        }

        // ===== SEND VIDEO =====
        await sock.sendMessage(m.chat, {
            video: { url: videoData },
            mimetype: "video/mp4",
            caption: `
╭┄┄『 𝐘𝐓𝐌𝐏𝟒 』
│ 🎬 ${toSmallCaps(title)}
│ 👤 ${toSmallCaps("downloaded by you techx")}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim(),
            footer: "> ᴍᴀᴅᴇ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",
            buttons: [
                {
                    buttonId: `.ytmp4 ${query}`,
                    buttonText: { displayText: "🔁 retry" },
                    type: 1
                },
                {
                    buttonId: `.menu`,
                    buttonText: { displayText: "📜 menu" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: m });

        await sock.sendMessage(m.chat, {
            react: {
                text: "✅",
                key: m.key
            }
        });

    } catch (e) {
        console.error("ytmp4 error:", e);

        await sock.sendMessage(m.chat, {
            text: "❌ ytmp4 error"
        }, { quoted: m });

        await sock.sendMessage(m.chat, {
            react: {
                text: "❌",
                key: m.key
            }
        });
    }
}
break;
      
      // ============================================================
// SONG — Recherche + téléchargement audio YouTube
// ============================================================
 case 'play': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🎶",
                key: msg.key
            }
        });

        const axios = require("axios");
        const yts = require("yt-search");

        // ===== QUERY =====
        const query =
            args.join(" ").trim();

        if (!query) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』
│ 📌 *${toSmallCaps("give music name")}*
│ ▶️ ${prefix}play forever
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== SEARCH =====
        await socket.sendMessage(sender, {
            react: {
                text: "🔎",
                key: msg.key
            }
        });

        const search =
            await yts(query);

        if (
            !search ||
            !search.videos ||
            !search.videos.length
        ) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("no result found")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== VIDEO =====
        const video =
            search.videos[0];

        // ===== API =====
        const apiUrl =
            `https://api.giftedtech.co.ke/api/download/dlmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`;

        const { data } =
            await axios.get(apiUrl, {
                timeout: 60000
            });

        // ===== CHECK =====
        if (
            !data ||
            !data.success ||
            !data.result ||
            !data.result.download_url
        ) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("service unavailable")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== DOWNLOAD =====
        const audioBuffer =
            await axios.get(
                data.result.download_url,
                {
                    responseType: "arraybuffer"
                }
            ).then(res =>
                Buffer.from(res.data)
            );

        // ===== SIZE CHECK =====
        if (
            audioBuffer.length /
            (1024 * 1024) > 25
        ) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("file too large")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== CAPTION =====
        const caption = `
╭┄┄『 𝐏𝐋𝐀𝐘 𝐑𝐄𝐒𝐔𝐋𝐓 』
│ 🎵 *${toSmallCaps("title")}* :
│ ${video.title || "Unknown"}
│
│ ⏱️ *${toSmallCaps("duration")}* :
│ ${video.timestamp || "Unknown"}
│
│ 👤 *${toSmallCaps("author")}* :
│ ${video.author?.name || "Unknown"}
│
│ 👁️ *${toSmallCaps("views")}* :
│ ${video.views
    ? video.views.toLocaleString()
    : "Unknown"}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: `.play ${query}`,
                buttonText: {
                    displayText: '🎵 ᴘʟᴀʏ ᴀɢᴀɪɴ'
                },
                type: 1
            },
            {
                buttonId: '.menu',
                buttonText: {
                    displayText: '📜 ᴍᴇɴᴜ'
                },
                type: 1
            }
        ];

        // ===== SEND THUMB =====
        await socket.sendMessage(sender, {
            image: {
                url: video.thumbnail
            },
            caption: caption,
            footer:
                "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: video.title,
                    body: "YOU TECHX PLAY SYSTEM",
                    thumbnailUrl: video.thumbnail,
                    sourceUrl: video.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // ===== SEND AUDIO =====
        await socket.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName:
                `${video.title}.mp3`
                .replace(/[^\w\s.-]/gi, "")
        }, { quoted: msg });

        // ===== SUCCESS =====
        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (err) {

        console.error("PLAY ERROR:", err);

        await socket.sendMessage(sender, {
            react: {
                text: "❌",
                key: msg.key
            }
        });

        await socket.sendMessage(sender, {
            text: `
❌ *${toSmallCaps("play command failed")}*

${err.message}
`.trim()
        }, { quoted: msg });
    }
}
break;

case 'play2': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🎧",
                key: msg.key
            }
        });

        const axios = require("axios");
        const yts = require("yt-search");

        const start =
            Date.now();

        // ===== QUERY =====
        const query =
            (args || [])
            .join(" ")
            .trim();

        if (!query) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘𝟐 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』
│ 📌 *${toSmallCaps("give music name")}*
│ ▶️ ${prefix}play2 forever
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== LOADING =====
        await socket.sendMessage(sender, {
            react: {
                text: "📡",
                key: msg.key
            }
        });

        let videoUrl =
            query;

        let title =
            "Unknown";

        let thumbnail =
            "";

        // ===== SEARCH =====
        if (
            !/^https?:\/\//i.test(query)
        ) {

            const search =
                await yts(query)
                .catch(() => null);

            if (
                !search ||
                !search.videos ||
                !search.videos.length
            ) {

                return await socket.sendMessage(sender, {
                    text: `
╭┄┄『 𝐏𝐋𝐀𝐘𝟐 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("music not found")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
                }, { quoted: msg });
            }

            const v =
                search.videos[0];

            videoUrl =
                v.url;

            title =
                v.title || "Unknown";

            thumbnail =
                v.thumbnail || "";
        }

        // ===== API =====
        const api =
            `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}&quality=128kbps`;

        const { data } =
            await axios.get(api, {
                timeout: 60000
            });

        // ===== CHECK =====
        if (
            !data ||
            !data.success ||
            !data.result ||
            !data.result.download_url
        ) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘𝟐 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("cannot get audio")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== DOWNLOAD =====
        const audioBuffer =
            await axios.get(
                data.result.download_url,
                {
                    responseType: "arraybuffer"
                }
            ).then(r =>
                Buffer.from(r.data)
            );

        // ===== SIZE CHECK =====
        if (
            audioBuffer.length /
            (1024 * 1024) > 25
        ) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐋𝐀𝐘𝟐 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("file too large")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== SPEED =====
        const speed =
            Date.now() - start;

        // ===== CAPTION =====
        const play2Msg = `
╭┄┄『 𝐏𝐋𝐀𝐘𝟐 𝐑𝐄𝐒𝐔𝐋𝐓 』
│ 🎵 *${toSmallCaps("song")}* :
│ ${title}
│
│ ⚡ *${toSmallCaps("speed")}* :
│ ${speed}ms
│
│ 🔗 *${toSmallCaps("link")}* :
│ ${videoUrl}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: `.play2 ${query}`,
                buttonText: {
                    displayText: '🎧 ᴘʟᴀʏ2 ᴀɢᴀɪɴ'
                },
                type: 1
            },
            {
                buttonId: '.menu',
                buttonText: {
                    displayText: '📜 ᴍᴇɴᴜ'
                },
                type: 1
            }
        ];

        // ===== SEND IMAGE =====
        await socket.sendMessage(sender, {
            image: {
                url:
                    thumbnail ||
                    data.result.thumbnail ||
                    ""
            },
            caption: play2Msg,
            footer:
                "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",
            buttons: buttons,
            headerType: 4,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: title,
                    body: "YOU TECHX PLAY2 SYSTEM",
                    thumbnailUrl:
                        thumbnail ||
                        data.result.thumbnail ||
                        "",
                    sourceUrl: videoUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // ===== SEND AUDIO =====
        await socket.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName:
                `${title}.mp3`
                .replace(/[^\w\s.-]/gi, "")
        }, { quoted: msg });

        // ===== SUCCESS =====
        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (e) {

        console.error("PLAY2 ERROR:", e);

        await socket.sendMessage(sender, {
            react: {
                text: "❌",
                key: msg.key
            }
        });

        await socket.sendMessage(sender, {
            text: `
❌ *${toSmallCaps("error during download")}*

${e.message}
`.trim()
        }, { quoted: msg });
    }
}
break;


case 'repo': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "📂",
                key: msg.key
            }
        });

        const repoMsg = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ⊹ ࣪ ˖ʏᴏᴜ ᴍᴅ ʀᴇᴘᴏsɪᴛᴏʀʏ
│ ⊹ ࣪ ˖ᴘʀᴏᴊᴇᴄᴛ ᴅᴇᴛᴀɪʟs
│ ⊹ ࣪ ˖ɴᴀᴍᴇ : ʏᴏᴜ ᴍᴅ
│ ⊹ ࣪ ˖ᴀᴜᴛʜᴏʀ : ʏᴏᴜ ᴛᴇᴄʜ
│ ⊹ ࣪ ˖sᴛᴀᴛᴜs : ʀᴜɴɴɪɴɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ɢᴇᴛ ʟᴀᴛᴇsᴛ ᴠᴇʀsɪᴏɴ ᴀɴᴅ ᴅᴏᴄᴜᴍᴇɴᴛᴀᴛɪᴏɴ ʙᴇʟᴏᴡ ⚡*
`.trim();

        await socket.relayMessage(sender, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: "official repository",
                            hasMediaAttachment: false
                        },

                        body: {
                            text: repoMsg
                        },

                        footer: {
                            text: "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙"
                        },

                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "cta_url",

                                    buttonParamsJson: JSON.stringify({
                                        display_text: "ᴏᴘᴇɴ ʏᴏᴜ ᴍᴅ ᴡᴇʙ",

                                        url: "https://you-md-16ae1781ef16.herokuapp.com/"
                                    })
                                }
                            ]
                        },

                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true
                        }
                    }
                }
            }
        }, {
            quoted: msg
        });

    } catch (e) {

        console.error("REPO ERROR:", e);

        await socket.sendMessage(sender, {
            text: "https://you-md-16ae1781ef16.herokuapp.com/"
        }, {
            quoted: msg
        });
    }
}
break;

// ===============================
// MODE COMMAND
// ===============================

case 'mode': {
  try {

    // ===== OWNER ONLY =====
    if (!isOwner) {

      await socket.sendMessage(sender, {
        react: {
          text: "❌",
          key: msg.key
        }
      });

      return await socket.sendMessage(sender, {
        text: toSmallCaps("owner only")
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "⚙️",
        key: msg.key
      }
    });

    // ===== CURRENT MODE =====
    const currentMode =
      config.mode || "public";

    // ===== NO ARG =====
    if (!args[0]) {

      const modeMsg = `
⚙️ *${toSmallCaps("bot mode settings")}*

╭┄┄◆ ${toSmallCaps("you md config")} ◆
│ ◈ ${toSmallCaps("current mode")} : ${toSmallCaps(currentMode)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${toSmallCaps("select the mode below")}
> ${toSmallCaps("self mode = owner only")}
`.trim();

      // ===== INTERACTIVE =====
      await socket.relayMessage(sender, {
        viewOnceMessage: {
          message: {
            interactiveMessage: {

              header: {
                title: `*${toSmallCaps("you md configuration")}*`,
                hasMediaAttachment: false
              },

              body: {
                text: modeMsg
              },

              footer: {
                text: "ʏᴏᴜ ᴍᴅ ᴏᴘᴛɪᴍɪᴢᴇᴅ ʙʏ ʏᴏᴜ ᴛᴇᴄʜ"
              },

              nativeFlowMessage: {
                buttons: [

                  {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                      display_text: "ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ",
                      id: `${prefix}mode public`
                    })
                  },

                  {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                      display_text: "ᴍᴏᴅᴇ sᴇʟғ",
                      id: `${prefix}mode self`
                    })
                  }

                ]
              },

              contextInfo: {
                forwardingScore: 999,
                isForwarded: true,

                forwardedNewsletterMessageInfo: {
                  newsletterJid: '120363404137900781@newsletter',
                  newsletterName: '𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓',
                  serverMessageId: 125
                },

                externalAdReply: {
                  title: toSmallCaps("you md settings"),
                  body: toSmallCaps("mode configuration"),
                  mediaType: 1,
                  renderLargerThumbnail: false,
                  sourceUrl: "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
                }
              }

            }
          }
        }
      }, {
        quoted: msg
      });

      return;
    }

    // ===== CHANGE MODE =====
    const targetMode =
      args[0].toLowerCase();

    if (
      targetMode === "self" ||
      targetMode === "public"
    ) {

      // ===== SAVE =====
      config.mode = targetMode;

      // ===== GLOBAL =====
      mode = targetMode;

      // ===== SUCCESS REACT =====
      await socket.sendMessage(sender, {
        react: {
          text: "✅",
          key: msg.key
        }
      });

      // ===== SUCCESS MESSAGE =====
      await socket.sendMessage(sender, {
        text:
`✅ *${toSmallCaps("mode updated")}*

╭┄┄◆ ${toSmallCaps("new mode")} ◆
│ ◈ ${toSmallCaps(targetMode)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, {
        quoted: msg
      });

    } else {

      await socket.sendMessage(sender, {
        text:
`${toSmallCaps("usage")} :
${prefix}mode public
${prefix}mode self`
      }, {
        quoted: msg
      });
    }

  } catch (e) {

    console.error("MODE ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("error changing mode")
    }, {
      quoted: msg
    });
  }
}
break;


// ===============================
// SETPREFIX COMMAND
// ===============================

case 'setprefix': {
  try {

    // ===== OWNER ONLY =====
    if (!isOwner) {

      await socket.sendMessage(sender, {
        react: {
          text: "❌",
          key: msg.key
        }
      });

      return await socket.sendMessage(sender, {
        text: "ᴏᴡɴᴇʀ ᴏɴʟʏ"
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "⚙️",
        key: msg.key
      }
    });

    // ===== CHECK PREFIX =====
    if (!args[0]) {

      return await socket.sendMessage(sender, {
        text:
`📌 ${toSmallCaps("usage")} :

${prefix}setprefix !
${prefix}setprefix /
${prefix}setprefix .`
      }, {
        quoted: msg
      });
    }

    // ===== NEW PREFIX =====
    const newPrefix = args[0];

    // ===== SAVE =====
    config.prefix = newPrefix;

    // ===== GLOBAL =====
    prefix = newPrefix;

    // ===== SUCCESS =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

    // ===== SEND =====
    await socket.sendMessage(sender, {
      text:
`✅ *${toSmallCaps("prefix updated")}*

╭┄┄◆ ${toSmallCaps("new prefix")} ◆
│ ◈ [ ${newPrefix} ]
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("SETPREFIX ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("error changing prefix")
    }, {
      quoted: msg
    });
  }
}
break;

case 'uptime': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🕸️",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const os = require('os');

    // ===== UPTIME =====
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const runtimeText =
      `${hours}ʜ ${minutes}ᴍ ${seconds}s`;

    // ===== RAM =====
    const usedMemory =
      Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const totalMemory =
      Math.round(os.totalmem() / 1024 / 1024);

    // ===== USERS =====
    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    // ===== MESSAGE =====
    const uptimeMsg = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🍂 ${toSmallCaps("you md v1")}
│ 👥 ${toSmallCaps("users")} : ${activeUsers}
│ ⏳ ${toSmallCaps("uptime")} : ${runtimeText}
│ 💾 ${toSmallCaps("ram")} : ${usedMemory}MB / ${totalMemory}MB
│ ⚙️ ${toSmallCaps("prefix")} : [ ${prefix} ]
╰┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *${toSmallCaps("powered by you tech")}* 🕸️
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📜 ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: 'https://files.catbox.moe/0lsjly.png'
      },
      caption: uptimeMsg,
      footer: '🕸️ ʏᴏᴜ ᴍᴅ ʙᴏᴛ',
      buttons: buttons,
      headerType: 4
    }, {
      quoted: msg
    });

    // ===== SUCCESS =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("UPTIME ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("uptime error")
    }, {
      quoted: msg
    });

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });
  }
}
break;


case 'cid2':
case 'newsletter':
case 'channelid':
case 'cinfo': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "⏳",
        key: msg.key
      }
    });

    const q = args.join(" ");

    if (!q) {
      return await socket.sendMessage(sender, {
        text:
`❎ Donne un lien de chaîne WhatsApp

Exemple:
${prefix}cinfo https://whatsapp.com/channel/xxxx`
      }, {
        quoted: msg
      });
    }

    // ===== VALIDATE LINK =====
    const match =
      q.match(/whatsapp\.com\/channel\/([\w-]+)/);

    if (!match) {
      return await socket.sendMessage(sender, {
        text:
`⚠️ Lien invalide.

Format:
https://whatsapp.com/channel/xxxx`
      }, {
        quoted: msg
      });
    }

    const inviteId = match[1];

    // ===== FETCH METADATA =====
    let metadata;

    try {
      metadata =
        await socket.newsletterMetadata(
          "invite",
          inviteId
        );
    } catch (e) {

      return await socket.sendMessage(sender, {
        text: "❌ Impossible de récupérer les infos de la chaîne."
      }, {
        quoted: msg
      });
    }

    if (!metadata || !metadata.id) {
      return await socket.sendMessage(sender, {
        text: "❌ Chaîne introuvable."
      }, {
        quoted: msg
      });
    }

    // ===== INFO TEXT =====
    const infoText = `
╭┄┄┄⪼📡 𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐈𝐍𝐅𝐎
┊🛠️ ID : ${metadata.id}
┊📌 Name : ${metadata.name}
┊👥 Followers : ${metadata.subscribers?.toLocaleString() || "N/A"}
┊📅 Created : ${
  metadata.creation_time
    ? new Date(metadata.creation_time * 1000).toLocaleDateString("fr-FR")
    : "Unknown"
}
╰┄┄┄⪼
`.trim();

    // ===== SEND =====
    if (metadata.preview) {

      await socket.sendMessage(sender, {
        image: {
          url: `https://pps.whatsapp.net${metadata.preview}`
        },
        caption: infoText,
        contextInfo: {
          externalAdReply: {
            title: "𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐈𝐍𝐅𝐎",
            body: metadata.name || "WhatsApp Channel",
            mediaType: 1,
            renderLargerThumbnail: false
          }
        }
      }, {
        quoted: msg
      });

    } else {

      await socket.sendMessage(sender, {
        text: infoText
      }, {
        quoted: msg
      });
    }

  } catch (e) {

    console.error("CID ERROR:", e);

    await socket.sendMessage(sender, {
      text: "⚠️ Erreur inattendue."
    }, {
      quoted: msg
    });
  }
}
break;

case 'remini':
case 'enhance':
case 'hd':
case 'upscale': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🪄",
                key: msg.key
            }
        });

        const quotedMsg = msg?.quoted || msg;
        const mimeType = (quotedMsg.msg || quotedMsg).mimetype || "";

        if (!mimeType.startsWith("image/")) {
            return await socket.sendMessage(sender, {
                text: "please reply to an image"
            }, { quoted: msg });
        }

        await socket.sendMessage(sender, {
            text: "enhancing image..."
        }, { quoted: msg });

        const mediaBuffer = await quotedMsg.download();
        if (!mediaBuffer) {
            return await socket.sendMessage(sender, {
                text: "failed to download image"
            }, { quoted: msg });
        }

        const fs = require("fs");
        const os = require("os");
        const path = require("path");
        const FormData = require("form-data");
        const axios = require("axios");

        const inputPath = path.join(os.tmpdir(), `enhance_${Date.now()}.jpg`);
        fs.writeFileSync(inputPath, mediaBuffer);

        const form = new FormData();
        form.append("fileToUpload", fs.createReadStream(inputPath));
        form.append("reqtype", "fileupload");

        const uploadRes = await axios.post(
            "https://catbox.moe/user/api.php",
            form,
            { headers: form.getHeaders() }
        );

        const imageUrl = uploadRes.data;
        fs.unlinkSync(inputPath);

        if (!imageUrl || !imageUrl.startsWith("http")) {
            return await socket.sendMessage(sender, {
                text: "upload failed"
            }, { quoted: msg });
        }

        const upscaleUrl =
            `https://www.veloria.my.id/imagecreator/upscale?url=${encodeURIComponent(imageUrl)}`;

        const response = await axios.get(upscaleUrl, {
            responseType: "arraybuffer",
            timeout: 60000
        });

        const caption = "image enhanced successfully";

        await socket.sendMessage(sender, {
            image: response.data,
            caption: caption,
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: [
                {
                    buttonId: ".menu",
                    buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                    type: 1
                },
                {
                    buttonId: ".alive",
                    buttonText: { displayText: "⚡ ᴀʟɪᴠᴇ" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: msg });

        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (e) {
        console.error("REMINI ERROR:", e);

        await socket.sendMessage(sender, {
            text: "error: " + e.message
        }, { quoted: msg });
    }
}
break;

case 'toimage': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🖼️",
                key: msg.key
            }
        });

        const quoted = msg?.quoted || msg;
        const mime = (quoted.msg || quoted).mimetype || "";

        if (!/webp/.test(mime)) {
            return await socket.sendMessage(sender, {
                text: "reply to a sticker to convert it into image"
            }, { quoted: msg });
        }

        const media = await quoted.download();

        const caption = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ ɪᴍᴀɢᴇ
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋sᴛɪᴄᴋᴇʀ ᴄᴏɴᴠᴇʀᴛᴇᴅ ᴛᴏ ɪᴍᴀɢᴇ
│. ˚˖𓍢ִ໋ʏᴏᴜ ᴛᴇᴄʜx ʙᴏᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim();

        await socket.sendMessage(sender, {
            image: media,
            caption: caption,
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: [
                {
                    buttonId: ".menu",
                    buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                    type: 1
                },
                {
                    buttonId: ".ping",
                    buttonText: { displayText: "🎭 ᴘɪɴɢ" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("TOIMAGE ERROR:", e);

        await socket.sendMessage(sender, {
            text: "failed to convert sticker to image"
        }, { quoted: msg });
    }
}
break;

case 'hidetag': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "📣",
                key: msg.key
            }
        });

        if (!isGroup) {
            return await socket.sendMessage(sender, {
                text: "this command works only in groups"
            }, { quoted: msg });
        }

        if (!isAdmins && !isOwner) {
            return await socket.sendMessage(sender, {
                text: "only group admins or bot owner can use this command"
            }, { quoted: msg });
        }

        const groupMembers =
            (participants || [])
                .map(p => p.id)
                .filter(Boolean);

        const captionText =
            text ? text : "announcement";

        // ===== MEDIA CHECK =====
        const quotedImage =
            msg?.quoted?.message?.imageMessage;

        const captionBase = `
${captionText}
`.trim();

        // ===== IMAGE HIDETAG =====
        if (quotedImage) {

            const media = await msg.quoted.download();

            await socket.sendMessage(sender, {
                image: media,
                caption: captionBase,
                mentions: groupMembers,
                contextInfo: {
                    mentionedJid: groupMembers
                },
                footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
                buttons: [
                    {
                        buttonId: ".menu",
                        buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                        type: 1
                    },
                    {
                        buttonId: ".repo",
                        buttonText: { displayText: "📦 ʀᴇᴘᴏ" },
                        type: 1
                    }
                ],
                headerType: 1
            }, { quoted: msg });

        } else {

            // ===== TEXT HIDETAG =====
            await socket.sendMessage(sender, {
                text: captionBase,
                mentions: groupMembers,
                contextInfo: {
                    mentionedJid: groupMembers
                },
                footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
                buttons: [
                    {
                        buttonId: ".menu",
                        buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                        type: 1
                    },
                    {
                        buttonId: ".repo",
                        buttonText: { displayText: "📦 ʀᴇᴘᴏ" },
                        type: 1
                    }
                ],
                headerType: 1
            }, { quoted: msg });
        }

    } catch (e) {
        console.error("HIDETAG ERROR:", e);

        await socket.sendMessage(sender, {
            text: "failed to send hidetag"
        }, { quoted: msg });
    }
}
break;

case 'pair':
case 'getbot':
case 'botclone': {
    try {

        // ===== REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "📲",
                key: m.key
            }
        });

        // ===== MODULE =====
        const axios = require('axios');

        // ===== NUMBER =====
        let phoneNumber =
            (args.join(" ") || "")
            .replace(/[^0-9]/g, '');

        if (!phoneNumber) {
            return await sock.sendMessage(m.chat, {
                text: `📌 *${toSmallCaps("usage")} :* ${prefix}pair 509xxxxxxxx`
            }, { quoted: m });
        }

        // ===== WAIT =====
        await sock.sendMessage(m.chat, {
            text: `⏳ *${toSmallCaps("requesting pairing code for")}* +${phoneNumber}...`
        }, { quoted: m });

        // ===== API =====
        const apiUrl =
            `https://you-md-16ae1781ef16.herokuapp.com/code?number=${phoneNumber}`;

        const response =
            await axios.get(apiUrl);

        const result =
            response.data;

        // ===== SUCCESS =====
        if (result && result.code) {

            const pairMsg = `
✅ *${toSmallCaps("you md pairing")}*

🔑 *${toSmallCaps("your code is")} :*
\`\`\`${result.code}\`\`\`

> ${toSmallCaps("copy the code above and paste it into your whatsapp notification to link the bot")} 🍂
`.trim();

            // ===== SEND MAIN =====
            await sock.sendMessage(m.chat, {
                text: pairMsg,
                footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
                buttons: [
                    {
                        buttonId: `${prefix}menu`,
                        buttonText: {
                            displayText: "📜 ᴍᴇɴᴜ"
                        },
                        type: 1
                    },
                    {
                        buttonId: `${prefix}alive`,
                        buttonText: {
                            displayText: "⚡ ᴀʟɪᴠᴇ"
                        },
                        type: 1
                    }
                ],
                headerType: 1
            }, { quoted: m });

            // ===== SEND CODE ONLY =====
            setTimeout(async () => {

                await sock.sendMessage(m.chat, {
                    text: result.code
                }, { quoted: m });

            }, 2000);

            // ===== SUCCESS REACT =====
            await sock.sendMessage(m.chat, {
                react: {
                    text: "✅",
                    key: m.key
                }
            });

        } else {

            await sock.sendMessage(m.chat, {
                text: toSmallCaps(
                    "failed to retrieve code. make sure your api server is running."
                )
            }, { quoted: m });

        }

    } catch (e) {

        console.error("PAIR ERROR:", e);

        // ===== ERROR REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "❌",
                key: m.key
            }
        });

        await sock.sendMessage(m.chat, {
            text:
                `❌ *${toSmallCaps("error")} :* ` +
                `${toSmallCaps("could not connect to pairing server")}`
        }, { quoted: m });

    }
}
break;

case 'getpp': {
    try {

        // ===== OWNER CHECK =====
        if (!isOwner) {
            await socket.sendMessage(sender, {
                react: {
                    text: "❌",
                    key: msg.key
                }
            });

            return await socket.sendMessage(sender, {
                text: "you are not my owner bro"
            }, { quoted: msg });
        }

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "📸",
                key: msg.key
            }
        });

        // ===== USER DETECTION =====
        let user;

        if (msg?.quoted) {
            user = msg.quoted.sender;

        } else if (!isGroup) {
            user = msg.chat || sender;

        } else if (msg?.mentionedJid?.[0]) {
            user = msg.mentionedJid[0];

        } else {
            user = msg.sender || sender;
        }

        // ===== PROFILE PIC =====
        let ppUrl;

        try {
            ppUrl = await socket.profilePictureUrl(user, "image");
        } catch (e) {
            return await socket.sendMessage(sender, {
                text: "error: profile picture is private or not found"
            }, { quoted: msg });
        }

        // ===== CAPTION =====
        const ppMsg = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🖼️ ᴘʀᴏғɪʟᴇ ᴘɪᴄᴛᴜʀᴇ ʀᴇᴛʀɪᴇᴠᴇᴅ
│. ˚˖𓍢ִ໋
│. ˚˖𓍢ִ໋👤 ᴛᴀʀɢᴇᴛ : @${user.split("@")[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> *ᴏᴘᴛɪᴍɪᴢᴇᴅ ʙʏ ʏᴏᴜ ᴛᴇᴄʜ*
`.trim();

        // ===== SEND =====
        await socket.sendMessage(sender, {
            image: { url: ppUrl },
            caption: ppMsg,
            mentions: [user],
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363404137900781@newsletter",
                    newsletterName: "YOU MD BOT",
                    serverMessageId: 125
                }
            }
        }, { quoted: msg });

        // ===== SUCCESS REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (e) {
        console.error("GETPP ERROR:", e);

        await socket.sendMessage(sender, {
            text: "failed to get profile picture"
        }, { quoted: msg });
    }
}
break;

case 'getcase': {
  try {

    // ===== OWNER ONLY =====
    if (!isOwner) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("owner only bro")
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📥",
        key: msg.key
      }
    });

    // ===== CHECK ARG =====
    if (!args[0]) {
      return await socket.sendMessage(sender, {
        text: `*${toSmallCaps("usage")} :* ${prefix}getcase [nom_de_la_case]`
      }, {
        quoted: msg
      });
    }

    // ===== MODULES =====
    const fs = require('fs');

    // ===== FILE =====
    const fileName = './pair.js';

    if (!fs.existsSync(fileName)) {
      return await socket.sendMessage(sender, {
        text: "❌ Fichier pair.js introuvable."
      }, {
        quoted: msg
      });
    }

    // ===== READ FILE =====
    const scriptContent =
      fs.readFileSync(fileName, 'utf8');

    // ===== REGEX =====
    const regex = new RegExp(
      `case\\s+['"]${args[0]}['"]:[\\s\\S]*?break;`,
      'i'
    );

    const match =
      scriptContent.match(regex);

    // ===== NOT FOUND =====
    if (!match) {
      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("error")}* : ${toSmallCaps("case")} *"${args[0]}"* ${toSmallCaps("not found")}`
      }, {
        quoted: msg
      });
    }

    // ===== CODE =====
    const extractedCode = match[0];

    // ===== MESSAGE =====
    const getMsg = `
📦 *${toSmallCaps("you md extractor")}*

╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 📍 ${toSmallCaps("target")} : ${args[0]}
│ 📏 ${toSmallCaps("size")} : ${extractedCode.length}
│ 📂 ${toSmallCaps("source")} : pair.js
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${toSmallCaps("click the button below to copy the source code")} 🕷️
`.trim();

    // ===== SEND INTERACTIVE =====
    await socket.relayMessage(sender, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {

            header: {
              title: `*${toSmallCaps("source code fetcher")}*`,
              hasMediaAttachment: false
            },

            body: {
              text: getMsg
            },

            footer: {
              text: "ʏᴏᴜ ᴍᴅ ᴏᴘᴛɪᴍɪᴢᴇᴅ ʙʏ ʏᴏᴜ ᴛᴇᴄʜ"
            },

            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 COPY CODE",
                    id: "copy_code",
                    copy_code: extractedCode
                  })
                }
              ]
            },

            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,

              externalAdReply: {
                title: '𝒀𝑶𝑼 𝑴𝑫 𝑪𝑶𝑫𝑬',
                body: 'System Source Extractor',
                thumbnail: null,
                sourceUrl: 'https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z',
                mediaType: 1,
                renderLargerThumbnail: false
              }
            }

          }
        }
      }
    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("GETCASE ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ Error while extracting the case."
    }, {
      quoted: msg
    });
  }
}
break;

case 'tourl':
case 'url':
case 'tourl2': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🖇",
        key: msg.key
      }
    });

    const quotedMsg =
      msg.quoted ? msg.quoted : msg;

    const mimeType =
      (quotedMsg.msg || quotedMsg).mimetype || '';

    // ===== CHECK MIME =====
    if (!mimeType) {
      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("please reply to an image, video, or audio file")}*`
      }, {
        quoted: msg
      });
    }

    // ===== DOWNLOAD =====
    const mediaBuffer =
      await quotedMsg.download();

    // ===== EXTENSION =====
    let extension = '.bin';

    if (mimeType.includes('image/jpeg')) extension = '.jpg';
    else if (mimeType.includes('image/png')) extension = '.png';
    else if (mimeType.includes('image/webp')) extension = '.webp';
    else if (mimeType.includes('video/mp4')) extension = '.mp4';
    else if (mimeType.includes('audio')) extension = '.mp3';

    const fileName =
      `you_md_${Date.now()}${extension}`;

    // ===== FORM DATA =====
    const FormData = require('form-data');
    const axios = require('axios');

    const form = new FormData();

    form.append('reqtype', 'fileupload');

    form.append('fileToUpload', mediaBuffer, {
      filename: fileName,
      contentType: mimeType
    });

    // ===== UPLOAD =====
    const response =
      await axios.post(
        "https://catbox.moe/user/api.php",
        form,
        { headers: form.getHeaders() }
      );

    if (
      !response.data ||
      !response.data.includes('https')
    ) {
      throw new Error("Invalid upload response");
    }

    // ===== FORMAT SIZE =====
    function formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;

      const sizes =
        ['Bytes', 'KB', 'MB', 'GB', 'TB'];

      const i =
        Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat(
        (bytes / Math.pow(k, i)).toFixed(dm)
      ) + ' ' + sizes[i];
    }

    // ===== MEDIA TYPE =====
    let mediaType = 'FILE';

    if (mimeType.includes('image')) mediaType = 'IMAGE';
    else if (mimeType.includes('video')) mediaType = 'VIDEO';
    else if (mimeType.includes('audio')) mediaType = 'AUDIO';

    // ===== MESSAGE =====
    const responseText = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🌟 𝐘𝐎𝐔 𝐌𝐃 𝐔𝐏𝐋𝐎𝐀𝐃𝐄𝐑
│ ✅ ${toSmallCaps(mediaType + " uploaded successfully")}
│ 📦 ${toSmallCaps("size")} : ${formatBytes(mediaBuffer.length)}
│ 🌍 ${toSmallCaps("url")} : ${response.data}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʏᴏᴜ ᴛᴇᴄʜ
`.trim();

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

    // ===== SEND =====
    await socket.sendMessage(sender, {
      text: responseText,
      contextInfo: {
        externalAdReply: {
          title: `ᴄᴀᴛʙᴏx | ${mediaType} ᴜᴘʟᴏᴀᴅ`,
          body: `sɪᴢᴇ: ${formatBytes(mediaBuffer.length)}`,
          thumbnailUrl: "https://files.catbox.moe/olcxk1.jpg",
          sourceUrl: response.data,
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: msg
    });

  } catch (error) {

    console.error("TOURL ERROR:", error);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text:
`❌ *${toSmallCaps("failed to upload")}*
Error: ${error.message}`
    }, {
      quoted: msg
    });
  }
}
break;


case 'tech':
case 'technologia': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "😂",
        key: msg.key
      }
    });

    // ===== SEND AUDIO =====
    await socket.sendMessage(sender, {
      audio: {
        url: "https://files.catbox.moe/fac856.mp3"
      },
      mimetype: "audio/mpeg",
      ptt: false,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,

        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363404137900781@newsletter',
          newsletterName: '𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓',
          serverMessageId: 125
        },

        externalAdReply: {
          title: "𝐘𝐎𝐔 𝐌𝐃 𝐀𝐔𝐃𝐈𝐎",
          body: "Technologia System",
          mediaType: 1,
          renderLargerThumbnail: false,
          sourceUrl: "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
        }
      }
    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("TECH ERROR:", e);

    await socket.sendMessage(sender, {
      text:
`❌ *Technologia Failed!*
Error: ${e.message}`
    }, {
      quoted: msg
    });
  }
}
break;


      case 'poll': {
    try {

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🗳️",
                key: msg.key
            }
        });

        // ===== GET TEXT =====
        const input =
            body ||
            text ||
            "";

        // ===== SPLIT =====
        let [question, optionsString] =
            input.split(";");

        // ===== CHECK =====
        if (!question || !optionsString) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 』
│ 📌 *${toSmallCaps("usage")}*
│
│ ${prefix}poll question;
│ option1,option2,option3
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== OPTIONS =====
        let options = [];

        for (let opt of optionsString.split(",")) {

            if (opt && opt.trim() !== "") {
                options.push(opt.trim());
            }
        }

        // ===== CHECK OPTIONS =====
        if (options.length < 2) {

            return await socket.sendMessage(sender, {
                text: `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("please provide at least 2 options")}*
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim()
            }, { quoted: msg });
        }

        // ===== CREATE POLL =====
        await socket.sendMessage(sender, {
            poll: {
                name: question.trim(),
                values: options,
                selectableCount: 1
            }
        }, { quoted: msg });

        // ===== SUCCESS MESSAGE =====
        const pollMsg = `
╭┄┄『 𝐏𝐎𝐋𝐋 𝐂𝐑𝐄𝐀𝐓𝐄𝐃 』
│ 🗳️ *${toSmallCaps("poll created successfully")}*
│
│ ❓ *${toSmallCaps("question")}* :
│ ${question.trim()}
│
│ 📊 *${toSmallCaps("options")}* :
│ ${options.length}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: '.menu',
                buttonText: {
                    displayText: '📜 ᴍᴇɴᴜ'
                },
                type: 1
            },
            {
                buttonId: '.alive',
                buttonText: {
                    displayText: '⚡ ᴀʟɪᴠᴇ'
                },
                type: 1
            }
        ];

        // ===== SEND INFO =====
        await socket.sendMessage(sender, {
            text: pollMsg,
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: buttons,
            headerType: 1,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: "𝐘𝐎𝐔 𝐌𝐃 𝐏𝐎𝐋𝐋 🗳️",
                    body: question.trim(),
                    thumbnailUrl: "https://files.catbox.moe/olcxk1.jpg",
                    sourceUrl: "https://whatsapp.com",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        // ===== DONE =====
        await socket.sendMessage(sender, {
            react: {
                text: "✅",
                key: msg.key
            }
        });

    } catch (e) {

        console.error(e);

        await socket.sendMessage(sender, {
            react: {
                text: "❌",
                key: msg.key
            }
        });

        await socket.sendMessage(sender, {
            text: `
❌ *${toSmallCaps("error while creating poll")}*

${e.message}
`.trim()
        }, { quoted: msg });
    }
}
break;
      
      
case 'fancy':
case 'fancytext':
case 'style': {
  try {

    // Aucun argument → afficher la liste
    if (!args.length) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄「 ⊹ ࣪ ˖ 💫 *𝐅𝐀𝐍𝐂𝐘 𝐒𝐓𝐘𝐋𝐄* ⊹ ࣪ ˖ 」
│. ˚˖𓍢ִ ໋📌 Exemple :
│. ˚˖𓍢ִ໋  ${prefix}fancy 10 YOU MD
│. ˚˖𓍢ִ໋${fancy.list('YOU MD', fancy)}

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const id = parseInt(args[0]);
    const text = args.slice(1).join(" ");

    // Mauvaise utilisation
    if (isNaN(id) || !text) {
      await socket.sendMessage(sender, {
        text:
`❌ Mauvaise utilisation !

📌 Exemple :
  ${prefix}fancy 10 YOU MD

${fancy.list('YOU MD', fancy)}

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const style = fancy[id - 1];

    // Style introuvable
    if (!style) {
      await socket.sendMessage(sender, {
        text: `❌ Style introuvable.\nChoisis un numéro valide.`
      }, { quoted: msg });
      break;
    }

    // Reaction loading
    await socket.sendMessage(from, {
      react: { text: '💫', key: msg.key }
    });

    const result = fancy.apply(style, text);

    // Envoyer résultat
    await socket.sendMessage(sender, {
      text:
`${result}`
    }, { quoted: msg });

    // Reaction success
    await socket.sendMessage(from, {
      react: { text: '✅', key: msg.key }
    });

  } catch (e) {

    console.log("FANCY ERROR:", e);

    await socket.sendMessage(from, {
      react: { text: '❌', key: msg.key }
    });

    await socket.sendMessage(sender, {
      text: `❌ Error while generating fancy text.`
    }, { quoted: msg });
  }

  break;
}
// ============================================================
// APK — Recherche avec carrousel interactif (elaina-baileys)
// ============================================================
case 'apks':
case 'app':
case 'playstore':
case 'mod': {
  try {
    if (!args.length) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ *Aucun nom fourni !*
│. ˚˖𓍢ִ໋📌 Usage : ${prefix}apk <nom app>
│. ˚˖𓍢ִ໋💡 Ex: ${prefix}apk WhatsApp
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> ${config.BOT_FOOTER}`
      }, { quoted: msg });
      break;
    }

    const query = args.join(' ').trim();

    await socket.sendMessage(from, { react: { text: '🔎', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋🔎 Recherche : *${query}*
│. ˚˖𓍢ִ໋⏳ Connexion aux serveurs...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    const { data } = await axios.get(
      `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`,
      { timeout: 15000 }
    );

    if (!data?.datalist?.list?.length) {
      await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ Aucune application trouvée
│. ˚˖𓍢ִ໋💡 Vérifie l'orthographe
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const app = data.datalist.list[0];

    const name    = app.name || "Application";
    const pkg     = app.package || "";
    const version = app.file?.vername || "";
    const dev     = app.store?.name || "";
    const sizeStr = app.file?.filesize
      ? (app.file.filesize / (1024 * 1024)).toFixed(1) + " MB"
      : "Inconnu";
    const rating  = app.stats?.rating?.avg || "";
    const dlLink  = app.file?.path;

    if (!dlLink) throw new Error("Lien APK introuvable.");

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋✅ *Application trouvée !*
│. ˚˖𓍢ִ໋📦 *${name}*
${pkg     ? `│. ˚˖𓍢ִ໋🔖 Package : ${pkg}\n`      : ''}\
${version ? `│. ˚˖𓍢ִ໋🏷️ Version : ${version}\n`  : ''}\
${dev     ? `│. ˚˖𓍢ִ໋🏢 Store   : ${dev}\n`      : ''}\
│. ˚˖𓍢ִ໋📊 Taille  : ${sizeStr}
${rating  ? `│. ˚˖𓍢ִ໋⭐ Note    : ${rating}/5\n` : ''}\
│. ˚˖𓍢ִ໋📲 Envoi APK en cours...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(sender, {
      document: { url: dlLink },
      mimetype: "application/vnd.android.package-archive",
      fileName: `${name}.apk`
    }, { quoted: msg });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[APK ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📦 *𝐘𝐎𝐔 𝐌𝐎𝐃 𝐀𝐏𝐊*
│. ˚˖𓍢ִ໋❌ Erreur APK Store
│. ˚˖𓍢ִ໋💡 Réessaie dans quelques secondes
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
      
// === COMMANDE RECHERCHE DE FILMS ===
case 'sm':
case 'movie':
case 'silent': {
    try {
        const query = args.join(" ");
        if (!query) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ɴᴏᴍ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : ${prefix}${command} <ɴᴏᴍ ғɪʟᴍ>
│. ˚˖𓍢ִ໋💡 ᴇx : ${prefix}${command} ʙᴀᴛᴍᴀɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        await socket.sendMessage(jid, { react: { text: '🔎', key: msg.key } });

        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🔎 ʀᴇᴄʜᴇʀᴄʜᴇ : "${query}"
│. ˚˖𓍢ִ໋⏳ sᴄᴀɴ sᴇʀᴠᴇᴜʀs...
│. ˚˖𓍢ִ໋📡 ɢéɴéʀᴀᴛɪᴏɴ ᴄᴀʀᴛᴇs...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        const axios = require('axios');
        
        const { data } = await axios.get(`https://darkvibe314-silent-movies-api.hf.space/api/search`, {
            params: { query: query },
            timeout: 30000
        });

        if (!data.results || data.results.length === 0) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ғɪʟᴍ ᴛʀᴏᴜᴠé
│. ˚˖𓍢ִ໋💡 ᴇssᴀʏᴇ ᴀᴜᴛʀᴇ ᴍᴏᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const results = data.results.slice(0, 5);
        const cards = [];

        if (!global.movieSubCache) global.movieSubCache = {};

        for (let i = 0; i < results.length; i++) {
            const movie = results[i];
            const title = (movie.title || "Inconnu").slice(0, 50);
            const isSeries = movie.subjectType === 2; 

            global.movieSubCache[movie.subjectId] = movie.subtitles || "None";
            
            const subText = movie.subtitles 
                ? movie.subtitles.split(',').slice(0, 3).join(', ') + "..." 
                : 'Aucun';

            const desc = 
`⭐ ɪᴍᴅʙ: ${movie.imdbRatingValue || 'N/A'}
🎭 ɢᴇɴʀᴇ: ${movie.genre || 'N/A'}
📅 ᴀɴɴéᴇ: ${movie.releaseDate?.split('-')[0] || 'Inconnue'}
📌 ᴛʏᴘᴇ: ${isSeries ? 'séʀɪᴇ 📺' : 'ғɪʟᴍ 🎬'}
💬 sᴏᴜs-ᴛɪᴛʀᴇs: ${subText}`;

            const coverUrl = movie.cover?.url || '';

            const { generateWAMessageContent } = require('@rexxhayanasi/elaina-baileys');
            
            const media = await generateWAMessageContent({
                image: { url: coverUrl }
            }, { upload: socket.waUploadToServer });

            let actionButtons = [];
            
            if (isSeries) {
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📺 ᴛéʟéᴄʜᴀʀɢᴇʀ", id: `.dlmovie ${movie.subjectId} 1 1` }) 
                });
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📝 sᴏᴜs-ᴛɪᴛʀᴇs", id: `.smsubs ${movie.subjectId} 1 1` }) 
                });
            } else {
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "🎬 ᴛéʟéᴄʜᴀʀɢᴇʀ", id: `.dlmovie ${movie.subjectId} null null` }) 
                });
                actionButtons.push({ 
                    name: "quick_reply", 
                    buttonParamsJson: JSON.stringify({ display_text: "📝 sᴏᴜs-ᴛɪᴛʀᴇs", id: `.smsubs ${movie.subjectId} null null` }) 
                });
            }

            cards.push({
                body: { text: desc },
                header: { 
                    title: `🎬 ${title}`, 
                    hasMediaAttachment: true, 
                    imageMessage: media.imageMessage 
                },
                nativeFlowMessage: { buttons: actionButtons }
            });
        }

        const { generateWAMessageFromContent } = require('@rexxhayanasi/elaina-baileys');
        
        const interactiveMessage = {
            body: { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🎬 ʀéꜱᴜʟᴛᴀᴛꜱ : ${query}
│. ˚˖𓍢ִ໋👉 sᴡɪᴘᴇ ᴘᴏᴜʀ ᴄʜᴏɪsɪʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            },
            carouselMessage: { cards: cards, messageVersion: 1 }
        };

        const msgContent = generateWAMessageFromContent(jid, {
            viewOnceMessage: { 
                message: { 
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, 
                    interactiveMessage: interactiveMessage 
                } 
            }
        }, { quoted: msg, userJid: sender });

        await socket.relayMessage(jid, msgContent.message, { messageId: msgContent.key.id });
        await socket.sendMessage(jid, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("[MOVIE SEARCH ERROR]", e.message);
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ ᴅᴇ ʀᴇᴄʜᴇʀᴄʜᴇ
│. ˚˖𓍢ִ໋📛 ${e.response?.data?.detail || e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        await socket.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    }
    break;
}
// === COMMANDE SOUS-TITRES ===
case 'smsubs': {
    try {
        const movieId = args[0];
        const season = args[1] === 'null' ? null : args[1];
        const episode = args[2] === 'null' ? null : args[2];
        
        if (!movieId) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ɪᴅ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .smsubs <ɪᴅ> [sᴀɪsᴏɴ] [ᴇᴘɪsᴏᴅᴇ]
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }
        
        const cachedSubs = global.movieSubCache?.[movieId];
        if (!cachedSubs || cachedSubs === 'None') {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ sᴏᴜs-ᴛɪᴛʀᴇ ᴅɪsᴘᴏɴɪʙʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const subList = cachedSubs.split(',').map(s => s.trim());

        const rows = subList.map(sub => ({
            header: "",
            title: `📝 ${sub}`,
            description: `ᴛéʟéᴄʜᴀʀɢᴇʀ sᴏᴜs-ᴛɪᴛʀᴇ (${sub})`,
            id: `.dlmovie ${movieId} ${season || 'null'} ${episode || 'null'} ${sub}`
        }));

        const sections = [{ title: "🌐 ʟᴀɴɢᴜᴇs ᴅɪsᴘᴏɴɪʙʟᴇs", rows }];

        const { generateWAMessageFromContent } = require('@rexxhayanasi/elaina-baileys');
        
        const interactiveMsg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: {
                        body: { 
                            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋🗣️ ᴄʜᴏɪsɪs ʟᴀ ʟᴀɴɢᴜᴇ
│. ˚˖𓍢ִ໋👇 sᴇʟᴇᴄᴛɪᴏɴ ᴄɪ-ᴅᴇssᴏᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                        },
                        footer: { text: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓" },
                        header: { 
                            title: "📝 𝐒𝐎𝐔𝐒-𝐓𝐈𝐓𝐑𝐄𝐒", 
                            subtitle: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓", 
                            hasMediaAttachment: false 
                        },
                        nativeFlowMessage: {
                            buttons: [{ 
                                name: "single_select", 
                                buttonParamsJson: JSON.stringify({ 
                                    title: "🌐 𝐒𝐄𝐋𝐄𝐂𝐓 𝐋𝐀𝐍𝐆𝐔𝐄", 
                                    sections 
                                }) 
                            }]
                        }
                    }
                }
            }
        }, { quoted: msg, userJid: sender });

        await socket.relayMessage(jid, interactiveMsg.message, { messageId: interactiveMsg.key.id });

    } catch (e) {
        console.error("[SMSUBS ERROR]", e.message);
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📝 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐎𝐕𝐈𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sᴏᴜs-ᴛɪᴛʀᴇ
│. ˚˖𓍢ִ໋📛 ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }
    break;
}
      
// ============================================================
// TRANSLATE — Traduction via Google Translate
// ============================================================
case 'translate':
case 'tl':
case 'trt':
case 'tr': {
  try {
    const { translate } = require('@vitalets/google-translate-api');

    const quotedCtx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedCtx?.quotedMessage;

    const quotedText = quotedMsg?.conversation
      || quotedMsg?.extendedTextMessage?.text
      || quotedMsg?.imageMessage?.caption
      || quotedMsg?.videoMessage?.caption
      || null;

    const isReply = !!quotedText;

    let lang = 'en';
    let text = '';

    if (isReply) {
      lang = (args[0] && args[0].length === 2) ? args[0] : 'en';
      text = quotedText;
    } else {
      if (!args.length) {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ᴛᴇxᴛᴇ ғᴏᴜʀɴɪ
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ :
│. ˚˖𓍢ִ໋   ${prefix}tr <ʟᴀɴɢᴜᴇ> <ᴛᴇxᴛᴇ>
│. ˚˖𓍢ִ໋   ${prefix}tr <ᴛᴇxᴛᴇ> → ᴇɴɢʟɪsʜ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }

      if (args[0].length === 2) {
        lang = args[0];
        text = args.slice(1).join(' ').trim();
      } else {
        lang = 'en';
        text = args.join(' ').trim();
      }

      if (!text) {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴛᴇxᴛᴇ ᴍᴀɴǫᴜᴀɴᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }
    }

    await socket.sendMessage(from, { react: { text: '🌐', key: msg.key } });

    const result = await translate(text, { to: lang, autoCorrect: true });

    if (!result?.text) throw new Error('Traduction échouée.');

    const fromLang = result?.raw?.src
      || result?.from?.language?.iso
      || '?';

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋🔤 ᴏʀɪɢɪɴᴀʟ (${fromLang})
│. ˚˖𓍢ִ໋   ${text}
│. ˚˖𓍢ִ໋✅ ᴛʀᴀɴsʟᴀᴛɪᴏɴ (${lang})
│. ˚˖𓍢ִ໋   ${result.text}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (e) {
    console.error('[TRANSLATE ERROR]', e);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🌐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐑𝐀𝐍𝐒𝐋𝐀𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ ᴅᴇ ᴛʀᴀɴsʟᴀᴛɪᴏɴ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'antitag': {
  try {
    if (!isOwner) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴀᴄᴄèꜱ ʀᴇꜰᴜꜱé
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const validModes = ['off', 'delete', 'remove'];
    const newMode = args[0]?.toLowerCase();

    if (!newMode || !validModes.includes(newMode)) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴍᴏᴅᴇ ɪɴᴠᴀʟɪᴅᴇ
│. ˚˖𓍢ִ໋📌 ᴍᴏᴅᴇs : off | delete | remove
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const botNumberForConfig = socket.user?.id?.split(':')[0] + '@s.whatsapp.net' || socket.user?.id;
    if (!botNumberForConfig) throw new Error('Impossible de récupérer le numéro du bot');

    const currentConfig = await loadUserConfigFromMongo(botNumberForConfig) || {};

    currentConfig.ANTI_TAG_MODE = newMode;

    await setUserConfigInMongo(botNumberForConfig, currentConfig);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋✅ ᴀᴛɪᴠᴀᴛɪᴏɴ ᴍɪꜱᴇ à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚙️ ᴍᴏᴅᴇ : ${newMode}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ANTITAG CMD ERROR]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐓𝐀𝐆*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
case 'delsession': {
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== ownerNum) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ᴀᴄᴄèꜱ ʀᴇꜰᴜꜱé
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ ɢʟᴏʙᴀʟ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const target = (args[0] || '').replace(/[^0-9]/g, '');
    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋⚙️ ᴜsᴀɢᴇ : .delsession <ɴᴜᴍᴇʀᴏ>
│. ˚˖𓍢ִ໋📌 ᴇx : .delsession 0000000000
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const fetch = require('node-fetch');
    const resp = await fetch('http://localhost:2036/api/session/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pass': 'adminowner'
      },
      body: JSON.stringify({ number: target })
    });

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      const text = await resp.text();
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ʀéᴘᴏɴsᴇ ɪɴᴠᴀʟɪᴅᴇ
│. ˚˖𓍢ִ໋📛 ${text}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (data.ok) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋✅ sᴇssɪᴏɴ sᴜᴘᴘʀɪᴍéᴇ
│. ˚˖𓍢ִ໋📱 ɴᴜᴍᴇʀᴏ : ${target}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ éᴄʜᴇᴄ
│. ˚˖𓍢ִ໋📛 ${data.error || 'ʀéᴘᴏɴsᴇ ɪɴᴀᴛᴛᴇɴᴅᴜᴇ'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('[DELSESSION ERROR]', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐒𝐒𝐈𝐎𝐍*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


 case 'detect': {
  try {
    // Récupérer la source du message (supporte conversation simple et extendedTextMessage)
    const raw = msg.message || {};
    const quoted = raw.extendedTextMessage?.contextInfo?.quotedMessage
      || raw.extendedTextMessage?.contextInfo?.stanzaId && raw.extendedTextMessage?.contextInfo?.quotedMessage
      || raw.imageMessage?.contextInfo?.quotedMessage
      || raw.videoMessage?.contextInfo?.quotedMessage
      || raw.audioMessage?.contextInfo?.quotedMessage
      || null;

    // Si la commande n'est pas utilisée en réponse, on informe l'utilisateur
    if (!quoted) {
      await socket.sendMessage(sender, {
        text: 'ℹ️ Utilisation : répondez à un message puis envoyez la commande .detect pour voir sa structure.'
      }, { quoted: msg });
      break;
    }

    // Helper : extraire le type principal du message cité
    function detectMessageType(q) {
      if (!q) return 'unknown';
      const keys = Object.keys(q);
      // Priorité sur les types connus
      const types = ['conversation','extendedTextMessage','imageMessage','videoMessage','audioMessage','stickerMessage','documentMessage','contactMessage','locationMessage','productMessage','buttonsResponseMessage','listResponseMessage','templateMessage'];
      for (const t of types) if (q[t]) return t;
      // fallback : premier key non metadata
      return keys.length ? keys[0] : 'unknown';
    }

    // Helper : construire un objet résumé sans données binaires lourdes
    function summarizeMessage(q) {
      const type = detectMessageType(q);
      const summary = { type, rawKeys: Object.keys(q) };

      // texte
      if (q.conversation) summary.text = q.conversation;
      if (q.extendedTextMessage) {
        summary.extendedText = q.extendedTextMessage.text || null;
        summary.extendedContext = q.extendedTextMessage.contextInfo ? {
          stanzaId: q.extendedTextMessage.contextInfo.stanzaId || null,
          participant: q.extendedTextMessage.contextInfo.participant || null,
          quotedMessageKeys: q.extendedTextMessage.contextInfo.quotedMessage ? Object.keys(q.extendedTextMessage.contextInfo.quotedMessage) : null
        } : null;
      }

      // image
      if (q.imageMessage) {
        summary.image = {
          mimetype: q.imageMessage.mimetype || null,
          caption: q.imageMessage.caption || null,
          fileSha256: q.imageMessage.fileSha256 ? Buffer.from(q.imageMessage.fileSha256).toString('hex') : null,
          fileLength: q.imageMessage.fileLength || null,
          url: q.imageMessage.url || null
        };
      }

      // video
      if (q.videoMessage) {
        summary.video = {
          mimetype: q.videoMessage.mimetype || null,
          caption: q.videoMessage.caption || null,
          seconds: q.videoMessage.seconds || null,
          fileLength: q.videoMessage.fileLength || null,
          url: q.videoMessage.url || null
        };
      }

      // audio
      if (q.audioMessage) {
        summary.audio = {
          mimetype: q.audioMessage.mimetype || null,
          seconds: q.audioMessage.seconds || null,
          ptt: !!q.audioMessage.ptt,
          fileLength: q.audioMessage.fileLength || null,
          url: q.audioMessage.url || null
        };
      }

      // document
      if (q.documentMessage) {
        summary.document = {
          fileName: q.documentMessage.fileName || null,
          mimetype: q.documentMessage.mimetype || null,
          fileLength: q.documentMessage.fileLength || null,
          url: q.documentMessage.url || null
        };
      }

      // sticker
      if (q.stickerMessage) {
        summary.sticker = {
          isAnimated: !!q.stickerMessage.isAnimated,
          isVideo: !!q.stickerMessage.isVideo,
          fileSha256: q.stickerMessage.fileSha256 ? Buffer.from(q.stickerMessage.fileSha256).toString('hex') : null
        };
      }

      // contact / location / product
      if (q.contactMessage) summary.contact = { displayName: q.contactMessage.displayName || null, vcard: !!q.contactMessage.vcard };
      if (q.locationMessage) summary.location = { degreesLatitude: q.locationMessage.degreesLatitude || null, degreesLongitude: q.locationMessage.degreesLongitude || null, name: q.locationMessage.name || null };
      if (q.productMessage) summary.product = { productId: q.productMessage.product?.id || null, title: q.productMessage.product?.title || null };

      // metadata utile
      if (q.contextInfo) {
        summary.contextInfo = {
          mentionedJid: q.contextInfo.mentionedJid || null,
          externalAdReply: q.contextInfo.externalAdReply ? {
            title: q.contextInfo.externalAdReply.title || null,
            mediaType: q.contextInfo.externalAdReply.mediaType || null,
            mediaUrl: q.contextInfo.externalAdReply.mediaUrl || null
          } : null
        };
      }

      return summary;
    }

    // Construire le rapport
    const report = {
      inspectedAt: new Date().toISOString(),
      chat: msg.key?.remoteJid || 'unknown',
      isGroup: (msg.key?.remoteJid || '').endsWith('@g.us'),
      quotedMessageKey: {
        id: raw.extendedTextMessage?.contextInfo?.stanzaId || raw.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id || null,
        participant: raw.extendedTextMessage?.contextInfo?.participant || raw.extendedTextMessage?.contextInfo?.quotedMessage?.key?.participant || null
      },
      summary: summarizeMessage(quoted)
    };

    // Envoyer le rapport formaté (limiter la taille)
    const pretty = JSON.stringify(report, null, 2);
    const MAX_LEN = 1500;
    if (pretty.length <= MAX_LEN) {
      await socket.sendMessage(sender, { text: `🔍 Résultat de l'inspection :\n\n${pretty}` }, { quoted: msg });
    } else {
      // découper en plusieurs messages si trop long
      const chunks = [];
      for (let i = 0; i < pretty.length; i += MAX_LEN) chunks.push(pretty.slice(i, i + MAX_LEN));
      await socket.sendMessage(sender, { text: '🔍 Rapport trop long, envoi en plusieurs parties...' }, { quoted: msg });
      for (const c of chunks) {
        await socket.sendMessage(sender, { text: '```json\n' + c + '\n```' }, { quoted: msg });
      }
    }

  } catch (err) {
    console.error('[DETECT CASE ERROR]', err);
    try {
      await socket.sendMessage(sender, { text: `❌ Erreur lors de l'inspection : ${err.message || err}` }, { quoted: msg });
    } catch (e) { /* ignore */ }
  }
  break;
}         
// ============ COMMANDES DE GROUPE ========
case 'config': {
  try {
    const sub = (args[0] || '').toLowerCase();
    const param = args.slice(1).join(' ').trim();
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CONFIG_DENY1" },
        message: { contactMessage: { displayName: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;\nFN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\nEND:VCARD` } }
      };

      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔒 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋❌ ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
│. ˚˖𓍢ִ໋👑 ᴏɴʟʏ ᴏᴡɴᴇʀ ᴏʀ sᴇssɪᴏɴ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: shonux });

      break;
    }

    let cfg = await loadUserConfigFromMongo(sanitized) || {};

    switch (sub) {

      case 'autoview': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_VIEW_STATUS = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏᴠɪᴇᴡ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_VIEW_STATUS ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autoview on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'autolike': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_LIKE_STATUS = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❤️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏʟɪᴋᴇ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_LIKE_STATUS ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❤️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autolike on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'autorec': {
        const val = (args[1] || '').toLowerCase();
        if (val === 'on' || val === 'off') {
          cfg.AUTO_RECORDING = val === 'on';
          await setUserConfigInMongo(sanitized, cfg);

          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴀᴜᴛᴏʀᴇᴄ ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋⚡ ᴍᴏᴅᴇ : ${cfg.AUTO_RECORDING ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });

        } else {
          await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ : .config autorec on|off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
          }, { quoted: msg });
        }
        break;
      }

      case 'setemoji': {
        const emojis = param.split(/\s+/).filter(Boolean);
        cfg.AUTO_LIKE_EMOJI = emojis;
        await setUserConfigInMongo(sanitized, cfg);

        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋😀 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🔁 ᴇᴍᴏᴊɪs ᴍɪs à ᴊᴏᴜʀ
│. ˚˖𓍢ִ໋📌 ${emojis.join(' ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }

      

      case 'show':
      case 'get': {
        const merged = { 
          AUTO_VIEW_STATUS: typeof cfg.AUTO_VIEW_STATUS === 'undefined' ? true : cfg.AUTO_VIEW_STATUS,
          AUTO_LIKE_STATUS: typeof cfg.AUTO_LIKE_STATUS === 'undefined' ? true : cfg.AUTO_LIKE_STATUS,
          AUTO_RECORDING: typeof cfg.AUTO_RECORDING === 'undefined' ? false : cfg.AUTO_RECORDING,
          AUTO_LIKE_EMOJI: Array.isArray(cfg.AUTO_LIKE_EMOJI) && cfg.AUTO_LIKE_EMOJI.length ? cfg.AUTO_LIKE_EMOJI : ['🐉','🔥','💀','👑','💪','😎','🇭🇹','⚡','🩸','❤️'],
          PREFIX: cfg.PREFIX || '.',
          antidelete: cfg.antidelete === true
        };

        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📊 sᴇssɪᴏɴ sᴛᴀᴛᴜs
│. ˚˖𓍢ִ໋👁️ ᴀᴜᴛᴏᴠɪᴇᴡ : ${merged.AUTO_VIEW_STATUS}
│. ˚˖𓍢ִ໋❤️ ᴀᴜᴛᴏʟɪᴋᴇ : ${merged.AUTO_LIKE_STATUS}
│. ˚˖𓍢ִ໋🎥 ᴀᴜᴛᴏʀᴇᴄ : ${merged.AUTO_RECORDING}
│. ˚˖𓍢ִ໋😀 ᴇᴍᴏᴊɪs : ${merged.AUTO_LIKE_EMOJI.join(' ')}
│. ˚˖𓍢ִ໋⌨️ ᴘʀᴇғɪx : ${merged.PREFIX}
│. ˚˖𓍢ִ໋🛡️ ᴀɴᴛɪᴅᴇʟᴇᴛᴇ : ${merged.antidelete ? 'ON' : 'OFF'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }

      default: {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs :
│. ˚˖𓍢ִ໋   .config autoview on|off
│. ˚˖𓍢ִ໋   .config autolike on|off
│. ˚˖𓍢ִ໋   .config autorec on|off
│. ˚˖𓍢ִ໋   .config setemoji ...
│. ˚˖𓍢ִ໋   .config setprefix .
│. ˚˖𓍢ִ໋   .config show
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

        break;
      }
    }

  } catch (err) {
    console.error('config case error', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ sʏsᴛᴇᴍ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// CASE: welcome
case 'welcome': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋❗ ɢʀᴏᴜᴘ ᴏɴʟʏ ᴄᴏᴍᴍᴀɴᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
      toggleWelcome(from, true);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋✅ ᴍᴏᴅᴇ ᴀᴄᴛɪᴠé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'off') {
      toggleWelcome(from, false);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋❌ ᴍᴏᴅᴇ ᴅéꜱᴀᴄᴛɪᴠé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'status') {
      const state = isWelcomeEnabled(from) ? 'activé ✅' : 'désactivé ❌';
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'set') {
      const template = args.slice(1).join(' ').trim();
      if (!template) {
        await socket.sendMessage(from, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋⚙️ ᴜsᴀɢᴇ : .welcome set <message>
│. ˚˖𓍢ִ໋📌 {user} {group}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }

      setWelcomeTemplate(from, template);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋✅ ᴍᴇssᴀɢᴇ ᴇɴʀᴇɢɪsᴛʀé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'reset') {
      setWelcomeTemplate(from, null);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋♻️ ʀᴇꜱᴇᴛ ᴅᴏɴɴé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs :
│. ˚˖𓍢ִ໋   .welcome on
│. ˚˖𓍢ִ໋   .welcome off
│. ˚˖𓍢ִ໋   .welcome status
│. ˚˖𓍢ִ໋   .welcome set <msg>
│. ˚˖𓍢ִ໋   .welcome reset
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('WELCOME CASE ERROR', err);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐖𝐄𝐋𝐂𝐎𝐌𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'goodbye': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋❗ ɢʀᴏᴜᴘ ᴏɴʟʏ ᴄᴏᴍᴍᴀɴᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
      toggleGoodbye(from, true);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'off') {
      toggleGoodbye(from, false);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋❌ ᴅéꜱᴀᴄᴛɪᴠé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'status') {
      const state = isGoodbyeEnabled(from) ? 'activé ✅' : 'désactivé ❌';
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'set') {
      const template = args.slice(1).join(' ').trim();
      if (!template) {
        await socket.sendMessage(from, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋⚙️ ᴜsᴀɢᴇ : .goodbye set <msg>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }

      setGoodbyeTemplate(from, template);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋✅ ᴍᴇssᴀɢᴇ ᴇɴʀᴇɢɪsᴛʀé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (sub === 'reset') {
      setGoodbyeTemplate(from, null);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋♻️ ʀᴇꜱᴇᴛ ᴅᴏɴɴé
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs :
│. ˚˖𓍢ִ໋   .goodbye on
│. ˚˖𓍢ִ໋   .goodbye off
│. ˚˖𓍢ִ໋   .goodbye status
│. ˚˖𓍢ִ໋   .goodbye set <msg>
│. ˚˖𓍢ִ໋   .goodbye reset
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('GOODBYE CASE ERROR', err);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐎𝐎𝐃𝐁𝐘𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'wanted': {
    try {
        const axios = require("axios");

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "🏴‍☠️",
                key: msg.key
            }
        });

        // ===== USER =====
        let user =
            msg?.mentionedJid?.[0] ||
            msg?.quoted?.sender ||
            msg?.key?.participant ||
            sender;

        // ===== PROFILE =====
        let pfp = await socket.profilePictureUrl(user, "image")
            .catch(() => "https://files.catbox.moe/xsk3rl.jpg");

        // ===== API =====
        const api =
            `https://api.popcat.xyz/wanted?image=${encodeURIComponent(pfp)}`;

        // ===== CAPTION =====
        const caption = `
╭┄┄『 𝐖𝐀𝐍𝐓𝐄𝐃 』
│🏴‍☠️ most wanted criminal
│ you techx bot
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> @${user.split("@")[0]} is now wanted 🚨
`.trim();

        // ===== SEND =====
        await socket.sendMessage(sender, {
            image: { url: api },
            caption: caption,
            mentions: [user],
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: [
                {
                    buttonId: ".wanted",
                    buttonText: { displayText: "🔁 ᴀɢᴀɪɴ" },
                    type: 1
                },
                {
                    buttonId: ".menu",
                    buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("WANTED ERROR:", e);

        await socket.sendMessage(sender, {
            text: "failed to apply wanted effect"
        }, { quoted: msg });
    }
}
break;

case 'wasted': {
    try {
        const axios = require("axios");

        // ===== REACT =====
        await socket.sendMessage(sender, {
            react: {
                text: "💀",
                key: msg.key
            }
        });

        // ===== USER =====
        let user =
            msg?.mentionedJid?.[0] ||
            msg?.quoted?.sender ||
            msg?.key?.participant ||
            sender;

        // ===== PROFILE PICTURE =====
        let pfp = await socket.profilePictureUrl(user, "image")
            .catch(() => "https://i.imgur.com/2wzGhpF.jpeg");

        // ===== API =====
        const api =
            `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(pfp)}`;

        // ===== CAPTION =====
        const caption = `
╭┄┄『 𝐖𝐀𝐒𝐓𝐄𝐃 』
│💀 target eliminated
│ you techx bot
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> @${user.split("@")[0]} got wasted ☠️
`.trim();

        // ===== SEND =====
        await socket.sendMessage(sender, {
            image: { url: api },
            caption: caption,
            mentions: [user],
            footer: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*",
            buttons: [
                {
                    buttonId: ".wasted",
                    buttonText: { displayText: "🔁 ᴀɢᴀɪɴ" },
                    type: 1
                },
                {
                    buttonId: ".menu",
                    buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
                    type: 1
                }
            ],
            headerType: 4
        }, { quoted: msg });

    } catch (e) {
        console.error("WASTED ERROR:", e);

        await socket.sendMessage(sender, {
            text: "failed to apply wasted effect"
        }, { quoted: msg });
    }
}
break;

// Case swgc à coller dans ton switch principal
// Utilise le module status.js et ton client nommé socket

// ===============================
// TAKE / STEAL / SWM
// ===============================

case 'take':
case 'steal':
case 'swm': {
  try {

    // ===== CHECK QUOTE =====
    if (!msg.quoted) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄ᕗ
│ 📌 ${toSmallCaps("reply to a sticker")}
╰┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const mime =
      (msg.quoted.msg || msg.quoted).mimetype || '';

    if (!/webp/.test(mime)) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("this is not a sticker")
      }, { quoted: msg });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "⏳",
        key: msg.key
      }
    });

    // ===== INPUT =====
    const input = args.join(" ");

    const [packname, ...authorParts] =
      input.split('|');

    const finalPack =
      packname?.trim() ||
      "𝚂𝚃𝙰𝚁 𝚈𝙾𝚄";

    const finalAuthor =
      authorParts.join('|').trim() ||
      "𝚈𝙾𝚄-𝚃𝙴𝙲𝙷";

    // ===== DOWNLOAD =====
    const media =
      await msg.quoted.download();

    if (!media) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("download failed")
      }, { quoted: msg });
    }

    // ===== EXIF STICKER =====
    const sticker =
      await addExif(media, finalPack, finalAuthor);

    // ===== SEND STICKER =====
    await socket.sendMessage(sender, {
      sticker
    }, { quoted: msg });

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: `${prefix}menu`,
        buttonText: { displayText: "📋 ᴍᴇɴᴜ" },
        type: 1
      },
      {
        buttonId: `${prefix}alive`,
        buttonText: { displayText: "⚡ ᴀʟɪᴠᴇ" },
        type: 1
      }
    ];

    // ===== CONFIRMATION =====
    await socket.sendMessage(sender, {
      text: `✅ ${toSmallCaps("sticker created successfully")}`,
      footer: "ʏᴏᴜ ᴍᴅ ʙᴏᴛ",
      buttons,
      headerType: 1
    }, { quoted: msg });

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("TAKE ERROR:", e);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄ᕗ
│ ❌ ${toSmallCaps("sticker failed")}
│ ⚠️ ${toSmallCaps("check exif function")}
╰┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
}
break;


// ===============================
// TELEGRAM STICKER DOWNLOAD
// ===============================

case 'telestick':
case 'tgsticker': {
  try {

    const axios = require('axios');

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📥",
        key: msg.key
      }
    });

    // ===== VALIDATION =====
    if (
      !args[0] ||
      !args[0].includes("t.me/addstickers/")
    ) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("invalid telegram link")
      }, { quoted: msg });
    }

    const packName =
      args[0].split("/addstickers/")[1];

    const botToken =
      "YOUR_BOT_TOKEN"; // 🔒 à sécuriser

    // ===== GET PACK =====
    const res =
      await axios.get(
        `https://api.telegram.org/bot${botToken}/getStickerSet?name=${packName}`
      );

    if (!res.data.ok) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("pack not found")
      }, { quoted: msg });
    }

    const stickers =
      res.data.result.stickers;

    const limit =
      Math.min(stickers.length, 15);

    await socket.sendMessage(sender, {
      text:
`📦 ${toSmallCaps("downloading")} : ${limit}`
    }, { quoted: msg });

    // ===== LOOP STICKERS =====
    for (let i = 0; i < limit; i++) {
      try {

        const fileId =
          stickers[i].file_id;

        const fileInfo =
          await axios.get(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
          );

        const filePath =
          fileInfo.data.result.file_path;

        const fileUrl =
          `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        const buffer =
          (await axios.get(fileUrl, {
            responseType: 'arraybuffer'
          })).data;

        const sticker =
          await addExif(
            buffer,
            "𝚂𝚃𝙰𝚁 𝚈𝙾𝚄",
            "𝚈𝙾𝚄-𝚃𝙴𝙲𝙷"
          );

        await socket.sendMessage(sender, {
          sticker
        });

        await new Promise(r => setTimeout(r, 700));

      } catch (err) {
        console.log("Sticker Skip:", err.message);
      }
    }

    // ===== DONE =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("TELESTICK ERROR:", e);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text: toSmallCaps("telegram download failed")
    }, { quoted: msg });
  }
}
break;


case 'antilink': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❗ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const arg = args[0]?.toLowerCase();

    if (arg === 'on') {
      toggleAntiLink(from, true);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (arg === 'off') {
      toggleAntiLink(from, false);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴅᴇᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏғғ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else {
      const state = isAntiLinkEnabled(from) ? 'activé ✅' : 'désactivé ❌';

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
│. ˚˖𓍢ִ໋⚙️ ᴄᴏᴍᴍᴀɴᴅ :
│. ˚˖𓍢ִ໋   .antilink on
│. ˚˖𓍢ִ໋   .antilink off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error("ANTILINK CASE ERROR", err);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'antilink': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❗ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const arg = args[0]?.toLowerCase();

    if (arg === 'on') {
      toggleAntiLink(from, true);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else if (arg === 'off') {
      toggleAntiLink(from, false);
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴅᴇᴀᴄᴛɪᴠᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🛡️ ʟɪɴᴋ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴏғғ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } else {
      const state = isAntiLinkEnabled(from) ? 'activé ✅' : 'désactivé ❌';

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
│. ˚˖𓍢ִ໋⚙️ ᴄᴏᴍᴍᴀɴᴅ :
│. ˚˖𓍢ִ໋   .antilink on
│. ˚˖𓍢ִ໋   .antilink off
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (err) {
    console.error("ANTILINK CASE ERROR", err);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔗 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ---------------- CASE ssweb (robuste) ----------------
case 'ss':
case 'ssweb': {
  try {
    const axios = require("axios");

    // ===== REACT (cohérent avec style bot) =====
    await socket.sendMessage(sender, {
      react: {
        text: "📸",
        key: msg.key
      }
    });

    if (!text) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 📌 usage :
│ ${prefix}ssweb https://google.com
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    let url = text.startsWith("http") ? text : `https://${text}`;

    await socket.sendMessage(sender, {
      text: "capturing website..."
    }, { quoted: msg });

    const apiUrl =
      `https://apis.davidcyril.name.ng/ssweb?url=${encodeURIComponent(url)}`;

    const response = await axios.get(apiUrl, {
      responseType: "arraybuffer"
    });

    const imageBuffer = Buffer.from(response.data);

    const p = prefix;

    const buttons = [
      {
        buttonId: `${p}ssweb ${url}`,
        buttonText: { displayText: "🔁 ʀᴇʟᴏᴀᴅ" },
        type: 1
      },
      {
        buttonId: `${p}menu`,
        buttonText: { displayText: "📋 ᴍᴇɴᴜ" },
        type: 1
      }
    ];

    await socket.sendMessage(sender, {
      image: imageBuffer,
      caption:
`╭┄┄◆ website screenshot ◆
│ 🌐 url :
│ ${url}
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> powered by you tech ⚡`,
      footer: "you web bot",
      buttons,
      headerType: 4
    }, { quoted: msg });

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {
    console.error("SSWEB ERROR:", e);

    // ===== ERROR REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ❌ failed to capture site
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
}
break;
   
 case 'checkban': {
  try {
    const target = (args[0] || '').replace(/[^0-9]/g, '');
    if (!target) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ɴᴜᴍᴇʀᴏ ʀᴇǫᴜɪʀᴇᴅ
│. ˚˖𓍢ִ໋📌 ${prefix}checkban 509xxxxxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    let result;
    try {
      result = await socket.onWhatsApp(target + '@s.whatsapp.net');
    } catch (e) {
      console.error('[CHECKBAN ERROR]', e);
      result = null;
    }

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_CHECKBAN"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;
FN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=${target}:${target}
END:VCARD`
        }
      }
    };

    let reply;

    if (result && result.length > 0 && result[0]?.exists) {
      reply =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🟢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋✅ ɴᴜᴍᴇʀᴏ ᴀᴄᴛɪғ
│. ˚˖𓍢ִ໋📱 ${target}
│. ˚˖𓍢ִ໋🟢 sᴛᴀᴛᴜs : ᴏɴ ᴡʜᴀᴛsᴀᴘᴘ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;
    } else {
      reply =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋☠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ɴᴜᴍᴇʀᴏ ɪɴᴀᴄᴛɪғ / ʙᴀɴɴᴇᴅ
│. ˚˖𓍢ִ໋📱 ${target}
│. ˚˖𓍢ִ໋⚠️ sᴛᴀᴛᴜs : ᴅᴇᴀᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;
    }

    await socket.sendMessage(sender, {
      text: reply
    }, { quoted: shonux });

  } catch (err) {
    console.error('[CHECKBAN CASE ERROR]', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛡️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐄𝐂𝐊𝐁𝐀𝐍*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
 
 
case 'antistatusmention': {
  try {
    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (!from.endsWith('@g.us')) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋❌ ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    if (typeof cfg.antistatusmention === 'undefined') cfg.antistatusmention = false;
    if (typeof cfg.antistatusmention_threshold === 'undefined') cfg.antistatusmention_threshold = 2;

    const state = cfg.antistatusmention ? 'ON 🟢' : 'OFF 🔴';

    const buttons = [
      {
        buttonId: cfg.antistatusmention ? 'antistatusmention_off' : 'antistatusmention_on',
        buttonText: {
          displayText: cfg.antistatusmention ? '⛔ ᴅᴇᴀᴄᴛɪᴠᴀᴛᴇ' : '✅ ᴀᴄᴛɪᴠᴀᴛᴇ'
        },
        type: 1
      }
    ];

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ${state}
│. ˚˖𓍢ִ໋⚠️ ᴛʜʀᴇsʜᴏʟᴅ : ${cfg.antistatusmention_threshold}
│. ˚˖𓍢ִ໋🧠 ᴍᴏᴅᴇ : sᴛᴀᴛᴜs ᴍᴇɴᴛɪᴏɴ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (err) {
    console.error('[ANTISTATUS SWITCH ERROR]', err);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ── BUTTON ACTIONS ──

case 'antistatusmention_on': {
  const sanitized = String(number || '').replace(/[^0-9]/g, '');
  let cfg = await loadUserConfigFromMongo(sanitized) || {};
  cfg.antistatusmention = true;
  await setUserConfigInMongo(sanitized, cfg);

  await socket.sendMessage(from, {
    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴀᴛᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
  }, { quoted: msg });
  break;
}

case 'antistatusmention_off': {
  const sanitized = String(number || '').replace(/[^0-9]/g, '');
  let cfg = await loadUserConfigFromMongo(sanitized) || {};
  cfg.antistatusmention = false;
  await setUserConfigInMongo(sanitized, cfg);

  await socket.sendMessage(from, {
    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐀𝐍𝐓𝐈𝐒𝐓𝐀𝐓𝐔𝐒*
│. ˚˖𓍢ִ໋⛔ ᴅᴇᴀᴄᴛɪᴠᴀᴛᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
  }, { quoted: msg });
  break;
}

// ---------------- CASE tagall ----------------
case 'tagall': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📢",
        key: msg.key
      }
    });

    // ===== CHECK GROUP =====
    if (!isGroup) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("this command works only in groups")
      }, {
        quoted: msg
      });
    }

    // ===== CHECK ADMINS =====
    if (!isAdmins && !isOwner) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("only group admins can use tagall")
      }, {
        quoted: msg
      });
    }

    // ===== GROUP DATA =====
    const participants = groupMetadata.participants;

    const totalMembers = participants.length;

    const totalAdmins =
      participants.filter(p => p.admin !== null).length;

    const msgText =
      args.join(' ') || "No message";

    // ===== MESSAGE =====
    let message = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│📢 *${toSmallCaps("attention everyone")}*

│ *${toSmallCaps("message")} :* ${toSmallCaps(msgText)}
│ 👥 *${toSmallCaps("members")} :* ${totalMembers}
│ 👑 *${toSmallCaps("admins")} :* ${totalAdmins}
│
`.trim();

    let mentions = [];

    for (let mem of participants) {
      message += `\n│🍂 @${mem.id.split('@')[0]}`;
      mentions.push(mem.id);
    }

    message += `

╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> 📢 ʏᴏᴜ ᴍᴅ ʙᴏᴛ`;

    // ===== AUDIO =====
    await socket.sendMessage(sender, {
      audio: {
        url: 'https://files.catbox.moe/8f36dh.mp3'
      },
      mimetype: 'audio/mpeg',
      ptt: true
    }, {
      quoted: msg
    });

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '🌟 ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== IMAGE =====
    await socket.sendMessage(sender, {
      image: {
        url: 'https://files.catbox.moe/0lsjly.png'
      },
      caption: message,
      footer: '📢 ʏᴏᴜ ᴍᴅ ʙᴏᴛ',
      buttons: buttons,
      headerType: 4,
      mentions: mentions,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          title: "𝐓𝐀𝐆𝐀𝐋𝐋",
          body: "Group Mention System",
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("TAGALL ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("error during tagging")
    }, {
      quoted: msg
    });
  }
}
break;


case 'listadmin': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐒*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { metadata, groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    let text =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐒*
│. ˚˖𓍢ִ໋📛 ɢʀᴏᴜᴘ : ${metadata?.subject || 'unknown'}
│. ˚˖𓍢ִ໋ ʏᴏᴜ ᴛᴇᴄʜx ᴏғᴄ
`;

    if (!groupAdminsJid.length) {
      text += `│. ˚˖𓍢ִ໋❌ ᴀᴜᴄᴜɴ ᴀᴅᴍɪɴ\n`;
    } else {
      groupAdminsJid.forEach((a, i) => {
        text += `│. ˚˖𓍢ִ໋👤 ${i + 1}. ${a}\n`;
      });
    }

    text +=
`│. ˚˖𓍢ִ໋ʙᴏᴛ ᴛᴀɢᴇᴛ ᴍᴇᴍʙᴇʀs
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ : ${botJid || 'non détecté'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    await socket.sendMessage(from, {
      text
    }, { quoted: msg });

  } catch (e) {
    console.error('LISTADMIN ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐒*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

// ---------------- CASE kick ----------------
case 'kick': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!botJid || !groupAdminsJid.includes(botJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ʙᴏᴛ ɴᴏɴ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const mentions =
      msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (!mentions.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .kick @user
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const toRemove = mentions.filter(
      m => !groupAdminsJid.includes(m) && m !== botJid
    );

    if (!toRemove.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴛᴀʀɢᴇᴛ ɪɴᴠᴀʟɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.groupParticipantsUpdate(from, toRemove, 'remove');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋✅ ʀᴇᴍᴏᴠᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toRemove.map(j => j.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toRemove
    }, { quoted: msg });

  } catch (e) {
    console.error('KICK ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

// ---------------- CASE add ----------------
case 'add': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid =
      nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const number = args[0];
    if (!number) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .add <numéro>
│. ˚˖𓍢ִ໋💡 ᴇx: .add 509xxxxxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const clean = number.replace(/\D/g, '');
    const jidToAdd = `${clean}@s.whatsapp.net`;

    await socket.groupParticipantsUpdate(from, [jidToAdd], 'add');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋✅ ᴀᴊᴏᴜᴛé ᴀᴜ ɢʀᴏᴜᴘ
│. ˚˖𓍢ִ໋👤 ${jidToAdd.split('@')[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('ADD ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋➕ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐃*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
// ---------------- CASE promote ----------------
case 'promote': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid =
      nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (!botJid || !groupAdminsJid.includes(botJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ʙᴏᴛ ɴᴏɴ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const mentions =
      msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (!mentions.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .promote @user
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const toPromote = mentions.filter(
      m => !groupAdminsJid.includes(m) && m !== botJid
    );

    if (!toPromote.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴛᴀʀɢᴇᴛ ɪɴᴠᴀʟɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.groupParticipantsUpdate(from, toPromote, 'promote');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ᴘʀᴏᴍᴏᴛᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toPromote.map(j => j.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toPromote
    }, { quoted: msg });

  } catch (e) {
    console.error('PROMOTE ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

// ---------------- CASE demote ----------------
case 'demote': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { groupAdminsJid, botJid } =
      await require('./normalize').getGroupAdminsInfo(socket, from);

    const senderJid =
      nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (!botJid || !groupAdminsJid.includes(botJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ʙᴏᴛ ɴᴏɴ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const mentions =
      msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (!mentions.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ: .demote @user
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const toDemote = mentions.filter(
      m => groupAdminsJid.includes(m) && m !== botJid
    );

    if (!toDemote.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴛᴀʀɢᴇᴛ ɪɴᴠᴀʟɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.groupParticipantsUpdate(from, toDemote, 'demote');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
│. ˚˖𓍢ִ໋👤 ${toDemote.map(j => j.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toDemote
    }, { quoted: msg });

  } catch (e) {
    console.error('DEMOTE ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⬇️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ᴇʀʀᴇᴜʀ
│. ˚˖𓍢ִ໋📛 ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

// ===============================
// PROMOTE ALL
// ===============================

case 'promoteall': {
  try {

    // ===== GROUP CHECK =====
    if (!isGroup) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("this command works only in groups")
      }, { quoted: msg });
    }

    // ===== PERMISSION =====
    if (!isAdmins && !isOwner) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("only group admins or bot owner can use this")
      }, { quoted: msg });
    }

    // ===== GET DATA =====
    const metadata =
      await socket.groupMetadata(sender);

    const botId =
      socket.user.id.split(':')[0] + '@s.whatsapp.net';

    // ===== FILTER MEMBERS =====
    const membersToPromote =
      metadata.participants
        .filter(p =>
          p.admin === null &&
          p.id !== botId
        )
        .map(p => p.id);

    if (!membersToPromote.length) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("everyone is already an admin")
      }, { quoted: msg });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📈",
        key: msg.key
      }
    });

    // ===== WARNING =====
    await socket.sendMessage(sender, {
      text:
`📈 *${toSmallCaps("promoting all members")}*...

> *${toSmallCaps("count")} :* ${membersToPromote.length}`
    }, { quoted: msg });

    // ===== PROMOTE =====
    await socket.groupParticipantsUpdate(
      sender,
      membersToPromote,
      "promote"
    );

    // ===== SUCCESS =====
    await socket.sendMessage(sender, {
      text:
`✅ *${toSmallCaps("all members promoted successfully")}*

👤 *${toSmallCaps("action by")} :* @${msg.sender.split('@')[0]}`,
      mentions: [msg.sender]
    }, { quoted: msg });

    // ===== REACT SUCCESS =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("PROMOTEALL ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("failed to promote all members")
    }, { quoted: msg });
  }
}
break;


// ===============================
// DEMOTE ALL
// ===============================

case 'demoteall': {
  try {

    // ===== GROUP CHECK =====
    if (!isGroup) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("this command works only in groups")
      }, { quoted: msg });
    }

    // ===== PERMISSION =====
    if (!isAdmins && !isOwner) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("only group admins or bot owner can use this")
      }, { quoted: msg });
    }

    // ===== DATA =====
    const metadata =
      await socket.groupMetadata(sender);

    const botId =
      socket.user.id.split(':')[0] + '@s.whatsapp.net';

    const ownerGroup =
      metadata.owner || '';

    // ===== FILTER ADMINS =====
    const membersToDemote =
      metadata.participants
        .filter(p =>
          p.admin !== null &&
          p.id !== botId &&
          p.id !== ownerGroup
        )
        .map(p => p.id);

    if (!membersToDemote.length) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("no admins found to demote")
      }, { quoted: msg });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📉",
        key: msg.key
      }
    });

    // ===== WARNING =====
    await socket.sendMessage(sender, {
      text:
`📉 *${toSmallCaps("demoting all admins")}*...

> *${toSmallCaps("count")} :* ${membersToDemote.length}`
    }, { quoted: msg });

    // ===== DEMOTE =====
    await socket.groupParticipantsUpdate(
      sender,
      membersToDemote,
      "demote"
    );

    // ===== SUCCESS =====
    await socket.sendMessage(sender, {
      text:
`✅ *${toSmallCaps("all admins demoted successfully")}*

⚠️ *${toSmallCaps("note")} :* ${toSmallCaps("owner and bot are protected")}`,
      mentions: [msg.sender]
    }, { quoted: msg });

    // ===== REACT SUCCESS =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("DEMOTEALL ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("failed to demote all members")
    }, { quoted: msg });
  }
}
break;

case 'alive': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🪭",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const fs = require('fs');

    // ===== IMAGE =====
    const imagePath = './test.jpg';

    // fallback menu2.jpg
    const finalImage =
      fs.existsSync(imagePath)
        ? imagePath
        : './menu2.jpg';

    if (!fs.existsSync(finalImage)) {
      return await socket.sendMessage(sender, {
        text: "❌ L'image alive est introuvable."
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(finalImage);

    // ===== UPTIME =====
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const runtimeText = `${hours}ʜ ${minutes}ᴍ ${seconds}s`;

    // ===== BOT INFO =====
    const botMode =
      typeof mode !== "undefined"
        ? mode
        : "public";

    // ===== ALIVE TEXT =====
    const aliveMsg = `
*${toSmallCaps("you md is active")}* 🚀

> ${toSmallCaps("the most powerful and stable bot developed by you tech")}

╭┄┄◆ ${toSmallCaps("you md alive")} ◆
│ ◈ ${toSmallCaps("status")} : ${toSmallCaps("online")}
│ ◈ ${toSmallCaps("runtime")} : ${runtimeText}
│ ◈ ${toSmallCaps("prefix")} : [ ${prefix} ]
│ ◈ ${toSmallCaps("mode")} : ${toSmallCaps(botMode)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

*${toSmallCaps("type")} ${prefix}${toSmallCaps("menu to display commands")}*
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📋 ᴍᴇɴᴜ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.owner',
        buttonText: {
          displayText: '👑 ᴏᴡɴᴇʀ'
        },
        type: 1
      },
      {
        buttonId: '.allmenu',
        buttonText: {
          displayText: '⚡ ᴀʟʟ ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: aliveMsg,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363404137900781@newsletter',
          newsletterName: '𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓',
          serverMessageId: 125
        },
        externalAdReply: {
          title: toSmallCaps("you md system alive"),
          body: toSmallCaps("automated by you tech"),
          thumbnail: buffer,
          sourceUrl: "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z",
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: msg
    });

  } catch (e) {
    console.error("ALIVE ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("you md system is currently online")
    }, {
      quoted: msg
    });
  }
}
break;

case 'revokeall': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋🚫 ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const requests = await socket.groupRequestParticipantsList(from);
    if (!requests || requests.length === 0) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋ℹ️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋📭 ɴᴏ ʀᴇǫᴜᴇsᴛs ғᴏᴜɴᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    for (const req of requests) {
      await socket.groupRequestParticipantsUpdate(from, [req.jid], 'reject');
    }

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🚫 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐕𝐎𝐊𝐄*
│. ˚˖𓍢ִ໋👥 ${requests.length} ʀᴇǫᴜᴇsᴛs ʀᴇᴊᴇᴄᴛᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('REVOKEALL ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴇʀʀᴏʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

// ---------------- CASE mute / unmute ----------------
case 'mute': {
  if (!from.endsWith('@g.us')) break;
  try {
    const { groupAdminsJid } = await require('./normalize').getGroupAdminsInfo(socket, from);
    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;

    if (!groupAdminsJid.includes(senderJid)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏɴʟʏ ᴀᴅᴍɪɴs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (typeof socket.groupSettingUpdate === 'function') {
      await socket.groupSettingUpdate(from, 'announcement');

      const metadata = await socket.groupMetadata(from);
      const participants = metadata.participants.map(p => p.id);

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔇 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐌𝐔𝐓𝐄*
│. ˚˖𓍢ִ໋📴 ɢʀᴏᴜᴘ ᴍᴜᴛᴇᴅ (ᴀᴅᴍɪɴ ᴏɴʟʏ)
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
        mentions: participants
      }, { quoted: msg });

    } else {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ɴᴏ sᴜᴘᴘᴏʀᴛ ᴍᴇᴛʜᴏᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('MUTE ERROR', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴇʀʀᴏʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'unmute':
case 'open': {
    try {

        // ===== CHECK GROUP =====
        if (!isGroup) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("this command works only in groups")}*`
            }, { quoted: m });
        }

        if (!isAdmins && !isOwner) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("only group admins or bot owner can open the group")}*`
            }, { quoted: m });
        }

        // ===== REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "🔓",
                key: m.key
            }
        });

        // ===== OPEN GROUP =====
        await sock.groupSettingUpdate(m.chat, 'not_announcement');

        // ===== MESSAGE =====
        const openMsg = `
🔓 *${toSmallCaps("group opened")}*

> ${toSmallCaps("group is now open! all members can send messages")} 🗣️
`.trim();

        // ===== BUTTON =====
        const button = [{
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
                display_text: `🔒 ${toSmallCaps("mute")}`,
                id: `${prefix}mute`
            })
        }];

        // ===== SEND =====
        await sock.relayMessage(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: `*${toSmallCaps("you md manager")}*`,
                            hasMediaAttachment: false
                        },
                        body: { text: openMsg },
                        footer: { text: "ʏᴏᴜ ᴍᴅ ᴏᴘᴛɪᴍɪᴢᴇᴅ" },
                        nativeFlowMessage: {
                            buttons: button
                        }
                    }
                }
            }
        }, {});

    } catch (e) {
        console.error(e);

        sock.sendMessage(m.chat, {
            text: `❌ *${toSmallCaps("failed to open group")}*`
        }, { quoted: m });
    }
}
break;


case 'mute':
case 'close': {
    try {

        // ===== CHECK GROUP =====
        if (!isGroup) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("this command works only in groups")}*`
            }, { quoted: m });
        }

        if (!isAdmins && !isOwner) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("only group admins or bot owner can close the group")}*`
            }, { quoted: m });
        }

        // ===== REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "🔒",
                key: m.key
            }
        });

        // ===== CLOSE GROUP =====
        await sock.groupSettingUpdate(m.chat, 'announcement');

        // ===== MESSAGE =====
        const closeMsg = `
🔒 *${toSmallCaps("group closed")}*

> ${toSmallCaps("group is now closed! only admins can send messages")} 🤫
`.trim();

        // ===== BUTTON =====
        const button = [{
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
                display_text: `🔓 ${toSmallCaps("unmute")}`,
                id: `${prefix}unmute`
            })
        }];

        // ===== SEND =====
        await sock.relayMessage(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        header: {
                            title: `*${toSmallCaps("you md manager")}*`,
                            hasMediaAttachment: false
                        },
                        body: { text: closeMsg },
                        footer: { text: "ʏᴏᴜ ᴍᴅ ᴏᴘᴛɪᴍɪᴢᴇᴅ" },
                        nativeFlowMessage: {
                            buttons: button
                        }
                    }
                }
            }
        }, {});

    } catch (e) {
        console.error(e);

        sock.sendMessage(m.chat, {
            text: `❌ *${toSmallCaps("failed to close group")}*`
        }, { quoted: m });
    }
}
break;

// ---------------- CASE leave ----------------
case 'leave': {
  // Ne traiter que les commandes envoyées dans un groupe
  if (!from.endsWith('@g.us')) break;

  // Préparer la fausse vCard (quoted meta) avec le nom du bot
  try {
    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_LEAVE"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}:${config.OWNER_NUMBER}
END:VCARD`
        }
      }
    };

    const senderJid = nowsender || msg.key.participant || msg.key.remoteJid;
    const senderNum = (String(senderJid || '').split('@')[0] || '').replace(/[^0-9]/g, '');
    const ownerNum = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐋𝐄𝐀𝐕𝐄*
│. ˚˖𓍢ִ໋🚫 ʀᴇsᴛʀɪᴄᴛᴇᴅ ᴀᴄᴄᴇss
│. ˚˖𓍢ִ໋👤 ᴏɴʟʏ ᴏᴡɴᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    try {
      await socket.groupLeave(from);

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐋𝐄𝐀𝐕𝐄*
│. ˚˖𓍢ִ໋📴 ɢʀᴏᴜᴘ ʟᴇғᴛ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋🤖 ${botName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

    } catch (leaveErr) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ʟᴇᴀᴠᴇ ғᴀɪʟᴇᴅ
│. ˚˖𓍢ִ໋🧨 ${leaveErr?.message || leaveErr}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('LEAVE ERROR', e);

    try {
      const fallbackShonux = {
        key: {
          remoteJid: "status@broadcast",
          participant: "0@s.whatsapp.net",
          fromMe: false,
          id: "META_AI_FAKE_ID_LEAVE_FALLBACK"
        },
        message: {
          contactMessage: {
            displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
            vcard: `BEGIN:VCARD\nVERSION:3.0\nN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓;;;;\nFN:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\nEND:VCARD`
          }
        }
      };

      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴜɴᴇxᴘᴇᴄᴛᴇᴅ ᴇʀʀᴏʀ
│. ˚˖𓍢ִ໋🧨 ${e?.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: fallbackShonux });

    } catch {}
  }

  break;
}
// ---------------- CASE TESTGRP ----------------
case 'testgrp': {
  try {
    if (!from) break;

    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐄𝐒𝐓𝐆𝐑𝐏*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const metadata = await socket.groupMetadata(from);
    const participants = metadata?.participants || [];
    const groupAdminsJid = participants.filter(p => p?.admin).map(p => p.id);
    const groupAdminsNum = groupAdminsJid.map(j => (j || '').split('@')[0].split(':')[0]);

    let botJid = null;
    if (socket.user) {
      if (socket.user.jid) botJid = socket.user.jid;
      else if (socket.user.id) botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    }

    if (!botJid) {
      const idPart = socket.user?.id ? socket.user.id.split(':')[0] : null;
      const maybe = participants.find(p => p.id && idPart && p.id.startsWith(idPart));
      if (maybe) botJid = maybe.id;
    }

    const botNum = botJid ? botJid.split('@')[0].split(':')[0] : '';

    let text =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐓𝐄𝐒𝐓𝐆𝐑𝐏*
│. ˚˖𓍢ִ໋📊 ɢʀᴏᴜᴘ ᴅɪᴀɢɴᴏsᴛɪᴄ
\n`;

    text += `│. ˚˖𓍢ִ໋• ɢʀᴏᴜᴘ : ${metadata?.subject || '—'}\n`;
    text += `│. ˚˖𓍢ִ໋• ᴍᴇᴍʙᴇʀs : ${participants.length}\n`;

    text += `│. ˚˖𓍢ִ໋👥 ᴀᴅᴍɪɴs :\n`;
    groupAdminsJid.forEach((a, i) => text += `${i+1}. ${a}\n`);

    text += `\n│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ : ${botJid || '—'}\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    await socket.sendMessage(from, { text }, { quoted: msg });

  } catch (e) {
    console.error('[TESTGRP ERROR]', e);
    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴛᴇsᴛɢʀᴘ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}


case 'admininfo': {
  // Affiche la liste des admins (numéros) et le JID/numéro du bot, en réutilisant la logique de kickall
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐈𝐍𝐅𝐎*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const groupName = metadata.subject || "Sans nom";

    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    let adminListText =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍𝐈𝐍𝐅𝐎*
│. ˚˖𓍢ִ໋📊 ɢʀᴏᴜᴘ : ${groupName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n`;

    if (!groupAdmins.length) {
      adminListText += `│. ˚˖𓍢ִ໋• ᴀᴅᴍɪɴs : ɴᴏɴ ᴅᴇᴛᴇᴄᴛᴇ\n`;
    } else {
      adminListText += `│. ˚˖𓍢ִ໋• ᴀᴅᴍɪɴs :\n`;
      groupAdmins.forEach((admin, i) => {
        const num = admin.split('@')[0];
        adminListText += `│. ˚˖𓍢ִ໋ ${i + 1}. @${num}\n`;
      });
    }

    const botIsAdmin = groupAdmins.includes(botNumber);

    adminListText += `\n│. ˚˖𓍢ִ໋🤖 ʙᴏᴛ : ${botNumber}\n`;
    adminListText += `│. ˚˖𓍢ִ໋⚙️ ʙᴏᴛ ᴀᴅᴍɪɴ : ${botIsAdmin ? 'ʏᴇs ✔' : 'ɴᴏ ❌'}\n`;
    adminListText += `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    const mentions = [...groupAdmins];
    if (botIsAdmin && !mentions.includes(botNumber)) mentions.push(botNumber);

    await socket.sendMessage(from, {
      text: adminListText,
      mentions
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR admininfo]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴀᴅᴍɪɴɪɴғᴏ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n${e.message || e}`
    }, { quoted: msg });
  }
  break;
}
// ---------- MUTE ----------



// ---------- KICK (mention) ----------
// main.js (ou ton handler)

// Exemple d'utilisation dans une case add/kick/mute...
case 'kick': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const { participants, groupAdminsJid, groupAdminsNum, botJid, botNum } =
      await getGroupAdminsInfo(socket, from);

    const senderNum = jidToNumber(sender);

    if (!groupAdminsNum.includes(senderNum)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋🚫 ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!botNum || !groupAdminsNum.includes(botNum)) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ᴜsᴀɢᴇ : .ᴋɪᴄᴋ @ᴍᴇᴍʙᴇʀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const toRemove = mentions.filter(m => {
      const num = jidToNumber(m);
      return !groupAdminsNum.includes(num) && num !== botNum;
    });

    if (!toRemove.length) {
      await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ᴛᴀʀɢᴇᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.groupParticipantsUpdate(from, toRemove, 'remove');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊*
│. ˚˖𓍢ִ໋✅ ᴜsᴇʀ ʀᴇᴍᴏᴠᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toRemove.map(x => '@' + jidToNumber(x)).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: toRemove
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR kick]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴋɪᴄᴋ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n\n${e.message || e}`
    }, { quoted: msg });
  }

  break;
}
// ---------- PROMOTE ----------
case 'promote': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];

    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    if (!groupAdmins.includes(sender)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (!groupAdmins.includes(botNumber)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐒𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋📌 .ᴘʀᴏᴍᴏᴛᴇ @ᴍᴇᴍʙʀᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const toPromote = mentions.filter(m => !groupAdmins.includes(m) && m !== botNumber);
    if (!toPromote.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ɴᴏ ᴠᴀʟɪᴅ ᴛᴀʀɢᴇᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.groupParticipantsUpdate(from, toPromote, 'promote');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ᴜsᴇʀ ᴘʀᴏᴍᴏᴛᴇᴅ
│. ˚˖𓍢ִ໋👤 ${toPromote.map(x => '@' + x.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR promote]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
// ---------- DEMOTE ----------
case 'demote': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];

    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    if (!groupAdmins.includes(sender)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    if (!groupAdmins.includes(botNumber)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const mentions = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentions.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐒𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋📌 .ᴅᴇᴍᴏᴛᴇ @ᴍᴇᴍʙʀᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const toDemote = mentions.filter(m => groupAdmins.includes(m) && m !== botNumber);
    if (!toDemote.length) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ɴᴏ ᴠᴀʟɪᴅ ᴛᴀʀɢᴇᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.groupParticipantsUpdate(from, toDemote, 'demote');

    await socket.sendMessage(from, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👇 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋❌ ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
│. ˚˖𓍢ִ໋👤 ${toDemote.map(x => '@' + x.split('@')[0]).join(', ')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ERROR demote]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
/* setconfig <KEY> <VALUE> */
/* setconfig */
case 'setconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_DENIED" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🚫 ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const key = (args[0] || '').trim();
    const rawValue = args.slice(1).join(' ').trim();

    if (!key || rawValue === '') {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_HELP" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 .sᴇᴛᴄᴏɴғɪɢ <ᴋᴇʏ> <ᴠᴀʟᴜᴇ>
│. ˚˖𓍢ִ໋📖 .sʜᴏᴡᴄᴏɴғɪɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    if (typeof ALLOWED_KEYS !== 'undefined' && Array.isArray(ALLOWED_KEYS) && !ALLOWED_KEYS.includes(key)) {
      return await socket.sendMessage(from, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚠️ ᴋᴇʏ ɴᴏᴛ ᴀʟʟᴏᴡᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const parsed = (typeof parseValueByType === 'function') ? parseValueByType(rawValue) : rawValue;

    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {}, cfg);
    cfg[key] = parsed;

    cfg._meta = cfg._meta || {};
    cfg._meta.updatedAt = new Date();
    cfg._meta.updatedBy = senderNum;
    cfg._meta.raw = rawValue;

    await setUserConfigInMongo(sanitized, cfg);

    const metaOk = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_OK" },
      message: { contactMessage: { displayName: cfg.botName || BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚙️ ᴜᴘᴅᴀᴛᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋🔑 ${key} = ${formatValueForDisplay ? formatValueForDisplay(parsed) : String(parsed)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaOk });

  } catch (e) {
    console.error('setconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SETCONFIG_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}
/* getconfig */
case 'getconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const key = (args[0] || '').trim();
    if (!key) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG_HELP" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📌 .ɢᴇᴛᴄᴏɴғɪɢ <ᴋᴇʏ>
│. ˚˖𓍢ִ໋📖 .sʜᴏᴡᴄᴏɴғɪɢ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const value = (cfg.hasOwnProperty(key))
      ? cfg[key]
      : (DEFAULT_SESSION_CONFIG && DEFAULT_SESSION_CONFIG[key] !== undefined
          ? DEFAULT_SESSION_CONFIG[key]
          : undefined);

    const meta = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG" },
      message: { contactMessage: { displayName: botName } }
    };

    if (typeof value === 'undefined') {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚠️ ᴋᴇʏ ɴᴏᴛ ғᴏᴜɴᴅ
│. ˚˖𓍢ִ໋🔑 ${key}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋📊 ʀᴇsᴜʟᴛ
│. ˚˖𓍢ִ໋🔑 ${key} = ${formatValueForDisplay ? formatValueForDisplay(value) : String(value)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

  } catch (e) {
    console.error('getconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GETCONFIG_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}


/* resetconfig */
case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const meta = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_DENIED" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY } }
      };

      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋🚫 ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: meta });
    }

    const cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {});
    cfg._meta = {
      updatedAt: new Date(),
      updatedBy: senderNum,
      raw: 'reset'
    };

    await setUserConfigInMongo(sanitized, cfg);

    const metaOk = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_OK" },
      message: { contactMessage: { displayName: cfg.botName || BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐄𝐓𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋♻️ ʀᴇsᴇᴛ sᴜᴄᴄᴇssғᴜʟʟʏ
│. ˚˖𓍢ִ໋📦 sᴇssɪᴏɴ ʀᴇsᴛᴏʀᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaOk });

  } catch (e) {
    console.error('resetconfig error', e);

    const metaErr = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_RESET_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY } }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: metaErr });
  }

  break;
}
/* showconfig */
case 'showconfig2': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfgRaw = await loadUserConfigFromMongo(sanitized) || {};
    const cfg = Object.assign({}, DEFAULT_SESSION_CONFIG || {}, cfgRaw);
    const botName = cfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=50941319791:+50941319791\nEND:VCARD`
        }
      }
    };

    const lines = [];

    lines.push(
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📋 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐇𝐎𝐖𝐂𝐎𝐍𝐅𝐈𝐆*
│. ˚˖𓍢ִ໋⚙️ sᴇssɪᴏɴ ᴄᴏɴғɪɢ
│. ˚˖𓍢ִ໋👤 ɪᴅ : ${sanitized}`
    );

    lines.push('');
    lines.push(`│. ˚˖𓍢ִ໋• ʙᴏᴛ ɴᴀᴍᴇ : ${botName}`);
    lines.push(`│. ˚˖𓍢ִ໋• ʟᴏɢᴏ : ${cfg.logo || config.RCD_IMAGE_PATH || 'ɴᴏɴᴇ'}`);

    for (const k of Object.keys(DEFAULT_SESSION_CONFIG || {})) {
      if (k === 'botName') continue;
      const val = cfg.hasOwnProperty(k) ? cfg[k] : DEFAULT_SESSION_CONFIG[k];
      lines.push(`│. ˚˖𓍢ִ໋• ${k} : ${formatValueForDisplay ? formatValueForDisplay(val) : String(val)}`);
    }

    const extraKeys = Object.keys(cfg).filter(k => !DEFAULT_SESSION_CONFIG.hasOwnProperty(k) && k !== '_meta');

    if (extraKeys.length) {
      lines.push('');
      lines.push(`│. ˚˖𓍢ִ໋🔧 ᴄᴜsᴛᴏᴍ ᴋᴇʏs`);
      for (const k of extraKeys) {
        lines.push(`│. ˚˖𓍢ִ໋• ${k} : ${formatValueForDisplay ? formatValueForDisplay(cfg[k]) : String(cfg[k])}`);
      }
    }

    if (cfg._meta) {
      lines.push('');
      lines.push(`│. ˚˖𓍢ִ໋⏱️ ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇ : ${cfg._meta.updatedAt || '—'}`);
      lines.push(`│. ˚˖𓍢ִ໋👤 ʙʏ : ${cfg._meta.updatedBy || '—'}`);
    }

    lines.push('╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ');

    await socket.sendMessage(sender, { text: lines.join('\n') }, { quoted: shonux });

  } catch (e) {
    console.error('showconfig error', e);

    const shonuxErr = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG_ERR"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY
        }
      }
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ʜᴀɴᴅʟɪɴɢ ғᴀɪʟᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: shonuxErr });
  }

  break;
}


case 'sticker':
case 's':
case 'vs': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🎨",
        key: msg.key
      }
    });

    // ===== MODULE =====
    const stickerBuilder = require('./lib/sticker.js');

    const q =
      msg.quoted ? msg.quoted : msg;

    const mime =
      (q.msg || q).mimetype || '';

    // ===== VALIDATION =====
    if (!/image|video|gif/.test(mime)) {
      return await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ❌ ${toSmallCaps("reply to an image or video")}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    // ===== DOWNLOAD MEDIA =====
    const media =
      await q.download();

    const type =
      mime.split('/')[0];

    // ===== BUILD STICKER =====
    const buffer =
      await stickerBuilder.toSticker(type, media, {
        packname: "𝚂𝚃𝙰𝚁 𝚈𝙾𝚄",
        author: "𝚈𝙾𝚄 𝚃𝙴𝙲𝙷𝚇"
      });

    // ===== CAPTION =====
    const caption = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ 🎨 ${toSmallCaps("sticker ready")}
│ 📦 ${toSmallCaps("pack")} : star you
│ 👤 ${toSmallCaps("author")} : you techx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *${toSmallCaps("choose an action below")}* 👇
`.trim();

    // ===== PREVIEW MESSAGE =====
    await socket.sendMessage(sender, {
      image: media,
      caption: caption,
      footer: "ʏᴏᴜ ᴍᴅ ʙᴏᴛ",
      buttons: [
        {
          buttonId: `${prefix}s`,
          buttonText: { displayText: "🧾 sᴇɴᴅ ᴀɢᴀɪɴ" },
          type: 1
        },
        {
          buttonId: `${prefix}menu`,
          buttonText: { displayText: "📋 ᴍᴇɴᴜ" },
          type: 1
        }
      ],
      headerType: 4
    }, {
      quoted: msg
    });

    // ===== SEND STICKER =====
    await socket.sendMessage(sender, {
      sticker: buffer
    }, {
      quoted: msg
    });

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("STICKER ERROR:", e);

    await socket.sendMessage(sender, {
      react: {
        text: "❌",
        key: msg.key
      }
    });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ❌ ${toSmallCaps("sticker failed")}
│ ⚠️ ${toSmallCaps("error")} : ${e.message || "unknown"}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
}
break;


case 'setppfull':
case 'setpp': {
  try {
    const prefix = (typeof usedPrefix !== 'undefined' && usedPrefix)
                || (typeof prefix_used !== 'undefined' && prefix_used)
                || (typeof client?.prefix !== 'undefined' && client.prefix)
                || '.';

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directMsg = msg.message?.imageMessage || msg.message?.documentMessage
                       ? msg.message : null;
    const target = quotedMsg || directMsg;

    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📷 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐏𝐏*
│. ˚˖𓍢ִ໋❌ ʀᴇᴘʟʏ ᴡɪᴛʜ ɪᴍᴀɢᴇ
│. ˚˖𓍢ִ໋💡 ᴜsᴇ : ${prefix}setpp
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });

      break;
    }

    const downloader = async (src, type) => {
      if (typeof downloadMediaMessage === 'function') {
        try { return await downloadMediaMessage(src, type); } catch (_) {}
      }
      const { downloadContentFromMessage } = require('@rexxhayanasi/elaina-bail');
      const stream = await downloadContentFromMessage(src, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    };

    const buffer = await robustDownload(target, downloader);
    if (!buffer?.length) throw new Error('Buffer vide — média invalide.');

    const botJid =
      socket?.user?.id ||
      socket?.userJid ||
      socket?.authState?.creds?.me?.id ||
      null;

    if (!botJid) throw new Error('JID du bot introuvable.');

    let updated = false;

    if (typeof socket.updateProfilePictureFull === 'function') {
      try {
        await socket.updateProfilePictureFull(botJid, buffer);
        updated = true;
      } catch (e) {}
    }

    if (!updated && typeof socket.updateProfilePicture === 'function') {
      try {
        await socket.updateProfilePicture(botJid, buffer, { fullPicture: true });
        updated = true;
      } catch (e) {
        await socket.updateProfilePicture(botJid, buffer);
        updated = true;
      }
    }

    if (!updated && typeof socket.query === 'function') {
      await socket.query({
        tag: 'iq',
        attrs: { to: botJid, type: 'set', xmlns: 'w:profile:picture' },
        content: [{
          tag: 'picture',
          attrs: { type: 'image' },
          content: [
            { tag: 'image', attrs: {}, content: buffer },
            { tag: 'preview', attrs: {}, content: buffer }
          ]
        }]
      });
      updated = true;
    }

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐄𝐓𝐏𝐏*
│. ˚˖𓍢ִ໋👤 ᴘʀᴏғɪʟᴇ ᴜᴘᴅᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋🖼️ ғᴜʟʟ sɪᴢᴇ ᴀᴄᴛɪᴠᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (err) {
    console.error('[SETPP ERROR]', err);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ᴘʀᴏғɪʟᴇ ɴᴏᴛ ᴜᴘᴅᴀᴛᴇᴅ
│. ˚˖𓍢ִ໋💥 ${err?.message ?? String(err)}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

case 'sr': {
  if (!isOwner) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  const arg = (args[0] || '').toLowerCase();
  const minutes = parseInt(arg);

  if (!arg) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚙️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄 𝐑𝐄𝐒𝐓𝐀𝐑𝐓*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ɪɴғᴏ
│. ˚˖𓍢ִ໋• .sr [minutes]
│. ˚˖𓍢ִ໋• .sr 60 → ʀᴇsᴛᴀʀᴛ ᴇᴠᴇʀʏ 1ʜ
│. ˚˖𓍢ִ໋• .sr stop → sᴛᴏᴘ
│. ˚˖𓍢ִ໋• .sr now → ɴᴏᴡ
│. ˚˖𓍢ִ໋• .sr status → sᴛᴀᴛᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (arg === 'stop') {
    if (global.restartTimer) {
      clearInterval(global.restartTimer);
      global.restartTimer = null;
    }
    await stopRestartSchedule();
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🛑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋✅ sᴄʜᴇᴅᴜʟᴇ sᴛᴏᴘᴘᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (arg === 'now') {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔄 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐒𝐓𝐀𝐑𝐓*
│. ˚˖𓍢ִ໋⚡ ʀᴇsᴛᴀʀᴛɪɴɢ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    setTimeout(() => process.exit(0), 2000);
    break;
  }

  if (arg === 'status') {
    const doc = await getRestartSchedule();
    if (doc && doc.active) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋✅ ᴀᴄᴛɪᴠᴇ
│. ˚˖𓍢ִ໋⏱️ ${doc.minutes} ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋❌ ɴᴏ sᴄʜᴇᴅᴜʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }
    break;
  }

  if (isNaN(minutes) || minutes < 1) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  if (global.restartTimer) clearInterval(global.restartTimer);

  global.restartTimer = setInterval(() => {
    console.log(`🔄 Restart automatique (${minutes} minutes)`);
    process.exit(0);
  }, minutes * 60 * 1000);

  global.restartInterval = minutes;
  await setRestartSchedule(minutes);

  await socket.sendMessage(sender, {
    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐂𝐇𝐄𝐃𝐔𝐋𝐄*
│. ˚˖𓍢ִ໋⏰ ʀᴇsᴛᴀʀᴛ ᴘʀᴏɢʀᴀᴍᴍᴇᴅ
│. ˚˖𓍢ִ໋• ${minutes} ᴍɪɴᴜᴛᴇs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
  }, { quoted: msg });

  break;
}


  
case 'antidelete':
case 'ad': {
  try {
    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum  = String(config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'status') {
      const mode      = cfg.antidelete || 'off';
      const storeSize = getSessionStore(sanitized).size;

      const modeLabel = mode === 'all' ? '🌐 ᴛᴏᴜᴛ (ɢʀᴏᴜᴘs + ᴘʀɪᴠᴇ)'
                      : mode === 'g'   ? '👥 ɢʀᴏᴜᴘs sᴇᴜʟᴇᴍᴇɴᴛ'
                      : mode === 'p'   ? '💬 ᴘʀɪᴠᴇ sᴇᴜʟᴇᴍᴇɴᴛ'
                      : '⛔ ᴅᴇsᴀᴄᴛɪᴠᴇ';

      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs
│. ˚˖𓍢ִ໋• ᴍᴏᴅᴇ : ${modeLabel}
│. ˚˖𓍢ִ໋• sᴛᴏʀᴇ : ${storeSize}/${STORE_MAX_PER_SESSION}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if      (sub === 'off') { cfg.antidelete = 'off'; getSessionStore(sanitized).clear(); }
    else if (sub === 'g')   { cfg.antidelete = 'g';   }
    else if (sub === 'p')   { cfg.antidelete = 'p';   }
    else if (sub === 'all') { cfg.antidelete = 'all'; }
    else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴄᴏᴍᴍᴀɴᴅs
│. ˚˖𓍢ִ໋• .ad all → ᴛᴏᴜᴛ
│. ˚˖𓍢ִ໋• .ad g   → ɢʀᴏᴜᴘs
│. ˚˖𓍢ִ໋• .ad p   → ᴘʀɪᴠᴇ
│. ˚˖𓍢ִ໋• .ad off → ᴅᴇsᴀᴄᴛɪᴠᴇ
│. ˚˖𓍢ִ໋• .ad status → sᴛᴀᴛᴜs
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await setUserConfigInMongo(sanitized, cfg);

    const labels = {
      'all': '🌐 ᴛᴏᴜᴛ ᴀᴄᴛɪᴠᴇ',
      'g'  : '👥 ɢʀᴏᴜᴘs sᴇᴜʟᴇᴍᴇɴᴛ',
      'p'  : '💬 ᴘʀɪᴠᴇ sᴇᴜʟᴇᴍᴇɴᴛ',
      'off': '⛔ ᴅᴇsᴀᴄᴛɪᴠᴇ'
    };

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🗑️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐍𝐓𝐈𝐃𝐄𝐋𝐄𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ${labels[cfg.antidelete]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (e) {
    console.error('[ANTIDELETE ERROR]', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}
              
case 'promote':
case 'admin': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ɢʀᴏᴜᴘs ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    // Vérifier si l'expéditeur est superadmin
    const groupMetadata = await socket.groupMetadata(from);
    const requester = groupMetadata.participants.find(p => p.id === nowsender);
    
    if (!requester || requester.admin !== 'superadmin') {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 sᴜᴘᴇʀ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    // Identifier la personne à promouvoir
    let targetJid = '';
    
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (args[0]) {
      const input = args[0].replace(/[^0-9@]/g, '');
      targetJid = input.includes('@') ? input : `${input}@s.whatsapp.net`;
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• .promote @user
│. ˚˖𓍢ִ໋• reply to message
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const target = groupMetadata.participants.find(p => p.id === targetJid);
    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ɴᴏᴛ ɪɴ ɢʀᴏᴜᴘ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.groupParticipantsUpdate(from, [targetJid], 'promote');
    
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐏𝐑𝐎𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ᴘʀᴏᴍᴏᴛᴇᴅ sᴜᴄᴄᴇss
│. ˚˖𓍢ִ໋👤 ${target.notify || targetJid.split('@')[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [targetJid]
    });

  } catch (error) {
    console.error('❌ Erreur promote:', error);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message || 'ᴇʀʀᴏʀ'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'demote':
case 'unadmin': {
  try {
    if (!from.endsWith('@g.us')) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ɢʀᴏᴜᴘs ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    // Vérifier si l'expéditeur est superadmin
    const groupMetadata = await socket.groupMetadata(from);
    const requester = groupMetadata.participants.find(p => p.id === nowsender);

    if (!requester || requester.admin !== 'superadmin') {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 sᴜᴘᴇʀ ᴀᴅᴍɪɴ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    let targetJid = '';

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (args[0]) {
      const input = args[0].replace(/[^0-9@]/g, '');
      targetJid = input.includes('@') ? input : `${input}@s.whatsapp.net`;
    } else {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📉 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• .demote @user
│. ˚˖𓍢ִ໋• reply message
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const target = groupMetadata.participants.find(p => p.id === targetJid);
    if (!target) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 ɴᴏᴛ ɪɴ ɢʀᴏᴜᴘ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (target.admin !== 'admin' && target.admin !== 'superadmin') {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋⚠️ ɴᴏᴛ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (targetJid === nowsender) {
      const superAdmins = groupMetadata.participants.filter(p => p.admin === 'superadmin');
      if (superAdmins.length === 1) {
        await socket.sendMessage(sender, {
          text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋🚫 sᴏʟᴇ sᴜᴘᴇʀ ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
      }
    }

    await socket.groupParticipantsUpdate(from, [targetJid], 'demote');

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📉 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐃𝐄𝐌𝐎𝐓𝐄*
│. ˚˖𓍢ִ໋✅ ʀᴇᴍᴏᴠᴇᴅ ᴀᴅᴍɪɴ
│. ˚˖𓍢ִ໋👤 ${target.notify || targetJid.split('@')[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [targetJid]
    });

  } catch (error) {
    console.error('❌ Erreur demote:', error);

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message || 'ᴇʀʀᴏʀ'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

            
            // ============ UPLOAD TO CHANNEL ============
            case 'upch': {
    const fs = require('fs');
    const path = require('path');
    
    const cjidPath = path.join(__dirname, 'cjid.json');
    
    function getChannelJid() {
        if (fs.existsSync(cjidPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(cjidPath, 'utf-8'));
                return data.jid || null;
            } catch (e) { 
                console.error("[UPCH] Erreur lecture cjid:", e);
                return null; 
            }
        }
        return null;
    }
    
    function saveChannelJid(jid) {
        try {
            if (!fs.existsSync(path.dirname(cjidPath))) {
                fs.mkdirSync(path.dirname(cjidPath), { recursive: true });
            }
            fs.writeFileSync(cjidPath, JSON.stringify({ jid }, null, 2));
            return true;
        } catch (e) {
            console.error("[UPCH] Erreur sauvegarde cjid:", e);
            return false;
        }
    }
    
    const textInput = args.join(' ');
    
    if (textInput && textInput.includes('@newsletter')) {
        const newJid = textInput.trim();
        if (saveChannelJid(newJid)) {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋✅ ᴄʜᴀɴɴᴇʟ sᴀᴠᴇᴅ
│. ˚˖𓍢ִ໋📌 ${newJid}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
        } else {
            await socket.sendMessage(sender, { 
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ғᴀɪʟᴇᴅ ᴛᴏ sᴀᴠᴇ ᴊɪᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
        }
        break;
    }
    
    let channelJid = getChannelJid();
    if (!channelJid) {
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋❌ ɴᴏ ᴄʜᴀɴɴᴇʟ ᴊɪᴅ sᴀᴠᴇᴅ
│. ˚˖𓍢ִ໋📌 .${command} <jid>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }
    
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const contentText = textInput;
    
    if (!quoted && !contentText) {
        await socket.sendMessage(sender, { 
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋⚠️ sᴇɴᴅ ᴛᴇxᴛ ᴏʀ ʀᴇᴘʟʏ ᴍᴇᴅɪᴀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }
    
    await socket.sendMessage(sender, { react: { text: "📤", key: msg.key } });

    try {
        if (quoted) {

            async function downloadMedia(mediaMessage) {
                const { downloadContentFromMessage } = require('@rexxhayanasi/elaina-baileys');
                
                let stream;
                if (mediaMessage.imageMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.imageMessage, 'image');
                } else if (mediaMessage.videoMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.videoMessage, 'video');
                } else if (mediaMessage.audioMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.audioMessage, 'audio');
                } else if (mediaMessage.stickerMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.stickerMessage, 'sticker');
                } else if (mediaMessage.documentMessage) {
                    stream = await downloadContentFromMessage(mediaMessage.documentMessage, 'document');
                } else {
                    throw new Error("Type de média non supporté");
                }
                
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                return Buffer.concat(chunks);
            }
            
            const mediaBuffer = await downloadMedia(quoted);
            
            if (!mediaBuffer || mediaBuffer.length === 0) {
                throw new Error("Échec du téléchargement");
            }

            if (quoted.imageMessage) {
                await socket.sendMessage(channelJid, { image: mediaBuffer, caption: contentText || "" });
            } else if (quoted.videoMessage) {
                await socket.sendMessage(channelJid, { video: mediaBuffer, caption: contentText || "" });
            } else if (quoted.audioMessage) {
                await socket.sendMessage(channelJid, {
                    audio: mediaBuffer,
                    mimetype: quoted.audioMessage.mimetype || 'audio/mp4',
                    ptt: quoted.audioMessage.ptt || false,
                    caption: contentText || ""
                });
            } else if (quoted.stickerMessage) {
                await socket.sendMessage(channelJid, { sticker: mediaBuffer });
            } else if (quoted.documentMessage) {
                await socket.sendMessage(channelJid, {
                    document: mediaBuffer,
                    fileName: quoted.documentMessage.fileName || "Document",
                    mimetype: quoted.documentMessage.mimetype || 'application/octet-stream'
                });
            } else {
                await socket.sendMessage(sender, { 
                    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ ᴜɴsᴜᴘᴘᴏʀᴛᴇᴅ ᴍᴇᴅɪᴀ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                }, { quoted: msg });
                break;
            }
            
        } else if (contentText) {
            await socket.sendMessage(channelJid, { text: contentText });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📢 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐔𝐏𝐂𝐇*
│. ˚˖𓍢ִ໋✅ ᴜᴘʟᴏᴀᴅ sᴜᴄᴄᴇssғᴜʟ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });

    } catch (e) {
        console.error("[UPCH ERROR]:", e);
        await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });

        try {
            if (quoted) {
                await socket.sendMessage(channelJid, {
                    forward: {
                        key: { remoteJid: from, fromMe: false, id: msg.key.id },
                        message: quoted
                    }
                });

                await socket.sendMessage(sender, { react: { text: "↩️", key: msg.key } });

                await socket.sendMessage(sender, {
                    text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ ғᴀʟʟʙᴀᴄᴋ sᴇɴᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
                }, { quoted: msg });
            }
        } catch (fallbackError) {
            console.error("[UPCH FALLBACK ERROR]:", fallbackError);
            await socket.sendMessage(sender, {
                text: `❌ ${e.message}`
            }, { quoted: msg });
        }
    }

    break;
}

            
            
            // ============ FORWARD/RETURN VOICE ============
case 'readviewonce': 
case 'vv': {
    try {

        // ===== REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "🔓",
                key: m.key
            }
        });

        // ===== CHECK REPLY =====
        if (!m.quoted) {
            return sock.sendMessage(m.chat, {
                text: `╭┄┄『 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("reply to a viewonce message")}*
╰┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: m });
        }

        let q = m.quoted.msg;

        if (!q?.viewOnce) {
            return sock.sendMessage(m.chat, {
                text: `╭┄┄『 𝐄𝐑𝐑𝐎𝐑 』
│ ❌ *${toSmallCaps("this is not a viewonce message")}*
╰┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: m });
        }

        // ===== DOWNLOAD =====
        let media = await m.quoted.download();
        let caption = q.caption || "";

        // ===== SEND MEDIA =====
        if (/image/.test(m.quoted.type)) {
            await sock.sendMessage(m.chat, {
                image: media,
                caption
            }, { quoted: m });

        } else if (/video/.test(m.quoted.type)) {
            await sock.sendMessage(m.chat, {
                video: media,
                caption
            }, { quoted: m });

        } else if (/audio/.test(m.quoted.type)) {
            await sock.sendMessage(m.chat, {
                audio: media,
                mimetype: "audio/mp4",
                ptt: false
            }, { quoted: m });
        }

        // ===== SUCCESS =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "✅",
                key: m.key
            }
        });

    } catch (e) {
        console.error(e);

        sock.sendMessage(m.chat, {
            text: `❌ *${toSmallCaps("failed to open viewonce")}*`
        }, { quoted: m });
    }
}
break;

case '😒':
case '🥵':
case '🤤':
case 'vv2':
case 'cute': {
    try {

        // ===== REACT =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "📥",
                key: m.key
            }
        });

        if (!m.quoted) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("reply to a viewonce message")}*`
            }, { quoted: m });
        }

        let q = m.quoted.msg;

        if (!q?.viewOnce) {
            return sock.sendMessage(m.chat, {
                text: `❌ *${toSmallCaps("this is not a viewonce message")}*`
            }, { quoted: m });
        }

        let media = await m.quoted.download();
        let caption = q.caption || `*${toSmallCaps("saved media")}*`;

        // ===== SEND PRIVATE =====
        if (/image/.test(m.quoted.type)) {
            await sock.sendMessage(m.sender, {
                image: media,
                caption
            });

        } else if (/video/.test(m.quoted.type)) {
            await sock.sendMessage(m.sender, {
                video: media,
                caption
            });

        } else if (/audio/.test(m.quoted.type)) {
            await sock.sendMessage(m.sender, {
                audio: media,
                mimetype: "audio/mp4",
                ptt: false
            });
        }

        // ===== DONE =====
        await sock.sendMessage(m.chat, {
            react: {
                text: "✅",
                key: m.key
            }
        });

    } catch (e) {
        console.error(e);
    }
}
break;
            // ============ COMMANDE INCONNUE ============

// --- utilitaire minimal pour settings de groupe (si besoin) ---


// --- HANDLERS : add, kick, mute, unmute ---
// Variables attendues dans le scope : socket, from (chatId), sender, msg, args

case 'add': {
  if (!from.endsWith('@g.us')) {
    await socket.sendMessage(sender, { text: "❗ Cette commande doit être utilisée dans un groupe." }, { quoted: msg });
    break;
  }
  try {
    const metadata = await socket.groupMetadata(from);
    const participants = metadata.participants || [];
    const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
    const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

    if (!groupAdmins.includes(sender)) {
      await socket.sendMessage(from, { text: '❌ Seuls les admins peuvent utiliser cette commande.' }, { quoted: msg });
      break;
    }
    if (!groupAdmins.includes(botNumber)) {
      await socket.sendMessage(from, { text: '❌ Je dois être admin pour ajouter des membres.' }, { quoted: msg });
      break;
    }

    const number = args[0];
    if (!number) return await socket.sendMessage(from, { text: 'Usage: .add <numéro sans + ou @>' }, { quoted: msg });

    const jidToAdd = number.includes('@') ? number : `${number}@s.whatsapp.net`;
    try {
      await socket.groupParticipantsUpdate(from, [jidToAdd], 'add');
      await socket.sendMessage(from, { text: `✅ Ajouté: ${jidToAdd}` }, { quoted: msg });
    } catch (e) {
      console.error('[ERROR add]', e);
      await socket.sendMessage(from, { text: '❌ Impossible d\'ajouter ce numéro. Vérifie le format ou les permissions.' }, { quoted: msg });
    }
  } catch (e) {
    console.error('[ERROR add outer]', e);
    await socket.sendMessage(sender, { text: `❌ Erreur lors de l'ajout.\n\n${e.message || e}` }, { quoted: msg });
  }
  break;
}



// ============ FIN DES COMMANDES DE GROUPE ============
          

          

case 'firstadmin': {
  try {
    const args = body.trim().split(' ');
    
    if (args.length < 4) {
      await socket.sendMessage(sender, { 
        text: 
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐅𝐈𝐑𝐒𝐓𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋⚠️ ɪɴɪᴛɪᴀʟɪsᴀᴛɪᴏɴ
│
│. ˚˖𓍢ִ໋❌ Format : !firstadmin <password> <numéro> <nom>
│. ˚˖𓍢ִ໋💡 Exemple : !firstadmin AdminInit123 00000000000 Super Admin
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const password = args[1];
    const numero = args[2];
    const nom = args.slice(3).join(' ');
    
    const TEMP_PASSWORD = 'admin123';
    
    if (password !== TEMP_PASSWORD) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐂𝐂𝐄𝐒𝐒*
│. ˚˖𓍢ִ໋🔒 ᴡʀᴏɴɢ ᴘᴀssᴡᴏʀᴅ
│
│. ˚˖𓍢ִ໋⚠️ Contact dev for access
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const existingAdmins = await loadAdminsFromMongo();
    if (existingAdmins.length > 0) {
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋🚫 ᴀʟʀᴇᴀᴅʏ ɪɴɪᴛɪᴀʟɪᴢᴇᴅ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }
    
    const numeroNettoye = numero.replace(/[^0-9]/g, '');
    const jid = `${numeroNettoye}@s.whatsapp.net`;
    
    await adminsCol.updateOne(
      { jid }, 
      { 
        $set: { 
          jid, 
          name: nom, 
          addedAt: new Date(), 
          addedBy: 'first_init',
          isSuperAdmin: true 
        } 
      }, 
      { upsert: true }
    );
    
    console.log(`🎉 Premier admin initialisé : ${nom} (${jid})`);
    
    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐒𝐔𝐂𝐂𝐄𝐒𝐒*
│. ˚˖𓍢ִ໋👑 ᴀᴅᴍɪɴ ɪɴɪᴛɪᴀʟɪᴢᴇᴅ
│
│. ˚˖𓍢ִ໋👤 ɴᴀᴍᴇ : ${nom}
│. ˚˖𓍢ִ໋📱 ɴᴜᴍʙᴇʀ : ${numeroNettoye}
│. ˚˖𓍢ִ໋🔗 ᴊɪᴅ : ${jid}
│. ˚˖𓍢ִ໋🔐 sᴜᴘᴇʀ ᴀᴅᴍɪɴ
│. ˚˖𓍢ִ໋📅 ${getHaitiTimestamp()}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    
  } catch (error) {
    console.error('❌ Erreur firstadmin:', error);
    await socket.sendMessage(sender, { 
      text: 
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'breact': {
  try {
    const admins = await loadAdminsFromMongo();
    const senderJid = nowsender;
    const isAdmin = admins.some(adminJid => 
      adminJid === senderJid || adminJid === senderJid.split('@')[0]
    );
    
    if (!isAdmin) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋🚫 ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ
│
│. ˚˖𓍢ִ໋⚠️ ᴀᴅᴍɪɴs ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const q = body.split(' ').slice(1).join(' ').trim();
    if (!q.includes(',')) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📌 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋⚙️ ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ
│
│. ˚˖𓍢ִ໋💡 !breact <channel/message>,<emoji>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const parts = q.split(',');
    let channelRef = parts[0].trim();
    const reactEmoji = parts[1].trim();

    let channelJid = null;
    let messageId = null;

    const urlMatch = channelRef.match(/whatsapp\.com\/channel\/([^\/]+)\/(\d+)/);
    if (urlMatch) {
      channelJid = `${urlMatch[1]}@newsletter`;
      messageId = urlMatch[2];
    } else {
      const maybeParts = channelRef.split('/');
      if (maybeParts.length >= 2) {
        messageId = maybeParts[maybeParts.length - 1];
        channelJid = maybeParts[maybeParts.length - 2];
        if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
      }
    }

    if (!channelJid || !messageId || !channelJid.endsWith('@newsletter')) {
      await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
      await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋⚠️ ɪɴᴠᴀʟɪᴅ ғᴏʀᴍᴀᴛ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    const allNumbers = await getAllNumbersFromMongo();
    const connectedNumbers = allNumbers.filter(num => activeSockets.has(num));

    await socket.sendMessage(sender, { react: { text: "☑️", key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🚀 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐑𝐄𝐀𝐂𝐓*
│. ˚˖𓍢ִ໋📡 ʟᴀᴜɴᴄʜɪɴɢ ʀᴇᴀᴄᴛɪᴏɴs
│
│. ˚˖𓍢ִ໋🤖 ʙᴏᴛs : ${connectedNumbers.length}
│. ˚˖𓍢ִ໋😊 ᴇᴍᴏᴊɪ : ${reactEmoji}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    (async () => {
      const results = [];

      for (const botNumber of connectedNumbers) {
        try {
          const botSocket = activeSockets.get(botNumber);

          try {
            await botSocket.newsletterFollow(channelJid);
            await delay(1500);
          } catch {}

          await botSocket.newsletterReactMessage(channelJid, messageId, reactEmoji);
          await saveNewsletterReaction(channelJid, messageId, reactEmoji, botNumber);

          results.push({ bot: botNumber, status: '✅' });

        } catch (error) {
          results.push({ bot: botNumber, status: '❌', error: error.message });
        }

        await delay(1000);
      }

      const successCount = results.filter(r => r.status === '✅').length;
      const failCount = results.filter(r => r.status === '❌').length;

      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐑𝐄𝐏𝐎𝐑𝐓*
│. ˚˖𓍢ִ໋✅ sᴜᴄᴄᴇss : ${successCount}
│. ˚˖𓍢ִ໋❌ ғᴀɪʟ : ${failCount}
│. ˚˖𓍢ִ໋📡 ᴛᴏᴛᴀʟ : ${connectedNumbers.length}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      });

    })();

  } catch (error) {
    await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${error.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'getpp': {
  try {

    // ===== OWNER ONLY =====
    if (!isOwner) {

      await socket.sendMessage(sender, {
        react: {
          text: "❌",
          key: msg.key
        }
      });

      return await socket.sendMessage(sender, {
        text: "ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴍʏ ᴏᴡɴᴇʀ ʙʀᴏ"
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📸",
        key: msg.key
      }
    });

    let user;

    // ===== TARGET =====
    if (quoted) {

      // Reply message
      user = quoted.sender;

    } else if (!isGroup) {

      // Private chat
      user = sender;

    } else if (
      mentionedJid &&
      mentionedJid[0]
    ) {

      // Mentioned user
      user = mentionedJid[0];

    } else {

      // Self
      user = sender;
    }

    // ===== GET PROFILE =====
    let ppUrl;

    try {

      ppUrl =
        await socket.profilePictureUrl(
          user,
          'image'
        );

    } catch (e) {

      return await socket.sendMessage(sender, {
        text: `❌ *${toSmallCaps("error")} :* ${toSmallCaps("profile picture is private or not found")}`
      }, {
        quoted: msg
      });
    }

    // ===== MESSAGE =====
    const ppMsg = `
🖼️ *${toSmallCaps("profile picture retrieved")}*

👤 *${toSmallCaps("target")} :* @${user.split('@')[0]}

> *${toSmallCaps("optimized by you tech")}*
`.trim();

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: ppUrl
      },
      caption: ppMsg,
      mentions: [user],
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,

        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363404137900781@newsletter',
          newsletterName: '𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓',
          serverMessageId: 125
        },

        externalAdReply: {
          title: toSmallCaps("you md profile"),
          body: toSmallCaps("profile picture fetcher"),
          mediaType: 1,
          renderLargerThumbnail: false,
          sourceUrl: "https://whatsapp.com/channel/0029Vb7EpGwBlHpXKNgFET1Z"
        }
      }
    }, {
      quoted: msg
    });

    // ===== SUCCESS REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {

    console.error("GETPP ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("failed to get profile picture")
    }, {
      quoted: msg
    });
  }
}
break;
                
case 'code': {
  const q = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';
  
  const args = q.trim().split(/\s+/);
  args.shift();
  const number = args.join(' ').trim();

  if (!number) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ɪɴᴄᴏʀʀᴇᴄᴛ
│
│. ˚˖𓍢ִ໋💡 .code <numéro>
│. ˚˖𓍢ִ໋📱 Exemple : .code 5094744XXXX
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  const cleanNumber = number.replace(/[^\d]/g, '');
  if (cleanNumber.length < 9 || cleanNumber.length > 15) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋⚠️ ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ
│
│. ˚˖𓍢ִ໋📌 9–15 chiffres requis
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  try {
    await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

    let fetch;
    try {
      fetch = (await import('node-fetch')).default;
    } catch {
      fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
    }

    const url = `https://you-md-16ae1781ef16.herokuapp.com/code?number=${encodeURIComponent(cleanNumber)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (WhatsAppBot)',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const bodyText = await response.text();
    let result;

    try {
      result = JSON.parse(bodyText);
    } catch {
      const codeMatch = bodyText.match(/"code"\s*:\s*"([^"]+)"/) || bodyText.match(/'code'\s*:\s*'([^']+)'/);
      if (codeMatch) result = { code: codeMatch[1] };
      else throw new Error("Réponse invalide du serveur");
    }

    if (!result || !result.code) throw new Error("Aucun code reçu");

    const code = result.code.trim();

    await socket.relayMessage(sender, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔐 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐎𝐃𝐄*
│. ˚˖𓍢ִ໋📱 ${cleanNumber}
│
│. ˚˖𓍢ִ໋🔑 ᴄᴏᴅᴇ : ${code}
│
│. ˚˖𓍢ִ໋📋 ɪɴsᴛʀᴜᴄᴛɪᴏɴs :
│. ˚˖𓍢ִ໋1. WhatsApp → Appareils liés
│. ˚˖𓍢ִ໋2. Connecter un appareil
│. ˚˖𓍢ִ໋3. Entrer le code
│
│. ˚˖𓍢ִ໋⚠️ ᴇxᴘɪʀᴇ ᴀᴘʀès 20s
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            },
            footer: { text: "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓" },
            header: { hasMediaAttachment: false, title: "Connexion WhatsApp" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 Copier le code",
                    id: "copy_code",
                    copy_code: code
                  })
                }
              ]
            }
          }
        }
      }
    }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

  } catch (err) {
    console.error("❌ Erreur commande code:", err);
    await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${err.message || err}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
  
case 'deleteme': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, {
      text: `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
            `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴀᴄᴄᴇs ᴅᴇɴɪᴇᴅ\n` +
            `│. • 𝙼𝙾𝙳𝙴 : ᴅᴇʟᴇᴛᴇ sᴇssɪᴏɴ\n` +
            `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ᴘᴇʀᴍɪssɪᴏɴ ʙʟᴏᴄᴋ\n` +
            `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  try {
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
      }
    } catch (e) {}

    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(() => {});
      }
    } catch (e) {}
    try { socket.ws?.close(); } catch (e) {}

    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ᴅᴇʟᴇᴛᴇᴅ\n` +
        `│. • 𝙸𝙳 : ${sanitized}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : sᴜᴄᴄᴇss\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

  } catch (err) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝙴𝚁𝚁𝙾𝚁 : ᴅᴇʟᴇᴛᴇ ғᴀɪʟᴇᴅ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ${err.message || err}\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
  }

  break;
}

case 'deletemenumber': {
  const targetRaw = (args && args[0]) ? args[0].trim() : '';
  if (!targetRaw) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝙲𝙼𝙳 : ᴅᴇʟᴇᴛᴇ ɴᴜᴍʙᴇʀ\n` +
        `│. • 𝚄𝚂𝙰𝙶𝙴 : .deletemenumber <number>\n` +
        `│. • 𝙴𝚇 : .deletemenumber 9478xxxxxx\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  const target = targetRaw.replace(/[^0-9]/g, '');
  if (!/^\d{6,}$/.test(target)) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ɪɴᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ғᴏʀᴍᴀᴛ ᴇʀʀᴏʀ\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  let allowed = false;
  if (senderNum === ownerNum) allowed = true;
  else {
    try {
      const adminList = await loadAdminsFromMongo();
      if (Array.isArray(adminList) && adminList.some(a =>
        a.replace(/[^0-9]/g,'') === senderNum ||
        a === senderNum ||
        a === `${senderNum}@s.whatsapp.net`
      )) {
        allowed = true;
      }
    } catch (e) {}
  }

  if (!allowed) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴅᴇɴɪᴇᴅ\n` +
        `│. • 𝙰𝙲𝙲𝙴𝚂𝚂 : ᴀᴅᴍɪɴ ᴏɴʟʏ\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
    break;
  }

  try {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝙰𝙲𝚃𝙸𝙾𝙽 : ᴅᴇʟᴇᴛɪɴɢ sᴇssɪᴏɴ\n` +
        `│. • 𝚃𝙰𝚁𝙶𝙴𝚃 : ${target}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : ᴘʀᴏᴄᴇssɪɴɢ...\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

    const runningSocket = activeSockets.get(target);
    if (runningSocket) {
      try {
        if (typeof runningSocket.logout === 'function') {
          await runningSocket.logout().catch(() => {});
        }
      } catch (e) {}
      try { runningSocket.ws?.close(); } catch (e) {}
      activeSockets.delete(target);
      socketCreationTime.delete(target);
    }

    await removeSessionFromMongo(target);
    await removeNumberFromMongo(target);

    const tmpSessionPath = path.join(os.tmpdir(), `session_${target}`);
    try {
      if (fs.existsSync(tmpSessionPath)) fs.removeSync(tmpSessionPath);
    } catch (e) {}

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓\n` +
        `│. • 𝚂𝙴𝚂𝚂𝙸𝙾𝙽 : ᴅᴇʟᴇᴛᴇᴅ\n` +
        `│. • 𝚃𝙰𝚁𝙶𝙴𝚃 : ${target}\n` +
        `│. • 𝚂𝚃𝙰𝚃𝚄𝚂 : sᴜᴄᴄᴇss\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });

  } catch (err) {
    await socket.sendMessage(sender, {
      text:
        `╭┄ 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 \n` +
        `│. • 𝙴𝚁𝚁𝙾𝚁 : ғᴀɪʟᴇᴅ\n` +
        `│. • 𝚁𝙴𝙰𝚂𝙾𝙽 : ${err.message || err}\n` +
        `╰┄────────────────╯`
    }, { quoted: msg });
  }

  break;
}



case 'cfn': {
  const fs = require('fs');

  const sanitized = (senderNumber || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = args.join(" ").trim();
  if (!full) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐅𝐍*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• .cfn <jid@newsletter> | emoji1,emoji2
│. ˚˖𓍢ִ໋📍 ᴇxᴀᴍᴘʟᴇ
│. ˚˖𓍢ִ໋• .cfn 1203634@newsletter | 🔥,❤️
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());

  const senderIdSimple = (senderNumber || '').toString();
  const isAdmin = normalizedAdmins.includes(sender) || normalizedAdmins.includes(senderNumber);

  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⛔ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*
│. ˚˖𓍢ִ໋❌ ᴏɴʟʏ ᴏᴡɴᴇʀ / ᴀᴅᴍɪɴ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';

  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐉𝐈𝐃*
│. ˚˖𓍢ִ໋📌 ᴇx: 1203634@newsletter
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',')
      ? emojisPart.split(',').map(e => e.trim())
      : emojisPart.split(/\s+/).map(e => e.trim());
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default)';

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:YOU WEB BOT\nEND:VCARD`
        }
      }
    };

    const imagePayload = String(logo).startsWith('http')
      ? { url: logo }
      : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐅𝐍*
│. ˚˖𓍢ִ໋✅ ᴄʜᴀɴɴᴇʟ ᴀᴅᴅᴇᴅ
│. ˚˖𓍢ִ໋📡 ${jid}
│. ˚˖𓍢ִ໋😊 ${emojiText}
│. ˚˖𓍢ִ໋👤 @${senderIdSimple}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [sender]
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐑*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• chr <channel/message>,<emoji>
│. ˚˖𓍢ִ໋📍 ᴇx: chr 0029Vb7/175,👍
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = null;
  let messageId = null;

  const urlMatch = channelRef.match(/whatsapp\.com\/channel\/([^\/]+)\/(\d+)/);
  if (urlMatch) {
    channelJid = `${urlMatch[1]}@newsletter`;
    messageId = urlMatch[2];
  } else {
    const maybeParts = channelRef.split('/');
    if (maybeParts.length >= 2) {
      messageId = maybeParts[maybeParts.length - 1];
      channelJid = maybeParts[maybeParts.length - 2];
      if (!channelJid.endsWith('@newsletter')) {
        if (/^\d+$/.test(channelJid)) {
          channelJid = `${channelJid}@newsletter`;
        }
      }
    }
  }

  if (!channelJid || !messageId || !channelJid.endsWith('@newsletter')) {
    return await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐅𝐎𝐑𝐌𝐀𝐓*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ ᴇxᴀᴍᴘʟᴇs
│. ˚˖𓍢ִ໋• chr jid/message,emoji
│. ˚˖𓍢ִ໋• chr /175,👍
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_CHR"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:YOU WEB BOT
END:VCARD`
        }
      }
    };

    let imagePayload;
    if (String(logo).startsWith('http')) imagePayload = { url: logo };
    else imagePayload = fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐂𝐇𝐑*
│. ˚˖𓍢ִ໋✅ ʀᴇᴀᴄᴛɪᴏɴ sᴇɴᴛ
│. ˚˖𓍢ִ໋📡 ${channelJid}
│. ˚˖𓍢ִ໋📝 ${messageId}
│. ˚˖𓍢ִ໋😊 ${reactEmoji}
│. ˚˖𓍢ִ໋👤 @${senderIdSimple}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
      mentions: [nowsender]
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐎𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message || e}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }

  break;
}
case 't':
case '🌹':
case '😍':
case '❤️': {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        break; // rien à faire si aucun média cité
    }

    try {
        const userJid = jidNormalizedUser(socket.user.id);
        
        // Forwarder directement le message cité
        await socket.sendMessage(userJid, {
            forward: {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: msg.key.id
                },
                message: quoted
            }
        });

    } catch (e) {
        console.error("[SAVE ERROR]:", e);
        // pas de réaction ni de message d'erreur envoyé
    }
    break;
}

case 'save': {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        await socket.sendMessage(sender, { 
            text: `💾 *Save*\n\n❌ Réponds à un média avec !${command}` 
        }, { quoted: msg });
        break;
    }

    await socket.sendMessage(sender, { 
        react: { text: "⏳", key: msg.key } 
    });

    try {
        const userJid = jidNormalizedUser(socket.user.id);
        
        // Forwarder directement le message cité
        await socket.sendMessage(userJid, {
            forward: {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: msg.key.id
                },
                message: quoted
            }
        });

        // Seulement la réaction de succès, pas de message texte
        await socket.sendMessage(sender, { 
            react: { text: "✅", key: msg.key } 
        });

    } catch (e) {
        console.error("[SAVE ERROR]:", e);
        await socket.sendMessage(sender, { 
            react: { text: "❌", key: msg.key } 
        });
        // Optionnel: garder le message d'erreur
        // await socket.sendMessage(sender, { 
        //     text: `❌ Erreur: ${e.message}` 
        // }, { quoted: msg });
    }
    break;
}

// ---------------------- PING ----------------------
case 'ping': {
    try {

        // ===== REACT (emoji menu 1) =====
        await socket.sendMessage(sender, {
            react: {
                text: "💫",
                key: msg.key
            }
        });

        const start = Date.now();

        // petit délai réel pour mesurer
        await new Promise(r => setTimeout(r, 1));

        const ping = Date.now() - start;

        const text = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ⚡ PING TEST
│ 📶 ping : ${ping} ms
│ 🤖 status : online
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
`.trim();

        // ===== BUTTONS =====
        const buttons = [
            {
                buttonId: `${prefix}menu`,
                buttonText: { displayText: "📋 ᴍᴇɴᴜ" },
                type: 1
            },
            {
                buttonId: `${prefix}alive`,
                buttonText: { displayText: "🤖 ᴀʟɪᴠᴇ" },
                type: 1
            },
            {
                buttonId: `${prefix}test`,
                buttonText: { displayText: "🔁 ᴛᴇsᴛ" },
                type: 1
            }
        ];

        // ===== SEND =====
        await socket.sendMessage(sender, {
            text: text,
            contextInfo: {
                externalAdReply: {
                    title: "you md bot",
                    body: `ping: ${ping} ms`,
                    thumbnailUrl: "https://files.catbox.moe/mrdglh.png",
                    sourceUrl: "https://files.catbox.moe/bqzb2v.jpg",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            },
            buttons: buttons,
            headerType: 1
        }, { quoted: msg });

    } catch (e) {
        console.error("PING ERROR:", e);

        await socket.sendMessage(sender, {
            text: "❌ Error while testing ping"
        }, { quoted: msg });
    }
}
break;


case 'test': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🏴",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const fs = require('fs');

    // ===== IMAGE =====
    const imagePath = './tests.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("image tests.jpg introuvable")
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== FAKE QUOTE =====
    const tt = {
      key: {
        remoteJid: '0@s.whatsapp.net',
        fromMe: false,
        id: 'YOU_MD_STYLISH',
        participant: '0@s.whatsapp.net'
      },
      message: {
        conversation: "ʏᴏᴜ-ᴍᴅ ᴏᴘᴛɪᴍɪᴢᴇᴅ ʙʏ ʏᴏᴜ ᴛᴇᴄʜ 🕷️"
      }
    };

    // ===== RUNTIME =====
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const runtimeText = `${hours}h ${minutes}m ${seconds}s`;

    // ===== PING =====
    const ping =
      Date.now() - (msg.messageTimestamp * 1000);

    // ===== BOT MODE =====
    const botMode =
      typeof mode !== "undefined"
        ? mode
        : "public";

    // ===== SMALL CAPS =====
    const title = toSmallCaps("you md running");
    const bodyText = toSmallCaps("powered by you tech");
    const systemInfo = toSmallCaps("you-md test");
    const runtimeLabel = toSmallCaps("runtime");
    const modeLabel = toSmallCaps("mode");
    const pingLabel = toSmallCaps("ping");

    // ===== MESSAGE =====
    const testMsg = `
🚀 *${title}*

╭┄┄◆ ${systemInfo} ◆
│ ◈ ${runtimeLabel} : ${runtimeText}
│ ◈ ${modeLabel} : ${toSmallCaps(botMode)}
│ ◈ ${pingLabel} : ${ping}ms
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *${bodyText}*
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📋 ᴍᴇɴᴜ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.owner',
        buttonText: {
          displayText: '👑 ᴏᴡɴᴇʀ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: testMsg,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          title: toSmallCaps("you md test"),
          body: toSmallCaps("system online"),
          thumbnail: buffer,
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: tt
    });

  } catch (e) {
    console.error("TEST ERROR:", e);

    await socket.sendMessage(sender, {
      text: "🚀 " + toSmallCaps("you md is online")
    }, {
      quoted: msg
    });
  }
}
break;

            case 'bibleai':
case 'bible':
case 'verset': {
    if (!args[0]) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐁𝐈𝐁𝐋𝐄 𝐀𝐈*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• !${command} <question>
│. ˚˖𓍢ִ໋📍 ᴇx: !${command} Qui est Jésus ?
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    const question = args.join(' ');

    await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔍 *𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄 𝐁𝐈𝐁𝐋𝐈𝐐𝐔𝐄*
│. ˚˖𓍢ִ໋⏳ ᴄʜᴀʀɢᴇᴍᴇɴᴛ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
        const params = new URLSearchParams({
            question: question,
            translation: 'LSG',
            language: 'fr',
            'filters[]': ['bible', 'books', 'articles'],
            pro: 'false'
        });

        const url = `https://api.bibleai.com/v2/search?${params.toString()}`;
        const fetch = require('node-fetch');
        const res = await fetch(url);
        const json = await res.json();

        if (json.status !== 1 || !json.data) {
            await socket.sendMessage(sender, {
                text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓*
│. ˚˖𓍢ִ໋📖 ɪɴᴛᴇʀʀᴏɢᴀᴛɪᴏɴ ɪɴᴛʀᴏᴜᴠᴀʙʟᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
            }, { quoted: msg });
            break;
        }

        const { answer, sources } = json.data;

        let responseText =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📖 *𝐁𝐈𝐁𝐋𝐄 𝐀𝐈 𝐑𝐄𝐒𝐏𝐎𝐍𝐒𝐄*
│. ˚˖𓍢ִ໋────────────
│
${answer}
│
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n`;

        if (Array.isArray(sources) && sources.length > 0) {
            responseText += `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📑 *𝐕𝐄𝐑𝐒𝐄𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n`;

            const verses = sources.filter(s => s.type === 'verse').slice(0, 6);

            verses.forEach((s, i) => {
                let ref = s.book && s.chapter
                    ? `${s.book} ${s.chapter}:${s.verse || ''}`
                    : s.title || `Source ${i + 1}`;

                responseText += `\n• ${ref}\n${s.text}\n`;
            });
        }

        await socket.sendMessage(sender, { text: responseText }, { quoted: msg });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }

    break;
}

case 'creategroup':
case 'cgroup': {
    if (!args[0]) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐆𝐑𝐎𝐔𝐏*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• !${command} <nom du groupe>
│. ˚˖𓍢ִ໋📍 ᴇx: !${command} My Group
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    const groupName = args.join(' ');

    await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⏳ *𝐂𝐑𝐄𝐀𝐓𝐈𝐎𝐍 𝐄𝐍 𝐂𝐎𝐔𝐑𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
        const group = await socket.groupCreate(groupName, [sender]);

        let response =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👥 *𝐆𝐑𝐎𝐔𝐏 𝐂𝐑𝐄𝐀𝐓𝐄𝐃*
│. ˚˖𓍢ִ໋📛 ${groupName}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

        try {
            await socket.groupParticipantsUpdate(group.id, [sender], "promote");
            response += `\n│. ˚˖𓍢ִ໋👑 ʏᴏᴜ ᴀʀᴇ ᴀᴅᴍɪɴ`;
        } catch {}

        try {
            const code = await socket.groupInviteCode(group.id);
            response += `\n│. ˚˖𓍢ִ໋🔗 https://chat.whatsapp.com/${code}`;
        } catch {}

        response += `\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

        await socket.sendMessage(sender, { text: response }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑*
│. ˚˖𓍢ִ໋⚠️ ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
    }

    break;
}

            // ============ KICK ALL ============
            case 'kickall2': {
    if (!from.endsWith('@g.us')) {
        await socket.sendMessage(sender, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊𝐀𝐋𝐋*
│. ˚˖𓍢ִ໋📌 ɴᴏᴛɪᴄᴇ
│. ˚˖𓍢ִ໋• ᴄᴏᴍᴍᴀɴᴅ ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    try {
        const metadata = await socket.groupMetadata(from);
        const participants = metadata.participants || [];
        const groupName = metadata.subject || "Sans nom";

        const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

        const toKick = participants.filter(p =>
            !groupAdmins.includes(p.id) && p.id !== botNumber
        );

        if (!toKick.length) {
            await socket.sendMessage(from, {
                text: `❌ ᴀᴜᴄᴜɴ ᴍᴇᴍʙʀᴇ ᴀ ᴇxᴘᴜʟsᴇʀ`
            }, { quoted: msg });
            break;
        }

        let kickLines = "";
        toKick.forEach((mem, i) => {
            const num = mem.id.split('@')[0];
            kickLines += `☠️ ${(i + 1).toString().padStart(2, '0')}. @${num}\n`;
        });

        const caption = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🏴‍☠️ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐊𝐈𝐂𝐊𝐀𝐋𝐋*
│. ˚˖𓍢ִ໋📌 ɢʀᴏᴜᴘ : ${groupName}
│. ˚˖𓍢ִ໋⚓ ᴀᴅᴍɪɴ : @${sender.split('@')[0]}
│. ˚˖𓍢ִ໋👥 ᴍᴇᴍʙʀᴇs : ${toKick.length}
│. ˚˖𓍢ִ໋${kickLines}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
💀 sᴛᴀᴛᴜᴛ : ᴇxᴘᴜʟsɪᴏɴ ᴇɴ ᴄᴏᴜʀs`;

        await socket.sendMessage(from, {
            text: caption,
            mentions: [sender, ...toKick.map(p => p.id)]
        }, { quoted: msg });

        await socket.groupParticipantsUpdate(from, toKick.map(p => p.id), "remove");

        await socket.sendMessage(from, {
            text: `✅ ᴀʟʟ ᴍᴇᴍʙʀᴇs ʀᴇᴍᴏᴠᴇᴅ`
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text: `❌ ᴇʀʀᴇᴜʀ : ${e.message || e}`
        }, { quoted: msg });
    }
    break;
}

case 'kickall':
case 'removeall':
case 'cleargroup': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "⚠️",
        key: msg.key
      }
    });

    // ===== CHECK GROUP =====
    if (!isGroup) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("this command works only in groups")
      }, { quoted: msg });
    }

    // ===== PERMISSION =====
    if (!isAdmins && !isOwner) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("only group admins or bot owner can use this")
      }, { quoted: msg });
    }

    // ===== GROUP METADATA =====
    const metadata =
      await socket.groupMetadata(sender);

    const botId =
      socket.user.id.split(':')[0] + '@s.whatsapp.net';

    // ===== FILTER MEMBERS =====
    const membersToRemove =
      metadata.participants
        .filter(p =>
          p.admin === null &&
          p.id !== botId
        )
        .map(p => p.id);

    if (!membersToRemove.length) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("no members found to remove")
      }, { quoted: msg });
    }

    // ===== WARNING MESSAGE =====
    await socket.sendMessage(sender, {
      image: {
        url: 'https://files.catbox.moe/0lsjly.png'
      },
      caption:
`⚠️ *${toSmallCaps("cleaning group")}*...

> *${toSmallCaps("removing")} :* ${membersToRemove.length} ${toSmallCaps("members")}`,
      footer: "🕸️ ʏᴏᴜ ᴍᴅ ʙᴏᴛ",
      headerType: 4,
      buttons: [
        {
          buttonId: ".alive",
          buttonText: { displayText: "⚡ ᴀʟɪᴠᴇ" },
          type: 1
        }
      ]
    }, {
      quoted: msg
    });

    // ===== REMOVE MEMBERS =====
    await socket.groupParticipantsUpdate(
      sender,
      membersToRemove,
      "remove"
    );

    // ===== SUCCESS MESSAGE =====
    const successMsg = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ✅ *${toSmallCaps("clean up successful")}*
│ 📄 *${toSmallCaps("total removed")} :* ${membersToRemove.length}
│ 👤 *${toSmallCaps("executed by")} :* @${msg.sender.split('@')[0]}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *${toSmallCaps("group has been cleaned successfully")}* 🧹
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: ".menu",
        buttonText: { displayText: "📜 ᴍᴇɴᴜ" },
        type: 1
      },
      {
        buttonId: ".tagall",
        buttonText: { displayText: "📢 ᴛᴀɢ ᴀʟʟ" },
        type: 1
      }
    ];

    // ===== SEND RESULT =====
    await socket.sendMessage(sender, {
      image: {
        url: 'https://files.catbox.moe/0lsjly.png'
      },
      caption: successMsg,
      footer: "🧹 ʏᴏᴜ ᴍᴅ ʙᴏᴛ",
      buttons,
      headerType: 4,
      mentions: [msg.sender],
      contextInfo: {
        externalAdReply: {
          title: "GROUP CLEANER",
          body: "You MD System",
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: msg
    });

    await socket.sendMessage(sender, {
      react: {
        text: "✅",
        key: msg.key
      }
    });

  } catch (e) {
    console.error("KICKALL ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("failed to perform action")
    }, { quoted: msg });
  }
}
break;


case 'listadmin': {
    if (!from.endsWith('@g.us')) {
        await socket.sendMessage(sender, {
            text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍*
│. ˚˖𓍢ִ໋📌 ɴᴏᴛɪᴄᴇ
│. ˚˖𓍢ִ໋• ɢʀᴏᴜᴘ ᴏɴʟʏ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
        break;
    }

    try {
        const metadata = await socket.groupMetadata(from);
        const participants = metadata.participants || [];
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id);

        if (!groupAdmins.length) {
            await socket.sendMessage(from, {
                text: `❌ ᴀᴜᴄᴜɴ ᴀᴅᴍɪɴ ᴅᴇᴛᴇᴄᴛᴇ́`
            }, { quoted: msg });
            break;
        }

        let caption = `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋👑 *𝐀𝐃𝐌𝐈𝐍 𝐋𝐈𝐒𝐓*`;

        groupAdmins.forEach((admin, i) => {
            caption += `│. ˚˖𓍢ִ໋👤 ${(i + 1).toString().padStart(2, '0')}. @${admin.split('@')[0]}\n`;
        });

        await socket.sendMessage(from, {
            text: caption,
            mentions: groupAdmins
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, {
            text: `❌ ᴇʀʀᴇᴜʀ : ${e.message || e}`
        }, { quoted: msg });
    }
    break;
}
          
            // ============ COMMANDE INCONNUE ============
// === COMMANDE UPSCALE (amélioration d'image) ===
// === COMMANDE UPSCALE (amélioration d'image) ===

case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // Vérification admin
    const admins = await loadAdminsFromMongo();
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = admins.some(admin => 
      admin === nowsender || admin.includes(senderIdSimple)
    );

    if (!isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ ᴀᴄᴄᴇs ʀᴇsᴇʀᴠᴇ ᴀᴜx ᴀᴅᴍɪɴs.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta mention
    const metaQuote = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_ACTIVESESSIONS" 
      },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
        } 
      }
    };

    // STYLE MENU MODIFIÉ (comme ton modèle)
    let text =
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🤖 *𝐀𝐂𝐓𝐈𝐕𝐄 𝐒𝐘𝐒𝐓𝐄𝐌*
│. ˚˖𓍢ִ໋📊 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍𝐒
│. ˚˖𓍢ִ໋• ᴛᴏᴛᴀʟ : ${activeCount}
│. ˚˖𓍢ִ໋• ʜᴇᴜʀᴇ : ${getHaitiTimestamp()}
│. ˚˖𓍢ִ໋• ғᴜsᴇᴀᴜ : ʜᴀïᴛɪ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

`;

    if (activeCount > 0) {
      text +=
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📱 *𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 𝐁𝐎𝐓𝐒*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

`;

      activeNumbers.forEach((num, index) => {
        text += `│. ˚˖𓍢ִ໋🟢 ${String(index + 1).padStart(2,'0')}. ${num}\n`;
      });

      text +=
`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📈 ᴘᴇʀғᴏʀᴍᴀɴᴄᴇ : ${activeCount > 10 ? "élevée" : activeCount > 5 ? "moyenne" : "basse"}
│. ˚˖𓍢ִ໋📊 sᴛᴀᴛᴜs : ᴏᴘᴇʀᴀᴛɪᴏɴɴᴇʟ ✅
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`;

    } else {
      text +=
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋⚠️ *𝐀𝐔𝐂𝐔𝐍 𝐁𝐎𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

│. ˚˖𓍢ִ໋• ᴠᴇʀɪғɪᴇʀ ɪɴᴛᴇʀɴᴇᴛ
│. ˚˖𓍢ִ໋• ᴄᴏɴsᴜʟᴛᴇʀ ʟᴏɢs
│. ˚˖𓍢ִ໋• ʀᴇᴇssᴀʏᴇʀ ᴘʟᴜs ᴛᴀʀᴅ`;
    }

    const logo = cfg.logo || config.RCD_IMAGE_PATH;
    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📌 ${botName} • 𝐒𝐘𝐒𝐓𝐄𝐌`,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('❌ Erreur bots:', e);
    await socket.sendMessage(sender, { 
      text: '❌ ɪᴍᴘᴏssɪʙʟᴇ ᴅ’ᴀᴄᴄéᴅᴇʀ ᴀᴜx sᴇssɪᴏɴs.' 
    }, { quoted: msg });
  }
  break;
}

// === COMMANDE FACEBOOK DOWNLOADER ===
// === COMMANDE FACEBOOK DOWNLOADER ===
case 'facebook': case 'fbdl': case 'fb': {
  try {
    const jid = remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const url = args.join(' ').trim();

    if (!url) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐔𝐒𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋📌 ᴜᴛɪʟɪsᴀᴛɪᴏɴ
│. ˚˖𓍢ִ໋• ${prefix}${command} https://fb.watch/xxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    if (!url.match(/(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.watch)\/.*/i)) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐋𝐈𝐄𝐍 𝐈𝐍𝐕𝐀𝐋𝐈𝐃𝐄*
│. ˚˖𓍢ִ໋📌 ʟɪᴇɴ ᴇxᴇᴍᴘʟᴇ
│. ˚˖𓍢ִ໋• https://fb.watch/xxxx
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
      break;
    }

    await socket.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔄 *𝐅𝐁 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑*
│. ˚˖𓍢ִ໋⏳ ᴛᴇ́ʟᴇ́ᴄʜᴀʀɢᴇᴍᴇɴᴛ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    const response = await axios.post('https://v3.fdownloader.net/api/ajaxSearch',
      new URLSearchParams({
        q: url,
        lang: 'en',
        web: 'fdownloader.net',
        v: 'v2',
        w: ''
      }).toString(),
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          origin: 'https://fdownloader.net',
          referer: 'https://fdownloader.net/',
          'user-agent': 'Mozilla/5.0 (Linux; Android 10)'
        }
      }
    );

    if (!response.data || !response.data.data) {
      throw new Error('Impossible de récupérer la vidéo');
    }

    const $ = cheerio.load(response.data.data);

    const duration = $('.content p').first().text().trim() || 'Inconnu';
    const thumbnail = $('.thumbnail img').attr('src') || null;

    const videos = [];

    $('.download-link-fb').each((_, el) => {
      const quality = $(el).attr('title')?.replace('Download ', '') || '';
      const videoUrl = $(el).attr('href');
      if (videoUrl) videos.push({ quality, url: videoUrl });
    });

    $('.download-button a').each((_, el) => {
      const quality = $(el).text().trim() || 'SD';
      const videoUrl = $(el).attr('href');
      if (videoUrl && !videos.some(v => v.url === videoUrl)) {
        videos.push({ quality, url: videoUrl });
      }
    });

    if (!videos.length) throw new Error('Aucune vidéo trouvée');

    const qualityPriority = ['HD', '720p', '480p', '360p'];
    let selectedVideo = videos[0];

    for (const p of qualityPriority) {
      const found = videos.find(v =>
        v.quality.toLowerCase().includes(p.toLowerCase())
      );
      if (found) {
        selectedVideo = found;
        break;
      }
    }

    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📹 *𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐃𝐋*
│. ˚˖𓍢ִ໋📊 ǫᴜᴀʟɪᴛᴇ : ${selectedVideo.quality}
│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ : ${duration}
│. ˚˖𓍢ִ໋🔗 ʟɪᴇɴ ᴘʀᴏᴄᴇss...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    try {
      await socket.sendMessage(jid, {
        video: { url: selectedVideo.url },
        caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📹 *𝐅𝐀𝐂𝐄𝐁𝐎𝐎𝐊 𝐕𝐈𝐃𝐄𝐎*
│. ˚˖𓍢ִ໋📊 ǫᴜᴀʟɪᴛᴇ : ${selectedVideo.quality}
│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ : ${duration}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
        mimetype: 'video/mp4'
      }, { quoted: msg });

    } catch (sendErr) {
      await socket.sendMessage(sender, {
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐍𝐕𝐎𝐈 𝐄́𝐂𝐇𝐎𝐔𝐄́*
│. ˚˖𓍢ִ໋🔗 ${selectedVideo.url}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.sendMessage(jid, { react: { text: "✅", key: msg.key } });

  } catch (e) {
    await socket.sendMessage(sender, {
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐅𝐁*
│. ˚˖𓍢ִ໋• ${e.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
  }
  break;
}
// case 'ig' : télécharger depuis reelsvideo.io et renvoyer média(s)
case 'ig': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

    if (senderNum !== sanitized && senderNum !== ownerNum) {
      return await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 𝐃𝐄𝐍𝐈𝐄𝐃*
│. ˚˖𓍢ִ໋• ᴀᴄᴄᴇs ʀᴇsᴇʀᴠᴇ
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐈𝐍𝐕𝐀𝐋𝐈𝐃 𝐋𝐈𝐍𝐊*
│. ˚˖𓍢ִ໋📌 ᴜsᴀɢᴇ
│. ˚˖𓍢ִ໋• .ig <instagram_url>
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🔎 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐃𝐋*
│. ˚˖𓍢ִ໋⏳ ᴛʀᴀɪᴛᴇᴍᴇɴᴛ...
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    const info = await reelsvideo(url);

    if (!info) {
      return await socket.sendMessage(sender, { 
        text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
      }, { quoted: msg });
    }

    const summaryLines = [
      `👤 Auteur: ${info.username || 'inconnu'}`,
      `📸 Type: ${info.type || 'inconnu'}`,
      `🖼️ Images: ${info.images?.length || 0}`,
      `🎞️ Vidéos: ${info.videos?.length || 0}`,
      `🎵 Audio: ${info.mp3?.length || 0}`
    ];

    if (info.thumb) summaryLines.unshift(`🔎 Aperçu: ${info.thumb}`);

    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋📊 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐓*
│. ˚˖𓍢ִ໋
${summaryLines.map(l => `│. ˚˖𓍢ִ໋• ${l}`).join('\n')}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

    async function fetchBufferFromUrl(u) {
      try {
        const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(r.data);
      } catch (e) {
        return null;
      }
    }

    if (Array.isArray(info.videos) && info.videos.length) {
      const toSend = info.videos.slice(0, 3);

      for (const v of toSend) {
        const buf = await fetchBufferFromUrl(v);
        if (!buf) continue;

        await socket.sendMessage(sender, {
          video: buf,
          caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🎥 *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐕𝐈𝐃𝐄𝐎*
│. ˚˖𓍢ִ໋• ${info.username || 'instagram'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
          mimetype: 'video/mp4'
        }, { quoted: msg });
      }
      return;
    }

    if (Array.isArray(info.images) && info.images.length) {
      const toSend = info.images.slice(0, 6);

      for (const imgUrl of toSend) {
        const buf = await fetchBufferFromUrl(imgUrl);
        if (!buf) continue;

        await socket.sendMessage(sender, {
          image: buf,
          caption:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋🖼️ *𝐈𝐍𝐒𝐓𝐀𝐆𝐑𝐀𝐌 𝐈𝐌𝐀𝐆𝐄*
│. ˚˖𓍢ִ໋• ${info.username || 'instagram'}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
        }, { quoted: msg });
      }
      return;
    }

    if (Array.isArray(info.mp3) && info.mp3.length) {
      for (const a of info.mp3.slice(0, 2)) {
        const buf = await fetchBufferFromUrl(a.url);
        if (!buf) continue;

        await socket.sendMessage(sender, {
          audio: buf,
          mimetype: 'audio/mpeg'
        }, { quoted: msg });
      }
      return;
    }

    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐀𝐔𝐂𝐔𝐍 𝐌𝐄𝐃𝐈𝐀*
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });

  } catch (err) {
    console.error('[IG COMMAND ERROR]', err);

    await socket.sendMessage(sender, { 
      text:
`╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋❌ *𝐄𝐑𝐑𝐄𝐔𝐑 𝐈𝐆*
│. ˚˖𓍢ִ໋• ${err.message}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`
    }, { quoted: msg });
  }
  break;
}

case 'menu': {
  try {

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "🫯",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const os = require('os');
    const fs = require('fs');

    // ===== USERS =====
    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    // ===== UPTIME =====
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const up = `${hours}ʜ ${minutes}ᴍ ${seconds}s`;

    // ===== IMAGE =====
    const imagePath = 'menu2.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: "❌ L'image 'menu.jpg' est introuvable."
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== BOT INFO =====
    const botName =
      config?.BOT_NAME ||
      "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

    const botMode =
      typeof mode !== "undefined"
        ? mode
        : "public";

    // ===== MENU TEXT =====
    const menuText = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
┆ *🤖 ${botName}*
┆ 👑 ᴏᴡɴᴇʀ : ʏᴏᴜ ᴛᴇᴄʜx
┆ ⚙️ ᴍᴏᴅᴇ : ${botMode}
┆ 🧩 ᴘʀᴇғɪx : [ ${prefix} ]
┆ 📚 ᴄᴏᴍᴍᴀɴᴅs : 100+
┆ 👥 ᴜsᴇʀs : ${activeCount}
┆ ⏱️ ʀᴜɴᴛɪᴍᴇ : ${up}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ

> *⤷ ᴄʟɪǫᴜᴇ sᴜʀ ᴜɴ ʙᴏᴜᴛᴏɴ 👇*

> *© ʏᴏᴜ ᴍᴅ ʙᴏᴛ 2026*
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.menu2',
        buttonText: {
          displayText: '💥 ᴍᴇɴᴜ2'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.allmenu',
        buttonText: {
          displayText: '📋 ᴀʟʟ ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: menuText,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons: buttons,
      headerType: 4
    }, {
      quoted: msg
    });

  } catch (e) {
    console.error("MENU ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ Une erreur est survenue lors de l'affichage du menu."
    }, {
      quoted: msg
    });
  }
}
break;

case 'menu2':
case 'help':
case 'youx': {
  try {

    // ===== REACT =====
    try {
      await socket.sendMessage(sender, {
        react: {
          text: "💫",
          key: msg.key
        }
      });
    } catch (e) {}

    // ===== MODULES =====
    const moment = require("moment-timezone");
    const os = require("os");
    const fs = require("fs");

    const start = Date.now();

    // ===== DATE =====
    const now = moment().tz("Africa/Nairobi");
    const date = now.format("DD/MM/YYYY");

    // ===== USER =====
    const userJid =
      msg?.key?.participant ||
      msg?.key?.remoteJid ||
      sender;

    const userNumber =
      typeof userJid === "string"
        ? userJid.split("@")[0]
        : "user";

    const userName =
      msg?.pushName ||
      pushname ||
      userNumber;

    // ===== UPTIME =====
    const uptime = (() => {
      const s = process.uptime();

      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);

      return `${d}d ${h}h ${m}m ${sec}s`;
    })();

    // ===== RAM =====
    const ram = (() => {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;

      const format = (b) => {
        if (b >= 1073741824)
          return (b / 1073741824).toFixed(2) + "GB";

        return (b / 1048576).toFixed(2) + "MB";
      };

      return `${format(used)}/${format(total)}`;
    })();

    // ===== MODE =====
    const botMode =
      config?.MODE === "public"
        ? "PUBLIC"
        : "PRIVATE";

    // ===== BOT INFO =====
    const botName =
      config?.BOT_NAME ||
      "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

    const footer =
      config?.BOT_FOOTER ||
      "*ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙*";

    const version =
      config?.BOT_VERSION ||
      "1.0.0";

    // ===== USERS =====
    const activeUsers =
      typeof getTotalUsers === "function"
        ? getTotalUsers()
        : 0;

    // ===== CASES =====
    const cases = [
      "ᴍᴇɴᴜ",
      "ᴀʟʟᴍᴇɴᴜ",
      "ᴘɪɴɢ",
      "ᴀɪᴅᴇ",
      "ʜᴇʟᴘ",
      "ᴏᴡɴᴇʀ",
      "ʀᴇᴘᴏ",
      "ʜɪᴅᴇᴛᴀɢ",
      "ᴛᴀɢᴀʟʟ",
      "ᴡᴀɴᴛᴇᴅ",
      "ᴡᴀsᴛᴇᴅ",
      "ᴘᴀɪʀ",
      "ʜᴅ",
      "ᴄᴏᴅᴇ",
      "ᴍᴏᴅᴇ",
      "ᴍᴇɴᴜ2",
      "ᴛᴇᴄʜ",

      "ᴋɪᴄᴋ",
      "ᴀᴅᴅ",
      "ʟᴇᴀᴠᴇ",
      "ᴍᴜᴛᴇ",
      "ᴜɴᴍᴜᴛᴇ",
      "sᴡɢᴄ",
      "sᴇᴛɢᴘᴘ",
      "ʟɪsᴛᴀᴅᴍɪɴ",
      "ᴄʀᴇᴀᴛᴇɢʀᴏᴜᴘ",
      "ᴀᴄᴄᴇᴘᴛᴀʟʟ",
      "ʀᴇᴠᴏᴋᴇᴀʟʟ",
      "ʟɪsᴛᴀᴄᴛɪᴠᴇ",
      "ʟɪsᴛɪɴᴀᴄᴛɪᴠᴇ",
      "ᴋɪᴄᴋɪɴᴀᴄᴛɪᴠᴇ",
      "ᴋɪᴄᴋᴀʟʟ",
      "ᴋɪᴄᴋᴀʟʟ2",
      "ᴘᴏʟʟ",
      "ᴅᴇᴍᴏᴛᴇᴀʟʟ",
      "ᴘʀᴏᴍᴏᴛᴇᴀʟʟ",
      "ᴀɴᴛɪʟɪɴᴋ",
      "ᴀɴᴛɪsᴛᴀᴛᴜsᴍᴇɴᴛɪᴏɴ",

      "sᴛɪᴄᴋᴇʀ",
      "ᴛᴀᴋᴇ",
      "ᴛʀᴛ",
      "ᴛᴏᴠɴ",
      "sᴀᴠᴇ",
      "ᴠᴠ",
      "ʙɪʙʟᴇ",
      "ᴜᴘᴄʜ",
      "ɪᴍɢ",
      "ᴊɪᴅ",
      "ᴄᴊɪᴅ",
      "ʀᴄʜ",
      "ᴄᴏᴅᴇ",
      "ɢᴇᴛᴘᴘ",
      "sᴇᴛᴘᴘ",
      "sᴇᴛᴘᴀᴛʜ",
      "ɢᴇᴛᴘᴀᴛʜ",
      "ssᴡᴇʙ",
      "ᴄʜᴇᴄᴋʙᴀɴ",
      "sʜᴀᴢᴀᴍ",
      "ᴍᴇᴅɪᴀғɪʀᴇ",

      "ᴘʟᴀʏ",
      "ᴘʟᴀʏ2",
      "ᴛɪᴋᴛᴏᴋ",
      "ғᴀᴄᴇʙᴏᴏᴋ",
      "ɪɢ",
      "ᴍᴏᴅᴀᴘᴋ",
      "ʏᴛᴍᴘ4",
      "ᴀʟɪᴠᴇ",
      "ᴛᴇsᴛ",

      "ᴄᴏɴғɪɢ sʜᴏᴡ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏᴠɪᴇᴡ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏʟɪᴋᴇ",
      "ᴄᴏɴғɪɢ ᴀᴜᴛᴏʀᴇᴄ",
      "ᴄᴏɴғɪɢ sᴇᴛᴇᴍᴏᴊɪ",
      "ᴄᴏɴғɪɢ sᴇᴛᴘʀᴇғɪx"
    ];

    // ===== MENU TEXT =====
    let menu = `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓⊹ ࣪ 』
│✵ ᴜsᴇʀ : @${userNumber}
│✵ ᴍᴏᴅᴇ : ${botMode}
│✵ ᴠᴇʀsɪᴏɴ : ${version}
│✵ ᴜsᴇʀs : ${activeCount}
│✵ ᴜᴘᴛɪᴍᴇ : ${uptime}
│✵ ᴅᴀᴛᴇ : ${date}
│✵ ʀᴀᴍ : ${ram}
│✵ ᴘɪɴɢ : ᴄᴀʟᴄᴜʟᴀᴛɪɴɢ...
╰┄┄┄┄┄┄┄┄┄┄❍

╭┄「 ⊹ ࣪ ˖𝐂𝐀𝐒𝐄𝐒 𝐋𝐈𝐒𝐓⊹ ࣪ ˖ 」\n`;

    cases.forEach((c, i) => {
      menu += `│. ˚˖𓍢ִ໋ ・ ${i + 1}. ${c}\n`;
    });

    const ping = Date.now() - start;

    menu = menu.replace(
      "ᴄᴀʟᴄᴜʟᴀᴛɪɴɢ...",
      `${ping}ms`
    );

    menu += `╰┄┄┄┄┄┄┄┄┄┄┄ᕗ
> ᴛᴏᴛᴀʟ ᴄᴀsᴇs : ${cases.length}+ᴄᴀsᴇ

> ${footer}`;

    // ===== META QUOTE =====
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "YOU_WEB_BOT"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=50941319791:+50941319791
END:VCARD`
        }
      }
    };

    // ===== IMAGE =====
    const imagePath = 'menu.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: "❌ L'image 'menu.jpg' est introuvable."
      }, { quoted: msg });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== THUMB =====
    const MENU_IMG =
      "https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png";

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📋 ᴍᴇɴᴜ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: menu,
      footer: "ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx 🌙",
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          title: `${botName} - ONLINE 🔥`,
          body: `Prefix: ${prefix} | Uptime: ${uptime}`,
          thumbnailUrl: `https://i.postimg.cc/hGD0FkT5/file-00000000ee0c720c90258685675507d2.png`,
          sourceUrl: "https://whatsapp.com",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, {
      quoted: metaQuote
    });

  } catch (e) {
    console.error("MENU2 ERROR:", e);

    try {
      await socket.sendMessage(sender, {
        text: `❌ Menu error:\n${e?.message || e}`
      }, { quoted: msg });
    } catch {}
  }
}
break;


case 'allmenu': {
  try {

    // ===== OWNER ONLY =====
    if (!isDev) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("only my developer can use this command")
      }, {
        quoted: msg
      });
    }

    // ===== REACT =====
    await socket.sendMessage(sender, {
      react: {
        text: "📋",
        key: msg.key
      }
    });

    // ===== MODULES =====
    const fs = require('fs');

    // ===== IMAGE =====
    const imagePath = './menu2.jpg';

    if (!fs.existsSync(imagePath)) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("image menu2.jpg introuvable")
      }, {
        quoted: msg
      });
    }

    const buffer = fs.readFileSync(imagePath);

    // ===== READ MAIN FILE =====
    const scriptContent =
  fs.readFileSync('./pair.js', 'utf8');

    // ===== GET ALL CASES =====
    const caseRegex =
      /case\s+['"](.+?)['"]/g;

    let cases = [];
    let match;

    while ((match = caseRegex.exec(scriptContent)) !== null) {

      const cmd =
        match[1]
          .replace(/[^a-zA-Z0-9-_]/g, '')
          .trim();

      if (
        cmd &&
        !cases.includes(cmd)
      ) {
        cases.push(cmd);
      }
    }

    // ===== NO CASE =====
    if (cases.length === 0) {
      return await socket.sendMessage(sender, {
        text: toSmallCaps("no command found")
      }, {
        quoted: msg
      });
    }

    // ===== BOT INFO =====
    const botName =
      config?.BOT_NAME ||
      "𝐘𝐎𝐔 𝐌𝐃 𝐁𝐎𝐓";

    // ===== MENU TEXT =====
    let menu = `
╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
┆ *🤖 ${botName}*
┆ 👑 ᴏᴡɴᴇʀ : ʏᴏᴜ ᴛᴇᴄʜx
┆ 📚 ${toSmallCaps("all commands list")}
┆ 🔥 ${toSmallCaps("total")} : ${cases.length}
`;

    // ===== COMMAND LIST =====
    for (let i = 0; i < cases.length; i++) {
      menu += `\n│ ◈ ${cases[i]}`;
    }

    // ===== FOOT TEXT =====
    menu += `

╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
> *${toSmallCaps("powered by you tech")}*`;

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: '.menu',
        buttonText: {
          displayText: '📋 ᴍᴇɴᴜ'
        },
        type: 1
      },
      {
        buttonId: '.alive',
        buttonText: {
          displayText: '⚡ ᴀʟɪᴠᴇ'
        },
        type: 1
      },
      {
        buttonId: '.ping',
        buttonText: {
          displayText: '🏓 ᴘɪɴɢ'
        },
        type: 1
      },
      {
        buttonId: '.test',
        buttonText: {
          displayText: '🚀 ᴛᴇsᴛ'
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: buffer,
      caption: menu,
      footer: 'ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx',
      buttons: buttons,
      headerType: 4,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          title: toSmallCaps("you md all menu"),
          body: toSmallCaps("all commands available"),
          thumbnail: buffer,
          mediaType: 1,
          renderLargerThumbnail: false
        }
      }
    }, {
      quoted: msg
    });

  } catch (e) {

    console.error("ALLMENU ERROR:", e);

    await socket.sendMessage(sender, {
      text: toSmallCaps("error while reading commands")
    }, {
      quoted: msg
    });
  }
}
break;



case 'owner': {
  try {

    // ===== REACT (emoji du menu 1) =====
    await socket.sendMessage(sender, {
      react: {
        text: "💥",
        key: msg.key
      }
    });

    const ownerNumber = "447781508638";
    const ownerName = "ʏᴏᴜ ƚɛƈɦ᥊ ☺︎ 🧔🏻‍♂️💚";

    // ===== VCARD =====
    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:' + ownerName + '\n' +
      'ORG:ʏᴏᴜ ᴍᴅ ᴅᴇᴠᴇʟᴏᴘᴇʀ;\n' +
      'TEL;type=CELL;type=VOICE;waid=' + ownerNumber + ':+' + ownerNumber + '\n' +
      'END:VCARD';

    await socket.sendMessage(sender, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }]
      }
    }, { quoted: msg });

    // ===== TEXT =====
    const ownerMsg = `
👋 *hello !*

╭┄┄◆ developer info ◆
│ ◈ name : ${ownerName}
│ ◈ role : lead developer
│ ◈ bot : you md v1
│ ◈ status : online ⚡
╰┄┄┄┄┄┄┄┄┄┄┄ᕗ

> feel free to contact the owner for any help or bugs regarding you md 🍂
`.trim();

    // ===== BUTTONS =====
    const buttons = [
      {
        buttonId: `https://wa.me/${ownerNumber}`,
        buttonText: {
          displayText: "ᴄʜᴀᴛ ᴡɪᴛʜ ᴏᴡɴᴇʀ"
        },
        type: 1
      },
      {
        buttonId: ".menu",
        buttonText: {
          displayText: "🌟 ᴍᴇɴᴜ"
        },
        type: 1
      }
    ];

    // ===== SEND =====
    await socket.sendMessage(sender, {
      image: {
        url: "https://files.catbox.moe/0lsjly.png"
      },
      caption: ownerMsg,
      footer: "ʏᴏᴜ ᴡᴇʙ ʙᴏᴛ • ᴍᴏᴅ",
      buttons: buttons,
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error("OWNER ERROR:", e);

    await socket.sendMessage(sender, {
      text: "❌ Une erreur est survenue lors de l'envoi des infos owner."
    }, { quoted: msg });
  }
}
break;


case 'tiktok':
case 'tt': {
  try {
    // Définir jid et sender
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    // headers adaptés au site savett.cc
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Origin': 'https://savett.cc',
      'Referer': 'https://savett.cc/en1/download',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
    };

    // helpers encapsulés
    async function getCsrfAndCookie() {
      const res = await axios.get('https://savett.cc/en1/download', { 
        headers,
        timeout: 10000 
      });
      const csrf = res.data.match(/name="csrf_token" value="([^"]+)"/)?.[1] || null;
      const cookie = (res.headers['set-cookie'] || [])
        .map(v => v.split(';')[0])
        .join('; ');
      return { csrf, cookie };
    }

    async function postDl(url, csrf, cookie) {
      const body = `csrf_token=${encodeURIComponent(csrf)}&url=${encodeURIComponent(url)}`;
      const res = await axios.post('https://savett.cc/en1/download', body, {
        headers: { ...headers, Cookie: cookie },
        timeout: 30000
      });
      return res.data;
    }

    function parseSavettHtml(html) {
      const $ = cheerio.load(html);
      const stats = [];
      $('#video-info .my-1 span').each((_, el) => stats.push($(el).text().trim()));

      const data = {
        username: $('#video-info h3').first().text().trim() || null,
        views: stats[0] || null,
        likes: stats[1] || null,
        bookmarks: stats[2] || null,
        comments: stats[3] || null,
        shares: stats[4] || null,
        duration: $('#video-info p.text-muted').first().text().replace(/Duration:/i, '').trim() || null,
        type: null,
        downloads: { nowm: [], wm: [] },
        mp3: [],
        slides: []
      };

      const slides = $('.carousel-item[data-data]');
      if (slides.length) {
        data.type = 'photo';
        slides.each((_, el) => {
          try {
            const json = JSON.parse($(el).attr('data-data').replace(/&quot;/g, '"'));
            if (Array.isArray(json.URL)) {
              json.URL.forEach(url => data.slides.push({ index: data.slides.length + 1, url }));
            }
          } catch {}
        });
        return data;
      }

      data.type = 'video';
      $('#formatselect option').each((_, el) => {
        const label = $(el).text().toLowerCase();
        const raw = $(el).attr('value');
        if (!raw) return;
        try {
          const json = JSON.parse(raw.replace(/&quot;/g, '"'));
          if (!json.URL) return;
          if (label.includes('mp4') && !label.includes('watermark')) data.downloads.nowm.push(...json.URL);
          if (label.includes('watermark')) data.downloads.wm.push(...json.URL);
          if (label.includes('mp3')) data.mp3.push(...json.URL);
        } catch {}
      });

      return data;
    }

    async function savett(url) {
      const { csrf, cookie } = await getCsrfAndCookie();
      if (!csrf) throw new Error('CSRF token not found');
      const html = await postDl(url, csrf, cookie);
      return parseSavettHtml(html);
    }

    // helper pour télécharger une URL en Buffer avec limite de taille
    async function fetchBufferFromUrl(u) {
      try {
        // Vérifier l'espace disque disponible
        const stats = await fs.promises.stat('/').catch(() => ({ size: 0 }));
        const freeSpace = stats.size || 1024 * 1024 * 1024; // fallback 1GB
        
        // Limiter à 50MB par fichier
        const response = await axios({
          method: 'GET',
          url: u,
          responseType: 'stream',
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const chunks = [];
        let totalSize = 0;
        
        for await (const chunk of response.data) {
          chunks.push(chunk);
          totalSize += chunk.length;
          
          // Vérifier la taille totale
          if (totalSize > 50 * 1024 * 1024) {
            throw new Error('Fichier trop volumineux (>50MB)');
          }
        }
        
        return Buffer.concat(chunks);
      } catch (e) {
        console.error('[TIKTOK] fetchBufferFromUrl error', e?.message || e);
        return null;
      }
    }

    // validation URL
    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await socket.sendMessage(sender, { 
        text: '❗ Usage: .tiktok <url>\nExample: .tiktok https://vt.tiktok.com/xxxxx' 
      }, { quoted: msg });
      break;
    }

    // Réaction d'attente
    await socket.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
    await socket.sendMessage(sender, { 
      text: '🔎 Recherche et téléchargement en cours, merci de patienter...' 
    }, { quoted: msg });

    // exécution principale
    const info = await savett(url);

    if (!info) {
      await socket.sendMessage(sender, { 
        text: '❌ Impossible de récupérer les informations pour ce lien.' 
      }, { quoted: msg });
      await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
      break;
    }

    // résumé
    const summary = [
      `│. ˚˖𓍢ִ໋👤 ᴀᴜᴛᴇᴜʀ: ${info.username || 'inconnu'}`,
      `│. ˚˖𓍢ִ໋🎞️ Type: ${info.type || 'inconnu'}`,
      `│. ˚˖𓍢ִ໋🖼️ sʟɪᴅᴇs: ${info.slides?.length || 0}`,
      `│. ˚˖𓍢ִ໋🎵 ᴀᴜᴅɪᴏ: ${info.mp3?.length || 0}`,
      `│. ˚˖𓍢ִ໋📥 ᴠɪᴅᴇ́ᴏs (ɴᴏ ᴡᴀᴛᴇʀᴍᴀʀᴋ): ${info.downloads.nowm?.length || 0}`,
      `│. ˚˖𓍢ִ໋💧 ᴠɪᴅᴇ́ᴏs (ᴡᴀᴛᴇʀᴍᴀʀᴋ): ${info.downloads.wm?.length || 0}`
    ];
    if (info.duration) summary.push(`│. ˚˖𓍢ִ໋⏱️ ᴅᴜʀᴇ́ᴇ: ${info.duration}\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`);
    
    await socket.sendMessage(sender, { 
      text: `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ\n✅ 𝐓𝐈𝐊𝐓𝐎𝐊 𝐑𝐄𝐒𝐔𝐋𝐓:\n${summary.join('\n')}` 
    }, { quoted: msg });

    // Fonction pour envoyer avec gestion d'erreur
    async function sendMediaWithRetry(mediaType, buffer, caption, maxRetries = 2) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const messageOptions = { quoted: msg };
          if (mediaType === 'video') {
            await socket.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' }, messageOptions);
          } else if (mediaType === 'audio') {
            await socket.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', fileName: 'audio.mp3' }, messageOptions);
          } else if (mediaType === 'image') {
            await socket.sendMessage(jid, { image: buffer, caption }, messageOptions);
          }
          return true;
        } catch (sendErr) {
          console.error(`[TIKTOK] Send attempt ${i + 1} failed:`, sendErr.message);
          if (i === maxRetries - 1) throw sendErr;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      return false;
    }

    let mediaSent = false;

    // priorité: envoyer les vidéos sans watermark si disponibles
    if (Array.isArray(info.downloads.nowm) && info.downloads.nowm.length) {
      const toSend = info.downloads.nowm.slice(0, 1); // limiter à 1 pour éviter les problèmes
      for (const v of toSend) {
        const buf = await fetchBufferFromUrl(v);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger la vidéo` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('video', buf, `🎥 TikTok — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // sinon envoyer vidéos watermark si présentes
    if (!mediaSent && Array.isArray(info.downloads.wm) && info.downloads.wm.length) {
      const toSend = info.downloads.wm.slice(0, 1);
      for (const v of toSend) {
        const buf = await fetchBufferFromUrl(v);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger la vidéo` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('video', buf, `🎥 TikTok (watermark) — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // si mp3 disponible
    if (!mediaSent && Array.isArray(info.mp3) && info.mp3.length) {
      for (const a of info.mp3.slice(0, 1)) {
        const buf = await fetchBufferFromUrl(a);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger l'audio` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('audio', buf, '');
        if (sent) mediaSent = true;
      }
    }

    // slides (photos)
    if (!mediaSent && Array.isArray(info.slides) && info.slides.length) {
      for (const s of info.slides.slice(0, 3)) {
        const buf = await fetchBufferFromUrl(s.url);
        if (!buf) {
          await socket.sendMessage(sender, { text: `⚠️ Impossible de télécharger l'image` }, { quoted: msg });
          continue;
        }
        const sent = await sendMediaWithRetry('image', buf, `🖼️ Slide ${s.index} — ${info.username || 'Auteur'}`);
        if (sent) mediaSent = true;
      }
    }

    // Réaction finale
    if (mediaSent) {
      await socket.sendMessage(jid, { react: { text: "✅", key: msg.key } });
    } else {
      await socket.sendMessage(sender, { text: '❌ Aucun média exploitable trouvé pour ce lien.' }, { quoted: msg });
      await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    }

  } catch (err) {
    console.error('[TIKTOK COMMAND ERROR]', err);
    
    // Définir jid et sender pour le catch
    const jid = msg?.key?.remoteJid;
    const sender = msg?.key?.participant || msg?.key?.remoteJid;
    
    try { 
      await socket.sendMessage(jid, { react: { text: '❌', key: msg.key } }); 
    } catch(e){}
    
    let errorMessage = err.message || 'Erreur inconnue';
    if (errorMessage.includes('ENOSPC')) {
      errorMessage = 'Espace disque insuffisant pour traiter ce média. Essayez avec un fichier plus petit.';
    } else if (errorMessage.includes('timeout')) {
      errorMessage = 'Délai d\'attente dépassé. Le serveur met trop de temps à répondre.';
    }
    
    await socket.sendMessage(sender, { 
      text: `❌ Erreur lors du traitement: ${errorMessage}` 
    }, { quoted: msg });
  }
  break;
}

case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {

    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 ᴀᴄᴄᴇssɪɴɢ ɢʀᴏᴜᴘ ʟɪsᴛ..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ ɴᴏ ɢʀᴏᴜᴘ ғᴏᴜɴᴅ" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || "𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓";

    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {

      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'uɴɴᴀᴍᴇᴅ ɢʀᴏᴜᴘ';
        const jid = group.id;

        return `│. • ${globalIndex}. ${subject}
│. • ᴍᴇᴍʙᴇʀs : ${memberCount}
│. • ᴊɪᴅ : ${jid}`;
      }).join('\n\n');

      const textMsg = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ɢʀᴏᴜᴘ ʟɪsᴛ ᴍᴏᴅᴜʟᴇ
│✵ ᴘᴀɢᴇ : ${page + 1}/${totalPages}
│✵ ᴛᴏᴛᴀʟ : ${groupArray.length}
│✵ ᴏᴡɴᴇʀ ʙᴏᴛ : ${botName}
│✵ 
│✵ ${groupList}
╰┄ мα∂є ву уσυ тє¢нχ σƒ¢ 🇺🇸
`;

      await socket.sendMessage(sender, {
        text: textMsg
      });

      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ғᴇᴛᴄʜɪɴɢ ɢʀᴏᴜᴘs"
    }, { quoted: msg });
  }
  break;
}






case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1];

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, {
                text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍsɢ : ɪɴᴠᴀʟɪᴅ ʟɪɧᴋ
│. • ᴜsᴀɢᴇ : .ᴍᴇᴅɪᴀғɪʀᴇ <ʟɪɴᴋ>
╰┄『 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』
`
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });

        await socket.sendMessage(sender, {
            text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ⏳
│. • ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 𝐌𝐎𝐃𝐔𝐋𝐄 』
`
        }, { quoted: shonux });

        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, {
                text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ғᴀɪʟᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴅᴀᴛᴀ ғᴏᴜɴᴅ
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 』
`
            }, { quoted: shonux });
        }

        const result = data.result;

        const caption = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • ғʟᴇ : ${result.title || result.filename}
│. • sɪᴢᴇ : ${result.size}
│. • ᴅᴀᴛᴇ : ${result.date}
│. • sᴛᴀᴛᴜs : ʀᴇᴀᴅʏ ✅
╰┄『 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐒𝐘𝐒𝐓𝐄𝐌 』
`;

        await socket.sendMessage(sender, {
            document: { url: result.url },
            fileName: result.filename,
            mimetype: 'application/octet-stream',
            caption
        }, { quoted: shonux });

    } catch (err) {
        console.error("MediaFire error:", err);

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, {
            text: `╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ɪɴᴛᴇʀɴᴀʟ ғᴀɪʟᴜʀᴇ
╰┄『 𝐌𝐄𝐃𝐈𝐀𝐅𝐈𝐑𝐄 』
`
        }, { quoted: shonux });
    }
    break;
}

// ---------------- list saved newsletters (show emojis) ----------------
case 'ownerlist': {
  try {
    const docs = await listNewslettersFromMongo();

    let userCfg = {};
    try {
      if (number && typeof loadUserConfigFromMongo === 'function') {
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {};
      }
    } catch (e) {
      userCfg = {};
    }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_OWNERLIST"
      },
      message: {
        contactMessage: {
          displayName: title,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    if (!docs || docs.length === 0) {
      return await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇᴍᴘᴛʏ 📭
│. • ᴄʜᴀɴɴᴇʟ : ɴᴏɴᴇ ғᴏᴜɴᴅ
╰┄『 𝐎𝐖𝐍𝐄𝐑 𝐋𝐈𝐒𝐓 』
`
      }, { quoted: shonux });
    }

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ᴏᴡɴᴇʀ ᴄʜᴀɴɴᴇʟ ʟɪsᴛ
│✵ ᴛᴏᴛᴀʟ : ${docs.length}
`;

    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      txt += `│. • ${i + 1}. ${d.jid}
│. • emojis : ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : 'default'}`;
    }

    txt += `╰┄『 𝐍𝐄𝐖𝐒𝐋𝐄𝐓𝐓𝐄𝐑𝐒 』
`;

    await socket.sendMessage(sender, {
      text: txt
    }, { quoted: shonux });

  } catch (e) {
    console.error('ownerlist error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_OWNERLIST_ERR"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ᴛᴏ ʟɪsᴛ
╰┄『 𝐎𝐖𝐍𝐄𝐑 𝐋𝐈𝐒𝐓 』
`
    }, { quoted: shonux });
  }

  break;
}

// CID 
          
case 'cid': {
  try {

    const q = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption
      || '';

    const sanitized = String(number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_CID"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    let channelLink = (args && args.length)
      ? args.join(' ').trim()
      : q.replace(/^[.\/!]cid\s*/i, '').trim();

    if (!channelLink) {
      return await socket.sendMessage(sender, {
        text: `❌ Aucun lien fourni\nUsage: .cid <lien>`
      }, { quoted: shonux });
    }

    const match = channelLink.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([\w-]+)/i);

    if (!match) {
      return await socket.sendMessage(sender, {
        text: `❌ Lien invalide`
      }, { quoted: shonux });
    }

    const inviteId = match[1];

    if (!global.__whatsapp_channel_cache) global.__whatsapp_channel_cache = new Map();

    const cacheKey = `channel_${inviteId}`;
    const cached = global.__whatsapp_channel_cache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached._ts) < (10 * 60 * 1000)) {
      const metadata = cached.metadata;

      await socket.sendMessage(sender, {
        text: `📡 ID: ${metadata.id}\n📌 Nom: ${metadata.name || 'unknown'}`
      }, { quoted: shonux });

      break;
    }

    await socket.sendMessage(sender, {
      text: `⏳ Récupération des infos...`
    }, { quoted: shonux });

    const withTimeout = (p, ms = 15000) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    let metadata = null;

    try {
      if (typeof socket.newsletterMetadata === 'function') {
        metadata = await withTimeout(socket.newsletterMetadata("invite", inviteId), 15000);
      } else if (typeof socket.getNewsletterMetadata === 'function') {
        metadata = await withTimeout(socket.getNewsletterMetadata(inviteId), 15000);
      }
    } catch (errMeta) {
      console.warn('[CID] metadata error', errMeta?.message || errMeta);
    }

    if (!metadata || !metadata.id) {
      return await socket.sendMessage(sender, {
        text: '❌ Channel introuvable'
      }, { quoted: shonux });
    }

    const normalized = {
      id: metadata.id || inviteId,
      name: metadata.name || metadata.title || 'unknown',
      subscribers: metadata.subscribers || null,
      preview: metadata.preview || null
    };

    global.__whatsapp_channel_cache.set(cacheKey, {
      metadata: normalized,
      _ts: Date.now()
    });

    const infoText = `📡 ID: ${normalized.id}
📌 Nom: ${normalized.name}
👥 Abonnés: ${normalized.subscribers || 'N/A'}`;

    const previewUrl = normalized.preview
      ? (normalized.preview.startsWith('http')
        ? normalized.preview
        : `https://pps.whatsapp.net${normalized.preview}`)
      : null;

    const interactive = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: infoText },
            footer: { text: botName },
            header: previewUrl
              ? { imageMessage: { url: previewUrl } }
              : { title: "Channel Info" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 Copier ID",
                    id: "copy_id",
                    copy_code: normalized.id
                  })
                }
              ]
            }
          }
        }
      }
    };

    try {
      await socket.relayMessage(sender, interactive.viewOnceMessage.message, {
        messageId: `cid_${inviteId}_${Date.now()}`
      });
    } catch (errRelay) {
      console.warn('[CID] fallback', errRelay?.message || errRelay);

      if (previewUrl) {
        try {
          await socket.sendMessage(sender, {
            image: { url: previewUrl },
            caption: infoText
          }, { quoted: shonux });
        } catch {
          await socket.sendMessage(sender, { text: infoText }, { quoted: shonux });
        }
      } else {
        await socket.sendMessage(sender, { text: infoText }, { quoted: shonux });
      }
    }

  } catch (err) {
    console.error("Erreur CID :", err);

    await socket.sendMessage(sender, {
      text: `❌ Erreur: ${err.message}`
    }, { quoted: msg });
  }

  break;
}

case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ᴘʀᴏᴠɪᴅᴇ ɴᴜᴍʙᴇʀ / ᴊɪᴅ
│. • ᴜsᴀɢᴇ : .ᴀᴅᴅᴀᴅᴍɪɴ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ᴏᴡɴᴇʀ ᴏɴʟʏ
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ᴄᴏɴғɪʀᴍᴇᴅ ✅
│. • ᴍᴏᴅᴇ : ᴀᴅᴍɪɴ ᴀᴅᴅᴇᴅ
│. • ᴛᴀʀɢᴇᴛ : ${jidOr}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('addadmin error', e);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }
  break;
}


case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ɴᴏ ɪɴᴘᴜᴛ ᴘʀᴏᴠɪᴅᴇᴅ
│. • ᴜsᴀɢᴇ : .ᴅᴇʟᴀᴅᴍɪɴ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });
  }

  const jidOr = args[0].trim();

  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴀᴄᴄᴇss
╰┄『 𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 𝐁𝐋𝐎𝐂𝐊 』
` }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴀᴅᴍɪɴ : ʀᴇᴍᴏᴠᴇᴅ
│. • ᴛᴀʀɢᴇᴛ : ${jidOr}
╰┄『 𝐀𝐃𝐌𝐈𝐍 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });

  } catch (e) {
    console.error('deladmin error', e);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐄𝐑𝐑𝐎𝐑 𝐌𝐎𝐃𝐔𝐋𝐄 』
` }, { quoted: shonux });
  }
  break;
}


            case 'tovv': {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quoted) {
        await socket.sendMessage(sender, { 
            text: `🎵 *Convert to Voice Note*\n\n❌ Réponds à un audio ou vidéo` 
        }, { quoted: msg });
        break;
    }
    
    const isAudio = quoted.audioMessage;
    const isVideo = quoted.videoMessage;
    
    if (!isAudio && !isVideo) {
        await socket.sendMessage(sender, { 
            text: `❌ Type non supporté. Réponds à un audio (🎵) ou vidéo (🎥)` 
        }, { quoted: msg });
        break;
    }

    await socket.sendMessage(sender, { 
        react: { text: "⏳", key: msg.key } 
    });

    try {
        // CORRECTION ICI : Bonne méthode pour télécharger
        let buffer;
        
        // Méthode 1: Utiliser downloadContentFromMessage (méthode Baileys officielle)
        const { downloadContentFromMessage } = require('@rexxhayanasi/elaina-baileys');
        
        if (quoted.audioMessage) {
            const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
            
        } else if (quoted.videoMessage) {
            const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        }
        
        if (!buffer || buffer.length === 0) {
            throw new Error("Buffer vide");
        }
        
        console.log(`[TOVN] Buffer obtenu: ${buffer.length} bytes`);
        
        // Fonction de conversion (gardée de ton code)
        async function convertToOpus(inputBuffer) {
            return new Promise((resolve, reject) => {
                const ffmpeg = require('fluent-ffmpeg');
                const { PassThrough } = require('stream');
                
                const inStream = new PassThrough();
                const outStream = new PassThrough();
                const chunks = [];

                inStream.end(inputBuffer);

                ffmpeg(inStream)
                    .noVideo()
                    .audioCodec("libopus")
                    .format("ogg")
                    .audioBitrate("48k")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .outputOptions([
                        "-map_metadata", "-1",
                        "-application", "voip",
                        "-compression_level", "10",
                        "-page_duration", "20000",
                    ])
                    .on("error", (err) => {
                        console.error("[TOVN] FFmpeg error:", err);
                        reject(err);
                    })
                    .on("end", () => {
                        const result = Buffer.concat(chunks);
                        console.log(`[TOVN] Conversion réussie: ${result.length} bytes`);
                        resolve(result);
                    })
                    .pipe(outStream, { end: true });

                outStream.on("data", (c) => chunks.push(c));
            });
        }
        
        // Convertir
        const opusBuffer = await convertToOpus(buffer);
        
        // Envoyer comme voice note
        await socket.sendMessage(sender, {
            audio: opusBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
            caption: "🔊 Voice Note"
        }, { quoted: msg });
        
        await socket.sendMessage(sender, { 
            react: { text: "✅", key: msg.key } 
        });

    } catch (e) {
        console.error("[TOVN ERROR]:", e);
        await socket.sendMessage(sender, { 
            react: { text: "❌", key: msg.key } 
        });
        
        // Fallback: méthode simple sans conversion
        try {
            console.log("[TOVN] Essai méthode fallback...");
            
            if (quoted.audioMessage) {
                // Juste forwarder l'audio en PTT
                await socket.sendMessage(sender, quoted, { 
                    quoted: msg,
                    ptt: true // Force en voice note
                });
                
                await socket.sendMessage(sender, { 
                    react: { text: "🎵", key: msg.key } 
                });
            }
            
        } catch (fallbackError) {
            console.error("[TOVN FALLBACK ERROR]:", fallbackError);
            await socket.sendMessage(sender, { 
                text: `❌ Impossible de convertir: ${e.message}` 
            }, { quoted: msg });
        }
    }
    break;
}

           

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();

    let userCfg = {};
    try { 
      if (number && typeof loadUserConfigFromMongo === 'function') 
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; 
    } catch(e){ userCfg = {}; }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_FAKE_ID_ADMINS" 
      },
      message: { 
        contactMessage: { 
          displayName: title, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` 
        } 
      }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { 
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇᴍᴘᴛʏ ❌
│. • ᴍᴇssᴀɢᴇ : ɴᴏ ᴀᴅᴍɪɴs ғᴏᴜɴᴅ
╰┄『 𝐀𝐃𝐌𝐈𝐍𝐒 𝐋𝐈𝐒𝐓 』
`
      }, { quoted: shonux });
    }

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│✵ ᴄᴏɴғɪɢ : ᴀᴅᴍɪɴs ᴅʙ
│✵ ᴛᴏᴛᴀʟ : ${list.length}
│ ⊹ ࣪ ˖👑 𝐋𝐈𝐒𝐓𝐄 𝐃𝐄𝐒 𝐀𝐃𝐌𝐈𝐍𝐒 👑\n│ ⊹ ࣪ ˖`;

    for (const a of list) txt += `│ ⊹ ࣪ ˖• ᴀᴅᴍɪɴ ➤ ${a}\n`;

    txt += `\n╰┄『 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 』`;

    // 🔥 IMAGE AJOUTÉE ICI (sans changer logique)
    await socket.sendMessage(sender, {
      image: { url: 'https://i.postimg.cc/yxjgrx9H/WA-1777204234222.jpg' },
      caption: txt
    }, { quoted: shonux });

  } catch (e) {
    console.error('admins error', e);

    let userCfg = {};
    try { 
      if (number && typeof loadUserConfigFromMongo === 'function') 
        userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; 
    } catch(e){ userCfg = {}; }

    const title = userCfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: { 
        remoteJid: "status@broadcast", 
        participant: "0@s.whatsapp.net", 
        fromMe: false, 
        id: "META_AI_FAKE_ID_ADMINS2" 
      },
      message: { 
        contactMessage: { 
          displayName: title, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` 
        } 
      }
    };

    await socket.sendMessage(sender, { 
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ᴛᴏ ʟɪsᴛ
╰┄『 𝐀𝐃𝐌𝐈𝐍𝐒 𝐄𝐑𝐑𝐎𝐑 』
`
    }, { quoted: shonux });
  }
  break;
}


case 'jid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔-𝐌𝐃 𝐌𝐈𝐍𝐈';
    const userNumber = sender.split('@')[0];

    // Reaction
    await socket.sendMessage(sender, { react: { text: "🆔", key: msg.key } });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:BASEBOT-MD\nTEL;type=CELL;type=VOICE;waid=${userNumber}:${userNumber}\nEND:VCARD`
        }
      }
    };

    // Texte principal
    const mainText = `*🆔 ᴄʜᴀᴛ ᴊɪᴅ:* ${sender}\n*📞 ʏᴏᴜʀ ɴᴜᴍʙᴇʀ:* +${userNumber}`;

    // Construire le message interactif avec bouton "copy"
    const interactive = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: mainText },
            footer: { text: "> *ᴍᴀᴅᴇ ɪɴ ʙʏ ʏᴏᴜ ᴛᴇᴄʜx🌙*" },
            header: { hasMediaAttachment: false, title: "Identifiant de chat" },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "📋 ᴄᴏᴘɪᴇʀ ᴊɪᴅ",
                    id: "copy_jid",
                    copy_code: sender
                  })
                }
              ]
            }
          }
        }
      }
    };

    // Envoyer le message interactif (un seul envoi, quoted pour style)
    await socket.relayMessage(sender, interactive.viewOnceMessage.message, { messageId: `jid_${Date.now()}` });
    // Envoyer aussi en quoted pour conserver l'apparence "meta" (optionnel)
    await socket.sendMessage(sender, { text: mainText }, { quoted: shonux });

  } catch (e) {
    console.error('JID ERROR', e);
    try {
      await socket.sendMessage(sender, { text: `❌ Erreur: ${e.message || e}` }, { quoted: msg });
    } catch (err) { /* ignore */ }
  }
  break;
}
// use inside your switch(command) { ... } block

case 'setpath': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  // Vérification des permissions
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴇʀᴍɪssɪᴏɴ
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

    break;
  }

  const pathNumber = args[0]?.trim();
  if (!pathNumber) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴍɪssɪɴɢ ɪɴᴘᴜᴛ ❌
│. • ᴜsᴀɢᴇ : .sᴇᴛᴘᴀᴛʜ 000000000
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐌𝐎𝐃𝐔𝐋𝐄 』
`
    }, { quoted: shonux });
  }

  const cleanPathNumber = pathNumber.replace(/[^0-9]/g, '');
  if (cleanPathNumber.length < 8) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    return await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ɪɴᴠᴀʟɪᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴜᴍʙᴇʀ ᴛᴏᴏ sʜᴏʀᴛ
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐕𝐀𝐋𝐈𝐃𝐀𝐓𝐈𝐎𝐍 』
`
    }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};

    cfg.savePath = `${cleanPathNumber}@s.whatsapp.net`;
    cfg.savePathNumber = cleanPathNumber;

    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴘᴀᴛʜ : ${cleanPathNumber}
│. • ᴛᴀʀɢᴇᴛ : ${cleanPathNumber}@s.whatsapp.net
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐃𝐎𝐍𝐄 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('setpath error', e);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETPATH5" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ${e.message}
╰┄『 𝐒𝐄𝐓𝐏𝐀𝐓𝐇 𝐄𝐑𝐑𝐎𝐑 』
`
    }, { quoted: shonux });
  }

  break;
}

case 'getpath': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETPATH" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    if (cfg.savePath) {
      await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴀᴄᴛɪᴠᴇ ✅
│. • ɴᴜᴍʙᴇʀ : ${cfg.savePathNumber}
│. • ᴊɪᴅ : ${cfg.savePath}
│. • ᴛɪᴍᴇ : ${cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleString('fr-FR') : 'ɴ/ᴀ'}
╰┄『 𝐒𝐀𝐕𝐄 𝐏𝐀𝐓𝐇 𝐈𝐍𝐅𝐎 』
`
      }, { quoted: shonux });

    } else {
      await socket.sendMessage(sender, {
        text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ɪɴᴀᴄᴛɪᴠᴇ ⚠️
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴀᴛʜ ᴄᴏɴғɪɢᴜʀᴇᴅ
│. • ᴜsᴀɢᴇ : .sᴇᴛᴘᴀᴛʜ <ɴᴜᴍʙᴇʀ>
╰┄『 𝐒𝐀𝐕𝐄 𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
      }, { quoted: shonux });
    }

  } catch (e) {
    console.error('getpath error', e);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETPATH_ERR" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD` } }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ᴄᴀɴɴᴏᴛ ʀᴇᴛʀɪᴇᴠᴇ ᴅᴀᴛᴀ
╰┄『 𝐆𝐄𝐓𝐏𝐀𝐓𝐇 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  break;
}

case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓';

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    let txt = `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴇssɪᴏɴ : ${sanitized}
│. • ʙᴏᴛ ɴᴀᴍᴇ : ${botName}
│. • ɴᴜᴍʙᴇʀ : ${sanitized}
│. • ʟᴏɢᴏ : ${cfg.logo || config.RCD_IMAGE_PATH}
╰┄『 𝐂𝐎𝐍𝐅𝐈𝐆 𝐒𝐘𝐒𝐓𝐄𝐌 』
`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });

  } catch (e) {
    console.error('showconfig error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SHOWCONFIG2"
      },
      message: {
        contactMessage: {
          displayName: '𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓',
          vcard: `BEGIN:VCARD
VERSION:3.0
N:YOU WEB BOT;;;;
FN:YOU WEB BOT
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, { text: '❌ ᴇʀʀᴏʀ ʟᴏᴀᴅɪɴɢ ᴄᴏɴғɪɢ' }, { quoted: shonux });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG1"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴅᴇɴɪᴇᴅ ❌
│. • ʀᴇᴀsᴏɴ : ɴᴏ ᴘᴇʀᴍɪssɪᴏɴ
│. • ᴍᴏᴅᴜʟᴇ : ʀᴇsᴇᴛ ᴄᴏɴғɪɢ
╰┄『 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });

    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG2"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid:50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : sᴜᴄᴄᴇss ✅
│. • ᴍᴏᴅᴜʟᴇ : ʀᴇsᴇᴛ ᴄᴏɴғɪɢ
│. • sᴛᴀɢᴇ : ᴅᴇғᴀᴜʟᴛ ʀᴇsᴛᴏʀᴇᴅ
╰┄『 𝐂𝐎𝐍𝐅𝐈𝐆 𝐑𝐄𝐒𝐄𝐓 』
`
    }, { quoted: shonux });

  } catch (e) {
    console.error('resetconfig error', e);

    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_RESETCONFIG3"
      },
      message: {
        contactMessage: {
          displayName: BOT_NAME_FANCY,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${BOT_NAME_FANCY};;;;
FN:${BOT_NAME_FANCY}
ORG:𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓
TEL;type=CELL;type=VOICE;waid=50941319791:+509 4131 9791
END:VCARD`
        }
      }
    };

    await socket.sendMessage(sender, {
      text: `
╭┄『 ⊹ ࣪𝐘𝐎𝐔 𝐖𝐄𝐁 𝐁𝐎𝐓 ⊹ ࣪ 』
│. • sᴛᴀᴛᴜs : ᴇʀʀᴏʀ ❌
│. • ᴍᴇssᴀɢᴇ : ғᴀɪʟᴇᴅ ʀᴇsᴇᴛ
╰┄『 𝐒𝐘𝐒𝐓𝐄𝐌 』
`
    }, { quoted: shonux });
  }

  break;
}


        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    if (config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

 try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // Après avoir créé le socket et défini socketCreationTime

socketCreationTime.set(sanitizedNumber, Date.now());
socket.downloadMediaMessage = (m, filename) => downloadMediaMessage(m, filename)
setupStatusHandlers(socket, sanitizedNumber);
setupCommandHandlers(socket, sanitizedNumber);
setupMessageHandlers(socket);
setupAutoRestart(socket, sanitizedNumber);
setupNewsletterHandlers(socket, sanitizedNumber);
registerGroupParticipantListener(socket).catch(err => console.error('Listener init failed', err));
handleMessageRevocation(socket, sanitizedNumber);
    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const credsObj = JSON.parse(fileContent);
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) { console.error('Failed saving creds on creds.update:', err); }
    });


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
  `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│. ˚˖𓍢ִ໋✅ ᴄᴏɴɴᴇxɪᴏɴ ᴇ́ᴛᴀʙʟɪᴇ ᴀᴠᴇᴄ sᴜᴄᴄᴇ̀s !
│. ˚˖𓍢ִ໋🔢 ɴᴜᴍᴇ́ʀᴏ : ${sanitizedNumber}
│. ˚˖𓍢ִ໋🕒 ᴄᴏɴɴᴇxɪᴏɴ : ʟᴇ bot sᴇʀᴀ ᴀᴄᴛɪғ ᴅᴀɴs ǫᴜᴇʟǫᴜᴇs sᴇᴄᴏɴᴅᴇs\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ`,
  useBotName
);

          // send initial message
         let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: `https://i.postimg.cc/HkHw5qSN/file-0000000031f871fdbb71e79065924655.png` }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
  `╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
│ ⊹ ࣪ ˖✅ 𝐂𝐎𝐍𝐄𝐂𝐓𝐄𝐃 𝐒𝐔𝐂𝐂𝐄𝐒𝐅𝐔𝐋𝐋𝐘
│ ⊹ ࣪ ˖🌟 уσυ м∂ ιѕ ʜєʀє
│ ⊹ ࣪ ˖🔢 ηυмвєʀѕ : ${sanitizedNumber}
│ ⊹ ࣪ ˖🕒 ¢σηηє¢тє́ : ${getHaitiTimestamp()}
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ᕗ
*| туρєѕ .мєηυ тσ ѕєє αℓℓ ¢м∂ѕ*
> *уσυ ωєв вσт ιѕ ησω σηℓιηє*`,
  useBotName
);

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: `https://i.postimg.cc/HkHw5qSN/file-0000000031f871fdbb71e79065924655.png` }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          //await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
         // await sendOwnerConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'YOU-WEB-BOT'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getHaitiTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: 'YOU-WEB-BOT', activesession: activeSockets.size });
});


router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'YOU-WEB-BOT'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;
