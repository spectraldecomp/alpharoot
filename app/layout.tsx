import StoreProvider from '@/providers/store'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'AlphaRoot',
  description: 'Generated with Love and Passion',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`} style={{ backgroundColor: '#fbf2d1ff' }}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  )
}
