/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT: ระบบบันทึกข้อมูลการเดินทางของพนักงาน (Transport Data Entry Backend)
 * ไฟล์: Code.gs / google-sheets-script.js
 * รองรับ: Single Record Upsert, LockService (กันเขียนทับ), Base64 Image Upload, Automated Status
 * =========================================================================================
 */

const SHEET_NAME = 'Transport_Data';
const FOLDER_NAME = 'Transport_Trip_Photos';

const HEADERS = [
  'Trip_ID',
  'วันที่เดินทาง',
  'ชื่อพนักงาน',
  'แผนก',
  'ทะเบียนรถ',
  'สถานที่ปลายทาง',
  'เลขไมล์ขาไป',
  'รูปไมล์ขาไป (URL)',
  'เวลาออกเดินทาง',
  'ค่าน้ำมัน (บาท)',
  'รูปใบเสร็จน้ำมัน (URL)',
  'เลขไมล์ขากลับ',
  'รูปไมล์ขากลับ (URL)',
  'เวลาเดินทางกลับถึง',
  'ระยะทางรวม (กม.)',
  'สถานะการเดินทาง',
  'บันทึก/อัปเดตล่าสุด'
];

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length)
       .setBackground('#0f172a')
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 38);

  sheet.setColumnWidth(1, 175);
  sheet.setColumnWidth(2, 105);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 220);
  sheet.setColumnWidth(7, 95);
  sheet.setColumnWidth(8, 160);
  sheet.setColumnWidth(9, 90);
  sheet.setColumnWidth(10, 100);
  sheet.setColumnWidth(11, 160);
  sheet.setColumnWidth(12, 100);
  sheet.setColumnWidth(13, 160);
  sheet.setColumnWidth(14, 110);
  sheet.setColumnWidth(15, 110);
  sheet.setColumnWidth(16, 120);
  sheet.setColumnWidth(17, 150);

  getOrCreatePhotoFolder();
  Logger.log('ตั้งค่าชีตและโฟลเดอร์สำเร็จเรียบร้อย!');
}

function getOrCreatePhotoFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const newFolder = DriveApp.createFolder(FOLDER_NAME);
  try {
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('Folder sharing skipped due to domain policy: ' + e.toString());
  }
  return newFolder;
}

function saveBase64ImageToDrive(base64Data, fileName) {
  if (!base64Data || typeof base64Data !== 'string') return '';

  if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
    return base64Data;
  }

  try {
    const folder = getOrCreatePhotoFolder();
    const commaIndex = base64Data.indexOf(',');
    const pureBase64 = commaIndex >= 0 ? base64Data.substring(commaIndex + 1) : base64Data;

    const decodedBytes = Utilities.base64Decode(pureBase64);
    const blob = Utilities.newBlob(decodedBytes, 'image/jpeg', `${fileName}.jpg`);

    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log(`File sharing skipped for ${fileName}: ` + shareErr.toString());
    }

    return file.getUrl();
  } catch (error) {
    Logger.log(`Error saving image ${fileName}: ` + error.toString());
    return '';
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('ไม่พบข้อมูลใน Request Body');
    }

    const payload = JSON.parse(e.postData.contents);
    const tripId = String(payload.trip_id || '').trim();

    if (!tripId) {
      throw new Error('Missing Trip_ID');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      setupSystem();
      sheet = ss.getSheetByName(SHEET_NAME);
    }

    const dataRange = sheet.getDataRange().getValues();
    let rowIndex = -1;
    let existingRow = null;

    for (let i = 1; i < dataRange.length; i++) {
      if (String(dataRange[i][0]).trim() === tripId) {
        rowIndex = i + 1;
        existingRow = dataRange[i];
        break;
      }
    }

    let startPhotoUrl = existingRow ? existingRow[7] : '';
    if (payload.start_odo_photo) {
      const uploaded = saveBase64ImageToDrive(payload.start_odo_photo, `${tripId}_START`);
      if (uploaded) startPhotoUrl = uploaded;
    }

    let fuelPhotoUrl = existingRow ? existingRow[10] : '';
    if (payload.fuel_photo) {
      const uploaded = saveBase64ImageToDrive(payload.fuel_photo, `${tripId}_FUEL`);
      if (uploaded) fuelPhotoUrl = uploaded;
    }

    let returnPhotoUrl = existingRow ? existingRow[12] : '';
    if (payload.return_odo_photo) {
      const uploaded = saveBase64ImageToDrive(payload.return_odo_photo, `${tripId}_RETURN`);
      if (uploaded) returnPhotoUrl = uploaded;
    }

    const hasStartOdo = payload.start_odometer !== null && payload.start_odometer !== undefined && payload.start_odometer !== '' && !isNaN(Number(payload.start_odometer));
    const startOdo = hasStartOdo
      ? Number(payload.start_odometer)
      : (existingRow && existingRow[6] !== '' ? Number(existingRow[6]) : 0);

    const hasReturnOdo = payload.return_odometer !== null && payload.return_odometer !== undefined && payload.return_odometer !== '' && !isNaN(Number(payload.return_odometer));
    const returnOdo = hasReturnOdo
      ? Number(payload.return_odometer)
      : (existingRow && existingRow[11] !== '' && existingRow[11] !== null ? Number(existingRow[11]) : null);

    const hasFuelCost = payload.fuel_cost !== null && payload.fuel_cost !== undefined && payload.fuel_cost !== '' && !isNaN(Number(payload.fuel_cost));
    const fuelCost = hasFuelCost
      ? Number(payload.fuel_cost)
      : (existingRow && existingRow[9] !== '' ? Number(existingRow[9]) : 0);

    const isCompleted = returnOdo !== null && !isNaN(returnOdo) && returnOdo >= startOdo;
    const computedStatus = isCompleted ? 'เสร็จสิ้น' : 'กำลังเดินทาง';
    const totalDistance = isCompleted ? (returnOdo - startOdo) : '';
    const nowFormatted = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    const rowValues = [
      tripId,
      payload.travel_date || (existingRow ? existingRow[1] : ''),
      payload.employee_name || (existingRow ? existingRow[2] : ''),
      payload.department || (existingRow ? existingRow[3] : ''),
      payload.vehicle_plate || (existingRow ? existingRow[4] : ''),
      payload.destination || (existingRow ? existingRow[5] : ''),
      startOdo,
      startPhotoUrl,
      payload.departure_time || (existingRow ? existingRow[8] : ''),
      fuelCost,
      fuelPhotoUrl,
      returnOdo !== null ? returnOdo : '',
      returnPhotoUrl,
      payload.return_time || (existingRow ? existingRow[13] : ''),
      totalDistance,
      computedStatus,
      nowFormatted
    ];

    let actionResult = '';
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      actionResult = 'updated';
    } else {
      sheet.appendRow(rowValues);
      actionResult = 'created';
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      action: actionResult,
      trip_id: tripId,
      trip_status: computedStatus,
      updated_at: nowFormatted
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('doPost Error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    system: 'Transport Data Entry Backend',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
