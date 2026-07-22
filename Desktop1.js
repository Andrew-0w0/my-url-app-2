// src/components/Desktop1.js
import React, { useState, useRef, useEffect } from "react";
import Microlink from "@microlink/react";
import logo from "../images/Logo.png";
import failImage from "../images/fail.png";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db, auth, provider } from "../firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { Home, Pencil, PencilOff, GalleryHorizontalEnd, LogOut, Music, Plus ,LogIn } from "lucide-react";

// 新增一個媒體查詢 hook
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    
    media.addEventListener("change", listener);
    
    return () => media.removeEventListener("change", listener);

  }, [query]);

  return matches;
};

export default function Desktop1() {
  const [url, setUrl] = useState("");
  const [homeCards, setHomeCards] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [musicCards, setMusicCards] = useState([]);

  const isMobile = useMediaQuery("(max-width: 600px)"); // 判斷是否為手機版

  const idRef = useRef(0);
  const dragItem = useRef(null);

  const CARD_SIZE = isMobile ? "100%" : 300; // 手機版卡片寬度為 100%
  const CARD_RADIUS = 8;
  const INPUT_WIDTH = isMobile ? "100%" : 280; // 手機版輸入框寬度為 100%

  useEffect(() => {
    // 當這個元件被顯示時，設定整個網頁的背景色
    document.body.style.backgroundColor = "#111";
    // 當元件消失時，把背景色清掉
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);

  // ✅ 首頁：監聽公開卡片（uid 為 null）
  useEffect(() => {
    const defaultCard = {
      id: ++idRef.current,
      pageUrl: "https://bento.me/anpuowo",
      title: "作者圖卡", // 預設卡片標題
      isDefault: true,
    };
    setHomeCards([defaultCard]);

    const q = query(collection(db, "cards"), where("uid", "==", null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardsData = snapshot.docs.map((doc) => ({
        id: ++idRef.current,
        ...doc.data(),
      }));
      setHomeCards((prev) => {
        const defaultCard = prev.find((p) => p.isDefault) || defaultCard;
        return [defaultCard, ...cardsData];
      });
    });
    return () => unsubscribe();
  }, []);

  // ✅ Firebase 登入監聽
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        await fetchUserCards(currentUser.uid);
        await fetchUserMusic(currentUser.uid);
      } else {
        setUser(null);
        setMyCards([]);
        setMusicCards([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ✅ 讀取個人卡片
  const fetchUserCards = async (uid) => {
    const q = query(collection(db, "cards"), where("uid", "==", uid));
    const snap = await getDocs(q);
    const cardsData = snap.docs.map((doc) => ({
      id: ++idRef.current,
      ...doc.data(),
    }));
    setMyCards(cardsData);
  };

  // ✅ 讀取個人音樂卡片
  const fetchUserMusic = async (uid) => {
    const q = query(collection(db, "music"), where("uid", "==", uid));
    const snap = await getDocs(q);
    const musicData = snap.docs.map((doc) => ({
      id: ++idRef.current,
      ...doc.data(),
    }));
    setMusicCards(musicData);
  };

  const normalizeUrlForCompare = (u = "") =>
    u.trim().replace(/\/+$/, "").toLowerCase();

  // ✅ 新增卡片
  const handleAddUrl = async () => {
    if (!url.trim()) return;

  // ✅ 個人圖卡數量上限判斷
    if (activePage === "mycards" && myCards.length >= 50) {
      alert("個人圖卡最多只能新增 50 張！");
      return;
    }

  // 🚫 未登入時禁止新增
    if (!user || !user.email?.includes("@gmail.com")) {
      alert("請先登入 Google 帳號再新增圖卡！");
      return;
    }

    const normalized = normalizeUrlForCompare(url);
    const targetCards = activePage === "home" ? homeCards : myCards;

    if (targetCards.some((it) => normalizeUrlForCompare(it.pageUrl) === normalized)) {
      alert("此網址已存在！");
      setUrl("");
      return;
    }
    if (activePage === "home" && homeCards.filter(card => !card.uid).length >= 30) {
      alert("首頁最多只能新增 30 張圖卡！");
      return;
    }

    try {
      if (activePage === "home") {
        await addDoc(collection(db, "cards"), {
          uid: null,
          email: user ? user.email : "匿名使用者",
          pageUrl: url,
          title: user
            ? `由 ${user.email.split("@")[0].toUpperCase()} 新增`
            : "匿名新增",
          createdAt: Date.now(),
        });
      } else if (user) {
        await addDoc(collection(db, "cards"), {
          uid: user.uid,
          email: user.email,
          pageUrl: url,
          title: url,
          createdAt: Date.now(),
        });
        await fetchUserCards(user.uid);
      } else {
        alert("請先登入再新增個人圖卡！");
      }
    } catch (err) {
      console.error("新增失敗:", err);
    }

    setUrl("");
  };

  // ✅ 修正版刪除邏輯
  const deleteCard = async (id, pageUrl) => {
    const activeSet = activePage === "home" ? homeCards : myCards;
    const target = activeSet.find((it) => it.id === id);
    if (!target) return;

    if (target.isDefault) {
      alert("首頁預設圖卡無法刪除");
      return;
    }

    const isAnon = !("uid" in target) || target.uid == null;

    // 🔹 首頁刪除條件
    if (activePage === "home") {
      if (!isAnon) {
        const isOwner =
          user &&
          (target.email === user.email ||
            ("uid" in target && target.uid === user.uid));
        if (!isOwner) {
          alert("你不能刪除此首頁圖卡（非本人）！");
          return;
        }
      }
      // 匿名卡 → 任何登入用戶可刪
    } else {
      // 🔹 個人頁面刪除條件
      if (!user || target.uid !== user.uid) {
        alert("只能刪除自己的個人圖卡！");
        return;
      }
    }

    try {
      const q =
        activePage === "home"
          ? isAnon
            ? query(collection(db, "cards"), where("pageUrl", "==", pageUrl), where("uid", "==", null))
            : query(
                collection(db, "cards"),
                where("pageUrl", "==", pageUrl),
                where("email", "==", target.email)
              )
          : query(
              collection(db, "cards"),
              where("pageUrl", "==", pageUrl),
              where("uid", "==", user.uid)
            );

      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await deleteDoc(doc.ref);
      }

      if (activePage === "home")
        setHomeCards((prev) => prev.filter((it) => it.id !== id));
      else setMyCards((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      console.error("刪除失敗:", err);
    }
  };

  // ✅ 修改標題（僅個人）
  const updateTitle = (id, newTitle) => {
    if (activePage !== "mycards") return;
    setMyCards((prev) =>
      prev.map((it) => (it.id === id ? { ...it, title: newTitle } : it))
    );
  };

  // ✅ 拖曳排序
  const onDragStart = (e, id) => {
    dragItem.current = id;
  };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    const fromId = dragItem.current;
    if (!fromId || fromId === targetId) return;
    const updateFn = (prev) => {
      const fromIndex = prev.findIndex((it) => it.id === fromId);
      const toIndex = prev.findIndex((it) => it.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    };
    if (activePage === "home") setHomeCards(updateFn);
    else setMyCards(updateFn);
  };

  // ✅ 顯示卡片（修正版）
  const renderCard = (item) => {
    if (!item) return null;

    const isAnon = !item.email?.includes("@gmail.com");
    const isOwnerByEmail = user && item.email === user.email;
    const isOwnerByUid = user && "uid" in item && item.uid === user.uid;
    const CARD_HEIGHT = isMobile ? 100 : 300; // 手機縮圖高度

// ✅ 控制 X 按鈕顯示條件（新版）
const showDeleteButton =
  editMode && // 必須在編輯模式中
  !item.isDefault && // 預設卡不能刪
  (
    // 🔹 個人頁邏輯
    (activePage === "mycards" && user) ||

    // 🔹 首頁邏輯
    (activePage === "home" && user && isOwnerByEmail || isAnon)
  );

    return (
      <div
        key={item.id}
        style={{
          width: CARD_SIZE,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          position: "relative",
          userSelect: "none",
        }}
        draggable={editMode && !item.isDefault && activePage === "mycards"}
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, item.id)}
      >
        {showDeleteButton && (
          <button
            onClick={() => deleteCard(item.id, item.pageUrl)}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              zIndex: 30,
              background: "#ff6e6b",
              border: "none",
              color: "#fff",
              width: 28,
              height: 28,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        )}

        <Microlink
          url={item.pageUrl || ""}
          size="large"
          style={{
            width: "100%",
            height: CARD_HEIGHT,
            borderRadius: CARD_RADIUS,
            overflow: "hidden",
          }}
          screenshot
          media="image"
          onError={(e) => (e.target.src = failImage)}
        />

        {editMode && activePage === "mycards" ? (
          <input
            type="text"
            value={item.title || ""}
            onChange={(e) => updateTitle(item.id, e.target.value)}
            style={{
              marginTop: 8,
              fontSize: 14,
              width: INPUT_WIDTH,
              color: "#000",
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "4px 6px",
              background: "#fff",
            }}
          />
        ) : (
          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#fff",
              fontWeight: "bold",
              width: INPUT_WIDTH,
            }}
          >
            {item.title || ""}
          </div>
        )}
      </div>
    );
  };

  const activeCards =
    activePage === "home"
      ? homeCards
      : activePage === "mycards"
      ? myCards
      : activePage === "music"
      ? musicCards
      : [];

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await fetchUserCards(result.user.uid);
    } catch (err) {
      console.error("登入失敗:", err);
    }
  };

  const handleLogout = async () => {
    // ✅ 新增確認對話框
    if (!window.confirm("確定要登出嗎？")) {
      return; // 如果用戶點擊取消，則停止執行登出操作
    }
    await signOut(auth);
    setUser(null);
    setMyCards([]);
  };

  // ----------------------------------------------------------------
  // 桌面版/手機版 樣式定義
  // ----------------------------------------------------------------

  // 頂層容器樣式
  const containerStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row", // 手機版垂直排列
    height: "100vh",
    overflow: "hidden", // 防止滾動條影響佈局
  };

  // 側邊欄/頂部導航樣式 (桌面版側邊欄, 手機版頂部導航)
  const sidebarStyle = {
    width: isMobile ? "100%" : 202,
    height: isMobile ? 56 : "auto", // 手機版固定高度
    background: "rgb(15,15,15,0)",
    color: "#fff",
    display: "flex",
    flexDirection: isMobile ? "row" : "column", // 手機版水平排列
    alignItems: isMobile ? "center" : "flex-start", // 手機版垂直置中
    padding: isMobile ? "0 20px" : "0 8px",
    justifyContent: isMobile ? "space-between" : "flex-start", // 手機版分散對齊
    zIndex: 10, // 確保在內容上方
  };

  // 主內容樣式
  const mainContentStyle = {
    flex: 1,
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", // 手機版單欄
    gap: isMobile ? 16 : 12,
    padding: isMobile ? "16px 20px 100px 20px" : 16, // 手機版底部留白給輸入框
    justifyItems: "center",
    overflowY: "auto",
  };

  // 手機版底部輸入框/導航列
  const mobileBottomBar = (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgb(15,15,15,0)",
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "18px 20px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
      }}
    >
      {/* 輸入網址區塊 (對應 Figma 截圖) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={url}
          onFocus={() => {
            if (!user) handleLogin();
          }}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
          placeholder="輸入網址"
          style={{
            flex: 1,
            height: 48,
            padding: "0 20px",
            borderRadius: 24,
            border: "none",
            background: "#fff",
            color: "#000",
            fontSize: 16,
          }}
        />
        <button
          onClick={() => {
            if (!user) handleLogin();
            else handleAddUrl();
          }}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "none",
            background: "#fff",
            color: "#000",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={24} />
        </button>
      </div>

      {/* 底部導航列 (對應 Figma 截圖) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          height: 56,
          background: "rgb(28,28,30)", // 導航列背景色
          borderRadius: 28,
          marginBottom: 10,
        }}
      >
        {/* Home Button */}
        <button
          onClick={() => setActivePage("home")}
          style={{
            flex: 1,
            height: "100%",
            border: "none",
            background: activePage === "home" ? "rgb(44,44,46)" : "transparent",
            color: activePage === "home" ? "#00bfbf" : "#fff",
            cursor: "pointer",
            borderRadius: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Home size={24} strokeWidth={activePage === "home" ? 3 : 2} />
          {activePage === "home" && <span style={{ fontSize: 14 }}>圖卡</span>}
        </button>

        {/* MyCards Button */}
        <button
          onClick={() => {
            if (!user) {
              handleLogin();
            } else {
              setActivePage("mycards");
            }
          }}
          style={{
            flex: 1,
            height: "100%",
            border: "none",
            background: activePage === "mycards" ? "rgb(44,44,46)" : "transparent",
            color: activePage === "mycards" ? "#00bfbf" : "#fff",
            cursor: "pointer",
            borderRadius: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <GalleryHorizontalEnd size={24} strokeWidth={activePage === "mycards" ? 3 : 2} />
          {activePage === "mycards" && <span style={{ fontSize: 14 }}>個人</span>}
        </button>

        {/* Music Button */}
        <button
          onClick={() => setActivePage("music")}
          style={{
            flex: 1,
            height: "100%",
            border: "none",
            background: activePage === "music" ? "rgb(44,44,46)" : "transparent",
            color: activePage === "music" ? "#00bfbf" : "#fff",
            cursor: "pointer",
            borderRadius: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Music size={24} strokeWidth={activePage === "music" ? 3 : 2} />
          {activePage === "music" && <span style={{ fontSize: 14 }}>音樂</span>}
        </button>
      </div>
    </div>
  );

  // ----------------------------------------------------------------
  // 渲染區塊
  // ----------------------------------------------------------------

  return (
    <div style={containerStyle}>
      {/* 側邊欄/頂部導航 */}
      <div style={sidebarStyle}>
        {isMobile ? ( // 手機版頂部導航
          <>
            <span style={{ fontSize: 18, fontWeight: "bold" }}>
                  圖卡
                </span>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* 登入/登出按鈕 */}
              {user ? (
                <button
                  onClick={handleLogout}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    border: "none",
                    background: "#404040",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={user.email}
                >
                  <LogOut size={20} />
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 50,
                    border: "none",
                    background: "#00bfbf",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center", //垂直居中
                    justifyContent: "center", //水平居中
                  }}
                >
                  <LogIn size={20} />
                </button>
              )}
              {/* 編輯按鈕 */}
            {user && (
              <button
                onClick={() => setEditMode((v) => !v)}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  border: "none",
                  background: editMode ? "#00bfbf" : "#404040",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center", //垂直居中
                  justifyContent: "center", //水平居中
                  marginRight: 36,
                }}
                title={editMode ? "退出編輯模式" : "進入編輯模式"}
              >
                {editMode ? <PencilOff size={20} /> : <Pencil size={20} />}
              </button>
            )}
            </div>
          </>
        ) : (
          // 桌面版側邊欄 (保留原樣)
          <>
            <img src={logo} alt="Logo" style={{ width: "130px", margin: "20px auto 20px" }} />
            <div style={{ display: "flex", marginBottom: 30 }}>
              <input
                type="text"
                value={url}
                onFocus={() => {
                  if (!user) handleLogin();
                }}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                placeholder="   輸入網址"
                style={{
                  flex: 3,
                  height: 49,
                  padding: "0 6px",
                  borderRadius: 50,
                  border: "1px solid #444",
                }}
              />
              <button
                onClick={() => {
                  if (!user) handleLogin();
                  else handleAddUrl();
                }}
                style={{
                  width: 48,
                  flex: 1,
                  height: 49,
                  borderRadius: 20,
                  border: "none",
                  background: "#00bfbf",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: activePage === "home" ? "bold" : "normal",
                }}
              >
                ＋
              </button>
            </div>

            <button
              onClick={() => setActivePage("home")}
              style={{
                width: 200,
                marginBottom: 6,
                padding: 18,
                paddingLeft: 20,
                background: activePage === "home" ? "#383838" : "#0F0F0F",
                color: "#fff",
                border: "none",
                borderRadius: 50,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                fontWeight: activePage === "home" ? "bold" : "normal",
                gap: 10,
                position: "relative",
              }}
            >
              <Home size={22} strokeWidth={activePage === "home" ? 3 : 2} /> 首頁
              <span
                style={{
                  padding: "0px 12px",
                  fontSize: 12,
                  marginLeft: "auto",
                  fontWeight: "bold",
                  color: "#929292",
                }}
              >
                {Math.max(0, homeCards.length - 1)}
              </span>
            </button>

            <button
              onClick={() => {
                if (!user) {
                  handleLogin();
                } else {
                  setActivePage("mycards");
                }
              }}
              style={{
                width: 200,
                marginBottom: 6,
                padding: 18,
                paddingLeft: 20,
                background: activePage === "mycards" ? "#383838" : "#0F0F0F",
                color: "#fff",
                border: "none",
                borderRadius: 50,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                fontWeight: activePage === "mycards" ? "bold" : "normal",
                gap: 10,
                position: "relative",
              }}
            >
              <GalleryHorizontalEnd size={22} strokeWidth={activePage === "mycards" ? 3 : 2}/> 個人圖卡
            <span
              style={{
                padding: "0px 12px",
                fontSize: 12,
                marginLeft: "auto",
                fontWeight: "bold",
                color: "#929292",
              }}
            >
              {user ? myCards.length : 0}
            </span>
          </button>

          <button
            onClick={() => {
              setActivePage("music");
            }}
            style={{
              width: 200,
              padding: 18,
              paddingLeft: 20,
              background: activePage === "music" ? "#383838" : "#0F0F0F",
              color: "#929292",
              border: "none",
              borderRadius: 50,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              fontWeight: activePage === "music" ? "bold" : "normal",
              gap: 10,
              position: "relative",
            }}
          >
            <Music size={22} strokeWidth={activePage === "music" ? 3 : 2}/> 音樂
            <span
              style={{
                padding: "0px 12px",
                fontSize: 12,
                marginLeft: "auto",
                fontWeight: "bold",
                color: "#929292",
              }}
            >
              {user ? musicCards.length : 0}
            </span>
          </button>
          </>
        )}
      </div>

      {/* 主內容 */}
      <div style={mainContentStyle}>
        {loading ? (
          <div style={{ gridColumn: "1 / -1", color: "#777" }}>載入中...</div>
        ) : activeCards.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              color: "#666",
              fontWeight: "bold",
            }}
          >
            {activePage === "home"
              ? "這裡是首頁內容"
              : user
              ? "目前沒有圖卡"
              : "請先登入 Google 帳號"}
          </div>
        ) : (
          activeCards.map(renderCard)
        )}
      </div>

      {/* 桌面版編輯按鈕 (已移至頂部導航) */}
      {!isMobile && user && (
        <button
          onClick={() => setEditMode((v) => !v)}
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 999,
            borderRadius: 50,
            border: "none",
            background: editMode ? "#00bfbf" : "#7a7b7b",
            color: "#fff",
            padding: "0 16px",
            height: 50,
            width: 50,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title={editMode ? "退出編輯模式" : "進入編輯模式"}
        >
          {editMode ? <PencilOff size={52} /> : <Pencil size={52} />}
        </button>
      )}

      {/* 桌面版登入區塊 (已移除，功能整合到側邊欄) */}
      {!isMobile && (
        <div
          style={{
            position: "fixed",
            left: 8,
            bottom: 20,
            zIndex: 999,
            display: "flex",
            width: 202,
            height: 50,
            borderRadius: 50,
          }}
        >
          {user ? (
            <>
              <button
                style={{
                  flex: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingLeft: 12,
                  fontSize: 12,
                  background: "#404040",
                  border: "none",
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  borderRadius: 25,
                  cursor: "default",
                }}
                title={user.email}
              >
                {user.email}
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 2,
                  border: "none",
                  background: "#404040",
                  color: "#fff",
                  cursor: "pointer",
                  borderRadius: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <button
              onClick={handleLogin}
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                background: "#00bfbf",
                color: "#fff",
                cursor: "pointer",
                borderRadius: 25,
              }}
            >
              Google 登入
            </button>
          )}
        </div>
      )}

      {/* 手機版底部導航/輸入框 */}
      {isMobile && mobileBottomBar}
    </div>
  );
}
