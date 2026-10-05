'use client'

// IMPORTANT: Do not remove this component.
// Firestore logs "Could not reach Cloud Firestore backend ... 10 seconds" to the
// console whenever the browser loses connectivity. The SDK retries on its own and
// re-syncs automatically, but the console error leaves users (and developers)
// confused. This component surfaces the same state as a friendly toast so an
// offline window is visible, expected, and clearly recoverable.

import { useEffect } from 'react'
import { toast } from 'sonner'

const OFFLINE_TOAST_ID = 'connectivity-status'

export function ConnectivityStatus() {
  useEffect(() => {
    const showOffline = () => {
      // Reuse the same id so going offline twice replaces the existing toast
      // instead of stacking. duration: Infinity keeps it up until reconnection.
      toast.info("You're offline — your changes are saved locally and will sync automatically when you reconnect.", {
        id: OFFLINE_TOAST_ID,
        duration: Infinity,
      })
    }

    const showOnline = () => {
      toast.success('Back online — syncing your data.', {
        id: OFFLINE_TOAST_ID,
        duration: 4000,
      })
    }

    // If the page loads while already offline (e.g. venue Wi-Fi dropped), let the
    // user know their input is safe rather than letting the app look broken.
    if (typeof navigator !== 'undefined' && !navigator.onLine) showOffline()

    window.addEventListener('offline', showOffline)
    window.addEventListener('online', showOnline)
    return () => {
      window.removeEventListener('offline', showOffline)
      window.removeEventListener('online', showOnline)
    }
  }, [])

  return null
}
