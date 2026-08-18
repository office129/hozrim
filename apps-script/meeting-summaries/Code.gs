/**
 * חוזרים לבראשית — יצירת סיכום מפגש אוטומטי (מצגת PDF) מתוך הקלטת המפגש
 * ---------------------------------------------------------------------------
 * מה זה עושה:
 *   1. סורק את תיקיית הלקוחות בדרייב, נכנס לכל לקוח → "פגישות והקלטות" → תיקיית
 *      המפגש הספציפי.
 *   2. מוצא את קובץ ההקלטה (mp4 / m4a) בתוך תיקיית המפגש.
 *   3. מעלה את ההקלטה ל-Gemini (File API), ומבקש ממנו סיכום חם בסגנון הבית של
 *      "חוזרים לבראשית", עם דגש על מה שהלקוח גילה ועל מה להתמקד השבוע.
 *   4. בונה מצגת Google Slides חמה, מייצא אותה כ-PDF, ושומר את ה-PDF *באותה
 *      תיקיית מפגש*. האפליקציה כבר קולטת אוטומטית כל PDF שמופיע בתיקיית המפגש,
 *      אז משם זה מגיע ללקוח לבד.
 *
 * חשוב: כדי לא "להתפרץ" על כל הלקוחות בהרצה הראשונה, יש כאן מנגנון בטיחות —
 *   MAX_MEETINGS_PER_RUN=1 ו/או TEST_MEETING_FOLDER_ID — כך שתוכל לראות מצגת
 *   אחת ראשונה, לאשר את התוצאה, ורק אז להסיר את ההגבלה.
 *
 * דדופ: מפגש שכבר יש בתיקייה שלו קובץ עם המילה "סיכום" בשם — יידלג. אין כפילויות.
 */

// ==========================================================================
//  הגדרות — ערוך כאן
// ==========================================================================
var CONFIG = {
  // מפתח ה-API של Gemini (Google AI Studio → Get API key)
  GEMINI_API_KEY: 'PASTE_YOUR_GEMINI_API_KEY_HERE',

  // מודל Gemini. gemini-2.5-flash מהיר וזול ותומך בהבנת אודיו/וידאו.
  // אפשר גם 'gemini-2.5-pro' לאיכות גבוהה יותר (איטי/יקר יותר).
  GEMINI_MODEL: 'gemini-2.5-flash',

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

  // גודל מקטע (chunk) בהעלאה ל-Gemini. 8MB. אל תשנה אלא אם יש בעיה.
  CHUNK_SIZE: 8 * 1024 * 1024,
};

// פלטת הצבעים החמה של המצגת
var THEME = {
  bg:        '#FBF6EE', // קרם
  bgAccent:  '#F3E7D6', // חול חם
  brand:     '#C0603A', // טרהקוטה
  brandDark: '#8F3F22',
  gold:      '#C9A34E', // זהב
  ink:       '#3A2E26', // חום כהה לטקסט
  inkSoft:   '#6B5A4C',
};

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
    if (hasSummaryAlready_(meetings[i].folder)) {
      continue; // כבר קיים סיכום — דילוג שקט
    }
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
    // מצא את תת-התיקייה "פגישות והקלטות" בתוך הלקוח (בכל עומק סביר)
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
  if (CONFIG.ROOT_FOLDER_ID) {
    return DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  }
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
  // תיקיית מפגש → הורה "פגישות והקלטות" → הורה = תיקיית הלקוח
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
  // שם תיקיית הלקוח לרוב הוא פשוט השם. מסיר רווחים מיותרים.
  return String(folderName || '').trim();
}

// ==========================================================================
//  דדופ + מציאת הקלטה
// ==========================================================================
function hasSummaryAlready_(meetingFolder) {
  var files = meetingFolder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(CONFIG.SUMMARY_MARKER) !== -1) return true;
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
  // אם יש כמה — קח את הגדול ביותר (סביר שזו ההקלטה המלאה)
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

  // 1) העלאה ל-Gemini
  var uploaded = uploadFileToGemini_(recording);
  log_('  הועלה ל-Gemini: ' + uploaded.uri);

  // 2) בקשת סיכום מובנה
  var summary = requestSummaryFromGemini_(uploaded, clientName);
  log_('  התקבל סיכום: "' + (summary.title || '') + '"');

  // 3) בניית מצגת + ייצוא PDF
  var meetingLabel = meetingFolder.getName();
  var pdf = buildSlidesAndExportPdf_(summary, clientName, meetingLabel, meetingFolder);
  log_('  נוצר PDF: ' + pdf.getName());

  // 4) ניקוי הקובץ שהועלה ל-Gemini (לא חובה, אך מסודר)
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

  // שלב START — מקבל URL להעלאה
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

  // שלבי UPLOAD — קורא מקטע מהדרייב (Range) ומעלה, בלי לטעון את כל הקובץ לזיכרון
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

  // המתנה עד שהקובץ ACTIVE (Gemini מעבד מדיה לפני שאפשר לשאול עליה)
  file = waitForGeminiFileActive_(file.name || (file.uri.split('/').pop() ? 'files/' + file.uri.split('/').pop() : ''));
  return { uri: file.uri, name: file.name, mimeType: mimeType };
}

function downloadDriveRange_(fileId, startByte, endByte, token) {
  var resp = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true',
    {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + token,
        Range: 'bytes=' + startByte + '-' + endByte,
      },
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
    if (resp.getResponseCode() >= 300) {
      throw new Error('בדיקת מצב קובץ Gemini נכשלה: ' + resp.getContentText());
    }
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
  // Gemini מעדיף mime types מדויקים; נרמל כמה מקרים נפוצים
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
//  Gemini — בקשת הסיכום (פלט JSON מובנה)
// ==========================================================================
function requestSummaryFromGemini_(uploaded, clientName) {
  var styleInstruction =
    'תכין מצגת עם תחושה של בית, חום ושל "אתה לא לבד", יש תקווה, אתה בדרך הנכונה. ' +
    'שים דגש על מה ש' + (clientName || 'הלקוח') + ' גילה בטיפול ומה הנקודות שהוא צריך להתמקד בהם השבוע.';

  var prompt =
    'זו הקלטה של מפגש אימון/טיפול אישי במסגרת "חוזרים לבראשית". ' +
    'האזן היטב לכל השיחה (בעברית) והפק סיכום אישי, חם ומכבד, שמופנה ישירות אל ' + (clientName || 'הלקוח') + '. ' +
    styleInstruction + '\n\n' +
    'כללים לכתיבה:\n' +
    '- כתוב בגוף שני, בעברית, בטון חם, אישי ומעודד — כאילו יוסף עצמו כותב ל' + (clientName || 'הלקוח') + '.\n' +
    '- אל תמציא פרטים שלא נאמרו במפגש. אם משהו לא ברור, כתוב בכלליות ובעדינות.\n' +
    '- "discoveries" = תובנות/גילויים אמיתיים שעלו במפגש (2–4 נקודות).\n' +
    '- "focusPoints" = על מה כדאי להתמקד ולתרגל השבוע (2–4 נקודות מעשיות).\n' +
    '- שמור על אורך קצר וממוקד בכל נקודה (משפט או שניים).';

  var schema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'כותרת קצרה וחמה למצגת' },
      greeting: { type: 'STRING', description: 'פסקת פתיחה חמה ואישית' },
      discoveries: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            heading: { type: 'STRING' },
            text: { type: 'STRING' },
          },
          required: ['heading', 'text'],
        },
      },
      focusPoints: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            heading: { type: 'STRING' },
            text: { type: 'STRING' },
          },
          required: ['heading', 'text'],
        },
      },
      encouragement: { type: 'STRING', description: 'משפט חיזוק לסיום' },
    },
    required: ['title', 'greeting', 'discoveries', 'focusPoints', 'encouragement'],
  };

  var body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.7,
    },
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(CONFIG.GEMINI_MODEL) + ':generateContent?key=' +
    encodeURIComponent(CONFIG.GEMINI_API_KEY);

  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify(body),
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Gemini generateContent נכשל: ' + resp.getResponseCode() + ' ' + resp.getContentText());
  }

  var data = JSON.parse(resp.getContentText());
  var text = '';
  try {
    text = data.candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error('תשובת Gemini לא במבנה צפוי: ' + resp.getContentText());
  }
  var parsed = JSON.parse(text);
  // הגנות בסיסיות
  parsed.title = parsed.title || ('סיכום מפגש — ' + (clientName || ''));
  parsed.greeting = parsed.greeting || '';
  parsed.discoveries = parsed.discoveries || [];
  parsed.focusPoints = parsed.focusPoints || [];
  parsed.encouragement = parsed.encouragement || '';
  return parsed;
}

// ==========================================================================
//  בניית מצגת Google Slides + ייצוא PDF
// ==========================================================================
function buildSlidesAndExportPdf_(summary, clientName, meetingLabel, meetingFolder) {
  var deckName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + meetingLabel;
  var pres = SlidesApp.create(deckName);
  var presId = pres.getId();

  // המצגת נוצרת עם שקופית ריקה אחת — נשתמש בה כשער
  var slides = pres.getSlides();
  var cover = slides[0];
  cover.getPageElements().forEach(function (el) { el.remove(); }); // ניקוי placeholders

  var dateStr = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');

  // --- שקופית שער ---
  paintBackground_(cover, THEME.brand);
  addGoldBar_(cover);
  addTextBox_(cover, 'חוזרים לבראשית', 40, 150, 640, 40, {
    size: 16, color: '#FDEFE2', bold: true, align: SlidesApp.ParagraphAlignment.CENTER,
  });
  addTextBox_(cover, summary.title, 40, 200, 640, 100, {
    size: 34, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.CENTER,
  });
  addTextBox_(cover, (clientName ? clientName + '  •  ' : '') + dateStr, 40, 320, 640, 30, {
    size: 15, color: '#FDEFE2', align: SlidesApp.ParagraphAlignment.CENTER,
  });

  // --- שקופית פתיח חם ---
  if (summary.greeting) {
    var s2 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
    paintBackground_(s2, THEME.bg);
    addGoldBar_(s2);
    addSectionTitle_(s2, 'כמה מילים מהלב');
    addTextBox_(s2, summary.greeting, 60, 140, 600, 280, {
      size: 18, color: THEME.ink, align: SlidesApp.ParagraphAlignment.END, lineSpacing: 130,
    });
  }

  // --- שקופית: מה גילית בתהליך ---
  var s3 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  paintBackground_(s3, THEME.bg);
  addGoldBar_(s3);
  addSectionTitle_(s3, 'מה גילית בתהליך');
  addBullets_(s3, summary.discoveries);

  // --- שקופית: על מה נתמקד השבוע ---
  var s4 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  paintBackground_(s4, THEME.bgAccent);
  addGoldBar_(s4);
  addSectionTitle_(s4, 'על מה נתמקד השבוע');
  addBullets_(s4, summary.focusPoints);

  // --- שקופית סיום ---
  var s5 = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  paintBackground_(s5, THEME.brand);
  addGoldBar_(s5);
  addTextBox_(s5, summary.encouragement || 'אתה בדרך הנכונה. אנחנו כאן איתך.', 60, 150, 600, 180, {
    size: 24, color: '#FFFFFF', bold: true, align: SlidesApp.ParagraphAlignment.CENTER, lineSpacing: 130,
  });
  addTextBox_(s5, 'חוזרים לבראשית', 40, 355, 640, 30, {
    size: 14, color: '#FDEFE2', align: SlidesApp.ParagraphAlignment.CENTER,
  });

  pres.saveAndClose();

  // ניסיון best-effort לכיווניות RTL דרך Slides API המתקדם (לא חובה)
  try { applyRtlBestEffort_(presId); } catch (e) { log_('    (דילוג על RTL מתקדם: ' + e + ')'); }

  // ייצוא ל-PDF ושמירה בתיקיית המפגש
  var pdfName = 'סיכום מפגש - ' + (clientName || '') + ' - ' + dateStr + '.pdf';
  var pdfBlob = DriveApp.getFileById(presId).getAs('application/pdf').setName(pdfName);
  var pdfFile = meetingFolder.createFile(pdfBlob);

  // ניקוי המצגת הזמנית אם לא רוצים לשמור גרסה לעריכה
  if (!CONFIG.KEEP_EDITABLE_DECK) {
    DriveApp.getFileById(presId).setTrashed(true);
  } else {
    // העבר את ה-Slides לתיקיית המפגש כדי שיהיה נגיש
    try { meetingFolder.addFile(DriveApp.getFileById(presId)); } catch (e) {}
  }

  return pdfFile;
}

// ---------- עזרי עיצוב שקופיות ----------
function paintBackground_(slide, hexColor) {
  slide.getBackground().setSolidFill(hexColor);
}

function addGoldBar_(slide) {
  // פס זהב דק בתחתית — נגיעת חום/עיצוב
  var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 392, 720, 6);
  bar.getFill().setSolidFill(THEME.gold);
  bar.getBorder().setTransparent();
}

function addSectionTitle_(slide, title) {
  addTextBox_(slide, title, 60, 55, 600, 50, {
    size: 26, color: THEME.brandDark, bold: true, align: SlidesApp.ParagraphAlignment.END,
  });
  // קו הפרדה קטן
  var line = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 500, 108, 160, 3);
  line.getFill().setSolidFill(THEME.gold);
  line.getBorder().setTransparent();
}

function addBullets_(slide, items) {
  var y = 140;
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var heading = it.heading || '';
    var text = it.text || '';
    if (heading) {
      addTextBox_(slide, '• ' + heading, 60, y, 600, 30, {
        size: 18, color: THEME.brand, bold: true, align: SlidesApp.ParagraphAlignment.END,
      });
      y += 30;
    }
    if (text) {
      addTextBox_(slide, text, 80, y, 560, 50, {
        size: 15, color: THEME.ink, align: SlidesApp.ParagraphAlignment.END, lineSpacing: 120,
      });
      y += 56;
    }
    y += 8;
  }
}

function addTextBox_(slide, text, x, y, w, h, opts) {
  opts = opts || {};
  var box = slide.insertTextBox(text || ' ', x, y, w, h);
  var range = box.getText();
  var style = range.getTextStyle();
  style.setForegroundColor(opts.color || THEME.ink);
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
  if (typeof Slides === 'undefined') return; // השירות המתקדם לא הופעל
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
  if (requests.length) {
    Slides.Presentations.batchUpdate({ requests: requests }, presId);
  }
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
