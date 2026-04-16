import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

const LS_INSTALLED = 'inhabit_pwa_installed'
const LS_ANDROID_DISMISSED = 'inhabit_pwa_install_dismissed'
const LS_IOS_DISMISSED = 'inhabit_pwa_ios_hint_dismissed'

const SURFACE = '#141418'
const PURPLE = '#534AB7'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readInstalled(): boolean {
  try {
    return localStorage.getItem(LS_INSTALLED) === '1'
  } catch {
    return false
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function PWAInstallPrompt() {
  const [installed, setInstalled] = useState(() => readInstalled())
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [showAndroid, setShowAndroid] = useState(false)
  const [showIOS, setShowIOS] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (readInstalled() || isStandalone()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      const bip = e as BeforeInstallPromptEvent
      setDeferred(bip)
      try {
        if (localStorage.getItem(LS_ANDROID_DISMISSED) !== '1') {
          setShowAndroid(true)
        }
      } catch {
        setShowAndroid(true)
      }
    }

    const onAppInstalled = () => {
      try {
        localStorage.setItem(LS_INSTALLED, '1')
      } catch {
        /* ignore */
      }
      setInstalled(true)
      setShowAndroid(false)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)

    let showIosHint = false
    try {
      showIosHint =
        isIOS() &&
        !isStandalone() &&
        localStorage.getItem(LS_IOS_DISMISSED) !== '1' &&
        localStorage.getItem(LS_INSTALLED) !== '1'
    } catch {
      showIosHint = isIOS() && !isStandalone()
    }
    if (showIosHint) setShowIOS(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const dismissAndroid = useCallback(() => {
    try {
      localStorage.setItem(LS_ANDROID_DISMISSED, '1')
    } catch {
      /* ignore */
    }
    setShowAndroid(false)
  }, [])

  const dismissIOS = useCallback(() => {
    try {
      localStorage.setItem(LS_IOS_DISMISSED, '1')
    } catch {
      /* ignore */
    }
    setShowIOS(false)
  }, [])

  const onInstallClick = useCallback(async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') {
        try {
          localStorage.setItem(LS_INSTALLED, '1')
        } catch {
          /* ignore */
        }
        setInstalled(true)
      }
    } finally {
      setShowAndroid(false)
      setDeferred(null)
    }
  }, [deferred])

  if (typeof window !== 'undefined' && isStandalone()) return null
  if (installed) return null

  const showBanner = Boolean(showAndroid && deferred)
  const showIOSBanner = Boolean(
    showIOS && !showBanner && isIOS() && !isStandalone(),
  )

  if (!showBanner && !showIOSBanner) return null

  return (
    <div
      className="fixed left-0 right-0 z-[9998] border-l-4 py-2.5 pl-3 pr-2 shadow-lg"
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        backgroundColor: SURFACE,
        borderLeftColor: PURPLE,
      }}
      role="region"
      aria-label={showBanner ? 'Install app' : 'Install on iOS'}
    >
      <div className="flex items-start gap-2 pr-1">
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-white">
          {showBanner ? (
            <>
              <span aria-hidden>📲 </span>
              Install InHabit on your home screen
            </>
          ) : (
            <>
              To install: tap the share button then &apos;Add to Home
              Screen&apos;
            </>
          )}
        </p>
        {showBanner ? (
          <button
            type="button"
            onClick={() => void onInstallClick()}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
            style={{ backgroundColor: PURPLE }}
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={showBanner ? dismissAndroid : dismissIOS}
          className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
