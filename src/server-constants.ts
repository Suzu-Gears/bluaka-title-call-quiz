export const CUSTOM_DOMAIN =
  import.meta.env.CUSTOM_DOMAIN || process.env.CUSTOM_DOMAIN || '' // <- Set custom domain if you have. e.g. suzu-mono-gram.com
export const BASE_PATH =
  import.meta.env.BASE_PATH || process.env.BASE_PATH || '' // <- Set sub directory path if you want. e.g. /docs/

export const GAS_DEPLOY_ID =
  import.meta.env.GAS_DEPLOY_ID || process.env.GAS_DEPLOY_ID || ''
export const SPREADSHEET_ID =
  import.meta.env.SPREADSHEET_ID || process.env.SPREADSHEET_ID || ''
export const STUDENTS_SHEET_NAME =
  import.meta.env.STUDENTS_SHEET_NAME || process.env.STUDENTS_SHEET_NAME || ''
export const QUIZGEM_VERSION =
  import.meta.env.QUIZGEM_VERSION || process.env.QUIZGEM_VERSION || ''

export const PUBLIC_GA_TRACKING_ID = import.meta.env.PUBLIC_GA_TRACKING_ID || ''
