import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { IconClose } from './ui/icons'

/** Contextual panel: slides over the 3D view on desktop, bottom sheet on mobile. */
export function DetailPanel({ open, title, eyebrow, onClose, children }: { open: boolean; title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-[45] bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            key="panel"
            role="dialog"
            aria-label={typeof title === 'string' ? title : 'Details'}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-y-auto rounded-t-[18px] border hair bg-s1 p-5 shadow-2xl
                       md:absolute md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:z-20 md:max-h-none md:w-[340px] md:rounded-lg md:bg-s1/95 md:backdrop-blur-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink3/40 md:hidden" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
                <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
              </div>
              <button onClick={onClose} className="focus-ring -mr-1 grid h-8 w-8 place-items-center rounded-md text-ink3 hover:bg-s2 hover:text-ink" aria-label="Close details"><IconClose width={16} height={16} /></button>
            </div>
            <div className="space-y-4 text-[13px] leading-relaxed text-ink2">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
