/**
 * בדיקה: האם Nano Banana Pro (gemini-3-pro-image) מצייר שקופית מלאה עם טקסט
 * עברי קריא — בסגנון החם של "חוזרים לבראשית".
 *
 * שימוש:
 *   1. הדבק את הקוד בקובץ חדש בפרויקט Apps Script (Files → +  → Script),
 *      או בפרויקט חדש.
 *   2. מלא GEMINI_API_KEY (אותו מפתח מהסקריפט הראשי).
 *   3. בחר את הפונקציה testOneSlideImage ולחץ Run ▶.
 *   4. פתח את הדרייב (My Drive) — יופיע קובץ "בדיקת שקופית - חוזרים לבראשית.png".
 *      תשלח לי אותו ונראה איך העברית יצאה.
 *
 * (אם תרצה שהתמונה תישמר בתיקייה מסוימת, הדבק את ה-ID שלה ב-OUTPUT_FOLDER_ID.)
 */

var TEST = {
  GEMINI_API_KEY: 'PASTE_YOUR_GEMINI_API_KEY_HERE',
  IMAGE_MODEL: 'gemini-3-pro-image', // Nano Banana Pro
  OUTPUT_FOLDER_ID: '', // ריק = My Drive (השורש)
};

function testOneSlideImage() {
  if (!TEST.GEMINI_API_KEY || TEST.GEMINI_API_KEY.indexOf('PASTE_') === 0) {
    throw new Error('מלא GEMINI_API_KEY בהגדרות TEST.');
  }

  // תוכן דוגמה בסגנון סיכום מפגש חם.
  var title = 'הצעד הבא שלך';
  var bullets = [
    'גילית שהכוח לשינוי כבר נמצא בתוכך',
    'השבוע נתמקד בעצירה קטנה ונשימה לפני תגובה',
    'אתה לא לבד — אנחנו כאן איתך בכל צעד',
  ];

  var prompt =
    'Create a complete, polished 16:9 presentation slide in a warm, hopeful ' +
    'coaching style for a brand called "חוזרים לבראשית". ' +
    'Aesthetic: soft painterly illustration, golden-hour glow, cream / terracotta / honey-gold palette, ' +
    'a gentle symbolic background (soft light through trees, a path, roots, or a sunrise), ' +
    'calm and uplifting, sense of home and safety. Elegant, generous whitespace, refined typography.\n\n' +
    'IMPORTANT — render the following HEBREW text on the slide, exactly as written, ' +
    'correctly (right-to-left, proper Hebrew letterforms, no gibberish, no reversed or broken letters), ' +
    'clearly legible with strong contrast:\n\n' +
    'Title (large, top of slide):\n' + title + '\n\n' +
    'Three bullet points (below the title):\n' +
    '• ' + bullets[0] + '\n' +
    '• ' + bullets[1] + '\n' +
    '• ' + bullets[2] + '\n\n' +
    'A small brand line at the bottom: חוזרים לבראשית\n\n' +
    'Do not add any other text or words beyond what is listed above. ' +
    'Output a single wide 16:9 slide image.';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(TEST.IMAGE_MODEL) + ':generateContent?key=' + encodeURIComponent(TEST.GEMINI_API_KEY);

  var body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };

  Logger.log('שולח בקשה למודל ' + TEST.IMAGE_MODEL + '…');
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('הבקשה נכשלה: ' + resp.getResponseCode() + ' ' + resp.getContentText());
  }

  var data = JSON.parse(resp.getContentText());
  var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  var blob = null;
  for (var i = 0; i < parts.length; i++) {
    var inline = parts[i].inlineData || parts[i].inline_data;
    if (inline && inline.data) {
      var bytes = Utilities.base64Decode(inline.data);
      blob = Utilities.newBlob(bytes, inline.mimeType || inline.mime_type || 'image/png', 'בדיקת שקופית - חוזרים לבראשית.png');
      break;
    }
  }
  if (!blob) throw new Error('לא התקבלה תמונה. תשובת המודל: ' + resp.getContentText().slice(0, 500));

  var folder = TEST.OUTPUT_FOLDER_ID ? DriveApp.getFolderById(TEST.OUTPUT_FOLDER_ID) : DriveApp.getRootFolder();
  var file = folder.createFile(blob);
  Logger.log('✔ נוצרה תמונה: ' + file.getName() + '  (' + file.getUrl() + ')');
}
