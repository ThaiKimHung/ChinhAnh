import { useCallback, useState } from 'react';

const CUSTOM_PRESETS_KEY = 'lkmagic_custom_presets_v1';

function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(presets) {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Storage full or blocked: presets still work for this visit.
  }
}

/** User-saved color presets, kept in localStorage. */
export function useCustomPresets() {
  const [customPresets, setCustomPresets] = useState(loadSavedPresets);

  const addPreset = useCallback((name, values) => {
    const preset = { id: `custom-${Date.now()}`, name, values: { ...values } };
    setCustomPresets((prev) => {
      const next = [...prev, preset];
      persist(next);
      return next;
    });
    return preset;
  }, []);

  const deletePreset = useCallback((id) => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { customPresets, addPreset, deletePreset };
}
