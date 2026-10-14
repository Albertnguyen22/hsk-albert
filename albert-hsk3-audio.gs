/**
 * Albert · HSK 3 · 3.0 · MP3 bài tập (新HSK教程3 学练手册)
 * JSONP chỉ đọc: chỉ trả đúng 19 file trong danh sách TRACKS, không nhận mã file tùy ý.
 * Triển khai: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * Dán URL /exec vào hsk-drive-config.js ở mục "hsk3Endpoint".
 */
const PROTOCOL = 'albert-hsk3-workbook-drive-v1';
const TRACKS = {
  'hsk3-wb-lesson-01': '1JQQ7sKfSGBsRCqDyMuPG4RaLgDX0I0MF', // 第1课.mp3
  'hsk3-wb-lesson-02': '1O1Whsg-MsXmp3YvWuevfM4rcAHNXq8NP', // 第2课.mp3
  'hsk3-wb-lesson-03': '1Qvms-w4N5Tumc8UjYPMhwojPqxkcxiHc', // 第3课.mp3
  'hsk3-wb-lesson-04': '1Zl0rvZNeerzQkRQ_SwyXbsO4AmK4DV96', // 第4课.mp3
  'hsk3-wb-lesson-05': '13VY9hVXKg1PEAILDNi26V4BB7EBP_1uG', // 第5课.mp3
  'hsk3-wb-lesson-06': '1fgdGzypouTBlJ8xdKOzdZ0YVfFiOFQ-T', // 第6课.mp3
  'hsk3-wb-lesson-07': '1mgh1GkdUBJs16ZNiVC1R6iVTy7Qvbac6', // 第7课.mp3
  'hsk3-wb-lesson-08': '10fSmjrdcJG9-Qvuem_EMTVtD91Dp3L5v', // 第8课.mp3
  'hsk3-wb-lesson-09': '1pcaj1MRy8HEcI8UtzVhzERuPcToKziWQ', // 第9课.mp3
  'hsk3-wb-lesson-10': '1HB_Qvysh7oUbA9iliGidC6KMPr80QBnL', // 第10课.mp3
  'hsk3-wb-lesson-11': '1TuhEiouTOAXV5eve9TJj1gIVQHJ7EDmw', // 第11课.mp3
  'hsk3-wb-lesson-12': '1TTCOjqwDAlPxMUVVtwsT84SgfqnSvdHc', // 第12课.mp3
  'hsk3-wb-lesson-13': '1XQmL6D6oJaWwNIZAUPOSbXyhD3fV3ze-', // 第13课.mp3
  'hsk3-wb-lesson-14': '13QJiFuF8nTEtZX0jctJhvygqpULR5h6S', // 第14课.mp3
  'hsk3-wb-lesson-15': '1nlLcWONJ9HhxP08Up3ykk6D5sP5pYBbK', // 第15课.mp3
  'hsk3-wb-lesson-16': '1akxLOhHkWJDloXK0tPuu2KKM2Imwtl-I', // 第16课.mp3
  'hsk3-wb-lesson-17': '1M90V75XtyBL2-cXLXWlvxgPP481h3oTN', // 第17课.mp3
  'hsk3-wb-lesson-18': '1pwQfVgwJdbO_FXCrHFLDliQnJe9fxiTk', // 第18课.mp3
  'hsk3-wb-mock':      '1wrj3ERagfvYJOgH3nzXTMnjaB4jEj1WX'  // 模拟测试 HSK(三级)模拟试卷.mp3
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  const cb = String(p.callback || '');
  if (!/^albertHsk3Audio_[A-Za-z0-9_]{1,80}$/.test(cb)) {
    return ContentService.createTextOutput('/* callback không hợp lệ */').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  let out;
  try {
    if (p.mode === 'manifest') out = manifest_();
    else if (p.mode === 'audio') out = audio_(String(p.track || ''));
    else throw new Error('Yêu cầu không hợp lệ.');
  } catch (err) {
    out = { protocol: PROTOCOL, ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function manifest_() {
  const keys = Object.keys(TRACKS);
  const entries = keys.map(function (key) {
    const f = DriveApp.getFileById(TRACKS[key]);
    return { key: key, id: TRACKS[key], name: f.getName(), bytes: f.getSize(), mime: f.getMimeType() };
  });
  return { protocol: PROTOCOL, ok: true, complete: entries.length === keys.length, entries: entries };
}

function audio_(key) {
  if (!Object.prototype.hasOwnProperty.call(TRACKS, key)) throw new Error('Bài không hợp lệ.');
  const id = TRACKS[key];
  const f = DriveApp.getFileById(id);
  const bytes = f.getBlob().getBytes();
  const sha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  return { protocol: PROTOCOL, ok: true, key: key, id: id, name: f.getName(), bytes: bytes.length,
           sha256: sha, verified: true, base64: Utilities.base64Encode(bytes) };
}

/** Chạy hàm này một lần trong trình soạn thảo để cấp quyền Drive và kiểm tra đủ 19 file. */
function kiemTra19File() {
  const m = manifest_();
  m.entries.forEach(function (x) { Logger.log(x.key + ' · ' + x.name + ' · ' + x.bytes + ' byte'); });
  Logger.log(m.complete ? 'Đủ 19 file.' : 'Thiếu file!');
}
