import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SplashScreenProps {
  onComplete: () => void
  videoDuration?: number
  fadeStartOffset?: number
  fadeInDuration?: number
}

export default function SplashScreen({
  onComplete,
  videoDuration = 7.8,
  fadeStartOffset = 2,
  fadeInDuration = 0.15
}: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [isFading, setIsFading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Quick fade-in at start
    const startTimer = setTimeout(() => {
      setHasStarted(true)
    }, 50)

    const fadeStartTime = (videoDuration - fadeStartOffset) * 1000

    const fadeTimer = setTimeout(() => {
      setIsFading(true)
    }, fadeStartTime)

    const completeTimer = setTimeout(() => {
      setIsVisible(false)
      onComplete()
    }, videoDuration * 1000)

    video.play().catch(() => {
      setIsVisible(false)
      onComplete()
    })

    return () => {
      clearTimeout(startTimer)
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete, videoDuration, fadeStartOffset])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isFading ? 0 : hasStarted ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: isFading ? fadeStartOffset : fadeInDuration,
            ease: 'easeInOut'
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white"
          style={{ pointerEvents: isFading ? 'none' : 'auto' }}
        >
          <video
            ref={videoRef}
            src="/videos/splash.mp4"
            muted
            playsInline
            className="max-w-full max-h-full object-contain"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
