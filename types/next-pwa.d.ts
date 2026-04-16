declare module 'next-pwa' {
  import type { NextConfig } from 'next'

  type PwaOptions = {
    dest: string
    disable?: boolean
    register?: boolean
    skipWaiting?: boolean
  }

  export default function withPWAInit(
    options: PwaOptions
  ): (config: NextConfig) => NextConfig
}
