import React from 'react';
import { Loader2, ScanFace } from 'lucide-react';

const MESSAGES = {
  detecting: 'Đang nhận diện khuôn mặt…',
  none: 'Không tìm thấy khuôn mặt rõ trong ảnh.',
  error: 'Không tải được bộ nhận diện khuôn mặt (cần mạng lần đầu).',
};

/** One-line status of face detection, shared by the Portrait and Liquify panels. */
export default function FaceStatus({ status, count, foundText }) {
  if (!status || status === 'idle') return null;
  const text = status === 'found' ? foundText(count) : MESSAGES[status];
  return (
    <p role="status" className="flex items-center gap-1.5 text-[11px] text-slate-400">
      {status === 'detecting' ? <Loader2 className="size-3.5 animate-spin" /> : <ScanFace className="size-3.5 text-amber-400" />}
      <span>{text}</span>
    </p>
  );
}
