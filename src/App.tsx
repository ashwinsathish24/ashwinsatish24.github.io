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

  // Scattered floating quotes state
  const [activeQuotes, setActiveQuotes] = useState<FloatingQuoteInstance[]>([]);
  const quoteQueueIndexRef = useRef(0);

  // Sound click ripples
  const [ripples, setRipples] = useState<ChimeRipple[]>([]);

  // Track finished quotes and forgetful place mode
  const [finishedQuotesCount, setFinishedQuotesCount] = useState(0);
  const [isForgetfulPlace, setIsForgetfulPlace] = useState(false);
  const [reachedZoomEnd, setReachedZoomEnd] = useState(false);

  // Canvas and parallax tracking references
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appContainerRef = useRef<HTMLDivElement | null>(null);
  
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
      if (!hasStarted || isForgetfulPlace) return;

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
      
      // Clamp target zoom range: 0 (starting depth) to 2500 (end of spatial layout)
      targetScrollZRef.current = Math.max(0, Math.min(2500, targetScrollZRef.current));
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [hasStarted, isForgetfulPlace]);

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
      // 1. Interpolate mouse positions for smooth trailing spotlight look
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.12;
      mouse.y += (mouse.targetY - mouse.y) * 0.12;

      // 2. Interpolate parallax offsets for subtle floating layer motion (lagging behind mouse)
      const parallax = parallaxRef.current;
      parallax.x += (parallax.targetX - parallax.x) * 0.08;
      parallax.y += (parallax.targetY - parallax.y) * 0.08;

      // Interpolate spatial zoom Z position
      scrollZRef.current += (targetScrollZRef.current - scrollZRef.current) * 0.08;
      const sz = scrollZRef.current;

      // Actively trigger beautiful windchimes at discrete steps as they zoom/travel through Z-space
      if (isZoomingRef.current) {
        const diff = Math.abs(sz - lastChimeZRef.current);
        if (diff >= 180) {
          const zPercent = sz / 2500;
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
        // and they are NOT actively scrolling back out (targetScrollZRef.current >= 2380)
        const reachedEnd = sz >= 2380 && targetScrollZRef.current >= 2380;
        if (reachedEnd !== reachedZoomEndRef.current) {
          reachedZoomEndRef.current = reachedEnd;
          setReachedZoomEnd(reachedEnd);
        }

        // Handle infinite-alley refreshing when crossing boundaries
        // Passing past the zoom-in limit (all items faded out):
        if (sz >= 2380) {
          if (!hasPassedEndRef.current) {
            hasPassedEndRef.current = true;
          }
        } else if (sz < 2100) {
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
        
        // Smooth fade out as it flies close and past the camera plane
        let opacity = 0.95;
        if (dz > 180) {
          opacity = Math.max(0, 0.95 - (dz - 180) / 320);
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

      ctx.globalAlpha = 0.16; // soft vintage grain density
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
      const glowGrad = ctx.createRadialGradient(
        mouse.x,
        mouse.y,
        20,
        mouse.x,
        mouse.y,
        clearRadius
      );
      glowGrad.addColorStop(0, 'rgba(255, 252, 238, 0.45)'); // warm off-white radial shine
      glowGrad.addColorStop(0.5, 'rgba(253, 249, 234, 0.15)');
      glowGrad.addColorStop(1, 'rgba(247, 244, 235, 0.0)');
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, clearRadius, 0, Math.PI * 2);
      ctx.fill();

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
    
    // Canvas spotlight target
    mouseRef.current.targetX = mx;
    mouseRef.current.targetY = my;

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
      
      if (hasStarted && !isForgetfulPlace) {
        // Prioritize active zoom mode
        setIsZooming(true);
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(() => {
          setIsZooming(false);
        }, 2500);

        targetScrollZRef.current += deltaY * 4.5;
        targetScrollZRef.current = Math.max(0, Math.min(2500, targetScrollZRef.current));
      }
    }
  };

  // Screen click handler for synthesized windchimes
  const handleScreenClick = (e: MouseEvent<HTMLDivElement>) => {
    const cx = e.clientX;
    const cy = e.clientY;
    const xPercent = cx / window.innerWidth;
    const yPercent = cy / window.innerHeight;

    // Warm-up the sound engine on first click
    if (!hasStarted) {
      audio.init();
      audio.resume();
      setHasStarted(true);
    }

    // Synthesize beautiful windchimes at mapped frequencies using the current Z-spatial depth!
    const zPercent = scrollZRef.current / 2500;
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
    if (!hasStarted || isForgetfulPlace) return;

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
      // Prioritize active zoom, the forgetful button being visible, and the forgetful place mode
      if (isZoomingRef.current || reachedZoomEndRef.current || isForgetfulPlace) return;

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
      // Prioritize active zoom, the forgetful button being visible, and the forgetful place mode
      if (isZoomingRef.current || reachedZoomEndRef.current || isForgetfulPlace) return;

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
  }, [hasStarted, isForgetfulPlace]);

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

  // Toggle the forgetful place (zen sanctuary)
  const handleToggleForgetfulPlace = (e: MouseEvent) => {
    e.stopPropagation(); // prevent chime click triggering on screen
    const nextState = !isForgetfulPlace;
    setIsForgetfulPlace(nextState);
    
    if (nextState) {
      // Clear all thoughts for absolute tranquility
      setActiveQuotes([]);
      // Play a peaceful, layered windchime wash
      setTimeout(() => {
        audio.playWindchimeClick(0.25, 0.45);
      }, 100);
      setTimeout(() => {
        audio.playWindchimeClick(0.50, 0.50);
      }, 300);
      setTimeout(() => {
        audio.playWindchimeClick(0.75, 0.55);
      }, 500);
    } else {
      // Reset zoom depth so newly generated thoughts are positioned beautifully
      scrollZRef.current = 0;
      targetScrollZRef.current = 0;
      setReachedZoomEnd(false);

      // Re-populate thoughts smoothly
      const initialQuotes: FloatingQuoteInstance[] = [];
      const depthOptions = [0.4, 0.8, 1.2, 1.6];
      const deck = shuffledQuotesRef.current.length > 0 ? shuffledQuotesRef.current : QUOTES;

      for (let i = 0; i < 4; i++) {
        const quote = deck[quoteQueueIndexRef.current % deck.length];
        quoteQueueIndexRef.current++;
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
      setActiveQuotes(initialQuotes);
      
      // Gentle arpeggio of chimes when exiting
      setTimeout(() => {
        audio.playWindchimeClick(0.4, 0.6);
      }, 150);
      setTimeout(() => {
        audio.playWindchimeClick(0.6, 0.4);
      }, 400);
    }
  };

  return (
    <div
      id="app-container"
      ref={appContainerRef}
      className={`relative w-screen h-screen overflow-hidden text-[#1C1917] select-none font-sans transition-colors duration-[2500ms] ease-in-out ${isForgetfulPlace ? 'bg-[#F2F1EA]' : 'bg-[#FAF9F5]'}`}
      style={{
        cursor: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><circle cx='6' cy='6' r='3.5' fill='%23292524' stroke='%23ffffff' stroke-width='1.5'/></svg>") 6 6, auto`
      }}
      onMouseMove={handleMouseMove}
      onTouchStart={(e) => {
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
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
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
      <div className="absolute inset-0 pointer-events-none z-0 bg-radial-gradient from-transparent via-[#F7F5EC]/40 to-[#ECE9DB]/60" />

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
          <span className="text-xs font-light tracking-[0.25em] text-stone-500 font-sans uppercase group-hover:text-stone-900 transition-colors">
            Ashwin's Alley
          </span>
          {hasStarted && (
            <div className="text-stone-400 group-hover:text-stone-900 transition-colors ml-0.5">
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
      {hasStarted && !isForgetfulPlace && (
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

      {/* 6. Forgetful Place Button Reveal at the End of the Spatial Zoom Layout */}
      <AnimatePresence>
        {((isZooming && reachedZoomEnd) || isForgetfulPlace) && (
          <motion.div
            id="forgetful-btn-container"
            initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            transition={{ duration: 1.8, ease: "easeOut" }}
            className={`absolute top-1/2 left-1/2 z-30 flex flex-col items-center justify-center ${
              (!reachedZoomEnd && !isForgetfulPlace) ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{ transform: "translate(-50%, -50%)" }}
          >
            {!isForgetfulPlace ? (
              <motion.button
                id="forgetful-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleToggleForgetfulPlace}
                className="px-8 py-3.5 rounded-full border border-stone-300/80 text-[11px] font-light tracking-[0.25em] text-stone-600 uppercase bg-[#FAF9F5]/90 hover:bg-stone-800 hover:text-[#FAF9F5] hover:border-stone-800 transition-all duration-500 outline-none shadow-md backdrop-blur-sm"
              >
                A forgetful place
              </motion.button>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-6"
              >
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border border-stone-400/30 animate-ping absolute" />
                  <div className="w-4 h-4 rounded-full bg-stone-400/20" />
                </div>
                
                <span className="text-[11px] font-light tracking-[0.35em] text-stone-500 uppercase text-center select-none max-w-xs leading-relaxed">
                  Silence of empty space
                </span>

                <motion.button
                  id="return-btn"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleToggleForgetfulPlace}
                  className="mt-4 px-6 py-2.5 rounded-full border border-stone-400 text-[9px] font-light tracking-[0.2em] text-stone-500 uppercase hover:bg-stone-800 hover:text-[#FAF9F5] hover:border-stone-800 transition-all duration-300 outline-none"
                >
                  Return to Alley
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
