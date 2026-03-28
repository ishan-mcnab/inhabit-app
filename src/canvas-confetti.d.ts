declare module 'canvas-confetti' {
  type ConfettiOptions = {
    particleCount?: number
    spread?: number
    ticks?: number
    zIndex?: number
    colors?: string[]
    origin?: { x?: number; y?: number }
    startVelocity?: number
    angle?: number
    scalar?: number
    disableForReducedMotion?: boolean
  }
  function confetti(options?: ConfettiOptions): Promise<null> | null
  export default confetti
}
