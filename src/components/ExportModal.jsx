import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Download, Check, Copy, Grid, Images, FileImage } from 'lucide-react';
import { generateIdPhotoSheetCanvas } from '../engine/imagePipeline';
import { downloadBlob, encodeCanvas } from '../engine/exportImage';

const FORMAT_OPTIONS = [
  { value: 'image/jpeg', label: 'JPG', description: 'Nền trắng, phổ biến' },
  { value: 'image/png', label: 'PNG', description: 'Giữ nền trong suốt' },
  { value: 'image/webp', label: 'WebP', description: 'Nhẹ, giữ nền trong suốt' },
];
const SCALE_OPTIONS = [2, 1, 0.75, 0.5];
const MODE_OPTIONS = [
  { value: 'single', label: 'Ảnh đơn', icon: FileImage },
  { value: 'id-sheet', label: 'Tờ ảnh thẻ', icon: Grid },
  { value: 'batch', label: 'Tất cả', icon: Images },
];
const PRINT_SIZE = { width: 1800, height: 1200 };

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(size, scale = 1) {
  return size ? `${Math.max(1, Math.round(size.width * scale))} × ${Math.max(1, Math.round(size.height * scale))} px` : '—';
}

function ExportOption({ selected, onSelect, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-amber-400 enabled:cursor-pointer ${
        selected ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-[#2c3344] bg-[#111319] text-slate-300 enabled:hover:border-slate-500'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function ExportModal({
  isOpen,
  onClose,
  imageSize,
  originalSize,
  fullResolutionSize,
  defaultFileName = 'LKMagic-Export',
  displayCanvas,
  imageCount = 1,
  onExport,
  onExportBatch,
  onCopyToClipboard,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const fileNameId = useId();
  const qualityId = useId();
  const [mode, setMode] = useState('single');
  const [sheetGrid, setSheetGrid] = useState('4x2');
  const [format, setFormat] = useState('image/jpeg');
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const [resolutionChoice, setResolutionChoice] = useState('working');
  const [fileName, setFileName] = useState(null);
  const [archiveName, setArchiveName] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [operation, setOperation] = useState(null);
  const [progress, setProgress] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [archive, setArchive] = useState(null);

  const exportMode = mode === 'batch' && (imageCount < 2 || !onExportBatch) ? 'single' : mode;
  const isBatch = exportMode === 'batch';
  const isSheet = exportMode === 'id-sheet';
  const resolution = fullResolutionSize ? resolutionChoice : 'working';
  const baseSize = resolution === 'original' ? fullResolutionSize : imageSize;
  const outputDimensions = isSheet ? formatDimensions(PRINT_SIZE) : formatDimensions(baseSize, scale);
  const estimateKey = [exportMode, sheetGrid, format, quality, scale, outputDimensions].join('/');
  const displayedEstimate = resolution === 'working' && estimate?.key === estimateKey && estimate.canvas === displayCanvas
    ? estimate.size : '';
  const selectedFileName = isBatch ? archiveName ?? 'LKMagic-Photos' : fileName ?? defaultFileName;
  const archiveKey = JSON.stringify([format, quality, scale, resolution, selectedFileName]);
  const preparedArchive = isBatch && archive?.key === archiveKey ? archive : null;
  const displayedFeedback = preparedArchive?.feedback ?? feedback;
  const busy = operation !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    dialog.showModal();
    setFileName(null);
    setArchiveName(null);
    setFeedback(null);
    return () => dialog.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !displayCanvas || isBatch || resolution === 'original') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let sheet;
      try {
        if (isSheet) {
          const [cols, rows] = sheetGrid.split('x').map(Number);
          sheet = generateIdPhotoSheetCanvas(displayCanvas, cols, rows);
        }
        const blob = await encodeCanvas(sheet || displayCanvas, format, quality / 100, isSheet ? 1 : scale);
        if (!cancelled) setEstimate({ key: estimateKey, canvas: displayCanvas, size: formatBytes(blob.size) });
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (sheet) {
          sheet.width = 0;
          sheet.height = 0;
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, displayCanvas, isBatch, isSheet, resolution, sheetGrid, format, quality, scale, estimateKey]);

  if (!isOpen) return null;

  const dismiss = () => {
    setArchive(null);
    dialogRef.current?.close();
    onClose();
  };

  const close = () => {
    if (!busy) dismiss();
  };

  const handleCopy = async () => {
    if (busy || !onCopyToClipboard) return;
    setOperation('copy');
    setFeedback(null);
    try {
      const copied = await onCopyToClipboard(scale, isSheet ? sheetGrid : null, resolution);
      if (!copied) throw new Error('Không thể sao chép ảnh. Bạn có thể tải ảnh về máy.');
      setFeedback({ type: 'success', message: 'Đã sao chép ảnh PNG.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Không thể sao chép ảnh.' });
    } finally {
      setOperation(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (preparedArchive) {
      downloadBlob(preparedArchive.blob, preparedArchive.name);
      dismiss();
      return;
    }
    setArchive(null);
    setOperation('export');
    setFeedback(null);
    setProgress(isBatch ? { completed: 0, total: imageCount } : null);
    try {
      const options = {
        format,
        quality: quality / 100,
        scale,
        resolution,
        fileName: selectedFileName.trim() || (isBatch ? 'LKMagic-Photos' : defaultFileName),
      };
      if (isBatch) {
        const result = await onExportBatch({
          ...options,
          onProgress: (completed, total) => setProgress({ completed, total }),
        });
        const failures = result?.failed || [];
        const affected = failures.slice(0, 3).join(', ');
        const suffix = failures.length > 3 ? ` và ${failures.length - 3} ảnh khác` : '';
        setArchive({
          key: archiveKey,
          blob: result.blob,
          name: result.name,
          feedback: failures.length
            ? { type: 'warning', message: `ZIP đã sẵn sàng. Bỏ qua ảnh gặp lỗi: ${affected}${suffix}.` }
            : { type: 'success', message: 'ZIP đã sẵn sàng.' },
        });
        return;
      } else {
        await onExport({ ...options, idSheetGrid: isSheet ? sheetGrid : null });
      }
      dismiss();
    } catch (error) {
      setFeedback({ type: 'error', message: error?.message || 'Không thể xuất ảnh. Hãy thử lại.' });
    } finally {
      setOperation(null);
      setProgress(null);
    }
  };

  const visibleModes = MODE_OPTIONS.filter(({ value }) => value !== 'batch' || (imageCount > 1 && onExportBatch));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-2xl border border-[#2c3344] bg-[#181b24] p-0 text-slate-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[calc(100dvh-1.5rem-2px)] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#262c3b] px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-base font-bold">Xuất ảnh</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {isBatch ? `${imageCount} ảnh trong một tệp ZIP` : `Đầu ra ${outputDimensions}${displayedEstimate ? ` · ~${displayedEstimate}` : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Đóng hộp thoại xuất ảnh"
            className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-300 enabled:cursor-pointer enabled:hover:bg-[#252b39] disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-65">
            <div role="group" aria-label="Chế độ xuất" className={`grid gap-2 ${visibleModes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {visibleModes.map(({ value, label, icon: Icon }) => (
                <ExportOption key={value} selected={exportMode === value} onSelect={() => setMode(value)} className="flex items-center justify-center gap-1.5">
                  <Icon className="size-3.5 shrink-0" />
                  <span>{value === 'batch' ? `${label} (${imageCount})` : label}</span>
                </ExportOption>
              ))}
            </div>

            {isSheet && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-300">Bố cục tờ in 10 × 15 cm</p>
                <div role="group" aria-label="Bố cục tờ in" className="grid grid-cols-2 gap-2">
                  <ExportOption selected={sheetGrid === '4x2'} onSelect={() => setSheetGrid('4x2')}>8 ảnh (4 × 2)</ExportOption>
                  <ExportOption selected={sheetGrid === '2x2'} onSelect={() => setSheetGrid('2x2')}>4 ảnh (2 × 2)</ExportOption>
                </div>
              </div>
            )}

            <div>
              <label htmlFor={fileNameId} className="mb-1.5 block text-xs font-medium text-slate-300">
                {isBatch ? 'Tên tệp ZIP' : 'Tên tệp ảnh'}
              </label>
              <input
                id={fileNameId}
                type="text"
                value={selectedFileName}
                onChange={(event) => (isBatch ? setArchiveName : setFileName)(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-[#2c3344] bg-[#111319] px-3 py-2 text-base focus:border-amber-500 focus:outline-none sm:text-sm"
              />
            </div>

            {fullResolutionSize && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-300">Nguồn ảnh xuất</p>
                <div role="group" aria-label="Nguồn ảnh xuất" className="grid grid-cols-2 gap-2">
                  <ExportOption selected={resolution === 'working'} onSelect={() => setResolutionChoice('working')} className="text-left">
                    <span className="block">Bản đang chỉnh</span>
                    <span className="mt-0.5 block text-slate-400">{isBatch ? 'Theo từng ảnh' : formatDimensions(imageSize)}</span>
                  </ExportOption>
                  <ExportOption selected={resolution === 'original'} onSelect={() => setResolutionChoice('original')} className="text-left">
                    <span className="block">Từ ảnh gốc</span>
                    <span className="mt-0.5 block text-slate-400">{isBatch ? 'Theo từng ảnh' : formatDimensions(fullResolutionSize)}</span>
                  </ExportOption>
                </div>
                {!isBatch && originalSize && <p className="mt-1.5 text-xs text-slate-400">Ảnh gốc trước khi cắt, xoay {formatDimensions(originalSize)}</p>}
                {resolution === 'original' && (
                  <p className="mt-1 text-xs text-slate-400">Các nét cọ và mặt nạ được nội suy từ bản đang chỉnh.</p>
                )}
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-300">Định dạng</p>
              <div role="group" aria-label="Định dạng ảnh" className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map(({ value, label, description }) => (
                  <ExportOption key={value} selected={format === value} onSelect={() => setFormat(value)} className="text-left">
                    <span className="block font-bold">{label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{description}</span>
                  </ExportOption>
                ))}
              </div>
            </div>

            {format !== 'image/png' && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <label htmlFor={qualityId} className="font-medium text-slate-300">Chất lượng nén</label>
                  <span className="font-mono text-amber-400">{quality}%</span>
                </div>
                <input
                  id={qualityId}
                  type="range"
                  min={40}
                  max={100}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  className="w-full cursor-pointer accent-amber-400"
                />
              </div>
            )}

            {!isSheet && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-300">Tỷ lệ kích thước{isBatch ? ' mỗi ảnh' : ''}</p>
                <div role="group" aria-label="Tỷ lệ kích thước" className="grid grid-cols-4 gap-2">
                  {SCALE_OPTIONS.map((option) => (
                    <ExportOption key={option} selected={scale === option} onSelect={() => setScale(option)}>{option * 100}%</ExportOption>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <footer className="shrink-0 space-y-2 border-t border-[#262c3b] bg-[#13161e] px-4 py-3 sm:px-5">
          {progress && (
            <div className="text-xs text-slate-300" role="status">
              <span>{progress.completed === progress.total ? 'Đang đóng gói ZIP…' : `Đã xử lý ${progress.completed}/${progress.total} ảnh`}</span>
              <progress aria-label="Tiến độ xử lý ảnh" value={progress.completed} max={progress.total} className="mt-1 block h-2 w-full accent-amber-400" />
            </div>
          )}
          {displayedFeedback && (
            <p
              role={displayedFeedback.type === 'error' ? 'alert' : 'status'}
              className={`break-words text-xs ${displayedFeedback.type === 'error' ? 'text-rose-300' : displayedFeedback.type === 'warning' ? 'text-amber-300' : 'text-emerald-300'}`}
            >
              {displayedFeedback.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {!isBatch && onCopyToClipboard && (
              <button
                type="button"
                onClick={handleCopy}
                disabled={busy}
                className="mr-auto flex min-h-10 items-center gap-1.5 rounded-lg border border-[#2f3647] bg-[#202532] px-2.5 py-2 text-xs font-medium text-slate-200 enabled:cursor-pointer enabled:hover:bg-[#2a3142] disabled:opacity-65"
              >
                {feedback?.type === 'success' ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5 text-amber-400" />}
                {operation === 'copy' ? 'Đang sao chép…' : 'Sao chép ảnh'}
              </button>
            )}
            <button type="button" onClick={close} disabled={busy} className="min-h-10 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-300 enabled:cursor-pointer enabled:hover:bg-[#2d3344] disabled:opacity-65">
              Hủy
            </button>
            <button type="submit" disabled={busy} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-[#0f1116] enabled:cursor-pointer enabled:hover:bg-amber-300 disabled:opacity-65 sm:px-4">
              <Download className="size-3.5" />
              {operation === 'export' ? 'Đang xuất…' : preparedArchive ? 'Tải ZIP' : isBatch ? 'Tạo ZIP' : 'Tải ảnh về'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
