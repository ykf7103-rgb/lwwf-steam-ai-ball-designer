const CLASS_LIMITS = {
  "5A": 26,
  "5B": 21,
  "5C": 28,
  "5D": 20
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  /^image\//,
  /^application\/pdf$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, app: "lwwf-steam-ai-ball-designer" });
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    if (url.pathname === "/api/submissions" && request.method === "POST") {
      return handleSubmissions(request, env);
    }

    if (url.pathname === "/api/download" && request.method === "POST") {
      return handleDownload(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "找不到這個服務。" }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "網站資源尚未連接。" }, 500);
  }
};

async function handleUpload(request, env) {
  if (!env.STEAM_UPLOADS_KV) {
    return json({ ok: false, error: "作品上載空間尚未設定。" }, 500);
  }

  const form = await request.formData();
  const className = cleanText(form.get("className"));
  const studentNo = Number(form.get("studentNo"));
  const artifactType = cleanText(form.get("artifactType"));
  const prompt = cleanText(form.get("prompt"), 1600);
  const file = form.get("file");

  if (!CLASS_LIMITS[className]) {
    return json({ ok: false, error: "請選擇正確班別。" }, 400);
  }

  if (!Number.isInteger(studentNo) || studentNo < 1 || studentNo > CLASS_LIMITS[className]) {
    return json({ ok: false, error: "請選擇正確學號。" }, 400);
  }

  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, error: "請選擇作品檔案。" }, 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ ok: false, error: "檔案太大，請上載 10MB 或以下的檔案。" }, 400);
  }

  if (!ALLOWED_TYPES.some((pattern) => pattern.test(file.type || ""))) {
    return json({ ok: false, error: "請上載圖片、PDF 或 Word 檔。" }, 400);
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const paddedNo = String(studentNo).padStart(2, "0");
  const extension = getExtension(file.name, file.type);
  const random = crypto.randomUUID().slice(0, 8);
  const key = `steam-ai-ball-designer/2025-26/${className}/${paddedNo}/${stamp}-${random}${extension}`;
  const arrayBuffer = await file.arrayBuffer();

  const record = {
    key,
    className,
    studentNo,
    artifactType,
    originalName: cleanText(file.name, 180),
    contentType: file.type || "application/octet-stream",
    size: file.size,
    prompt,
    sport: cleanText(form.get("sport")),
    diameter: cleanText(form.get("diameter")),
    players: cleanText(form.get("players")),
    material: cleanText(form.get("material")),
    color: cleanText(form.get("color")),
    style: cleanText(form.get("style")),
    background: cleanText(form.get("background")),
    uploadedAt: now.toISOString(),
    dataBase64: arrayBufferToBase64(arrayBuffer)
  };

  await env.STEAM_UPLOADS_KV.put(key, JSON.stringify(record), {
    metadata: {
      className,
      studentNo: String(studentNo),
      size: String(record.size),
      uploadedAt: record.uploadedAt
    }
  });

  return json({
    ok: true,
    key,
    className,
    studentNo,
    uploadedAt: now.toISOString()
  });
}

async function handleSubmissions(request, env) {
  if (!env.STEAM_UPLOADS_KV) {
    return json({ ok: false, error: "作品上載空間尚未設定。" }, 500);
  }

  const body = await request.json().catch(() => ({}));
  if (!checkTeacherPassword(body.password, env)) {
    return json({ ok: false, error: "老師密碼不正確。" }, 401);
  }

  const className = cleanText(body.className || "5A");
  if (!CLASS_LIMITS[className]) {
    return json({ ok: false, error: "請選擇正確班別。" }, 400);
  }

  const prefix = `steam-ai-ball-designer/2025-26/${className}/`;
  const keys = await listAllKeys(env.STEAM_UPLOADS_KV, prefix);
  const records = (await Promise.all(keys.map((item) => submissionRecord(env.STEAM_UPLOADS_KV, item, className))))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));

  const submittedNumbers = new Set(records.map((record) => record.studentNo).filter(Boolean));
  const students = [];
  for (let no = 1; no <= CLASS_LIMITS[className]; no += 1) {
    students.push({ no, submitted: submittedNumbers.has(no) });
  }

  return json({
    ok: true,
    className,
    totalStudents: CLASS_LIMITS[className],
    submittedCount: submittedNumbers.size,
    missingCount: CLASS_LIMITS[className] - submittedNumbers.size,
    students,
    records
  });
}

async function submissionRecord(kv, item, className) {
  const record = await kv.get(item.name, "json");
  const meta = item.metadata || {};
  return {
    key: item.name,
    className: record?.className || meta.className || className,
    studentNo: Number(record?.studentNo || meta.studentNo || parseStudentNo(item.name)),
    artifactType: record?.artifactType || "",
    originalName: record?.originalName || "",
    contentType: record?.contentType || "",
    size: Number(record?.size || meta.size || 0),
    uploadedAt: record?.uploadedAt || meta.uploadedAt || ""
  };
}

async function handleDownload(request, env) {
  if (!env.STEAM_UPLOADS_KV) {
    return json({ ok: false, error: "作品上載空間尚未設定。" }, 500);
  }

  const body = await request.json().catch(() => ({}));
  if (!checkTeacherPassword(body.password, env)) {
    return json({ ok: false, error: "老師密碼不正確。" }, 401);
  }

  const key = cleanText(body.key, 500);
  if (!key || !key.startsWith("steam-ai-ball-designer/2025-26/")) {
    return json({ ok: false, error: "缺少作品編號。" }, 400);
  }

  const record = await env.STEAM_UPLOADS_KV.get(key, "json");
  if (!record) {
    return json({ ok: false, error: "找不到作品。" }, 404);
  }

  const bytes = base64ToUint8Array(record.dataBase64);
  return new Response(bytes, {
    headers: {
      "Content-Type": record.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeFilename(record.originalName || "student-work")}"`,
      ...corsHeaders()
    }
  });
}

async function listAllKeys(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

function checkTeacherPassword(password, env) {
  return Boolean(env.TEACHER_PW) && String(password || "") === env.TEACHER_PW;
}

function parseStudentNo(key) {
  const parts = String(key || "").split("/");
  return Number(parts[3] || 0);
}

function cleanText(value, max = 300) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function getExtension(name, type) {
  const match = String(name || "").toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  if (match) return match[0];
  if (type === "application/pdf") return ".pdf";
  if (type === "application/msword") return ".doc";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/jpeg") return ".jpg";
  return ".bin";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeFilename(name) {
  return String(name || "student-work").replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
