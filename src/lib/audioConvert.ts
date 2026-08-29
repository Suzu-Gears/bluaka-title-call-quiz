import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

/**
 * .ogg を .mp3 に変換する(bluearchive.wiki の音声取り込み用)。
 * iOS Safari が Ogg Vorbis を再生できないため、配信形式は mp3 に統一する。
 *
 * パラメータは SchaleDB 配布の mp3(実測: 44.1kHz・モノラル・約 64〜80kbps VBR)
 * に合わせる。LAME の V5 はモノラル音声でおおむねこの帯域になる。
 */
export async function convertOggToMp3(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg バイナリが見つかりません (ffmpeg-static)')
  }
  await execFileAsync(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-codec:a',
    'libmp3lame',
    '-ac',
    '1',
    '-ar',
    '44100',
    '-qscale:a',
    '5',
    outputPath,
  ])
}
