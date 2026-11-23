import { Palette, Sparkles, Wand2, Eraser, Scissors, Crop, Type } from 'lucide-react';

export const EDITOR_TABS = [
  { id: 'color', label: 'Chỉnh màu', icon: Palette },
  { id: 'portrait', label: 'Chân dung', icon: Sparkles },
  { id: 'liquify', label: 'Nắn bóp', icon: Wand2 },
  { id: 'erase', label: 'Xóa vật thể', icon: Eraser },
  { id: 'background', label: 'Tách nền', icon: Scissors },
  { id: 'crop', label: 'Cắt & Xoay', icon: Crop },
  { id: 'text', label: 'Chữ & Khung', icon: Type },
];
