# bluaka-title-call-quiz2

ブルーアーカイブのタイトルコール音声を聴いて生徒名を当てる、クイズゲームの Web アプリケーションです。  
静的配信 + クライアントサイド挙動が中心のため、**Vite + TypeScript** 構成を採用しています。

---

## 目次

1. [開発・ビルド手順](#1-開発ビルド手順)
2. [ビルド時の処理の流れ](#2-ビルド時の処理の流れ)
3. [ソースコード構成](#3-ソースコード構成)
4. [カード一覧の仕組み](#4-カード一覧の仕組み)
5. [音声再生の処理の仕組み](#5-音声再生の処理の仕組み)
6. [並び替えとフィルタの仕組み](#6-並び替えとフィルタの仕組み)
7. [クイズの仕組み](#7-クイズの仕組み)
8. [習熟度（プロフィシエンシー）の仕組み](#8-習熟度プロフィシエンシーの仕組み)

---

## 1. 開発・ビルド手順

```sh
# 依存パッケージのインストール
npm ci

# 開発サーバー起動（ホットリロード付き）
npm run dev

# 本番ビルド（後述のキャッシュ取得を含む）
npm run build

# テスト実行
npm test
```

### その他のスクリプト

| スクリプト | 実行タイミング | 内容 |
|---|---|---|
| `npm run cache:fetch` | **サーバーサイド（CI）** | Cloudflare R2 からアセット（音声・画像）をダウンロード |
| `npm run local-cache:fetch` | **サーバーサイド（ローカル）** | `.env` ファイルを参照してローカルでキャッシュ取得 |
| `npm run local-cache:purge` | **サーバーサイド（ローカル）** | ローカルキャッシュを削除 |

---

## 2. ビルド時の処理の流れ

`npm run build` は以下の順序で処理を行います。すべて **サーバーサイド（Node.js）** で実行されます。

```
npm run build
  └─ 1. npm run cache:fetch          (src/scripts/downloadPublic.ts)
  │     ├─ Cloudflare R2 から音声ファイル (public/audio/) をダウンロード
  │     ├─ Cloudflare R2 から画像ファイル (public/image/) をダウンロード
  │     └─ SchaleDB から不足している音声・画像を補完ダウンロード
  │
  └─ 2. vite build
        ├─ index.html をエントリーポイントとして解析
        ├─ src/main.ts → src/cardList.ts / src/quiz.ts → src/lib/* をバンドル
        ├─ src/styles.css をバンドル
        ├─ public/ 配下の静的ファイルをそのまま dist/ にコピー
        └─ __APP_VERSION__ を package.json のバージョンに置き換え
```

### データファイルの生成（サーバーサイド）

`src/lib/schaleDBClient.ts` がビルド前またはキャッシュ取得時に以下を行います：

1. **SchaleDB** (`https://schaledb.com/data/jp/students.json`) から生徒データを取得
2. `src/lib/jsonUtils.ts` の `makeStudentsJson` でデータを整形
3. 整形済みデータを `public/data/final.json` として保存

この `final.json` はブラウザからも `fetch('/data/final.json')` でアクセスされ、カード一覧やクイズの元データとして使われます。

---

## 3. ソースコード構成

```
src/
├── main.ts              # アプリのエントリーポイント（ブートストラップ）        [クライアントサイド]
├── cardList.ts          # カード一覧のDOM構築・並び替え・フィルタ・音声再生      [クライアントサイド]
├── quiz.ts              # クイズ画面のすべてのロジック                          [クライアントサイド]
├── styles.css           # 全体スタイルシート                                     [クライアントサイド]
├── server-constants.ts  # 環境変数定数                                          [サーバーサイド]
│
├── lib/
│   ├── interfaces.ts          # TypeScript インターフェース定義                  [共通]
│   ├── quizProgress.ts        # クイズ共通ユーティリティ（候補フィルタ・正規化・習熟度）  [クライアントサイド]
│   ├── quizEngine.ts          # shuffleArray・buildChoices などのクイズロジック  [クライアントサイド]
│   ├── schaleDBClient.ts      # SchaleDB データ取得・音声・画像の補完ダウンロード [サーバーサイド]
│   ├── cloudflareR2Client.ts  # Cloudflare R2 の操作（upload/download）         [サーバーサイド]
│   ├── fileOperations.ts      # ファイルシステム操作のユーティリティ              [サーバーサイド]
│   ├── jsonUtils.ts           # JSON データ整形ユーティリティ                    [サーバーサイド]
│   └── test.ts                # ユニットテスト                                    [サーバーサイド]
│
└── scripts/
    ├── downloadPublic.ts  # ビルド前キャッシュ取得スクリプト  [サーバーサイド]
    └── purgeCache.ts      # ローカルキャッシュ削除スクリプト  [サーバーサイド]
```

### エントリーポイントの役割分担

| ファイル | 役割 |
|---|---|
| `main.ts` | フォント・スタイルのインポート、ページ切り替え、フッターバージョン表示、`bootstrap()` 関数でデータ取得と初期化を統括 |
| `cardList.ts` | カード一覧ページ全体（DOM生成・フィルタ・ソート・音声再生） |
| `quiz.ts` | クイズページ全体（設定UI・出題・回答判定・リザルト・習熟度管理） |

---

## 4. カード一覧の仕組み

### 初期化フロー

`bootstrap()` (in `main.ts`) にて：

1. `fetch('/data/final.json')` で全生徒データを取得
2. 全生徒について `HEAD /audio/<name>.mp3` を並列リクエストし、音声ファイルの有無を確認
3. 音声のない生徒名を `unavailableAudioNames: Set<string>` に格納
4. `setupStudentGrid(students, unavailableAudioNames)` を呼び出す

### カード生成 (`createCard` in `cardList.ts`)

各生徒ごとに以下の DOM 構造のカードを生成します：

```html
<div class="grid-item" tabindex="0"
     data-name="アリス"
     data-name-key="アリス"       <!-- 検索用の正規化済みキー -->
     data-filter-category="normal"  <!-- normal / costume / collaboration -->
     data-default-order="1"
     data-name-sort-order="1"
     data-has-audio="true">
  <div class="image-container">
    <img loading="lazy" src="/image/アリス.webp" alt="アリス" />
    <div class="voice-actor-container">
      <div class="voice-actor">　CV.担当声優　</div>
    </div>
  </div>
  <div class="name-container">
    <div class="name">　アリス　</div>  <!-- 音声なしなら末尾に 🔇 -->
  </div>
</div>
```

- `data-name-key` には `normalizeQuizAnswer(name)` を適用した文字列（全角英数を半角化・空白除去・小文字化）を設定し、フィルタ検索に使用します。
- `data-filter-category` は `resolveStudentCategory(costume, isCollaboration)` で判定：  
  `collaboration` > `costume` > `normal` の優先順位。

### fitty によるフォントサイズ調整

`setupFitty()` は CSS の `.name` と `.voice-actor` セレクタに対して [fitty](https://github.com/rikschennink/fitty) を適用し、カードの幅に合わせて文字サイズを自動縮小します。  
ウィンドウの `devicePixelRatio` が変化した場合（ズームなど）は fitty インスタンスを再生成します。

---

## 5. 音声再生の処理の仕組み

### カード一覧での音声再生 (`cardList.ts`)

カード一覧では **1つの `<audio>` 要素を全カードで共有**します。

```
ユーザーがカードをクリック / Enter キー押下
  │
  ├─ gridItem.dataset.hasAudio === 'false' → 何もしない（音声なし）
  │
  ├─ 別のカードが再生中 → resetAudio() で停止し、img.classList から 'playing' を除去
  │
  └─ playAudio(name) 実行
        ├─ sharedAudioPlayer.src = `/audio/${name}.mp3`
        ├─ sharedAudioPlayer.load()
        └─ sharedAudioPlayer.play()
              ├─ 成功 → img.classList.add('playing') でアニメーション
              └─ 失敗 → resetAudio()

カードの外をクリック → resetAudio() で停止
audio.ended イベント → resetAudio() で停止
```

### クイズでの音声再生 (`quiz.ts`)

クイズでは問題ごとに **新しい `Audio` オブジェクト**を生成します。

```
問題表示 (renderQuestion)
  └─ playCurrentAudio()
        └─ 0.5秒後に playAudioForName(currentAnswer) を実行（遅延タイマー）
              └─ new Audio(`/audio/${encodeURIComponent(name)}.mp3`).play()

「もう一度再生」ボタン → playCurrentAudio()（同様に0.5秒遅延）

次の問題へ / リザルト表示 / リセット → stopAudio()
  ├─ 遅延タイマーをキャンセル (clearTimeout)
  └─ currentAudio.pause() + currentAudio = null
```

**0.5秒の遅延理由**：問題のDOM更新後にすぐ音声が流れると操作感が悪いため、わずかな間を置いて再生します。また音声が重複再生されないよう、新しい再生前に必ず `stopAudio()` を呼びます。

---

## 6. 並び替えとフィルタの仕組み

### フィルタ

カード一覧のフィルタは以下の2軸を組み合わせます：

**① カテゴリフィルタ（チェックボックス）**

| チェックボックス | `data-filter-category` |
|---|---|
| 通常生徒 | `normal` |
| 別衣装 | `costume` |
| コラボ | `collaboration` |

**② 名前テキストフィルタ（テキスト入力）**

- 入力値は `normalizeQuizAnswer` で正規化（全角英数 → 半角、大文字 → 小文字、空白除去）
- さらに `normalizeKanaForSearch` でひらがな → カタカナ変換し、カタカナで統一して比較
- カードの `data-name-key` も同様に正規化済みのため、**ひらがな入力でもカタカナの名前に一致**します
- IME 変換中（`compositionstart` ～ `compositionend`）は入力を無視し、`compositionend` で確定後に適用します
- また `isTransientNameInputQuery` でひらがなとローマ字が混在する未確定入力を検出した場合は適用をスキップします

フィルタ適用時は `.grid-item` 要素の `style.display` を `''` または `'none'` に切り替えます。

### 並び替え

並び替えは `data-default-order`（実装順）または `data-name-sort-order`（名前順）の数値で行います。

```
sortCards(sortMode, direction)
  ├─ sortMode === 'name-order'  → dataset.nameSortOrder を使用
  └─ その他                     → dataset.defaultOrder を使用

direction === 'asc'  → 昇順（小さい順）
direction === 'desc' → 降順（大きい順）
```

`.grid-item` を `grid.appendChild()` で再挿入することでDOM順を変更し、CSS Grid のレイアウトを更新します。

---

## 7. クイズの仕組み

### 出題モード

| モード | ID | 説明 |
|---|---|---|
| 4択 | `multiple-choice` | 音声を聞いて4つの選択肢から正解を選ぶ |
| 名前入力 | `name-input` | 音声を聞いて生徒名をテキスト入力する。候補サジェスト付き |
| 名前入力 (Lunatic) | `name-input-lunatic` | 名前入力と同じだが候補サジェストなし |

### クイズの状態フロー

```
[設定画面]
  │ 「開始」ボタンをクリック
  ▼
[startQuiz()]
  ├─ フィルタ条件・問題数を確定
  ├─ バリデーション（候補が0件 or 4択で4件未満 → エラー表示）
  ├─ setQuizRunning(true) → 設定UIを隠し、リスタートボタンを有効化
  └─ renderQuestion() へ
        │
        ▼
  [renderQuestion()]
  ├─ 未出題の候補からランダムに currentAnswer を選択
  ├─ questionNumber をインクリメント
  ├─ playCurrentAudio() で0.5秒後に音声再生
  │
  ├─ [4択モード]
  │     └─ buildChoices(currentAnswer, activeNames) で4択肢を生成
  │           （正解1 + ランダム誤答3 をシャッフル）
  │
  └─ [名前入力モード]
        └─ テキスト入力フォームを表示
              │
              │（名前入力モードのみ）showNameSuggestions()
              │  └─ buildNameInputSuggestions で最大8件の候補を表示
              │       前方一致 → 部分一致の順で、あいうえお順にソート
              ▼
        [回答]
          ├─ [4択] ボタンクリック → finalizeAnswer(name, name === currentAnswer)
          └─ [名前入力] フォームsubmit → normalizeQuizAnswer で正規化して比較
                                          finalizeAnswer(input.trim(), isCorrect)
                ▼
          [finalizeAnswer()]
          ├─ score を更新
          ├─ resultEntries に記録
          ├─ recordAnswer() で習熟度を更新・保存
          ├─ ステータステキストに「正解！」または「不正解… 正解は「○○」」を表示
          ├─ updateAnswerFeedback() で正解の画像と名前を表示
          └─ 残り問題があれば「次へ」、なければ「リザルト」ボタンを表示

              │「次へ」または「リザルト」ボタンをクリック
              ▼
          [次の問題 or リザルト]
          ├─ 残り問題あり → renderQuestion() に戻る
          └─ 全問終了  → showResultScreen()
                              └─ renderResult() でリザルト画面を表示
                                    ├─ 正解数・不正解数・正答率を表示
                                    ├─ 100点満点ならスタンプ画像を表示
                                    └─ 各問の正誤・正答・回答を一覧表示
```

### 候補のフィルタリング

クイズに出題される候補は、`quiz.ts` の `setupQuiz` 呼び出し時点で **音声ファイルが存在する生徒のみ** (`main.ts` で `unavailableAudioNames` によりフィルタ済み) に絞られています。

さらにチェックボックスで「通常」「別衣装」「コラボ生徒」を切り替えることで `getCandidateNames()` が返す `activeNames` が変化します。

### 問題数の決定

```
questionCountPreset の値
  ├─ '1' / '10' / '20' → そのまま数値に変換
  ├─ 'all'             → activeNames.length（全件）
  └─ 'custom'          → questionCountCustom の入力値

→ resolveQuestionCount(rawValue, maxQuestions) で
    1 ～ maxQuestions の範囲にクランプ
```

### ページ切り替えガード

クイズ進行中にカード一覧タブへ切り替えようとすると、`setupQuiz` が `setPageSwitchGuard` コールバックで登録したガード関数が発動し、`window.confirm` でユーザーに確認を求めます。  
「OK」を選択した場合は `resetToStartScreen()` でクイズをリセットしてから遷移します。

---

## 8. 習熟度（プロフィシエンシー）の仕組み

各生徒ごとに「回答回数 (`attempts`)」と「正解回数 (`correct`)」を `localStorage` に保存します。

### ストレージキー

| キー | 説明 |
|---|---|
| `bluaka-title-call-quiz2.proficiency.v1` | 現行の保存キー |
| `bluaka-title-call-quiz.proficiency.v1` | 旧キー（自動移行） |
| `bluaka-title-call-quiz.proficiency` | 旧キー（自動移行） |
| `quizProficiency` | 最古の旧キー（自動移行） |

旧キーのデータは `migrateLegacyProficiency` で現行フォーマットに変換し、新キーで保存した後、旧キーを削除します。

### 正答率の計算

```
accuracy = Math.round((correct / attempts) * 1000) / 10  // 小数点以下1桁のパーセンテージ
```

回答後に `#quiz-proficiency-text` に「○○ の正答率: X% (correct/attempts)」として表示されます。

---

## ライセンス・クレジット

- 当 Web サイトは Nexon、Nexon Games および Yostar とは一切関係ありません。
- データベースとして [Schale DB](https://schaledb.com/) を参照しています。
- ゲーム画像・情報の所有権および著作権はそれぞれの権利者に帰属します。
