// YouTube Music Plugin Utilities
const { Canvas } = require('skia-canvas');
const logger = require('./loggerWrapper');

const createCanvas = (width, height) => new Canvas(width, height);

/**
 * Helper function to adjust color brightness
 */
function adjustColor(color, amount) {
    const clamp = (num) => Math.min(255, Math.max(0, num));
    color = color.replace('#', '');
    
    // Ensure the hex color string is valid before parsing
    if (!/^[0-9a-fA-F]{6}$/.test(color)) {
        logger.error(`Invalid color format in adjustColor: ${color}`);
        return '#000000'; // Return a default color on error
    }

    try {
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);

        const adjustR = clamp(r + amount).toString(16).padStart(2, '0');
        const adjustG = clamp(g + amount).toString(16).padStart(2, '0');
        const adjustB = clamp(b + amount).toString(16).padStart(2, '0');

        return `#${adjustR}${adjustG}${adjustB}`;
    } catch (error) {
        logger.error(`Error adjusting color ${color}: ${error.message}`);
        return '#000000'; // Default fallback
    }
}

/**
 * Helper function to truncate text with ellipsis
 */
function truncateText(ctx, text, maxWidth) {
    if (!text) return ''; // Handle null or undefined text input
    let displayText = String(text); // Ensure text is a string

    try {
        let metrics = ctx.measureText(displayText);
        
        // Basic check for maxWidth validity
        if (typeof maxWidth !== 'number' || maxWidth <= 0) {
            return displayText; // Return original text if maxWidth is invalid
        }

        while (metrics.width > maxWidth && displayText.length > 0) {
            displayText = displayText.slice(0, -1);
            
            // Check if ctx.measureText is still valid
            try {
                metrics = ctx.measureText(displayText + '...');
            } catch (ctxError) {
                return text; // Return original text if context is lost
            }
        }
    } catch (error) {
        return displayText || text; // Return what we have if error occurs
    }

    return displayText.length < String(text).length ? displayText + '...' : displayText;
}

/**
 * Creates a simple fallback image as Base64 data URL
 */
function createFallbackImage(width, height = 60) {
    try {
        // Add basic validation for width and height
        if (!width || width <= 0 || height <= 0) {
            logger.error(`Invalid dimensions for fallback image: ${width}x${height}`);
            width = 480;
            height = 60;
        }

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // YouTube Music themed fallback
        ctx.fillStyle = '#282828'; // Dark background
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YouTube Music', width/2, height/2);

        return canvas.toDataURL('image/png');
    } catch (error) {
        logger.error('Failed to create fallback image:', error);
        // Return a minimal base64 image as ultimate fallback
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
}

/**
 * Extract dominant colors from an image for gradient backgrounds
 */
function getImageColors(ctx, image, numColors = 2) {
    try {
        // Validate image input
        if (!image || !image.width || !image.height) {
            return ['#282828', '#383838']; // Default YouTube Music dark colors
        }

        // Create a small version of the image for color analysis
        const sampleSize = Math.min(50, image.width, image.height);
        const tempCanvas = createCanvas(sampleSize, sampleSize);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, sampleSize, sampleSize);

        // Get image data safely
        const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize).data;

        // Extract colors from corners
        const topLeft = [imageData[0], imageData[1], imageData[2]];
        const topRight = [
            imageData[(sampleSize - 1) * 4],
            imageData[(sampleSize - 1) * 4 + 1],
            imageData[(sampleSize - 1) * 4 + 2]
        ];

        // Helper to format RGB array to Hex string
        const componentToHex = (c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        const rgbToHex = (rgb) => `#${componentToHex(rgb[0])}${componentToHex(rgb[1])}${componentToHex(rgb[2])}`;

        // Return two distinct colors
        if (topLeft.every(c => c >= 0 && c <= 255) && topRight.every(c => c >= 0 && c <= 255)) {
            const diff = Math.abs(topLeft[0] - topRight[0]) + Math.abs(topLeft[1] - topRight[1]) + Math.abs(topLeft[2] - topRight[2]);
            const hexTopLeft = rgbToHex(topLeft);
            
            if (diff > 30) { // Colors are sufficiently different
                return [hexTopLeft, rgbToHex(topRight)];
            } else {
                // Similar colors, create variation
                return [hexTopLeft, adjustColor(hexTopLeft, 20)];
            }
        }

        return ['#282828', '#383838']; // Fallback
    } catch (error) {
        logger.error('Error extracting colors:', error);
        return ['#282828', '#383838']; // Fallback to default YouTube Music colors
    }
}

/**
 * Escape XML special characters for text
 */
function escapeXml(unsafe) {
    if (typeof unsafe !== 'string') {
        return ''; // Return empty string for non-string input
    }

    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Helper function to draw a rounded rectangle
 */
function roundedRect(ctx, x, y, width, height, radius) {
    try {
        if (typeof x !== 'number' || typeof y !== 'number' || 
            typeof width !== 'number' || typeof height !== 'number' || 
            typeof radius !== 'number') {
            logger.error('Invalid arguments provided to roundedRect');
            return;
        }

        // Clamp radius to reasonable bounds
        radius = Math.max(0, Math.min(radius, width / 2, height / 2));

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    } catch (error) {
        logger.error(`Error drawing rounded rectangle: ${error.message}`);
    }
}

/**
 * Decodes HTML entities from a string
 */
function decodeHtmlEntities(text) {
    if (typeof text !== 'string') return '';

    // Simple replacement for common entities
    return text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

/**
 * Format duration from seconds to MM:SS format
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get the best thumbnail URL from YouTube Music thumbnails array
 */
function getBestThumbnail(thumbnails, preferredSize = 300) {
    if (!thumbnails || !Array.isArray(thumbnails) || thumbnails.length === 0) {
        return null;
    }

    // Sort by size (width) and find the best match
    const sortedThumbnails = thumbnails
        .filter(thumb => thumb.url && thumb.width && thumb.height)
        .sort((a, b) => Math.abs(a.width - preferredSize) - Math.abs(b.width - preferredSize));

    return sortedThumbnails.length > 0 ? sortedThumbnails[0].url : null;
}

/**
 * Validate YouTube Music track state
 */
function validateTrackState(state) {
    if (!state || typeof state !== 'object') {
        return false;
    }

    const requiredFields = ['title', 'artist'];
    return requiredFields.every(field => state.hasOwnProperty(field));
}

/**
 * Safe color validation
 */
function isValidColor(color) {
    if (typeof color !== 'string') return false;
    
    // Check for hex color format
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

/**
 * Get contrasting text color for a background color
 */
function getContrastingColor(backgroundColor) {
    if (!isValidColor(backgroundColor)) {
        return '#FFFFFF'; // Default to white
    }

    // Remove # and convert to RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

module.exports = {
    adjustColor,
    truncateText,
    createFallbackImage,
    getImageColors,
    escapeXml,
    roundedRect,
    decodeHtmlEntities,
    formatDuration,
    getBestThumbnail,
    validateTrackState,
    isValidColor,
    getContrastingColor,
    createCanvas
};