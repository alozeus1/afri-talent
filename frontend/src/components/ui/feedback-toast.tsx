'use client';

import { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, X, ArrowLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePublicT } from '@/lib/i18n/public-messages';

type FeedbackType = 'up' | 'down';

type Props = {
  visible: boolean;
  onClose: () => void;
  onFeedback?: (type: FeedbackType, reason?: string) => void;
  mode?: 'feedback' | 'success';
  title?: string;
  message?: string;
};

const FEEDBACK_CLOSE_DELAY = 1500; // ms

export default function FeedbackToast({ visible, onClose, onFeedback, mode = 'feedback', title, message }: Props) {
  const tp = usePublicT();
  const [selected, setSelected] = useState<FeedbackType | null>(null);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Auto-close for success mode
  useEffect(() => {
    if (visible && mode === 'success') {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, mode, onClose]);

  const closeAfterDelay = () => {
    setTimeout(onClose, FEEDBACK_CLOSE_DELAY);
  };

  const handleThumb = (type: FeedbackType) => {
    setSelected(type);

    if (type === 'up') {
      onFeedback?.('up');
      setSubmitted(true);
      closeAfterDelay();
    } else {
      setShowReasonInput(true);
    }
  };

  const handleSubmit = () => {
    onFeedback?.('down', reason);
    setSubmitted(true);
    closeAfterDelay();
  };

  const handleSkip = () => {
    onFeedback?.('down');
    setSubmitted(true);
    closeAfterDelay();
  };

  const handleBack = () => {
    setSelected(null);
    setShowReasonInput(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          role="status"
          aria-live="polite"
          className="fixed end-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <motion.div
            layout
            className="overflow-hidden rounded-xl border border-line bg-surface-raised p-4 shadow-overlay"
          >
            {mode === 'success' ? (
              <motion.div layout className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-primary-text">
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">{title || tp("site.toast.success")}</p>
                  {message && <p className="text-muted-foreground text-xs">{message}</p>}
                </div>
              </motion.div>
            ) : !submitted ? (
              <>
                {selected === null && (
                  <motion.div layout className="flex items-center justify-between">
                    <p className="text-foreground text-sm font-medium">{title || tp("site.toast.helpful")}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={tp("site.toast.up")}
                        onClick={() => handleThumb('up')}
                        className="cursor-pointer p-2"
                      >
                        <ThumbsUp aria-hidden="true" className="h-4 w-4 text-success" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={tp("site.toast.down")}
                        onClick={() => handleThumb('down')}
                        className="cursor-pointer p-2"
                      >
                        <ThumbsDown aria-hidden="true" className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selected === 'down' && showReasonInput && (
                  <motion.div layout className="mt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-foreground text-sm font-medium">{tp("site.toast.better")}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={tp("site.trust.close")}
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground cursor-pointer p-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <Textarea
                      placeholder={tp("site.toast.reason")}
                      aria-label={tp("site.toast.reason")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full resize-none"
                      rows={3}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={tp("site.toast.back")}
                          onClick={handleBack}
                          className="cursor-pointer p-2"
                        >
                          <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSkip}
                          className="text-muted-foreground cursor-pointer px-2"
                        >
                          {tp("site.toast.skip")}
                        </Button>
                      </div>
                      <Button onClick={handleSubmit} className="cursor-pointer">
                        {tp("site.toast.submit")}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.p layout className="text-foreground text-sm">
                {tp("site.toast.thanks")}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
