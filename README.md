# 🎵 YouTube Music Integration for FlexBar

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)
[![FlexDesigner](https://img.shields.io/badge/FlexDesigner-v1.1.0%2B-blue)](https://eniacelec.com/pages/software)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux-orange)](https://eniacelec.com/pages/software)

A YouTube Music integration plugin for FlexBar that provides real-time music information display and controls via the YouTube Music Desktop App's Companion Server API.

## 📋 Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Setup](#setup)
- [Development](#development)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Platform Support](#platform-support)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### 🎧 Now Playing Display
- Real-time track information with album artwork
- Artist and song title display with dynamic updates
- Progress bar with customizable colors
- Time information display (current/total)
- Interactive play/pause button

### 🎛️ Playback Controls
- **Like/Unlike Button**: Toggle track like status
- **Play/Pause Button**: Control playback state
- Real-time status updates via Socket.IO

### 💫 Interactive Elements
- Visual feedback for user interactions
- Customizable colors and fonts
- Real-time updates without polling
- Seamless integration with FlexBar UI

### 🚀 Advanced Features
- **Real-time Updates**: Uses Socket.IO for instant state changes
- **No API Keys Required**: Works directly with YouTube Music Desktop App
- **Customizable Appearance**: Font sizes, colors, and display options
- **Error Handling**: Robust error handling and fallback displays
- **Multi-key Support**: Multiple key types for different functions

## 📦 Prerequisites

### Required Software
- **Node.js** 18 or later
- **FlexDesigner** v1.1.0 or later
- **FlexBar** device
- **YouTube Music Desktop App** (v2.0.0+) with Companion Server enabled

### YouTube Music Desktop App Setup
1. **Download and Install**: Get the latest version from [YouTube Music Desktop App](https://ytmdesktop.app/)
2. **Enable Companion Server**:
   - Open YouTube Music Desktop App
   - Go to Settings → Integration
   - Enable "Companion Server"
   - Ensure it's running on port 9863 (default)

### FlexCLI Installation
```bash
npm install -g @eniac/flexcli
```

## 💻 Installation

### For Development

1. **Clone the Repository**
```bash
git clone https://github.com/ENERGYMT/FlexBar-Plugin-YouTubeMusic.git
cd FlexBar-Plugin-YouTubeMusic
```

2. **Install Dependencies**
```bash
npm install
```

3. **Build the Plugin**
```bash
npm run build
```

4. **Link for Development**
```bash
npm run plugin:link
```

### For Production Use

1. **Download Release**: Get the latest `.flexplugin` file from the releases page
2. **Install Plugin**: Use FlexDesigner to install the plugin file

## 🔧 Setup

### 1. YouTube Music Desktop App Configuration

Ensure the Companion Server is enabled and accessible:

```bash
# Test if the server is running
curl http://localhost:9863/metadata
```

Expected response:
```json
{
  "apiVersions": ["v1"]
}
```

### 2. Plugin Authentication

1. **Open FlexDesigner**
2. **Go to Settings → Application → YouTube Music**
3. **Configure App Details**:
   - App Name: `FlexBar YouTube Music Plugin` (or custom name)
   - App Version: `1.0.0`
4. **Click "Connect"**
5. **Approve in YouTube Music Desktop App** when prompted
6. **Verify Connection** by clicking "Test"

### 3. Add Keys to FlexBar

1. **In FlexDesigner**, go to your FlexBar layout
2. **Add keys from the YouTube Music category**:
   - **Now Playing**: Shows current track with album art and controls
   - **Like Button**: Toggle like status for current track
   - **Play/Pause Button**: Simple play/pause control

## 🛠️ Development

### Development Workflow

```bash
# Start development mode with hot-reload
npm run dev

# This will:
# - Build the plugin
# - Link it to FlexDesigner
# - Watch for changes
# - Auto-restart on changes
# - Enable debug logging
```

### Available Commands

```bash
# Build plugin for production
npm run build

# Validate plugin structure
npm run plugin:validate

# Pack plugin into .flexplugin file
npm run plugin:pack

# Install packed plugin
npm run plugin:install

# Link plugin for development
npm run plugin:link

# Unlink plugin
npm run plugin:unlink

# Debug plugin
npm run plugin:debug
```

### Project Structure

```
src/
├── plugin.js              # Main plugin entry point
├── ytMusicApi.js          # YouTube Music API wrapper
├── ytMusicAuth.js         # Authentication handler
├── ytMusicRealtime.js     # Socket.IO real-time handler
├── canvasRenderer.js      # Canvas rendering for keys
├── keyManager.js          # Key state management
├── loggerwrapper.js       # Logging utilities
└── utils.js               # Utility functions

at.mrcode.ytmd.plugin/
├── manifest.json          # Plugin manifest
└── ui/
    ├── global_config.vue  # Global configuration UI
    ├── nowplaying.vue     # Now Playing key config
    ├── like.vue           # Like button key config
    └── playpause.vue      # Play/Pause key config
```

## 🎮 Usage

### Key Types

| Key Type | Description | Interactions |
|----------|-------------|--------------|
| **Now Playing** | Displays current track, artist, album art, and progress | Click to play/pause |
| **Like Button** | Shows and controls like status | Click to toggle like |
| **Play/Pause** | Simple play/pause control | Click to toggle playback |

### Configuration Options

#### Now Playing Key
- **Update Interval**: How often to check for updates (default: 5000ms)
- **Font Sizes**: Title, artist, and time info font sizes
- **Progress Bar Color**: Customizable progress bar color
- **Display Options**: Toggle title, artist, progress, time info, play button

#### Like Button
- **Liked Color**: Color when track is liked (default: YouTube red)
- **Unliked Color**: Color when track is not liked (default: white)
- **Background Color**: Button background color

#### Play/Pause Button
- **Play Color**: Icon color when paused (default: green)
- **Pause Color**: Icon color when playing (default: orange)
- **Background Color**: Button background color

### Real-time Updates

The plugin uses Socket.IO for real-time updates, providing:
- Instant track changes
- Live progress updates
- Immediate like status changes
- Playback state synchronization

## 📡 API Reference

### YouTube Music Desktop App Companion Server API

The plugin uses the Companion Server API v1:

#### Authentication Flow
1. Request authentication code
2. Exchange code for token (requires user approval)
3. Use token for API requests

#### Key Endpoints
- `GET /metadata`: Server information
- `POST /auth/requestcode`: Request auth code
- `POST /auth/request`: Exchange code for token
- `GET /state`: Current player state
- `POST /command`: Send player commands

#### Socket.IO Events
- `state-update`: Real-time state changes
- `playlist-created`: Playlist creation events
- `playlist-delete`: Playlist deletion events

### Plugin Events

The plugin handles these FlexBar events:
- `plugin.alive`: Key registration and initialization
- `plugin.data`: User interactions with keys
- `device.status`: Device connection changes
- `ui.message`: Configuration UI interactions

## 🖥️ Platform Support

### Supported Platforms (only Windows is tested)
- **Windows 10+** (x64, ARM64)
- **macOS 10.15+** (Intel & Apple Silicon)
- **Linux** (Ubuntu 20.04+ and other major distributions)

### YouTube Music Desktop App Compatibility
- **Minimum Version**: 2.0.0
- **Recommended**: Latest version for best compatibility
- **Companion Server**: Must be enabled in app settings

## 🔧 Troubleshooting

### Common Issues

#### "YouTube Music Desktop App Not Detected"
**Solutions:**
1. Ensure YouTube Music Desktop App is running
2. Enable Companion Server in app settings
3. Check that port 9863 is not blocked by firewall
4. Verify app version is 2.0.0 or later

#### "Authentication Failed"
**Solutions:**
1. Restart YouTube Music Desktop App
2. Clear plugin authentication and re-authenticate
3. Check app permissions in YouTube Music Desktop App
4. Ensure Companion Server is enabled

#### "Real-time Updates Not Working"
**Solutions:**
1. Check Socket.IO connection in plugin logs
2. Verify no other applications are using port 9863
3. Restart the plugin
4. Check firewall settings for WebSocket connections

#### "Keys Not Updating"
**Solutions:**
1. Check plugin logs for errors
2. Verify authentication status
3. Test connection in global configuration
4. Restart FlexDesigner

### Debug Mode

Enable debug logging:
1. Open FlexDesigner Settings → Application → YouTube Music
2. Set Log Level to "Debug"
3. Save settings
4. Check logs in FlexDesigner console

### Log Locations
- **FlexDesigner**: Built-in console and log files
- **Plugin**: Integrated with FlexDesigner logging system
- **YouTube Music Desktop App**: Check app's log files

## 🙏 Acknowledgments

- [YouTube Music Desktop App](https://ytmdesktop.app/) for providing the Companion Server API
- [FlexBar](https://eniacelec.com/pages/software) team for the excellent hardware and SDK
- The open-source community for various dependencies and inspiration

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ENERGYMT/FlexBar-Plugin-YouTubeMusic/issues)
---

**Note**: This plugin requires the YouTube Music Desktop App to be running with the Companion Server enabled. It does not work with the web version of YouTube Music or the mobile app.