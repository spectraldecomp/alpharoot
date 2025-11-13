export const Env = {
  PRODUCTION: process.env.NODE_ENV === 'production',
  OPEN_AI_KEY: process.env.OPEN_AI_KEY ?? '',
}
