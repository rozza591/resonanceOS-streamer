ResonanceOS Streamer

A high-resolution, web-based audio streamer interface for the Music Player Daemon (MPD).

This project provides a Node.js server and a modern, responsive web interface to control an MPD instance. It's designed to be the frontend for a dedicated "headless" audio streamer device, such as a Raspberry Pi, allowing you to manage your music library, control playback, and manage the system from any web browser on your network.

Core Features

Real-time Playback Control: Play, pause, skip, seek, and manage the playback queue with instant updates via Socket.io.

High-Resolution Info: Displays detailed technical information about the currently playing track, including format, sample rate, and bit depth.

Music Library Browser: Browse your music collection by Artist, Album, and Tracks.

Drag & Drop File Uploader: Easily upload new music files.

Client-side metadata parsing to pre-fill artist and album tags.

Automatic extraction of embedded cover art (saves as cover.jpg in the album's folder).

Online Metadata: Fetches extended album information (release year, description) and high-quality cover art from The AudioDB.

Audio Output Switching: View all available MPD audio outputs (e.g., USB DACs, HDMI) and switch between them.

System Management:

Trigger a rescan of the MPD library.

Reboot the host device.

View system information like OS version, kernel, and CPU load.

Tech Stack

Backend: Node.js, Express

Real-time: Socket.io

MPD Control: mpd2 library

Database: sqlite3 (for storing fetched album metadata)

File Uploads: multer

Frontend: Vanilla HTML5, CSS3, and JavaScript (ESM)

Metadata: music-metadata (for parsing tags), axios (for API calls)

Configuration

The server is configured using environment variables. You can set these in your environment or in a .env file (requires dotenv package).

Variable

Description

Default

PORT

The port for the web server to run on.

3000

MPD_HOST

The hostname or IP of your MPD server.

localhost

MPD_PORT

The port your MPD server is listening on.

6600

MUSIC_DIR

The absolute path to your MPD music directory. Must match MPD config.

/var/lib/mpd/music

DB_PATH

The file path to store the SQLite database.

audiophile.db (in project root)

Installation

Clone this repository:

git clone [https://github.com/rozza591/resonanceos-streamer.git](https://github.com/rozza591/resonanceos-streamer.git)
cd resonanceos-streamer


Install the Node.js dependencies:

npm install


Ensure your MPD server is running and configured correctly. The MUSIC_DIR environment variable must match the music_directory setting in your mpd.conf.

Running the Server

Once installed, you can start the server:

npm start


Or by setting environment variables directly:

PORT=8080 MPD_HOST=192.168.1.100 node server.js


You can then access the web interface by navigating to http://[SERVER_IP]:[PORT] in your web browser.
