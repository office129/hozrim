/**
 * חוזרים לבראשית — יצירת סיכום מפגש אוטומטי (מצגת PDF) מתוך הקלטת המפגש
 * ---------------------------------------------------------------------------
 * מה זה עושה:
 *   1. סורק את תיקיית הלקוחות בדרייב, נכנס לכל לקוח → "פגישות והקלטות" → תיקיית
 *      המפגש הספציפי.
 *   2. מוצא את קובץ ההקלטה (mp4 / m4a) בתוך תיקיית המפגש.
 *   3. מעלה את ההקלטה ל-Gemini (File API), ומבקש ממנו סיכום חם בסגנון הבית של
 *      "חוזרים לבראשית" — וגם *החלטות עיצוב* (פלטת צבעים, פריסה, מוטיב, כותרות),
 *      כדי שכל מצגת תצא שונה ויצירתית, אך תמיד באותה תחושת בית.
 *   4. בונה מצגת Google Slides לפי אותן החלטות, מייצא כ-PDF, ושומר את ה-PDF
 *      *באותה תיקיית מפגש*. האפליקציה כבר קולטת אוטומטית כל PDF שמופיע שם, אז
 *      משם זה מגיע ללקוח לבד.
 *
 * חשוב: כדי לא "להתפרץ" על כל הלקוחות בהרצה הראשונה, יש מנגנון בטיחות —
 *   MAX_MEETINGS_PER_RUN=1 ו/או TEST_MEETING_FOLDER_ID — כדי שתראה מצגת אחת
 *   ראשונה, תאשר, ורק אז תסיר את ההגבלה.
 *
 * דדופ: מפגש שכבר יש בתיקייה שלו קובץ עם המילה "סיכום" בשם — יידלג. אין כפילויות.
 */

// ==========================================================================
//  הגדרות — ערוך כאן
// ==========================================================================
var CONFIG = {
  // מפתח ה-API של Gemini (Google AI Studio → Get API key)
  GEMINI_API_KEY: 'PASTE_YOUR_GEMINI_API_KEY_HERE',

  // מודל Gemini. gemini-3.6-flash מהיר וזול ותומך בהבנת אודיו/וידאו.
  // אם רוצים איכות גבוהה יותר (איטי/יקר יותר) אפשר לנסות את גרסת ה-pro
  // המקבילה (למשל 'gemini-3.6-pro'), אם היא זמינה בחשבון שלך.
  GEMINI_MODEL: 'gemini-3.6-flash',

  // תיקיית השורש של הלקוחות בדרייב.
  // הכי אמין: הדבק כאן את ה-ID של התיקייה (מה שמופיע בקישור אחרי /folders/).
  // אם תשאיר ריק, הסקריפט יחפש לפי השם ROOT_FOLDER_NAME.
  ROOT_FOLDER_ID: '',
  ROOT_FOLDER_NAME: 'חוזרים לבראשית - לקוחות',

  // שם תת-התיקייה בתוך כל לקוח שמכילה את תיקיות המפגשים.
  MEETINGS_FOLDER_NAME: 'פגישות והקלטות',

  // מילה שמסמנת "כבר קיים סיכום" — קובץ שמכיל אותה בשם גורם לדילוג על המפגש.
  SUMMARY_MARKER: 'סיכום',

  // בטיחות להרצה הראשונה:
  // אם תמלא כאן ID של תיקיית מפגש ספציפית — יטופל *רק* המפגש הזה (מושלם לבדיקה).
  TEST_MEETING_FOLDER_ID: '',
  // כמה מפגשים לכל היותר לטפל בהרצה אחת. 1 = מצגת אחת בכל הרצה.
  // כשתהיה מרוצה מהתוצאה, אפשר להעלות (למשל 20) או להגדיל מאוד.
  MAX_MEETINGS_PER_RUN: 1,

  // האם להשאיר את קובץ ה-Slides הניתן לעריכה בתיקייה (בנוסף ל-PDF).
  // false = נשמר רק ה-PDF (המצגת הזמנית נמחקת אחרי הייצוא).
  KEEP_EDITABLE_DECK: false,

  // גודל מקטע (chunk) בהעלאה ל-Gemini. 8MB — הסף הבטוח לזיכרון של Apps Script
  // (המרת המקטע לבייטים תופסת פי כמה בזיכרון; ערכים גבוהים גורמים ל-Out of memory).
  // חייב להיות כפולה של 256KB. אל תשנה אלא אם באמת צריך.
  CHUNK_SIZE: 8 * 1024 * 1024,
};

// ==========================================================================
//  מאגר פלטות צבעים חמות — Gemini בוחר אחת לכל מצגת (או נבחרת אקראית לפי המפגש)
// ==========================================================================
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

// אפשרויות פריסה ומוטיב שהקוד יודע לצייר (Gemini בוחר מתוכן).
var LAYOUTS = ['centered', 'side_accent', 'banded', 'minimal'];
var MOTIFS = ['sun', 'mountain', 'seed', 'path', 'none'];

// ==========================================================================
//  נקודת כניסה ראשית — הרץ את זה (ידנית או מטריגר מתוזמן)
// ==========================================================================
function generateMeetingSummaries() {
  var startedAt = new Date();
  log_('=== התחלת ריצה: יצירת סיכומי מפגשים ===');

  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY.indexOf('PASTE_') === 0) {
    throw new Error('חסר GEMINI_API_KEY בהגדרות (CONFIG).');
  }

  // 1) איסוף תיקיות המפגשים לטיפול
  var meetings;
  if (CONFIG.TEST_MEETING_FOLDER_ID) {
    var testFolder = DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID);
    meetings = [{ folder: testFolder, clientName: guessClientNameFromMeeting_(testFolder) }];
    log_('מצב בדיקה: מטפל רק בתיקייה ' + testFolder.getName());
  } else {
    meetings = collectMeetingFolders_();
    log_('נמצאו ' + meetings.length + ' תיקיות מפגש לבדיקה.');
  }

  // 2) סינון: דלג על מה שכבר יש בו סיכום
  var pending = [];
  for (var i = 0; i < meetings.length; i++) {
    if (hasSummaryAlready_(meetings[i].folder)) continue; // כבר קיים סיכום — דילוג שקט
    pending.push(meetings[i]);
  }
  log_('מתוכם ' + pending.length + ' ללא סיכום עדיין.');

  // 3) טיפול, עד המגבלה
  var processed = 0, created = 0, failed = 0;
  for (var j = 0; j < pending.length; j++) {
    if (processed >= CONFIG.MAX_MEETINGS_PER_RUN) {
      log_('הגעתי למגבלת ' + CONFIG.MAX_MEETINGS_PER_RUN + ' מפגשים להרצה — עוצר. שאר המפגשים יטופלו בהרצה הבאה.');
      break;
    }
    var m = pending[j];
    processed++;
    try {
      log_('--- מטפל במפגש: ' + m.folder.getName() + ' (לקוח: ' + m.clientName + ') ---');
      var ok = processMeeting_(m.folder, m.clientName);
      if (ok) created++;
    } catch (err) {
      failed++;
      log_('!! שגיאה במפגש "' + m.folder.getName() + '": ' + (err && err.stack ? err.stack : err));
      // ממשיכים למפגש הבא — כישלון אחד לא מפיל את כל הריצה
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
      while (subMeetings.hasNext()) {
        results.push({ folder: subMeetings.next(), clientName: clientName });
      }
    }
  }
  return results;
}

function getRootFolder_() {
  if (CONFIG.ROOT_FOLDER_ID) return DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  var it = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (!it.hasNext()) {
    throw new Error('לא נמצאה תיקיית שורש בשם "' + CONFIG.ROOT_FOLDER_NAME + '". מלא ROOT_FOLDER_ID בהגדרות.');
  }
  return it.next();
}

// חיפוש תיקיות לפי שם עד עומק maxDepth (כדי לא להיות תלוי במבנה מדויק)
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

function cleanClientName_(folderName) {
  return String(folderName || '').trim();
}

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
    var isAudioVideo =
      mime === 'video/mp4' || mime === 'audio/mp4' || mime === 'audio/x-m4a' ||
      mime === 'audio/mpeg' || mime === 'video/quicktime' ||
      /\.(mp4|m4a|mov|mp3|wav|aac|webm)$/.test(name);
    if (isAudioVideo) candidates.push(f);
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
  if (!recording) {
    log_('  אין קובץ הקלטה בתיקייה — מדלג.');
    return false;
  }
  log_('  הקלטה: ' + recording.getName() + ' (' + Math.round(recording.getSize() / 1024 / 1024) + 'MB)');

  var uploaded = uploadFileToGemini_(recording);
  log_('  הועלה ל-Gemini: ' + uploaded.uri);

  var summary = requestSummaryFromGemini_(uploaded, clientName);
  log_('  התקבל סיכום: "' + (summary.title || '') + '" | עיצוב: ' +
    (summary.design ? (summary.design.paletteName + '/' + summary.design.layout + '/' + summary.design.motif) : '(אקראי)'));

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
  var displayName = driveFile.getName();

  var startResp = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY),
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(totalSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      payload: JSON.stringify({ file: { display_name: displayName } }),
    }
  );
  if (startResp.getResponseCode() >= 300) {
    throw new Error('Gemini upload start נכשל: ' + startResp.getResponseCode() + ' ' + startResp.getContentText());
  }
  var uploadUrl = startResp.getHeaders()['X-Goog-Upload-URL'] || startResp.getHeaders()['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('לא התקבל X-Goog-Upload-URL מ-Gemini.');

  var token = ScriptApp.getOAuthToken();
  var offset = 0;
  var lastResponse = null;
  while (offset < totalSize) {
    var end = Math.min(offset + CONFIG.CHUNK_SIZE, totalSize) - 1; // inclusive
    var chunkBytes = downloadDriveRange_(fileId, offset, end, token);
    var isLast = (end + 1) >= totalSize;

    var putResp = UrlFetchApp.fetch(uploadUrl, {
      method: 'post',
      muteHttpExceptions: true,
      headers: {
        'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
        'X-Goog-Upload-Offset': String(offset),
      },
      contentType: 'application/octet-stream',
      payload: chunkBytes,
    });
    if (putResp.getResponseCode() >= 300) {
      throw new Error('Gemini upload chunk נכשל (offset ' + offset + '): ' + putResp.getResponseCode() + ' ' + putResp.getContentText());
    }
    lastResponse = putResp;
    offset = end + 1;
    log_('    הועלה ' + Math.round(offset / 1024 / 1024) + 'MB / ' + Math.round(totalSize / 1024 / 1024) + 'MB');
  }

  var info = JSON.parse(lastResponse.getContentText());
  var file = info.file || info;
  if (!file || !file.uri) throw new Error('תשובת סיום ההעלאה חסרה uri: ' + lastResponse.getContentText());

  file = waitForGeminiFileActive_(file.name || (file.uri.split('/').pop() ? 'files/' + file.uri.split('/').pop() : ''));
  return { uri: file.uri, name: file.name, mimeType: mimeType };
}

function downloadDriveRange_(fileId, startByte, endByte, token) {
  var resp = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true',
    {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Range: 'bytes=' + startByte + '-' + endByte },
    }
  );
  var code = resp.getResponseCode();
  if (code !== 206 && code !== 200) {
    throw new Error('קריאת מקטע מהדרייב נכשלה: ' + code + ' ' + resp.getContentText());
  }
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
    Utilities.sleep(3000); // עדיין PROCESSING — המתן
  }
  throw new Error('Gemini לא סיים לעבד את הקובץ בזמן סביר.');
}

function deleteGeminiFile_(fileName) {
  if (!fileName) return;
  UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/' + fileName + '?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY),
    { method: 'delete', muteHttpExceptions: true }
  );
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
//  Gemini — בקשת הסיכום + החלטות העיצוב (פלט JSON מובנה)
// ==========================================================================
function requestSummaryFromGemini_(uploaded, clientName) {
  var who = clientName || 'הלקוח';
  var styleInstruction =
    'תכין מצגת עם תחושה של בית, חום ושל "אתה לא לבד", יש תקווה, אתה בדרך הנכונה. ' +
    'שים דגש על מה ש' + who + ' גילה בטיפול ומה הנקודות שהוא צריך להתמקד בהם השבוע.';

  var prompt =
    'זו הקלטה של מפגש אימון/טיפול אישי במסגרת "חוזרים לבראשית". ' +
    'האזן היטב לכל השיחה (בעברית) והפק סיכום אישי, חם ומכבד, שמופנה ישירות אל ' + who + '. ' +
    styleInstruction + '\n\n' +
    'כללים לתוכן:\n' +
    '- כתוב בגוף שני, בעברית, בטון חם, אישי ומעודד — כאילו יוסף עצמו כותב ל' + who + '.\n' +
    '- אל תמציא פרטים שלא נאמרו במפגש. אם משהו לא ברור, כתוב בכלליות ובעדינות.\n' +
    '- "discoveries" = תובנות/גילויים אמיתיים שעלו במפגש (2–4 נקודות).\n' +
    '- "focusPoints" = על מה כדאי להתמקד ולתרגל השבוע (2–4 נקודות מעשיות).\n' +
    '- "highlightQuote" = משפט/אמירה קצרה אחת שבלטה במפגש וכדאי לזכור (אם אין — השאר ריק).\n' +
    '- שמור על אורך קצר וממוקד בכל נקודה (משפט או שניים).\n\n' +
    'החלטות עיצוב (design) — אתה המעצב של המצגת הזו. בחר עיצוב שמתאים לאווירה ולתוכן של *המפגש הזה דווקא*, ' +
    'כדי שכל מצגת תיראה שונה ויצירתית (אבל תמיד חמה וביתית):\n' +
    '- "paletteName": בחר אחת מ- ' + PALETTE_NAMES.join(', ') + '.\n' +
    '- "layout": בחר אחד מ- ' + LAYOUTS.join(', ') + '.\n' +
    '- "motif": בחר אחד מ- ' + MOTIFS.join(', ') + ' (עיטור עדין שמתאים לתחושה).\n' +
    '- "sectionTitleDiscoveries" ו-"sectionTitleFocus": נסח כותרות סקשן חמות ומקוריות בעברית ' +
    '(לא תמיד אותן מילים) — למשל "מה שהתחיל להאיר", "הצעד הקרוב שלך", וכד\'.\n' +
    '- "moodWord": מילה אחת בעברית שמתמצתת את תחושת המפגש (למשל "פתיחות", "אומץ", "רוגע").';

  var sectionArray = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: { heading: { type: 'STRING' }, text: { type: 'STRING' } },
      required: ['heading', 'text'],
    },
  };

  var schema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'כותרת קצרה וחמה למצגת' },
      greeting: { type: 'STRING', description: 'פסקת פתיחה חמה ואישית' },
      discoveries: sectionArray,
      focusPoints: sectionArray,
      highlightQuote: { type: 'STRING', description: 'משפט בולט אחד מהמפגש, או ריק' },
      encouragement: { type: 'STRING', description: 'משפט חיזוק לסיום' },
      design: {
        type: 'OBJECT',
        properties: {
          paletteName: { type: 'STRING', enum: PALETTE_NAMES },
          layout: { type: 'STRING', enum: LAYOUTS },
          motif: { type: 'STRING', enum: MOTIFS },
          sectionTitleDiscoveries: { type: 'STRING' },
          sectionTitleFocus: { type: 'STRING' },
          moodWord: { type: 'STRING' },
        },
        required: ['paletteName', 'layout', 'motif', 'sectionTitleDiscoveries', 'sectionTitleFocus'],
      },
    },
    required: ['title', 'greeting', 'discoveries', 'focusPoints', 'encouragement', 'design'],
  };

  var body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.85 },
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(CONFIG.GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(CONFIG.GEMINI_API_KEY);

  // ניסיון חוזר על עומס זמני (429/5xx) — בלי להעלות מחדש את הקובץ.
  var resp = null;
  var maxAttempts = 5; // ניסיון ראשון + עד 4 חוזרים
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    });
    var code = resp.getResponseCode();
    if (code < 300) break; // הצלחה
    var retryable = (code === 429 || code === 500 || code === 502 || code === 503 || code === 504);
    if (!retryable || attempt === maxAttempts) {
      throw new Error('Gemini generateContent נכשל: ' + code + ' ' + resp.getContentText());
    }
    var waitSec = 10 * attempt; // 10, 20, 30, 40 שניות
    log_('    Gemini עמוס כרגע (' + code + ') — ממתין ' + waitSec + ' שניות ומנסה שוב (ניסיון ' + attempt + '/' + (maxAttempts - 1) + ')…');
    Utilities.sleep(waitSec * 1000);
  }

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
  return parsed;
}

// ==========================================================================
//  בניית מצגת Google Slides + ייצוא PDF — לפי החלטות העיצוב של Gemini
// ==========================================================================
function buildSlidesAndExportPdf_(summary, clientName, meetingLabel, meetingFolder) {
  var seed = (clientName || '') + '|' + (meetingLabel || '');
  var design = summary.design || {};
  var pal = PALETTES[design.paletteName] || PALETTES[hashPick_(PALETTE_NAMES, seed)];
  var layout = (LAYOUTS.indexOf(design.layout) !== -1) ? design.layout : hashPick_(LAYOUTS, seed + 'L');
  var motif = (MOTIFS.indexOf(design.motif) !== -1) ? design.motif : hashPick_(MOTIFS, seed + 'M');
  var titleDisc = design.sectionTitleDiscoveries || 'מה גילית בתהליך';
  var titleFocus = design.sectionTitleFocus || 'על מה נתמקד השבוע';
  var moodWord = design.moodWord || '';

  var deckName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + meetingLabel;
  var pres = SlidesApp.create(deckName);
  var presId = pres.getId();
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');

  // שקופית שער (משתמשים בשקופית הריקה הראשונה)
  var cover = pres.getSlides()[0];
  cover.getPageElements().forEach(function (el) { el.remove(); });
  buildCover_(cover, pal, layout, motif, summary.title, clientName, dateStr, moodWord);

  // פתיח חם
  if (summary.greeting) {
    var s2 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    buildContentBase_(s2, pal, layout, motif, 'כמה מילים מהלב', false);
    addTextBox_(s2, summary.greeting, 60, 150, 600, 250, {
      size: 18, color: pal.ink, align: SlidesApp.ParagraphAlignment.END, lineSpacing: 130,
    });
  }

  // מה גילית בתהליך
  var s3 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  buildContentBase_(s3, pal, layout, motif, titleDisc, false);
  addBullets_(s3, pal, summary.discoveries);

  // ציטוט בולט (אם יש) — שקופית מודגשת
  if (summary.highlightQuote) {
    var sq = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    paintBackground_(sq, pal.brandDark);
    drawMotif_(sq, pal, motif);
    addTextBox_(sq, '“' + summary.highlightQuote + '”', 70, 150, 580, 180, {
      size: 26, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.CENTER, lineSpacing: 135,
    });
  }

  // על מה נתמקד השבוע (רקע מודגש מעט)
  var s4 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  buildContentBase_(s4, pal, layout, motif, titleFocus, true);
  addBullets_(s4, pal, summary.focusPoints);

  // סיום
  var s5 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  paintBackground_(s5, pal.brand);
  drawMotif_(s5, pal, motif);
  addTextBox_(s5, summary.encouragement || 'אתה בדרך הנכונה. אנחנו כאן איתך.', 60, 150, 600, 180, {
    size: 24, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.CENTER, lineSpacing: 130,
  });
  addTextBox_(s5, 'חוזרים לבראשית', 40, 355, 640, 30, {
    size: 14, color: pal.coverText, align: SlidesApp.ParagraphAlignment.CENTER,
  });

  pres.saveAndClose();

  try { applyRtlBestEffort_(presId); } catch (e) { log_('    (דילוג על RTL מתקדם: ' + e + ')'); }

  var pdfName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + dateStr + '.pdf';
  var pdfBlob = DriveApp.getFileById(presId).getAs('application/pdf').setName(pdfName);
  var pdfFile = meetingFolder.createFile(pdfBlob);

  if (!CONFIG.KEEP_EDITABLE_DECK) {
    DriveApp.getFileById(presId).setTrashed(true);
  } else {
    try { meetingFolder.addFile(DriveApp.getFileById(presId)); } catch (e) {}
  }
  return pdfFile;
}

// ---------- בסיס שקופית שער, לפי layout ----------
function buildCover_(slide, pal, layout, motif, title, clientName, dateStr, moodWord) {
  paintBackground_(slide, pal.brand);
  drawMotif_(slide, pal, motif);

  if (layout === 'side_accent') {
    var band = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 640, 0, 80, 405);
    band.getFill().setSolidFill(pal.brandDark); band.getBorder().setTransparent();
  } else if (layout === 'banded') {
    var strip = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 175, 720, 120);
    strip.getFill().setSolidFill(pal.brandDark); strip.getBorder().setTransparent();
  } else if (layout !== 'minimal') {
    addGoldBar_(slide, pal);
  }

  addTextBox_(slide, 'חוזרים לבראשית', 40, 120, 640, 34, {
    size: 16, color: pal.coverText, bold: true, align: SlidesApp.ParagraphAlignment.CENTER,
  });
  addTextBox_(slide, title, 40, 195, 640, 100, {
    size: 34, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.CENTER,
  });
  var sub = (clientName ? clientName + '  •  ' : '') + dateStr + (moodWord ? '  •  ' + moodWord : '');
  addTextBox_(slide, sub, 40, 315, 640, 30, {
    size: 15, color: pal.coverText, align: SlidesApp.ParagraphAlignment.CENTER,
  });
}

// ---------- בסיס שקופית תוכן, לפי layout ----------
function buildContentBase_(slide, pal, layout, motif, title, emphasized) {
  paintBackground_(slide, emphasized ? pal.bgAccent : pal.bg);
  drawMotif_(slide, pal, motif);

  if (layout === 'side_accent') {
    var band = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 690, 0, 30, 405);
    band.getFill().setSolidFill(pal.brand); band.getBorder().setTransparent();
    addSectionTitle_(slide, pal, title, 'right');
  } else if (layout === 'banded') {
    var strip = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 40, 720, 66);
    strip.getFill().setSolidFill(pal.brand); strip.getBorder().setTransparent();
    addTextBox_(slide, title, 60, 52, 600, 44, {
      size: 24, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.END,
    });
  } else if (layout === 'minimal') {
    addSectionTitle_(slide, pal, title, 'plain');
  } else { // centered
    addGoldBar_(slide, pal);
    addSectionTitle_(slide, pal, title, 'underline');
  }
}

// ---------- עזרי עיצוב ----------
function paintBackground_(slide, hexColor) {
  slide.getBackground().setSolidFill(hexColor);
}

function addGoldBar_(slide, pal) {
  var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 392, 720, 6);
  bar.getFill().setSolidFill(pal.gold); bar.getBorder().setTransparent();
}

function addSectionTitle_(slide, pal, title, style) {
  addTextBox_(slide, title, 60, 55, 600, 50, {
    size: 26, color: pal.brandDark, bold: true, align: SlidesApp.ParagraphAlignment.END,
  });
  if (style === 'underline') {
    var line = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 500, 108, 160, 3);
    line.getFill().setSolidFill(pal.gold); line.getBorder().setTransparent();
  }
}

function addBullets_(slide, pal, items) {
  var y = 140;
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    if (it.heading) {
      addTextBox_(slide, '• ' + it.heading, 60, y, 600, 30, {
        size: 18, color: pal.brand, bold: true, align: SlidesApp.ParagraphAlignment.END,
      });
      y += 30;
    }
    if (it.text) {
      addTextBox_(slide, it.text, 80, y, 560, 50, {
        size: 15, color: pal.ink, align: SlidesApp.ParagraphAlignment.END, lineSpacing: 120,
      });
      y += 56;
    }
    y += 8;
  }
}

// מוטיב עדין — צורה דקורטיבית קטנה בפינה (best-effort, לא מפיל אם צורה לא נתמכת)
function drawMotif_(slide, pal, motif) {
  if (!motif || motif === 'none') return;
  try {
    if (motif === 'sun') {
      var c = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, 40, 40, 70, 70);
      c.getFill().setSolidFill(pal.gold); c.getBorder().setTransparent();
      c.setTransparency ? null : null;
    } else if (motif === 'mountain') {
      var t1 = slide.insertShape(SlidesApp.ShapeType.TRIANGLE, 30, 300, 90, 70);
      t1.getFill().setSolidFill(pal.gold); t1.getBorder().setTransparent();
      var t2 = slide.insertShape(SlidesApp.ShapeType.TRIANGLE, 80, 320, 70, 50);
      t2.getFill().setSolidFill(pal.brandDark); t2.getBorder().setTransparent();
    } else if (motif === 'seed') {
      var e = slide.insertShape(SlidesApp.ShapeType.TEARDROP, 45, 45, 50, 60);
      e.getFill().setSolidFill(pal.gold); e.getBorder().setTransparent();
    } else if (motif === 'path') {
      for (var i = 0; i < 5; i++) {
        var d = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, 40 + i * 26, 340 - i * 8, 12, 12);
        d.getFill().setSolidFill(pal.gold); d.getBorder().setTransparent();
      }
    }
  } catch (e) {
    // צורה לא נתמכת בגרסה זו — פשוט מדלגים על העיטור
  }
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
  var para = range.getParagraphs();
  for (var i = 0; i < para.length; i++) {
    var ps = para[i].getRange().getParagraphStyle();
    ps.setParagraphAlignment(opts.align || SlidesApp.ParagraphAlignment.END);
    if (opts.lineSpacing) ps.setLineSpacing(opts.lineSpacing);
  }
  return box;
}

// כיווניות RTL אמיתית דרך Slides Advanced Service (best-effort)
function applyRtlBestEffort_(presId) {
  if (typeof Slides === 'undefined') return;
  var pres = Slides.Presentations.get(presId);
  var requests = [];
  (pres.slides || []).forEach(function (slide) {
    (slide.pageElements || []).forEach(function (el) {
      if (el.shape && el.shape.text) {
        requests.push({
          updateParagraphStyle: {
            objectId: el.objectId,
            style: { direction: 'RIGHT_TO_LEFT' },
            fields: 'direction',
            textRange: { type: 'ALL' },
          },
        });
      }
    });
  });
  if (requests.length) Slides.Presentations.batchUpdate({ requests: requests }, presId);
}

// בחירה יציבה ("אקראית אך קבועה למפגש") מתוך רשימה, לפי מחרוזת seed
function hashPick_(arr, seed) {
  var h = 0, s = String(seed);
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff; }
  return arr[h % arr.length];
}

// ==========================================================================
//  לוג
// ==========================================================================
function log_(msg) {
  Logger.log(msg);
  console.log(msg);
}

// ==========================================================================
//  עזר לבדיקה ידנית — הרץ כדי לראות אילו מפגשים יזוהו (בלי ליצור כלום)
// ==========================================================================
function dryRunListMeetings() {
  var meetings = CONFIG.TEST_MEETING_FOLDER_ID
    ? [{ folder: DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID), clientName: guessClientNameFromMeeting_(DriveApp.getFolderById(CONFIG.TEST_MEETING_FOLDER_ID)) }]
    : collectMeetingFolders_();
  log_('סה"כ תיקיות מפגש: ' + meetings.length);
  meetings.forEach(function (m) {
    var rec = findRecordingFile_(m.folder);
    var has = hasSummaryAlready_(m.folder);
    log_('• ' + m.clientName + ' / ' + m.folder.getName() +
      '  | הקלטה: ' + (rec ? rec.getName() : 'אין') +
      '  | כבר יש סיכום: ' + (has ? 'כן' : 'לא'));
  });
}
