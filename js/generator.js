/**
 * generator.js
 * ------------------------------------------------------
 * index.html(ジェネレーター画面)のロジック。
 * - 広告タイプ一覧の描画とプリセット選択(全部盛り/おまかせ)
 * - 素材(画像/音声)のアップロード → dataURL化
 * - 記事モードの切り替え
 * - 体験開始時に設定をJSON化してsessionStorageへ保存し、
 *   experience.htmlへ遷移する
 *
 * sessionStorageのキー名は "uzaAdConfig" に統一し、
 * ads.js / experience.html 側でも同じキーを参照する。
 * ------------------------------------------------------
 */

// 11種類の広告タイプ定義(id は ads.js の AdTypes レジストリのキーと一致させる)
const AD_TYPE_DEFS = [
  { id: "popup", name: "① ポップアップ広告", desc: "しばらくすると画面中央に広告が出現。閉じてもしつこく再出現します。" },
  { id: "interstitial", name: "② 全面広告(インタースティシャル)", desc: "リンクを押すと画面全体を覆う広告が出現。閉じるボタンは数秒間押せません。" },
  { id: "fakeClose", name: "③ 極小・偽装×ボタン", desc: "本物の閉じるボタンは極小で見えづらく、目立つ偽ボタンを押すと注意サイトへ。" },
  { id: "sticky", name: "④ 追従型(スティッキー)広告", desc: "画面下部に常時居座るバナー。消してもすぐ復活します。" },
  { id: "scrollInterrupt", name: "⑤ スクロール割り込み広告", desc: "記事を読み進めると、いきなり広告エリアがせり出して読んでいた行を押し下げます。" },
  { id: "autoplayVideo", name: "⑥ 音声付き自動再生動画広告", desc: "画面に入った瞬間、勝手に音が鳴る疑似動画広告が再生されます。" },
  { id: "countdown", name: "⑦ スキップ不可カウントダウン広告", desc: "体験開始直後に全画面広告。カウントダウンが終わるまでスキップ不可。" },
  { id: "hoverExpand", name: "⑧ ホバー展開型広告", desc: "マウスが乗ると画面の大部分までぐんぐん拡大する広告。" },
  { id: "infeed", name: "⑨ 擬態型インフィード広告", desc: "おすすめ記事に紛れ込む、本物そっくりの広告リンク。" },
  { id: "forceRedirect", name: "⑩ 強制リダイレクト広告", desc: "記事エリアを連続でタップすると、強制的に別ページへ飛ばされます。" },
  { id: "viewGate", name: "⑪ 視聴強制ゲート", desc: "記事全体が広告ゲートに覆われ、視聴完了までは読めません。" },
];

// アップロード素材の保持用(dataURL配列)
let uploadedImages = []; // [{name, dataUrl, size}]
let uploadedAudio = null; // {name, dataUrl, size} | null

const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 約4MB

document.addEventListener("DOMContentLoaded", () => {
  renderAdTypeList();
  bindPresetButtons();
  bindFileInputs();
  bindArticleModeToggle();
  bindStartButton();
});

/** 広告タイプのチェックボックス一覧を描画する */
function renderAdTypeList() {
  const wrap = document.getElementById("ad-type-list");
  wrap.innerHTML = "";
  AD_TYPE_DEFS.forEach((def) => {
    const item = document.createElement("div");
    item.className = "ad-type-item";
    item.innerHTML = `
      <input type="checkbox" id="adtype-${def.id}" value="${def.id}" />
      <label for="adtype-${def.id}">
        <span class="ad-type-name">${def.name}</span>
        <span class="ad-type-desc">${def.desc}</span>
      </label>
    `;
    wrap.appendChild(item);
  });
}

function getAllCheckboxes() {
  return Array.from(document.querySelectorAll('#ad-type-list input[type="checkbox"]'));
}

/** 全部盛り/おまかせ/クリアボタンの挙動 */
function bindPresetButtons() {
  document.getElementById("btn-select-all").addEventListener("click", () => {
    getAllCheckboxes().forEach((cb) => (cb.checked = true));
  });

  document.getElementById("btn-random").addEventListener("click", () => {
    const boxes = getAllCheckboxes();
    boxes.forEach((cb) => (cb.checked = false));
    const count = 3 + Math.floor(Math.random() * 3); // 3〜5個
    const shuffled = [...boxes].sort(() => Math.random() - 0.5);
    shuffled.slice(0, count).forEach((cb) => (cb.checked = true));
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    getAllCheckboxes().forEach((cb) => (cb.checked = false));
  });
}

/** ファイル(画像/音声)をdataURL化するPromiseラッパー */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindFileInputs() {
  const imgInput = document.getElementById("input-images");
  const audioInput = document.getElementById("input-audio");
  const thumbRow = document.getElementById("image-thumbs");
  const audioHint = document.getElementById("audio-hint");

  imgInput.addEventListener("change", async () => {
    uploadedImages = [];
    thumbRow.innerHTML = "";
    const files = Array.from(imgInput.files || []);
    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        uploadedImages.push({ name: file.name, dataUrl, size: file.size });
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = file.name;
        thumbRow.appendChild(img);
      } catch (e) {
        console.warn("画像読み込みに失敗しました:", file.name, e);
      }
    }
  });

  audioInput.addEventListener("change", async () => {
    uploadedAudio = null;
    const file = audioInput.files && audioInput.files[0];
    if (!file) {
      audioHint.textContent = "未指定の場合、Web Audio APIで生成した安っぽいジングル音が使われます。";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      uploadedAudio = { name: file.name, dataUrl, size: file.size };
      audioHint.textContent = `選択中: ${file.name}`;
    } catch (e) {
      console.warn("音声読み込みに失敗しました:", e);
    }
  });
}

/** 記事モード(おまかせ/自分で貼り付け)の切り替え */
function bindArticleModeToggle() {
  const radios = document.querySelectorAll('input[name="article-mode"]');
  const customRow = document.getElementById("custom-article-row");
  radios.forEach((r) => {
    r.addEventListener("change", () => {
      customRow.style.display = r.value === "custom" && r.checked ? "block" : "none";
    });
  });
}

/** 現在アップロードされている素材の合計バイト数(概算)を求める */
function calcTotalBytes() {
  let total = 0;
  uploadedImages.forEach((img) => (total += img.size || 0));
  if (uploadedAudio) total += uploadedAudio.size || 0;
  return total;
}

/**
 * 合計サイズが上限を超えている場合、超過分(音声→画像の順)を
 * デフォルト素材にフォールバックさせて容量を抑える。
 * 戻り値: フォールバックが発生したかどうか
 */
function applySizeGuard() {
  let total = calcTotalBytes();
  if (total <= MAX_TOTAL_BYTES) return false;

  let fellBack = false;

  // まず音声を落としてみる
  if (uploadedAudio) {
    uploadedAudio = null;
    fellBack = true;
    total = calcTotalBytes();
  }

  // それでも超える場合は画像を1枚ずつ削っていく(先着優先で末尾から削減)
  while (total > MAX_TOTAL_BYTES && uploadedImages.length > 0) {
    uploadedImages.pop();
    fellBack = true;
    total = calcTotalBytes();
  }

  return fellBack;
}

function bindStartButton() {
  document.getElementById("btn-start").addEventListener("click", () => {
    const selectedTypes = getAllCheckboxes()
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    if (selectedTypes.length === 0) {
      alert("広告タイプを少なくとも1つ選択してください。");
      return;
    }

    const warningBox = document.getElementById("size-warning");
    const fellBack = applySizeGuard();
    if (fellBack) {
      warningBox.classList.add("show");
    } else {
      warningBox.classList.remove("show");
    }

    const articleMode = document.querySelector('input[name="article-mode"]:checked').value;
    const customArticleText = document.getElementById("input-custom-article").value.trim();

    if (articleMode === "custom" && customArticleText === "") {
      alert("自分で貼り付けを選んだ場合は、記事本文を入力してください。");
      return;
    }

    const config = {
      adTypes: selectedTypes,
      images: uploadedImages.map((i) => i.dataUrl),
      audio: uploadedAudio ? uploadedAudio.dataUrl : null,
      adText: document.getElementById("input-text").value.trim(),
      articleMode: articleMode,
      customArticle: customArticleText,
      createdAt: Date.now(),
    };

    try {
      sessionStorage.setItem("uzaAdConfig", JSON.stringify(config));
    } catch (e) {
      // sessionStorageの容量超過などの保険。素材を全部落として再試行する。
      console.warn("sessionStorage保存に失敗。素材なしで再試行します。", e);
      config.images = [];
      config.audio = null;
      warningBox.classList.add("show");
      try {
        sessionStorage.setItem("uzaAdConfig", JSON.stringify(config));
      } catch (e2) {
        alert("設定の保存に失敗しました。もう一度お試しください。");
        return;
      }
    }

    // 警告が出た場合は少し待ってから遷移(ユーザーがメッセージに気づけるように)
    if (fellBack) {
      setTimeout(() => {
        location.href = "experience.html";
      }, 900);
    } else {
      location.href = "experience.html";
    }
  });
}
