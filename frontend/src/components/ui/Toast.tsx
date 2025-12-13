import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <AlertCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
}

const styles: Record<ToastType, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  error: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
}

const iconStyles: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
              'pointer-events-auto rounded-lg border backdrop-blur-sm shadow-lg p-4',
              'bg-card/95 border-border',
              styles[toast.type]
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('flex-shrink-0 mt-0.5', iconStyles[toast.type])}>
                {icons[toast.type]}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-foreground">{toast.title}</h4>
                {toast.message && (
                  <p className="text-sm text-muted-foreground mt-1">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: (toast.duration ?? 5000) / 1000, ease: 'linear' }}
              className={cn(
                'absolute bottom-0 left-0 right-0 h-1 origin-left rounded-b-lg',
                toast.type === 'success' && 'bg-emerald-500',
                toast.type === 'error' && 'bg-red-500',
                toast.type === 'warning' && 'bg-amber-500',
                toast.type === 'info' && 'bg-blue-500'
              )}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
