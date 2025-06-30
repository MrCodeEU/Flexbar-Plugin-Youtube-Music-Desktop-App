// YouTube Music Canvas Renderer
const { Canvas, loadImage } = require('skia-canvas');
const logger = require('./loggerwrapper');
const { truncateText, getImageColors, roundedRect, createFallbackImage, decodeHtmlEntities } = require('./utils');

const createCanvas = (width, height) => new Canvas(width, height);

/**
 * Draws a custom play icon
 */
function drawPlayIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    
    ctx.beginPath();
    ctx.moveTo(-5 * scale, -8 * scale);
    ctx.lineTo(7 * scale, 0);
    ctx.lineTo(-5 * scale, 8 * scale);
    ctx.closePath();
    
    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 5 * scale;
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a custom pause icon
 */
function drawPauseIcon(ctx, x, y, size, color = '#FFFFFF') {
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    
    const barWidth = 3 * scale;
    const barHeight = 16 * scale;
    const spacing = 2 * scale;
    
    const leftX = -barWidth - spacing / 2;
    const rightX = spacing / 2;
    const topY = -barHeight / 2;
    
    // Draw two rounded rectangles
    roundedRect(ctx, leftX, topY, barWidth, barHeight, 2 * scale);
    ctx.fill();
    
    roundedRect(ctx, rightX, topY, barWidth, barHeight, 2 * scale);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Draws a custom like icon (thumbs up)
 */
function drawLikeIcon(ctx, x, y, size, isLiked, likedColor = '#FF0000', unlikedColor = '#FFFFFF') {
    ctx.save();
    
    // Center the icon
    ctx.translate(x, y);
    
    // Scale based on size (SVG viewBox is 24x24)
    const scale = size / 24;
    ctx.scale(scale, scale);
    
    // Translate to match SVG coordinate system (centered)
    ctx.translate(-12, -12);
    
    // Draw the main hand/thumb shape
    ctx.beginPath();
    
    // Start at top right corner of palm
    ctx.moveTo(21, 8);
    
    // Move left along top of palm to thumb base
    ctx.lineTo(15.5, 8);
    
    // Go up along right side of thumb
    ctx.lineTo(16.2, 4);
    ctx.lineTo(16, 2.5);
    
    // Thumb tip - rounded top
    ctx.quadraticCurveTo(15.8, 1.2, 14.5, 1);
    ctx.quadraticCurveTo(13.2, 1.2, 13, 2.5);
    
    // Down left side of thumb
    ctx.lineTo(12.5, 5);
    ctx.lineTo(11.5, 7);
    
    // Connect to folded fingers
    ctx.lineTo(9, 8.5);
    ctx.lineTo(7.5, 8);
    
    // Left side of palm
    ctx.quadraticCurveTo(7, 8.5, 7, 9);
    
    // Down to bottom
    ctx.lineTo(7, 19);
    
    // Bottom left corner
    ctx.quadraticCurveTo(7, 21, 9, 21);
    
    // Bottom edge
    ctx.lineTo(18, 21);
    
    // Bottom right corner and up
    ctx.quadraticCurveTo(19.5, 21, 20.5, 20);
    ctx.lineTo(22.5, 13);
    
    // Top right
    ctx.quadraticCurveTo(23, 11.5, 23, 10);
    ctx.quadraticCurveTo(23, 8, 21, 8);
    
    ctx.closePath();
    
    // Style and draw based on isLiked state
    ctx.lineWidth = 1.5 / scale;
    
    if (isLiked === true || isLiked === 2) {
        ctx.fillStyle = likedColor;
        ctx.fill();
    } else if (isLiked === false || isLiked === 1) {
        ctx.strokeStyle = unlikedColor;
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
    }
    
    // Draw the separate wrist/forearm piece
    ctx.beginPath();
    ctx.moveTo(1, 9);
    ctx.lineTo(5, 9);
    ctx.lineTo(5, 21);
    ctx.lineTo(1, 21);
    ctx.closePath();
    
    if (isLiked === true || isLiked === 2) {
        ctx.fillStyle = likedColor;
        ctx.fill();
    } else if (isLiked === false || isLiked === 1) {
        ctx.strokeStyle = unlikedColor;
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * Draws a custom dislike icon (thumbs down)
 */

function drawDislikeIcon(ctx, x, y, size, isDisliked, dislikedColor = '#FF0000', undislikedColor = '#FFFFFF') {
    ctx.save();
    
    // Center the icon
    ctx.translate(x, y);
    
    // Scale based on size (SVG viewBox is 24x24)
    const scale = size / 24;
    ctx.scale(scale, scale);
    
    // Translate to match SVG coordinate system (centered)
    ctx.translate(-12, -12);
    
    // Draw the main hand/thumb shape
    ctx.beginPath();
    
    // Start at bottom left corner of palm
    ctx.moveTo(3, 16);
    
    // Move right along bottom of palm to thumb base
    ctx.lineTo(8.5, 16);
    
    // Go up along left side of thumb
    ctx.lineTo(7.8, 20);
    ctx.lineTo(8, 22.5);
    
    // Thumb tip - rounded top
    ctx.quadraticCurveTo(8.2, 23.8, 9.5, 24);
    ctx.quadraticCurveTo(10.8, 23.8, 11, 22.5);
    
    // Down right side of thumb
    ctx.lineTo(11.5, 20);
    ctx.lineTo(12.5, 18);
    
    // Connect to folded fingers
    ctx.lineTo(15, 16.5);
    ctx.lineTo(16.5, 17);
    
    // Right side of palm
    ctx.quadraticCurveTo(17, 16.5, 17, 16);
    
    // Up to top
    ctx.lineTo(17, 6);
    
    // Top left corner
    ctx.quadraticCurveTo(17, 4, 15, 4);
    
    // Top edge
    ctx.lineTo(6, 4);
    
    // Top right corner and down
    ctx.quadraticCurveTo(4.5, 4, 3.5, 5);
    ctx.lineTo(1.5, 12);
    
    // Bottom left
    ctx.quadraticCurveTo(1, 13.5, 1, 15);
    ctx.quadraticCurveTo(1, 17, 3, 17);
    
    ctx.closePath();
    
    // Style and draw based on isDisliked state
    ctx.lineWidth = 1.5 / scale;
    if (isDisliked === true || isDisliked === 0) {
        ctx.fillStyle = dislikedColor;
        ctx.fill();
    } else if (isDisliked === false || isDisliked === 1) {
        ctx.strokeStyle = undislikedColor;
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
    }
    // Draw the separate wrist/forearm piece
    ctx.beginPath();
    ctx.moveTo(23, 15);
    ctx.lineTo(19, 15);
    ctx.lineTo(19, 3);
    ctx.lineTo(23, 3);
    ctx.closePath();

    if (isDisliked === true || isDisliked === 0) {
        ctx.fillStyle = dislikedColor;
        ctx.fill();
    } else if (isDisliked === false || isDisliked === 1) {
        ctx.strokeStyle = undislikedColor;
        ctx.stroke();
    } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * Creates a modern YouTube Music now playing display
 */
async function createYouTubeMusicCanvas(config) {
    const {
        width = 480,
        height = 60,
        trackName = 'No track playing',
        artistName = '',
        albumName = '',
        isPlaying = false,
        albumArtUrl = null,
        progress = 0, // in seconds
        duration = 0, // in seconds
        showProgress = true,
        showTitle = true,
        showArtist = true,
        showPlayPause = true,
        showTimeInfo = true,
        titleFontSize = 20,
        artistFontSize = 16,
        timeFontSize = 14,
        progressBarColor = '#FF0000',
        renderType = 'nowplaying', // 'nowplaying', 'like', 'playpause', 'dislike'
        isLiked = null,
        likedColor = '#FF0000',
        unlikedColor = '#FFFFFF',
        likeBgColor = '#424242',
        playColor = '#00FF00',
        pauseColor = '#FF6600',
        bgColor = '#424242',
        options = {}
    } = config;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Enable image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Handle different render types
    if (renderType === 'like') {
        // Render like button
        ctx.fillStyle = likeBgColor || '#424242';
        const cornerRadius = 10;
        roundedRect(ctx, 0, 0, width, height, cornerRadius);
        ctx.fill();

        const iconSize = Math.min(width, height) * 0.6;
        drawLikeIcon(ctx, width / 2, height / 2, iconSize, isLiked, likedColor, unlikedColor);
        return canvas;
    }

    if (renderType === 'dislike') {
        // Render dislike button
        ctx.fillStyle = likeBgColor || '#424242';
        const cornerRadius = 10;
        roundedRect(ctx, 0, 0, width, height, cornerRadius);
        ctx.fill();
        const iconSize = Math.min(width, height) * 0.6;
        drawDislikeIcon(ctx, width / 2, height / 2, iconSize, isLiked, likedColor, unlikedColor);
        return canvas;
    }

    if (renderType === 'playpause') {
        // Render play/pause button
        ctx.fillStyle = bgColor || '#424242';
        const cornerRadius = 10;
        roundedRect(ctx, 0, 0, width, height, cornerRadius);
        ctx.fill();

        const iconSize = Math.min(width, height) * 0.6;
        const iconColor = isPlaying ? pauseColor : playColor;
        
        if (isPlaying) {
            drawPauseIcon(ctx, width / 2, height / 2, iconSize, iconColor);
        } else {
            drawPlayIcon(ctx, width / 2, height / 2, iconSize, iconColor);
        }
        return canvas;
    }

    // Default: Now Playing display
    const padding = 4;
    const artSize = height - (padding * 2);
    const artX = padding;
    const artY = padding;
    const artRadius = 8;

    let albumArt = null;
    let gradientColors = ['#1E1E1E', '#2E2E2E']; // Default YouTube Music dark theme

    // Load album art with retry logic
    if (albumArtUrl) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 500;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                albumArt = await loadImage(albumArtUrl);
                logger.debug(`Album art loaded successfully on attempt ${attempt}`);
                break;
            } catch (imgError) {
                logger.warn(`Failed to load album art (Attempt ${attempt}/${MAX_RETRIES}) from ${albumArtUrl}: ${imgError.message}`);
                if (attempt === MAX_RETRIES) {
                    logger.error(`Failed to load album art after ${MAX_RETRIES} attempts. Using fallback.`);
                } else {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }

        if (albumArt) {
            gradientColors = getImageColors(ctx, albumArt);
        }
    }

    // Create background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, gradientColors[0]);
    gradient.addColorStop(1, gradientColors[1]);

    // Draw background
    const cornerRadius = 12;
    roundedRect(ctx, 0, 0, width, height, cornerRadius);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Add overlay for better text readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    roundedRect(ctx, 0, 0, width, height, cornerRadius);
    ctx.fill();

    // Layout calculations
    const textX = artX + artSize + padding;
    const availableTextWidth = width - textX - padding;
    const buttonSize = Math.min(28, artSize * 0.6);
    
    // Draw album art
    if (albumArt) {
        ctx.save();
        roundedRect(ctx, artX, artY, artSize, artSize, artRadius);
        ctx.clip();
        ctx.drawImage(albumArt, artX, artY, artSize, artSize);
        ctx.restore();
    } else {
        // Fallback album art placeholder
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundedRect(ctx, artX, artY, artSize, artSize, artRadius);
        ctx.fill();
        
        // YouTube Music logo placeholder
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${artSize * 0.3}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YTM', artX + artSize / 2, artY + artSize / 2);
    }

    // Progress bar setup
    const progressBarHeight = 4;
    const progressBarRadius = progressBarHeight / 2;
    let progressBarY = height - padding;

    if (showProgress && duration > 0) {
        progressBarY = height - padding - progressBarHeight;
        
        // Background bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        roundedRect(ctx, padding, progressBarY, width - (padding * 2), progressBarHeight, progressBarRadius);
        ctx.fill();
        
        // Progress fill
        ctx.fillStyle = progressBarColor;
        const progressRatio = Math.min(1, Math.max(0, progress / duration));
        const progressWidth = (width - (padding * 2)) * progressRatio;
        roundedRect(ctx, padding, progressBarY, progressWidth, progressBarHeight, progressBarRadius);
        ctx.fill();
    }

    // Play/Pause button
    if (showPlayPause) {
        const buttonX = width - padding - buttonSize;
        const buttonY = artY - progressBarHeight*2 + (artSize - buttonSize) / 2;
        
        if (isPlaying) {
            drawPauseIcon(ctx, buttonX + buttonSize / 2, buttonY + buttonSize / 2, buttonSize, '#FFFFFF');
        } else {
            drawPlayIcon(ctx, buttonX + buttonSize / 2, buttonY + buttonSize / 2, buttonSize, '#FFFFFF');
        }
    }

    // Text rendering
    const finalTitleFontSize = Math.max(8, titleFontSize);
    const finalArtistFontSize = Math.max(8, artistFontSize);

    // Decode HTML entities
    const decodedTrackName = decodeHtmlEntities(trackName);
    const decodedArtistName = decodeHtmlEntities(artistName);

    // Time formatting
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const totalSeconds = Math.floor(seconds);
        const minutes = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // Calculate text positions
    let timeTextWidth = 0;
    if (showTimeInfo && duration > 0) {
        const parsedTimeFontSize = parseInt(timeFontSize, 10);
        const finalTimeFontSize = Math.max(8, Math.min(24, parsedTimeFontSize || 10));
        
        ctx.font = `${finalTimeFontSize}px sans-serif`;
        const currentTime = formatTime(progress);
        const totalTime = formatTime(duration);
        const timeText = `${currentTime} / ${totalTime}`;
        timeTextWidth = ctx.measureText(timeText).width + padding * 2;
    }

    const adjustedAvailableTextWidth = availableTextWidth - timeTextWidth - (showPlayPause ? buttonSize + padding : 0);

    // Draw title
    if (showTitle && decodedTrackName) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${finalTitleFontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const titleY = artY + (showArtist ? 2 : (artSize - finalTitleFontSize) / 2);
        const displayTrackName = truncateText(ctx, decodedTrackName, adjustedAvailableTextWidth);
        ctx.fillText(displayTrackName, textX, titleY);
    }

    // Draw artist
    if (showArtist && decodedArtistName) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `${finalArtistFontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const artistY = artY + finalTitleFontSize + 4;
        const displayArtistName = truncateText(ctx, decodedArtistName, adjustedAvailableTextWidth);
        ctx.fillText(displayArtistName, textX, artistY);
    }

    // Draw time info
    if (showTimeInfo && duration > 0) {
        const parsedTimeFontSize = parseInt(timeFontSize, 10);
        const finalTimeFontSize = Math.max(8, Math.min(24, parsedTimeFontSize || 10));
        
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${finalTimeFontSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        
        const currentTime = formatTime(progress);
        const totalTime = formatTime(duration);
        const timeText = `${currentTime} / ${totalTime}`;
        
        const timeY = showProgress ? progressBarY - 2 : height - padding - 2;
        const timeX = width - padding;
        ctx.fillText(timeText, timeX, timeY);
        ctx.restore();
    }

    return canvas;
}

/**
 * Creates YouTube Music button image as Base64 PNG data URL
 */
async function createYouTubeMusicButtonDataUrl(width, trackName, artistName, isPlaying, albumArtUrl, progress, duration, style = {}, showProgress = true, showTitle = true, showPlayPause = true, titleFontSize = 18, artistFontSize = 14, showTimeInfo = true, timeFontSize = 10, options = {}) {
    try {
        // Extract style properties
        let progressBarColor = '#FF0000'; // YouTube Music red
        if (style.progressBarColor && style.progressBarColor !== '') {
            progressBarColor = style.progressBarColor;
        }

        const canvas = await createYouTubeMusicCanvas({
            width: width,
            height: 60,
            trackName,
            artistName,
            isPlaying,
            albumArtUrl,
            progress,
            duration,
            showProgress,
            showTitle,
            showPlayPause,
            titleFontSize,
            artistFontSize,
            showTimeInfo,
            timeFontSize,
            progressBarColor,
            renderType: options.renderType || 'nowplaying',
            isLiked: options.isLiked,
            likedColor: options.likedColor,
            unlikedColor: options.unlikedColor,
            likeBgColor: options.likeBgColor,
            playColor: options.playColor,
            pauseColor: options.pauseColor,
            bgColor: options.bgColor
        });

        return canvas.toDataURL('image/png');
    } catch (error) {
        logger.error('Error creating YouTube Music button Data URL:', error);
        return createFallbackImage(width, 60);
    }
}

module.exports = {
    createYouTubeMusicCanvas,
    createYouTubeMusicButtonDataUrl,
    drawPlayIcon,
    drawPauseIcon,
    drawLikeIcon
};