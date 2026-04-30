import confetti from 'canvas-confetti'

const CONFETTI_COLORS = ['#F5A623', '#1D9E75', '#FF6B35', '#ffffff']

/**
 * Full-screen confetti for ~2s, then runs onComplete (e.g. show banner).
 * Returns a cancel function to stop early (e.g. if the save fails).
 */
export function runFullClearConfetti(onComplete?: () => void): () => void {
  const duration = 2000
  const animationEnd = Date.now() + duration
  const defaults = {
    startVelocity: 30,
    spread: 360,
    ticks: 70,
    zIndex: 9999,
    colors: CONFETTI_COLORS,
  }

  let done = false
  const finish = () => {
    if (done) return
    done = true
    onComplete?.()
  }

  const id = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now()
    if (timeLeft <= 0) {
      window.clearInterval(id)
      finish()
      return
    }
    const particleCount = Math.max(0, Math.floor((50 * timeLeft) / duration))
    void confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.2 + 0.08, y: Math.random() - 0.15 },
    })
    void confetti({
      ...defaults,
      particleCount,
      origin: { x: Math.random() * 0.2 + 0.72, y: Math.random() - 0.15 },
    })
  }, 200)

  return () => {
    window.clearInterval(id)
  }
}
