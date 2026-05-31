// ============================================================
// CJS 방송부 장비 관리 시스템 — 메인 스크립트
// ============================================================
// 이 파일은 앱의 모든 기능을 담당합니다.
// 섹션별로 나누어 설명을 달아두었으니 찬찬히 읽어보세요.
// ============================================================

import { initializeApp }
    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth, GoogleAuthProvider, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    collection, doc, getDoc, getDocs, addDoc, updateDoc,
    query, where, orderBy, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { firebaseConfig } from './config.js';

// ── Firebase 초기화 ─────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── 전역 상태 (앱 전체에서 공유하는 데이터) ─────────────────
let currentUser   = null;  // 현재 로그인한 사용자 정보
let allEquipment  = [];    // 전체 장비 목록
let allBookings   = [];    // 전체 신청 목록
let calYear       = new Date().getFullYear();  // 달력 연도
let calMonth      = new Date().getMonth();     // 달력 월 (0=1월)
let selectedEquipId  = null;   // 장비 현황 모달에서 선택된 장비
let editingBookingId = null;   // 수정 중인 신청 ID
let selectedEquipForBooking = null; // 신청 작성에서 선택한 장비
let modalCalYear  = new Date().getFullYear(); // 모달 달력 연도
let modalCalMonth = new Date().getMonth();    // 모달 달력 월

// ============================================================
// 1. 인증 (로그인 체크)
// ============================================================

// 로그인 상태를 지켜보다가 로그아웃되면 index.html로 보냄
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // 로그인 안 된 상태 → 로그인 페이지로
        window.location.href = 'index.html';
        return;
    }

    // 허용된 부원인지 확인
    const allowed = await isAllowed(user.email);
    if (!allowed) {
        await signOut(auth);
        window.location.href = 'index.html';
        return;
    }

    // 로그인 성공 → 앱 시작
    currentUser = user;
    initApp();
});

// 허용된 이메일인지 Firestore에서 확인
async function isAllowed(email) {
    try {
        const key  = email.replace(/@/g, '_at_').replace(/\./g, '_');
        const snap = await getDoc(doc(db, 'allowedEmails', key));
        return snap.exists() && snap.data().allowed === true;
    } catch {
        return false;
    }
}

// 로그아웃 버튼
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
        await signOut(auth);
        window.location.href = 'index.html';
    }
});

// ============================================================
// 2. 앱 초기화
// ============================================================

async function initApp() {
    // 사이드바에 유저 정보 표시
    renderUserInfo();

    // 데이터 로드 (장비 목록 + 내 신청 목록)
    await Promise.all([loadEquipment(), loadBookings()]);

    // 사이드바 메뉴 클릭 이벤트 등록
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            goToPage(page);
        });
    });

    // 첫 번째 페이지(대시보드) 렌더링
    renderDashboard();
    renderEquipmentPage();
    renderManagePage();
    renderBookingPage();
}

// 사이드바 유저 정보 렌더링
function renderUserInfo() {
    const name  = currentUser.displayName || '부원';
    const email = currentUser.email || '';
    const photo = currentUser.photoURL;

    document.getElementById('userName').textContent  = name;
    document.getElementById('userEmail').textContent = email;

    const avatarEl = document.getElementById('userAvatar');
    if (photo) {
        avatarEl.innerHTML = `<img src="${photo}" alt="${name}">`;
    } else {
        // 사진 없으면 이름 첫 글자
        avatarEl.textContent = name.charAt(0);
    }

    document.getElementById('dashboardTitle').textContent = `안녕하세요, ${name}님 👋`;
}

// ============================================================
// 3. 페이지 전환
// ============================================================

// 전역으로 노출 (HTML onclick에서 호출하기 위해)
window.goToPage = function(pageName) {
    // 모든 페이지 숨기기
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // 선택한 페이지 보이기
    document.getElementById(`page-${pageName}`).classList.add('active');

    // 사이드바 활성 메뉴 업데이트
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });
};

// ============================================================
// 4. 데이터 로드 (Firestore에서 가져오기)
// ============================================================

// 장비 목록 불러오기
async function loadEquipment() {
    try {
        const snap = await getDocs(collection(db, 'equipment'));
        allEquipment = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('장비 로드 실패:', e);
        showToast('장비 목록을 불러오지 못했습니다.', 'error');
    }
}

// 신청 목록 불러오기 (전체 — 달력용)
async function loadBookings() {
    try {
        const q    = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error('신청 목록 로드 실패:', e);
    }
}

// 내 신청만 필터링
function myBookings() {
    return allBookings.filter(b => b.userId === currentUser.uid);
}

// ============================================================
// 5. 대시보드 렌더링
// ============================================================

function renderDashboard() {
    renderCalendar();
    renderMyBookingsMini();
}

// ── 달력 렌더링 ─────────────────────────────────────────────
function renderCalendar() {
    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    document.getElementById('calendarTitle').textContent = `${calYear}년 ${months[calMonth]}`;

    const today     = new Date();
    const firstDay  = new Date(calYear, calMonth, 1).getDay();  // 이달 1일의 요일 (0=일)
    const lastDate  = new Date(calYear, calMonth + 1, 0).getDate(); // 이달 마지막 날

    // 이달에 신청된 날짜들 모으기
    const bookedDays   = new Set(); // 다른 사람 신청
    const myDays       = new Set(); // 내 신청

    allBookings.forEach(b => {
        if (b.status === 'cancelled') return;
        const dates = getBookingDates(b);
        dates.forEach(dateStr => {
            const d = new Date(dateStr);
            if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
                const day = d.getDate();
                if (b.userId === currentUser.uid) myDays.add(day);
                else bookedDays.add(day);
            }
        });
    });

    const container = document.getElementById('calendarDays');
    container.innerHTML = '';

    // 앞쪽 빈 칸 (이달 1일 전 빈 공간)
    for (let i = 0; i < firstDay; i++) {
        container.insertAdjacentHTML('beforeend', '<div class="calendar-day empty"></div>');
    }

    // 날짜 채우기
    for (let d = 1; d <= lastDate; d++) {
        const isToday   = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
        const dayOfWeek = (firstDay + d - 1) % 7; // 0=일, 6=토
        const dateStr   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

        let classes = 'calendar-day';
        if (isToday)       classes += ' today';
        if (dayOfWeek === 0) classes += ' sunday';
        if (dayOfWeek === 6) classes += ' saturday';

        let eventsHTML = '';
        if (myDays.has(d))     eventsHTML += `<span class="event-dot" style="background:var(--success)"></span>`;
        if (bookedDays.has(d)) eventsHTML += `<span class="event-dot"></span>`;

        container.insertAdjacentHTML('beforeend', `
            <div class="${classes}" data-date="${dateStr}" onclick="showDayDetail('${dateStr}')">
                <span class="day-number">${d}</span>
                <div class="day-events">${eventsHTML}</div>
            </div>
        `);
    }
}

// 달력 이전/다음 버튼 (월 이동 시 상세 패널도 닫힘)
document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    closeDayDetail();
    renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    closeDayDetail();
    renderCalendar();
});
document.getElementById('calToday').addEventListener('click', () => {
    calYear  = new Date().getFullYear();
    calMonth = new Date().getMonth();
    closeDayDetail();
    renderCalendar();
});

// closeDayDetail 정의 (모듈 내부 + HTML onclick 양쪽에서 사용)
function closeDayDetail() {
    document.getElementById('dayDetailCard').classList.add('hidden');
    document.getElementById('myBookingsCard').classList.remove('hidden');
    document.querySelectorAll('#calendarDays .calendar-day').forEach(el => {
        el.classList.remove('selected');
    });
}
window.closeDayDetail = closeDayDetail;

// 신청의 모든 날짜 배열로 반환 (range면 중간 날짜들도 포함)
function getBookingDates(booking) {
    const dates = [];
    if (booking.type === 'single') {
        if (booking.date) dates.push(booking.date);
    } else if (booking.type === 'range') {
        if (booking.startDate && booking.endDate) {
            const start = new Date(booking.startDate);
            const end   = new Date(booking.endDate);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0]);
            }
        }
    }
    return dates;
}

// ── 내 신청 미니 목록 ────────────────────────────────────────
function renderMyBookingsMini() {
    const container = document.getElementById('myBookingsMini');
    const today     = new Date().toISOString().split('T')[0];

    // 활성 신청 중 오늘 이후 것만
    const upcoming = myBookings()
        .filter(b => b.status !== 'cancelled')
        .filter(b => {
            const latestDate = b.type === 'range' ? b.endDate : b.date;
            return latestDate >= today;
        })
        .slice(0, 5); // 최대 5개

    if (upcoming.length === 0) {
        container.innerHTML = `
            <div class="booking-mini-empty">
                아직 예약된 장비가 없습니다<br>
                <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="goToPage('booking')">
                    신청하기
                </button>
            </div>`;
        return;
    }

    container.innerHTML = upcoming.map(b => {
        const equip = allEquipment.find(e => e.id === b.equipmentId);
        const name  = equip?.name || b.equipmentName || '장비';
        const dateStr = formatBookingDate(b);
        return `
            <div class="booking-mini-item">
                <div class="booking-mini-name">${escHtml(name)}</div>
                <div class="booking-mini-date">${escHtml(dateStr)}</div>
            </div>`;
    }).join('');
}

// ── 날짜 클릭 → 상세 패널 ───────────────────────────────────
window.showDayDetail = function(dateStr) {
    const days    = ['일','월','화','수','목','금','토'];
    const d       = new Date(dateStr + 'T00:00:00');
    const dayName = days[d.getDay()];
    const label   = `${d.getMonth()+1}월 ${d.getDate()}일 (${dayName})`;

    // 달력에서 선택된 날짜 하이라이트 처리
    document.querySelectorAll('#calendarDays .calendar-day').forEach(el => {
        el.classList.toggle('selected', el.dataset.date === dateStr);
    });

    // 이 날짜의 신청 목록 (취소 제외)
    const dayBookings = allBookings.filter(b =>
        b.status !== 'cancelled' && getBookingDates(b).includes(dateStr)
    );

    // 패널 내용 채우기
    document.getElementById('dayDetailTitle').textContent = label;
    document.getElementById('dayDetailSubtitle').textContent =
        dayBookings.length === 0 ? '신청 없음' : `신청 ${dayBookings.length}건`;

    const list = document.getElementById('dayDetailList');

    if (dayBookings.length === 0) {
        list.innerHTML = `
            <div class="day-no-bookings">
                <div class="day-no-bookings-icon">📅</div>
                이 날짜에 신청된 장비가 없습니다
            </div>`;
    } else {
        list.innerHTML = dayBookings.map(b => {
            const equip  = allEquipment.find(e => e.id === b.equipmentId);
            const isMine = b.userId === currentUser.uid;
            const name   = equip?.name || b.equipmentName || '장비';
            const who    = isMine ? '나' : (b.userName || '부원');

            // 시간대 표시: 하루 신청이면 ET/EP1/EP2, 여러 날이면 "기간 사용"
            const timeLabel = b.type === 'single' && b.timeSlots?.length
                ? b.timeSlots.join(' · ')
                : '기간 사용';

            const purposeHTML = b.purpose
                ? `<div class="day-booking-purpose">💬 ${escHtml(b.purpose)}</div>`
                : '';

            return `
                <div class="day-booking-entry ${isMine ? 'mine' : ''}">
                    <div class="day-booking-equip">${escHtml(name)}</div>
                    <div class="day-booking-meta">
                        <div class="day-booking-who">
                            👤 ${escHtml(who)}${isMine ? ' <span style="color:var(--success);font-weight:700">(나)</span>' : ''}
                        </div>
                        <div class="day-booking-time">🕐 ${escHtml(timeLabel)}</div>
                    </div>
                    ${purposeHTML}
                </div>`;
        }).join('');
    }

    // "이 날 신청하기" 버튼 — 신청 페이지의 날짜를 미리 설정
    document.getElementById('dayDetailBookBtn').onclick = () => {
        goToPage('booking');
        setTimeout(() => {
            document.getElementById('singleDate').value = dateStr;
            updateBookingPreview();
        }, 100);
    };

    // 패널 보이기 / 내 신청 목록 숨기기
    document.getElementById('dayDetailCard').classList.remove('hidden');
    document.getElementById('myBookingsCard').classList.add('hidden');
};

// ============================================================
// 6. 장비 사용현황 페이지
// ============================================================

// 오늘 날짜를 기본값으로 설정
const equipDateFilter = document.getElementById('equipmentDateFilter');
equipDateFilter.value = new Date().toISOString().split('T')[0];

equipDateFilter.addEventListener('change', renderEquipmentPage);
document.getElementById('equipmentTodayBtn').addEventListener('click', () => {
    equipDateFilter.value = new Date().toISOString().split('T')[0];
    renderEquipmentPage();
});

function renderEquipmentPage() {
    const selectedDate = equipDateFilter.value;
    const grid = document.getElementById('equipmentGrid');

    if (allEquipment.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <p>등록된 장비가 없습니다</p>
            <p style="font-size:0.75rem">Firebase 콘솔에서 equipment 컬렉션에 장비를 추가해주세요</p>
        </div>`;
        return;
    }

    document.getElementById('equipmentCount').textContent = `총 ${allEquipment.length}개`;

    grid.innerHTML = allEquipment.map(equip => {
        // 선택한 날짜에 이 장비가 신청되어 있는지 확인
        const bookingsOnDate = allBookings.filter(b =>
            b.equipmentId === equip.id &&
            b.status !== 'cancelled' &&
            getBookingDates(b).includes(selectedDate)
        );

        const isAvailable = bookingsOnDate.length === 0;
        const isMine = bookingsOnDate.some(b => b.userId === currentUser.uid);

        let badgeHTML;
        if (isAvailable) {
            badgeHTML = `<span class="badge badge-success">사용 가능</span>`;
        } else if (isMine) {
            badgeHTML = `<span class="badge badge-primary">내가 사용 중</span>`;
        } else {
            const booker = bookingsOnDate[0]?.userName || '다른 부원';
            badgeHTML = `<span class="badge badge-danger">${escHtml(booker)} 사용 중</span>`;
        }

        const imgHTML = equip.imageUrl
            ? `<img src="${escHtml(equip.imageUrl)}" alt="${escHtml(equip.name)}" class="equipment-img"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
        const placeholderHTML = `<div class="equipment-img-placeholder" ${equip.imageUrl ? 'style="display:none"' : ''}>
            ${equip.emoji || '📷'}
        </div>`;

        return `
            <div class="equipment-card" onclick="openEquipmentModal('${equip.id}')">
                ${imgHTML}${placeholderHTML}
                <div class="equipment-card-body">
                    <div class="equipment-card-name">${escHtml(equip.name)}</div>
                    <div class="equipment-card-desc">${escHtml(equip.description || '')}</div>
                    <div class="equipment-card-status">${badgeHTML}</div>
                </div>
            </div>`;
    }).join('');
}

// ── 장비 상세 모달 ───────────────────────────────────────────
window.openEquipmentModal = function(equipId) {
    const equip = allEquipment.find(e => e.id === equipId);
    if (!equip) return;
    selectedEquipId = equipId;

    document.getElementById('modalEquipmentName').textContent = equip.name;
    document.getElementById('modalEquipmentDesc').textContent = equip.description || '';

    // 이미지
    const imgContainer = document.getElementById('modalEquipmentImg');
    imgContainer.innerHTML = equip.imageUrl
        ? `<img src="${escHtml(equip.imageUrl)}" alt="${escHtml(equip.name)}" class="modal-equipment-img"
                onerror="this.classList.add('hidden');document.getElementById('modalImgFallback').style.display='flex'">
           <div id="modalImgFallback" class="modal-equipment-img-placeholder" style="display:none">${equip.emoji || '📷'}</div>`
        : `<div class="modal-equipment-img-placeholder">${equip.emoji || '📷'}</div>`;

    // 오늘 상태 배지
    const today     = new Date().toISOString().split('T')[0];
    const todayBook = allBookings.filter(b =>
        b.equipmentId === equipId &&
        b.status !== 'cancelled' &&
        getBookingDates(b).includes(today)
    );
    const statusHTML = todayBook.length === 0
        ? `<span class="badge badge-success" style="margin-top:4px">오늘 사용 가능</span>`
        : `<span class="badge badge-danger" style="margin-top:4px">오늘 사용 중</span>`;
    document.getElementById('modalEquipmentStatus').innerHTML = statusHTML;

    // 모달 달력을 오늘 달로 초기화한 후 렌더링
    modalCalYear  = new Date().getFullYear();
    modalCalMonth = new Date().getMonth();
    renderModalCalendar(equipId);

    // 신청하기 버튼 — 장비를 미리 선택하고 신청 페이지로
    document.getElementById('modalBookBtn').onclick = () => {
        closeModal('equipmentModal');
        goToPage('booking');
        // 신청 페이지의 해당 장비 선택
        setTimeout(() => selectEquipmentForBooking(equipId), 100);
    };

    openModal('equipmentModal');
};

// 모달 달력 렌더링 (이전/다음 달 이동 가능)
function renderModalCalendar(equipId) {
    const months   = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const year     = modalCalYear;
    const month    = modalCalMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today    = new Date().toISOString().split('T')[0];

    // 달력 제목 업데이트
    document.getElementById('modalCalTitle').textContent = `${year}년 ${months[month]}`;

    // 이 장비의 신청 중 이번 달 것
    const bookedDates = new Set(); // 다른 사람
    const myDates     = new Set(); // 나

    allBookings.filter(b => b.equipmentId === equipId && b.status !== 'cancelled')
        .forEach(b => {
            getBookingDates(b).forEach(dateStr => {
                const d = new Date(dateStr + 'T00:00:00');
                if (d.getFullYear() === year && d.getMonth() === month) {
                    const day = d.getDate();
                    if (b.userId === currentUser.uid) myDates.add(day);
                    else bookedDates.add(day);
                }
            });
        });

    const container = document.getElementById('modalCalendarDays');
    container.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        container.insertAdjacentHTML('beforeend', '<div class="calendar-day empty"></div>');
    }

    for (let d = 1; d <= lastDate; d++) {
        const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday   = dateStr === today;
        const isMine    = myDates.has(d);
        const isBooked  = bookedDates.has(d);
        const dayOfWeek = (firstDay + d - 1) % 7;

        let style = '';
        if (isMine)        style = 'background:var(--success-bg);';
        else if (isBooked) style = 'background:var(--primary-bg);';

        let classes = 'calendar-day';
        if (isToday)         classes += ' today';
        if (dayOfWeek === 0) classes += ' sunday';
        if (dayOfWeek === 6) classes += ' saturday';

        // 신청이 있는 날만 클릭 가능 (onclick 추가)
        const hasBooking = isMine || isBooked;
        const onclick    = hasBooking
            ? `onclick="showModalDayDetail('${dateStr}', '${equipId}')"`
            : '';
        const cursor     = hasBooking ? 'cursor:pointer' : 'cursor:default';

        container.insertAdjacentHTML('beforeend', `
            <div class="${classes}" style="${style}${cursor}" ${onclick}>
                <span class="day-number">${d}</span>
            </div>`);
    }

    // 날짜 상세 패널 닫기 (월 이동 시)
    document.getElementById('modalDayDetail').classList.add('hidden');
}

// 모달 달력 날짜 클릭 → 신청 상세 표시
window.showModalDayDetail = function(dateStr, equipId) {
    const days    = ['일','월','화','수','목','금','토'];
    const d       = new Date(dateStr + 'T00:00:00');
    const label   = `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;

    // 이 날짜 + 이 장비의 신청 목록
    const dayBookings = allBookings.filter(b =>
        b.equipmentId === equipId &&
        b.status !== 'cancelled' &&
        getBookingDates(b).includes(dateStr)
    );

    document.getElementById('modalDayDetailTitle').textContent = label;

    const list = document.getElementById('modalDayDetailList');
    if (dayBookings.length === 0) {
        list.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted)">신청 내역이 없습니다</p>`;
    } else {
        list.innerHTML = dayBookings.map(b => {
            const isMine   = b.userId === currentUser.uid;
            const who      = isMine ? '나' : (b.userName || '부원');
            const slots    = b.timeSlots?.join(' · ') || '—';
            const purpose  = b.purpose || '목적 미기재';
            const color    = isMine ? 'var(--success)' : 'var(--primary)';
            return `
                <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);last-child:border-bottom:none">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                        <span style="font-size:0.8rem;font-weight:700;color:${color}">👤 ${escHtml(who)}</span>
                        <span style="font-size:0.74rem;font-weight:600;color:var(--primary-dark)">🕐 ${escHtml(slots)}</span>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-secondary)">💬 ${escHtml(purpose)}</div>
                </div>`;
        }).join('');
    }

    document.getElementById('modalDayDetail').classList.remove('hidden');
};

// 모달 달력 이전/다음 달 버튼
document.getElementById('modalCalPrev').addEventListener('click', () => {
    modalCalMonth--;
    if (modalCalMonth < 0) { modalCalMonth = 11; modalCalYear--; }
    renderModalCalendar(selectedEquipId);
});
document.getElementById('modalCalNext').addEventListener('click', () => {
    modalCalMonth++;
    if (modalCalMonth > 11) { modalCalMonth = 0; modalCalYear++; }
    renderModalCalendar(selectedEquipId);
});

// 모달 열기/닫기
function openModal(id) {
    const overlay = document.getElementById(id);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('visible');
    setTimeout(() => {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }, 220);
}

document.getElementById('modalClose').addEventListener('click',    () => closeModal('equipmentModal'));
document.getElementById('modalCloseBtn').addEventListener('click', () => closeModal('equipmentModal'));
document.getElementById('editModalClose').addEventListener('click',      () => closeModal('editModal'));
document.getElementById('editModalCancelBtn').addEventListener('click',  () => closeModal('editModal'));

// 모달 바깥 클릭 시 닫기
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// ============================================================
// 7. 신청 관리 페이지
// ============================================================

let currentManageFilter = 'active';

document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentManageFilter = tab.dataset.filter;
        renderManagePage();
    });
});

function renderManagePage() {
    const container = document.getElementById('bookingsList');
    const today     = new Date().toISOString().split('T')[0];
    let list        = myBookings();

    // 필터 적용
    if (currentManageFilter === 'active') {
        list = list.filter(b => b.status !== 'cancelled' && getLatestDate(b) >= today);
    } else if (currentManageFilter === 'past') {
        list = list.filter(b => b.status !== 'cancelled' && getLatestDate(b) < today);
    } else if (currentManageFilter === 'cancelled') {
        list = list.filter(b => b.status === 'cancelled');
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
                    <rect x="9" y="3" width="6" height="4" rx="1"></rect>
                </svg>
                <p>해당하는 신청 내역이 없습니다</p>
                ${currentManageFilter === 'active'
                    ? `<button class="btn btn-primary btn-sm" onclick="goToPage('booking')">신청하기</button>`
                    : ''}
            </div>`;
        return;
    }

    container.innerHTML = list.map(b => {
        const equip      = allEquipment.find(e => e.id === b.equipmentId);
        const name       = equip?.name || b.equipmentName || '장비';
        const dateStr    = formatBookingDate(b);
        const isCancelled = b.status === 'cancelled';
        const isPast      = getLatestDate(b) < today;

        const imgHTML = equip?.imageUrl
            ? `<img src="${escHtml(equip.imageUrl)}" alt="" class="booking-item-img"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
        const placeholderHTML = `<div class="booking-item-img-placeholder" ${equip?.imageUrl ? 'style="display:none"' : ''}>
            ${equip?.emoji || '📷'}
        </div>`;

        let badgeHTML;
        if (isCancelled) badgeHTML = `<span class="badge badge-muted">취소됨</span>`;
        else if (isPast) badgeHTML = `<span class="badge badge-muted">완료</span>`;
        else             badgeHTML = `<span class="badge badge-success">사용 예정</span>`;

        const actionsHTML = (!isCancelled && !isPast) ? `
            <button class="btn btn-outline btn-sm" onclick="openEditModal('${b.id}')">
                기간 변경
            </button>
            <button class="btn btn-danger btn-sm" onclick="cancelBooking('${b.id}')">
                취소
            </button>` : '';

        return `
            <div class="booking-item ${isCancelled ? 'cancelled' : ''}">
                ${imgHTML}${placeholderHTML}
                <div class="booking-item-info">
                    <div class="booking-item-name">${escHtml(name)}</div>
                    <div class="booking-item-date">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${escHtml(dateStr)}
                    </div>
                    ${b.purpose ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:3px">${escHtml(b.purpose)}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
                    ${badgeHTML}
                    <div class="booking-item-actions">${actionsHTML}</div>
                </div>
            </div>`;
    }).join('');
}

// 신청 취소
window.cancelBooking = async function(bookingId) {
    if (!confirm('신청을 취소하시겠습니까?')) return;
    try {
        await updateDoc(doc(db, 'bookings', bookingId), {
            status: 'cancelled',
            cancelledAt: Timestamp.now()
        });
        // 로컬 데이터 업데이트
        const idx = allBookings.findIndex(b => b.id === bookingId);
        if (idx !== -1) allBookings[idx].status = 'cancelled';
        renderManagePage();
        renderMyBookingsMini();
        renderCalendar();
        showToast('신청이 취소되었습니다.', 'success');
    } catch (e) {
        console.error(e);
        showToast('취소 중 오류가 발생했습니다.', 'error');
    }
};

// 기간 변경 모달 열기
window.openEditModal = function(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return;
    editingBookingId = bookingId;

    const body = document.getElementById('editModalBody');

    // 날짜 + 시간대 변경 폼
    body.innerHTML = `
        <div class="form-group">
            <label class="form-label">날짜</label>
            <input type="date" id="editDate" class="form-input" value="${booking.date || ''}">
        </div>
        <div class="form-group">
            <label class="form-label">시간대</label>
            <div class="timeslot-group">
                ${['ET','EP1','EP2'].map(slot => `
                    <label class="timeslot-label">
                        <input type="checkbox" name="editSlot" value="${slot}"
                               ${(booking.timeSlots||[]).includes(slot) ? 'checked' : ''}>
                        <span class="timeslot-chip">${slot}</span>
                    </label>`).join('')}
            </div>
        </div>`;

    openModal('editModal');
};

// 기간 변경 저장
document.getElementById('editModalSaveBtn').addEventListener('click', async () => {
    const booking = allBookings.find(b => b.id === editingBookingId);
    if (!booking) return;

    const newDate  = document.getElementById('editDate')?.value;
    const newSlots = [...document.querySelectorAll('[name="editSlot"]:checked')].map(c => c.value);

    if (!newDate)            return showToast('날짜를 선택해주세요.', 'error');
    if (newSlots.length === 0) return showToast('시간대를 1개 이상 선택해주세요.', 'error');
    if (newDate < new Date().toISOString().split('T')[0])
        return showToast('과거 날짜로는 변경할 수 없습니다.', 'error');

    // 변경 후 중복 신청 확인 (자기 자신 제외)
    const conflicting = allBookings.filter(b =>
        b.id !== editingBookingId &&
        b.equipmentId === booking.equipmentId &&
        b.status !== 'cancelled' &&
        getBookingDates(b).includes(newDate) &&
        (b.timeSlots || []).some(s => newSlots.includes(s))
    );
    if (conflicting.length > 0) {
        const blocker = conflicting[0].userName || '다른 부원';
        return showToast(`변경하려는 날짜/시간대는 "${blocker}"이(가) 이미 신청한 일정과 겹칩니다.`, 'error');
    }

    const updateData = { date: newDate, timeSlots: newSlots };

    try {
        await updateDoc(doc(db, 'bookings', editingBookingId), updateData);
        const idx = allBookings.findIndex(b => b.id === editingBookingId);
        if (idx !== -1) Object.assign(allBookings[idx], updateData);
        closeModal('editModal');
        renderManagePage();
        renderMyBookingsMini();
        renderCalendar();
        showToast('기간이 변경되었습니다.', 'success');
    } catch (e) {
        console.error(e);
        showToast('변경 중 오류가 발생했습니다.', 'error');
    }
});

// ============================================================
// 8. 사용 신청 작성 페이지
// ============================================================

function renderBookingPage() {
    // 장비 선택 그리드 렌더링
    const grid = document.getElementById('equipmentSelectorGrid');
    if (allEquipment.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;grid-column:1/-1;padding:12px">
            등록된 장비가 없습니다</p>`;
        return;
    }

    grid.innerHTML = allEquipment.map(equip => {
        const imgHTML = equip.imageUrl
            ? `<img src="${escHtml(equip.imageUrl)}" alt="${escHtml(equip.name)}" class="equipment-select-img"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
        const phHTML = `<div class="equipment-select-img-placeholder" ${equip.imageUrl ? 'style="display:none"' : ''}>
            ${equip.emoji || '📷'}
        </div>`;

        return `
            <div class="equipment-select-item" data-equip-id="${equip.id}" onclick="selectEquipmentForBooking('${equip.id}')">
                ${imgHTML}${phHTML}
                <span class="equipment-select-name">${escHtml(equip.name)}</span>
            </div>`;
    }).join('');

    // 날짜 기본값: 오늘
    document.getElementById('singleDate').value = new Date().toISOString().split('T')[0];
}

// 신청 페이지에서 장비 선택
window.selectEquipmentForBooking = function(equipId) {
    selectedEquipForBooking = equipId;
    document.querySelectorAll('.equipment-select-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.equipId === equipId);
    });
    updateBookingPreview();
};

// 입력 변경 시 미리보기 업데이트
document.getElementById('singleDate')?.addEventListener('change', updateBookingPreview);
document.querySelectorAll('[name="timeSlot"]').forEach(cb => {
    cb.addEventListener('change', updateBookingPreview);
});
document.getElementById('bookingPurpose').addEventListener('input', updateBookingPreview);

function updateBookingPreview() {
    const preview = document.getElementById('bookingPreview');
    const equip   = allEquipment.find(e => e.id === selectedEquipForBooking);
    if (!equip) { preview.classList.add('hidden'); return; }

    preview.classList.remove('hidden');
    document.getElementById('previewEquipment').textContent = equip.name;
    document.getElementById('previewUser').textContent =
        currentUser?.displayName || currentUser?.email || '나';

    const date  = document.getElementById('singleDate').value;
    const slots = [...document.querySelectorAll('[name="timeSlot"]:checked')].map(c => c.value);
    document.getElementById('previewDate').textContent =
        date ? formatDate(date) : '날짜 미선택';
    document.getElementById('previewTimes').textContent =
        slots.length > 0 ? slots.join(', ') : '시간대 미선택';
}

// 신청 초기화
window.resetBookingForm = function() {
    selectedEquipForBooking = null;
    document.querySelectorAll('.equipment-select-item').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('[name="timeSlot"]').forEach(cb => cb.checked = false);
    document.getElementById('bookingPurpose').value = '';
    document.getElementById('bookingPreview').classList.add('hidden');
    document.getElementById('singleDate').value = new Date().toISOString().split('T')[0];
};

// 신청 제출
document.getElementById('submitBookingBtn').addEventListener('click', async () => {
    // ── 유효성 검사 ──
    if (!selectedEquipForBooking) {
        return showToast('장비를 선택해주세요.', 'error');
    }

    const purpose = document.getElementById('bookingPurpose').value.trim();
    if (!purpose) {
        return showToast('사용 목적을 입력해주세요.', 'error');
    }

    const today = new Date().toISOString().split('T')[0];
    const date  = document.getElementById('singleDate').value;
    const slots = [...document.querySelectorAll('[name="timeSlot"]:checked')].map(c => c.value);

    // ── 날짜·시간대 유효성 검사 ──
    if (!date)              return showToast('날짜를 선택해주세요.', 'error');
    if (date < today)       return showToast('오늘 이후 날짜를 선택해주세요.', 'error');
    if (slots.length === 0) return showToast('시간대(ET / EP1 / EP2)를 1개 이상 선택해주세요.', 'error');

    // ── 중복 신청 확인: 같은 장비 + 같은 날 + 겹치는 시간대 ──
    const conflicting = allBookings.filter(b =>
        b.equipmentId === selectedEquipForBooking &&
        b.status !== 'cancelled' &&
        getBookingDates(b).includes(date) &&
        (b.timeSlots || []).some(s => slots.includes(s))
    );
    if (conflicting.length > 0) {
        // 누가 겹치는지 알려줌
        const blockedSlots = [...new Set(
            conflicting.flatMap(b => (b.timeSlots || []).filter(s => slots.includes(s)))
        )].join(', ');
        const blocker = conflicting[0].userName || '다른 부원';
        return showToast(
            `${formatDate(date)} ${blockedSlots} 시간대는 이미 "${blocker}"이(가) 신청했습니다.`,
            'error'
        );
    }

    const bookingData = {
        equipmentId:   selectedEquipForBooking,
        equipmentName: allEquipment.find(e => e.id === selectedEquipForBooking)?.name || '',
        userId:        currentUser.uid,
        userName:      currentUser.displayName || currentUser.email,
        userEmail:     currentUser.email,
        purpose:       purpose,
        status:        'active',
        type:          'single',
        date,
        timeSlots:     slots,
        createdAt:     Timestamp.now()
    };

    // ── Firestore에 저장 ──
    const btn = document.getElementById('submitBookingBtn');
    btn.disabled = true;
    btn.textContent = '신청 중...';

    try {
        const docRef = await addDoc(collection(db, 'bookings'), bookingData);
        allBookings.unshift({ id: docRef.id, ...bookingData }); // 로컬에도 추가

        showToast('신청이 완료되었습니다! 🎉', 'success');
        resetBookingForm();

        // 다른 페이지들 업데이트
        renderManagePage();
        renderMyBookingsMini();
        renderCalendar();
        renderEquipmentPage();

        // 잠깐 후 관리 페이지로 이동
        setTimeout(() => goToPage('manage'), 1200);

    } catch (e) {
        console.error('신청 저장 실패:', e);
        showToast('신청 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg> 신청 완료`;
    }
});

// ============================================================
// 9. 유틸리티 함수들
// ============================================================

// 신청의 마지막 날짜 반환 (정렬/필터용)
function getLatestDate(booking) {
    if (booking.type === 'range') return booking.endDate || '';
    return booking.date || '';
}

// 신청 날짜 보기 좋게 포맷
function formatBookingDate(booking) {
    if (booking.type === 'single') {
        const slots = (booking.timeSlots || []).join(', ');
        return `${formatDate(booking.date)} ${slots ? `(${slots})` : ''}`;
    } else {
        return `${formatDate(booking.startDate)} ~ ${formatDate(booking.endDate)}`;
    }
}

// "2024-03-15" → "3월 15일 (금)" 형식으로 변환
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d    = new Date(dateStr + 'T00:00:00');
    const days = ['일','월','화','수','목','금','토'];
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// XSS 방지: HTML 특수문자 이스케이프
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 토스트 알림 표시
function showToast(message, type = 'default') {
    const container = document.getElementById('toastContainer');
    const toast     = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        default: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line></svg>`
    };

    toast.innerHTML = `${icons[type] || icons.default}<span>${escHtml(message)}</span>`;
    container.appendChild(toast);

    // 3초 후 자동 제거
    setTimeout(() => toast.remove(), 3200);
}

// ============================================================
// 끝
// ============================================================
