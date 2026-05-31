// =====================================================
// Firebase 설정 파일
// =====================================================
// 아래 값들을 Firebase 콘솔에서 복사해서 넣어야 해요.
//
// 설정 방법:
// 1. https://console.firebase.google.com 접속
// 2. 새 프로젝트 만들기 (프로젝트 이름 예: "cjs-broadcasting")
// 3. 프로젝트 설정 > 일반 탭 > "앱 추가" > 웹(</>)
// 4. 앱 이름 입력 후 "앱 등록"
// 5. 아래에 나오는 firebaseConfig 값들을 복사해서 여기에 붙여넣기
// =====================================================

export const firebaseConfig = {
    apiKey: "AIzaSyB8VldIbWFmI0uJUiqbRAuCVYfyQ_fW_Uo",
    authDomain: "ctnjs-c57e7.firebaseapp.com",
    projectId: "ctnjs-c57e7",
    storageBucket: "ctnjs-c57e7.firebasestorage.app",
    messagingSenderId: "297434674897",
    appId: "1:297434674897:web:d5702c813a005232efb7f0"
};

// =====================================================
// Firebase 콘솔에서 해야 할 추가 설정
// =====================================================
// [Authentication 설정]
// - Firebase 콘솔 > Authentication > Sign-in method
// - Google 활성화 > 프로젝트의 공개 이름과 이메일 입력 > 저장
//
// [Firestore 설정]
// - Firebase 콘솔 > Firestore Database > 데이터베이스 만들기
// - 테스트 모드로 시작 선택 (나중에 보안 규칙 수정 가능)
// - 서버 위치: asia-northeast3 (서울)
//
// [Firestore 보안 규칙 설정]
// - Firestore > 규칙 탭에 아래 규칙 붙여넣기:
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 허용된 이메일 목록은 읽기만 가능
    match /allowedEmails/{emailKey} {
      allow read: if request.auth != null;
      allow write: if false; // 콘솔에서만 수정 가능
    }
    // 장비 정보는 로그인한 사람 누구나 읽기 가능
    match /equipment/{equipmentId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    // 신청 내역: 로그인한 사람은 읽기/쓰기 가능, 자신의 신청만 수정/삭제
    match /bookings/{bookingId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        request.auth.uid == resource.data.userId;
    }
  }
}
*/
// =====================================================
// 부원 계정 등록 방법 (Firestore 콘솔에서 직접)
// =====================================================
// Firestore > 데이터 탭 > 컬렉션 시작 > allowedEmails
// 문서 ID: 이메일에서 점(.)을 _로, @를 _at_으로 바꾼 것
//   예) hong@school.hs.kr → hong_at_school_hs_kr
// 필드: allowed = true (boolean), name = "홍길동" (string)
