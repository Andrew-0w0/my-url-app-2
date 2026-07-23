// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.startsWith("192.168.") ||
  window.location.hostname.startsWith("10.");

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAa4_vNZ88k38xgsRYBsrUjuc5Ov4V1xJ0",
  authDomain: isLocalhost ? "my-url-app-2.firebaseapp.com" : window.location.hostname,
  projectId: "my-url-app-2",
  storageBucket: "my-url-app-2.appspot.com", // ⚠️ 這裡改成 .appspot.com
  messagingSenderId: "730412375945",
  appId: "1:730412375945:web:adf91b2ebd1d83b5e3cb58",
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// Firestore
const db = getFirestore(app);

// Firebase Auth + Google Provider
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Firebase Storage
const storage = getStorage(app);

export { db, auth, provider, storage };
