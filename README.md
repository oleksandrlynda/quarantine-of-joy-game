# Quarantine of Joy

![Title screenshot](https://github.com/user-attachments/assets/759d695c-c3f8-4088-82f0-63cf7da63673)

An experimental browser shooter built with an in-browser music editor.

## Table of Contents

- [Features](#features)
- [Play Online](#play-online)
- [Concept Art](#concept-art)
- [Editor](#editor)
- [Controls](#controls)
- [Running locally](#running-locally)
- [Project Structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- Built with [Three.js](https://threejs.org/) and vanilla JavaScript
- Seed-based world generation for replayable runs
- In-browser soundtrack editor with localStorage saves

## Play Online

- [Play Now](https://oleksandrlynda.github.io/quarantine-of-joy-game/)
- [Music Player & Editor](https://oleksandrlynda.github.io/quarantine-of-joy-game/music_player.html) – preview tracks, tweak song data, and persist edits via browser localStorage.
- [Level Editor](https://oleksandrlynda.github.io/quarantine-of-joy-game/editor.html) – experiment with block-based maps directly in your browser.

## Concept Art

### Game

![Gameplay screenshot](https://github.com/user-attachments/assets/7d88368b-30a1-4895-a6ac-a528a5f3141c)

### Enemies

#### Rusher (melee)

Fast glass-cannon charger that forces repositioning; pure melee.  
Faction/style: Bureau of Blandness Compliance unit. Monochrome, municipal-minimalist surfaces with clean geometry.

![Rusher concept art](https://github.com/user-attachments/assets/2e1538f8-ae32-4621-849f-acbd77f63e8f)

## Editor

![Music editor screenshot](https://github.com/user-attachments/assets/3301205b-2551-409a-a58a-845291131ceb)

## Controls

- Click to lock the mouse and look around
- **WASD** to move, **Space** to jump
- **Shift** to sprint, **Ctrl** to crouch
- **Left Mouse** to fire your weapon
- On mobile: use the on‑screen joystick to move and buttons to Shoot 🔥, Jump ⤴️, Reload 🔄
- Tap 🏃 to lock or unlock sprint on mobile

## Running locally

Run a simple web server from the project root to play the game or use the music editor locally:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser. The game loads from the root URL and the music editor is available at [http://localhost:8080/music_player.html](http://localhost:8080/music_player.html).

For additional details see [build.md](build.md).

## Project Structure

- `src/` – JavaScript source for game logic, audio, and procedural world building
- `assets/` – textures, models, and other media
- `styles/` – CSS for all pages
- `index.html` – main game entry point
- `editor.html` – experimental block-based level editor
- `music_player.html` – standalone music player and editor

## Development

This is a pure browser project; edit files in `src/` and reload your page to see changes. No build step or package installation is required.

## Contributing

Contributions are welcome! Feel free to fork the repo and open a pull request. For larger changes, please file an issue to discuss the approach.

## License

Released under the [MIT License](LICENSE).

