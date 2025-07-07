// Main key handler module: re-exports all key handler functions
const keyHandlerInit = require('./keyHandlerInit.js');
const keyHandlerUpdate = require('./keyHandlerUpdate.js');
const keyHandlerInteraction = require('./keyHandlerInteraction.js');

// Initialize all modules with plugin instances
function initializeAllModules(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn) {
    keyHandlerInit.initializeModule(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn);
    keyHandlerUpdate.initializeModule(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn);
    keyHandlerInteraction.initializeModule(authInstance, apiInstance, stateInstance, errorNotificationFn, authErrorFn);
}

module.exports = {
    initializeAllModules,
    ...keyHandlerInit,
    ...keyHandlerUpdate,
    ...keyHandlerInteraction
};
