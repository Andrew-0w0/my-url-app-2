// src/components/Desktop1.js
import React, { useCallback, useState, useRef, useEffect } from "react";
import logo from "../images/Logo.png";
import authorImage from "../images/images.jpg";
import ingGif from "../images/ing.gif";
import failImage from "../images/fail.png";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db, auth, provider, storage } from "../firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Home as HomeOutline, Pencil, PencilOff, GalleryHorizontalEnd, LogOut, Plus, LogIn, MoreHorizontal, Layers, ArrowLeft, FolderMinus, ZoomIn, ZoomOut, Download, X, ClipboardPaste } from "lucide-react";
import HouseIcon from "./HouseIcon";

// 新增一個媒體查詢 hook
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [matches, query]);
  return matches;
};

const PINCH_ZOOM_IN_RATIO = 1.15; // 雙指張開 → 單欄
const PINCH_ZOOM_OUT_RATIO = 0.85; // 雙指捏合 → 雙欄
const LOGO_DISPLAY_WIDTH = 126;
const PREVIEW_API_URL = process.env.REACT_APP_PREVIEW_API_URL || "/api/preview";

const formatPreviewDateTitle = (timestamp = Date.now()) => {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const extractUrlFromText = (text = "") => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const firstUrl = trimmed.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  const candidate = firstUrl || trimmed;

  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    if (/^www\.[^\s"'<>]+$/i.test(candidate)) {
      return `https://${candidate}`;
    }
    return "";
  }
};

const usePinchMobileColumns = (enabled, scrollRef, layoutKey = 0) => {
  const [columns, setColumns] = useState(2);
  const pinchRef = useRef({ startDist: 0, lastDist: 0, pinching: false });

  useEffect(() => {
    if (!enabled) {
      setColumns(1);
      return undefined;
    }

    setColumns(2);

    const el = scrollRef.current;
    if (!el) return undefined;

    const touchDistance = (touches) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const d = touchDistance(e.touches);
        pinchRef.current = { startDist: d, lastDist: d, pinching: true };
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current.pinching) {
        pinchRef.current.lastDist = touchDistance(e.touches);
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (!pinchRef.current.pinching) return;
      const { startDist, lastDist } = pinchRef.current;
      pinchRef.current.pinching = false;
      if (!startDist) return;

      const ratio = lastDist / startDist;
      if (ratio >= PINCH_ZOOM_IN_RATIO) setColumns(1);
      else if (ratio <= PINCH_ZOOM_OUT_RATIO) setColumns(2);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, scrollRef, layoutKey]);

  return [columns, setColumns];
};

export default function Desktop1() {
  const [url, setUrl] = useState("");
  const [homeCards, setHomeCards] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMobileNavBar, setShowMobileNavBar] = useState(true);
  const [clipboardUrl, setClipboardUrl] = useState("");
  const [clipboardPromptVisible, setClipboardPromptVisible] = useState(false);
  const [clipboardButtonPressed, setClipboardButtonPressed] = useState(false);
  const [clipboardBursts, setClipboardBursts] = useState([]);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [accountMenuInteractionMode, setAccountMenuInteractionMode] = useState("tap");
  const [accountMenuHighlightedIndex, setAccountMenuHighlightedIndex] = useState(-1);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [contextMenuCard, setContextMenuCard] = useState(null);
  const [expandedPreviewCard, setExpandedPreviewCard] = useState(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewTranslate, setPreviewTranslate] = useState({ x: 0, y: 0 });
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewOriginRect, setPreviewOriginRect] = useState(null);
  const [loadingGifDocked, setLoadingGifDocked] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showHomeInstallGuide, setShowHomeInstallGuide] = useState(false);
  const [desktopColumns, setDesktopColumns] = useState(4);
  const isPinchPanning = useRef(false);
  const touchStartDistance = useRef(0);
  const touchStartScale = useRef(1);
  const touchStartPoints = useRef({ x: 0, y: 0 });
  const touchStartTranslate = useRef({ x: 0, y: 0 });
  const longPressTimeout = useRef(null);
  const clipboardBurstIdRef = useRef(0);
  const clipboardBurstTimerRef = useRef(null);
  const loadingDockTimerRef = useRef(null);
  const previewBackfillInFlightRef = useRef(new Set());
  const previewCloseTimerRef = useRef(null);
  const previewTouchCount = useRef(0);
  const previewMultiTouchGesture = useRef(false);
  const lastPreviewTapRef = useRef({ time: 0, x: 0, y: 0 });
  const previewTouchMovedRef = useRef(false);
  const accountMenuHighlightedIndexRef = useRef(-1);
  const moreMenuLongPressTimerRef = useRef(null);
  const moreMenuTouchTrackingRef = useRef(null);
  const suppressNextMoreMenuClickRef = useRef(false);
  const isIosSafari = /iP(hone|ad|od)/i.test(navigator.userAgent) && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
  const isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/i.test(navigator.userAgent);
  const isDesktopChrome = /(Macintosh|Windows)/i.test(navigator.userAgent) && /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/i.test(navigator.userAgent);

  const PREVIEW_DOUBLE_TAP_MS = 320;
  const PREVIEW_DOUBLE_TAP_ZOOM_PX = 160;
  const PREVIEW_WHEEL_ZOOM_STEP = 0.14;

  const bumpPreviewZoom = () => {
    const baseWidth = window.innerWidth || 1;
    setPreviewScale((s) => Math.min(5, s + PREVIEW_DOUBLE_TAP_ZOOM_PX / baseWidth));
  };

  const handlePreviewWheel = useCallback(
    (e) => {
      if (!expandedPreviewCard) return;
      const isMobileViewport = window.matchMedia("(max-width: 600px)").matches;
      if (isMobileViewport) return;

      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      setPreviewScale((current) => {
        const next =
          delta < 0
            ? current + PREVIEW_WHEEL_ZOOM_STEP
            : current - PREVIEW_WHEEL_ZOOM_STEP;
        if (next <= 1) {
          setPreviewTranslate({ x: 0, y: 0 });
          return 1;
        }
        return Math.max(1, Math.min(5, next));
      });
    },
    [expandedPreviewCard]
  );

  const minPreviewZoomScale = () =>
    1 + (PREVIEW_DOUBLE_TAP_ZOOM_PX - 1) / (window.innerWidth || 1);

  const persistPreviewMetadataToFirestore = useCallback(
    async ({ uid, pageUrl, title, imageUrl, previewSource }) => {
      if (!pageUrl) return;

      const q = query(
        collection(db, "cards"),
        where("pageUrl", "==", pageUrl),
        where("uid", "==", uid)
      );
      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await updateDoc(doc.ref, {
          ...(title ? { title } : {}),
          imageUrl,
          previewSource,
          previewFetchedAt: Date.now(),
        });
      }
    },
    []
  );

  useEffect(() => {
    accountMenuHighlightedIndexRef.current = accountMenuHighlightedIndex;
  }, [accountMenuHighlightedIndex]);

  const clearMoreMenuLongPressTimer = () => {
    if (moreMenuLongPressTimerRef.current) {
      clearTimeout(moreMenuLongPressTimerRef.current);
      moreMenuLongPressTimerRef.current = null;
    }
  };

  const closeAccountMenu = useCallback(() => {
    clearMoreMenuLongPressTimer();
    if (moreMenuTouchTrackingRef.current?.cleanup) {
      moreMenuTouchTrackingRef.current.cleanup();
    }
    moreMenuTouchTrackingRef.current = null;
    setShowAccountMenu(false);
    setAccountMenuInteractionMode("tap");
    setAccountMenuHighlightedIndex(-1);
  }, []);

  const updateMoreMenuSelectionFromPoint = useCallback((clientX, clientY) => {
    const hit = document.elementFromPoint(clientX, clientY);
    const itemEl = hit?.closest?.("[data-account-menu-index]");
    const nextIndex = itemEl ? Number(itemEl.dataset.accountMenuIndex) : -1;
    setAccountMenuHighlightedIndex(Number.isFinite(nextIndex) ? nextIndex : -1);
  }, []);

  const handleMoreButtonClick = () => {
    if (suppressNextMoreMenuClickRef.current) {
      suppressNextMoreMenuClickRef.current = false;
      return;
    }
    setShowAccountMenu((v) => !v);
    setAccountMenuInteractionMode("tap");
    setAccountMenuHighlightedIndex(-1);
  };

  const handleMoreButtonTouchStart = (e) => {
    if (!user) return;
    const touch = e.touches[0];
    if (!touch) return;

    clearMoreMenuLongPressTimer();
    if (moreMenuTouchTrackingRef.current?.cleanup) {
      moreMenuTouchTrackingRef.current.cleanup();
    }

    const tracking = {
      opened: false,
      startX: touch.clientX,
      startY: touch.clientY,
      cleanup: null,
    };

    const onTouchMove = (moveEvent) => {
      const moveTouch = moveEvent.touches[0];
      if (!moveTouch) return;

      const delta = Math.hypot(moveTouch.clientX - tracking.startX, moveTouch.clientY - tracking.startY);
      if (!tracking.opened) {
        if (delta > 12) {
          clearMoreMenuLongPressTimer();
          window.removeEventListener("touchmove", onTouchMove);
          window.removeEventListener("touchend", onTouchEnd);
          window.removeEventListener("touchcancel", onTouchEnd);
          moreMenuTouchTrackingRef.current = null;
        }
        return;
      }

      moveEvent.preventDefault();
      updateMoreMenuSelectionFromPoint(moveTouch.clientX, moveTouch.clientY);
    };

    const onTouchEnd = (endEvent) => {
      const endTouch = endEvent.changedTouches[0];

      clearMoreMenuLongPressTimer();
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      moreMenuTouchTrackingRef.current = null;

      if (!tracking.opened || !endTouch) return;

      const hit = document.elementFromPoint(endTouch.clientX, endTouch.clientY);
      const itemEl = hit?.closest?.("[data-account-menu-index]");
      const selectedIndex = itemEl
        ? Number(itemEl.dataset.accountMenuIndex)
        : accountMenuHighlightedIndexRef.current;

      suppressNextMoreMenuClickRef.current = true;
      if (selectedIndex >= 0) {
        triggerAccountMenuItem(selectedIndex);
      } else {
        closeAccountMenu();
      }
    };

    tracking.cleanup = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };

    moreMenuTouchTrackingRef.current = tracking;

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    moreMenuLongPressTimerRef.current = window.setTimeout(() => {
      tracking.opened = true;
      suppressNextMoreMenuClickRef.current = true;
      setShowAccountMenu(true);
      setAccountMenuInteractionMode("press");
      setAccountMenuHighlightedIndex(-1);
    }, 240);
  };

  useEffect(() => {
    return () => {
      clearMoreMenuLongPressTimer();
      if (moreMenuTouchTrackingRef.current?.cleanup) {
        moreMenuTouchTrackingRef.current.cleanup();
      }
    };
  }, []);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleMainTouchStart = (e) => {
    if (!activeGroupId) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleMainTouchEnd = (e) => {
    if (!activeGroupId) return;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;
    // Check for significant horizontal swipe with minimal vertical movement
    if (Math.abs(diffX) > 70 && Math.abs(diffY) < 40) {
      setActiveGroupId(null);
    }
  };

  const handlePreviewTouchStart = (e) => {
    isPinchPanning.current = true;
    previewTouchCount.current = e.touches.length;
    previewMultiTouchGesture.current = e.touches.length > 1;
    previewTouchMovedRef.current = false;

    if (e.touches.length === 1) {
      touchStartPoints.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchStartTranslate.current = { ...previewTranslate };
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistance.current = d;
      touchStartScale.current = previewScale;

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      touchStartPoints.current = { x: cx, y: cy };
      touchStartTranslate.current = { ...previewTranslate };
    }
  };

  const handlePreviewTouchMove = (e) => {
    if (!isPinchPanning.current) return;

    if (e.touches.length === 1) {
      // 只有在放大狀態下才允許平移
      if (previewScale > minPreviewZoomScale()) {
        const dx = e.touches[0].clientX - touchStartPoints.current.x;
        const dy = e.touches[0].clientY - touchStartPoints.current.y;
        if (Math.hypot(dx, dy) > 6) previewTouchMovedRef.current = true;
        setPreviewTranslate({
          x: touchStartTranslate.current.x + dx,
          y: touchStartTranslate.current.y + dy,
        });
      }
    } else if (e.touches.length === 2) {
      // 雙指縮放
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistance.current > 0) {
        let newScale = touchStartScale.current * (d / touchStartDistance.current);
        newScale = Math.max(1, Math.min(newScale, 5));

        // 縮放時同步支援雙指平移
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dx = cx - touchStartPoints.current.x;
        const dy = cy - touchStartPoints.current.y;

        setPreviewScale(newScale);
        setPreviewTranslate({
          x: touchStartTranslate.current.x + dx,
          y: touchStartTranslate.current.y + dy,
        });
      }
    }
  };

  const handlePreviewTouchEnd = (e) => {
    previewTouchCount.current = e.touches.length;
    if (e.touches.length === 0) {
      isPinchPanning.current = false;

      if (
        !previewMultiTouchGesture.current &&
        !previewTouchMovedRef.current &&
        e.changedTouches.length === 1
      ) {
        const touch = e.changedTouches[0];
        const now = Date.now();
        const { time, x, y } = lastPreviewTapRef.current;
        const isDoubleTap =
          now - time < PREVIEW_DOUBLE_TAP_MS &&
          Math.hypot(touch.clientX - x, touch.clientY - y) < 36;

        if (isDoubleTap) {
          bumpPreviewZoom();
          lastPreviewTapRef.current = { time: 0, x: 0, y: 0 };
          previewMultiTouchGesture.current = false;
          return;
        } else {
          lastPreviewTapRef.current = {
            time: now,
            x: touch.clientX,
            y: touch.clientY,
          };
        }
      }

      previewMultiTouchGesture.current = false;
      // 若縮放小於一次雙擊增量，則重設回 1 倍並置中
      if (previewScale < minPreviewZoomScale()) {
        setPreviewScale(1);
        setPreviewTranslate({ x: 0, y: 0 });
      } else {
        // 限制平移邊界，防止縮圖完全滑出螢幕
        const maxTx = ((previewScale - 1) * window.innerWidth) / 2;
        const maxTy = ((previewScale - 1) * window.innerHeight) / 2;
        const clampedX = Math.max(-maxTx, Math.min(maxTx, previewTranslate.x));
        const clampedY = Math.max(-maxTy, Math.min(maxTy, previewTranslate.y));
        setPreviewTranslate({ x: clampedX, y: clampedY });
      }
    } else if (e.touches.length === 1) {
      // 從雙指變單指，重設平移起始點
      touchStartPoints.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchStartTranslate.current = { ...previewTranslate };
    }
  };

  useEffect(() => {
    if (!expandedPreviewCard) {
      setPreviewVisible(false);
      return undefined;
    }

    const raf = requestAnimationFrame(() => setPreviewVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [expandedPreviewCard]);

  useEffect(() => {
    if (!expandedPreviewCard) return undefined;

    const preventSaveActions = (e) => {
      const isSaveShortcut =
        (e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey);
      if (isSaveShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
    };

    window.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("keydown", preventSaveActions, true);
    window.addEventListener("dragstart", preventContextMenu, true);

    return () => {
      window.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("keydown", preventSaveActions, true);
      window.removeEventListener("dragstart", preventContextMenu, true);
    };
  }, [expandedPreviewCard]);

  useEffect(() => {
    if (activePage !== "mycards") {
      setActiveGroupId(null);
    }
  }, [activePage]);

  useEffect(() => {
    const backfillPreview = async (card, scope, uid) => {
      const backfillKey = `${scope}:${uid ?? "null"}:${card.pageUrl}`;
      if (previewBackfillInFlightRef.current.has(backfillKey)) return;
      previewBackfillInFlightRef.current.add(backfillKey);

      try {
        const res = await fetch(`${PREVIEW_API_URL}?url=${encodeURIComponent(card.pageUrl)}`);
        const json = await res.json();
        if (json.status !== "success") return;

        const nextPreviewSource = json.data?.imageSource || "fallback";
        const nextTitle =
          nextPreviewSource === "screenshot"
            ? formatPreviewDateTitle()
            : json.data?.title || card.title || "";
        const rawImageUrl = json.data?.image?.url || json.data?.screenshot?.url || "";
        if (!rawImageUrl) return;

        let nextImageUrl = rawImageUrl;
        if (nextPreviewSource === "screenshot") {
          try {
            const imgRes = await fetch(rawImageUrl);
            const blob = await imgRes.blob();
            const storageRef = ref(
              storage,
              `previews/${uid ?? "anonymous"}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
            );
            await uploadBytes(storageRef, blob);
            nextImageUrl = await getDownloadURL(storageRef);
          } catch (uploadErr) {
            console.error("Failed to upload backfilled screenshot to Firebase Storage:", uploadErr);
          }
        }

        const nextPreview = {
          title: nextTitle,
          imageUrl: nextImageUrl,
          previewSource: nextPreviewSource,
          previewFetchedAt: Date.now(),
        };

        const patchCards = (setter) => {
          setter((prev) =>
            prev.map((item) =>
              item.pageUrl === card.pageUrl && !item.imageUrl
                ? { ...item, ...nextPreview }
                : item
            )
          );
        };

        if (scope === "home") {
          patchCards(setHomeCards);
        } else {
          patchCards(setMyCards);
        }

        await persistPreviewMetadataToFirestore({
          uid,
          pageUrl: card.pageUrl,
          title: nextTitle,
          imageUrl: nextImageUrl,
          previewSource: nextPreviewSource,
        });
      } catch (err) {
        console.error("補抓圖卡縮圖失敗:", err);
      } finally {
        previewBackfillInFlightRef.current.delete(backfillKey);
      }
    };

    const queue = [];
    homeCards.forEach((card) => {
      if (!card?.pageUrl || card.isGroup || card.imageUrl) return;
      queue.push({ card, scope: "home", uid: null });
    });

    if (user?.uid) {
      myCards.forEach((card) => {
        if (!card?.pageUrl || card.isGroup || card.imageUrl) return;
        queue.push({ card, scope: "mycards", uid: user.uid });
      });
    }

    queue.forEach(({ card, scope, uid }) => {
      void backfillPreview(card, scope, uid);
    });
  }, [homeCards, myCards, persistPreviewMetadataToFirestore, user?.uid]);

  useEffect(() => {
    if (!showAccountMenu) return;
    const handleOutsideClick = (e) => {
      const menuEl = document.getElementById("account-menu-container");
      const buttonMobile = document.getElementById("more-button-mobile");
      const buttonDesktop = document.getElementById("more-button-desktop");
      
      if (
        menuEl && 
        !menuEl.contains(e.target) && 
        (!buttonMobile || !buttonMobile.contains(e.target)) &&
        (!buttonDesktop || !buttonDesktop.contains(e.target))
      ) {
        setShowAccountMenu(false);
      }
    };

    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showAccountMenu]);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };

    const onAppInstalled = () => {
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingGifDocked(false);
      if (loadingDockTimerRef.current) {
        clearTimeout(loadingDockTimerRef.current);
        loadingDockTimerRef.current = null;
      }
      return undefined;
    }

    setLoadingGifDocked(false);
    if (loadingDockTimerRef.current) {
      clearTimeout(loadingDockTimerRef.current);
    }
    loadingDockTimerRef.current = setTimeout(() => {
      setLoadingGifDocked(true);
    }, 900);

    return () => {
      if (loadingDockTimerRef.current) {
        clearTimeout(loadingDockTimerRef.current);
        loadingDockTimerRef.current = null;
      }
    };
  }, [loading]);

  const isMobile = useMediaQuery("(max-width: 600px)"); // 判斷是否為手機版

  const idRef = useRef(0);
  const dragItem = useRef(null);
  const scrollRef = useRef(null);
  const lastMobileScrollTop = useRef(0);
  const wasPageHiddenRef = useRef(false);

  const [mobileColumns, setMobileColumns] = usePinchMobileColumns(
    isMobile,
    scrollRef,
    activePage
  );
  const isMobileTwoCol = isMobile && mobileColumns === 2;

  const accountMenuItems = [
    {
      id: "edit",
      label: editMode ? "退出編輯" : "進入編輯",
      icon: editMode ? <PencilOff size={22} /> : <Pencil size={22} />,
      action: () => {
        setEditMode((v) => !v);
      },
    },
    activePage === "mycards"
      ? {
          id: "group",
          label: "新增圖卡組",
          icon: <Layers size={22} />,
          action: () => {
            handleAddCardGroup();
          },
        }
      : null,
    isMobile
      ? {
          id: "zoom",
          label: mobileColumns === 2 ? "放大" : "縮小",
          icon: mobileColumns === 2 ? <ZoomIn size={22} /> : <ZoomOut size={22} />,
          action: () => {
            setMobileColumns((c) => (c === 2 ? 1 : 2));
          },
        }
      : null,
    !isMobile
      ? {
          id: "zoom",
          label: desktopColumns === 4 ? "放大" : "縮小",
          icon: desktopColumns === 4 ? <ZoomIn size={22} /> : <ZoomOut size={22} />,
          action: () => {
            setDesktopColumns((c) => (c === 4 ? 1 : 4));
          },
        }
      : null,
    {
      id: "home",
      label: "加入主畫面",
      icon: <Download size={22} />,
      action: () => {
        handleAddToHomeScreen();
      },
    },
    {
      id: "logout",
      label: "登出",
      icon: <LogOut size={22} />,
      danger: true,
      action: () => {
        handleLogout();
      },
    },
  ].filter(Boolean);

  const triggerAccountMenuItem = useCallback(
    async (index) => {
      const item = accountMenuItems[index];
      if (!item) return;
      closeAccountMenu();
      await item.action();
    },
    [accountMenuItems, closeAccountMenu]
  );

  useEffect(() => {
    if (!isMobile) {
      setShowMobileNavBar(true);
      return undefined;
    }

    const el = scrollRef.current;
    if (!el) return undefined;

    setShowMobileNavBar(true);
    lastMobileScrollTop.current = el.scrollTop;

    const onScroll = () => {
      const current = el.scrollTop;
      const delta = current - lastMobileScrollTop.current;

      if (current <= 8) {
        setShowMobileNavBar(true);
      } else if (delta > 6) {
        setShowMobileNavBar(false);
      } else if (delta < -6) {
        setShowMobileNavBar(true);
      }

      lastMobileScrollTop.current = current;
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [isMobile, activePage]);

  const desktopCardSize = desktopColumns === 1 ? 520 : 300;
  const desktopCardHeight = desktopColumns === 1 ? 620 : "auto";
  const CARD_SIZE = isMobile ? "100%" : desktopCardSize;
  const CARD_PREVIEW_HEIGHT = isMobile
    ? isMobileTwoCol
      ? "calc((100vw - 56px) / 2)"
      : "calc(100vw - 40px)"
    : desktopCardSize;
  const CARD_RADIUS = 8;

  // ✅ 首頁：監聽公開卡片（uid 為 null）
  useEffect(() => {
    const defaultCard = {
      id: ++idRef.current,
      pageUrl: "https://linktr.ee/anpuowo?utm_source=linktree_profile_share&ltsid=7fab903e-a63c-4579-b324-e8bebce74fbf",
      title: "作者圖卡", // 預設卡片標題
      isDefault: true,
      imageUrl: authorImage,
    };
    setHomeCards([defaultCard]);

    const q = query(collection(db, "cards"), where("uid", "==", null));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardsData = snapshot.docs.map((doc) => ({
        id: ++idRef.current,
        ...doc.data(),
      }));
      setHomeCards((prev) => {
        const existingDefaultCard = prev.find((p) => p.isDefault) || defaultCard;
        return [existingDefaultCard, ...cardsData];
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
      } else {
        setUser(null);
        setMyCards([]);
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
    cardsData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setMyCards(cardsData);
  };

  const normalizeUrlForCompare = (u = "") =>
    u.trim().replace(/\/+$/, "").toLowerCase();

  const refreshClipboardUrl = useCallback(async () => {
    if (!navigator.clipboard?.readText) return "";

    try {
      const text = await navigator.clipboard.readText();
      const foundUrl = extractUrlFromText(text);
      setClipboardUrl(foundUrl);
      return foundUrl;
    } catch {
      return "";
    }
  }, []);

  const triggerClipboardBurst = useCallback(() => {
    setClipboardButtonPressed(false);

    const nextParticles = Array.from({ length: 14 }, (_, index) => {
      const edge = ["top", "right", "bottom", "left"][index % 4];
      const sparkleColors = ["#ffffff", "#fff6b0", "#8ffcff", "#ffd4f0", "#b0fff0"];
      const spreadX = 34 + Math.random() * 36;
      const spreadY = 34 + Math.random() * 36;
      const insetX = 8 + Math.random() * 84;
      const insetY = 10 + Math.random() * 28;
      let x = insetX;
      let y = insetY;
      let dx = (Math.random() - 0.5) * 110;
      let dy = -(30 + Math.random() * 36);

      if (edge === "top") {
        x = 8 + Math.random() * 84;
        y = 0;
        dx = (Math.random() - 0.5) * 116;
        dy = -(spreadY + Math.random() * 16);
      } else if (edge === "bottom") {
        x = 8 + Math.random() * 84;
        y = 100;
        dx = (Math.random() - 0.5) * 116;
        dy = spreadY + Math.random() * 16;
      } else if (edge === "left") {
        x = 0;
        y = 12 + Math.random() * 76;
        dx = -(spreadX + Math.random() * 16);
        dy = (Math.random() - 0.5) * 116;
      } else if (edge === "right") {
        x = 100;
        y = 12 + Math.random() * 76;
        dx = spreadX + Math.random() * 16;
        dy = (Math.random() - 0.5) * 116;
      }

      return {
        id: ++clipboardBurstIdRef.current,
        x,
        y,
        dx,
        dy,
        size: 7 + Math.random() * 5,
        color: sparkleColors[index % sparkleColors.length],
        delay: Math.random() * 40,
        rot: Math.random() * 240 - 120,
      };
    });

    setClipboardBursts((prev) => [...prev, ...nextParticles]);
    if (clipboardBurstTimerRef.current) {
      clearTimeout(clipboardBurstTimerRef.current);
    }
    clipboardBurstTimerRef.current = setTimeout(() => {
      setClipboardBursts((prev) => prev.filter((p) => !nextParticles.some((n) => n.id === p.id)));
    }, 700);
  }, []);

  useEffect(() => {
    const tryReadClipboard = async (returnedFromBackground = false) => {
      if (document.visibilityState !== "visible" || url) return;
      const found = await refreshClipboardUrl();
      if (found) {
        setClipboardPromptVisible(true);
      } else if (returnedFromBackground) {
        setClipboardPromptVisible(true);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasPageHiddenRef.current = true;
        return;
      }
      if (wasPageHiddenRef.current) {
        wasPageHiddenRef.current = false;
        tryReadClipboard(true);
      }
    };

    const onPageShow = () => {
      if (wasPageHiddenRef.current) {
        wasPageHiddenRef.current = false;
        tryReadClipboard(true);
      }
    };

    const onWindowFocus = () => {
      if (wasPageHiddenRef.current) {
        wasPageHiddenRef.current = false;
        tryReadClipboard(true);
      } else {
        tryReadClipboard(false);
      }
    };

    tryReadClipboard(false);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [refreshClipboardUrl, url]);

  // ✅ 新增卡片
  const handleAddUrl = async (nextUrl = url) => {
    const targetUrl = nextUrl.trim();
    if (!targetUrl) return;

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

    const normalized = normalizeUrlForCompare(targetUrl);
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
      let fetchedTitle = "新圖卡";
      let fetchedImageUrl = "";
      let fetchedPreviewSource = "fallback";
      try {
        const res = await fetch(`${PREVIEW_API_URL}?url=${encodeURIComponent(targetUrl)}`);
        const json = await res.json();
        if (json.status === "success") {
          fetchedPreviewSource = json.data?.imageSource || fetchedPreviewSource;
          fetchedTitle =
            fetchedPreviewSource === "screenshot"
              ? formatPreviewDateTitle()
              : json.data?.title || fetchedTitle;
          const rawImageUrl = json.data?.image?.url || json.data?.screenshot?.url || "";
          if (rawImageUrl) {
            if (fetchedPreviewSource === "screenshot") {
              try {
                const imgRes = await fetch(rawImageUrl);
                const blob = await imgRes.blob();
                const storageRef = ref(
                  storage,
                  `previews/${user ? user.uid : "anonymous"}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
                );
                await uploadBytes(storageRef, blob);
                fetchedImageUrl = await getDownloadURL(storageRef);
              } catch (uploadErr) {
                console.error("Failed to upload screenshot to Firebase Storage, using raw URL:", uploadErr);
                fetchedImageUrl = rawImageUrl;
              }
            } else {
              fetchedImageUrl = rawImageUrl;
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch preview metadata:", e);
      }

      if (activePage === "home") {
        await addDoc(collection(db, "cards"), {
          uid: null,
          email: user ? user.email : "匿名使用者",
          pageUrl: targetUrl,
          title: fetchedTitle,
          imageUrl: fetchedImageUrl,
          previewSource: fetchedPreviewSource,
          previewFetchedAt: Date.now(),
          createdAt: Date.now(),
        });
      } else if (user) {
        await addDoc(collection(db, "cards"), {
          uid: user.uid,
          email: user.email,
          pageUrl: targetUrl,
          title: fetchedTitle || targetUrl,
          imageUrl: fetchedImageUrl,
          previewSource: fetchedPreviewSource,
          previewFetchedAt: Date.now(),
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
    setClipboardUrl("");
    setClipboardPromptVisible(false);
  };

  const handleClipboardAddUrl = async () => {
    if (!user) {
      handleLogin();
      return;
    }

    const targetUrl = clipboardUrl || (await refreshClipboardUrl());
    if (!targetUrl) {
      setClipboardPromptVisible(false);
      alert("沒有發現可貼上的網址，請手動貼上。");
      return;
    }

    setUrl(targetUrl);
    await handleAddUrl(targetUrl);
    setClipboardPromptVisible(false);
  };

  const handleAddCardGroup = async () => {
    if (!user) {
      alert("請先登入再新增圖卡組！");
      return;
    }
    // ✅ 個人圖卡數量上限判斷
    if (myCards.length >= 50) {
      alert("個人圖卡最多只能新增 50 張！");
      return;
    }
    try {
      await addDoc(collection(db, "cards"), {
        uid: user.uid,
        email: user.email,
        pageUrl: `group-${Date.now()}`,
        title: "未命名圖卡組",
        isGroup: true,
        createdAt: Date.now(),
      });
      await fetchUserCards(user.uid);
    } catch (err) {
      console.error("新增圖卡組失敗:", err);
    }
  };

  const saveTitleToFirestore = async (pageUrl, newTitle) => {
    if (activePage !== "mycards" || !user) return;
    try {
      const q = query(
        collection(db, "cards"),
        where("pageUrl", "==", pageUrl),
        where("uid", "==", user.uid)
      );
      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await updateDoc(doc.ref, { title: newTitle });
      }
    } catch (err) {
      console.error("更新標題失敗:", err);
    }
  };

  const moveCardToGroup = async (cardPageUrl, groupPageUrl) => {
    if (activePage !== "mycards" || !user) return;
    try {
      const q = query(
        collection(db, "cards"),
        where("pageUrl", "==", cardPageUrl),
        where("uid", "==", user.uid)
      );
      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await updateDoc(doc.ref, { groupId: groupPageUrl });
      }
      await fetchUserCards(user.uid);
    } catch (err) {
      console.error("將圖卡移入圖卡組失敗:", err);
    }
  };

  const startLongPress = (item) => {
    longPressTimeout.current = setTimeout(() => {
      if (activeGroupId) {
        setContextMenuCard(item);
      }
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }
  };

  const removeCardFromGroup = async (cardPageUrl) => {
    if (activePage !== "mycards" || !user) return;
    try {
      const q = query(
        collection(db, "cards"),
        where("pageUrl", "==", cardPageUrl),
        where("uid", "==", user.uid)
      );
      const snap = await getDocs(q);
      for (const doc of snap.docs) {
        await updateDoc(doc.ref, { groupId: null });
      }
      await fetchUserCards(user.uid);
    } catch (err) {
      console.error("將圖卡移出圖卡組失敗:", err);
    }
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
  const onDrop = async (e, targetId) => {
    e.preventDefault();
    const fromId = dragItem.current;
    if (!fromId || fromId === targetId) return;

    if (activePage === "mycards") {
      const fromCard = myCards.find((it) => it.id === fromId);
      const targetCard = myCards.find((it) => it.id === targetId);

      if (fromCard && targetCard && targetCard.isGroup && !fromCard.isGroup) {
        setMyCards((prev) =>
          prev.map((c) => (c.id === fromId ? { ...c, groupId: targetCard.pageUrl } : c))
        );
        await moveCardToGroup(fromCard.pageUrl, targetCard.pageUrl);
        return;
      }
    }

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

    const getCleanTitleFallback = (url) => {
      if (!url) return "網頁圖卡";
      try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./i, "");
      } catch {
        return url;
      }
    };

    const displayTitle = item.isGroup
      ? item.title
      : activePage === "home"
      ? (item.title &&
        !item.title.startsWith("http://") &&
        !item.title.startsWith("https://") &&
        !item.title.includes("新增") &&
        !item.title.includes("匿名")
      ? item.title
      : getCleanTitleFallback(item.pageUrl))
      : item.title;

    const isAnon = !item.email?.includes("@gmail.com");
    const isOwnerByEmail = user && item.email === user.email;
    const previewUrl = item.isGroup ? "" : item.pageUrl;
    const canExpandPreview = Boolean(previewUrl);

// ✅ 控制 X 按鈕顯示條件（新版）
const showDeleteButton =
  editMode && // 必須在編輯模式中
  !item.isDefault && // 預設卡不能刪
  (
    // 🔹 個人頁邏輯
    (activePage === "mycards" && user) ||

    // 🔹 首頁邏輯
    (activePage === "home" && ((user && isOwnerByEmail) || isAnon))
  );

    return (
      <div
        className={isMobileTwoCol ? "mobile-two-col-card" : undefined}
        key={item.id}
        onClick={() => {
          if (!editMode && item.isGroup) {
            setActiveGroupId(item.pageUrl);
          }
        }}
        onMouseDown={() => startLongPress(item)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={() => startLongPress(item)}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onContextMenu={(e) => {
          if (activeGroupId) {
            e.preventDefault();
          }
        }}
        style={{
          width: CARD_SIZE,
          height: desktopCardHeight,
          maxWidth: "100%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          position: "relative",
          userSelect: "none",
          marginTop: item.isGroup ? 12 : 11,
          cursor: !editMode && item.isGroup ? "pointer" : "default",
        }}
        draggable={editMode && !item.isDefault && activePage === "mycards" && !activeGroupId}
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, item.id)}
      >
        {item.isGroup && (
          <div
            style={{
              position: "absolute",
              top: -8,
              left: "4%",
              width: "92%",
              height: CARD_PREVIEW_HEIGHT,
              borderRadius: CARD_RADIUS,
              background: "linear-gradient(135deg, rgba(44, 62, 80, 0.7), rgba(0, 191, 191, 0.4))",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              zIndex: 0,
              boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)",
            }}
          />
        )}

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

        <div
          style={{
            position: "relative",
            width: CARD_SIZE,
            maxWidth: "100%",
            minWidth: 0,
            height: CARD_PREVIEW_HEIGHT,
            borderRadius: CARD_RADIUS,
            overflow: "hidden",
            zIndex: 1,
            background: item.isGroup ? "#111" : `#111 url(${ingGif}) center/contain no-repeat`,
          }}
        >
          {item.isGroup ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, rgba(44, 62, 80, 0.95), rgba(0, 191, 191, 0.7))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: CARD_RADIUS,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                boxSizing: "border-box",
                cursor: "default",
              }}
            >
              <GalleryHorizontalEnd size={48} color="#ffffff" style={{ opacity: 0.8 }} />
            </div>
          ) : (
            <div
              onClick={(e) => {
                if (!editMode && canExpandPreview) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  openExpandedPreview(
                    previewUrl,
                    item.title,
                    item.imageUrl || "",
                    {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    }
                  );
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                cursor: !editMode ? "zoom-in" : "default",
              }}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title || "圖卡縮圖"}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: CARD_RADIUS,
                  }}
                />
              ) : (
                <img
                  src={failImage}
                  alt="無縮圖"
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: CARD_RADIUS,
                  }}
                />
              )}
            </div>
          )}
        </div>

        {editMode && activePage === "mycards" ? (
          <input
            type="text"
            value={item.title || ""}
            onChange={(e) => updateTitle(item.id, e.target.value)}
            onBlur={(e) => saveTitleToFirestore(item.pageUrl, e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              zIndex: 5,
              fontSize: isMobileTwoCol ? 12 : 14,
              color: "#fff",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: isMobileTwoCol ? 4 : 6,
              padding: isMobileTwoCol ? "4px 8px" : "6px 10px",
              background: "rgba(255, 255, 255, 0.08)",
              marginTop: 8,
            }}
          />
        ) : (
          displayTitle && (
            <div
              onClick={() => {
                if (user && !editMode && !item.isGroup && item.pageUrl) {
                  window.open(item.pageUrl, "_blank", "noopener,noreferrer");
                }
              }}
              role={user && !editMode && !item.isGroup ? "link" : undefined}
              tabIndex={user && !editMode && !item.isGroup ? 0 : -1}
              onKeyDown={(e) => {
                if (user && !editMode && !item.isGroup && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  window.open(item.pageUrl, "_blank", "noopener,noreferrer");
                }
              }}
              style={{
                width: "100%",
                fontSize: isMobileTwoCol ? 13 : 15,
                lineHeight: 1.3,
                color: "#fff",
                fontWeight: "bold",
                marginTop: 8,
                padding: "0 4px",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: user && !editMode && !item.isGroup ? "pointer" : "default",
              }}
            >
              {displayTitle}
            </div>
          )
        )}

        {activePage === "home" && !item.isDefault && item.email && (
          <div
            style={{
              fontSize: isMobileTwoCol ? 10 : 11,
              color: "#929292",
              marginTop: 2,
              padding: "0 4px",
              boxSizing: "border-box",
            }}
          >
            {item.email === "匿名使用者" ? "匿名新增" : `由 ${item.email.split("@")[0].toUpperCase()} 新增`}
          </div>
        )}
      </div>
    );
  };

  const activeCards =
    activePage === "home"
      ? homeCards
      : activePage === "mycards"
      ? activeGroupId
        ? myCards.filter((c) => c.groupId === activeGroupId)
        : myCards.filter((c) => !c.groupId)
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
    setShowAccountMenu(false);
    await signOut(auth);
    setUser(null);
    setMyCards([]);
  };

  const handleAddToHomeScreen = async () => {
    if (isIosSafari) {
      setShowHomeInstallGuide(true);
      return;
    }

    if (installPromptEvent) {
      installPromptEvent.prompt();
      await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      return;
    }

    setShowHomeInstallGuide(true);
  };

  const closeHomeInstallGuide = () => setShowHomeInstallGuide(false);

  const openExpandedPreview = (pageUrl, title = "", imageUrl = "", originRect = null) => {
    if (!pageUrl) return;
    setPreviewScale(1);
    setPreviewTranslate({ x: 0, y: 0 });
    setPreviewVisible(false);
    setPreviewOriginRect(originRect);
    if (previewCloseTimerRef.current) {
      clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    setExpandedPreviewCard({
      pageUrl,
      title,
      imageUrl: imageUrl || failImage,
      loading: false,
    });
  };

  const closeExpandedPreview = () => {
    if (!expandedPreviewCard) return;
    if (previewCloseTimerRef.current) clearTimeout(previewCloseTimerRef.current);
    setPreviewScale(1);
    setPreviewTranslate({ x: 0, y: 0 });
    setPreviewVisible(false);
    previewCloseTimerRef.current = setTimeout(() => {
      setExpandedPreviewCard(null);
      setPreviewOriginRect(null);
      previewCloseTimerRef.current = null;
    }, 180);
  };

  const previewFrameStyle = previewOriginRect
    ? {
        position: "fixed",
        top: previewVisible ? 0 : previewOriginRect.top,
        left: previewVisible ? 0 : previewOriginRect.left,
        width: previewVisible ? "100vw" : previewOriginRect.width,
        height: previewVisible ? "100dvh" : previewOriginRect.height,
        borderRadius: previewVisible ? 0 : CARD_RADIUS,
        overflow: "hidden",
        background: "#000000",
        boxShadow: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        willChange: "top, left, width, height, border-radius, box-shadow, opacity",
        margin: 0,
        transition:
          "top 260ms cubic-bezier(0.2, 0.9, 0.2, 1), left 260ms cubic-bezier(0.2, 0.9, 0.2, 1), width 260ms cubic-bezier(0.2, 0.9, 0.2, 1), height 260ms cubic-bezier(0.2, 0.9, 0.2, 1), border-radius 260ms cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 260ms ease, opacity 180ms ease",
        opacity: 1,
        transform: "translate3d(0, 0, 0)",
      }
    : {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      };

  // ----------------------------------------------------------------
  // 桌面版/手機版 樣式定義
  // ----------------------------------------------------------------

  const mobileTopInset = "env(safe-area-inset-top, 0px)";
  const mobileBottomInset = "env(safe-area-inset-bottom, 0px)";
  const MOBILE_BOTTOM_CHROME_PX = 138; // 12+48+10+56+12
  const mobileFooterClearance = `calc(${MOBILE_BOTTOM_CHROME_PX}px + ${mobileBottomInset})`;

  const MOBILE_GLASS_BG = "rgba(28, 28, 30, 0.45)";
  const MOBILE_GLASS_BLUR = "blur(16px)";
  const MOBILE_GLASS_BG_ACTIVE = "rgba(0, 191, 191, 0.45)";

  const mobileHeaderButtonStyle = (background = MOBILE_GLASS_BG) => ({
    width: 46,
    height: 46,
    borderRadius: "50%",
    border: "none",
    background,
    backdropFilter: MOBILE_GLASS_BLUR,
    WebkitBackdropFilter: MOBILE_GLASS_BLUR,
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const accountMenu = (
    <div
      id="account-menu-container"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        minWidth: 220,
        padding: 14,
        borderRadius: 28,
        background: "rgba(28, 28, 30, 0.88)",
        backdropFilter: MOBILE_GLASS_BLUR,
        WebkitBackdropFilter: MOBILE_GLASS_BLUR,
        boxShadow: "0 14px 34px rgba(0, 0, 0, 0.32)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transformOrigin: "top right",
        animation: "accountMenuPop 180ms cubic-bezier(0.2, 0.9, 0.2, 1) both",
      }}
    >
      {accountMenuItems.map((item, index) => {
        const selected = accountMenuInteractionMode === "press" && accountMenuHighlightedIndex === index;
        return (
          <button
            key={item.id}
            data-account-menu-index={index}
            onClick={async (e) => {
              if (suppressNextMoreMenuClickRef.current) {
                e.preventDefault();
                e.stopPropagation();
                suppressNextMoreMenuClickRef.current = false;
                return;
              }
              await triggerAccountMenuItem(index);
            }}
            style={{
              width: "100%",
              height: 54,
              border: "none",
              borderRadius: 20,
              background: selected
                ? item.danger
                  ? "rgba(255, 69, 58, 0.16)"
                  : "rgba(0, 191, 191, 0.24)"
                : item.id === "edit" && editMode
                  ? "rgba(0, 191, 191, 0.42)"
                  : "transparent",
              color: item.danger ? "#ff453a" : "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "0 22px",
              fontSize: 18,
              textAlign: "left",
              transform: selected ? "scale(0.98)" : "scale(1)",
              transition: "background 0.16s ease, transform 0.16s ease",
            }}
            onMouseEnter={(e) => {
              if (accountMenuInteractionMode === "press") return;
              e.currentTarget.style.background = item.danger
                ? "rgba(255, 69, 58, 0.12)"
                : item.id === "edit" && editMode
                  ? "rgba(0, 191, 191, 0.42)"
                  : "rgba(255, 255, 255, 0.06)";
            }}
            onMouseLeave={(e) => {
              if (accountMenuInteractionMode === "press") return;
              e.currentTarget.style.background = item.id === "edit" && editMode
                ? "rgba(0, 191, 191, 0.42)"
                : "transparent";
            }}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );

  const homeInstallGuide = showHomeInstallGuide ? (
    <div
      onClick={closeHomeInstallGuide}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        background: "rgba(0, 0, 0, 0.68)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        boxSizing: "border-box",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 380px)",
          background: "rgba(28, 28, 30, 0.96)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 24,
          padding: 20,
          color: "#fff",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
          position: "relative",
        }}
      >
        <button
          onClick={closeHomeInstallGuide}
          aria-label="關閉"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            border: "none",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.08)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>加入主畫面</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#cfcfcf" }}>
          {isIosSafari ? (
            <>
              1. 點下方的分享按鈕。
              <br />
              2. 選「加入主畫面」。
              <br />
              3. 確認右上角加入。
            </>
          ) : isAndroidChrome ? (
            <>
              如果系統沒有直接跳出安裝提示，請先重新整理頁面，再按一次這個按鈕。
              <br />
              你也可以點右上角瀏覽器選單，找「安裝應用程式」或「安裝網站」。
            </>
          ) : isDesktopChrome ? (
            <>
              如果你在 Windows 或 Mac 的 Chrome，上方按鈕通常會直接跳出安裝提示。
              <br />
              若沒有反應，先重新整理頁面，再按一次；也可以試右上角瀏覽器選單中的安裝項目。
            </>
          ) : (
            <>
              這個瀏覽器目前不支援直接安裝提示。
              <br />
              你可以試著改用 Chrome。
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // 頂層容器樣式（手機版不用 flex，避免 fixed 子層仍佔 flex 空間）
  const containerStyle = {
    ...(isMobile
      ? {
          position: "fixed",
          inset: 0,
          display: "block",
        }
      : {
          display: "flex",
          flexDirection: "row",
          height: "100dvh",
        }),
    background: "#111",
    overflow: "hidden",
  };

  // 側邊欄/頂部導航樣式 (桌面版側邊欄, 手機版頂部導航)
  const sidebarStyle = {
    width: isMobile ? "100%" : 202,
    height: isMobile ? `calc(72px + ${mobileTopInset})` : "auto",
    background: isMobile ? "transparent" : "rgb(15,15,15,0)",
    pointerEvents: isMobile ? "none" : "auto",
    color: "#fff",
    display: "flex",
    flexDirection: isMobile ? "row" : "column", // 手機版水平排列
    alignItems: isMobile ? "center" : "flex-start", // 手機版垂直置中
    padding: isMobile ? `calc(8px + ${mobileTopInset}) 20px 8px` : "0 8px",
    justifyContent: isMobile ? "flex-end" : "flex-start",
    position: isMobile ? "fixed" : "static",
    top: isMobile ? 0 : "auto",
    left: isMobile ? 0 : "auto",
    right: isMobile ? 0 : "auto",
    boxSizing: "border-box",
    zIndex: isMobile ? 30 : 10, // 確保在內容上方
  };

  // 主內容樣式（手機版：唯一可滾動層，全螢幕 inset:0）
  const mainContentStyle = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? isMobileTwoCol
        ? "repeat(2, 1fr)"
        : "1fr"
      : `repeat(${desktopColumns}, minmax(0, 1fr))`,
    gap: isMobile ? (isMobileTwoCol ? 10 : 16) : 12,
    ...(isMobile
      ? {
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          paddingTop: `calc(12px + ${mobileTopInset})`,
          paddingLeft: isMobileTwoCol ? 12 : 20,
          paddingRight: isMobileTwoCol ? 12 : 20,
          paddingBottom: mobileFooterClearance,
          zIndex: 1,
        }
      : {
          flex: 1,
          padding: 16,
          paddingTop: 59,
        }),
    justifyItems: "center",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-y",
  };

  // 手機版底部輸入框/導航列
  const mobileInputBottomOffset = showMobileNavBar
    ? `calc(12px + ${mobileBottomInset} + 56px + 10px)`
    : `calc(12px + ${mobileBottomInset})`;
  const showClipboardPrompt = !url && (clipboardUrl || clipboardPromptVisible);
  const showAppChrome = !loading;

  const mobileInputBar = (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: mobileInputBottomOffset,
        padding: "0 20px",
        zIndex: 21,
        pointerEvents: "none",
        transition: "bottom 220ms ease",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "visible",
          zIndex: 25,
        }}
      >
        {clipboardBursts.map((p) => (
          <span
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              marginLeft: -(p.size / 2),
              marginTop: -(p.size / 2),
              borderRadius: "50%",
              background: p.color,
              boxShadow: `0 0 14px ${p.color}, 0 0 26px ${p.color}`,
              opacity: 0,
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
              mixBlendMode: "screen",
              animation: `clipboardSpark 700ms ease-out ${p.delay}ms forwards`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, pointerEvents: "auto" }}>
        {showClipboardPrompt ? (
          <div style={{ flex: 1, position: "relative", overflow: "visible" }}>
            <button
              type="button"
              onPointerDown={() => setClipboardButtonPressed(true)}
              onPointerUp={triggerClipboardBurst}
              onPointerLeave={() => setClipboardButtonPressed(false)}
              onPointerCancel={() => setClipboardButtonPressed(false)}
              onClick={handleClipboardAddUrl}
              style={{
                flex: 1,
                width: "100%",
                height: 48,
                padding: "0 20px",
                borderRadius: 24,
                border: "none",
                background: "#00bfbf",
                color: "#fff",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                textAlign: "center",
                whiteSpace: "nowrap",
                position: "relative",
                zIndex: 1,
                transform: clipboardButtonPressed ? "scale(0.94)" : "scale(1)",
                boxShadow: clipboardButtonPressed
                  ? "0 6px 16px rgba(0, 191, 191, 0.22)"
                  : "0 10px 22px rgba(0, 191, 191, 0.18)",
                transition:
                  "transform 110ms ease, box-shadow 140ms ease, filter 140ms ease",
                filter: clipboardButtonPressed ? "brightness(0.96)" : "brightness(1)",
              }}
            >
              貼上並製作圖卡
            </button>
          </div>
        ) : (
          <>
          <input
            type="text"
            value={url}
            onFocus={() => {
              setClipboardPromptVisible(false);
              if (!user) handleLogin();
            }}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
            placeholder="輸入網址"
            style={{
              flex: 1,
              height: 48,
              padding: "0 20px",
              borderRadius: "24px 0 0 24px",
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
            marginLeft: -2,
            borderRadius: "0 50% 50% 0",
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
          </>
        )}
      </div>
    </div>
  );

  const mobileNavBar = (
    <div
      style={{
        position: "fixed",
        left: 20,
        right: 20,
        bottom: `calc(12px + ${mobileBottomInset})`,
        height: 56,
        zIndex: 20,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        padding: 5,
        background: MOBILE_GLASS_BG,
        backdropFilter: MOBILE_GLASS_BLUR,
        WebkitBackdropFilter: MOBILE_GLASS_BLUR,
        borderRadius: 36,
        pointerEvents: showMobileNavBar ? "auto" : "none",
        transform: showMobileNavBar ? "translateY(0)" : "translateY(calc(100% + 16px))",
        opacity: showMobileNavBar ? 1 : 0,
        transition: "transform 220ms ease, opacity 220ms ease",
      }}
    >
      <button
        onClick={() => setActivePage("home")}
        style={{
          flex: 1,
          height: "100%",
          border: "none",
          background: activePage === "home" ? "#575757" : "transparent",
          color: activePage === "home" ? "#ffffff" : "rgba(255,255,255,0.75)",
          cursor: "pointer",
          borderRadius: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          padding: "4px 4px",
        }}
      >
          <HouseIcon
            size={26}
            color={activePage === "home" ? "#ffffff" : "rgba(255,255,255,0.75)"}
          />
        <span
          style={{
            fontSize: 9,
            lineHeight: 1.15,
            fontWeight: activePage === "home" ? 600 : 400,
          }}
        >
          首頁
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
          flex: 1,
          height: "100%",
          border: "none",
          background: activePage === "mycards" ? "#575757" : "transparent",
          color: activePage === "mycards" ? "#ffffff" : "rgba(255,255,255,0.75)",
          cursor: "pointer",
          borderRadius: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          padding: "4px 4px",
        }}
      >
        <GalleryHorizontalEnd
          size={26}
          strokeWidth={activePage === "mycards" ? 3 : 2}
        />
        <span
          style={{
            fontSize: 9,
            lineHeight: 1.15,
            fontWeight: activePage === "mycards" ? 600 : 400,
          }}
        >
          個人
        </span>
      </button>
    </div>
  );

  // ----------------------------------------------------------------
  // 渲染區塊
  // ----------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <style>
        {`
          @keyframes accountMenuPop {
            0% {
              opacity: 0;
              transform: scale(0.82);
            }
            70% {
              opacity: 1;
              transform: scale(1.03);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }

          @keyframes clipboardSpark {
            0% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.35);
            }
            15% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.08) rotate(var(--rot));
            }
          }
        `}
      </style>
      {/* 側邊欄/頂部導航 */}
      <div style={sidebarStyle}>
        {showAppChrome && (isMobile ? ( // 手機版頂部導航
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "flex-end",
                pointerEvents: "auto",
              }}
            >
              {/* 登入/更多按鈕 */}
              {user ? (
                <div style={{ position: "relative" }}>
                  <button
                    id="more-button-mobile"
                    onClick={handleMoreButtonClick}
                    onTouchStart={handleMoreButtonTouchStart}
                    onContextMenu={(e) => e.preventDefault()}
                    style={mobileHeaderButtonStyle(
                      showAccountMenu || editMode ? MOBILE_GLASS_BG_ACTIVE : MOBILE_GLASS_BG
                    )}
                    title="更多"
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  {showAccountMenu && accountMenu}
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  style={mobileHeaderButtonStyle()}
                >
                  <LogIn size={20} />
                </button>
              )}
            </div>
          </>
        ) : (
          // 桌面版側邊欄 (保留原樣)
          <>
            <img src={logo} alt="Logo" style={{ width: "130px", margin: "20px auto 20px" }} />
            <div style={{ display: "flex", width: 200, marginBottom: 30, boxSizing: "border-box" }}>
              {showClipboardPrompt ? (
                <button
                  type="button"
                  onClick={handleClipboardAddUrl}
                  style={{
                    width: "100%",
                    height: 49,
                    padding: "0 18px",
                    borderRadius: 24,
                    border: "none",
                    background: "#00bfbf",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <ClipboardPaste size={20} />
                  貼上並製作圖卡
                </button>
              ) : (
                <>
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
                      minWidth: 0,
                      height: 49,
                      padding: "0 20px",
                      borderRadius: "24px 0 0 24px",
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
                      flexShrink: 0,
                      height: 49,
                      marginLeft: -2,
                      borderRadius: "0 24px 24px 0",
                      border: "none",
                      background: "#fff",
                      color: "#000",
                      cursor: "pointer",
                      fontWeight: activePage === "home" ? "bold" : "normal",
                    }}
                  >
                    <Plus size={20} strokeWidth={2.6} />
                  </button>
                </>
              )}
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
              <HomeOutline size={22} strokeWidth={activePage === "home" ? 3 : 2} /> 首頁
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

          </>
        ))}
      </div>

      {/* 主內容（手機：雙指捏合→雙欄、張開→單欄） */}
      <div
        ref={scrollRef}
        style={mainContentStyle}
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
      >
        {activeGroupId && (
          <div
            style={{
              gridColumn: "1 / -1",
              justifySelf: "center",
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 46,
              marginTop: isMobile ? 0 : 4,
              marginBottom: 16,
              marginLeft: isMobileTwoCol ? 8 : 0,
            }}
          >
            <h2 style={{ margin: 0, color: "#fff", fontSize: isMobile ? 18 : 22, fontWeight: "bold", textAlign: "center" }}>
              {myCards.find((c) => c.pageUrl === activeGroupId)?.title || "圖卡組"}
            </h2>
          </div>
        )}
        {showAppChrome && isMobile && !activeGroupId && (
          <div
            style={{
              gridColumn: "1 / -1",
              justifySelf: "start",
              marginLeft: isMobileTwoCol ? 8 : 0,
              pointerEvents: "none",
            }}
          >
            <img
              src={logo}
              alt="圖卡 Beta"
              style={{ width: LOGO_DISPLAY_WIDTH, height: "auto", display: "block" }}
            />
          </div>
        )}
        {loading ? (
          <div
            style={{
              gridColumn: "1 / -1",
              position: "relative",
              minHeight: "calc(100dvh - 40px)",
              width: "100%",
            }}
          >
            <img
              src={ingGif}
              alt="載入中"
              style={{
                position: "absolute",
                top: loadingGifDocked ? -20 : "50%",
                left: loadingGifDocked ? -11 : "50%",
                width: loadingGifDocked ? LOGO_DISPLAY_WIDTH - 46 : 148,
                height: loadingGifDocked ? LOGO_DISPLAY_WIDTH - 46 : 148,
                objectFit: "contain",
                transform: loadingGifDocked
                  ? "translate(0, 0) scale(1)"
                  : "translate(-50%, -50%) scale(1)",
                transition:
                  "top 520ms cubic-bezier(0.2, 0.9, 0.2, 1), left 520ms cubic-bezier(0.2, 0.9, 0.2, 1), width 520ms cubic-bezier(0.2, 0.9, 0.2, 1), height 520ms cubic-bezier(0.2, 0.9, 0.2, 1), transform 520ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 180ms ease",
                opacity: 1,
              }}
            />
          </div>
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

      {/* 桌面版更多選單 */}
      {showAppChrome && !isMobile && user && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 999,
          }}
        >
          <button
            id="more-button-desktop"
            onClick={handleMoreButtonClick}
            onTouchStart={handleMoreButtonTouchStart}
            onContextMenu={(e) => e.preventDefault()}
            style={mobileHeaderButtonStyle(
              showAccountMenu || editMode ? MOBILE_GLASS_BG_ACTIVE : MOBILE_GLASS_BG
            )}
            title="更多"
          >
            <MoreHorizontal size={22} />
          </button>
          {showAccountMenu && accountMenu}
        </div>
      )}

      {/* 桌面版登入區塊 (已移除，功能整合到側邊欄) */}
      {showAppChrome && !isMobile && (
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
            <button
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                paddingLeft: 16,
                paddingRight: 16,
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
      {showAppChrome && isMobile && mobileInputBar}
      {showAppChrome && isMobile && mobileNavBar}

      {/* 長按移出圖卡組選單 */}
      {contextMenuCard && (
        <div
          onClick={() => setContextMenuCard(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(28, 28, 30, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 24,
              padding: 12,
              minWidth: 220,
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                color: "#8e8e93",
                fontSize: 12,
                fontWeight: "bold",
                padding: "4px 12px 8px 12px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {contextMenuCard.title || "未命名圖卡"}
            </div>
            <button
              onClick={async () => {
                const url = contextMenuCard.pageUrl;
                setContextMenuCard(null);
                setMyCards((prev) =>
                  prev.map((c) => (c.pageUrl === url ? { ...c, groupId: null } : c))
                );
                await removeCardFromGroup(url);
              }}
              style={{
                width: "100%",
                height: 48,
                border: "none",
                borderRadius: 16,
                background: "transparent",
                color: "#ff453a",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 16px",
                fontSize: 16,
                fontWeight: "600",
                textAlign: "left",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 69, 58, 0.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <FolderMinus size={20} />
              移出圖卡組
            </button>
          </div>
        </div>
      )}
      {homeInstallGuide}
      {expandedPreviewCard && (
        <div
          onClick={closeExpandedPreview}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            backgroundColor: "#000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            boxSizing: "border-box",
            transition: "background-color 180ms ease",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeExpandedPreview();
            }}
            aria-label="返回"
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              zIndex: 3001,
              width: 44,
              height: 44,
              border: "none",
              borderRadius: "50%",
              background: "rgba(28, 28, 30, 0.7)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowLeft size={22} />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={handlePreviewWheel}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            style={previewFrameStyle}
          >
            {expandedPreviewCard.loading ? (
              <img
                src={ingGif}
                alt="載入中"
                draggable={false}
                style={{
                  width: 180,
                  height: 180,
                  objectFit: "contain",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              />
            ) : (
              <div
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  bumpPreviewZoom();
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `translate3d(${previewTranslate.x}px, ${previewTranslate.y}px, 0) scale(${previewScale})`,
                  transformOrigin: "center center",
                  transition: isPinchPanning.current ? "none" : "transform 180ms ease",
                  cursor: previewScale > 1 ? "zoom-out" : "zoom-in",
                }}
              >
                <img
                  src={expandedPreviewCard.imageUrl || failImage}
                  alt={expandedPreviewCard.title || "預覽圖"}
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    width: isMobile ? "100%" : "auto",
                    height: isMobile ? "auto" : "100dvh",
                    maxWidth: isMobile ? "100vw" : "none",
                    maxHeight: "100dvh",
                    objectFit: "contain",
                    display: "block",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                  }}
                  onError={(e) => {
                    e.currentTarget.src = failImage;
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {/* 固定在左上角的返回按鈕 */}
      {activeGroupId && (
        <div
          style={{
            position: "fixed",
            top: isMobile ? `calc(12px + ${mobileTopInset})` : 20,
            left: isMobile ? 20 : 218,
            zIndex: 999,
          }}
        >
          <button
            onClick={() => setActiveGroupId(null)}
            style={mobileHeaderButtonStyle()}
          >
            <ArrowLeft size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
