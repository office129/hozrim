/**
 * חוזרים לבראשית — יצירת סיכום מפגש אוטומטי (מצגת PDF) מתוך הקלטת המפגש
 * ---------------------------------------------------------------------------
 * מה זה עושה:
 *   1. סורק את תיקיית הלקוחות בדרייב → לקוח → "פגישות והקלטות" → תיקיית המפגש.
 *   2. מוצא את קובץ ההקלטה (mp4 / m4a) בתוך תיקיית המפגש.
 *   3. מעלה ל-Gemini (File API) ומבקש סיכום חם בסגנון "חוזרים לבראשית" — וגם
 *      החלטות עיצוב + *תיאורי תמונה* לכל שקופית (איור חם וסמלי, בלי טקסט).
 *   4. מודל התמונות של Gemini מצייר רקע לכל שקופית; מעליו יושב פאנל קרם עם
 *      הטקסט (בסגנון NotebookLM). מייצא ל-PDF ושומר בתיקיית המפגש.
 *   האפליקציה כבר קולטת אוטומטית כל PDF שמופיע שם, אז משם זה מגיע ללקוח לבד.
 *
 * בטיחות הרצה ראשונה: MAX_MEETINGS_PER_RUN=1 ו/או TEST_MEETING_FOLDER_ID.
 * דדופ: מפגש שכבר יש בתיקייה שלו קובץ עם המילה "סיכום" — יידלג.
 *
 * ⚠️ לפני הרצה מלאה: הרץ פעם אחת את הפונקציה listImageModels() כדי לראות אילו
 *    מודלי-תמונה זמינים בחשבון שלך, ועדכן את IMAGE_MODEL בהתאם.
 */

// ==========================================================================
//  הגדרות — ערוך כאן
// ==========================================================================
var CONFIG = {
  GEMINI_API_KEY: 'PASTE_YOUR_GEMINI_API_KEY_HERE',

  // מודל טקסט (סיכום + החלטות עיצוב).
  GEMINI_MODEL: 'gemini-3.6-flash',

  // מודל תמונות. שמות משתנים תכופות — הרץ listImageModels() כדי לאמת מה זמין
  // אצלך, ועדכן כאן. אם המודל לא זמין/נכשל — המצגת עדיין תיווצר, בלי תמונות.
  IMAGE_MODEL: 'gemini-3-pro-image',

  // האם לייצר תמונות רקע ב-AI (העיצוב העשיר). false = עיצוב צבעוני נקי בלבד.
  GENERATE_IMAGES: true,

  ROOT_FOLDER_ID: '',
  ROOT_FOLDER_NAME: 'חוזרים לבראשית - לקוחות',
  MEETINGS_FOLDER_NAME: 'פגישות והקלטות',
  SUMMARY_MARKER: 'סיכום',

  TEST_MEETING_FOLDER_ID: '',
  MAX_MEETINGS_PER_RUN: 1,
  KEEP_EDITABLE_DECK: false,

  // 8MB — הסף הבטוח לזיכרון של Apps Script (ערכים גבוהים = Out of memory).
  CHUNK_SIZE: 8 * 1024 * 1024,
};

// סגנון אחיד לכל תמונות הרקע (מצורף לכל תיאור תמונה).
var IMAGE_STYLE_SUFFIX =
  ' Soft warm painterly illustration, golden hour glow, terracotta and cream and honey-gold palette, ' +
  'calm, hopeful, spiritual, sense of home and safety. Abstract and symbolic. ' +
  'NO text, NO words, NO letters, NO logos, NO human faces. Wide 16:9 composition, gentle and uncluttered.';

// פלטות צבעים (משמשות גם כשאין תמונה, וגם לפאנלים/כותרות מעל התמונה).
var PALETTES = {
  terracotta_cream: { brand: '#C0603A', brandDark: '#8F3F22', gold: '#C9A34E', bg: '#FBF6EE', bgAccent: '#F3E7D6', ink: '#3A2E26', coverText: '#FDEFE2' },
  olive_honey:      { brand: '#6E7B3F', brandDark: '#4E5A2A', gold: '#D2A24C', bg: '#F7F4EA', bgAccent: '#E9E7D3', ink: '#33341F', coverText: '#F3F1E0' },
  dusty_rose:       { brand: '#B06A6A', brandDark: '#8A4B4B', gold: '#CBA15E', bg: '#FBF1EF', bgAccent: '#F3E0DD', ink: '#402E2E', coverText: '#FBEDEA' },
  deep_teal_sand:   { brand: '#2F6F6A', brandDark: '#1F514D', gold: '#C9A24C', bg: '#F4F3EC', bgAccent: '#DDE7E2', ink: '#26332F', coverText: '#E8F1EE' },
  plum_apricot:     { brand: '#7E5468', brandDark: '#5C3A4C', gold: '#D6A15A', bg: '#F9F3F1', bgAccent: '#EFE1E6', ink: '#382A31', coverText: '#F6E9EC' },
  forest_gold:      { brand: '#3E6B45', brandDark: '#2A4E30', gold: '#CDA14E', bg: '#F4F5EE', bgAccent: '#DCE6D9', ink: '#253026', coverText: '#E9F1E6' },
  amber_earth:      { brand: '#B77B33', brandDark: '#8A5820', gold: '#C9A34E', bg: '#FBF5E9', bgAccent: '#F1E4CC', ink: '#3A2E1E', coverText: '#FCEFD6' },
};
var PALETTE_NAMES = Object.keys(PALETTES);

// ==========================================================================
//  נקודת כניסה ראשית
// ==========================================================================
function generateMeetingSummaries() {
  var startedAt = new Date();
  log_('=== התחלת ריצה: יצירת סיכומי מפגשים ===');

  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.indexOf('PASTE_') === 0) {
    throw new Error('חסר GEMINI_API_KEY בהגדרות (CONFIG).');
  }

  var meetings;
  if (CONFIG.TEST_MEETING_FOLDER_ID) {
    var testFolder = DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID);
    meetings = [{ folder: testFolder, clientName: guessClientNameFromMeeting_(testFolder) }];
    log_('מצב בדיקה: מטפל רק בתיקייה ' + testFolder.getName());
  } else {
    meetings = collectMeetingFolders_();
    log_('נמצאו ' + meetings.length + ' תיקיות מפגש לבדיקה.');
  }

  var pending = [];
  for (var i = 0; i < meetings.length; i++) {
    if (hasSummaryAlready_(meetings[i].folder)) continue;
    pending.push(meetings[i]);
  }
  log_('מתוכם ' + pending.length + ' ללא סיכום עדיין.');

  var processed = 0, created = 0, failed = 0;
  for (var j = 0; j < pending.length; j++) {
    if (processed >= CONFIG.MAX_MEETINGS_PER_RUN) {
      log_('הגעתי למגבלת ' + CONFIG.MAX_MEETINGS_PER_RUN + ' מפגשים להרצה — עוצר.');
      break;
    }
    var m = pending[j];
    processed++;
    try {
      log_('--- מטפל במפגש: ' + m.folder.getName() + ' (לקוח: ' + m.clientName + ') ---');
      if (processMeeting_(m.folder, m.clientName)) created++;
    } catch (err) {
      failed++;
      log_('!! שגיאה במפגש "' + m.folder.getName() + '": ' + (err && err.stack ? err.stack : err));
    }
  }

  var secs = Math.round((new Date() - startedAt) / 1000);
  log_('=== סיום ריצה. נוצרו ' + created + ' מצגות, ' + failed + ' כשלונות, ' + processed + ' טופלו, תוך ' + secs + ' שניות. ===');
}

// ==========================================================================
//  איסוף תיקיות מפגשים
// ==========================================================================
function collectMeetingFolders_() {
  var root = getRootFolder_();
  var results = [];
  var clients = root.getFolders();
  while (clients.hasNext()) {
    var clientFolder = clients.next();
    var clientName = cleanClientName_(clientFolder.getName());
    var meetingsRoots = findFoldersByNameDeep_(clientFolder, CONFIG.MEETINGS_FOLDER_NAME, 2);
    for (var r = 0; r < meetingsRoots.length; r++) {
      var subMeetings = meetingsRoots[r].getFolders();
      while (subMeetings.hasNext()) results.push({ folder: subMeetings.next(), clientName: clientName });
    }
  }
  return results;
}

function getRootFolder_() {
  if (CONFIG.ROOT_FOLDER_ID) return DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  var it = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (!it.hasNext()) throw new Error('לא נמצאה תיקיית שורש בשם "' + CONFIG.ROOT_FOLDER_NAME + '". מלא ROOT_FOLDER_ID.');
  return it.next();
}

function findFoldersByNameDeep_(folder, name, maxDepth) {
  var found = [];
  (function walk(f, depth) {
    if (depth > maxDepth) return;
    var subs = f.getFolders();
    while (subs.hasNext()) {
      var s = subs.next();
      if (s.getName() === name) found.push(s);
      else walk(s, depth + 1);
    }
  })(folder, 0);
  return found;
}

function guessClientNameFromMeeting_(meetingFolder) {
  try {
    var parents = meetingFolder.getParents();
    if (parents.hasNext()) {
      var meetingsRoot = parents.next();
      var gp = meetingsRoot.getParents();
      if (gp.hasNext()) return cleanClientName_(gp.next().getName());
    }
  } catch (e) {}
  return '';
}

function cleanClientName_(folderName) { return String(folderName || '').trim(); }

// ==========================================================================
//  דדופ + מציאת הקלטה
// ==========================================================================
function hasSummaryAlready_(meetingFolder) {
  var files = meetingFolder.getFiles();
  while (files.hasNext()) {
    if (files.next().getName().indexOf(CONFIG.SUMMARY_MARKER) !== -1) return true;
  }
  return false;
}

function findRecordingFile_(meetingFolder) {
  var candidates = [];
  var files = meetingFolder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var mime = f.getMimeType();
    var name = f.getName().toLowerCase();
    var isAV = mime === 'video/mp4' || mime === 'audio/mp4' || mime === 'audio/x-m4a' ||
      mime === 'audio/mpeg' || mime === 'video/quicktime' ||
      /\.(mp4|m4a|mov|mp3|wav|aac|webm)$/.test(name);
    if (isAV) candidates.push(f);
  }
  if (candidates.length === 0) return null;
  candidates.sort(function (a, b) { return b.getSize() - a.getSize(); });
  return candidates[0];
}

// ==========================================================================
//  טיפול במפגש בודד
// ==========================================================================
function processMeeting_(meetingFolder, clientName) {
  var recording = findRecordingFile_(meetingFolder);
  if (!recording) { log_('  אין קובץ הקלטה בתיקייה — מדלג.'); return false; }
  log_('  הקלטה: ' + recording.getName() + ' (' + Math.round(recording.getSize() / 1024 / 1024) + 'MB)');

  var uploaded = uploadFileToGemini_(recording);
  log_('  הועלה ל-Gemini: ' + uploaded.uri);

  var summary = requestSummaryFromGemini_(uploaded, clientName);
  log_('  התקבל סיכום: "' + (summary.title || '') + '" | עיצוב: ' +
    (summary.design ? (summary.design.paletteName + '/' + summary.design.layout) : '(אקראי)'));

  var meetingLabel = meetingFolder.getName();
  var pdf = buildSlidesAndExportPdf_(summary, clientName, meetingLabel, meetingFolder);
  log_('  נוצר PDF: ' + pdf.getName());

  try { deleteGeminiFile_(uploaded.name); } catch (e) {}
  return true;
}

// ==========================================================================
//  Gemini — העלאת קובץ (Resumable, במקטעים ישירות מהדרייב)
// ==========================================================================
function uploadFileToGemini_(driveFile) {
  var fileId = driveFile.getId();
  var totalSize = driveFile.getSize();
  var mimeType = normalizeMediaMime_(driveFile);

  var startResp = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY),
    { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {
        'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(totalSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      payload: JSON.stringify({ file: { display_name: driveFile.getName() } }) });
  if (startResp.getResponseCode() >= 300) throw new Error('Gemini upload start נכשל: ' + startResp.getResponseCode() + ' ' + startResp.getContentText());
  var uploadUrl = startResp.getHeaders()['X-Goog-Upload-URL'] || startResp.getHeaders()['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('לא התקבל X-Goog-Upload-URL מ-Gemini.');

  var token = ScriptApp.getOAuthToken();
  var offset = 0, lastResponse = null;
  while (offset < totalSize) {
    var end = Math.min(offset + CONFIG.CHUNK_SIZE, totalSize) - 1;
    var chunkBytes = downloadDriveRange_(fileId, offset, end, token);
    var isLast = (end + 1) >= totalSize;
    var putResp = UrlFetchApp.fetch(uploadUrl, { method: 'post', muteHttpExceptions: true,
      headers: { 'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(offset) },
      contentType: 'application/octet-stream', payload: chunkBytes });
    if (putResp.getResponseCode() >= 300) throw new Error('Gemini upload chunk נכשל (offset ' + offset + '): ' + putResp.getResponseCode() + ' ' + putResp.getContentText());
    lastResponse = putResp;
    offset = end + 1;
    log_('    הועלה ' + Math.round(offset / 1024 / 1024) + 'MB / ' + Math.round(totalSize / 1024 / 1024) + 'MB');
  }

  var info = JSON.parse(lastResponse.getContentText());
  var file = info.file || info;
  if (!file || !file.uri) throw new Error('תשובת סיום ההעלאה חסרה uri: ' + lastResponse.getContentText());
  file = waitForGeminiFileActive_(file.name || 'files/' + file.uri.split('/').pop());
  return { uri: file.uri, name: file.name, mimeType: mimeType };
}

function downloadDriveRange_(fileId, startByte, endByte, token) {
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true',
    { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, Range: 'bytes=' + startByte + '-' + endByte } });
  var code = resp.getResponseCode();
  if (code !== 206 && code !== 200) throw new Error('קריאת מקטע מהדרייב נכשלה: ' + code + ' ' + resp.getContentText());
  return resp.getBlob().getBytes();
}

function waitForGeminiFileActive_(fileName) {
  if (!fileName) return { uri: '', name: '' };
  var url = 'https://generativelanguage.googleapis.com/v1beta/' + fileName + '?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);
  for (var attempt = 0; attempt < 60; attempt++) {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() >= 300) throw new Error('בדיקת מצב קובץ Gemini נכשלה: ' + resp.getContentText());
    var file = JSON.parse(resp.getContentText());
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error('Gemini נכשל בעיבוד הקובץ.');
    Utilities.sleep(3000);
  }
  throw new Error('Gemini לא סיים לעבד את הקובץ בזמן סביר.');
}

function deleteGeminiFile_(fileName) {
  if (!fileName) return;
  UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/' + fileName + '?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY),
    { method: 'delete', muteHttpExceptions: true });
}

function normalizeMediaMime_(driveFile) {
  var mime = driveFile.getMimeType();
  var name = driveFile.getName().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  if (/\.mp4$/.test(name)) return 'video/mp4';
  if (/\.m4a$/.test(name)) return 'audio/mp4';
  if (/\.mp3$/.test(name)) return 'audio/mpeg';
  if (/\.wav$/.test(name)) return 'audio/wav';
  if (/\.mov$/.test(name)) return 'video/quicktime';
  if (/\.webm$/.test(name)) return 'video/webm';
  return 'video/mp4';
}

// ==========================================================================
//  עוזר: POST ל-Gemini עם ניסיון חוזר על עומס זמני (429/5xx)
// ==========================================================================
function geminiPostWithRetry_(url, body, label) {
  var maxAttempts = 5;
  var resp = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body) });
    var code = resp.getResponseCode();
    if (code < 300) return resp;
    var retryable = (code === 429 || code === 500 || code === 502 || code === 503 || code === 504);
    if (!retryable || attempt === maxAttempts) {
      throw new Error((label || 'Gemini') + ' נכשל: ' + code + ' ' + resp.getContentText());
    }
    var waitSec = 10 * attempt;
    log_('    ' + (label || 'Gemini') + ' עמוס (' + code + ') — ממתין ' + waitSec + 'ש ומנסה שוב (' + attempt + '/' + (maxAttempts - 1) + ')…');
    Utilities.sleep(waitSec * 1000);
  }
  return resp;
}

// ==========================================================================
//  Gemini — בקשת הסיכום + עיצוב + תיאורי תמונה (פלט JSON מובנה)
// ==========================================================================
function requestSummaryFromGemini_(uploaded, clientName) {
  var who = clientName || 'הלקוח';
  var prompt =
    'זו הקלטה של מפגש אימון/טיפול אישי במסגרת "חוזרים לבראשית". ' +
    'האזן היטב לכל השיחה (בעברית) והפק סיכום אישי, חם ומכבד, שמופנה ישירות אל ' + who + '. ' +
    'תכין מצגת עם תחושה של בית, חום ושל "אתה לא לבד", יש תקווה, אתה בדרך הנכונה. ' +
    'שים דגש על מה ש' + who + ' גילה בטיפול ומה הנקודות שהוא צריך להתמקד בהם השבוע.\n\n' +
    'כללים לתוכן:\n' +
    '- גוף שני, עברית, טון חם ומעודד — כאילו יוסף עצמו כותב ל' + who + '.\n' +
    '- אל תמציא פרטים שלא נאמרו. אם לא ברור — כתוב בעדינות ובכלליות.\n' +
    '- "discoveries" = תובנות/גילויים אמיתיים מהמפגש (2–4).\n' +
    '- "focusPoints" = על מה להתמקד ולתרגל השבוע (2–4 מעשיות).\n' +
    '- "highlightQuote" = משפט קצר אחד שבלט (או ריק).\n' +
    '- כל נקודה קצרה וממוקדת (משפט או שניים).\n\n' +
    'עיצוב (design): בחר "paletteName" מ- ' + PALETTE_NAMES.join(', ') + '. ' +
    'נסח כותרות סקשן חמות ומקוריות: "sectionTitleDiscoveries", "sectionTitleFocus". ' +
    '"moodWord" = מילה אחת שמתמצתת את תחושת המפגש.\n\n' +
    'תמונות (images): לכל שקופית כתוב תיאור ויזואלי באנגלית לאיור רקע חם וסמלי ' +
    '(מטאפורה שמתאימה לתוכן — למשל אור בעד עצים, שחר, שורשים, נתיב, דלת נפתחת, ידיים פתוחות). ' +
    'בלי טקסט, בלי פרצופים. שדות: "imageCover", "imageDiscoveries", "imageFocus", "imageClosing".';

  var sectionArray = { type: 'ARRAY', items: { type: 'OBJECT',
    properties: { heading: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['heading', 'text'] } };

  var schema = { type: 'OBJECT', properties: {
    title: { type: 'STRING' }, greeting: { type: 'STRING' },
    discoveries: sectionArray, focusPoints: sectionArray,
    highlightQuote: { type: 'STRING' }, encouragement: { type: 'STRING' },
    design: { type: 'OBJECT', properties: {
      paletteName: { type: 'STRING', enum: PALETTE_NAMES },
      sectionTitleDiscoveries: { type: 'STRING' }, sectionTitleFocus: { type: 'STRING' }, moodWord: { type: 'STRING' },
    }, required: ['paletteName', 'sectionTitleDiscoveries', 'sectionTitleFocus'] },
    images: { type: 'OBJECT', properties: {
      imageCover: { type: 'STRING' }, imageDiscoveries: { type: 'STRING' },
      imageFocus: { type: 'STRING' }, imageClosing: { type: 'STRING' },
    } },
  }, required: ['title', 'greeting', 'discoveries', 'focusPoints', 'encouragement', 'design'] };

  var body = { contents: [{ role: 'user', parts: [
    { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } }, { text: prompt } ] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.85 } };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(CONFIG.GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);

  var resp = geminiPostWithRetry_(url, body, 'Gemini generateContent (סיכום)');
  var data = JSON.parse(resp.getContentText());
  var text = '';
  try { text = data.candidates[0].content.parts[0].text; }
  catch (e) { throw new Error('תשובת Gemini לא במבנה צפוי: ' + resp.getContentText()); }

  var parsed = JSON.parse(text);
  parsed.title = parsed.title || ('סיכום מפגש — ' + (clientName || ''));
  parsed.greeting = parsed.greeting || '';
  parsed.discoveries = parsed.discoveries || [];
  parsed.focusPoints = parsed.focusPoints || [];
  parsed.encouragement = parsed.encouragement || '';
  parsed.highlightQuote = parsed.highlightQuote || '';
  parsed.design = parsed.design || {};
  parsed.images = parsed.images || {};
  return parsed;
}

// ==========================================================================
//  Gemini — יצירת תמונת רקע (best-effort; מחזיר Blob או null)
// ==========================================================================
function generateBackgroundImage_(promptText) {
  if (!CONFIG.GENERATE_IMAGES || !promptText) return null;
  try {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(CONFIG.IMAGE_MODEL) + ':generateContent?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);
    var body = {
      contents: [{ role: 'user', parts: [{ text: promptText + IMAGE_STYLE_SUFFIX }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    };
    var resp = geminiPostWithRetry_(url, body, 'Gemini image');
    var data = JSON.parse(resp.getContentText());
    var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    for (var i = 0; i < parts.length; i++) {
      var inline = parts[i].inlineData || parts[i].inline_data;
      if (inline && inline.data) {
        var bytes = Utilities.base64Decode(inline.data);
        return Utilities.newBlob(bytes, inline.mimeType || inline.mime_type || 'image/png', 'bg.png');
      }
    }
    log_('    (התמונה לא הוחזרה — ממשיך בלי רקע לשקופית זו)');
    return null;
  } catch (e) {
    log_('    (יצירת תמונה נכשלה: ' + e + ' — ממשיך בלי רקע לשקופית זו)');
    return null;
  }
}

// ==========================================================================
//  בניית מצגת + ייצוא PDF
// ==========================================================================
function buildSlidesAndExportPdf_(summary, clientName, meetingLabel, meetingFolder) {
  var seed = (clientName || '') + '|' + (meetingLabel || '');
  var design = summary.design || {};
  var pal = PALETTES[design.paletteName] || PALETTES[hashPick_(PALETTE_NAMES, seed)];
  var titleDisc = design.sectionTitleDiscoveries || 'מה גילית בתהליך';
  var titleFocus = design.sectionTitleFocus || 'על מה נתמקד השבוע';
  var moodWord = design.moodWord || '';
  var img = summary.images || {};

  // מייצרים את התמונות מראש (best-effort)
  log_('  מייצר תמונות רקע…');
  var bgCover = generateBackgroundImage_(img.imageCover);
  var bgDisc = generateBackgroundImage_(img.imageDiscoveries);
  var bgFocus = generateBackgroundImage_(img.imageFocus);
  var bgClose = generateBackgroundImage_(img.imageClosing);

  var deckName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + meetingLabel;
  var pres = SlidesApp.create(deckName);
  var presId = pres.getId();
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');

  // --- שער ---
  var cover = pres.getSlides()[0];
  cover.getPageElements().forEach(function (el) { el.remove(); });
  setSlideBackground_(cover, pal, pal.brand, bgCover);
  addScrim_(cover, '#20140C', 0.34);
  addTextBox_(cover, 'חוזרים לבראשית', 40, 110, 640, 34, { size: 16, color: '#FDEFE2', bold: true, align: 'CENTER' });
  addTextBox_(cover, summary.title, 50, 175, 620, 110, { size: 34, color: '#FFFFFF', bold: true, align: 'CENTER' });
  var sub = (clientName ? clientName + '  •  ' : '') + dateStr + (moodWord ? '  •  ' + moodWord : '');
  addTextBox_(cover, sub, 40, 305, 640, 30, { size: 15, color: '#FDEFE2', align: 'CENTER' });

  // --- פתיח חם ---
  if (summary.greeting) {
    var s2 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    setSlideBackground_(s2, pal, pal.bg, bgCover);
    addPanel_(s2, pal, 55, 70, 610, 280);
    addTextBox_(s2, 'כמה מילים מהלב', 75, 88, 570, 40, { size: 22, color: pal.brandDark, bold: true, align: 'END' });
    addTextBox_(s2, summary.greeting, 75, 135, 570, 200, { size: 17, color: pal.ink, align: 'END', lineSpacing: 130 });
  }

  // --- מה גילית ---
  var s3 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  setSlideBackground_(s3, pal, pal.bg, bgDisc);
  buildPanelSlide_(s3, pal, titleDisc, summary.discoveries);

  // --- ציטוט ---
  if (summary.highlightQuote) {
    var sq = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    setSlideBackground_(sq, pal, pal.brandDark, bgClose || bgFocus);
    addScrim_(sq, '#1A0F08', 0.42);
    addTextBox_(sq, '“' + summary.highlightQuote + '”', 70, 150, 580, 180, { size: 26, color: '#FFFFFF', bold: true, align: 'CENTER', lineSpacing: 135 });
  }

  // --- על מה נתמקד ---
  var s4 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  setSlideBackground_(s4, pal, pal.bgAccent, bgFocus);
  buildPanelSlide_(s4, pal, titleFocus, summary.focusPoints);

  // --- סיום ---
  var s5 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  setSlideBackground_(s5, pal, pal.brand, bgClose);
  addScrim_(s5, '#20140C', 0.36);
  addTextBox_(s5, summary.encouragement || 'אתה בדרך הנכונה. אנחנו כאן איתך.', 60, 150, 600, 180, { size: 24, color: '#FFFFFF', bold: true, align: 'CENTER', lineSpacing: 130 });
  addTextBox_(s5, 'חוזרים לבראשית', 40, 350, 640, 30, { size: 14, color: '#FDEFE2', align: 'CENTER' });

  pres.saveAndClose();
  try { applyRtlBestEffort_(presId); } catch (e) { log_('    (דילוג על RTL מתקדם: ' + e + ')'); }

  var pdfName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + dateStr + '.pdf';
  var pdfBlob = DriveApp.getFileById(presId).getAs('application/pdf').setName(pdfName);
  var pdfFile = meetingFolder.createFile(pdfBlob);
  if (!CONFIG.KEEP_EDITABLE_DECK) DriveApp.getFileById(presId).setTrashed(true);
  else { try { meetingFolder.addFile(DriveApp.getFileById(presId)); } catch (e) {} }
  return pdfFile;
}

// שקופית תוכן עם פאנל קרם (כותרת + נקודות)
function buildPanelSlide_(slide, pal, title, items) {
  addPanel_(slide, pal, 55, 60, 610, 300);
  addTextBox_(slide, title, 75, 78, 570, 44, { size: 24, color: pal.brandDark, bold: true, align: 'END' });
  var y = 132;
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    if (it.heading) { addTextBox_(slide, '• ' + it.heading, 75, y, 570, 28, { size: 17, color: pal.brand, bold: true, align: 'END' }); y += 28; }
    if (it.text) { addTextBox_(slide, it.text, 90, y, 545, 46, { size: 14, color: pal.ink, align: 'END', lineSpacing: 118 }); y += 50; }
    y += 6;
  }
}

// ---------- עזרי עיצוב ----------
function setSlideBackground_(slide, pal, solidColor, imageBlob) {
  if (imageBlob) {
    try { slide.getBackground().setPictureFill(imageBlob); return; }
    catch (e) { log_('    (setPictureFill נכשל, רקע צבע: ' + e + ')'); }
  }
  slide.getBackground().setSolidFill(solidColor);
}

// פאנל קרם חצי-אטום לטקסט מעל התמונה
function addPanel_(slide, pal, x, y, w, h) {
  var panel = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  try { panel.getFill().setSolidFill(pal.bg, 0.92); } catch (e) { panel.getFill().setSolidFill(pal.bg); }
  panel.getBorder().setTransparent();
}

// שכבת כהות מעל תמונה כדי שטקסט לבן ייקרא
function addScrim_(slide, hexDark, opacity) {
  var scrim = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405);
  try { scrim.getFill().setSolidFill(hexDark, opacity); } catch (e) { scrim.getFill().setSolidFill(hexDark); }
  scrim.getBorder().setTransparent();
}

function addTextBox_(slide, text, x, y, w, h, opts) {
  opts = opts || {};
  var box = slide.insertTextBox(text || ' ', x, y, w, h);
  var range = box.getText();
  var style = range.getTextStyle();
  style.setForegroundColor(opts.color || '#3A2E26');
  style.setFontSize(opts.size || 14);
  if (opts.bold) style.setBold(true);
  style.setFontFamily('Arial');
  var align = opts.align === 'CENTER' ? SlidesApp.ParagraphAlignment.CENTER
            : opts.align === 'START' ? SlidesApp.ParagraphAlignment.START
            : SlidesApp.ParagraphAlignment.END;
  var para = range.getParagraphs();
  for (var i = 0; i < para.length; i++) {
    var ps = para[i].getRange().getParagraphStyle();
    ps.setParagraphAlignment(align);
    if (opts.lineSpacing) ps.setLineSpacing(opts.lineSpacing);
  }
  return box;
}

function applyRtlBestEffort_(presId) {
  if (typeof Slides === 'undefined') return;
  var pres = Slides.Presentations.get(presId);
  var requests = [];
  (pres.slides || []).forEach(function (slide) {
    (slide.pageElements || []).forEach(function (el) {
      if (el.shape && el.shape.text) {
        requests.push({ updateParagraphStyle: { objectId: el.objectId,
          style: { direction: 'RIGHT_TO_LEFT' }, fields: 'direction', textRange: { type: 'ALL' } } });
      }
    });
  });
  if (requests.length) Slides.Presentations.batchUpdate({ requests: requests }, presId);
}

function hashPick_(arr, seed) {
  var h = 0, s = String(seed);
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return arr[h % arr.length];
}

function log_(msg) { Logger.log(msg); console.log(msg); }

// ==========================================================================
//  עזרים לבדיקה
// ==========================================================================

// הרץ כדי לראות אילו מודלים (כולל תמונות) זמינים בחשבון שלך — כדי לעדכן IMAGE_MODEL.
function listImageModels() {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) { log_('שגיאה: ' + resp.getContentText()); return; }
  var data = JSON.parse(resp.getContentText());
  log_('=== מודלים זמינים (חפש כאלה עם "image" בשם) ===');
  (data.models || []).forEach(function (m) {
    var name = (m.name || '').replace('models/', '');
    var methods = (m.supportedGenerationMethods || []).join(',');
    if (name.toLowerCase().indexOf('image') !== -1 || (m.description || '').toLowerCase().indexOf('image') !== -1) {
      log_('★ ' + name + '   [' + methods + ']');
    } else {
      log_('  ' + name + '   [' + methods + ']');
    }
  });
}

// הרץ כדי לראות אילו מפגשים יזוהו (בלי ליצור כלום).
function dryRunListMeetings() {
  var meetings = CONFIG.TEST_MEETING_FOLDER_ID
    ? [{ folder: DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID), clientName: guessClientNameFromMeeting_(DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID)) }]
    : collectMeetingFolders_();
  log_('סה"כ תיקיות מפגש: ' + meetings.length);
  meetings.forEach(function (m) {
    var rec = findRecordingFile_(m.folder);
    log_('• ' + m.clientName + ' / ' + m.folder.getName() +
      '  | הקלטה: ' + (rec ? rec.getName() : 'אין') + '  | כבר יש סיכום: ' + (hasSummaryAlready_(m.folder) ? 'כן' : 'לא'));
  });
}
