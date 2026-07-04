/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, MouseEvent, TouchEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QUOTES } from './data/quotes';
import { audio } from './utils/audio';
import { ChimeRipple, FloatingQuoteInstance } from './types';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';

export default function App() {
  // Experience start & audio states
  const [hasStarted, setHasStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [muteNotice, setMuteNotice] = useState<string | null>(null);

  // Synchronized state refs for closure safety in RAF loop
  const hasStartedRef = useRef(false);
  const isHoveringRef = useRef(false);
  useEffect(() => {
    hasStartedRef.current = hasStarted;
  }, [hasStarted]);

  // Scattered floating quotes state
  const [activeQuotes, setActiveQuotes] = useState<FloatingQuoteInstance[]>([]);
  const quoteQueueIndexRef = useRef(0);

  // Sound click ripples
  const [ripples, setRipples] = useState<ChimeRipple[]>([]);

  // Track finished quotes and forgetful place mode
  const [finishedQuotesCount, setFinishedQuotesCount] = useState(0);
  const [reachedZoomEnd, setReachedZoomEnd] = useState(false);

  // Canvas and parallax tracking references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appContainerRef = useRef<HTMLDivElement | null>(null);
  const glowOverlayRef = useRef<HTMLDivElement | null>(null);
  const rhombusContainerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const emittingDotRef = useRef<HTMLDivElement | null>(null);
  
  // High-performance mouse positioning
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  
  // Lagging parallax coordinate references
  const parallaxRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // 3D Spatial Scroll Zoom Tracking
  const scrollZRef = useRef(0);
  const targetScrollZRef = useRef(0);
  const [isZooming, setIsZooming] = useState(false);
  const isZoomingRef = useRef(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Boundary tracking references to prevent stale closures and manage state changes
  const hasPassedEndRef = useRef(false);
  const hasPassedStartRef = useRef(false);
  const reachedZoomEndRef = useRef(false);
  const lastChimeZRef = useRef(0);
  const lastScrollTimeRef = useRef(Date.now());
  const lastInteractionTimeRef = useRef(Date.now());
  const idleProgressRef = useRef(0);
  const triggerRefreshRef = useRef<() => void>(() => {});

  // Sync state to ref for stale closure prevention in interval timers
  useEffect(() => {
    isZoomingRef.current = isZooming;
  }, [isZooming]);

  // Clean up zoom timer on unmount
  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

  // Touch start coordinate tracking
  const touchStartYRef = useRef(0);

  // Wheel event listener for spatial Z-zoom depth
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!hasStarted) return;

      // Reset activity and idle timer on scroll activity
      lastScrollTimeRef.current = Date.now();
      lastInteractionTimeRef.current = Date.now();

      // Prioritize active zoom mode
      setIsZooming(true);
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      zoomTimeoutRef.current = setTimeout(() => {
        setIsZooming(false);
      }, 2500);
      
      // REVERSED scroll: scrolling down (deltaY > 0) pulls out, scrolling up (deltaY < 0) zooms deeper
      targetScrollZRef.current -= e.deltaY * 0.75;
      
      // Clamp target zoom range: 0 (starting depth) to 4200 (end of spatial layout)
      targetScrollZRef.current = Math.max(0, Math.min(4200, targetScrollZRef.current));
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [hasStarted]);

  // Shuffle quotes initially to give a random flow every session
  const shuffledQuotesRef = useRef<typeof QUOTES>([]);
  useEffect(() => {
    shuffledQuotesRef.current = [...QUOTES].sort(() => Math.random() - 0.5);
  }, []);

  // 1. Core Canvas Render Loop (Grain + High-Performance 3D Parallax Interpolation + Spot Clearance)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Dynamic resize handler
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Create static offscreen high-performance noise tile
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 128;
    noiseCanvas.height = 128;
    const noiseCtx = noiseCanvas.getContext('2d')!;
    const noiseImgData = noiseCtx.createImageData(128, 128);
    const noiseData = noiseImgData.data;

    // Prefill noise canvas with high-quality grain values
    for (let i = 0; i < noiseData.length; i += 4) {
      const val = Math.floor(Math.random() * 255);
      noiseData[i] = val; // R
      noiseData[i + 1] = val; // G
      noiseData[i + 2] = val; // B
      noiseData[i + 3] = 42; // Subtle alpha intensity of grain
    }
    noiseCtx.putImageData(noiseImgData, 0, 0);

    // Initial mouse positions set to center
    mouseRef.current.x = width / 2;
    mouseRef.current.y = height / 2;
    mouseRef.current.targetX = width / 2;
    mouseRef.current.targetY = height / 2;

    const render = () => {
      // Interpolate spatial zoom Z position with a slower, more cozy cinematic drift
      scrollZRef.current += (targetScrollZRef.current - scrollZRef.current) * 0.05;
      const sz = scrollZRef.current;

      // Update Memories Idle Progress in the silent space (sz >= 4100)
      const inSilentSpace = sz >= 4100;
      const isIdle = inSilentSpace && (Date.now() - lastScrollTimeRef.current >= 5000);
      const targetIdleProgress = isIdle ? 1.0 : 0.0;
      // Smoothly interpolate idle progress
      idleProgressRef.current += (targetIdleProgress - idleProgressRef.current) * 0.04;
      const idleProgress = idleProgressRef.current;

      // Cursor normalization when left idle (for 5 seconds, regardless of space)
      const isIdleGeneral = Date.now() - lastInteractionTimeRef.current >= 5000;
      if (isIdleGeneral) {
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Smoothly drift the target coordinates of the mouse to the center
        mouseRef.current.targetX += (centerX - mouseRef.current.targetX) * 0.05;
        mouseRef.current.targetY += (centerY - mouseRef.current.targetY) * 0.05;

        // Smoothly drift the parallax target to center as well
        parallaxRef.current.targetX += (0 - parallaxRef.current.targetX) * 0.05;
        parallaxRef.current.targetY += (0 - parallaxRef.current.targetY) * 0.05;
      }

      // 1. Interpolate mouse positions for smooth trailing spotlight look
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.12;
      mouse.y += (mouse.targetY - mouse.y) * 0.12;

      // 2. Interpolate parallax offsets for subtle floating layer motion (lagging behind mouse)
      const parallax = parallaxRef.current;
      parallax.x += (parallax.targetX - parallax.x) * 0.08;
      parallax.y += (parallax.targetY - parallax.y) * 0.08;

      // Calculate quote dissolution progress (clamped 0 to 1)
      // Quotes dissolve completely by sz = 1500 before Rhombus appears
      const pQuotes = Math.max(0, Math.min(1, (sz - 1200) / 300));

      // Calculate deep zoom progress for the transition (clamped 0 to 1)
      const pZoom = sz >= 3000 ? Math.max(0, Math.min(1, (sz - 3000) / 1200)) : 0;

      // Actively trigger beautiful windchimes at discrete steps as they zoom/travel through Z-space
      if (isZoomingRef.current) {
        const diff = Math.abs(sz - lastChimeZRef.current);
        if (diff >= 180) {
          const zPercent = sz / 4200;
          audio.playWindchimeClick(0.5, 0.5, zPercent);
          lastChimeZRef.current = sz;
        }
      } else {
        // Smoothly match lastChimeZRef with current sz while idle so next zoom starts exactly on 180px distance
        lastChimeZRef.current = sz;
      }

      // 2b. Check boundary transitions and update reachedZoomEnd state dynamically
      if (isZoomingRef.current || sz > 5) {
        // We set reachedZoomEnd to true only when they are very close to the end of the zoom,
        // and they are NOT actively scrolling back out (targetScrollZRef.current >= 4050)
        const reachedEnd = sz >= 4050 && targetScrollZRef.current >= 4050;
        if (reachedEnd !== reachedZoomEndRef.current) {
          reachedZoomEndRef.current = reachedEnd;
          setReachedZoomEnd(reachedEnd);
        }

        // Handle infinite-alley refreshing when crossing boundaries
        // Passing past the zoom-in limit (all items faded out):
        if (sz >= 4050) {
          if (!hasPassedEndRef.current) {
            hasPassedEndRef.current = true;
          }
        } else if (sz < 1200) {
          // If they zoom back (scrolling out), refresh quotes to give them a completely fresh set of thoughts!
          if (hasPassedEndRef.current) {
            hasPassedEndRef.current = false;
            if (isZoomingRef.current) {
              triggerRefreshRef.current();
            }
          }
        }

        // Symmetrically, passing past the zoom-out start (returning to 0):
        if (sz <= 50) {
          if (!hasPassedStartRef.current) {
            hasPassedStartRef.current = true;
          }
        } else if (sz > 250) {
          // If they zoom forward again after being at start, refresh quotes!
          if (hasPassedStartRef.current) {
            hasPassedStartRef.current = false;
            if (isZoomingRef.current) {
              triggerRefreshRef.current();
            }
          }
        }
      } else {
        // Reset boundary state refs when zoom is inactive and we are fully back
        hasPassedEndRef.current = false;
        hasPassedStartRef.current = false;
        if (reachedZoomEndRef.current) {
          reachedZoomEndRef.current = false;
          setReachedZoomEnd(false);
        }
      }

      // Transition smoothly from light off-white (Space 1) to dark space (Space 2) based on pZoom
      const container = appContainerRef.current;
      if (container) {
        const r = Math.round(250 + (8 - 250) * pZoom);
        const g = Math.round(249 + (12 - 249) * pZoom);
        const b = Math.round(245 + (22 - 245) * pZoom);
        container.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

        const textR = Math.round(28 + (250 - 28) * pZoom);
        const textG = Math.round(25 + (249 - 25) * pZoom);
        const textB = Math.round(23 + (245 - 23) * pZoom);
        container.style.color = `rgb(${textR}, ${textG}, ${textB})`;

        container.style.cursor = 'none';
      }

      // Smoothly fade out ambient parchment paper radial glow based on pZoom
      if (glowOverlayRef.current) {
        glowOverlayRef.current.style.opacity = String(1 - pZoom);
      }

      // Declare variables for canvas backlight glow and custom cursor dot split-rendering
      let currentRhombusScale = 0.85;
      let currentPFill = 0;

      // Handle Rhombus Space Sanctuary reveal
      if (rhombusContainerRef.current) {
        let rhombusScale = 0.85;
        let rhombusOpacity = 0;
        let borderProgress = 0;
        let textOpacity = 0;
        let dotOpacity = 0;
        let pFill = 0;

        // Continuous scale update to avoid size resets and resize jerks
        if (sz >= 1500) {
          const baseGrowth = ((sz - 1500) / 1500) * 0.40; // grows from 0 to 0.72 over range 1500-3000
          const acceleration = pZoom > 0 ? Math.pow(pZoom, 2.0) * 98.43 : 0; // accelerates to 98.43 over range 3000-4200
          rhombusScale = 0.85 + baseGrowth + acceleration; // ranges smoothly from 0.85 to 100.0 at max zoom
        }

        if (sz < 1500) {
          rhombusScale = 0.85;
          rhombusOpacity = 0;
          borderProgress = 0;
          textOpacity = 0;
          dotOpacity = 0;
          pFill = 0;
        } else if (sz >= 1500 && sz < 2300) {
          // Step 1: Slow Border Reveal (800 units!)
          const pAppear = (sz - 1500) / 800;
          rhombusOpacity = Math.min(1.0, pAppear * 2.0);
          borderProgress = pAppear;
          textOpacity = 0;
          dotOpacity = 0;
          pFill = 0;
        } else if (sz >= 2300 && sz < 2500) {
          // Step 2: Fill & Color Morph (Border is complete, dark polygon fill fades in, text begins appearing)
          rhombusOpacity = 1.0;
          borderProgress = 1.0;
          pFill = (sz - 2300) / 200;
          textOpacity = pFill;
          dotOpacity = 0;
        } else if (sz >= 2500 && sz < 4000) {
          // Step 3: Text Sanctuary Reveal (Within the dark filled space - text stays fully visible!)
          rhombusOpacity = 1.0;
          borderProgress = 1.0;
          pFill = 1.0;
          textOpacity = 1.0;
          dotOpacity = 0;
        } else {
          // Step 4: Deep Zoom into Forgetful Place / Silent Space
          rhombusOpacity = 1.0;
          borderProgress = 1.0;
          pFill = 1.0;
          
          // Text stays fully present during zoom, then gently fades out after sz passes 4000
          textOpacity = Math.max(0, 1.0 - (sz - 4000) / 120);

          // Central emitting dot appears smoothly ONLY after the text is fully faded out
          dotOpacity = sz >= 4120 ? Math.min(1.0, (sz - 4120) / 80) : 0;
        }

        currentRhombusScale = rhombusScale;
        currentPFill = pFill;

        // Centered scale without translate offset
        rhombusContainerRef.current.style.transform = `scale(${rhombusScale})`;
        rhombusContainerRef.current.style.opacity = String(rhombusOpacity);
        rhombusContainerRef.current.style.pointerEvents = sz >= 1600 ? 'auto' : 'none';

        const rhombusFillEl = rhombusContainerRef.current.querySelector('#rhombus-fill');
        if (rhombusFillEl) {
          if (pFill > 0) {
            rhombusFillEl.setAttribute('fill', `rgba(8, 12, 22, ${pFill})`);
          } else {
            rhombusFillEl.setAttribute('fill', 'none');
          }
        }

        const borderPaths = rhombusContainerRef.current.querySelectorAll('.rhombus-border-path');
        if (borderPaths) {
          const len = 140;

          // Color transition for the inner borders: from dark neutral to light neutral when filled
          const pColor = pFill;
          const innerR = Math.round(41 + pColor * 209);
          const innerG = Math.round(37 + pColor * 212);
          const innerB = Math.round(36 + pColor * 209);
          const strokeColorInner = `rgb(${innerR}, ${innerG}, ${innerB})`;

          // Outer border is drawn only on the light off-white background, so it MUST stay dark neutral to always be visible
          const strokeColorOuter = 'rgb(41, 37, 36)';

          // Calculate zoom-out fade for borders as we zoom inside the rhombus
          const pZoomFade = sz >= 3000 ? Math.max(0, Math.min(1.0, (sz - 3000) / 1200)) : 0;

          borderPaths.forEach((path) => {
            const isInner = path.classList.contains('opacity-80');
            
            if (isInner) {
              // Inner border: continuous line drawing dynamically drawing from 0% to 100%
              (path as HTMLElement).style.strokeDasharray = String(len);
              (path as HTMLElement).style.strokeDashoffset = String(len * (1 - borderProgress));
              (path as HTMLElement).setAttribute('stroke', strokeColorInner);
              (path as HTMLElement).style.opacity = String(0.8 * (1.0 - pZoomFade));
            } else {
              // Outer border: continuous line drawing that never stops drawing during zoom and never completes (maxes out at 92%)
              const pOuter = sz >= 1500 ? Math.max(0, Math.min(1.0, (sz - 1500) / 2700)) : 0;
              const outerFrac = Math.pow(pOuter, 0.5) * 0.92;
              const outerOffset = len * (1.0 - outerFrac);
              (path as HTMLElement).style.strokeDasharray = String(len);
              (path as HTMLElement).style.strokeDashoffset = String(outerOffset);
              (path as HTMLElement).setAttribute('stroke', strokeColorOuter);
              (path as HTMLElement).style.opacity = String(1.0 - pZoomFade);
            }
          });
        }

        if (textRef.current) {
          textRef.current.style.opacity = String(textOpacity);
          // Zoom normalization: counteract the parent container's scaling factor to keep text at a fixed size
          // but allow a very tiny amount of scale depth (10%) to give a subtle, premium parallax depth feeling!
          // We combine translate(-50%, -50%) with scale to keep it perfectly centered without layout-flow sway.
          const textVisualScale = 1.0 + pZoom * 0.10;
          const normalizedTextScale = textVisualScale / rhombusScale;
          textRef.current.style.transform = `translate(-50%, -50%) scale(${normalizedTextScale})`;
        }

        if (emittingDotRef.current) {
          emittingDotRef.current.style.opacity = String(dotOpacity);
          // Counteract the container scale so the central emitting dot stays exactly the same size on screen
          const dotScale = 1.0 / rhombusScale;
          emittingDotRef.current.style.transform = `translate(-50%, -50%) scale(${dotScale})`;
        }
      }

      // 3. Direct DOM Parallax & 3D Spatial Zoom Updates: Update all active quote transforms in raw JS.
      // This completely bypasses expensive React render cycles and solves any CSS calc() browser glitches,
      // creating an incredibly smooth, buttery 3D depth feeling.
      const quoteEls = document.querySelectorAll('.parallax-quote');
      quoteEls.forEach((el) => {
        const depth = parseFloat(el.getAttribute('data-depth') || '1.0');
        const scale = parseFloat(el.getAttribute('data-scale') || '1.0');
        
        // Multiply by depth to scale translation speed: foreground drifts faster, background drifts slower
        const dx = parallax.x * depth;
        const dy = parallax.y * depth;
        
        // Base starting Z depth: depth 1.6 starts at 0px, depth 0.4 starts at -480px
        const zStart = (depth - 1.6) * 400;
        
        // As sz increases (scrolling up/zoom-in), dz moves forward
        const dz = zStart + sz * (depth * 1.1);
        
        // Apply true 3D spatial perspective transform for maximum immersion
        (el as HTMLElement).style.transform = `perspective(1000px) translate3d(${dx}px, ${dy}px, ${dz}px) scale(${scale})`;
        
        // Smooth fade out as it flies close and past the camera plane, multiplied by (1 - pQuotes) to dissolve into deep space
        let opacity = 0.95 * (1 - pQuotes);
        if (dz > 180) {
          opacity = Math.max(0, 0.95 * (1 - pQuotes) - (dz - 180) / 320);
        }
        (el as HTMLElement).style.opacity = opacity.toString();
        
        // Delicate depth-of-field blur as items get extremely close
        if (dz > 120) {
          const blurVal = Math.min(8, (dz - 120) * 0.02);
          (el as HTMLElement).style.filter = `blur(${blurVal}px)`;
        } else {
          (el as HTMLElement).style.filter = 'blur(0px)';
        }
        
        // Keep invisible elements click-safe
        if (opacity <= 0.05) {
          (el as HTMLElement).style.pointerEvents = 'none';
        } else {
          (el as HTMLElement).style.pointerEvents = 'auto';
        }
      });

      // Clear main canvas for redraw
      ctx.clearRect(0, 0, width, height);

      // 4. Draw shifting film grain overlay
      const offsetX = Math.floor(Math.random() * 128);
      const offsetY = Math.floor(Math.random() * 128);

      ctx.globalAlpha = 0.16 - pZoom * 0.08; // soft vintage grain density, slightly softer in dark theme
      for (let x = -128; x < width + 128; x += 128) {
        for (let y = -128; y < height + 128; y += 128) {
          ctx.drawImage(noiseCanvas, x + (offsetX % 8), y + (offsetY % 8));
        }
      }
      ctx.globalAlpha = 1.0;

      // 5. Destination-Out Compositing: Clear grain inside circular spotlight around the mouse
      ctx.globalCompositeOperation = 'destination-out';

      // Inner 30px is fully cleared, smoothly feathers out to 250px radius
      const clearRadius = 250;
      const grad = ctx.createRadialGradient(
        mouse.x,
        mouse.y,
        30,
        mouse.x,
        mouse.y,
        clearRadius
      );
      grad.addColorStop(0, 'rgba(0,0,0,1.0)'); // completely clear grain
      grad.addColorStop(0.2, 'rgba(0,0,0,0.9)'); // very clean inner window
      grad.addColorStop(0.5, 'rgba(0,0,0,0.4)'); // smooth feather
      grad.addColorStop(1, 'rgba(0,0,0,0.0)'); // keep background grain

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, clearRadius, 0, Math.PI * 2);
      ctx.fill();

      // Reset composite mode
      ctx.globalCompositeOperation = 'source-over';

      // 6. Draw very subtle warm backlight halo under the cleared circular window
      ctx.globalCompositeOperation = 'destination-over';

      // Define standard light/warm glow gradient (Alley style, or everywhere if currentPFill is 0)
      const glowGradLight = ctx.createRadialGradient(
        mouse.x,
        mouse.y,
        20,
        mouse.x,
        mouse.y,
        clearRadius
      );
      // Soft warm off-white glow
      glowGradLight.addColorStop(0, 'rgba(255, 252, 238, 0.45)');
      glowGradLight.addColorStop(0.5, 'rgba(255, 252, 238, 0.15)');
      glowGradLight.addColorStop(1, 'rgba(255, 252, 238, 0.0)');

      // Soft mysterious light-blue/indigo glow for the dark filled space (fades out as core aspects appear)
      const glowGradDark = ctx.createRadialGradient(
        mouse.x,
        mouse.y,
        20,
        mouse.x,
        mouse.y,
        clearRadius
      );
      const cursorGlowOpacityFactor = 1.0 - idleProgress;
      glowGradDark.addColorStop(0, `rgba(165, 180, 252, ${0.04 * cursorGlowOpacityFactor})`);
      glowGradDark.addColorStop(0.5, `rgba(165, 180, 252, ${0.008 * cursorGlowOpacityFactor})`);
      glowGradDark.addColorStop(1, 'rgba(165, 180, 252, 0.0)');

      if (currentPFill > 0) {
        const cx = width / 2;
        const cy = height / 2;
        const halfSize = 157.5 * currentRhombusScale;

        // --- DRAW LIGHT GLOW OUTSIDE THE RHOMBUS (using robust non-zero winding clip) ---
        ctx.save();
        ctx.beginPath();
        // Outer boundary (clockwise)
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        // Inner rhombus (counter-clockwise)
        ctx.moveTo(cx, cy - halfSize);
        ctx.lineTo(cx - halfSize, cy);
        ctx.lineTo(cx, cy + halfSize);
        ctx.lineTo(cx + halfSize, cy);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = glowGradLight;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, clearRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // --- DRAW DARK GLOW INSIDE THE RHOMBUS ---
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy - halfSize);
        ctx.lineTo(cx + halfSize, cy);
        ctx.lineTo(cx, cy + halfSize);
        ctx.lineTo(cx - halfSize, cy);
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = glowGradDark;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, clearRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // No filled rhombus, draw light glow everywhere
        ctx.fillStyle = glowGradLight;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, clearRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 7. Draw custom cursor dot on top of everything
      ctx.globalCompositeOperation = 'source-over';

      // --- PHASE 3 - MEMORIES: Interactive constellation knowledge graph reveal ---
      if (emittingDotRef.current) {
        // Control emitting halos based on idleProgress
        const halos = emittingDotRef.current.querySelectorAll('.rounded-full');
        halos.forEach((halo) => {
          const isHalo = halo.classList.contains('border') || halo.classList.contains('animate-ping') || halo.classList.contains('animate-pulse');
          if (isHalo) {
            (halo as HTMLElement).style.opacity = String((1.0 - idleProgress) * 0.4); // Scale down based on idleProgress
          }
        });
      }

      if (idleProgress > 0.01) {
        const centerX = width / 2;
        const centerY = height / 2;

        const t = Date.now() * 0.0006;
        const floatAmp = 8; // gentle float amplitude

        const scaleFactor = Math.max(0.65, Math.min(1.1, Math.min(width, height) / 800));
        const offsetA_X = -120 * scaleFactor;
        const offsetA_Y = -120 * scaleFactor;
        const offsetB_X = 140 * scaleFactor;
        const offsetB_Y = -30 * scaleFactor;
        const offsetC_X = -10 * scaleFactor;
        const offsetC_Y = 135 * scaleFactor;

        const nodeA = {
          id: 'interests',
          label: 'INTERESTS',
          details: 'Philosophy  •  Minimal Design  •  Sound Synth  •  Creative Dev',
          x: centerX + offsetA_X + Math.sin(t + 1.0) * floatAmp,
          y: centerY + offsetA_Y + Math.cos(t + 1.5) * floatAmp,
          labelYOffset: -20,
          detailsYOffset: -36,
          align: 'center' as const
        };

        const nodeB = {
          id: 'academics',
          label: 'ACADEMICS',
          details: 'Computer Science  •  Deep Learning  •  Systems Architecture',
          x: centerX + offsetB_X + Math.sin(t + 2.5) * floatAmp,
          y: centerY + offsetB_Y + Math.cos(t + 3.0) * floatAmp,
          labelYOffset: -20,
          detailsYOffset: -36,
          align: 'center' as const
        };

        const nodeC = {
          id: 'goal',
          label: 'GOAL',
          details: 'Building Mindful Tools  •  Aesthetic Code  •  The Joy of Learning',
          x: centerX + offsetC_X + Math.sin(t + 4.0) * floatAmp,
          y: centerY + offsetC_Y + Math.cos(t + 4.5) * floatAmp,
          labelYOffset: 24,
          detailsYOffset: 40,
          align: 'center' as const
        };

        const nodes = [nodeA, nodeB, nodeC];

        // 1. Calculate distances from mouse to determine glows and hover effects
        const distA = Math.sqrt(Math.pow(mouse.x - nodeA.x, 2) + Math.pow(mouse.y - nodeA.y, 2));
        const distB = Math.sqrt(Math.pow(mouse.x - nodeB.x, 2) + Math.pow(mouse.y - nodeB.y, 2));
        const distC = Math.sqrt(Math.pow(mouse.x - nodeC.x, 2) + Math.pow(mouse.y - nodeC.y, 2));
        const minDist = Math.min(distA, distB, distC);

        const maxDist = 320;
        const baseGlowA = Math.max(0, 1 - distA / maxDist);
        const baseGlowB = Math.max(0, 1 - distB / maxDist);
        const baseGlowC = Math.max(0, 1 - distC / maxDist);

        const isA_Closest = minDist === distA;
        const isB_Closest = minDist === distB;
        const isC_Closest = minDist === distC;

        const glowA = Math.pow(baseGlowA, 1.5) * (isA_Closest ? 1.0 : 0.4);
        const glowB = Math.pow(baseGlowB, 1.5) * (isB_Closest ? 1.0 : 0.4);
        const glowC = Math.pow(baseGlowC, 1.5) * (isC_Closest ? 1.0 : 0.4);

        const glowFactors = { interests: glowA, academics: glowB, goal: glowC };

        // 2. Draw connection lines (constellation lines drawing themselves)
        // From 0.3 to 1.0, connection lines draw themselves
        const drawFrac = Math.max(0, Math.min(1.0, (idleProgress - 0.3) / 0.7));
        if (drawFrac > 0) {
          ctx.save();
          ctx.strokeStyle = `rgba(250, 249, 245, ${0.12 * drawFrac})`;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([4, 4]); // lovely dashed lines for a stellar feel!

          const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + (x2 - x1) * drawFrac, y1 + (y2 - y1) * drawFrac);
            ctx.stroke();
          };

          // Draw connections between the nodes
          drawLine(nodeA.x, nodeA.y, nodeB.x, nodeB.y);
          drawLine(nodeB.x, nodeB.y, nodeC.x, nodeC.y);
          drawLine(nodeC.x, nodeC.y, nodeA.x, nodeA.y);

          // Draw connections from the center (emitting dot) to the nodes
          drawLine(centerX, centerY, nodeA.x, nodeA.y);
          drawLine(centerX, centerY, nodeB.x, nodeB.y);
          drawLine(centerX, centerY, nodeC.x, nodeC.y);

          ctx.restore();
        }

        // 3. Draw nodes, labels, glows, and sub-details
        nodes.forEach((node) => {
          const factor = glowFactors[node.id as 'interests' | 'academics' | 'goal'];
          const nodeOpacity = Math.min(1.0, idleProgress / 0.45);

          // Draw glowing halo around node
          if (factor > 0) {
            ctx.save();
            const radius = 60 * factor;
            const radGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
            // Even dimmer glow for the nodes in dark bg, matching the user's request
            radGrad.addColorStop(0, `rgba(165, 180, 252, ${0.18 * factor * nodeOpacity})`);
            radGrad.addColorStop(0.5, `rgba(165, 180, 252, ${0.05 * factor * nodeOpacity})`);
            radGrad.addColorStop(1, 'rgba(165, 180, 252, 0.0)');
            ctx.fillStyle = radGrad;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Draw the physical dot
          ctx.save();
          // Subtle pulsation for the dot
          const pulse = 1.0 + Math.sin(Date.now() * 0.003 + (node.id === 'interests' ? 0 : node.id === 'academics' ? 2 : 4)) * 0.15;
          ctx.fillStyle = `rgba(250, 249, 245, ${0.85 * nodeOpacity})`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 3.5 * pulse, 0, Math.PI * 2);
          ctx.fill();

          // Stroke ring
          ctx.strokeStyle = `rgba(250, 249, 245, ${0.3 * nodeOpacity})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 7 * pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Draw main label (INTERESTS, ACADEMICS, GOAL)
          ctx.save();
          ctx.fillStyle = `rgba(250, 249, 245, ${0.75 * nodeOpacity})`;
          ctx.font = '10px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Add spacing to characters for high-end cinematic tracking
          const spacedLabel = node.label.split('').join(' ');
          ctx.fillText(spacedLabel, node.x, node.y + node.labelYOffset);
          ctx.restore();

          // Draw sub-details if the mouse is close (smoothly faded in)
          const detailOpacity = Math.max(0, (factor - 0.22) / 0.78) * nodeOpacity;
          if (detailOpacity > 0.01) {
            ctx.save();
            ctx.fillStyle = `rgba(250, 249, 245, ${0.5 * detailOpacity})`;
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.details, node.x, node.y + node.detailsYOffset);
            ctx.restore();
          }
        });
      }

      if (!hasStartedRef.current) {
        // --- START OVERLAY CURSOR ---
        if (isHoveringRef.current) {
          // Hovering over the dark button: draw elegant light dot with dark stone stroke
          ctx.save();
          ctx.fillStyle = 'rgb(250, 249, 245)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(28, 25, 23)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
        } else {
          // Idle on light background: draw sharp solid dark stone dot (no stroke to prevent fuzziness)
          ctx.save();
          ctx.fillStyle = 'rgb(28, 25, 23)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (currentPFill > 0) {
        const cx = width / 2;
        const cy = height / 2;
        const halfSize = 157.5 * currentRhombusScale;

        // --- CURSOR OUTSIDE: Dark neutral fill with light stroke ---
        ctx.save();
        ctx.beginPath();
        // Outer boundary (clockwise)
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        // Inner rhombus (counter-clockwise)
        ctx.moveTo(cx, cy - halfSize);
        ctx.lineTo(cx - halfSize, cy);
        ctx.lineTo(cx, cy + halfSize);
        ctx.lineTo(cx + halfSize, cy);
        ctx.closePath();
        ctx.clip();

        if (isHoveringRef.current) {
          ctx.fillStyle = 'rgb(250, 249, 245)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(28, 25, 23)';
        } else {
          ctx.fillStyle = 'rgb(28, 25, 23)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(250, 249, 245)';
        }
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        // --- CURSOR INSIDE: Light neutral fill with dark stroke ---
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy - halfSize);
        ctx.lineTo(cx + halfSize, cy);
        ctx.lineTo(cx, cy + halfSize);
        ctx.lineTo(cx - halfSize, cy);
        ctx.closePath();
        ctx.clip();

        if (isHoveringRef.current) {
          ctx.fillStyle = 'rgb(28, 25, 23)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(250, 249, 245)';
        } else {
          ctx.fillStyle = 'rgb(250, 249, 245)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(28, 25, 23)';
        }
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      } else {
        // --- INSIDE EXPERIENCE BEFORE RHOMBUS IS FILLED ---
        ctx.save();
        if (isHoveringRef.current) {
          ctx.fillStyle = 'rgb(250, 249, 245)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(28, 25, 23)';
        } else {
          ctx.fillStyle = 'rgb(28, 25, 23)';
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgb(250, 249, 245)';
        }
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // Restore composite mode
      ctx.globalCompositeOperation = 'source-over';

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Update mouse coordinate targets for canvas spotlight & parallax offset
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const mx = e.clientX;
    const my = e.clientY;
    
    // Reset activity timers
    lastInteractionTimeRef.current = Date.now();
    lastScrollTimeRef.current = Date.now();
    
    // Canvas spotlight target
    mouseRef.current.targetX = mx;
    mouseRef.current.targetY = my;

    // Dynamically detect hover states on any interactive button/anchor under mouse cursor
    const target = e.target as HTMLElement;
    const isHovering = !!(
      target && (
        target.tagName === 'BUTTON' || 
        target.tagName === 'A' || 
        target.closest('button') !== null ||
        target.closest('a') !== null ||
        window.getComputedStyle(target).cursor === 'pointer'
      )
    );
    isHoveringRef.current = isHovering;

    // Parallax displacement ratio relative to screen center (-1 to 1)
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const px = (mx - windowWidth / 2) / (windowWidth / 2);
    const py = (my - windowHeight / 2) / (windowHeight / 2);

    // Displace up to 18px dynamically based on mouse movement for high-quality subtle 3D movement amplitude
    parallaxRef.current.targetX = px * 18;
    parallaxRef.current.targetY = py * 18;
  };

  // Touch support for mobile devices
  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      
      // Reset activity timers
      lastInteractionTimeRef.current = Date.now();
      lastScrollTimeRef.current = Date.now();
      
      mouseRef.current.targetX = tx;
      mouseRef.current.targetY = ty;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const px = (tx - windowWidth / 2) / (windowWidth / 2);
      const py = (ty - windowHeight / 2) / (windowHeight / 2);

      parallaxRef.current.targetX = px * 12;
      parallaxRef.current.targetY = py * 12;

      // Vertical touch drag maps to Z-zoom depth
      const deltaY = ty - touchStartYRef.current; // reversed mapping
      touchStartYRef.current = ty;
      
      if (hasStarted) {
        // Reset activity and idle timer on touch activity
        lastScrollTimeRef.current = Date.now();

        // Prioritize active zoom mode
        setIsZooming(true);
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(() => {
          setIsZooming(false);
        }, 2500);

        targetScrollZRef.current += deltaY * 4.5;
        targetScrollZRef.current = Math.max(0, Math.min(4200, targetScrollZRef.current));
      }
    }
  };

  // Screen click handler for synthesized windchimes
  const handleScreenClick = (e: MouseEvent<HTMLDivElement>) => {
    const cx = e.clientX;
    const cy = e.clientY;
    const xPercent = cx / window.innerWidth;
    const yPercent = cy / window.innerHeight;

    // Reset activity and idle timer on click
    lastScrollTimeRef.current = Date.now();
    lastInteractionTimeRef.current = Date.now();

    // Warm-up the sound engine on first click
    if (!hasStarted) {
      audio.init();
      audio.resume();
      setHasStarted(true);
    }

    // Synthesize beautiful windchimes at mapped frequencies using the current Z-spatial depth!
    const zPercent = scrollZRef.current / 4200;
    audio.playWindchimeClick(xPercent, yPercent, zPercent);

    // Create a physical click ripple expanding outwards
    const chimeColors = [
      'rgba(243, 225, 204, 0.55)', // soft apricot
      'rgba(230, 210, 220, 0.50)', // gentle blossom
      'rgba(210, 226, 236, 0.50)', // light ice chime
      'rgba(215, 232, 215, 0.50)', // subtle mint leaf
      'rgba(238, 238, 205, 0.55)', // retro gold linen
    ];
    const randomColor = chimeColors[Math.floor(Math.random() * chimeColors.length)];
    const newRipple: ChimeRipple = {
      id: Math.random().toString(),
      x: cx,
      y: cy,
      color: randomColor,
      maxRadius: 110 + Math.random() * 110,
    };

    setRipples((prev) => [...prev, newRipple]);

    // Clean up ripples after animation concludes
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 1500);
  };

  // Helper to generate a collision-free quote placement coordinates with a strict center deadzone
  // Now considers the Z-depth so that elements on the same depth layer never overlap, and allows beautiful layout
  const generateCleanPlacement = (existing: FloatingQuoteInstance[], targetDepth: number) => {
    let coordX = 0;
    let coordY = 0;
    let attempts = 0;
    let isValid = false;

    // We restrict ranges to keep items elegantly spaced on the viewport
    while (!isValid && attempts < 250) {
      attempts++;
      coordX = 10 + Math.random() * 60; // 10% to 70% left
      coordY = 12 + Math.random() * 56; // 12% to 68% top

      // 1. Check center deadzone constraint (X=50, Y=50) to prevent center overlay
      const distanceToCenter = Math.sqrt(Math.pow(coordX - 50, 2) + Math.pow(coordY - 50, 2));
      if (distanceToCenter < 24) {
        // Too close to center deadzone, retry
        continue;
      }

      // 2. Check overlap with existing active quotes considering their Z depth
      let hasOverlap = false;
      for (const item of existing) {
        const dx = Math.abs(item.x - coordX);
        const dy = Math.abs(item.y - coordY);
        const dz = Math.abs(item.depth - targetDepth);

        // If on the same Z axis/depth layer, they must absolutely never overlap
        if (dz < 0.1) {
          if (dx < 35 && dy < 20) {
            hasOverlap = true;
            break;
          }
        } else {
          // If on different Z depth planes, we still prevent direct stack-up (visual obstruction)
          // so the user can easily read everything as they zoom past.
          if (dx < 18 && dy < 12) {
            hasOverlap = true;
            break;
          }
        }
      }

      if (!hasOverlap) {
        isValid = true;
      }
    }

    // High-quality fallback if random attempts fail (highly unlikely for small pools of quotes)
    if (!isValid) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 12;
      coordX = 50 + Math.cos(angle) * radius;
      coordY = 50 + Math.sin(angle) * radius;
    }

    return { x: coordX, y: coordY };
  };

  // Synchronize the triggerRefreshRef with the latest closures for infinite Alley replenishment
  useEffect(() => {
    triggerRefreshRef.current = () => {
      const deck = shuffledQuotesRef.current.length > 0 ? shuffledQuotesRef.current : QUOTES;
      const getNextQuote = (currentActive: FloatingQuoteInstance[]) => {
        let selected = deck[quoteQueueIndexRef.current % deck.length];
        quoteQueueIndexRef.current++;

        let attempts = 0;
        while (currentActive.some(q => q.text === selected.text) && attempts < 10) {
          selected = deck[quoteQueueIndexRef.current % deck.length];
          quoteQueueIndexRef.current++;
          attempts++;
        }
        return selected;
      };

      setActiveQuotes(() => {
        const initialQuotes: FloatingQuoteInstance[] = [];
        const depthOptions = [0.4, 0.8, 1.2, 1.6];

        for (let i = 0; i < 4; i++) {
          const quote = getNextQuote(initialQuotes);
          const depth = depthOptions[i % depthOptions.length];
          const pos = generateCleanPlacement(initialQuotes, depth);
          const computedScale = 0.7 + (depth * 0.35);

          initialQuotes.push({
            id: Math.random().toString(),
            text: quote.text,
            x: pos.x,
            y: pos.y,
            rotation: 0,
            scale: computedScale,
            depth: depth,
            fadeState: 'in',
            createdAt: Date.now() + i * 1500
          });
        }
        return initialQuotes;
      });
    };
  }, []);

  // 2. Randomized Scattered Quotes Generator
  useEffect(() => {
    if (!hasStarted) return;

    // Helper to pick a non-duplicate quote from the deck
    const getNextQuote = (currentActive: FloatingQuoteInstance[]) => {
      const deck = shuffledQuotesRef.current.length > 0 ? shuffledQuotesRef.current : QUOTES;
      let selected = deck[quoteQueueIndexRef.current % deck.length];
      quoteQueueIndexRef.current++;

      // Try to avoid showing the exact same quote twice concurrently
      let attempts = 0;
      while (currentActive.some(q => q.text === selected.text) && attempts < 10) {
        selected = deck[quoteQueueIndexRef.current % deck.length];
        quoteQueueIndexRef.current++;
        attempts++;
      }
      return selected;
    };

    // Pre-populate the screen with 4 scattered quotes instantly when starting so that the board is full of starry thoughts
    setActiveQuotes(() => {
      const initialQuotes: FloatingQuoteInstance[] = [];
      const depthOptions = [0.4, 0.8, 1.2, 1.6];

      for (let i = 0; i < 4; i++) {
        const quote = getNextQuote(initialQuotes);
        const depth = depthOptions[i % depthOptions.length];
        const pos = generateCleanPlacement(initialQuotes, depth);
        const computedScale = 0.7 + (depth * 0.35);
        
        initialQuotes.push({
          id: Math.random().toString(),
          text: quote.text,
          x: pos.x,
          y: pos.y,
          rotation: 0, // Perfectly straight
          scale: computedScale, // Unified scaling based on 3D depth
          depth: depth,
          fadeState: 'in',
          createdAt: Date.now() + i * 1500 // staggered birth times
        });
      }
      return initialQuotes;
    });

    // Routine quote checker: every 3 seconds, if there are less than 5 quotes visible, spawn a new one!
    const spawnTimer = setInterval(() => {
      // Prioritize active zoom, or being deep in the rhombus transition (sz > 1600)
      if (isZoomingRef.current || reachedZoomEndRef.current || scrollZRef.current > 1600) return;

      setActiveQuotes((prev) => {
        if (prev.length >= 5) return prev;

        const nextQuote = getNextQuote(prev);

        // Find the least occupied Z-depth to distribute quotes beautifully across different planes
        const depthOptions = [0.4, 0.8, 1.2, 1.6];
        const occupancy: Record<number, number> = { 0.4: 0, 0.8: 0, 1.2: 0, 1.6: 0 };
        prev.forEach((q) => {
          if (q.depth in occupancy) {
            occupancy[q.depth]++;
          }
        });

        const sortedDepths = [...depthOptions].sort((a, b) => occupancy[a] - occupancy[b]);
        const chosenDepth = sortedDepths[0];

        const pos = generateCleanPlacement(prev, chosenDepth);
        const computedScale = 0.7 + (chosenDepth * 0.35);

        const newInstance: FloatingQuoteInstance = {
          id: Math.random().toString(),
          text: nextQuote.text,
          x: pos.x,
          y: pos.y,
          rotation: 0, // Perfectly straight
          scale: computedScale, // Unified scaling based on 3D depth
          depth: chosenDepth,
          fadeState: 'in',
          createdAt: Date.now()
        };

        return [...prev, newInstance];
      });
    }, 3200);

    // Lifespan timer: Slowly recycle individual quotes after 14 seconds of display
    const recycleTimer = setInterval(() => {
      // Prioritize active zoom, or being deep in the rhombus transition (sz > 1600)
      if (isZoomingRef.current || reachedZoomEndRef.current || scrollZRef.current > 1600) return;

      const now = Date.now();
      let finishedThisBatch = 0;
      
      setActiveQuotes((prev) => {
        const next = prev.map(q => {
          // If quote has lived past 14 seconds, set its fadeState to out
          if (now - q.createdAt > 14000 && q.fadeState === 'in') {
            finishedThisBatch++;
            return { ...q, fadeState: 'out' };
          }
          return q;
        });

        if (finishedThisBatch > 0) {
          setFinishedQuotesCount(c => c + finishedThisBatch);
        }
        return next;
      });

      // Clear out quotes that have finished fading out (lived past 15.5 seconds)
      setTimeout(() => {
        setActiveQuotes((prev) => prev.filter(q => {
          const isExpired = now - q.createdAt > 15500 && q.fadeState === 'out';
          return !isExpired;
        }));
      }, 1500);

    }, 2000);

    return () => {
      clearInterval(spawnTimer);
      clearInterval(recycleTimer);
    };
  }, [hasStarted]);

  // Ambient sound mute controller
  const handleMuteToggle = (e: MouseEvent) => {
    e.stopPropagation(); // don't trigger chime click
    if (!hasStarted) {
      audio.init();
      audio.resume();
      setHasStarted(true);
      return;
    }
    const muted = audio.toggleMute();
    setIsMuted(muted);
    
    const notice = muted ? "Ambient melody muted" : "Ambient melody playing";
    setMuteNotice(notice);
    setTimeout(() => {
      setMuteNotice(null);
    }, 3000);
  };

  // Enter the Alley button trigger
  const handleStartApp = () => {
    audio.init();
    audio.resume();
    setHasStarted(true);
    // Play warm entry chord
    setTimeout(() => {
      audio.playWindchimeClick(0.35, 0.45);
    }, 100);
    setTimeout(() => {
      audio.playWindchimeClick(0.65, 0.50);
    }, 350);
  };

  return (
    <div
      id="app-container"
      ref={appContainerRef}
      className="fixed inset-0 w-full h-full overflow-hidden text-[#1C1917] select-none font-sans bg-[#FAF9F5]"
      style={{
        cursor: 'none'
      }}
      onMouseMove={handleMouseMove}
      onTouchStart={(e) => {
        lastInteractionTimeRef.current = Date.now();
        lastScrollTimeRef.current = Date.now();
        if (e.touches.length > 0) {
          touchStartYRef.current = e.touches[0].clientY;
        }
      }}
      onTouchMove={handleTouchMove}
      onClick={handleScreenClick}
    >
      {/* 1. Animated Film Grain with Mouse Clearing Spotlight */}
      <canvas
        id="grain-canvas"
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-50"
      />

      {/* 2. Interactive Click Ripples */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {ripples.map((ripple) => (
          <motion.div
            key={ripple.id}
            initial={{ 
              x: ripple.x, 
              y: ripple.y, 
              scale: 0, 
              opacity: 0.9
            }}
            animate={{ 
              scale: [0, 1.3, 1.8], 
              opacity: [0.9, 0.3, 0],
              borderWidth: ["3.5px", "1.5px", "0px"]
            }}
            transition={{ 
              duration: 1.5, 
              ease: "easeOut" 
            }}
            className="absolute rounded-full border transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              borderColor: ripple.color,
              boxShadow: `0 0 25px ${ripple.color}`,
              width: `${ripple.maxRadius}px`,
              height: `${ripple.maxRadius}px`,
            }}
          />
        ))}
      </div>

      {/* Warm parchment paper ambient radial glow */}
      <div
        ref={glowOverlayRef}
        className="absolute inset-0 pointer-events-none z-0 bg-radial-gradient from-transparent via-[#F7F5EC]/40 to-[#ECE9DB]/60"
      />

      {/* 3. Top Right: Minimalistic branding & music controllers */}
      <div 
        id="page-header"
        className="absolute top-8 right-8 z-30 flex flex-col items-end text-right select-none pointer-events-auto"
      >
        <button
          id="header-brand-btn"
          onClick={handleMuteToggle}
          className="group flex items-center gap-2.5 px-3.5 py-1.5 rounded-full hover:bg-stone-200/50 active:bg-stone-300/40 transition-all duration-300 outline-none border border-transparent hover:border-stone-300/30"
          title="Toggle ambient music"
        >
          {hasStarted && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[9px] text-neutral-400 font-mono tracking-wider">
              {isMuted ? "PLAY MUSIC" : "MUTE MUSIC"}
            </span>
          )}
          <span className="text-xs font-light tracking-[0.25em] opacity-65 font-sans uppercase group-hover:opacity-100 transition-opacity">
            Ashwin's Alley
          </span>
          {hasStarted && (
            <div className="opacity-50 group-hover:opacity-100 transition-opacity ml-0.5">
              {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} className="animate-pulse" />}
            </div>
          )}
        </button>

        {/* Transient audio feedback notice */}
        <AnimatePresence>
          {muteNotice && (
            <motion.span
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 0.6, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[9px] text-stone-400 font-mono mt-1 mr-4 tracking-wide pointer-events-none"
            >
              {muteNotice}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 4. Initial Landing Start Screen Overlay */}
      <AnimatePresence>
        {!hasStarted && (
          <motion.div
            id="start-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#FAF9F5]/98 px-6 pointer-events-auto"
            onClick={handleStartApp}
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.9 }}
              className="text-center max-w-md"
            >
              <h1 className="text-2xl font-extralight tracking-[0.35em] text-stone-800 uppercase mb-4">
                Ashwin's Alley
              </h1>
              <p className="text-xs font-light text-stone-400 tracking-widest leading-relaxed mb-10 uppercase">
                A mind in pursuit of the unknown. A heart devoted to love.
              </p>
              
              <motion.button
                id="enter-btn"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartApp();
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-stone-300 text-xs font-light tracking-widest text-stone-600 uppercase hover:bg-stone-800 hover:text-[#FAF9F5] hover:border-stone-800 transition-all duration-300 outline-none"
              >
                <span>Enter Alley</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Scattered Romantic Quotes Layer with Real-Time Parallax Depth */}
      {hasStarted && (
        <div id="experience-viewport" className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}>
          <AnimatePresence mode="popLayout">
            {activeQuotes.map((quote) => (
              <motion.div
                key={quote.id}
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: isZooming ? 0.95 : (quote.fadeState === 'in' ? 0.95 : 0)
                }}
                exit={{ 
                  opacity: 0
                }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="absolute"
                style={{
                  left: `${quote.x}vw`,
                  top: `${quote.y}vh`,
                  zIndex: quote.depth > 1.0 ? 25 : 5,
                }}
              >
                {/* 3D spatial zoom + parallax inner layout targeted dynamically via RAF */}
                <div
                  className="parallax-quote select-none pointer-events-none text-left max-w-[210px] md:max-w-[290px]"
                  data-depth={quote.depth}
                  data-scale={quote.scale}
                  style={{
                    transform: `perspective(1000px) translate3d(0px, 0px, ${(quote.depth - 1.6) * 400}px) scale(${quote.scale})`,
                    opacity: 0.95
                  }}
                >
                  <p className="text-sm md:text-base font-light leading-relaxed text-[#1C1917] tracking-wide select-none drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)]">
                    “{quote.text}”
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 6. Rhombus Space Sanctuary Reveal driven by Spatial Zoom */}
      {hasStarted && (
        <div
          ref={rhombusContainerRef}
          className="absolute inset-0 m-auto z-20 pointer-events-none flex flex-col items-center justify-center w-[360px] h-[360px]"
          style={{ transform: 'scale(0)', opacity: 0 }}
        >
          {/* SVG for the double borders drawn from 4 corners */}
          <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 400 400">
            {/* Filled background of the rhombus gateway (Aligned with inner border vertices) */}
            <polygon id="rhombus-fill" points="200,25 375,200 200,375 25,200" fill="none" stroke="none" />

            {/* Outer Corner Paths */}
            {/* Top Corner */}
            <path className="rhombus-border-path" d="M 200 10 L 105 105" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            <path className="rhombus-border-path" d="M 200 10 L 295 105" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            {/* Right Corner */}
            <path className="rhombus-border-path" d="M 390 200 L 295 105" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            <path className="rhombus-border-path" d="M 390 200 L 295 295" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            {/* Bottom Corner */}
            <path className="rhombus-border-path" d="M 200 390 L 295 295" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            <path className="rhombus-border-path" d="M 200 390 L 105 295" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            {/* Left Corner */}
            <path className="rhombus-border-path" d="M 10 200 L 105 295" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />
            <path className="rhombus-border-path" d="M 10 200 L 105 105" stroke="#FAF9F5" strokeWidth="1.5" fill="none" />

            {/* Inner Corner Paths (Double Border) */}
            {/* Top Corner */}
            <path className="rhombus-border-path opacity-80" d="M 200 25 L 112 112" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            <path className="rhombus-border-path opacity-80" d="M 200 25 L 288 112" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            {/* Right Corner */}
            <path className="rhombus-border-path opacity-80" d="M 375 200 L 288 112" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            <path className="rhombus-border-path opacity-80" d="M 375 200 L 288 288" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            {/* Bottom Corner */}
            <path className="rhombus-border-path opacity-80" d="M 200 375 L 288 288" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            <path className="rhombus-border-path opacity-80" d="M 200 375 L 112 288" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            {/* Left Corner */}
            <path className="rhombus-border-path opacity-80" d="M 25 200 L 112 288" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
            <path className="rhombus-border-path opacity-80" d="M 25 200 L 112 112" stroke="#FAF9F5" strokeWidth="1" strokeDasharray="3,3" fill="none" />
          </svg>

          {/* Inner Text or Core element with absolute centering to prevent layout-flow and scaling sway artifacts */}
          <div className="absolute inset-0 select-none pointer-events-none">
            {/* "Silence of Empty Space" Text */}
            <div
              ref={textRef}
              className="absolute top-1/2 left-1/2 text-center font-sans tracking-[0.3em] text-xs uppercase leading-relaxed font-light text-[#FAF9F5] whitespace-nowrap"
              style={{ opacity: 0, transform: 'translate(-50%, -50%) scale(1)' }}
            >
              Silence of<br />Empty Space
            </div>

            {/* Emitting Dot (Zen core) */}
            <div
              ref={emittingDotRef}
              className="absolute top-1/2 left-1/2 flex items-center justify-center w-24 h-24 pointer-events-none"
              style={{ opacity: 0, transform: 'translate(-50%, -50%) scale(1)' }}
            >
              {/* Multiple expanding halo waves for a highly polished, nostalgic look */}
              <div className="w-12 h-12 rounded-full border border-[#FAF9F5]/25 animate-ping absolute" />
              <div className="w-20 h-20 rounded-full border border-[#FAF9F5]/10 animate-pulse absolute" style={{ animationDuration: '3s' }} />
              <div className="w-3.5 h-3.5 rounded-full bg-[#FAF9F5] shadow-[0_0_15px_rgba(250,249,245,0.85)]" />
            </div>
          </div>
        </div>
      )}

      {/* Instruction Cue helper */}
      {hasStarted && (
        <motion.div
          id="visual-cue"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.45, 0.45, 0] }}
          transition={{
            delay: 3,
            duration: 8,
            repeat: Infinity,
            repeatDelay: 20,
          }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none text-[9px] font-mono tracking-widest text-stone-400 uppercase select-none text-center"
        >
          Move mouse to drift thoughts • Scroll to zoom • Click to ring chimes
        </motion.div>
      )}
    </div>
  );
}
