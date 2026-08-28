# Kosugi Maru のコアサブセットフォントを生成する。
#
# 目的: @fontsource/kosugi-maru は unicode-range で 121 分割されており、
# カード一覧の表示だけで 27 ファイル(約 350KB)が個別に読み込まれ、
# フォント到着のたびに fitty の再フィットが走って CLS の原因になっていた。
# 生徒データと UI 文言を網羅する 1 ファイルのサブセットを作り、それを
# preload することで通常の閲覧は 1 リクエストで完結させる。
# 分割版の @font-face も残すので、サブセットに無い文字(クイズ作成での
# 自由入力など)は該当スライスだけがオンデマンドで読み込まれ、
# 表示できる文字の範囲は従来と変わらない。
#
# 実行方法 (データ更新などで文字集合が変わったら再実行してコミットする):
#   npm run local-cache:fetch   # public/data/final.json を最新化
#   pip install fonttools brotli
#   python tools/build-font-subset.py
#
# 出力:
#   public/fonts/kosugi-maru-core.woff2
#   src/fonts.css (コアの @font-face。レンダーブロッキング CSS に入る)
#   src/fonts-fallback.css (分割版の @font-face から、コアと重複する
#     unicode-range を除去したもの。アイドル時に動的 import され、
#     コアに無い文字だけをオンデマンドで賄う)
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_FONT = (
    ROOT
    / 'node_modules/@fontsource/kosugi-maru/files/kosugi-maru-japanese-400-normal.woff2'
)
OUT_FONT = ROOT / 'public/fonts/kosugi-maru-core.woff2'
OUT_CSS = ROOT / 'src/fonts.css'
OUT_FALLBACK_CSS = ROOT / 'src/fonts-fallback.css'
FONTSOURCE_CSS = ROOT / 'node_modules/@fontsource/kosugi-maru/index.css'


def collect_chars() -> set[str]:
    chars: set[str] = set()

    # 1) 生徒データの全文字列(名前・声優名・ラベルなど)
    def walk(node) -> None:
        if isinstance(node, str):
            chars.update(node)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, dict):
            for item in node.values():
                walk(item)

    walk(json.loads((ROOT / 'public/data/final.json').read_text(encoding='utf-8')))

    # 2) index.html のテキストと属性値(title / aria-label など)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    chars.update(re.sub(r'<[^>]*>', '', html))
    chars.update(''.join(re.findall(r'"([^"]*)"', html)))

    # 3) TS ソースの文字列リテラルのみ(コメントの漢字を拾わないよう除去してから)
    literal = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"|`([^`]*)`", re.S)
    for path in glob.glob(str(ROOT / 'src/**/*.ts'), recursive=True):
        src = Path(path).read_text(encoding='utf-8', errors='ignore')
        src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        src = re.sub(r'(?m)^\s*//.*$', '', src)
        src = re.sub(r'(?m)\s//\s.*$', '', src)
        for m in literal.finditer(src):
            chars.update(m.group(1) or m.group(2) or m.group(3) or '')

    # 4) 将来のデータ差分に強くするための範囲: ASCII / かな全域(結合濁点含む) /
    #    半角カナ・全角英数 / 一般句読点
    for start, end in [
        (0x20, 0x7E),
        (0x3041, 0x3096),
        (0x3099, 0x30FF),
        (0xFF01, 0xFF9F),
        (0x2010, 0x2027),
        (0x2030, 0x205E),
    ]:
        chars.update(chr(c) for c in range(start, end + 1))
    chars.update(
        '　、。〃々〆〇〈〉《》「」『』【】〒〓〔〕〜・…‥‘’“”℃№℡Ⅰ①②③④⑤⑥⑦⑧⑨⑩'
        '○●◎◇◆□■△▲▽▼☆★♪♭♯※→←↑↓±×÷≠≦≧∞√©®🔇🔈🔉🔊'
    )
    return {c for c in chars if not (ord(c) < 0x20 or 0x7F <= ord(c) <= 0x9F)}


def format_unicode_range(codepoints: set[int]) -> str:
    ordered = sorted(codepoints)
    ranges: list[tuple[int, int]] = []
    start = prev = ordered[0]
    for cp in ordered[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        ranges.append((start, prev))
        start = prev = cp
    ranges.append((start, prev))
    return ','.join(
        f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in ranges
    )


def parse_unicode_range(value: str) -> set[int]:
    codepoints: set[int] = set()
    for token in value.split(','):
        token = token.strip().removeprefix('U+').removeprefix('u+')
        if '-' in token:
            start, end = token.split('-')
            codepoints.update(range(int(start, 16), int(end, 16) + 1))
        else:
            codepoints.add(int(token, 16))
    return codepoints


def build_fallback_css(core_codepoints: set[int]) -> str:
    """fontsource の分割 @font-face から、コアが持つコードポイントを除いた
    フォールバック定義を作る。woff2 のみ参照する(woff は全対象ブラウザで不要)。"""
    css = FONTSOURCE_CSS.read_text(encoding='utf-8')
    blocks = re.findall(
        r'@font-face\s*\{[^}]*?url\(\./files/(kosugi-maru-[\w-]+\.woff2)\)'
        r'[^}]*?unicode-range:\s*([^;}]+)',
        css,
        re.S,
    )
    parts = [
        '/* このファイルは tools/build-font-subset.py が生成する。手で編集しない。 */\n'
        '/* fonts.css のコアサブセットに無い文字(クイズ作成の自由入力など)だけを\n'
        '   賄う分割フォント。コアと unicode-range が重複しないよう加工してあり、\n'
        '   アイドル時に動的 import で読み込まれる。該当文字が無ければ\n'
        '   フォントファイル自体はダウンロードされない。 */\n'
    ]
    kept = 0
    for file_name, range_value in blocks:
        remaining = parse_unicode_range(range_value) - core_codepoints
        if not remaining:
            continue
        kept += 1
        parts.append(
            '@font-face {\n'
            "  font-family: 'Kosugi Maru';\n"
            '  font-style: normal;\n'
            '  font-display: swap;\n'
            '  font-weight: 400;\n'
            f"  src: url('../node_modules/@fontsource/kosugi-maru/files/{file_name}') format('woff2');\n"
            f'  unicode-range: {format_unicode_range(remaining)};\n'
            '}\n'
        )
    print(f'fallback slices: {kept}/{len(blocks)}')
    return '\n'.join(parts)


def main() -> None:
    chars = collect_chars()
    print(f'subset chars: {len(chars)}')

    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    text_file = ROOT / 'tmp/font-subset-chars.txt'
    text_file.parent.mkdir(parents=True, exist_ok=True)
    text_file.write_text(''.join(sorted(chars)), encoding='utf-8')

    subprocess.run(
        [
            sys.executable,
            '-m',
            'fontTools.subset',
            str(SOURCE_FONT),
            f'--text-file={text_file}',
            '--flavor=woff2',
            '--layout-features=*',
            '--no-hinting',
            f'--output-file={OUT_FONT}',
        ],
        check=True,
    )
    print(f'{OUT_FONT.name}: {OUT_FONT.stat().st_size:,} bytes')

    from fontTools.ttLib import TTFont

    core_codepoints = set(TTFont(str(OUT_FONT)).getBestCmap().keys())
    unicode_range = format_unicode_range(core_codepoints)
    OUT_CSS.write_text(
        "/* このファイルは tools/build-font-subset.py が生成する。手で編集しない。 */\n"
        "/* 生徒データと UI 文言を網羅するコアサブセット。index.html で preload\n"
        "   される。ここに無い文字は fonts-fallback.css が賄う。 */\n"
        "@font-face {\n"
        "  font-family: 'Kosugi Maru';\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        "  font-weight: 400;\n"
        "  src: url('/fonts/kosugi-maru-core.woff2') format('woff2');\n"
        f'  unicode-range: {unicode_range};\n'
        '}\n',
        encoding='utf-8',
    )
    print(f'{OUT_CSS.name} written (unicode-range: {len(unicode_range)} bytes)')

    OUT_FALLBACK_CSS.write_text(
        build_fallback_css(core_codepoints), encoding='utf-8'
    )
    print(f'{OUT_FALLBACK_CSS.name} written')


if __name__ == '__main__':
    main()
