/**
 * Transport Data Entry System - Core Application Logic
 * Architecture: Single-Row per Trip, Automated Status Calculation, Idempotent Upsert
 */

// Storage Key
const STORAGE_KEY = 'TRANSPORT_TRIPS_DATA_V1';

// Current Application State
let trips = [];
let currentMode = 'NEW'; // 'NEW' or 'RESUME'
let currentActiveTripId = null;

// DOM Elements
const tripForm = document.getElementById('tripForm');
const tripIdInput = document.getElementById('tripId');
const travelDateInput = document.getElementById('travelDate');
const vehiclePlateInput = document.getElementById('vehiclePlate');
const employeeNameInput = document.getElementById('employeeName');
const departmentInput = document.getElementById('department');
const destinationInput = document.getElementById('destination');
const startOdometerInput = document.getElementById('startOdometer');
const departureTimeInput = document.getElementById('departureTime');
const fuelCostInput = document.getElementById('fuelCost');
const returnOdometerInput = document.getElementById('returnOdometer');
const returnTimeInput = document.getElementById('returnTime');
const returnSection = document.getElementById('returnSection');
const resumeBanner = document.getElementById('resumeBanner');
const bannerTripId = document.getElementById('bannerTripId');
const formTitle = document.getElementById('formTitle');
const submitBtnText = document.getElementById('submitBtnText');
const formStatusBadge = document.getElementById('formStatusBadge');
const odometerCalcHint = document.getElementById('odometerCalcHint');
const tripSummaryPreview = document.getElementById('tripSummaryPreview');
const previewDistance = document.getElementById('previewDistance');
const alertBox = document.getElementById('alertBox');

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    loadTripsFromStorage();
    setupInitialForm();
    renderAllViews();

    // Listen to return odometer live changes for instant calculation & validation feedback
    returnOdometerInput.addEventListener('input', handleReturnOdometerChange);
});

/**
 * Generate Unique Trip ID (e.g. TRIP-20260908-A4B7)
 */
function generateTripId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TRIP-${yyyy}${mm}${dd}-${randomHex}`;
}

/**
 * Get current HH:MM string
 */
function getCurrentTimeString() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Get current YYYY-MM-DD string
 */
function getCurrentDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Load Trips from Local Storage
 */
function loadTripsFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            trips = JSON.parse(stored);
        } else {
            trips = [];
        }
    } catch (e) {
        console.error('Error loading trips from localStorage:', e);
        trips = [];
    }
}

/**
 * Save Trips to Local Storage (Atomic Persistence)
 */
function saveTripsToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    } catch (e) {
        showAlert('ไม่สามารถบันทึกข้อมูลลงในหน่วยความจำเบราว์เซอร์ได้', 'error');
    }
}

/**
 * Setup Initial Form (Step 1: New Trip)
 */
function setupInitialForm() {
    currentMode = 'NEW';
    currentActiveTripId = null;

    // Generate new unique Trip ID
    tripIdInput.value = generateTripId();
    travelDateInput.value = getCurrentDateString();
    departureTimeInput.value = getCurrentTimeString();

    // Reset values
    vehiclePlateInput.value = '';
    employeeNameInput.value = '';
    departmentInput.value = '';
    destinationInput.value = '';
    startOdometerInput.value = '';
    fuelCostInput.value = '';
    returnOdometerInput.value = '';
    returnTimeInput.value = '';

    // Unlock Step 1 inputs
    setStep1InputsDisabled(false);

    // Hide Step 2 inputs
    returnSection.classList.add('hidden');
    returnOdometerInput.removeAttribute('required');
    returnTimeInput.removeAttribute('required');
    resumeBanner.classList.add('hidden');
    tripSummaryPreview.classList.add('hidden');
    odometerCalcHint.textContent = '';

    // Headers & Badges
    formTitle.textContent = 'Step 1: บันทึกข้อมูลออกเดินทาง (ขาไป)';
    submitBtnText.textContent = 'บันทึกข้อมูลออกเดินทาง (ขาไป)';
    formStatusBadge.textContent = 'กำลังเดินทาง (คำนวณอัตโนมัติ)';
    formStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300';
}

/**
 * Set Step 1 Inputs Disabled / Enabled
 */
function setStep1InputsDisabled(disabled) {
    const fields = [
        travelDateInput,
        vehiclePlateInput,
        employeeNameInput,
        departmentInput,
        destinationInput,
        startOdometerInput,
        departureTimeInput
    ];
    fields.forEach(field => {
        field.disabled = disabled;
    });
}

/**
 * Resume Mode (Step 2: Return Trip / Refuel)
 * Loads existing trip by ID and locks Step 1 fields
 */
function resumeTrip(tripId) {
    const trip = trips.find(t => t.trip_id === tripId);
    if (!trip) {
        showAlert(`ไม่พบข้อมูลทริป ${tripId}`, 'error');
        return;
    }

    currentMode = 'RESUME';
    currentActiveTripId = tripId;

    // Switch to Form tab
    switchTab('new-trip');

    // Populate existing trip data
    tripIdInput.value = trip.trip_id;
    travelDateInput.value = trip.travel_date || '';
    vehiclePlateInput.value = trip.vehicle_plate || '';
    employeeNameInput.value = trip.employee_name || '';
    departmentInput.value = trip.department || '';
    destinationInput.value = trip.destination || '';
    startOdometerInput.value = trip.start_odometer || '';
    departureTimeInput.value = trip.departure_time || '';
    fuelCostInput.value = trip.fuel_cost > 0 ? trip.fuel_cost : '';

    // Lock Step 1 fields (Prevent accidental edits)
    setStep1InputsDisabled(true);

    // Show Resume Banner
    bannerTripId.textContent = trip.trip_id;
    resumeBanner.classList.remove('hidden');

    // Unhide Step 2 (Return Section)
    returnSection.classList.remove('hidden');
    returnOdometerInput.setAttribute('required', 'required');
    returnTimeInput.setAttribute('required', 'required');

    // Pre-fill Return inputs if already have values
    returnOdometerInput.value = trip.return_odometer || '';
    returnTimeInput.value = trip.return_time || getCurrentTimeString();

    // Headers & Labels
    formTitle.textContent = 'Step 2: บันทึกข้อมูลขากลับ (ปิดทริป)';
    submitBtnText.textContent = 'อัปเดตข้อมูลขากลับและเสร็จสิ้นทริป';
    
    // Status Badge preview
    updateFormStatusPreview();

    // Focus on return odometer input
    setTimeout(() => {
        returnOdometerInput.focus();
        handleReturnOdometerChange();
    }, 150);

    // Scroll smoothly to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Cancel Resume Mode and return to New Trip
 */
function cancelResumeMode() {
    setupInitialForm();
    showAlert('ยกเลิกโหมดบันทึกขากลับแล้ว กลับสู่ฟอร์มสร้างทริปใหม่', 'info');
}

/**
 * Handle Live Changes on Return Odometer
 */
function handleReturnOdometerChange() {
    const startVal = parseFloat(startOdometerInput.value) || 0;
    const returnVal = parseFloat(returnOdometerInput.value);

    if (isNaN(returnVal) || returnOdometerInput.value === '') {
        odometerCalcHint.textContent = `(เลขไมล์ขาไปคือ ${startVal.toLocaleString()} กม.)`;
        odometerCalcHint.className = 'text-[11px] text-slate-500 mt-1 font-medium';
        tripSummaryPreview.classList.add('hidden');
        updateFormStatusPreview();
        return;
    }

    const distance = returnVal - startVal;

    if (distance < 0) {
        odometerCalcHint.textContent = `⚠️ เลขไมล์ขากลับต้องไม่น้อยกว่าเลขไมล์ขาไป (${startVal.toLocaleString()} กม.)`;
        odometerCalcHint.className = 'text-[11px] text-rose-600 mt-1 font-bold';
        tripSummaryPreview.classList.add('hidden');
    } else {
        odometerCalcHint.textContent = `✓ ระยะทางขาไปถึงกลับ: +${distance.toLocaleString()} กม.`;
        odometerCalcHint.className = 'text-[11px] text-emerald-700 mt-1 font-semibold';
        previewDistance.textContent = `${distance.toLocaleString()} กม.`;
        tripSummaryPreview.classList.remove('hidden');
    }

    updateFormStatusPreview();
}

/**
 * Update Form Status Badge Dynamically
 */
function updateFormStatusPreview() {
    const returnVal = parseFloat(returnOdometerInput.value);
    if (currentMode === 'RESUME' && !isNaN(returnVal) && returnVal > 0) {
        formStatusBadge.textContent = 'จะเปลี่ยนเป็น "เสร็จสิ้น" ทันทีที่บันทึก';
        formStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    } else {
        formStatusBadge.textContent = 'กำลังเดินทาง (คำนวณอัตโนมัติ)';
        formStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300';
    }
}

/**
 * Calculate automated status:
 * If return_odometer is present and > 0 => 'เสร็จสิ้น'
 * Otherwise => 'กำลังเดินทาง'
 */
function computeTripStatus(returnOdometer) {
    if (returnOdometer !== null && returnOdometer !== undefined && returnOdometer !== '' && Number(returnOdometer) > 0) {
        return 'เสร็จสิ้น';
    }
    return 'กำลังเดินทาง';
}

/**
 * Handle Form Submit (Single-Row Upsert Logic)
 */
function handleFormSubmit(e) {
    e.preventDefault();

    const tripId = tripIdInput.value.trim();
    if (!tripId) {
        showAlert('เกิดข้อผิดพลาด: ไม่พบรหัสทริป (Trip ID)', 'error');
        return;
    }

    const startOdo = parseFloat(startOdometerInput.value);
    const returnOdoRaw = returnOdometerInput.value.trim();
    const returnOdo = returnOdoRaw !== '' ? parseFloat(returnOdoRaw) : null;
    const fuelVal = fuelCostInput.value.trim() !== '' ? parseFloat(fuelCostInput.value) : 0.00;

    // Rule 1: Validate start odometer
    if (isNaN(startOdo) || startOdo < 0) {
        showAlert('กรุณากรอกเลขไมล์ขาไปที่ถูกต้อง', 'error');
        startOdometerInput.focus();
        return;
    }

    // Rule 2: In Resume mode, Validate return odometer >= start odometer
    if (currentMode === 'RESUME' || returnOdo !== null) {
        if (returnOdo === null || isNaN(returnOdo)) {
            showAlert('กรุณากรอกเลขไมล์ขากลับเพื่อปิดทริป', 'error');
            returnOdometerInput.focus();
            return;
        }
        if (returnOdo < startOdo) {
            showAlert(`ข้อผิดพลาด (Human Error): เลขไมล์ขากลับ (${returnOdo.toLocaleString()} กม.) ต้องมากกว่าหรือเท่ากับเลขไมล์ขาไป (${startOdo.toLocaleString()} กม.)`, 'error');
            returnOdometerInput.focus();
            return;
        }
        if (!returnTimeInput.value) {
            showAlert('กรุณาระบุเวลาเดินทางกลับถึง', 'error');
            returnTimeInput.focus();
            return;
        }
    }

    // Rule 3: Automated status determination (No user dropdown)
    const tripStatus = computeTripStatus(returnOdo);

    // Rule 4: Single Record Upsert (Find index or create new)
    const existingIndex = trips.findIndex(t => t.trip_id === tripId);

    const tripRecord = {
        trip_id: tripId,
        travel_date: travelDateInput.value,
        employee_name: employeeNameInput.value.trim(),
        department: departmentInput.value.trim(),
        vehicle_plate: vehiclePlateInput.value.trim(),
        destination: destinationInput.value.trim(),
        start_odometer: startOdo,
        departure_time: departureTimeInput.value,
        fuel_cost: fuelVal,
        return_odometer: returnOdo,
        return_time: returnTimeInput.value || null,
        trip_status: tripStatus,
        updated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        // UPDATE SAME ROW (Preserve original created_at)
        tripRecord.created_at = trips[existingIndex].created_at || new Date().toISOString();
        trips[existingIndex] = tripRecord;
        saveTripsToStorage();
        showAlert(`อัปเดตทริป [${tripId}] ในแถวเดิมเรียบร้อย! สถานะ: ${tripStatus}`, 'success');
    } else {
        // INSERT NEW ROW
        tripRecord.created_at = new Date().toISOString();
        trips.unshift(tripRecord);
        saveTripsToStorage();
        showAlert(`บันทึกทริปใหม่ [${tripId}] เรียบร้อย! สามารถปิดแอปได้ทันที`, 'success');
    }

    // Refresh UI & Views
    renderAllViews();

    // Reset Form for next use
    setupInitialForm();

    // If trip completed, switch to history tab to show the result
    if (tripStatus === 'เสร็จสิ้น') {
        setTimeout(() => {
            switchTab('history');
        }, 1200);
    }
}

/**
 * Render All Views (Active list, History table, Badges & Stats)
 */
function renderAllViews() {
    renderActiveTrips();
    renderHistoryTable();
    updateBadgesAndStats();
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Render Active Trips Tab (ทริปที่สถานะ = 'กำลังเดินทาง')
 */
function renderActiveTrips() {
    const activeTripsList = document.getElementById('activeTripsList');
    const activeBadgeCount = document.getElementById('activeBadgeCount');
    const activeTrips = trips.filter(t => t.trip_status === 'กำลังเดินทาง');

    activeBadgeCount.textContent = `${activeTrips.length} รายการ`;

    if (activeTrips.length === 0) {
        activeTripsList.innerHTML = `
            <div class="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="check-circle" class="w-6 h-6"></i>
                </div>
                <h3 class="font-bold text-slate-800 text-sm">ไม่มีรายการที่ค้างเดินทางอยู่ขณะนี้</h3>
                <p class="text-xs text-slate-400 mt-1">ทุกทริปได้บันทึกขากลับครบถ้วนแล้ว หรือกดปุ่ม "สร้างทริป (ขาไป)" ด้านบนเพื่อเริ่มทริปใหม่</p>
            </div>
        `;
        return;
    }

    activeTripsList.innerHTML = activeTrips.map(trip => `
        <div class="trip-card bg-white rounded-2xl p-4 sm:p-5 border border-amber-200/80 shadow-sm relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
            
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                        <span class="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">${trip.trip_id}</span>
                        <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            ${trip.trip_status}
                        </span>
                        <span class="text-xs text-slate-400">วันที่: ${formatDisplayDate(trip.travel_date)}</span>
                    </div>

                    <h3 class="font-bold text-slate-800 text-base flex items-center gap-1.5 mt-1">
                        <i data-lucide="map-pin" class="w-4 h-4 text-rose-500 shrink-0"></i>
                        <span>${escapeHtml(trip.destination)}</span>
                    </h3>

                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                        <div>
                            <span class="text-slate-400">ผู้เดินทาง:</span> 
                            <span class="font-medium text-slate-800">${escapeHtml(trip.employee_name)}</span> (${escapeHtml(trip.department)})
                        </div>
                        <div>
                            <span class="text-slate-400">ทะเบียนรถ:</span> 
                            <span class="font-semibold text-slate-800">${escapeHtml(trip.vehicle_plate)}</span>
                        </div>
                        <div>
                            <span class="text-slate-400">ไมล์ขาไป:</span> 
                            <span class="font-bold text-emerald-700 font-mono">${trip.start_odometer.toLocaleString()} กม.</span> 
                            <span class="text-slate-400 text-[11px]">(${trip.departure_time} น.)</span>
                        </div>
                        ${trip.fuel_cost > 0 ? `
                        <div class="col-span-2 text-amber-700">
                            <span class="text-slate-400">ค่าน้ำมัน:</span> ${trip.fuel_cost.toLocaleString()} บาท
                        </div>` : ''}
                    </div>
                </div>

                <div class="flex items-center space-x-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button onclick="resumeTrip('${trip.trip_id}')" class="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm flex items-center justify-center space-x-1.5 transition">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                        <span>บันทึกขากลับ / ปิดทริป</span>
                    </button>
                    <button onclick="deleteTrip('${trip.trip_id}')" class="p-2.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition" title="ลบรายการ">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Render History Table Tab (1 Row per Trip)
 */
function renderHistoryTable() {
    const tableBody = document.getElementById('historyTableBody');
    const emptyNotice = document.getElementById('emptyHistoryNotice');

    if (trips.length === 0) {
        tableBody.innerHTML = '';
        emptyNotice.classList.remove('hidden');
        return;
    }

    emptyNotice.classList.add('hidden');

    tableBody.innerHTML = trips.map(trip => {
        const isCompleted = trip.trip_status === 'เสร็จสิ้น';
        const distance = (isCompleted && trip.return_odometer) ? (trip.return_odometer - trip.start_odometer) : null;

        return `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="p-3 font-mono font-medium text-slate-700 text-[11px]">
                    ${trip.trip_id}
                </td>
                <td class="p-3 text-slate-600 whitespace-nowrap">
                    ${formatDisplayDate(trip.travel_date)}
                </td>
                <td class="p-3">
                    <div class="font-medium text-slate-800">${escapeHtml(trip.employee_name)}</div>
                    <div class="text-[11px] text-slate-400">${escapeHtml(trip.department)}</div>
                </td>
                <td class="p-3 font-medium text-slate-700 whitespace-nowrap">
                    ${escapeHtml(trip.vehicle_plate)}
                </td>
                <td class="p-3 font-medium text-slate-800 max-w-[180px] truncate" title="${escapeHtml(trip.destination)}">
                    ${escapeHtml(trip.destination)}
                </td>
                <td class="p-3 font-mono">
                    <div class="text-emerald-700 font-semibold">ไป: ${trip.start_odometer.toLocaleString()}</div>
                    <div class="${isCompleted ? 'text-teal-800 font-semibold' : 'text-slate-400 text-[11px]'}">
                        กลับ: ${isCompleted ? trip.return_odometer.toLocaleString() : '-'}
                    </div>
                </td>
                <td class="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                    ${distance !== null ? `${distance.toLocaleString()} กม.` : '<span class="text-slate-300 font-normal">-</span>'}
                </td>
                <td class="p-3 font-mono text-slate-700 whitespace-nowrap">
                    ${trip.fuel_cost > 0 ? `${trip.fuel_cost.toLocaleString()} บ.` : '<span class="text-slate-300">-</span>'}
                </td>
                <td class="p-3 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        isCompleted 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }">
                        ${trip.trip_status}
                    </span>
                </td>
                <td class="p-3 text-center whitespace-nowrap">
                    ${!isCompleted ? `
                        <button onclick="resumeTrip('${trip.trip_id}')" class="text-emerald-600 hover:text-emerald-800 font-semibold text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition mr-1">
                            ทำต่อ
                        </button>
                    ` : `
                        <button onclick="resumeTrip('${trip.trip_id}')" class="text-slate-500 hover:text-slate-800 text-xs px-2 py-1 rounded hover:bg-slate-100 transition mr-1" title="แก้ไขข้อมูล">
                            แก้ไข
                        </button>
                    `}
                    <button onclick="deleteTrip('${trip.trip_id}')" class="text-slate-400 hover:text-rose-600 p-1 transition" title="ลบรายการ">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 inline"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Update Badges and Stat Cards
 */
function updateBadgesAndStats() {
    const activeTrips = trips.filter(t => t.trip_status === 'กำลังเดินทาง');
    const completedTrips = trips.filter(t => t.trip_status === 'เสร็จสิ้น');

    // Badges on navigation buttons
    const activeCount = activeTrips.length;
    const activeTripCountBadge = document.getElementById('activeTripCountBadge');
    const mobileActiveBadge = document.getElementById('mobileActiveBadge');

    if (activeCount > 0) {
        activeTripCountBadge.textContent = activeCount;
        activeTripCountBadge.classList.remove('hidden');
        mobileActiveBadge.textContent = activeCount;
        mobileActiveBadge.classList.remove('hidden');
    } else {
        activeTripCountBadge.classList.add('hidden');
        mobileActiveBadge.classList.add('hidden');
    }

    // Stats cards
    document.getElementById('statTotalTrips').textContent = trips.length;
    document.getElementById('statActiveTrips').textContent = activeTrips.length;
    document.getElementById('statCompletedTrips').textContent = completedTrips.length;

    let totalKm = 0;
    completedTrips.forEach(t => {
        if (t.return_odometer && t.return_odometer >= t.start_odometer) {
            totalKm += (t.return_odometer - t.start_odometer);
        }
    });
    document.getElementById('statTotalDistance').textContent = `${totalKm.toLocaleString()} กม.`;
}

/**
 * Switch Navigation Tab
 */
function switchTab(tabName) {
    const tabForm = document.getElementById('tab-form');
    const tabActive = document.getElementById('tab-active');
    const tabHistory = document.getElementById('tab-history');

    const navNewTrip = document.getElementById('navNewTrip');
    const navActiveTrips = document.getElementById('navActiveTrips');
    const navHistory = document.getElementById('navHistory');

    const mobileNavNew = document.getElementById('mobileNavNew');
    const mobileNavActive = document.getElementById('mobileNavActive');
    const mobileNavHistory = document.getElementById('mobileNavHistory');

    // Reset visibility
    tabForm.classList.add('hidden');
    tabActive.classList.add('hidden');
    tabHistory.classList.add('hidden');

    // Reset Nav buttons
    [navNewTrip, navActiveTrips, navHistory].forEach(btn => {
        btn.className = 'tab-btn flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all text-slate-600 hover:text-slate-900';
    });

    [mobileNavNew, mobileNavActive, mobileNavHistory].forEach(btn => {
        btn.classList.remove('text-emerald-700');
        btn.classList.add('text-slate-400');
    });

    if (tabName === 'new-trip') {
        tabForm.classList.remove('hidden');
        navNewTrip.className = 'tab-btn active flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all shadow-sm bg-white text-emerald-700 font-semibold';
        mobileNavNew.classList.remove('text-slate-400');
        mobileNavNew.classList.add('text-emerald-700');
    } else if (tabName === 'active-trips') {
        tabActive.classList.remove('hidden');
        navActiveTrips.className = 'tab-btn active flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all shadow-sm bg-white text-amber-700 font-semibold';
        mobileNavActive.classList.remove('text-slate-400');
        mobileNavActive.classList.add('text-emerald-700');
        renderActiveTrips();
    } else if (tabName === 'history') {
        tabHistory.classList.remove('hidden');
        navHistory.className = 'tab-btn active flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all shadow-sm bg-white text-slate-900 font-semibold';
        mobileNavHistory.classList.remove('text-slate-400');
        mobileNavHistory.classList.add('text-emerald-700');
        renderHistoryTable();
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Reset Form to fresh New Trip
 */
function resetFormToNewTrip() {
    setupInitialForm();
    showAlert('ล้างฟอร์มเรียบร้อย พร้อมสร้างทริปใหม่', 'info');
}

/**
 * Delete a Trip Record
 */
function deleteTrip(tripId) {
    if (confirm(`คุณต้องการลบข้อมูลการเดินทางรหัส ${tripId} ใช่หรือไม่?`)) {
        trips = trips.filter(t => t.trip_id !== tripId);
        saveTripsToStorage();
        renderAllViews();
        if (currentActiveTripId === tripId) {
            setupInitialForm();
        }
        showAlert(`ลบรายการ ${tripId} สำเร็จ`, 'info');
    }
}

/**
 * Clear All Trips (With confirmation)
 */
function clearAllData() {
    if (confirm('คำเตือน: คุณต้องการล้างข้อมูลประวัติการเดินทางทั้งหมดใช่หรือไม่?')) {
        trips = [];
        saveTripsToStorage();
        setupInitialForm();
        renderAllViews();
        showAlert('ล้างข้อมูลในระบบทั้งหมดเรียบร้อยแล้ว', 'info');
    }
}

/**
 * Load Sample Demo Data
 */
function loadSampleData() {
    const today = getCurrentDateString();
    const demoTrips = [
        {
            trip_id: 'TRIP-20260908-DEM1',
            travel_date: today,
            employee_name: 'สมชาย ใจดี',
            department: 'ฝ่ายช่างบริการ',
            vehicle_plate: '1กข-4455 กทม.',
            destination: 'โรงงานสุพรรณบุรี (ตรวจเช็คเครื่องจักร)',
            start_odometer: 145200,
            departure_time: '08:30',
            fuel_cost: 800.00,
            return_odometer: 145450,
            return_time: '17:15',
            trip_status: 'เสร็จสิ้น',
            created_at: new Date(Date.now() - 36000000).toISOString(),
            updated_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
            trip_id: 'TRIP-20260908-DEM2',
            travel_date: today,
            employee_name: 'วิภาดา รักงาน',
            department: 'ฝ่ายขายโครงการ',
            vehicle_plate: '3ฒณ-8822 กทม.',
            destination: 'นิคมอุตสาหกรรมบางปู (พบลูกค้าใหม่)',
            start_odometer: 89340,
            departure_time: '10:00',
            fuel_cost: 0,
            return_odometer: null,
            return_time: null,
            trip_status: 'กำลังเดินทาง',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ];

    trips = demoTrips;
    saveTripsToStorage();
    renderAllViews();
    showAlert('เพิ่มข้อมูลตัวอย่าง 2 ทริป (เสร็จสิ้น 1 ทริป / กำลังเดินทาง 1 ทริป) เรียบร้อย!', 'success');
}

/**
 * Export to CSV / Excel (1 Row per Trip Guarantee)
 * Encoded with UTF-8 BOM so Thai characters show correctly in Excel
 */
function exportToCSV() {
    if (trips.length === 0) {
        showAlert('ไม่มีข้อมูลสำหรับ Export', 'info');
        return;
    }

    const headers = [
        'Trip_ID',
        'วันที่เดินทาง',
        'ชื่อพนักงาน',
        'แผนก',
        'ทะเบียนรถ',
        'สถานที่ปลายทาง',
        'เลขไมล์ขาไป',
        'เวลาออกเดินทาง',
        'ค่าน้ำมัน',
        'เลขไมล์ขากลับ',
        'เวลาเดินทางกลับถึง',
        'สถานะการเดินทาง'
    ];

    const rows = trips.map(t => [
        `"${t.trip_id || ''}"`,
        `"${t.travel_date || ''}"`,
        `"${(t.employee_name || '').replace(/"/g, '""')}"`,
        `"${(t.department || '').replace(/"/g, '""')}"`,
        `"${(t.vehicle_plate || '').replace(/"/g, '""')}"`,
        `"${(t.destination || '').replace(/"/g, '""')}"`,
        t.start_odometer !== null ? t.start_odometer : '',
        `"${t.departure_time || ''}"`,
        t.fuel_cost !== null ? t.fuel_cost : 0,
        t.return_odometer !== null ? t.return_odometer : '',
        `"${t.return_time || ''}"`,
        `"${t.trip_status || ''}"`
    ]);

    const csvContent = '\uFEFF' + [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transport_trips_${getCurrentDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showAlert('ดาวน์โหลดไฟล์ CSV สำหรับ Excel สำเร็จ!', 'success');
}

/**
 * Helper: Show alert banner
 */
function showAlert(message, type = 'info') {
    alertBox.textContent = message;
    alertBox.classList.remove('hidden', 'bg-rose-50', 'text-rose-800', 'border-rose-200', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-blue-50', 'text-blue-800', 'border-blue-200', 'opacity-0', 'scale-95');

    if (type === 'error') {
        alertBox.classList.add('bg-rose-50', 'text-rose-800', 'border-rose-200');
    } else if (type === 'success') {
        alertBox.classList.add('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    } else {
        alertBox.classList.add('bg-blue-50', 'text-blue-800', 'border-blue-200');
    }

    setTimeout(() => {
        alertBox.classList.remove('opacity-0', 'scale-95');
        alertBox.classList.add('opacity-100', 'scale-100');
    }, 10);

    setTimeout(() => {
        alertBox.classList.add('opacity-0', 'scale-95');
        setTimeout(() => alertBox.classList.add('hidden'), 300);
    }, 4500);
}

/**
 * Helper: Format date DD/MM/YYYY
 */
function formatDisplayDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
