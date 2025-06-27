// YouTube Music Plugin Logger Wrapper
const { logger: flexbarLogger } = require("@eniac/flexdesigner");
const { plugin } = require("@eniac/flexdesigner");

const PLUGIN_PREFIX = '[YTMusic Plugin]';

// Define log levels (higher number = higher priority)
const LOG_LEVELS = {
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

// --- Configuration ---
// This variable stores the current log level name (e.g., "INFO", "DEBUG")
// It defaults to 'INFO' and is updated by reading the plugin configuration
let currentConfiguredLogLevelName = 'INFO';

// Function to get the numeric value of the current log level for comparison
function getCurrentNumericLogLevel() {
    const levelName = currentConfiguredLogLevelName.toUpperCase();
    return LOG_LEVELS.hasOwnProperty(levelName) ? LOG_LEVELS[levelName] : LOG_LEVELS.INFO;
}

// Internal function to read config and update the logger's level
async function _updateLogLevelFromConfig() {
    try {
        const config = await plugin.getConfig();
        const oldLogLevelName = currentConfiguredLogLevelName;

        if (config && typeof config.logLevel === 'string' && LOG_LEVELS.hasOwnProperty(config.logLevel.toUpperCase())) {
            loggerwrapper.info(PLUGIN_PREFIX, `Updating log level from config. New level: ${config.logLevel}`);
            const newLevelName = config.logLevel.toUpperCase();
            currentConfiguredLogLevelName = newLevelName;
        } else {
            // If no valid logLevel in config, revert to/ensure default 'INFO'
            currentConfiguredLogLevelName = 'INFO';
            
            // Only log warning if there was an invalid logLevel value in config
            if (config && config.logLevel) {
                if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) {
                    flexbarLogger.warn(PLUGIN_PREFIX, `Invalid 'logLevel' ("${config.logLevel}") in config. Using default: ${currentConfiguredLogLevelName}.`);
                }
            }
        }

        // Log the change if the new level allows for INFO or higher
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
            flexbarLogger.info(PLUGIN_PREFIX, `Log level updated from config. New level: ${currentConfiguredLogLevelName}`);
        } else if (LOG_LEVELS[oldLogLevelName.toUpperCase()] >= LOG_LEVELS.INFO) {
            // If new level is too low to log, but old one was high enough, log the transition
            flexbarLogger.info(PLUGIN_PREFIX, `Log level changed to ${currentConfiguredLogLevelName}. Further INFO logs may be suppressed based on new level.`);
        }
    } catch (error) {
        // Use console.error as this is a logger setup/config issue
        console.error(PLUGIN_PREFIX, 'Failed to load logLevel from config:', error, `Using current/default: ${currentConfiguredLogLevelName}.`);
    }
}

// Wrapper functions
const loggerwrapper = {
    debug: (...args) => {
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.DEBUG) {
            flexbarLogger.debug(PLUGIN_PREFIX, ...args);
        }
    },
    
    info: (...args) => {
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
            flexbarLogger.info(PLUGIN_PREFIX, ...args);
        }
    },
    
    warn: (...args) => {
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) {
            flexbarLogger.warn(PLUGIN_PREFIX, ...args);
        }
    },
    
    error: (...args) => {
        // Errors are logged if current level is ERROR or higher (i.e., not OFF)
        if (getCurrentNumericLogLevel() >= LOG_LEVELS.ERROR) {
            flexbarLogger.error(PLUGIN_PREFIX, ...args);
        }
    },

    // Public function to allow explicit setting of log level
    setLogLevel: (levelName) => {
        if (typeof levelName === 'string' && LOG_LEVELS.hasOwnProperty(levelName.toUpperCase())) {
            const newLevelName = levelName.toUpperCase();
            const oldLevelNumeric = getCurrentNumericLogLevel();
            currentConfiguredLogLevelName = newLevelName;
            
            if (oldLevelNumeric >= LOG_LEVELS.INFO) {
                flexbarLogger.info(PLUGIN_PREFIX, `Log level explicitly set to: ${currentConfiguredLogLevelName}`);
            } else if (getCurrentNumericLogLevel() >= LOG_LEVELS.INFO) {
                flexbarLogger.info(PLUGIN_PREFIX, `Log level explicitly set to: ${currentConfiguredLogLevelName}. INFO logs may be suppressed.`);
            }
        } else {
            if (getCurrentNumericLogLevel() >= LOG_LEVELS.WARN) {
                flexbarLogger.warn(PLUGIN_PREFIX, `Invalid log level requested for explicit set: ${levelName}.`);
            }
        }
    },

    getLogLevel: () => {
        return currentConfiguredLogLevelName;
    },

    getLogLevelNumeric: () => {
        return getCurrentNumericLogLevel();
    },

    // Expose this function for the main plugin to call during init and on config change notifications
    updateLogLevelFromConfig: _updateLogLevelFromConfig,
    
    // Expose LOG_LEVELS object for reference if needed
    LOG_LEVELS
};

module.exports = loggerwrapper;