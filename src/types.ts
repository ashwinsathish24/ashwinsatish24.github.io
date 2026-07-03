export interface Quote {
  text: string;
  category: 'romantic' | 'thoughtful' | 'one-liner';
}

export interface FloatingQuoteInstance {
  id: string;
  text: string;
  x: number; // percentage from left
  y: number; // percentage from top
  rotation: number;
  scale: number;
  depth: number; // 3D depth multiplier for parallax
  fadeState: 'in' | 'out'; // Custom state tracking for staggered fade loops
  createdAt: number;
}

export interface ChimeRipple {
  id: string;
  x: number;
  y: number;
  color: string;
  maxRadius: number;
}
