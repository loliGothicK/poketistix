import type { ChampionsRoiLayout, NormalizedRect } from "./types";

export const from1080p = (x: number, y: number, width: number, height: number): NormalizedRect => ({
  x: x / 1920,
  y: y / 1080,
  width: width / 1920,
  height: height / 1080,
});

export const toPixelBounds = (
  rect: NormalizedRect,
  frameWidth: number,
  frameHeight: number,
): [number, number, number, number] => {
  const x0 = Math.min(frameWidth, Math.max(0, Math.round(rect.x * frameWidth)));
  const y0 = Math.min(frameHeight, Math.max(0, Math.round(rect.y * frameHeight)));
  const x1 = Math.min(frameWidth, Math.max(x0, Math.round((rect.x + rect.width) * frameWidth)));
  const y1 = Math.min(frameHeight, Math.max(y0, Math.round((rect.y + rect.height) * frameHeight)));
  return [x0, y0, x1, y1];
};

export const DEFAULT_CHAMPIONS_ROI_LAYOUT: ChampionsRoiLayout = {
  p1PreviewCards: [
    from1080p(80, 154, 525, 114),
    from1080p(80, 280, 525, 114),
    from1080p(80, 406, 525, 114),
    from1080p(80, 532, 525, 114),
    from1080p(80, 658, 525, 114),
    from1080p(80, 784, 525, 114),
  ],
  p2PreviewCards: [
    from1080p(1558, 154, 295, 114),
    from1080p(1558, 280, 295, 114),
    from1080p(1558, 406, 295, 114),
    from1080p(1558, 532, 295, 114),
    from1080p(1558, 658, 295, 114),
    from1080p(1558, 784, 295, 114),
  ],
  battleHuds: [
    from1080p(165, 928, 370, 120),
    from1080p(561, 928, 370, 120),
    from1080p(1208, 42, 370, 100),
    from1080p(1604, 42, 310, 100),
  ],
  hpBars: [
    from1080p(181, 1002, 220, 4),
    from1080p(577, 1002, 220, 4),
    from1080p(1227, 119, 220, 4),
    from1080p(1621, 119, 220, 4),
  ],
  p1HpNumbers: [from1080p(250, 1014, 88, 28), from1080p(646, 1014, 88, 28)],
  messageBox: from1080p(295, 785, 1195, 80),
  p1AbilityBanner: from1080p(145, 385, 265, 115),
  p2AbilityBanner: from1080p(1510, 385, 265, 115),
  weatherFieldBadge: from1080p(320, 45, 540, 50),
  moveMenuSlots: [
    from1080p(1365, 540, 515, 100),
    from1080p(1365, 670, 515, 100),
    from1080p(1365, 800, 515, 100),
    from1080p(1365, 930, 515, 100),
  ],
  targetSelectionPanel: from1080p(1056, 432, 864, 648),
  communicatingBox: from1080p(840, 275, 240, 45),
  commandTimerBox: from1080p(1550, 295, 310, 60),
};
