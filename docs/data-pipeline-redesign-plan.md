# データパイプライン再設計 計画書 v2

作成: 2026-08-16。SchaleDB実データの調査結果に基づく、実装者(別モデル)向けハンドオフ文書。
v2での追加: R2を資産の正本とする方針、音声の世代(バージョン)管理と声優変更対応、
習熟度データのエクスポート/同期設計、仕様の考慮漏れチェック。

---

## 0. 調査で確定した事実(2026-08-16 実測)

### 0-1. https://schaledb.com/student のスクレイピングは不適

生徒一覧ページは1.5KBの空のSPAシェル(`<div id="app">` のみ)。データはクライアントJSが
同じ `students.json` から取得して描画している。**JSONベース継続が正しい。**

### 0-2. SchaleDB は音声メタデータ `voice.json` を公開している

- URL: `https://schaledb.com/data/jp/voice.json`(約4.6MB、生徒Idキー、272件)
- 構造: `{ "<Id>": { Normal: [...], Battle: [...], Lobby: [...], Event: [...] } }`
- 各要素: `{ Group: string, AudioClip: string, Transcription?: string }`
- タイトルコールは `Group === "UITitleIdle1"`。`AudioClip` は
  `https://r2.schaledb.com/voice/` からの相対パス(例: `jp_aru/aru_title.mp3`)
- **音声URLをDevName/PathNameから推測する必要は無い。** `AudioClip` をそのまま使えば
  命名規則変更(名前ベース→CHxxxx数字)の影響を受けない。

### 0-3. 例外ケースの実データ(URLはHEADで実在確認済み)

| ケース           | 実データ                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧命名           | ホシノ Id=10005: `jp_hoshino/hoshino_title.mp3` (200)                                                                                                                                         |
| 数字命名         | シュン（幼女） Id=10025 (CH0066): `jp_ch0066/ch0066_title.mp3` (200)                                                                                                                          |
| 2画像1音声       | ホシノ（臨戦）: 同名2レコード Id=10098(CH0258_02)/10099(CH0258_01)。titleは10098側の `jp_ch0258/ch0258_title.mp3` のみ。現行コードの推測URL `jp_ch0258_01/...` は404                          |
| 2画像2音声       | シュン（水着）: 同名2レコード Id=10143/10144。titleは**10143のNormalに2クリップ**: `jp_ch0355/ch0355_title.mp3` と `jp_ch0355/np0288_title.mp3`(両方200)。10144はtitle無し                    |
| SchaleDB更新漏れ | 初音ミク Id=20007 (CH9999, CV:藤田咲): **レコード本体は students.json に健在**だが voice.json のtitleクリップだけ消失。音声ファイル自体は過去に取得済みでR2キャッシュに存在する(ユーザー確認) |
| 声優変更         | チェリノ Id=10017 / チェリノ（温泉） Id=20009: URLは従来どおりでファイル内容だけ差し替わるタイプ。「存在すればスキップ」キャッシュでは旧音声が残り続ける                                      |

- UITitleIdle1 保有: 272中270レコード(無いのは 10099 / 10144 / 20007 の3件)
- title系Group名は `UITitleIdle1` の1種類のみ(全カテゴリを走査)
- **クリップのベース名(`aru_title.mp3` 等)は270件すべてグローバルに一意**

### 0-4. 現行実装の問題点(要修正)

1. DevName/PathNameからのURL推測 → `_01`/`_02` 生徒で確実に404
2. `removeDuplicates` がName基準で同名レコードの片方を捨て、画像・音声の対応が崩れる
3. 音声有無をクライアントが毎ロード全生徒HEADリクエストで判定(ビルド時に確定できる)
4. 中間生成物(schaledb.json 5MB等)が `public/data/` 経由でdistに全部デプロイされている
5. 音声キャッシュに更新検知が無い(声優変更に追従不能)

---

## 1. アーキテクチャ方針

### 1-1. 役割の再定義: 「R2が資産の正本、SchaleDBは供給源」

従来は「SchaleDBが正、R2はキャッシュ」だったが、初音ミクの件が示すとおり
SchaleDB側の更新漏れ・削除があり得る。役割を入れ替える:

- **R2バケットの内容 = 配信される音声の正本。** ビルドはR2の内容をそのまま public/ にミラーする。
- **SchaleDB(voice.json) = 新規クリップの供給源。** voice.json にあってR2に無いクリップだけを
  ダウンロードしてR2へ追加する。
- **voice.json から消えてもR2にあれば配信され続ける**(= ミクは何もしなくても出題対象を維持)。
  ビルドログに `[r2-only] 20007 miku_title (SchaleDBに存在しません)` と情報表示する(エラーではない)。
- 逆にR2から意図的に削除すれば配信からも消える(権利上の削除要請などに対応可能)。

手動運用: **「R2の所定の場所にファイルを置けば認識される」を仕様として保証する。**
そのために次のキー規約を導入する。

### 1-2. R2キー規約(新レイアウト)

```
audio/{studentId}/{clipId}.g{generation}.mp3   例: audio/10143/np0288_title.g1.mp3
image/{studentId}.webp                          例: image/10143.webp
meta/audio-manifest.json                        更新検知用(ETag/サイズ記録)
meta/students-archive.json                      (任意フェーズ)過去に存在した生徒メタデータの累積
```

- `studentId`: students.json のId。フォルダで生徒に紐づくため、手動追加ファイルの帰属が一意。
- `clipId`: クリップのベース名から拡張子を除いたもの(`ch0355_title`, `np0288_title`)。
  手動追加時は任意の英数字スラッグでよい(例: `miku_title`)。
- `generation`: 1始まりの整数。**追記専用(append-only)**。録り直し(声優変更等)を検知したら
  既存を残したまま `g{max+1}` で追加する。番号の振り直し・再利用は禁止。
  欠番は許容(手動削除した場合など)。
- 旧レイアウト(`audio/{日本語名}.mp3`)からは一回きりの移行を行う(§4 Phase 3)。

トグル(新旧2値)ではなく世代番号にする理由: 同一生徒の録り直しが2回以上起きた場合や、
新旧どちらが「現行」かの解釈が変わった場合にもデータ構造が壊れない。ユーザー指摘のとおり
「何番目か」の方が漏れがない。

### 1-3. final.json のデータモデル

```ts
interface TitleCallClip {
  clipId: string; // 'ch0355_title'
  generation: number; // 1始まり
  file: string; // 配信パス 'audio/10143/ch0355_title.g1.mp3'
  ownerId: number; // どのメンバーIdのフォルダ由来か
  source: 'schaledb' | 'r2-only'; // r2-only = voice.jsonに無いがR2に存在(ミク・手動追加)
  label?: string; // 任意。repo内 audio-labels.json から付与(例: '旧声優版')
}

interface QuizEntry {
  Name: string; // 出題単位 = 表示名(同名レコードは1エントリに統合)
  MemberIds: number[]; // 例: [10143, 10144]
  PrimaryId: number; // カード・正解表示用の代表(titleを持つ最小DefaultOrderのId)
  TitleCalls: TitleCallClip[];
  ImageIds: number[]; // = MemberIds(画像はId単位で全取得)
  DefaultOrder: number;
  NameSortOrder: number;
  CharacterVoice: string;
  Costume?: string;
  IsCollaboration?: boolean;
  // ほか既存の表示用フィールドは代表レコードから引き継ぎ
}
// final.json ルート: { schemaVersion: 2, builtAt: string, entries: QuizEntry[] }
```

- `TitleCalls.length === 0` のエントリはビルド時点でクイズ対象外が確定
  → **クライアントの全生徒HEADリクエストを全廃**できる。
- ラベルはrepo内の任意ファイル `src/data/audio-labels.json`
  (`{ "10017/cherino_title.g1": "旧声優版" }`)で人間が付与。無ければ表示しない。
- 習熟度のlocalStorageキーは従来どおりNameのため移行不要。
  (将来の改名耐性としてPrimaryIdキーへの移行余地はあるが、現時点では不要と判断。)

### 1-4. ビルドアルゴリズム

```
1. students.json / voice.json を取得(tmp/にキャッシュ、ETagがあれば条件付きGET)
   → 縮約: voice.json からは UITitleIdle1 の AudioClip のみ抽出(数KBになる)
2. R2 の audio/ をList → キーを {studentId, clipId, generation} にパース
   (規約外キーは警告してスキップ)
3. 差分補充: voice.json のクリップのうち、同一 studentId+clipId がR2に無いもの
   → SchaleDBからダウンロード → audio/{id}/{clipId}.g1.mp3 でR2へアップロード
   (Content-Type を audio/mpeg で明示。既存の octet-stream 問題を解消)
4. 画像: MemberIds 全員分。image/{id}.webp がR2に無ければ
   https://schaledb.com/images/student/collection/{id}.webp から取得しアップロード
5. QuizEntry 生成: Nameでグループ化 → TitleCalls はメンバー全員のR2クリップの和集合
   (voice.jsonに無いclipIdは source='r2-only')
6. 孤児検知: R2にあるが students.json にIdが無い音声 → 警告して除外
   (students-archive.json 導入後はアーカイブのメタデータで救済; §4 Phase 7)
7. R2 → public/audio/, public/image/ へミラー(ローカルに無いファイルのみ)
8. final.json を public/data/ に出力。中間生成物はすべて tmp/ へ
```

失敗ポリシー: JSON取得失敗・スキーマドリフト検知(§5)はビルド失敗にする。
資産の個別ダウンロード失敗は件数集計し、閾値(例: 5件)超過で失敗。

### 1-5. 更新検知と世代追加(`cache:refresh`、通常ビルドとは分離)

通常ビルドは「存在すればスキップ」で高速・低負荷のまま。別コマンド `npm run cache:refresh` で:

1. R2の各クリップの供給元URL(voice.jsonのAudioClip)へHEADを送り、
   `meta/audio-manifest.json` に記録済みの ETag/Content-Length と比較(1秒間隔)
2. 変化していれば **上書きせず** `g{max+1}` として新世代をダウンロード・アップロード
3. マニフェストを更新

- 画像は世代管理しない(旧立ち絵に出題価値が無いため)。変化検知時は上書き更新。
- 実行タイミングは手動、またはCIの月次。毎ビルドでの全件HEADはSchaleDBへの負荷になるため行わない。
- チェリノのような過去の録り直しで旧音声を残したい場合は、手元に旧ファイルがあれば
  `audio/10017/cherino_title.g1.mp3` として手動アップロードし、現行版をg2に置く(手動руководは§7)。

---

## 2. クライアント仕様

### 2-1. 音声再生(複数クリップ・世代)

- **デフォルト再生セット** = 各clipIdの最新世代。variantが複数(シュン（水着）の2クリップ)は
  両方含め、出題・カードタップ時にランダムで1つ選ぶ。
- **クイズ設定に「旧バージョン音声も出題する」チェックボックス**(デフォルトOFF)を追加。
  ONにすると旧世代も再生候補に加わる(答えは同じNameなので判定不変)。
- カード一覧: クリップが複数あるカードはタップごとに順送り(clipId昇順→世代昇順)。
  カード隅に `1/2` のようなバッジを表示。ラベルがあるクリップ再生中はラベルを小さく表示。
- 「もう一度再生」は直前に選ばれたクリップを再生(ランダム引き直しはしない)。
- 出題中の答え合わせ後のクリック再生(選択肢・リザルト画像)は当該生徒のデフォルトセットから。

### 2-2. 初期化

- `final.json` のみで初期化(HEADチェック全廃)。`TitleCalls.length === 0` を音声なし扱い。
- 読み込み失敗時のエラー表示は、hidden なクイズ画面内ではなく両ビュー共通のバナーに出す
  (現行バグの修正を兼ねる)。

---

## 3. 習熟度(プロフィシエンシー)データの保存・同期

### 3-1. 方針: 3段構え

| 段階 | 内容                         | インフラ           | 状態                                                                                 |
| ---- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| A    | localStorage(現行)           | 不要               | 実装済み                                                                             |
| B    | エクスポート/インポート      | 不要               | **UIスタブが既に存在**(`quiz-export-progress-button` 等の disabled ボタン)。実装する |
| C    | 同期コード方式のクラウド保存 | GASまたはCF Worker | 任意。Bの後に                                                                        |

### 3-2. Phase B: エクスポート/インポート(先にやる)

- エクスポート: `{ formatVersion: 1, exportedAt: ISO8601, proficiency: ProficiencyMap }` を
  JSON文字列としてクリップボードコピー+ファイルダウンロードの両方を提供。
- インポート: テキスト貼り付けまたはファイル選択 → 既存の `normalizeProficiencyMap` で検証
  (壊れた入力を安全に無害化する既存純関数がそのまま使える)→ 確認ダイアログの上で置換。
- マージはしない(置換のみ)。シンプルさ優先。機種変更・ブラウザ移行はこれで解決する。

### 3-3. Phase C: スプレッドシート同期(認証レス「同期コード」方式)

認証を回避しつつ端末間同期を成立させる標準形:

- クライアントは初回に `crypto.randomUUID()` で**同期コード**を生成しlocalStorageに保存。
  設定画面に表示し「これがパスワード相当。他人に見せない」旨を明記。コピー/再入力UIを付ける。
- サーバーは「コード → JSONひとかたまり」のKVSとしてだけ振る舞う。

**バックエンド候補(クライアントAPIは共通化し、どちらでも差し替え可能に):**

|              | Google Apps Script + スプレッドシート                                                             | Cloudflare Worker + KV                                   |
| ------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| コスト/認証  | 無料・認証レス(「全員(匿名)」デプロイ)                                                            | 無料枠・認証レス                                         |
| データ閲覧   | **シートでそのまま眺められる**(趣味プロジェクト向きの利点)                                        | ダッシュボード/CLI                                       |
| レイテンシ   | ~1秒                                                                                              | 速い                                                     |
| 制約         | POSTは `Content-Type: text/plain` でpreflight回避が必要。セル5万文字上限(習熟度JSONは~15KBで余裕) | KV書き込み無料枠1000回/日(手動+クイズ終了時のみなら余裕) |
| 資産との整合 | Googleアカウントが別途必要                                                                        | **既にR2でCloudflare利用中**                             |

ユーザーの希望(スプレッドシートで眺めたい)を踏まえ **GASを第一候補**とする。
将来増えたらWorkerへ移行(クライアントAPIが共通なら差し替えのみ)。

GAS側仕様(コード20行程度):

- シート列: `syncCode | updatedAt | json`
- `doGet(e)`: `?code=` の行を検索し `{updatedAt, json}` を返す。無ければ404相当のJSON。
- `doPost(e)`: text/plainボディ `{code, updatedAt, json}` をupsert。
- 悪意対策はコードの推測不能性(UUIDv4)のみ。保存内容はクイズ成績で機微性が低く、
  最悪消されても localStorage とエクスポートが残る、と割り切る(仕様として明記)。

クライアント側仕様:

- 保存タイミング: クイズ終了時(リザルト表示時)+手動「今すぐ保存」。回答ごとには送らない。
- 読込タイミング: 起動時にコード設定済みなら取得。**LWW(updatedAtが新しい方を採用)**。
  リモートが新しい場合は「クラウドのデータ(X時点)を読み込みますか?」の確認を挟む。
- オフライン/失敗時は静かにスキップしてlocalStorage運用を継続(同期はベストエフォート)。
- 双方向マージ(端末Aと端末Bの成績合算)は**やらない**。複雑さに見合わない。仕様として明記。

---

## 4. 実装フェーズ(安価なモデル向け作業指示、依存順)

1. **Phase 1: 純関数群+テスト**
   - `extractTitleCalls(voiceJson): Map<Id, string[]>`(全カテゴリ走査、UITitleIdle1のAudioClip収集)
   - `parseAudioKey(key): {studentId, clipId, generation} | null` と `formatAudioKey(...)`(規約§1-2)
   - `selectDefaultClips(clips, includeOldGenerations: boolean): TitleCallClip[]`(clipIdごと最新世代)
   - テストは§5のフィクスチャで
2. **Phase 2: QuizEntry生成**
   - `buildQuizEntries(students, r2Clips, titleCalls, labels)`(Nameグループ化、和集合、source判定、孤児除外)
   - `removeDuplicates` 廃止。中間生成物を `tmp/` へ移動。final.jsonにschemaVersion/builtAt
3. **Phase 3: ダウンローダ+R2新レイアウト**
   - URL推測とPathNameフォールバックを全削除、AudioClip直接使用
   - Content-Type明示。差分補充ロジック(§1-4)
   - **一回きりの移行スクリプト**: 旧 `audio/{日本語名}.mp3` を新キーへ(students.jsonでName→Id/clipId解決、
     ミクのように解決できるものはすべて移行、解決不能キーは一覧出力して手動判断)
4. **Phase 4: クライアント**
   - HEAD全廃、final.json駆動、複数クリップ・世代の再生仕様(§2-1)、旧世代チェックボックス
   - エラーバナーの共通化
5. **Phase 5: 進捗エクスポート/インポート**(既存disabledボタンの実装; §3-2)
6. **Phase 6: 同期(任意)**: GASデプロイ+クライアント同期(§3-3)。API層は差し替え可能に分離
7. **Phase 7(任意)**: `cache:refresh`(§1-5)、`meta/students-archive.json`
   (毎ビルドで現students.jsonのメタデータをアーカイブに追記マージ。レコードごと消えた生徒も
   出題を維持できるようにする=ミク問題の完全版対策)

各フェーズ完了時に `npm test` と `npx tsc --noEmit` を通すこと(型チェックの修復は前回レビューの
指摘どおり別途必要: `types: ["node", "vite/client"]`, `target: ES2022` 等)。

---

## 5. テスト計画(ネットワーク不要のフィクスチャ)

### 5-1. `extractTitleCalls`

```ts
const voiceFixture = {
  '10005': {
    Normal: [
      { Group: 'UITitleIdle1', AudioClip: 'jp_hoshino/hoshino_title.mp3' },
    ],
  },
  '10099': { Normal: [{ Group: 'CafeIdle1', AudioClip: 'jp_ch0258/x.mp3' }] }, // title無し
  '10143': {
    Normal: [
      { Group: 'UITitleIdle1', AudioClip: 'jp_ch0355/ch0355_title.mp3' },
      { Group: 'UITitleIdle1', AudioClip: 'jp_ch0355/np0288_title.mp3' }, // 同カテゴリ2クリップ
    ],
  },
  '20007': { Normal: [] }, // ミク(消失後)
};
// 期待: 10005→1件 / 10099→0件 / 10143→2件 / 20007→0件
// 異常系: null・非配列カテゴリ・AudioClip欠落で例外を投げない
```

### 5-2. R2キーのパース/フォーマット

```
'audio/10143/np0288_title.g1.mp3' ⇄ {studentId:10143, clipId:'np0288_title', generation:1}
'audio/10017/cherino_title.g12.mp3' → generation 12
'audio/初音ミク.mp3' → null(旧形式は規約外として警告対象)
'audio/10143/bad.mp3' → null(世代サフィックス無し)
roundtrip: parse(format(x)) === x
```

### 5-3. `buildQuizEntries` / `selectDefaultClips`

- ホシノ（臨戦）相当: 同名2レコード+R2クリップ1件 → 1エントリ、MemberIds=2、TitleCalls=1、PrimaryId=title保有側
- シュン（水着）相当: TitleCalls=2(どちらも世代1) → selectDefaultClipsで2件とも残る
- チェリノ相当: 同一clipIdでg1/g2 → includeOld=false で g2のみ、true で両方
- ミク相当: R2にあるがvoice.jsonに無い → source='r2-only' で採用される
- 孤児: R2の studentId が students.json に無い → 除外+警告リストに載る
- voice.jsonがクリップを再追加した場合(ミク復活シナリオ): 同一clipIdなので重複せず source が 'schaledb' に戻るだけ

### 5-4. 進捗エクスポート/インポート・同期

- export→import ラウンドトリップで ProficiencyMap が一致
- import時の壊れたJSON・型不正 → `normalizeProficiencyMap` で無害化(既存テストを流用拡張)
- LWW判定の純関数 `pickNewer(local, remote)`: updatedAt比較、欠落・不正日時はローカル優先

### 5-5. スキーマドリフト検知(ビルド時、ネットワークあり)

- UITitleIdle1 保有率が95%未満 → ビルド失敗(Group名変更の検知)
- AudioClip が `.mp3` 終端でない要素 → 失敗
- students.json と voice.json のId集合差分が5%超 → 失敗

---

## 6. 採用しなかった代替案

- **HTMLスクレイピング**: ページが空シェル。却下。
- **URL推測ロジックの改良**: voice.jsonという正解データがある。却下。
- **新旧トグル(boolean)での声優切替**: 3回目の録り直し・解釈変更で破綻。世代番号を採用。
- **毎ビルド全件ETag照合**: SchaleDB負荷。refresh分離で対応。
- **成績の双方向マージ**: 複雑さに見合わない。LWW+確認ダイアログで十分。
- **本格的な認証付きバックエンド**: 「認証が面倒」という前提条件に反する。同期コード方式で足りる。

## 7. 運用runbook(READMEに転記すること)

- **手動で音声を追加する**(SchaleDBに無い音源): `audio/{studentId}/{任意スラッグ}.g1.mp3` をR2へ
  アップロードするだけで次回ビルドから配信・出題される。
- **録り直しを世代として残す**: 現行を `g{max+1}` で置き、旧音源を旧番号のまま残す。
  表示名を付けたい場合は `src/data/audio-labels.json` に追記。
- **配信から外す**: R2から該当キーを削除(ビルドで警告は出ない。voice.jsonに残っている場合は
  次回ビルドで再取得されるため、恒久除外したい場合は除外リストfixupが必要 → 必要になった時に
  `src/data/audio-excludes.json` を導入する。現時点では未実装でよい)。
- **同期コードを失くした**: クラウド側データには到達不能になる。localStorageが生きていれば
  新コードで再保存。エクスポートの定期取得を推奨。

## 8. リスク・注意

- voice.jsonスキーマ変更: §5-5で検知しビルド失敗(静かな劣化デプロイを防ぐ)。
- R2正本化に伴い、**バケットが単一障害点**になる。`meta/` とaudio一式は容量が小さいので、
  年数回の手動バックアップ(rclone等でローカルへ)を運用に加えると安心。
- GAS同期は可用性保証なし。同期はベストエフォートであり、正本は常にlocalStorage+エクスポート。
- 初回移行ビルドは全資産の再配置で数分かかる。以降は現行と同速。
