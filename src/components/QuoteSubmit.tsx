import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { submitQuote } from '../data/submitQuote';

export default function QuoteSubmit() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;

    setStatus('submitting');
    const result = await submitQuote(trimmed, 'one-liner', name.trim() || undefined);

    if (result.success) {
      setStatus('success');
      setTimeout(() => {
        setOpen(false);
        setText('');
        setName('');
        setStatus('idle');
      }, 2000);
    } else {
      setStatus('error');
      setErrorMsg(result.error ?? 'Something went wrong.');
    }
  };

  const handleClose = () => {
    if (status === 'submitting') return;
    setOpen(false);
    setText('');
    setName('');
    setStatus('idle');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-[#FAF9F5]/95 backdrop-blur-sm border border-stone-200 rounded-xl px-4 py-3 shadow-lg w-72"
          >
            {status === 'success' ? (
              <p className="text-xs text-stone-500 font-mono tracking-wide text-center py-2">
                Thank you! Your quote is submitted for review.
              </p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Write your quote…"
                  maxLength={100}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleClose();
                  }}
                  className="w-full bg-transparent border-none outline-none text-sm text-stone-800 placeholder-stone-400 font-light tracking-wide font-sans"
                  style={{ cursor: 'none' }}
                />
                <div className="flex items-center justify-between mt-2 border-t border-stone-100 pt-2">
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    maxLength={30}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-28 bg-transparent border-none outline-none text-[10px] text-stone-400 placeholder-stone-300 font-mono tracking-wide"
                    style={{ cursor: 'none' }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-300 font-mono">{text.length}/100</span>
                    <button
                      type="submit"
                      disabled={text.trim().length < 2 || status === 'submitting'}
                      className="text-[10px] font-mono tracking-wider uppercase text-stone-500 hover:text-stone-800 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {status === 'submitting' ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
                {status === 'error' && (
                  <p className="text-[10px] text-red-400 font-mono mt-1">{errorMsg}</p>
                )}
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        className="group text-[10px] font-mono tracking-[0.2em] uppercase text-stone-600 hover:text-stone-800 transition-colors duration-300 select-none"
      >
        {open ? (
          <span className="text-stone-300">Close</span>
        ) : (
          <span className="group-hover:tracking-[0.25em] transition-all duration-300">
            Contribute
          </span>
        )}
      </button>
    </div>
  );
}
