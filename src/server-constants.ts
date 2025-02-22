const env =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : process.env

export const CUSTOM_DOMAIN = env.CUSTOM_DOMAIN || '' // <- Set custom domain if you have. e.g. suzu-mono-gram.com
export const BASE_PATH = env.BASE_PATH || '' // <- Set sub directory path if you want. e.g. /docs/

export const GAS_DEPLOY_ID = env.GAS_DEPLOY_ID || ''
export const SPREADSHEET_ID = env.SPREADSHEET_ID || ''
export const STUDENTS_SHEET_NAME = env.STUDENTS_SHEET_NAME || ''
export const QUIZGEM_VERSION = env.QUIZGEM_VERSION || ''

export const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID || ''
export const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY || ''
export const R2_ENDPOINT = env.R2_ENDPOINT || ''
export const R2_BUCKET_NAME = env.R2_BUCKET_NAME || ''

export const PUBLIC_GA_TRACKING_ID = env.PUBLIC_GA_TRACKING_ID || ''
