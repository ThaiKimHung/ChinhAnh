import { processImagePipeline } from './imagePipeline';

export function processImage(imageData, adjustments, beauty) {
  return processImagePipeline(imageData, adjustments, beauty);
}
