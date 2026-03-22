const env =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : process.env

export const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID || ''
export const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY || ''
export const R2_ENDPOINT = env.R2_ENDPOINT || ''
export const R2_BUCKET_NAME = env.R2_BUCKET_NAME || ''
