interface Line {
  frequency: number;
  phase: number;
  phaseSpeed: number;
  amplitudeFactor: number;
  hue: number;
  hueSpeed: number;
  width: number;
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let startTime = 0;
let lastFrameTime = 0;

// Configuration / State
let performanceMode: 'high' | 'low' = 'high';
let isWaves = true;
let isHidden = false;
let width = 0;
let height = 0;
let rawWidth = 0;
let rawHeight = 0;
let lines: Line[] = [];

const STAGE_DELAY = 5000;
const TRANSITION_DURATION = 5000;
const SPLIT_X_PERCENT = 0.45;

const getFrameInterval = () => {
  const fps = performanceMode === 'low' ? 15 : 30;
  return 1000 / fps;
};

const updateCanvasSize = () => {
  const scale = performanceMode === 'low' ? 0.6 : 1.0;
  width = rawWidth * scale;
  height = rawHeight * scale;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
};

const initLines = () => {
  lines = [];
  const count = performanceMode === 'low' ? 8 : 20;
  for (let i = 0; i < count; i++) {
    lines.push({
      frequency: 0.005 + Math.random() * 0.015,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.05,
      amplitudeFactor: 20 + Math.random() * 80,
      hue: Math.random() * 360,
      hueSpeed: 0.1 + Math.random() * 0.5,
      width: 0.8 + Math.random() * 1.2
    });
  }
};

const animate = (time: number) => {
  if (!canvas || !ctx || !isWaves || isHidden) {
    console.log('[Worker] animate loop breaking. Reason:', { hasCanvas: !!canvas, hasCtx: !!ctx, isWaves, isHidden });
    animationId = null;
    return;
  }

  // FPS Throttling
  if (time - lastFrameTime < getFrameInterval()) {
    animationId = requestAnimationFrame(animate);
    return;
  }
  lastFrameTime = time;

  if (!startTime) startTime = time;
  const elapsed = time - startTime;
  
  const progress = Math.min(1, Math.max(0, (elapsed - STAGE_DELAY) / TRANSITION_DURATION));
  const isStarted = elapsed > STAGE_DELAY;

  const centerY = height / 2;
  const splitX = width * SPLIT_X_PERCENT;

  ctx.clearRect(0, 0, width, height);

  // 1. Draw Base Line
  const pulse = (Math.sin(time * 0.002) + 1) / 2;
  const baseWidth = 8 + pulse * 4;
  const baseAlpha = 0.6 + pulse * 0.4;
  
  // Double-stroke for beautiful neon glow without expensive shadowBlur
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(splitX, centerY);
  
  ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * 0.15})`;
  ctx.lineWidth = baseWidth + 8;
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha})`;
  ctx.lineWidth = baseWidth;
  ctx.stroke();

  if (progress < 1) {
    ctx.beginPath();
    ctx.moveTo(splitX, centerY);
    ctx.lineTo(width, centerY);
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * 0.15 * (1 - progress)})`;
    ctx.lineWidth = (baseWidth + 8) * (1 - progress);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * (1 - progress)})`;
    ctx.lineWidth = baseWidth * (1 - progress);
    ctx.stroke();
  }

  // 2. Draw Bundle of Waves
  if (isStarted) {
    lines.forEach((line) => {
      if (!ctx) return;
      line.phase -= line.phaseSpeed;
      line.hue = (line.hue + line.hueSpeed) % 360;

      ctx.beginPath();
      ctx.lineWidth = line.width;
      const waveAlpha = progress * 0.65;
      
      // Secondary soft glow
      ctx.strokeStyle = `hsla(${line.hue}, 80%, 75%, ${waveAlpha})`;
      
      ctx.moveTo(splitX, centerY);
      
      const step = performanceMode === 'low' ? 16 : 10;
      
      let lastX = splitX;
      let lastY = centerY;
      for (let x = splitX + step; x < width; x += step) {
        const dist = (x - splitX) / (width - splitX);
        const amplitude = dist * line.amplitudeFactor * progress;
        const y = centerY + Math.sin(x * line.frequency + line.phase) * amplitude;
        
        // Quad curves make waves look incredibly fluid with 2x fewer segment vertices
        const xc = (lastX + x) / 2;
        const yc = (lastY + y) / 2;
        ctx.quadraticCurveTo(lastX, lastY, xc, yc);
        
        lastX = x;
        lastY = y;
      }
      ctx.lineTo(width, lastY);
      ctx.stroke();
    });

    // 3. Glowing Core
    const glowRadius = 30 * progress;
    if (glowRadius > 0) {
      const gradient = ctx.createRadialGradient(splitX, centerY, 0, splitX, centerY, glowRadius);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(splitX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  animationId = requestAnimationFrame(animate);
};

const startAnimation = () => {
  console.log('[Worker] startAnimation called. State:', { animationId, isWaves, isHidden, hasCanvas: !!canvas, hasCtx: !!ctx });
  if (!animationId && isWaves && !isHidden && canvas && ctx) {
    animationId = requestAnimationFrame(animate);
  }
};

const stopAnimation = () => {
  console.log('[Worker] stopAnimation called. State:', { animationId });
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
};

self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;
  console.log('[Worker] onmessage received:', type, data || '');

  switch (type) {
    case 'init': {
      canvas = event.data.canvas;
      rawWidth = event.data.width;
      rawHeight = event.data.height;
      performanceMode = event.data.performanceMode || 'high';
      updateCanvasSize();
      ctx = canvas!.getContext('2d') as OffscreenCanvasRenderingContext2D;
      isWaves = event.data.isWaves;
      initLines();
      startAnimation();
      break;
    }
    case 'resize': {
      rawWidth = data.width;
      rawHeight = data.height;
      updateCanvasSize();
      break;
    }
    case 'updatePrefs': {
      const oldPerf = performanceMode;
      performanceMode = data.performanceMode;
      isWaves = data.isWaves;
      
      if (performanceMode !== oldPerf) {
        updateCanvasSize();
        initLines();
      }

      if (isWaves) {
        startAnimation();
      } else {
        stopAnimation();
      }
      break;
    }
    case 'visibilityChange': {
      isHidden = data.hidden;
      if (!isHidden) {
        startTime = 0; // restart timer for seamless transition
        startAnimation();
      } else {
        stopAnimation();
      }
      break;
    }
  }
};
