import React, { useRef, useEffect, useState, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';

// ─── Models ────────────────────────────────────────────────────────────────────

export const MODELS = [
  { id: 'seedance2',  label: 'Seedance 2.0', desc: '抖音自研，擅长中文场景' },
  { id: 'gemini-pro', label: 'Gemini Pro',   desc: 'Google 旗舰，创意表现强' },
  { id: 'sora',       label: 'Sora',          desc: 'OpenAI 出品，写实风格优秀' },
  { id: 'kling2',     label: 'Kling 2.0',     desc: '快手自研，动作流畅自然' },
];

export function modelLabel(id: string) {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

function useAnchorPos(anchorRef: RefObject<HTMLButtonElement | null>, open: boolean) {
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
  }, [open, anchorRef]);
  return pos;
}

// ─── Model Popup ───────────────────────────────────────────────────────────────

interface ModelPopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
}

export function ModelPopup({ open, anchorRef, value, onChange, onClose }: ModelPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchorPos(anchorRef, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: 220, zIndex: 99999 }}
        >
          <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px 4px', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              选择模型
            </div>
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); onClose(); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{m.desc}</div>
                </div>
                {value === m.id && <Check style={{ width: 15, height: 15, color: '#FE2C55', flexShrink: 0, marginLeft: 8 }} />}
              </button>
            ))}
            <div style={{ height: 8 }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ─── Video Params Popup ─────────────────────────────────────────────────────────

const RATIOS = ['9:16', '16:9', '1:1', '4:3'];
const DURATIONS = ['5s', '10s', '15s', '30s'];

interface VideoParamsPopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  ratio: string;
  duration: string;
  onChangeRatio: (v: string) => void;
  onChangeDuration: (v: string) => void;
  onClose: () => void;
}

export function VideoParamsPopup({ open, anchorRef, ratio, duration, onChangeRatio, onChangeDuration, onClose }: VideoParamsPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchorPos(anchorRef, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [open, onClose]);

  const chipStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 0',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    background: active ? '#FE2C55' : 'rgba(255,255,255,0.12)',
    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
    transition: 'background 0.15s',
  });

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.15 }}
          style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: 220, zIndex: 99999 }}
        >
          <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '12px 14px 14px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
              画面比例
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {RATIOS.map(r => <button key={r} style={chipStyle(ratio === r)} onClick={() => onChangeRatio(r)}>{r}</button>)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
              视频时长
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {DURATIONS.map(d => <button key={d} style={chipStyle(duration === d)} onClick={() => onChangeDuration(d)}>{d}</button>)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
