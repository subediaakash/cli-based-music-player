#!/usr/bin/env node

import YTMusic from "ytmusic-api";
import { spawn } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import which from "which";
import MPVInstaller from "../scripts/install-mpv.js";

const ytm = new YTMusic();

let mpvProcess = null;

let currentPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let autoPlay = true;
let isTransitioning = false;

async function checkMPVAvailability() {
  try {
    await which('mpv');
    return true;
  } catch (error) {
    return false;
  }
}

async function handleMPVInstallation() {
  const isMPVAvailable = await checkMPVAvailability();
  
  if (!isMPVAvailable) {
    console.log(chalk.red.bold('⚠️  MPV Media Player not found!'));
    console.log(chalk.yellow('MPV is required for audio playback in the terminal music player.\n'));
    
    const { shouldInstall } = await inquirer.prompt({
      type: 'confirm',
      name: 'shouldInstall',
      message: 'Would you like to install MPV automatically now?',
      default: true
    });

    if (shouldInstall) {
      console.log(''); // Empty line for spacing
      const installer = new MPVInstaller();
      const success = await installer.install();
      
      if (!success) {
        console.log(chalk.red('\nMPV installation failed. Please install MPV manually and restart the application.'));
        process.exit(1);
      }
      
      console.log(''); // Empty line for spacing
    } else {
      console.log(chalk.yellow('\nPlease install MPV manually and restart the application.'));
      console.log(chalk.gray('Visit https://mpv.io/installation/ for installation instructions.'));
      process.exit(1);
    }
  }
}

async function initialize() {
  try {
    await ytm.initialize();
    console.log(chalk.green("YTMusic API initialized successfully!"));
  } catch (error) {
    console.error(chalk.red("Error initializing YTMusic API:"), error);
    process.exit(1);
  }
}

async function searchTracks(query) {
  try {
    const results = await ytm.search(query);
    return results
      .filter((result) => result.type === "VIDEO" && result.videoId)
      .map((result) => ({
        id: result.videoId,
        title: result.name,
        artist: result.artist?.name || "Unknown Artist",
        duration: formatDuration(result.duration) || "0:00",
        thumbnail: result.thumbnails?.[0]?.url,
      }));
  } catch (error) {
    console.error(chalk.red("Error searching tracks:"), error);
    return [];
  }
}

function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function cleanup() {
  console.log(chalk.yellow("\nCleaning up..."));

  if (mpvProcess && !mpvProcess.killed) {
    try {
      mpvProcess.kill("SIGTERM");

      setTimeout(() => {
        if (mpvProcess && !mpvProcess.killed) {
          console.log(chalk.red("Force killing MPV process..."));
          mpvProcess.kill("SIGKILL");
        }
      }, 2000);
    } catch (error) {
      console.error(chalk.red("Error stopping MPV:"), error.message);
      try {
        mpvProcess.kill("SIGKILL");
      } catch (killError) {
        console.error(chalk.red("Error force killing MPV:"), killError.message);
      }
    }

    mpvProcess = null;
  }

  isPlaying = false;
  isTransitioning = false;
}

function stopTrack() {
  if (mpvProcess) {
    autoPlay = false;
    cleanup();
  }
}

function playTrack(trackId) {
  if (isTransitioning) {
    console.log(chalk.yellow("Track transition in progress, please wait..."));
    return;
  }

  isTransitioning = true;

  if (mpvProcess) {
    mpvProcess.kill("SIGTERM");
    mpvProcess = null;
  }

  const url = `https://www.youtube.com/watch?v=${trackId}`;
  const currentTrack = currentPlaylist[currentTrackIndex];

  console.log(
    chalk.yellow.bold("\nNow Playing:"),
    chalk.white(`${currentTrack.title} - ${currentTrack.artist}`)
  );
  console.log(chalk.gray(`Duration: ${currentTrack.duration}`));

  mpvProcess = spawn("mpv", [
    "--no-video",
    "--quiet",
    "--no-terminal",
    "--audio-display=no",
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    url,
  ]);

  isPlaying = true;
  autoPlay = true;

  mpvProcess.on("error", (error) => {
    console.error(chalk.red("MPV Error:"), error.message);
    
    if (error.code === 'ENOENT') {
      console.error(chalk.red("MPV not found! It may have been uninstalled or removed from PATH."));
      console.log(chalk.yellow("Please restart the application to reinstall MPV, or install it manually."));
    }
    
    isPlaying = false;
    isTransitioning = false;

    if (autoPlay && currentPlaylist.length > 1) {
      setTimeout(() => {
        playNext();
      }, 1000);
    }
  });

  mpvProcess.on("close", (code) => {
    isPlaying = false;
    isTransitioning = false;

    if (code === 0) {
      console.log(chalk.gray("\nTrack finished playing"));
    } else if (code !== null) {
      console.log(chalk.red(`\nTrack stopped with code: ${code}`));
    }

    if (autoPlay && code === 0 && currentPlaylist.length > 1) {
      setTimeout(() => {
        playNext();
      }, 500);
    }
  });

  setTimeout(() => {
    isTransitioning = false;
  }, 1000);
}

function playNext() {
  if (currentPlaylist.length === 0) {
    console.log(chalk.yellow("Playlist is empty"));
    return;
  }

  if (currentPlaylist.length === 1) {
    console.log(chalk.yellow("Only one track in playlist"));
    return;
  }

  const oldIndex = currentTrackIndex;
  currentTrackIndex++;
  if (currentTrackIndex >= currentPlaylist.length) {
    currentTrackIndex = 0;
  }

  if (currentTrackIndex === oldIndex) {
    console.log(chalk.yellow("Reached end of playlist"));
    return;
  }

  playTrack(currentPlaylist[currentTrackIndex].id);
}

function playPrevious() {
  if (currentPlaylist.length === 0) {
    console.log(chalk.yellow("Playlist is empty"));
    return;
  }

  currentTrackIndex--;
  if (currentTrackIndex < 0) {
    currentTrackIndex = currentPlaylist.length - 1;
  }

  playTrack(currentPlaylist[currentTrackIndex].id);
}

function displayPlaylist() {
  if (currentPlaylist.length === 0) {
    console.log(chalk.yellow("\nPlaylist is empty"));
    return;
  }

  console.log(chalk.blue.bold("\nCurrent Playlist:"));
  currentPlaylist.forEach((track, index) => {
    const prefix =
      index === currentTrackIndex ? chalk.green.bold("▶ ") : chalk.gray("  ");
    console.log(
      `${prefix}${track.title} - ${track.artist} ${chalk.gray(
        `(${track.duration})`
      )}`
    );
  });
}

function nowPlaying() {
  if (!isPlaying || currentPlaylist.length === 0) {
    console.log(chalk.yellow("\nNo track is currently playing"));
    return;
  }

  const track = currentPlaylist[currentTrackIndex];
  console.log(chalk.green.bold("\nNow Playing:"));
  console.log(chalk.white(`Title: ${track.title}`));
  console.log(chalk.white(`Artist: ${track.artist}`));
  console.log(chalk.white(`Duration: ${track.duration}`));
}

async function mainMenu() {
  while (true) {
    const { choice } = await inquirer.prompt({
      type: "list",
      name: "choice",
      message: "Music Player Menu",
      choices: [
        { name: "Search and play music", value: "search" },
        { name: "Show current playlist", value: "show" },
        { name: "Now playing", value: "now" },
        { name: "Play next track", value: "next" },
        { name: "Play previous track", value: "prev" },
        { name: "Stop playback", value: "stop" },
        { name: "Exit", value: "exit" },
      ],
    });

    switch (choice) {
      case "search":
        await searchAndPlay();
        break;
      case "show":
        displayPlaylist();
        break;
      case "now":
        nowPlaying();
        break;
      case "next":
        playNext();
        break;
      case "prev":
        playPrevious();
        break;
      case "stop":
        stopTrack();
        console.log(chalk.yellow("Playback stopped"));
        break;
      case "exit":
        cleanup();
        console.log(chalk.green("Goodbye!"));
        process.exit(0);
    }
  }
}

async function searchAndPlay() {
  const { query } = await inquirer.prompt({
    type: "input",
    name: "query",
    message: "Enter search query:",
  });

  const results = await searchTracks(query);

  if (results.length === 0) {
    console.log(chalk.red("\nNo results found"));
    return;
  }

  const { selectedIndex } = await inquirer.prompt({
    type: "list",
    name: "selectedIndex",
    message: "Select a track to play:",
    choices: [
      ...results.map((track, index) => ({
        name: `${track.title} - ${track.artist} (${track.duration})`,
        value: index,
      })),
      { name: "Cancel", value: -1 },
    ],
  });

  if (selectedIndex === -1) return;

  currentPlaylist = results;
  currentTrackIndex = selectedIndex;
  playTrack(results[selectedIndex].id);
}

function gracefulShutdown(signal) {
  console.log(chalk.yellow(`\nReceived ${signal}, cleaning up...`));
  cleanup();

  setTimeout(() => {
    console.log(chalk.green("Cleanup complete. Goodbye!"));
    process.exit(0);
  }, 1000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

process.on("uncaughtException", (error) => {
  console.error(chalk.red("Uncaught Exception:"), error);
  cleanup();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    chalk.red("Unhandled Rejection at:"),
    promise,
    "reason:",
    reason
  );
  cleanup();
  process.exit(1);
});

process.on("exit", (code) => {
  console.log(chalk.gray(`Process exiting with code: ${code}`));
  cleanup();
});

(async () => {
  await handleMPVInstallation();
  await initialize();
  console.log(chalk.blue.bold("\nCLI Music Player\n"));
  await mainMenu();
})();
