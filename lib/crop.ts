/**
 * アイコン用の写真の切り抜き計算(丸い枠の中に写る範囲を決める)。
 * 画面操作(AvatarCropper)から切り離してあるので、ブラウザ無しでも検証できる。
 *
 * 座標のきまり: 操作画面(ステージ)の中心に丸い枠があり、
 * 写真の中心が枠の中心から (x, y) px ずれている状態を「位置」とする。
 */

/** 操作画面の一辺(px) */
export const STAGE_SIZE = 288;
/** 丸い枠の直径(px)。枠の外側は暗く表示する */
export const CROP_DIAMETER = 232;
/** 拡大の上限(倍) */
export const MAX_ZOOM = 4;
/** 保存する画像の一辺(px)。アイコンとしては十分で、ファイルも小さく済む */
export const OUTPUT_SIZE = 256;

export type Size = { w: number; h: number };
export type CropView = { zoom: number; x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** zoom=1 のとき、短い辺がちょうど丸い枠に収まる倍率 */
export function baseScale(img: Size): number {
  return CROP_DIAMETER / Math.min(img.w, img.h);
}

export function displayScale(img: Size, zoom: number): number {
  return baseScale(img) * clamp(zoom, 1, MAX_ZOOM);
}

/** 写真が丸い枠から外れて、背景が見えてしまわない範囲に位置を収める */
export function clampOffset(x: number, y: number, img: Size, zoom: number): { x: number; y: number } {
  const s = displayScale(img, zoom);
  const maxX = Math.max(0, (img.w * s - CROP_DIAMETER) / 2);
  const maxY = Math.max(0, (img.h * s - CROP_DIAMETER) / 2);
  return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
}

/** 拡大率を変える。丸い枠の中心を基準に拡大縮小し、位置も枠内に収め直す */
export function applyZoom(view: CropView, nextZoom: number, img: Size): CropView {
  const zoom = clamp(nextZoom, 1, MAX_ZOOM);
  const k = zoom / view.zoom;
  const pos = clampOffset(view.x * k, view.y * k, img, zoom);
  return { zoom, ...pos };
}

/** 元の写真のうち、どの正方形の範囲(ピクセル)を切り出すか */
export function cropSourceRect(img: Size, view: CropView): { sx: number; sy: number; size: number } {
  const s = displayScale(img, view.zoom);
  const left = (img.w * s) / 2 - view.x - CROP_DIAMETER / 2;
  const top = (img.h * s) / 2 - view.y - CROP_DIAMETER / 2;
  return { sx: left / s, sy: top / s, size: CROP_DIAMETER / s };
}
