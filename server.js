/* Pheevee 生日花园 · 静态站点 + 祝福墙/相册接口
   零依赖 Node 服务：单端口，数据存在 data/ 目录里 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const DB = path.join(DATA_DIR, 'entries.json');
const MAX_BODY = 30 * 1024 * 1024;

fs.mkdirSync(PHOTO_DIR, { recursive: true });
if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { return []; }
}

let writeLock = Promise.resolve();
function writeDB(list) {
  writeLock = writeLock.then(() => new Promise((resolve) => {
    const tmp = DB + '.tmp';
    fs.writeFile(tmp, JSON.stringify(list, null, 0), (err) => {
      if (err) { resolve(); return; }
      fs.rename(tmp, DB, () => resolve());
    });
  }));
  return writeLock;
}

function sendJSON(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('文件太大，请换一张小一点的')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* 极简 multipart 解析：够用即可 */
function parseMultipart(buf, boundary) {
  const delim = Buffer.from('--' + boundary);
  const out = { fields: {}, files: [] };
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (buf.slice(pos, pos + 2).toString() === '--') break;
    if (buf[pos] === 13 && buf[pos + 1] === 10) pos += 2;
    const headEnd = buf.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const head = buf.slice(pos, headEnd).toString('utf8');
    const bodyStart = headEnd + 4;
    let next = buf.indexOf(delim, bodyStart);
    if (next === -1) next = buf.length;
    let bodyEnd = next;
    while (bodyEnd > bodyStart && (buf[bodyEnd - 1] === 10 || buf[bodyEnd - 1] === 13)) bodyEnd--;
    const body = buf.slice(bodyStart, bodyEnd);
    const nameM = /name="([^"]*)"/i.exec(head);
    const fileM = /filename="([^"]*)"/i.exec(head);
    const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(head);
    if (nameM) {
      if (fileM) {
        out.files.push({ name: nameM[1], filename: fileM[1], type: typeM ? typeM[1].trim() : '', data: body });
      } else {
        out.fields[nameM[1]] = body.toString('utf8');
      }
    }
    pos = next;
  }
  return out;
}

function extFor(type, filename) {
  const t = (type || '').toLowerCase();
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('gif')) return '.gif';
  if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
  const e = path.extname(filename || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(e)) return e === '.jpeg' ? '.jpg' : e;
  return '.jpg';
}

async function handleEntries(req, res) {
  if (req.method === 'GET') {
    const list = readDB();
    list.sort((a, b) => (a.created || 0) - (b.created || 0));
    sendJSON(res, 200, list);
    return;
  }
  if (req.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    } catch (e) {
      sendJSON(res, 400, { error: '格式不对' });
      return;
    }
    const entry = Object.assign({}, payload, {
      id: crypto.randomUUID(),
      created: Date.now()
    });
    if (entry.kind === 'note') {
      entry.text = String(entry.text || '').slice(0, 500);
      entry.name = String(entry.name || '匿名').slice(0, 40);
    }
    const list = readDB();
    list.push(entry);
    await writeDB(list);
    sendJSON(res, 200, entry);
    return;
  }
 res.writeHead(405); res.end();
}

async function handlePhotoUpload(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  const ctype = req.headers['content-type'] || '';
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ctype);
  if (!m) { sendJSON(res, 400, { error: '缺少上传内容' }); return; }
  const boundary = (m[1] || m[2]).trim();
  let parsed;
  try {
    parsed = parseMultipart(await readBody(req), boundary);
  } catch (e) {
    sendJSON(res, 413, { error: e.message });
    return;
  }
  const file = parsed.files[0];
  if (!file || !file.data.length) { sendJSON(res, 400, { error: '没有收到图片' }); return; }

  const key = crypto.randomUUID() + extFor(file.type, file.filename);
  fs.writeFileSync(path.join(PHOTO_DIR, key), file.data);

  const entry = {
    id: crypto.randomUUID(),
    kind: 'photo',
    key: key,
    caption: String(parsed.fields.caption || '').slice(0, 120),
    created: Date.now()
  };
  if (parsed.fields.slot !== undefined && parsed.fields.slot !== '') {
    entry.slot = Number(parsed.fields.slot);
  }
  const list = readDB();
  list.push(entry);
  await writeDB(list);
  sendJSON(res, 200, entry);
}

function servePhoto(req, res, url) {
  const key = path.basename(url.searchParams.get('key') || '');
  if (!key) { res.writeHead(400); res.end(); return; }
  const file = path.join(PHOTO_DIR, key);
  if (!file.startsWith(PHOTO_DIR) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const index = path.join(ROOT, 'index.html');
    if (fs.existsSync(index)) {
      const body = fs.readFileSync(index);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    }
    res.writeHead(404); res.end(); return;
  }
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const noCache = ['.html', '.js', '.css'].includes(ext);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400'
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/entries') { await handleEntries(req, res); return; }
    if (url.pathname === '/api/photo') {
      if (req.method === 'GET') servePhoto(req, res, url);
      else await handlePhotoUpload(req, res);
      return;
    }
    if (url.pathname === '/api/health') { sendJSON(res, 200, { ok: true }); return; }
    serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) sendJSON(res, 500, { error: '服务器开小差了' });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Pheevee garden listening on ' + PORT);
});
