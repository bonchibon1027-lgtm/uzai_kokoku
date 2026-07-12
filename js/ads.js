/**
 * ads.js
 * ------------------------------------------------------
 * 11種類の「うざい広告」の実装。
 * 1広告タイプ = 1関数(init〜Ad)として実装し、末尾の
 * AdTypes レジストリでキーとひも付ける。
 * 将来広告タイプを追加する場合は、
 *   1. init〜Ad 関数を追加
 *   2. AdTypes に登録
 *   3. generator.js の AD_TYPE_DEFS にチェックボックス定義を追加
 * するだけでよい構造になっている。
 *
 * すべての「危険な」遷移先(偽×ボタン・擬態リンク・強制リダイレクト)は
 * 必ずサイト内の trap.html のみ。外部URLへは絶対に遷移しない。
 * ------------------------------------------------------
 */

/* ---------------------------------------------------------
   共通ヘルパー
--------------------------------------------------------- */

// パロディ広告のデフォルト素材(実在の企業名・商品名は使用しない)
const DEFAULT_AD_CREATIVES = [
  { emoji: "🏺", title: "怪しい壺(今なら99%OFF)", desc: "毎日そばに置くだけで人生が変わる…かもしれない壺です。" },
  { emoji: "💧", title: "飲むだけで痩せる謎の水", desc: "運動も食事制限も不要!?ただの水ではありません(たぶん)。" },
  { emoji: "🎉", title: "あなたは今日の10億人目の訪問者です！", desc: "おめでとうございます！豪華賞品が当たるかもしれません。" },
  { emoji: "💊", title: "【衝撃】お医者さんが隠したがる真実", desc: "この記事を読むだけで健康の常識が180度変わるとかなんとか。" },
  { emoji: "📱", title: "今すぐインストールで豪華賞品！？", desc: "1タップで人生が変わるかもしれないアプリ、だそうです。" },
  { emoji: "🧲", title: "貼るだけで肩こりが消える謎グッズ", desc: "科学的根拠は特にありませんが評判(?)は上々です。" },
  { emoji: "🐉", title: "先祖代々伝わる開運ブレスレット", desc: "着けるだけで運気が上がる…気がするアイテムです。" },
];

// generator.js と共有するsessionStorageキー
const CONFIG_STORAGE_KEY = "uzaAdConfig";

/** sessionStorageから設定を読み込む(存在しない場合はnull) */
function loadUzaAdConfig() {
  try {
    const raw = sessionStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("設定の読み込みに失敗しました:", e);
    return null;
  }
}

/** HTMLエスケープ(ユーザー入力のテキストをそのまま埋め込むための保険) */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 広告クリエイティブを順番に使い回すためのカウンタ
let __creativeCounter = 0;

/**
 * 表示に使う広告クリエイティブ(画像 or 絵文字 + タイトル + 説明)を1つ返す。
 * ユーザーが画像をアップロードしていればそれを順番に、
 * していなければ内蔵デフォルト素材をランダム風に順番に使い回す。
 * ユーザーがキャッチコピーを入力していれば、タイトルとして優先的に使う。
 */
function pickAdCreative(config) {
  const hasImages = config && Array.isArray(config.images) && config.images.length > 0;
  let base;
  if (hasImages) {
    const src = config.images[__creativeCounter % config.images.length];
    base = { imageSrc: src, emoji: null, desc: "今だけの特別なチャンスをお見逃しなく。" };
  } else {
    const def = DEFAULT_AD_CREATIVES[__creativeCounter % DEFAULT_AD_CREATIVES.length];
    base = { imageSrc: null, emoji: def.emoji, desc: def.desc, defaultTitle: def.title };
  }
  __creativeCounter++;

  const title = (config && config.adText && config.adText.trim()) || base.defaultTitle || "あなたにおすすめの商品です！";
  return {
    imageSrc: base.imageSrc,
    emoji: base.emoji || "📢",
    title: title,
    desc: base.desc,
  };
}

/** 広告クリエイティブのメディア部分(画像 or 絵文字)のHTMLを生成 */
function creativeMediaHtml(creative, heightCss) {
  const h = heightCss || "140px";
  if (creative.imageSrc) {
    return `<img src="${creative.imageSrc}" alt="広告画像" style="max-height:${h};max-width:100%;border-radius:8px;margin:0 auto 10px;" />`;
  }
  return `<div class="ad-creative-emoji">${creative.emoji}</div>`;
}

/** trap.html(サイト内のパロディページ)へ遷移する。外部サイトへは絶対に飛ばない。 */
function goToTrapPage() {
  location.href = "trap.html";
}

/* ---------------------------------------------------------
   音声まわり(Web Audio APIによるジングル生成 / アップロード音声再生)
--------------------------------------------------------- */

let __sharedAudioCtx = null;
function getSharedAudioCtx() {
  if (!__sharedAudioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    __sharedAudioCtx = new Ctx();
  }
  return __sharedAudioCtx;
}

/** 安っぽい3〜4音のファンファーレ風ジングルをWeb Audio APIで生成・再生する */
function playGeneratedJingle() {
  const ctx = getSharedAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const notes = [523.25, 659.25, 783.99, 1046.5]; // ド・ミ・ソ・高いド 風
  const now = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const start = now + i * 0.16;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.16);
  });
}

/**
 * 設定に音声アップロードがあればそれを、なければ生成ジングルを再生する。
 * 戻り値: アップロード音声を再生した場合はHTMLAudioElement、それ以外はnull
 */
function playConfiguredAudio(config) {
  if (config && config.audio) {
    try {
      const audio = new Audio(config.audio);
      audio.volume = 0.5;
      audio.play().catch(() => {
        /* 自動再生がブロックされた場合も静かに失敗させる */
      });
      return audio;
    } catch (e) {
      console.warn("音声再生に失敗しました:", e);
      return null;
    }
  }
  playGeneratedJingle();
  return null;
}

/* ---------------------------------------------------------
   ① ポップアップ広告
--------------------------------------------------------- */
function initPopupAd(config, ctx) {
  function showPopup() {
    if (document.getElementById("popup-ad-overlay")) return;
    const creative = pickAdCreative(config);
    const overlay = document.createElement("div");
    overlay.className = "ad-modal-overlay";
    overlay.id = "popup-ad-overlay";
    overlay.innerHTML = `
      <div class="ad-modal-box">
        <span class="ad-label">広告</span>
        <button class="real-close-btn" aria-label="閉じる" style="width:22px;height:22px;font-size:14px;line-height:22px;background:#e8e8e8;color:#666;border-radius:50%;">×</button>
        ${creativeMediaHtml(creative)}
        <div class="ad-creative-title">${escapeHtml(creative.title)}</div>
        <div class="ad-creative-desc">${escapeHtml(creative.desc)}</div>
        <button type="button" class="ad-cta-btn">今すぐチェック</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector(".real-close-btn").addEventListener("click", () => {
      overlay.remove();
      // 閉じても30秒後にしつこく再出現する
      setTimeout(showPopup, 30000);
    });
  }

  let triggered = false;
  const initialTimer = setTimeout(() => {
    if (!triggered) {
      triggered = true;
      showPopup();
    }
  }, 2000);

  function onScroll() {
    if (!triggered && window.scrollY > 60) {
      triggered = true;
      clearTimeout(initialTimer);
      window.removeEventListener("scroll", onScroll);
      showPopup();
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ---------------------------------------------------------
   ② 全面広告(インタースティシャル)
--------------------------------------------------------- */
function initInterstitialAd(config, ctx) {
  const container = ctx.articleContainer;
  if (!container) return;

  const triggerWrap = document.createElement("p");
  triggerWrap.style.textAlign = "center";
  triggerWrap.innerHTML = `<button type="button" class="ad-cta-btn" id="interstitial-trigger-btn">次のページへ →</button>`;
  container.appendChild(triggerWrap);

  document.getElementById("interstitial-trigger-btn").addEventListener("click", () => {
    if (document.getElementById("interstitial-ad-overlay")) return;
    const creative = pickAdCreative(config);
    const overlay = document.createElement("div");
    overlay.className = "interstitial-overlay";
    overlay.id = "interstitial-ad-overlay";
    overlay.innerHTML = `
      <button class="interstitial-close" id="interstitial-close-btn" style="visibility:hidden;" aria-label="閉じる">×</button>
      <div>
        <span style="font-size:0.7rem;opacity:.7;">広告</span>
        ${creativeMediaHtml(creative, "200px")}
        <div class="ad-creative-title" style="font-size:1.4rem;">${escapeHtml(creative.title)}</div>
        <div class="ad-creative-desc" style="color:#eee;">${escapeHtml(creative.desc)}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector("#interstitial-close-btn");
    // 5秒間は閉じるボタンを表示しない
    setTimeout(() => {
      closeBtn.style.visibility = "visible";
    }, 5000);
    closeBtn.addEventListener("click", () => overlay.remove());
  });
}

/* ---------------------------------------------------------
   ③ 極小・偽装×ボタン
--------------------------------------------------------- */
function initFakeCloseAd(config, ctx) {
  setTimeout(() => {
    if (document.getElementById("fakeclose-ad-overlay")) return;
    const creative = pickAdCreative(config);
    const overlay = document.createElement("div");
    overlay.className = "ad-modal-overlay";
    overlay.id = "fakeclose-ad-overlay";
    overlay.innerHTML = `
      <div class="ad-modal-box">
        <span class="ad-label">広告</span>
        <button class="real-close-btn" aria-label="閉じる(本物のボタンです)"></button>
        ${creativeMediaHtml(creative)}
        <div class="ad-creative-title">${escapeHtml(creative.title)}</div>
        <div class="ad-creative-desc">${escapeHtml(creative.desc)}</div>
        <button type="button" class="fake-close-btn">× 閉じる</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // 本物の×(8px・背景と同化、ホバー時のみ少し見える)
    overlay.querySelector(".real-close-btn").addEventListener("click", () => {
      overlay.remove();
    });

    // 目立つ偽の「閉じる」ボタン → trap.htmlへ
    overlay.querySelector(".fake-close-btn").addEventListener("click", () => {
      goToTrapPage();
    });
  }, 4500);
}

/* ---------------------------------------------------------
   ④ 追従型(スティッキー)広告
--------------------------------------------------------- */
function initStickyAd(config, ctx) {
  const creative = pickAdCreative(config);
  const bar = document.createElement("div");
  bar.className = "sticky-ad";
  bar.id = "sticky-ad-bar";
  bar.innerHTML = `
    <div class="sticky-ad-content">
      ${creative.imageSrc
        ? `<img src="${creative.imageSrc}" alt="広告" style="height:100%;max-height:70px;border-radius:6px;" />`
        : `<span style="font-size:2rem;">${creative.emoji}</span>`}
      <div>
        <div style="font-weight:bold;font-size:0.92rem;">${escapeHtml(creative.title)}</div>
        <div style="font-size:0.76rem;">${escapeHtml(creative.desc)}</div>
      </div>
    </div>
    <button class="sticky-ad-close" aria-label="閉じる">×</button>
  `;
  document.body.appendChild(bar);

  bar.querySelector(".sticky-ad-close").addEventListener("click", () => {
    bar.classList.add("hidden");
    // 閉じても3秒後に自動で復活する
    setTimeout(() => {
      bar.classList.remove("hidden");
    }, 3000);
  });
}

/* ---------------------------------------------------------
   ⑤ スクロール割り込み広告
--------------------------------------------------------- */
function initScrollInterruptAd(config, ctx) {
  const slots = ctx.scrollSlots || [];
  if (slots.length === 0 || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const slot = entry.target;
        if (slot.dataset.filled === "1") return;
        slot.dataset.filled = "1";

        const creative = pickAdCreative(config);
        slot.innerHTML = `
          <div class="scroll-ad-inner">
            <span style="font-size:0.62rem;opacity:.75;">広告</span>
            ${creativeMediaHtml(creative, "100px")}
            <div class="ad-creative-title" style="color:#fff;margin-bottom:0;">${escapeHtml(creative.title)}</div>
          </div>
        `;
        // height:0 → 300px にアニメーションさせて読んでいた行を押し下げる
        requestAnimationFrame(() => {
          slot.classList.add("expanded");
        });
        observer.unobserve(slot);
      });
    },
    { threshold: 0.25 }
  );

  slots.forEach((slot) => observer.observe(slot));
}

/* ---------------------------------------------------------
   ⑥ 音声付き自動再生動画広告(疑似動画)
--------------------------------------------------------- */
function initAutoplayVideoAd(config, ctx) {
  const slot = ctx.videoAdSlot;
  if (!slot || !("IntersectionObserver" in window)) return;

  const creative = pickAdCreative(config);
  slot.innerHTML = `
    <div class="video-ad-box" id="video-ad-box">
      <span style="position:absolute;top:8px;left:12px;font-size:0.62rem;color:#aaa;">広告(音声あり)</span>
      <div class="video-ad-fake-screen">
        ${creative.imageSrc
          ? `<img src="${creative.imageSrc}" style="max-height:100%;max-width:100%;object-fit:cover;" />`
          : `<span>${creative.emoji}</span>`}
      </div>
      <div class="ad-creative-title" style="color:#fff;">${escapeHtml(creative.title)}</div>
      <div class="video-ad-progress-track"><div class="video-ad-progress-bar" id="video-ad-progress-bar"></div></div>
      <button class="video-ad-mute" id="video-ad-mute-btn" aria-label="ミュート切り替え">🔊</button>
    </div>
  `;

  let muted = false;
  let hasPlayed = false;
  let currentAudioEl = null;
  const progressBar = slot.querySelector("#video-ad-progress-bar");
  const muteBtn = slot.querySelector("#video-ad-mute-btn");

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "🔇" : "🔊";
    if (currentAudioEl) currentAudioEl.muted = muted;
  });

  function runProgressBar() {
    let pct = 0;
    const timer = setInterval(() => {
      pct += 2;
      progressBar.style.width = Math.min(pct, 100) + "%";
      if (pct >= 100) clearInterval(timer);
    }, 120);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasPlayed) {
          hasPlayed = true;
          runProgressBar();
          if (!muted) {
            currentAudioEl = playConfiguredAudio(config);
          }
          observer.unobserve(slot);
        }
      });
    },
    { threshold: 0.5 }
  );
  observer.observe(slot);
}

/* ---------------------------------------------------------
   ⑦ スキップ不可カウントダウン広告
--------------------------------------------------------- */
function initCountdownAd(config, ctx) {
  const creative = pickAdCreative(config);
  const overlay = document.createElement("div");
  overlay.className = "gate-overlay";
  overlay.id = "countdown-ad-overlay";

  let remaining = 10;
  overlay.innerHTML = `
    <span style="font-size:0.7rem;color:#aaa;">広告</span>
    ${creativeMediaHtml(creative, "180px")}
    <div class="ad-creative-title" style="color:#fff;font-size:1.3rem;">${escapeHtml(creative.title)}</div>
    <div class="ad-creative-desc" style="color:#ddd;">${escapeHtml(creative.desc)}</div>
    <div class="gate-countdown" id="countdown-ad-text">あと${remaining}秒でコンテンツに移動できます</div>
    <button class="gate-skip-btn" id="countdown-ad-skip-btn" disabled>スキップ</button>
  `;
  document.body.appendChild(overlay);

  const textEl = overlay.querySelector("#countdown-ad-text");
  const skipBtn = overlay.querySelector("#countdown-ad-skip-btn");

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      textEl.textContent = "コンテンツに移動できます";
      skipBtn.disabled = false;
      skipBtn.textContent = "スキップして記事を読む";
    } else {
      textEl.textContent = `あと${remaining}秒でコンテンツに移動できます`;
    }
  }, 1000);

  skipBtn.addEventListener("click", () => {
    if (skipBtn.disabled) return;
    overlay.remove();
  });
}

/* ---------------------------------------------------------
   ⑧ ホバー展開型広告
--------------------------------------------------------- */
function initHoverExpandAd(config, ctx) {
  const target = ctx.sideCol;
  if (!target) return;

  const creative = pickAdCreative(config);
  const box = document.createElement("div");
  box.className = "hover-ad";
  box.id = "hover-expand-ad";
  box.innerHTML = `
    <span style="font-size:0.62rem;opacity:.85;">広告</span>
    ${creativeMediaHtml(creative, "90px")}
    <div class="ad-creative-title" style="color:#fff;">${escapeHtml(creative.title)}</div>
    <div class="ad-creative-desc" style="color:#eafff5;">${escapeHtml(creative.desc)}</div>
  `;
  target.appendChild(box);

  let shrinkTimer = null;
  box.addEventListener("mouseenter", () => {
    if (shrinkTimer) {
      clearTimeout(shrinkTimer);
      shrinkTimer = null;
    }
    box.classList.add("expanded");
  });
  box.addEventListener("mouseleave", () => {
    // マウスが離れても2秒間は縮まない
    shrinkTimer = setTimeout(() => {
      box.classList.remove("expanded");
    }, 2000);
  });

  // タッチ端末向け(タップで展開、離れる概念がないのでタップ切り替え)
  box.addEventListener(
    "touchstart",
    () => {
      box.classList.toggle("expanded");
    },
    { passive: true }
  );
}

/* ---------------------------------------------------------
   ⑨ 擬態型インフィード広告
--------------------------------------------------------- */
function initInfeedAd(config, ctx) {
  const list = ctx.recommendList;
  if (!list) return;

  const fakeCount = 1 + Math.floor(Math.random() * 2); // 1〜2個
  for (let i = 0; i < fakeCount; i++) {
    const creative = pickAdCreative(config);
    const item = document.createElement("a");
    item.href = "javascript:void(0);";
    item.className = "recommend-item";
    item.innerHTML = `
      <div class="recommend-thumb">
        ${creative.imageSrc
          ? `<img src="${creative.imageSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`
          : `<span>${creative.emoji}</span>`}
      </div>
      <div class="recommend-title">${escapeHtml(creative.title)}</div>
      <div class="pr-tag">PR</div>
    `;
    item.addEventListener("click", (e) => {
      e.preventDefault();
      goToTrapPage();
    });

    // 本物の記事に紛れ込ませるため、ランダムな位置に挿入する
    const children = Array.from(list.children);
    const pos = Math.floor(Math.random() * (children.length + 1));
    if (children[pos]) {
      list.insertBefore(item, children[pos]);
    } else {
      list.appendChild(item);
    }
  }
}

/* ---------------------------------------------------------
   ⑩ 強制リダイレクト広告
--------------------------------------------------------- */
function initForceRedirectAd(config, ctx) {
  const target = ctx.articleContainer;
  if (!target) return;

  let clickCount = 0;
  target.addEventListener("click", (e) => {
    // 他の広告の操作ボタン(ゲート解除・ミュート・全面広告トリガー等)を
    // 押しただけでtrap行きになると理不尽すぎるので、button/aは数えない
    if (e.target.closest("button, a")) return;
    clickCount += 1;
    if (clickCount >= 2) {
      goToTrapPage();
    }
  });
}

/* ---------------------------------------------------------
   ⑪ 視聴強制ゲート
--------------------------------------------------------- */
function initViewGateAd(config, ctx) {
  const target = ctx.articleContainer;
  if (!target) return;

  target.style.position = "relative";
  target.style.minHeight = "320px";

  let remaining = 15;
  const gate = document.createElement("div");
  gate.className = "gate-overlay gate-in-article";
  gate.style.position = "absolute";
  gate.style.inset = "0";
  gate.style.borderRadius = "12px";
  // 記事は縦に長いので、中身は .gate-inner (position: sticky) に包んで
  // スクロール位置に関係なく常に画面内に見えるようにする
  gate.innerHTML = `
    <div class="gate-inner">
      <span style="font-size:0.7rem;color:#aaa;">広告</span>
      <div class="ad-creative-title" style="color:#fff;font-size:1.1rem;max-width:320px;">この記事を読むには広告(15秒)を視聴してください</div>
      <div class="gate-countdown" id="viewgate-countdown">15</div>
      <button class="gate-skip-btn" id="viewgate-read-btn" style="display:none;">記事を読む</button>
    </div>
  `;
  target.appendChild(gate);

  const numEl = gate.querySelector("#viewgate-countdown");
  const readBtn = gate.querySelector("#viewgate-read-btn");

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      numEl.style.display = "none";
      readBtn.style.display = "inline-block";
    } else {
      numEl.textContent = String(remaining);
    }
  }, 1000);

  readBtn.addEventListener("click", () => {
    gate.remove();
    target.style.minHeight = "";
  });
}

/* ---------------------------------------------------------
   ⑫ スワイプ広告
   記事段落(60%あたり)の手前に、一見無害な普通のインライン広告バナーを
   挿入する。ページをスクロールしようとして指(またはホイール/マウス
   ドラッグ)がバナーの上を通過すると、「広告への操作」とみなされ、
   全画面広告が下から押し込まれるように出現する。
   rAFは使わず、CSS transitionのみでスライドイン/アウトを行う。
--------------------------------------------------------- */
function initSwipeAd(config, ctx) {
  const container = ctx.articleContainer;
  if (!container) return;

  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) return;

  // 記事の60%あたりの段落の手前に挿入する
  const insertIndex = Math.min(
    paragraphs.length - 1,
    Math.max(0, Math.floor(paragraphs.length * 0.6))
  );
  const anchor = paragraphs[insertIndex];

  // 黒い枠の中で広告カードが斜めに奥へ倒れ込んでいる3D演出のバナー
  // (実物のスワイプ広告の見た目)。スワイプの動きに連動してカードが
  // さらに奥へ押し込まれ、押し込みきると全画面広告が発動する
  const bannerCreative = pickAdCreative(config);
  const banner = document.createElement("div");
  banner.className = "swipead-banner";
  banner.id = "swipead-banner";
  banner.innerHTML = `
    <span class="swipead-tag">広告</span>
    <span class="swipead-adchoices" aria-hidden="true">ⓘ ✕</span>
    <div class="swipead-card" id="swipead-card">
      ${bannerCreative.imageSrc
        ? `<img src="${bannerCreative.imageSrc}" alt="広告" class="swipead-card-img" />`
        : `<span style="font-size:2.6rem;">${bannerCreative.emoji}</span>`}
      <div class="ad-creative-title" style="font-size:0.95rem;margin-bottom:2px;">${escapeHtml(bannerCreative.title)}</div>
      <div class="ad-creative-desc" style="font-size:0.72rem;margin-bottom:0;">${escapeHtml(bannerCreative.desc)}</div>
    </div>
  `;
  anchor.parentNode.insertBefore(banner, anchor);

  // スワイプの進み具合(0〜1)に応じてカードを奥へ押し込む
  const card = banner.querySelector("#swipead-card");
  function setPushProgress(p) {
    const angle = -32 - 38 * p; // -32deg(初期の傾き) → -70deg
    const depth = -140 * p; // 奥行き方向へ最大140px
    card.style.transform = `rotateY(${angle}deg) translateZ(${depth}px)`;
  }
  function resetPush() {
    card.style.transform = "";
  }

  let overlayOpen = false;
  let cooldownUntil = 0;

  /** 全画面広告を下から押し込むように出現させる */
  function triggerOverlay() {
    if (overlayOpen) return;
    if (Date.now() < cooldownUntil) return;
    if (document.getElementById("swipead-fullscreen-overlay")) return;
    overlayOpen = true;

    const creative = pickAdCreative(config);
    const overlay = document.createElement("div");
    overlay.className = "swipead-overlay";
    overlay.id = "swipead-fullscreen-overlay";
    overlay.innerHTML = `
      <button type="button" class="swipead-close" id="swipead-close-btn" aria-label="閉じる">×</button>
      <div class="swipead-notice">広告 | スワイプ操作が広告への操作として認識されました</div>
      ${creativeMediaHtml(creative, "200px")}
      <div class="ad-creative-title" style="color:#fff;font-size:1.3rem;">${escapeHtml(creative.title)}</div>
      <div class="ad-creative-desc" style="color:#ddd;">${escapeHtml(creative.desc)}</div>
      <button type="button" class="ad-cta-btn" id="swipead-cta-btn">今すぐチェック</button>
    `;
    document.body.appendChild(overlay);

    // requestAnimationFrameは検証環境(タブが非アクティブ等)で動かないことが
    // あるため使わず、強制リフローを挟んでからクラス付与してtransitionを発火させる
    void overlay.offsetHeight;
    overlay.classList.add("is-open");

    const closeBtn = overlay.querySelector("#swipead-close-btn");
    // 閉じるボタンは2秒後に出現(それまでは非表示・クリック不可)
    const closeBtnTimer = setTimeout(() => {
      closeBtn.classList.add("visible");
    }, 2000);

    overlay.querySelector("#swipead-cta-btn").addEventListener("click", () => {
      goToTrapPage();
    });

    closeBtn.addEventListener("click", () => {
      if (!closeBtn.classList.contains("visible")) return;
      clearTimeout(closeBtnTimer);

      // 下へスライドアウト(逆アニメーション)
      overlay.classList.remove("is-open");
      const cleanup = () => {
        overlay.remove();
      };
      overlay.addEventListener("transitionend", cleanup, { once: true });
      // transitionendが発火しない環境への保険
      setTimeout(cleanup, 500);

      overlayOpen = false;
      // 閉じた直後1秒間はクールダウンとして再発動しない
      cooldownUntil = Date.now() + 1000;
    });
  }

  /** 押し込みきったときの共通処理 */
  function completePush() {
    resetPush();
    triggerOverlay();
  }

  /* ---- スワイプ検知(タッチ)。90pxのスワイプでカードが押し込みきられて発動 ---- */
  const TOUCH_FULL_PUSH = 90;
  let touchStartY = null;
  banner.addEventListener(
    "touchstart",
    (e) => {
      if (overlayOpen) return;
      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );
  banner.addEventListener(
    "touchmove",
    (e) => {
      if (overlayOpen || touchStartY === null) return;
      if (e.touches && e.touches.length > 0) {
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        const p = Math.min(1, dy / TOUCH_FULL_PUSH);
        setPushProgress(p);
        if (p >= 1) {
          touchStartY = null;
          completePush();
        }
      }
    },
    { passive: true }
  );
  banner.addEventListener(
    "touchend",
    () => {
      touchStartY = null;
      if (!overlayOpen) resetPush();
    },
    { passive: true }
  );

  /* ---- スワイプ検知(マウスドラッグ) ---- */
  let pointerStartY = null;
  banner.addEventListener("pointerdown", (e) => {
    if (overlayOpen) return;
    if (e.pointerType === "mouse") {
      pointerStartY = e.clientY;
    }
  });
  banner.addEventListener("pointermove", (e) => {
    if (overlayOpen || pointerStartY === null) return;
    const dy = Math.abs(e.clientY - pointerStartY);
    const p = Math.min(1, dy / TOUCH_FULL_PUSH);
    setPushProgress(p);
    if (p >= 1) {
      pointerStartY = null;
      completePush();
    }
  });
  banner.addEventListener("pointerup", () => {
    pointerStartY = null;
    if (!overlayOpen) resetPush();
  });
  banner.addEventListener("pointerleave", () => {
    pointerStartY = null;
    if (!overlayOpen) resetPush();
  });

  /* ---- スワイプ検知(ホイール。ページのスクロールは妨げないのでpreventDefaultは絶対に呼ばない) ---- */
  const WHEEL_FULL_PUSH = 160;
  let wheelAccum = 0;
  let wheelResetTimer = null;
  banner.addEventListener(
    "wheel",
    (e) => {
      if (overlayOpen) return;
      wheelAccum += Math.abs(e.deltaY);
      if (wheelResetTimer) clearTimeout(wheelResetTimer);
      wheelResetTimer = setTimeout(() => {
        wheelAccum = 0;
        wheelResetTimer = null;
        if (!overlayOpen) resetPush();
      }, 600);
      const p = Math.min(1, wheelAccum / WHEEL_FULL_PUSH);
      setPushProgress(p);
      if (p >= 1) {
        wheelAccum = 0;
        if (wheelResetTimer) {
          clearTimeout(wheelResetTimer);
          wheelResetTimer = null;
        }
        completePush();
      }
    },
    { passive: true }
  );
}

/* ---------------------------------------------------------
   レジストリパターン
   キー = generator.js の AD_TYPE_DEFS[].id と一致させる
--------------------------------------------------------- */
const AdTypes = {
  popup: initPopupAd,
  interstitial: initInterstitialAd,
  fakeClose: initFakeCloseAd,
  sticky: initStickyAd,
  scrollInterrupt: initScrollInterruptAd,
  autoplayVideo: initAutoplayVideoAd,
  countdown: initCountdownAd,
  hoverExpand: initHoverExpandAd,
  infeed: initInfeedAd,
  forceRedirect: initForceRedirectAd,
  viewGate: initViewGateAd,
  swipeAd: initSwipeAd,
};

/**
 * オーバーレイタップ(ユーザージェスチャ)のタイミングで呼び出し、
 * AudioContextを生成・resumeしておくことで、後続の自動再生広告が
 * ブラウザの自動再生ブロックに引っかかりにくくする。
 */
function unlockUzaAudio() {
  const ctx = getSharedAudioCtx();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

// experience.html のメインスクリプトから参照できるようグローバルに公開
window.AdTypes = AdTypes;
window.loadUzaAdConfig = loadUzaAdConfig;
window.escapeHtmlUza = escapeHtml;
window.unlockUzaAudio = unlockUzaAudio;
