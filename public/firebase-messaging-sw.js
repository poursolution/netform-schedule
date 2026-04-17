// Firebase Messaging Service Worker
// 백그라운드에서 푸시 알림을 수신합니다

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase 설정 (기존 프로젝트와 동일)
firebase.initializeApp({
  apiKey: "AIzaSyCzngaCcenhH1tmZ7syugpI3H1wYBVhiJQ",
  authDomain: "test-168a4.firebaseapp.com",
  databaseURL: "https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-168a4",
  storageBucket: "test-168a4.firebasestorage.app",
  messagingSenderId: "955362696992",
  appId: "1:955362696992:web:234b098db17412be27c145"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신
messaging.onBackgroundMessage((payload) => {
  console.log('백그라운드 메시지 수신:', payload);
  
  const notificationTitle = payload.notification?.title || '영업일정 알림';
  const notificationOptions = {
    body: payload.notification?.body || '새로운 알림이 있습니다.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'schedule-notification',
    data: payload.data,
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    // 앱 열기
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // 이미 열려있는 창이 있으면 포커스
          for (const client of clientList) {
            if (client.url.includes('index.html') && 'focus' in client) {
              return client.focus();
            }
          }
          // 없으면 새 창 열기
          if (clients.openWindow) {
            return clients.openWindow('./index.html');
          }
        })
    );
  }
});

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('Service Worker 설치됨');
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('Service Worker 활성화됨');
  event.waitUntil(clients.claim());
});
